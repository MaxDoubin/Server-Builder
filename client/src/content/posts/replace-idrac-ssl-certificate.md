
## The problem

Someone running a Dell PowerEdge server wants the iDRAC web interface to present a certificate that their own certificate authority (CA) signed, so browsers stop warning and the name matches. Replacing the certificate takes several steps, and the firmware caveats are easy to miss. For the basics of what a certificate contains, see [SSL/TLS certificates explained](/blog/ssl-tls-certificates-explained).

## Your iDRAC generation and firmware decide the upload path

Dell's KB article on [generating and installing an SSL certificate with an FQDN and a CA](https://www.dell.com/support/kbdoc/en-an/000216023/how-to-generate-the-self-signed-cert-n-upload-to-idrac) notes that not all product versions are listed. Before you choose commands, write down your server model and iDRAC firmware version. If you are not sure which iDRAC generation you have, the [iDRAC default password guide](/blog/idrac-default-password) covers every generation.

iDRAC7 follows different rules. [Broadcom's KB on SHA2 certificates](https://knowledge.broadcom.com/external/article/168891/how-to-use-sha2-ssl-certificate-signing.html) applies to the Dell PowerEdge R620 and R720, says the iDRAC "must be running at least firmware version 2.21.21.21," and states that "iDRAC7 accepts only X509, Base 64 encoded Web server certificates." If your server is an R620 or R720, convert the signed certificate to Base 64 (PEM) before you upload it.

| Item | iDRAC7 (R620, R720) | iDRAC9 |
|---|---|---|
| Firmware boundary | At least 2.21.21.21 ([Broadcom](https://knowledge.broadcom.com/external/article/168891/how-to-use-sha2-ssl-certificate-signing.html)) | Reverts at 6.10.80.00 or newer, web outage after 7.00.00.00 but before 7.10.30.00 ([Dell](https://dell.com/support/kbdoc/en-uk/000215749/custom-ssl-certificate-deleted-after-idrac9-firmware-update), [Dell](https://www.dell.com/support/kbdoc/en-lc/000220891/idrac9-web-server-unavailable-after-firmware-update)) |
| Certificate format | X509 Base 64 only | Not specified by Dell |

## Generate the key and CSR with the FQDN in the CN and SAN

Dell's guide says to register the iDRAC address in DNS, then to "Use the Fully Qualified Domain Name (FQDN) created at DNS to enter at Common Name (CN) fields." A certificate signing request (CSR) is "a message sent from an applicant to a certificate authority," and it "usually contains the public key for which the certificate should be issued," according to [Wikipedia](https://en.wikipedia.org/wiki/Certificate_signing_request).

<figure>
<img src="/images/blog/replace-idrac-ssl-certificate/photo-1.jpg" alt="Screenshot of the OpenSSL manual page displayed on Debian GNU/Linux" width="1400" height="820" loading="lazy" decoding="async">
<figcaption>The OpenSSL manual page on Debian GNU/Linux, in a 2017 screenshot. The openssl req command that creates the key and CSR is documented in OpenSSL's manual pages. Photo: Cybermaid, <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Captura_de_pagina_de_manual_de_OpenSSL.png">Wikimedia Commons</a>.</figcaption>
</figure>

The Common Name alone is no longer enough. [RFC 2818](https://www.rfc-editor.org/rfc/rfc2818) calls Common Name matching "deprecated," and [RFC 9525](https://www.rfc-editor.org/rfc/rfc9525) says the server identity "can only be expressed in the subjectAltNames extension." Chrome 58 stopped using the Subject field for hostnames, as [a 2017 post on the change](https://textslashplain.com/2017/03/10/chrome-deprecates-subject-cn-matching/) explains. Put the same FQDN in the CN and in a DNS subjectAltName. OpenSSL can set both in one command:

```
openssl req -newkey rsa:2048 -sha256 -noenc \
  -keyout idrac.key -out idrac.csr \
  -subj "/CN=idrac01.lab.example" \
  -addext "subjectAltName = DNS:idrac01.lab.example"
```

Replace `idrac01.lab.example` with the name you use to open the iDRAC. The 2048-bit key and SHA-256 signature follow [Broadcom's example](https://knowledge.broadcom.com/external/article/168891/how-to-use-sha2-ssl-certificate-signing.html), which generates a 2048-bit, sha256 private key and CSR. If the OpenSSL configuration has no default_bits setting, [OpenSSL's documentation](https://docs.openssl.org/master/man1/openssl-req/) uses 2048 bits, the same size as the command above. The `-addext` value uses the same key=value form that a configuration file uses, as the same documentation describes.

On passphrases, [Dell's KB 000120158](https://www.dell.com/support/kbdoc/en-us/000120158/dell-poweredge-how-to-import-an-externally-created-custom-certificate-and-private-key-into-the-idrac) says the key "must include a passphrase for the private key that is being created," while [Broadcom](https://knowledge.broadcom.com/external/article/168891/how-to-use-sha2-ssl-certificate-signing.html) says "private keys with pass phrases are not supported by iDrac." Dell's own example runs `openssl` with `-nodes`. OpenSSL has deprecated `-nodes` since OpenSSL 3.0 in favor of `-noenc`, and with `-noenc` a newly created private key is not encrypted. Use an unencrypted key, as Dell's example does.

Dell's KB 000216023 puts the FQDN in the CN and then tells you to browse to the iDRAC by that same name, so the CN has to be the name you type into the browser. Dell's KB 000120158 also calls wildcard certificates "not best practice," so give each iDRAC its own name. The signed certificate has to carry that name in its subjectAltName for browsers to accept it. If you run your own CA, read [running an internal CA](/blog/internal-pki-private-ca) before you sign anything.

## Upload the key and certificate with racadm

Upload the key first, then the certificate. [Dell's example](https://www.dell.com/support/kbdoc/en-us/000120158/dell-poweredge-how-to-import-an-externally-created-custom-certificate-and-private-key-into-the-idrac) runs the upload with the interactive option, `racadm -r 10.14.177.107 -i sslkeyupload -t 1 -f C:\idrac_web.key`, and Broadcom's example runs the same two uploads with `-t 1` and no `-i`. Keep the `-t 1` values from these examples, and check the RACADM reference for your firmware before you change them.

```
racadm -r idrac01.lab.example -u root -p <password> sslkeyupload -t 1 -f idrac.key
racadm -r idrac01.lab.example -u root -p <password> sslcertupload -t 1 -f idrac.cer
racadm -r idrac01.lab.example -u root -p <password> racreset
```

The last command restarts the iDRAC, as in Broadcom's example. Dell's guide says to check the certificate "After the web interface has come back," so wait for the web interface to return before you test. A [third-party blog post](https://www.itechlounge.net/?p=2044) reports a "Security Alert" from racadm output for a certificate it describes as "valid and signed," and the author says it "still worked as expected." Treat that alert as a client trust question, not as a failed upload. Keep SSH access to the iDRAC ready before you reset, because the recovery steps for a web outage run over SSH.

If the upload fails, Dell's KB lists the error as "RAC0622: An invalid certificate file is uploaded," and says to make sure the CA certificate and key are correct before you retry.

## Firmware updates can revert a custom certificate

Dell's KB states that "Custom SSL certificates may be deleted after iDRAC9 firmware update to version 6.10.80.00 or higher." For affected systems, Dell says "they must reupload their Custom Certificate." Check the certificate after every iDRAC9 update, not only the first one.

Before upgrading iDRAC9 from firmware older than 6.10.80.00 to a version below 7.00.60.00, Dell's workaround toggles the USB NIC with these commands:

```
racadm set idrac.os-bmc.adminstate 0
racadm set idrac.os-bmc.adminstate 1
racadm set idrac.os-bmc.adminstate 0
```

For scripted replacement, the PowerShell Gallery module [Invoke-ReplaceCertificateREDFISH](https://powershellgallery.com/packages/Invoke-ReplaceCertificateREDFISH/5.0.0/Content/Invoke-ReplaceCertificateREDFISH.psm1) uses the Redfish API to list current certificates and to replace one by ID with a signed file. After a replacement, the module prints "Reset iDRAC to apply the pending new certificate." One warning covers both an iDRAC version that does not support the Redfish feature and "incorrect iDRAC user credentials passed in," so check the credentials before you blame the firmware.

## Confirm the new certificate and key size after a reset

The reset is what makes the iDRAC serve the new certificate, so check the result instead of trusting the upload message. Owners report that sslresetcfg can give the wrong key size. In a [Dell community thread](https://www.dell.com/community/Systems-Management-General/Drac-7-generate-new-self-signed-certificate/td-p/4514118) from September 15, 2014, one owner reported that "sslresetcfg sets the cert back to 1024...", when the goal was a 2048-bit certificate.

Check the key size on the certificate you uploaded:

```
openssl x509 -in idrac.cer -noout -text | grep "Public-Key"
```

The output should show the 2048-bit key from the CSR step. Then open the iDRAC by its FQDN, as [Dell's KB 000216023](https://www.dell.com/support/kbdoc/en-an/000216023/how-to-generate-the-self-signed-cert-n-upload-to-idrac) describes, and confirm that the browser shows your CA as the issuer and your name in the subject alternative names. If the key shows 1024 bits, generate a new key and CSR, and upload again.

## What breaks

- **Upload fails with RAC0622, "An invalid certificate file is uploaded."** The certificate may not match the key, or the file may not be Base 64 X509, which is the only format iDRAC7 accepts. Fix: validate the certificate and key with OpenSSL, convert the certificate to Base 64 (PEM), and upload the key before the certificate.

- **The uploaded key still has a passphrase.** Broadcom says iDRAC does not support passphrase-protected keys, so the key must be unencrypted before you upload it. Fix: run `openssl rsa -in idrac.key -out idrac.key`, which removes the passphrase, and upload the key again.

- **Browsers reject the name even though the upload worked.** A certificate with the FQDN only in the CN fails in Chrome, which shows NET::ERR_CERT_COMMON_NAME_INVALID. Fix: reissue the certificate with the FQDN as a DNS subjectAltName, using the OpenSSL command from the CSR step.

- **The web interface stops answering on iDRAC9 firmware after 7.00.00.00 but before 7.10.30.00.** Dell says the problem occurs "after 7.00.00.00 but before 7.10.30.00." The cause is a certificate file without a trailing line feed. At reboot, iDRAC checks for DHPARAMs and appends them if they are missing, and that append corrupts the certificate format. Fix: SSH to the iDRAC, run `racadm sslresetcfg`, check the end of the file with `hexdump -C idrac_cert.pem | tail -n 5`, add the missing line feed, and upload again. Dell describes the permanent fix as part of the upcoming 7.10.30.00 release, so check the current release notes before you plan around it.

- **The custom certificate comes back as self-signed.** Dell's KB says the iDRAC Web Server certificate "is reset to self-signed after firmware update of 6.10.80.00 or newer." Fix: re-upload the custom certificate, and toggle the USB NIC before any upgrade from an older release, as shown above.

- **Clients keep warning about a valid certificate.** A client that does not hold your CA's root certificate cannot build a trusted chain to it, even when the iDRAC certificate itself is valid. Fix: install the CA's root certificate on each machine that opens the iDRAC.

## What this means

The working sequence is to put the iDRAC FQDN in both the CN and a DNS subjectAltName, generate an unencrypted 2048-bit key, convert the signed certificate to Base 64 for iDRAC7, upload the key and then the certificate, run racreset, and check the key size and name afterward. Dell's KBs name two firmware boundaries to watch: 6.10.80.00, where custom certificates can revert, and the range after 7.00.00.00 but before 7.10.30.00, where a certificate without a trailing line feed can take the web interface offline. Dell calls wildcard certificates "not best practice," so give each iDRAC its own name. If you manage several servers, the Redfish module above can script the same replacement on each of them.

<figure>
<img src="/images/blog/replace-idrac-ssl-certificate/photo-2.jpg" alt="Firefox warning page reporting an insecure connection to the CAcert website" width="1400" height="857" loading="lazy" decoding="async">
<figcaption>Firefox warning about an insecure connection to the CAcert website in 2016, shown because the browser does not trust the CAcert certificate authority. An iDRAC certificate signed by an internal CA draws the same kind of warning on any client that lacks that CA's root certificate. Photo: Zozo.ubermensch, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Firefox_-_Insecure_connection_on_CACert.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

## References

- https://www.dell.com/support/kbdoc/en-an/000216023/how-to-generate-the-self-signed-cert-n-upload-to-idrac
- https://www.dell.com/support/kbdoc/en-us/000120158/dell-poweredge-how-to-import-an-externally-created-custom-certificate-and-private-key-into-the-idrac
- https://dell.com/support/kbdoc/en-uk/000215749/custom-ssl-certificate-deleted-after-idrac9-firmware-update
- https://www.dell.com/support/kbdoc/en-lc/000220891/idrac9-web-server-unavailable-after-firmware-update
- https://www.dell.com/community/Systems-Management-General/Drac-7-generate-new-self-signed-certificate/td-p/4514118
- https://knowledge.broadcom.com/external/article/168891/how-to-use-sha2-ssl-certificate-signing.html
- https://www.itechlounge.net/?p=2044
- https://docs.openssl.org/master/man1/openssl-req/
- https://en.wikipedia.org/wiki/Certificate_signing_request
- https://www.rfc-editor.org/rfc/rfc2818
- https://www.rfc-editor.org/rfc/rfc9525
- https://textslashplain.com/2017/03/10/chrome-deprecates-subject-cn-matching/
- https://powershellgallery.com/packages/Invoke-ReplaceCertificateREDFISH/5.0.0/Content/Invoke-ReplaceCertificateREDFISH.psm1
