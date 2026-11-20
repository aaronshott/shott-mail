# B1-QA-001: TLS-bestanden en privilegevolgorde

De statische conclusie "postfix-gebruiker kan key niet lezen, dus STARTTLS kan niet starten"
is voor de normale Postfix master/smtpd-route niet geldig. De normale onprivileged
smtpd-worker laadt het TLS-context vóór privilegeverlaging. Onleesbaarheid ná setuid
bewijst geen mislukte initialisatie. Daarom zijn geen rechten verruimd en geen extra
kopieën van de sleutel gemaakt. Appsecrets blijven owner-only, mounts/UID-instellingen
zijn niet aangepast.

Primaire bronnen, gelezen voor deze correctie:

- https://www.postfix.org/TLS_README.html, Server-side certificate and private key
  configuration: een private-keyfile hoort root-owned en niet leesbaar voor andere
  gebruikers te zijn; alleen de losse certificatefile mag world-readable zijn.
- Debian bronversie **3.7.11-0+deb12u1** (niet afgeleid als daadwerkelijk gebouwde
  containerversie):
  https://sources.debian.org/src/postfix/3.7.11-0%2Bdeb12u1/
  - src/smtpd/smtpd.c:6251 pre_jail_init; 6423–6448 TLS_SERVER_INIT met cert/key;
    6780–6789 single_server_main registreert pre_jail_init als PRE_INIT callback.
  - src/master/single_server.c:757 roept pre_init aan; 764 pas chroot_uid.
  - src/util/chroot_uid.c:75–79 verlaagt uid via setuid.
  - src/tls/tls_server.c:659 e.v. roept tls_set_my_certificate_key_info aan.
  - src/tls/tls_certkey.c:556 en 562 laden certificate chain/private key via OpenSSL
    direct in het SSL_CTX. Het gaat dus niet alleen om uitgestelde padopslag.

Onze fixture start de master onder container-root; smtpd staat in master.cf op de
normale unprivileged workerinstelling. De pre-jail-init moet nog rootrechten hebben.
Dit is broncontrole, geen uitgevoerd containerbewijs. De bindmountbestanden worden
door LOCAL_UID/GID aangemaakt; normale container-root kan die met de standaard
fixturecapabilities lezen. Rootless/usernamespace/NFS/ACL-varianten zijn niet bewezen.
De app zelf houdt de geconfigureerde LOCAL_UID/GID; de beheerder moet zoals in README
een niet-root hostgebruiker gebruiken. De correctie verandert dat contract niet.

Lokale metadata in Development: secrets 0700, mail.crt en mail.key 0600, eigenaar
0:0 wegens lokale testsetup onder de bestaande hostgebruiker. `test -r` voor de
sleutel slaagde onder diezelfde gebruiker. Geen sleutelinhoud gelogd, geen uid/gid
of privileges gewijzigd. Dit bootst nadrukkelijk niet LOCAL_UID=1000 of een draaiende
postfix-worker na; er was lokaal geen Postfix/Docker om dat te meten.

## Verplichte bevestiging op de reeds geautoriseerde eigen testhost

Geen Docker installeren op Hermes. Start de fixture volgens README en leg vast:

    docker compose exec mail postconf -h mail_version
    docker compose exec mail sh -c 'id; stat -c "%a %u:%g %n" /run/test-secrets /run/test-secrets/mail.crt /run/test-secrets/mail.key'
    docker compose exec mail sh -c 'test -r /run/test-secrets/mail.key && printf "master-context key readable\n"'
    docker compose exec --user postfix mail sh -c 'id; if test -r /run/test-secrets/mail.key; then printf "worker can read key\n"; else printf "worker cannot reread key (expected with owner-only files)\n"; fi'
    docker compose exec -T mail openssl s_client -starttls smtp -connect 127.0.0.1:1587 -servername mail -CAfile /run/test-secrets/mail.crt -verify_return_error -brief </dev/null
    docker compose exec mail python3 /fixture/health.py

Sla alleen metadata/TLS-resultaat op, geen secretinhoud. Succes van de worker-`test -r`
is geen vereiste: controleer echte STARTTLS plus root/pre-init-leesbaarheid. Als
pre-init niet kan lezen, onderzoek de daadwerkelijke UID/capabilities/mount/ACL en
pakketversie vóór een wijziging. Maak nooit de hele secretsdirectory of appkey/login
world-readable. Een eventuele stagingfix mag uitsluitend fixturecert/key betreffen
met minimale root/postfixrechten, na concrete diagnose.

Status: statische oorzaakhypothese weerlegd voor de gecontroleerde standaardbronroute;
Dockerbuild, TLS-runtime, mail-health en volledige aflevering blijven onbewezen.
