# Shott Mail — multi-user mailclient

Echte TypeScript/Fastify/SQLite-backend en Svelte-interface; geen RAM-demo.
Dit is nog GEEN geaccepteerde B1 of productieversie. Lokale build, tests en
browserinteracties zijn uitgevoerd. De positieve IMAP→lezen→SMTP→IMAP-keten
tegen de hieronder meegeleverde Dovecot/Postfix-fixture en alle Dockercriteria
zijn nog ONGETEST. De Hermes-host heeft geen Docker; installeer dat daar niet.
Gebruik voor ontwikkeling en QA alleen synthetische accounts. De publieke modus
is geïmplementeerd maar niet tegen externe providers of op Portainer beproefd.

## Wat werkt en wat nog niet bewezen is

Individuele logins (Argon2id), server-side sessies, CSRF/origincontrole,
versleutelde accountcredentials, IMAP/SMTP-configuratie, gecombineerde en losse
inboxroutes, veilige MIME/HTML-verwerking, composer, lokale concepten en een
persistente SMTP-verzendjournal zijn geïmplementeerd. Desktop en mobiel hebben
een echte interface. In de browser zijn opslaan, expliciete afzenderkeuze en
invoerbehoud bij een backend-verzendfout gemeten. Positieve inboxweergave en
mailaflevering zijn ook getest met de beperkte loopback-TLS-fixture in `npm test`;
acceptatie tegen Dovecot/Postfix blijft een aparte stap. Ontbrekende serververbinding wordt
zichtbaar als onvolledige inbox gemeld, niet als een geslaagde lege mailbox.

B1-grenzen: tekstmail naar één ontvanger, handmatig vernieuwen en bewaren.
Geen bijlagedownload/upload, IMAP Drafts-sync, autosave, CC/BCC,
zoekfunctie, herstelworkflow voor verzending, wachtwoordwijzigings-UI,
mailboxbeheer of productiehardening. Bijlagen worden alleen genoemd; geen
schijnknoppen. Snooze en installeerbare PWA blijven verplicht voor v1, buiten B1.

### IMAP-mappen en Verzonden

- **Inbox** blijft het bestaande (gecombineerde of gefilterde) INBOX-overzicht.
  Kies bij **IMAP-mappen** één account. Shott Mail gebruikt de door de IMAP-server
  aangeboden mappenlijst, niet alleen abonnementen. Bovenliggende niet-selecteerbare
  mappen zijn wegwijzers. Mappen worden alleen gelezen; paginanummers kunnen bij
  gelijktijdige toevoeging/verwijdering verschuiven. Bij gewijzigde UIDVALIDITY:
  vernieuw het mapoverzicht voordat je verder leest.
- **Accounts → Kopie in Verzonden**: voor nieuwe en bestaande accounts zonder
  opgeslagen keuze is **Shott Mail** de standaard. Na bevestigde SMTP-acceptatie
  probeert Shott Mail een kopie via IMAP op te slaan. Slaat je provider zelf
  automatisch een kopie op? Kies dan **Provider**; Shott Mail voegt dan niets toe
  en voorkomt zo een extra kopie. Eerder opgeslagen keuzes, inclusief een gekozen
  map, blijven behouden. Automatische mapkeuze vereist precies één selecteerbare
  `\Sent` uit de serverlijst; bij geen/meerdere kandidaten kies je zelf een map.
  Er worden geen mappen aangemaakt en instellingen gelden alleen voor toekomstige
  verzendingen.
- De applicatie gebruikt één MIME-buffer met één Message-ID voor SMTP en een
  eventuele IMAP APPEND. Na bevestigde SMTP-acceptatie sluit de composer, ook als
  de kopie faalt. Onder **Concepten / verzendstatus** kun je een onbevestigde kopie
  controleren. De controle schrijft niets op IMAP. Een gezien Message-ID bewijst
  geen unieke kopie; een ontbrekend resultaat sluit vertraging, herschrijven,
  verplaatsen of zoekindexvertraging niet uit.
- Na een onzekere APPEND wordt niet opnieuw opgeslagen, ook niet na een herstart.
  Een verkeerd ingestelde providerpolicy kan een ontbrekende of dubbele kopie
  opleveren. Er is geen historische backfill, automatische reparatie of garantie
  op precies één kopie bij alle providers. Bij SMTP-onzekerheid: controleer de
  provider of ontvanger vóór je bewust iets opnieuw verstuurt.

