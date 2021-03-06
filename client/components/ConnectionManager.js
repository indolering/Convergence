// Copyright (c) 2011 Moxie Marlinspike <moxie@thoughtcrime.org>
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License as
// published by the Free Software Foundation; either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA 02111-1307
// USA


/**
  * This class manages the active connections in the Convergence system.
  *
  * The pattern is this:
  *
  * 1) We can't have non-blocking I/O with NSS, so for every outbound SSL
  * connection, we spin up a ChromeWorker (ConnectionWorker.js) that does
  * the blocking work of establishing an SSL link to the destination server,
  * to the notaries if necessary, and to the local browser.  If the connection
  * is successful (ie: no network errors and the certificates check out),
  * this ChromeWorker should return with two sockets -- one established SSL
  * socket to the local browser, and one established SSL socket to the
  * destination server.
  *
  * 2) There is another ChromeWorker (ShuffleWorker.js) which runs all the
  * time.  Once an SSL MITM channel is setup, the pair of sockets is handed
  * to the shuffle worker, which simply poll()'s on the entire set of sockets
  * to shuffle, and moves data back and forth across it.  Additionally, the
  * ShuffleWorker is poll()ing on the ListenSocket, to accept outbound connection
  * initiations.
  *
  * So new connections are accept()ed in ShuffleWorker, passed off to the
  * ConnectionWorker for connection setup, and then moved back to the
  * ShuffleWorker for shuffling data across the MITM gap.  This class,
  * ConnectionManager, has to broker all of these transitions, since there
  * appear to be major problems with passing messages between ChromeWorkers
  * directly.
  *
  *
  **/

const TYPE_INITIALIZE = 1;
const TYPE_CONNECTION = 2;

function ConnectionManager(
  listenSocket, nssFile, sslFile, nsprFile, sqliteFile,
  cacheFile, certificateManager, settingsManager)
{
  this.certificateManager = certificateManager;
  this.settingsManager = settingsManager;
  this.nsprFile = nsprFile;
  this.nssFile = nssFile;
  this.sslFile = sslFile;
  this.sqliteFile = sqliteFile;
  this.cacheFile = cacheFile;
  this.listenSocket = listenSocket;
  this.proxyInfo = null;
  this.buffer = new NSPR.lib.buffer(5);

  this.workerFactory = this.initializeWorkerFactory();
  this.shuffleWorker = this.initializeShuffleWorker();
}

ConnectionManager.prototype.shutdown = function() {
  NSPR.lib.PR_Write(this.wakeupWrite, this.buffer, 5);
  this.shuffleWorker.terminate();
};

ConnectionManager.prototype.setProxyTunnel = function(proxyInfo) {
  if (proxyInfo == null) {
    this.proxyInfo = null;
    return;
  }

  this.proxyInfo = {
    'host' : proxyInfo.host,
    'port' : proxyInfo.port,
    'type' : proxyInfo.type };
};

ConnectionManager.prototype.initializeWorkerFactory = function() {
  try {
    return Components.classes['@mozilla.org/threads/workerfactory;1']
    .createInstance(Components.interfaces.nsIWorkerFactory);
  } catch (e) {
    CV9BLog.worker('Unable to initialize workerfactory, assuming Gecko 8.');
    return null;
  }
};

ConnectionManager.prototype.spawnConnection = function(clientSocket) {
  CV9BLog.worker('Spawning connectionworker...');

  var worker;

  if (this.workerFactory != null) {
    worker = this.workerFactory.newChromeWorker('chrome://convergence/content/workers/ConnectionWorker.js');
  } else {
    worker = new ChromeWorker('chrome://convergence/content/workers/ConnectionWorker.js');
  }

  var connectionManager = this;
  worker.onmessage = function(event) {

    if(event.data.namecoinError) {

    var nmcError = "Namecoin Resolution Error: " + event.data.namecoinError;

    dump(nmcError + "\n");

    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                   .getService(Components.interfaces.nsIWindowMediator);
    var mainWindow = wm.getMostRecentWindow("navigator:browser");

    mainWindow.setTimeout( function() {
    
      var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                   .getService(Components.interfaces.nsIWindowMediator);
      var mainWindow = wm.getMostRecentWindow("navigator:browser");

      mainWindow.gBrowser.getNotificationBox().appendNotification(nmcError, 'convergence-resolution-error',
                            'chrome://global/skin/icons/warning-16.png',
                            mainWindow.gBrowser.getNotificationBox().PRIORITY_WARNING_MEDIUM, []);

    }, 1000);

    dump("Notification pending in 1 second\n");
    
    }
    else
    {

    connectionManager.shuffleWorker.postMessage({
      'type' : TYPE_CONNECTION,
      'client' : event.data.clientFd,
      'server' : event.data.serverFd});

    NSPR.lib.PR_Write(connectionManager.wakeupWrite, connectionManager.buffer, 5);

    }
  };

  var self = this;
  this.settingsManager.getSerializedNotaryList(function(nl) {
    worker.postMessage({
      'logging' : CV9BLog.print_all,
      'nsprFile' : self.nsprFile.path,
      'nssFile' : self.nssFile.path,
      'sslFile' : self.sslFile.path,
      'sqliteFile' : self.sqliteFile.path,
      'cacheFile' : self.cacheFile.path,
      'notaries' : nl,
      'clientSocket' : clientSocket,
      'settings' : self.settingsManager.getSerializedSettings(),
      'proxy' : self.proxyInfo,
      'certificates' : self.certificateManager.serialize()});
  });

  CV9BLog.worker('Posted message to ConnectionWorker');
};

ConnectionManager.prototype.initializeShuffleWorker = function() {
  CV9BLog.worker('Initializing shuffleworker...');
  var socketPair = NSPR.types.PRFileDescPtrArray(2);
  var status = NSPR.lib.PR_NewTCPSocketPair(socketPair);

  if (status == -1) throw 'Error constructing pipe!';

  this.wakeupRead = socketPair[0];
  this.wakeupWrite = socketPair[1];

  var connectionManager = this;
  var shuffleWorker;

  if (this.workerFactory != null) {
    shuffleWorker = this.workerFactory
      .newChromeWorker('chrome://convergence/content/workers/ShuffleWorker.js');
  } else {
    shuffleWorker = new ChromeWorker('chrome://convergence/content/workers/ShuffleWorker.js');
  }

  shuffleWorker.onmessage = function(event) {
    CV9BLog.worker('ShuffleWorker accepted connection: ' + event.data.clientSocket);
    connectionManager.spawnConnection(event.data.clientSocket);
  };

  CV9BLog.worker('Posting...');

  try {
    shuffleWorker.postMessage({
      'type' : TYPE_INITIALIZE,
      'logging' : CV9BLog.print_all,
      'fd' : Serialization.serializePointer(this.wakeupRead),
      'listenSocket' : this.listenSocket.serialize(),
      'nssFile' : this.nssFile.path,
      'sslFile' : this.sslFile.path,
      'nsprFile' : this.nsprFile.path });
  } catch (e) {
    CV9BLog.worker('Posting error: ' + e + ' , ' + e.stack);
  }
  return shuffleWorker;
};
