#!/bin/bash
set -e
cd "$(dirname "$0")"
rm -rf work && mkdir -p work/newcerts && cd work
touch index.txt
cat > ca.cnf <<'CNF'
[ca]
default_ca = CA_default
[CA_default]
dir = .
database = ./index.txt
new_certs_dir = ./newcerts
serial = ./serial
default_md = sha256
policy = policy_any
unique_subject = no
copy_extensions = none
email_in_dn = yes
[policy_any]
commonName = optional
CNF
cat > ext.cnf <<'CNF'
[v3_root]
basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
[v3_int]
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage = critical,digitalSignature,keyCertSign,cRLSign
extendedKeyUsage = serverAuth,clientAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
crlDistributionPoints = URI:http://crl.example.net/r1.crl
authorityInfoAccess = caIssuers;URI:http://pki.example.net/r1.cer
certificatePolicies = 2.23.140.1.2.1
[v3_leaf]
subjectAltName = DNS:www.example.com,DNS:example.com,DNS:*.static.example.com,IP:192.0.2.10,IP:2001:db8::10
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = serverAuth,clientAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
crlDistributionPoints = URI:http://crl.example.net/e1.crl
authorityInfoAccess = OCSP;URI:http://ocsp.example.net,caIssuers;URI:http://pki.example.net/e1.cer
certificatePolicies = @leafpol
[leafpol]
policyIdentifier = 2.23.140.1.2.1
CPS.1 = "https://pki.example.net/cps"
[v3_san]
subjectAltName = DNS:pss.example.org
[v3_kitchen]
subjectAltName = email:jane@example.org,URI:https://example.org/jane,dirName:dir_sect,RID:1.2.3.4,otherName:1.3.6.1.4.1.311.20.2.3;UTF8:jdoe@example.org
basicConstraints = critical,CA:TRUE,pathlen:2
keyUsage = critical,digitalSignature,nonRepudiation,keyEncipherment,dataEncipherment,keyAgreement,keyCertSign,cRLSign,encipherOnly
nameConstraints = critical,permitted;DNS:example.org,permitted;IP:10.0.0.0/255.0.0.0,permitted;IP:2001:db8::/ffff:ffff::,excluded;DNS:bad.example.org
policyConstraints = critical,requireExplicitPolicy:0,inhibitPolicyMapping:1
inhibitAnyPolicy = critical,3
tlsfeature = status_request
1.3.6.1.5.5.7.48.1.5 = ASN1:NULL
1.3.6.1.4.1.11129.2.4.2 = DER:SCTHEX
1.2.3.4.5.6.7 = critical,ASN1:NULL
crlDistributionPoints = crldp1
certificatePolicies = ia5org,@pol1
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer:always
extendedKeyUsage = 1.3.6.1.4.1.311.20.2.2,codeSigning,1.9.9.9
[dir_sect]
CN = Jane Doe
O = Example
[crldp1]
fullname = URI:http://crl.example.org/k.crl
reasons = keyCompromise, CACompromise
CRLissuer = dirName:crlissuer_sect
[crlissuer_sect]
CN = CRL Issuer
[pol1]
policyIdentifier = 2.5.29.32.0
CPS.1 = "https://example.org/cps"
userNotice.1 = @notice
[notice]
explicitText = "Test notice text"
organization = "Example Org"
noticeNumbers = 1, 2
CNF
# SCT list per RFC 6962 3.3: one v1 SCT, log id 00..1f, ts 1767225600123, no extensions, sha256/ecdsa, 8 byte sig
SCT="00$(printf '%02x' $(seq 0 31) | tr -d '\n')0000019b7685dc7b0000040300083006020101020102"
SCTLEN=$(( ${#SCT} / 2 ))
LST=$(printf '%04x' $SCTLEN)$SCT
LSTLEN=$(( ${#LST} / 2 ))
TLS=$(printf '%04x' $LSTLEN)$LST
TLSLEN=$(( ${#TLS} / 2 ))
SCTDER=04$(printf '%02x' $TLSLEN)$TLS
sed -i "s/SCTHEX/$SCTDER/" ext.cnf
echo "$SCTDER" > sct.hex

issue() { # serial name key csrsubj start end ext md signerkey signercert [extra...]
  local serial=$1 out=$2 key=$3 subj=$4 start=$5 end=$6 ext=$7 md=$8 skey=$9 scert=${10}; shift 10
  echo "$serial" > serial
  openssl req -new -key "$key" -subj "$subj" -multivalue-rdn -out "$out.csr" 2>/dev/null
  if [ "$scert" = "self" ]; then
    openssl ca -batch -config ca.cnf -selfsign -keyfile "$skey" -in "$out.csr" -startdate "$start" -enddate "$end" ${ext:+-extfile ext.cnf -extensions $ext} -md "$md" -notext -preserveDN -out "$out.pem" "$@" 2>/dev/null
  else
    openssl ca -batch -config ca.cnf -cert "$scert" -keyfile "$skey" -in "$out.csr" -startdate "$start" -enddate "$end" ${ext:+-extfile ext.cnf -extensions $ext} -md "$md" -notext -preserveDN -out "$out.pem" "$@" 2>/dev/null
  fi
}
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-384 -out root.key 2>/dev/null
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out int.key 2>/dev/null
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out leaf.key 2>/dev/null
issue 1F2E3D4C5B6A79880011223344556677 root root.key "/C=US/O=Example PKI/CN=Example Root CA R1" 20260101000000Z 20460101000000Z v3_root sha384 root.key self
issue 6B8C1A2F9D3E4C5B7A6F int int.key "/C=US/O=Example PKI/CN=Example Issuing CA E1" 20260101000000Z 20360101000000Z v3_int sha384 root.key root.pem
issue 03A1B2C3D4E5F60718293A4B5C6D7E8F leaf leaf.key "/CN=www.example.com" 20261001000000Z 20271101000000Z v3_leaf sha256 int.key int.pem
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:1024 -out legacy.key 2>/dev/null
issue E3 legacy legacy.key "/C=US/ST=Nevada/L=Las Vegas/O=Example Legacy Systems/CN=legacy.example.com" 140301000000Z 160301000000Z "" sha1 legacy.key self
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out pss.key 2>/dev/null
issue 1092 pss pss.key "/CN=pss.example.org" 20260101000000Z 20270101000000Z v3_san sha256 pss.key self -sigopt rsa_padding_mode:pss -sigopt rsa_pss_saltlen:32
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -pkeyopt rsa_keygen_pubexp:3 -out r3.key 2>/dev/null
issue 4D r3 r3.key "/CN=rsa3072.example.org" 20260101000000Z 20260601000000Z "" sha384 r3.key self
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-521 -out p521.key 2>/dev/null
issue 0209 p521 p521.key "/CN=p521.example.org" 20260101000000Z 20491231235959Z "" sha512 p521.key self
issue 020A p521b p521.key "/CN=p521.example.org" 20260101000000Z 20500101000000Z "" sha512 p521.key self
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out k.key 2>/dev/null
issue 7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF kitchen k.key '/DC=org/DC=example/OU=R&D+UID=jdoe/CN=Doe, Jane \+1 <test>/emailAddress=jane@example.org' 20260101000000Z 20280101000000Z v3_kitchen sha256 k.key self
openssl genpkey -algorithm ED25519 -out ed.key 2>/dev/null
openssl req -x509 -new -key ed.key -subj "/CN=ed25519.example.org" -days 1000 -out ed25519.pem 2>/dev/null
cat leaf.pem int.pem root.pem > chain.pem
openssl crl2pkcs7 -nocrl -certfile chain.pem -outform DER -out chain.p7b
openssl x509 -in leaf.pem -outform DER -out leaf.der

# CSRs
openssl req -new -key leaf.key -subj "/C=US/O=Example Org/CN=www.example.com" -addext "subjectAltName=DNS:www.example.com,DNS:example.com" -addext "keyUsage=critical,digitalSignature" -addext "extendedKeyUsage=serverAuth" -out csr-good.pem
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:1024 -out weak.key 2>/dev/null
cat > weak.cnf <<'CNF'
[req]
prompt = no
distinguished_name = dn
attributes = attrs
req_extensions = ext
[dn]
CN = portal.example.com
[attrs]
challengePassword = hunter2
[ext]
subjectAltName = DNS:*.example.com,DNS:intranet
CNF
openssl req -new -key weak.key -config weak.cnf -sha1 -out csr-weak.pem
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out cn.key 2>/dev/null
openssl req -new -key cn.key -subj "/C=US/ST=Nevada/L=Las Vegas/O=Example Org/CN=mail.example.com" -out csr-cnonly.pem
openssl req -new -key ed.key -subj "/CN=ed.example.org" -addext "subjectAltName=DNS:ed.example.org" -out csr-ed25519.pem
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-384 -out w.key 2>/dev/null
openssl req -new -key w.key -subj "/CN=*.example.com" -addext "subjectAltName=DNS:*.example.com,DNS:w*.example.net,DNS:a.*.example.org,DNS:*.com,IP:10.1.2.3" -out csr-wild.pem
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2047 -out odd.key 2>/dev/null
openssl req -new -key odd.key -subj "/CN=odd.example.org" -addext "subjectAltName=DNS:odd.example.org" -out csr-odd.pem
openssl req -new -key pss.key -subj "/CN=pss.example.org" -addext "subjectAltName=DNS:pss.example.org" -sigopt rsa_padding_mode:pss -sigopt rsa_pss_saltlen:32 -sha256 -out csr-pss.pem
cp *.pem *.p7b *.der sct.hex ..
echo done