Lokale browserregressies (desktop en mobiele emulatie, synthetische TLS-peers):
`node tests/browser-runner.mjs /absoluut/pad/naar/chrome` na `npm run build`.

## Externe mailboxen en Portainer (pas na onafhankelijke review)

Gebruikers voegen hun eigen account toe via **Accounts**. Vul voor IMAP en SMTP
de openbare DNS-hostnaam, gebruikersnaam en het providerwachtwoord of appwachtwoord
in. IMAP: 993 impliciete TLS of 143 verplichte STARTTLS; SMTP-submission: 465
impliciete TLS of 587 verplichte STARTTLS. Geen IP-adressen als host, poort 25,
onbeveiligde verbinding, certificaatuitzondering, OAuth of autodiscovery. Bewaren
doet geen DNS of mailverkeer. **Opgeslagen instellingen testen** geeft resultaat
per protocol, zonder testmail. De provider blijft verantwoordelijk voor auth,
toegestane afzenders en aflevering. De app biedt geen inkomende SMTP/relay.

Voor de bestaande Portainer-stack gebruik je uitsluitend `compose.portainer.yaml`,
niet het lokale fixturebestand `compose.yaml`. Behoud stacknaam/endpoint, bestaande
HTTPS-proxy voor `shottmail.shott.nl` en LAN-bind `192.168.1.10:3000`. Beperk toegang
tot de backendpoort tot de proxy en vertrouwde beheerinfrastructuur. Pas geen
Compose-instellingen aan voor individuele mailboxen.

1. Exporteer de bestaande stackconfig, variabelen en image/build-referenties. Inspecteer
   de bestaande mounts: noteer de concrete Docker-volumenamen voor `app-data`,
   `app-secrets` en `fixture-mail`; ga niet uit van een naamvoorvoegsel. Stop de
   schrijvers en maak één consistente, beschermde backup van alle drie volumes
   (incl. SQLite-journal, originele sleutel/login en fixturebestanden). Test
   herstel op kopieën; draai nooit twee apps op dezelfde database.
2. Stel `SHOTT_MAIL_COMMIT` in op de gereviewde volledige Git-SHA, en
   `SHOTT_MAIL_DATA_VOLUME` en `SHOTT_MAIL_SECRETS_VOLUME` op de geverifieerde
   bestaande namen. Render en controleer vóór de update de buildref, mounts en
   poort. Bestaande database en secrets zijn verplicht; voer geen setup uit om
   ontbrekende data te repareren. Behoud UID:GID 1000:1000 en bestaande rechten.
3. Werk alleen de bestaande stack bij na akkoord. Laat de oude fixture gestopt;
   behoud het fixturevolume en de secrets, ook als ze niet meer gebruikt worden.
   Gebruik geen `down -v`, volumeprune of automatische updates. Oude fixtureaccounts
   blijven opgeslagen maar kunnen in publieke modus niet verbinden. Bewerk ze
   bewust of voeg afzonderlijke accounts toe. Bij terugval: stop schrijvers,
   bewaar zo nodig de toestand na upgrade afzonderlijk, herstel de volledige
   pre-upgradeset op gecontroleerde volumes plus de oude stackconfig en buildref.

De publieke modus neemt alle ontvangen A- en AAAA-antwoorden mee: één verboden
antwoord weigert de hele poging. De clients kiezen één numeriek adres per operatie
zonder DNS-fallback en verifiëren TLS 1.2+ tegen de oorspronkelijke hostnaam en
systeemroots. Dit controleert adresbereik, niet waar hostrouting/NAT dat IP werkelijk
aflevert. Gebruik vertrouwde DNS en beperk egress op de host tot DNS en de genoemde
mailpoorten; blokkeer interne netwerken en publieke IP-aliassen die intern eindigen.
Er geldt een limiet van tien nieuwe/totale accounts per eigenaar (bestaande worden
niet verwijderd), acht gelijktijdige mailverzoeken per proces en twintig per gebruiker
per minuutvenster. DNS-, verbindings- en inactiviteitstime-outs zijn geen harde
totale deadline voor een actieve sessie. Er is geen automatische failover tussen
geverifieerde IP's; een onbereikbare eerste keuze kan dus tot een fout leiden.

## Lokale uitvoering zonder Docker

Getest: Node 24.22.3, npm 11.19.1. Gebruik bestaande projectlokale Node of een
geautoriseerde Node-installatie; verander geen hostdiensten/securityguards.

    npm ci --ignore-scripts
    npm run typecheck
    npm run build
    npm test
    npm run setup
    npm start

