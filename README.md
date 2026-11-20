# Shott Mail — B1 testimplementatie

Echte TypeScript/Fastify/SQLite-backend en Svelte-interface; geen RAM-demo.
Dit is nog GEEN geaccepteerde B1 of productieversie. Lokale build, tests en
browserinteracties zijn uitgevoerd. De positieve IMAP→lezen→SMTP→IMAP-keten
tegen de hieronder meegeleverde Dovecot/Postfix-fixture en alle Dockercriteria
zijn nog ONGETEST. De Hermes-host heeft geen Docker; installeer dat daar niet.
Gebruik alleen synthetische accounts. Geen persoonlijke mailboxen/publieke mail.

## Wat werkt en wat nog niet bewezen is

Eigen single-user login (Argon2id), server-side sessies, CSRF/origincontrole,
versleutelde accountcredentials, IMAP/SMTP-configuratie, gecombineerde en losse
inboxroutes, veilige MIME/HTML-verwerking, composer, lokale concepten en een
persistente SMTP-verzendjournal zijn geïmplementeerd. Desktop en mobiel hebben
een echte interface. In de browser zijn opslaan, expliciete afzenderkeuze en
invoerbehoud bij een backend-verzendfout gemeten. Positieve inboxweergave en
mailaflevering wachten op protocolacceptatie. Ontbrekende serververbinding wordt
zichtbaar als onvolledige inbox gemeld, niet als een geslaagde lege mailbox.

B1-grenzen: INBOX, tekstmail naar één ontvanger, handmatig vernieuwen en bewaren.
Geen bijlagedownload/upload, IMAP Drafts/Sent-synchronisatie, autosave, CC/BCC,
zoekfunctie, herstelworkflow voor verzending, wachtwoordwijzigings-UI,
mailboxbeheer of productiehardening. Bijlagen worden alleen genoemd; geen
schijnknoppen. Snooze en installeerbare PWA blijven verplicht voor v1, buiten B1.

## Lokale uitvoering zonder Docker

Getest: Node 24.22.3, npm 11.19.1. Gebruik bestaande projectlokale Node of een
geautoriseerde Node-installatie; verander geen hostdiensten/securityguards.

    npm ci --ignore-scripts
    npm run typecheck
    npm run build
    npm test
    npm run setup
    npm start

Open http://127.0.0.1:3000. Lees het gegenereerde wachtwoord rechtstreeks uit
`secrets/login` in je eigen lokale omgeving; stuur het niet naar chat/logs.
`setup` maakt bestaande secrets nooit opnieuw aan. Een wijziging in login-file
wijzigt een bestaande databasehash NIET. De login-file is bootstrap-only.

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
GEEN interoperabiliteitsbewijs. `tests/browser-harness.ts` is alleen voor lokale
browsertests: verse synthetische data, uitsluitend loopback. De test-loginroute
komt niet in productie of het runtime-image. De echte login is afzonderlijk via
HTTP getest; succesvolle wachtwoordinvoer is niet via browserautomation bewezen.

## Docker-teststack op Aärons eigen host — nog niet uitgevoerd

Handmatig broncode op exact gekozen commit bouwen; geen gepubliceerde app-image,
GHCR, automatische update of release. Gebruik een afzonderlijke testdirectory.
De officiële Node/Debian-baseimages zijn op registry-gecontroleerde digests gepind.
APT-inhoud van de container is nog niet op pakketversies/snapshot gepind; leg de
werkelijke versies/image-ID's bij de eerste build vast. Geen bitreproduceerbare
container- of licentie/advisoryvrijgave geclaimd.

    git clone https://github.com/aaronshott/shott-mail.git
    cd shott-mail
    git fetch origin feat/b1-mail-flow
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
- MAIL_ALLOWLIST is een door beheerder beheerde exacte host:poort-lijst; standaard
  leeg bij lokale start. Compose staat alleen de fixture toe. Geen TLS-ignoreoptie.
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
  `accepted` betekent alleen SMTP-aanvaarding, geen aflevering. Geen IMAP Sent-copy.
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

    git fetch origin feat/b1-mail-flow
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
