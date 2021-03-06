# FreeSpeechMe

FreeSpeechMe is a modification to Moxie Marlinspike's tool Convergence, modified to implement the Namecoin .bit specification.  It can resolve .bit domains to IPv4 addresses, and verify .bit TLS certficates via the Namecoin blockchain.  This allows safe usage of self-signed certificates, without trusting any third party.  IP address mappings and TLS fingerprints are stored in the Namecoin blockchain; see the .bit specification for more details.

FreeSpeechMe is a product of Viral Electron Chaos Laboratories (VECLabs).

## End-User Installation

1. Install namecoind and nmcontrol as per their documentation, and ensure that they are both running.  For best results, use the nmcontrol at https://github.com/uVAdN2vUw2aMENSu19cY7ic24Gvp7Fd/nmcontrol until khalahan merges those changes.
2. Install the XPI into Firefox.
3. Restart Firefox when prompted.
4. There will be a Convergence icon in the toolbar.  Click its dropdown menu and choose Options.
5. On the Advanced tab, make sure that "Verify Namecoin (.bit) domains" and "Only verify Namecoin (.bit) domains" are both checked.
6. Click OK.
7. Click the Convergence icon to turn it green.
8. That's it!  You can safely browse .bit websites without relying on third-party DNS, and .bit HTTPS websites will automatically have their certificates verified.

## Website Administrators

Website Administrators should place the SHA-1 fingerprint of their website in the "fingerprint" field of their Namecoin domain.  Note that the newer "tls" field is not yet supported.  The fingerprint may either include or omit colons.  FreeSpeechMe is not aware of SNI (this is a good thing for privacy reasons); the "fingerprint" field should contain the fingerprint of the certificate presented to browsers when the IP address is typed into the browser.  (The "Common Name" of the certificate does not need to match the domain; only the fingerprint is checked.)  To debug websites which generate a "Convergence Certificate Verification Failure", you can click "View Details" in the yellow bar that appears on the top of the page, and then click "View"; Convergence will show you the certificate it received from the server.  Consult the .bit specification for more information on how to embed TLS fingerprints in the Namecoin blockchain.  An example configuration is at "d/namecoin-tls-test-3".

## Known Bugs

1. In extremely rare cases, some .bit websites might not load; this is because nmcontrol doesn't yet support the entire .bit specification.  (Placing bounties might improve this situation.)  However, almost all major .bit websites should now be supported if using the nmcontrol linked above.

## Donate

If you like FreeSpeechMe and want to show your support, you can donate at the following addresses:

* Bitcoin: 1JfNztz7GfcxPFXQTnxjco6HA53fg491FV
* Namecoin: N4hnrzpQAiwwYXjvMVfqeoenUsvjZNRifV

## Thanks to:

* Moxie Marlinspike for Convergence.
* phelix and the Namecoin Marketing and Development Fund for supporting the project bounty.
* itsnotlupus for adding TLS to the .bit spec.
* khal for nmcontrol.
* khal and vinced for namecoind.
* Anyone else I forgot.