Open http://127.0.0.1:3000. Gebruik login `admin` met het wachtwoord uit
`secrets/login`; lees het rechtstreeks in de lokale omgeving, niet via chat/logs.
Maak gebruikers aan via **Gebruikers** en kies per gebruiker een eigen sterk
wachtwoord (minimaal 16 tekens). Loginnamen zijn hoofdletterongevoelig en uniek.
Gebruikers koppelen hun eigen mailboxen via **Accounts**; **Alle accounts** toont
alleen hun eigen ingestelde mailboxen. De beheerrol geeft geen toegang tot de
mailboxen, concepten of verzendstatus van anderen. Er is geen publieke registratie.

### Upgrade van B1

Stop eerst de B1-app en maak een herstelbare, consistente backup van data,
secrets en fixturemail. Behoud de bestaande volumes en bestanden `secrets/key`
en `secrets/login`. Bij eerste start controleert de server de oorspronkelijke
sleutel en verifieert hij het loginbestand tegen de opgeslagen B1-hash.
Een mismatch blokkeert de upgrade; maak geen sleutels aan om een fout te wissen.
De migratie wijst in één transactie alle B1-mailboxen, concepten en verzendstatus
toe aan `admin`, behoudt versleutelde credentials en maakt alle B1-sessies ongeldig.
Log opnieuw in als `admin` met het bestaande B1-wachtwoord. Nieuwe gebruikers
beginnen leeg. Na migratie verandert een gewijzigd loginbestand het opgeslagen
wachtwoord niet. Terugval vereist de backup van vóór de migratie; start B1 nooit
op de gemigreerde database.

`npm ci --ignore-scripts` schakelt dependency-installatiescripts UIT, niet
securitychecks. Omzeil geen installatieblokkades. Het ongeautoriseerde
esbuild-installscript is niet handmatig uitgevoerd; de normale Vite-build werkt
met de aanwezige dependencies. Geen `npm rebuild`/approval-bypass nodig/gebruikt.
Dependencies/lockfile zijn gepind. Geïnstalleerde @types/node is 26.6.6 tegenover
Node 24: statische check slaagt en gebruikte runtimepaden zijn daadwerkelijk
uitgevoerd, maar dit is geen volledige typeversiecompatibiliteitsgarantie.
Installatie van Node-24-types/testpackages is nog geblokkeerd; afstemmen blijft open.

Tests genereren eigen secrets en data onder `.test-data`; geen vaste wachtwoorden.
`npm test` omvat echte SQLite/Fastify/crypto, procesherstart en een bewust beperkte
SMTP/TLS-foutsimulator. Die simulator is GEEN volwaardige mailserverfixture en
GEEN interoperabiliteitsbewijs. De multi-user-tests omvatten ook een echte
TLS/IMAP/SMTP-rondgang over loopback en migratie van een synthetische B1-database.
Voor de browserworkflow: bouw de client, start `node tests/browser-harness.ts`,
open de gemelde loopback-URL met `/__test_login?workflow=1` en lees
`window.multiuserBrowserResult` in de browserconsole. De test gebruikt verse
synthetische data; de test-loginroute zit niet in productie of het runtime-image.

## Docker-teststack op Aärons eigen host — nog niet uitgevoerd

Handmatig broncode op exact gekozen commit bouwen; geen gepubliceerde app-image,
GHCR, automatische update of release. Gebruik een afzonderlijke testdirectory.
De officiële Node/Debian-baseimages zijn op registry-gecontroleerde digests gepind.
APT-inhoud van de container is nog niet op pakketversies/snapshot gepind; leg de
werkelijke versies/image-ID's bij de eerste build vast. Geen bitreproduceerbare
container- of licentie/advisoryvrijgave geclaimd.

    git clone https://github.com/aaronshott/shott-mail.git
    cd shott-mail
    git fetch origin feat/mailclient-10-multiuser
    git checkout --detach <EXACTE_COMMIT_UIT_DEVELOPMENT_RAPPORT>
    cp .env.example .env
    export LOCAL_UID=$(id -u)
    export LOCAL_GID=$(id -g)
    mkdir -m 700 secrets data
    docker compose build
    docker compose run --rm --no-deps setup
    docker compose up -d app
    docker compose ps
    docker compose logs --tail=100 app mail

Bewaar LOCAL_UID/GID ook in `.env` voor volgende shells; waarden moeten overeenkomen
met de eigenaar van data/secrets. Deze instructies veranderen geen hostprivileges.
Opnieuw `mkdir` uitvoeren bij bestaande directories is niet nodig. Compose `setup`
schrijft alleen in gemounte data/secrets; kopieer `.env.example` zelf zoals hierboven.

App publiceert uitsluitend op 127.0.0.1. Gebruik op een andere machine een SSH-tunnel
naar de testhost, bijvoorbeeld `ssh -L 3000:127.0.0.1:3000 <testhost>`, en bezoek
http://127.0.0.1:3000. Houd APP_ORIGIN exact gelijk aan de browser-origin. Voor
mobiele LAN-toegang is een apart geautoriseerde HTTPS-terminatie nodig; HTTP met
niet-loopback-origin wordt geweigerd. Geen proxy/domein/deployment ingericht.

Docker-netwerk `isolated` is internal. IMAP/SMTP-poorten worden niet gepubliceerd.
Fixture is echte Debian Dovecot + Postfix uit eigen `fixtures/mail/Dockerfile`,
geen verzonnen mailserver-image. Postfix accepteert alleen twee lokale ontvangers,
vereist TLS/auth en heeft externe default/relay-transporten uitgeschakeld. De
isolatie en relayregels zijn ontworpen maar moeten op de testhost worden bewezen.

Voeg in Accounts toe:

| Instelling | Werk | Privé |
|---|---|---|
| Adres / beide gebruikersnamen | work@example.test | private@example.test |
| IMAP | mail, 1993, implicit TLS | mail, 1993, implicit TLS |
| SMTP | mail, 1587, verplicht STARTTLS | mail, 1587, verplicht STARTTLS |
| Beide wachtwoorden | lokaal bestand secrets/work | lokaal bestand secrets/private |

`setup` genereert willekeurige credentials en een 30 dagen geldig fixturecertificaat
voor `mail` en 127.0.0.1. De app vertrouwt uitsluitend via MAIL_CA_FILE deze extra
CA; certificaatcontrole wordt nooit uitgezet. Na verlopen certificaat: stop de
stack, archiveer/vervang alleen fixturecertificaat/-sleutel, voer setup opnieuw uit
en start opnieuw; wis nooit `secrets/key`, anders zijn accountcredentials verloren.
Elke mailbox krijgt één synthetische seedmail. Seeds worden niet op iedere start
opnieuw aangemaakt; ontvangen mail blijft in volume `fixture-mail`.

Controleer de echte keten (nog NIET uitgevoerd op Hermes):

    docker compose exec -e CONFIRM_SYNTHETIC_FIXTURE=yes -e TEST_DATA_DIR=/app/data/.test-data app npm run test:protocol
    docker compose exec mail dpkg-query -W
    docker compose images
    docker compose exec app node scripts/health.mjs

De acceptatiescript maakt een aparte tijdelijke appdatabase, test twee echte
mailboxen/gezamenlijke inbox, IMAP/SMTP-auth/TLS-fouten, echte lokale SMTP-aflevering
naar IMAP, afzender/accountbinding, UIDVALIDITY en weigering van externe relay.
Het raakt de appdatabase niet en logt geen wachtwoorden/mailinhoud. Synthetische
acceptatieberichten blijven in de testmailbox. Bewaar uitvoer plus exacte commit
als bewijs; een scriptbestand of `compose config` is geen PASS.

## Installatie-instellingen en veiligheidsgrenzen

- SQLite en secrets op lokale schijf, één appinstantie; geen NFS/replica's.
- DB/secretfiles 0600, directories 0700; app weigert te ruime secret/DB-rechten.
- `secrets/key` is een aparte 32-byte AES-256-GCM-sleutel. Credentials zijn met
  verse nonce en accountbinding versleuteld. Metadata/concepten zijn plaintext:
  beveilig host, schijf en backups. Hostbeheerder is vertrouwd.
- Sessies: random cookie, server bewaart alleen tokenhash, HttpOnly/SameSite=Strict,
  Secure bij HTTPS, oorsprong + CSRF voor mutaties. Geen proxy-userheaders vertrouwen.
- `MAIL_MODE` is standaard `disabled`. De lokale fixture-Compose kiest expliciet
  `fixture` op een intern Docker-netwerk en gebruikt `MAIL_ALLOWLIST` (exacte
  host:poort-paren) en `MAIL_CA_FILE`. `public` aanvaardt geen fixture-instellingen.
- Configureerbaar/provisional: SESSION_MS, MAX_MESSAGE_BYTES, INBOX_PAGE_SIZE,
  MAIL_TIMEOUT_MS, LOGIN_ATTEMPTS_PER_MINUTE, BODY_LIMIT_BYTES, MAX_DRAFT_CHARS
  en SQLITE_BUSY_MS. Geen door Aäron vastgestelde normen. Configureer bodylimiet
  ruim genoeg voor JSON/UTF-8 boven de maximale conceptlengte; server weigert te
  grote aanvragen zonder het opgeslagen concept te overschrijven.
- Safe HTML laat alleen eenvoudige opmaak zonder attributen door; sandbox-iframe,
  CSP, geen scripts/afbeeldingen/links/remote CSS. Geen willekeurige URL/filefetch.
- Versturen: concept eerst persistent opslaan, operation-id vergrendelen, daarna
  netwerk. Een herhaalde POST voert niet opnieuw SMTP uit. Na DATA-fout/herstart
  wordt resultaat conservatief `outcome_unknown`. Nooit automatisch hersturen.
  `accepted` betekent alleen SMTP-aanvaarding, geen aflevering; de IMAP-kopiestatus staat apart.
  Bij onzeker resultaat provider/ontvanger controleren; afwezige Sent-copy bewijst
  niets. Fout/succes bewaart tekst; de oorspronkelijke operatie blijft vergrendeld.
- Onopgeslagen invoer blijft alleen in de open tab; herladen/crash kan die verliezen.
  Bewaar expliciet. Geen gevoelige tekst in browser-localStorage/serviceworkercache.

## Handmatig updaten, backup en terugval

Noteer vóór wijziging `git rev-parse HEAD`, `docker compose images` en configuratie.
Backups zijn alleen consistent als app/mail gestopt zijn. Archiveer geheimen apart
en versleuteld; delen/loggen van archives is niet toegestaan. Verifieer restauratie
in een afzonderlijke directory/stack vóór vertrouwen op een backup.

    docker compose stop app mail
    tar -czf ../shott-mail-data-backup.tgz data
    tar -czf ../shott-mail-secrets-backup.tgz secrets .env

De fixture-mail zit in een named volume, niet in `data`. Aanvullende fixturebackup
op de testhost met de reeds gebouwde mailcontainer (hier is geen nieuwe image nodig):

    docker compose run --rm --no-deps --entrypoint tar mail -czf - -C /mail . > ../shott-mail-fixture-backup.tgz

Voor herstel: stop services, herstel data/secrets met oorspronkelijke eigenaar/
rechten en bijbehorende sleutel. Herstel fixturevolume met dezelfde image:

    docker compose run --rm -T --no-deps --entrypoint tar mail -xzf - -C /mail < ../shott-mail-fixture-backup.tgz

Update alleen naar expliciet gekozen SHA:

    git fetch origin feat/mailclient-10-multiuser
    git checkout --detach <NIEUWE_GOEDGEKEURDE_COMMIT>
    docker compose build
    docker compose up -d app
    docker compose ps

Bij terugval: oude exacte commit + bijbehorende consistente data/secretsbackup
terugzetten en opnieuw bouwen. B1 heeft nog geen gegarandeerde downmigration of
schema-upgradecompatibiliteit; een oudere binary niet op een nieuwere DB proberen.
Geen `down -v`: dat wist fixturemail. Backup/restore en containerrestart zijn nog
ongetest; alleen lokale DB- en echte Node-procesherstart zijn uitgevoerd.

## Licenties, advisories en review

Bestaande LICENSE ongewijzigd (GNU AGPL v3); geen nieuwe only/or-later-keuze.
Broncode/licentielink staan in de UI. Bij eigen verspreiding of gewijzigd online
gebruik moet de beheerder corresponderende exacte broncode beschikbaar houden.
`THIRD_PARTY_NOTICES.txt` bevat aanwezige licentieteksten; regenereer per platform:

    node scripts/inventory.mjs --notices
    npm audit --json
    npm sbom --sbom-format cyclonedx

Audit meldde nul vulnerabilities op de ontwikkelhost; externe threatchecks hadden
nog time-outs. De coordinator installeerde runtime/tooling via normale approval;
dat is GEEN claim dat alle checks voltooid zijn. Aanvullende smtp-server,
hoodiecrow-imap, Playwright en Node-24-types werden geweigerd; geen omzeiling.
Ontbrekende noticefiles, optionele platformpackages, OS-packages en juridische
compatibiliteitsreview blijven open. Zelfcontrole is geen onafhankelijke QA.
