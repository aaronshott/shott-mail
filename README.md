# Shott Mail — B1 in uitvoering, nog geen mailclient

Deze branch bevat uitsluitend een eerste geteste opslagmodule. Geen werkende
frontend/backend, login, IMAP/SMTP-keten of container. Niet deployen en nog niet
als B1-kandidaat aan product-QA aanbieden.

## Werkelijk uitvoerbaar

Vereist Node 24.22.3 (getest met ingebouwde SQLite 3.54.1). Geen hostdaemon nodig.
De opslagtests gebruiken alleen Node-builtins; TypeScript wordt door Node
uitgevoerd met native type stripping. Dit is geen statische typecheck.

    node --test tests/*.test.ts

Met Node op PATH werkt ook `npm test`. Voor dependency-installatie in een
geautoriseerde omgeving: `npm ci`. Laat de normale securitychecks uitvoeren;
omzeil geen blokkades. Fastify 5.12.8 en Svelte 5.58.1 staan exact gepind in
package.json/package-lock.json maar zijn nog niet tot een app geïntegreerd.

    node scripts/inventory.mjs
    npm audit --json
    npm sbom --sbom-format cyclonedx

## Opslagmodule

`src/server/store.ts` bevat accountmetadata, AES-256-GCM-encryptie van credentials
en lokale conceptrevisies in SQLite. Iedere encryptie gebruikt een verse nonce
en accountgebonden associated data. Accountlijsten bevatten geen credentials.
Verkeerde sleutel en verplaatste ciphertext worden geweigerd. De hoofdsleutel
wordt niet gegenereerd of opgeslagen door deze module: de toekomstige applicatie
moet die uit een apart beheerd secretbestand leveren. Gebruik precies 32 bytes.

Nieuwe DB-bestanden krijgen mode 0600; bestaande bestanden met groeps-/overige
rechten of niet-reguliere bestanden worden geweigerd. De bovenliggende directory
moet eigendom van de applicatiegebruiker zijn en mode 0700 hebben. De module
wijzigt geen hostprivileges. Geen bescherming tegen een kwaadwillende hostbeheerder
of iemand die die directory kan wijzigen. Metadata en concepttekst zijn niet
versleuteld; bescherm schijf en backups afzonderlijk.

SQLite gebruikt synchronous FULL en een voorlopige busy-timeout van 5000 ms.
Dat is een implementatieparameter, geen door de producteigenaar goedgekeurde
norm. Deze module is voor één applicatie-instantie op lokale opslag. Geen
netwerkfilesystem-, crash-, migratie-, sleutelrotatie- of back-upgarantie getest.
Het schema is nog geen vastgelegd upgradecontract. Stel deze interne API niet
rechtstreeks bloot: HTTP-validatie, authenticatie en limieten ontbreken nog.

Concepten gebruiken een accountbinding en verwachte revisie; een verouderde
revisie overschrijft de bewaarde tekst niet. Geen IMAP Drafts-synchronisatie,
autosave-UI of SMTP-journal geïmplementeerd. Tests bewijzen heropenen van de
SQLite-verbinding, niet herstart van een volledig serverproces/container.

## Beperkingen / hervatten

Normale installaties van @fastify/cookie, @fastify/static, typescript, tsx,
imapflow en nodemailer zijn tijdens hervatting door Tirith geblokkeerd wegens
threat-intelligence time-outs. De coordinator moet een geautoriseerd werkend
installatiepad bieden; geen alternatieve installer of bypass toepassen.
Svelte-installatie, npm audit en SBOM-export konden wel worden uitgevoerd.
Dockeracceptatie is afzonderlijk BLOCKED: geen Docker-hostinstallatie toegestaan.

Nog te bouwen en testen: eigen login/sessies, accountconfiguratie-UI, veilige
mailweergave, inboxen/badges, composer, SMTP en uitkomstonzekerheid, echte
loopback-protocolfixtures, mobiel/browserinteracties, Docker/Compose. Snooze en
installeerbare PWA blijven buiten B1 maar verplicht voor v1.

## Licentie en review

Bestaande LICENSE is ongewijzigd: GNU AGPL versie 3. Geen aanvullende
-only/-or-later-projectnotice verzonnen. Wijziging: eerste B1-opslagmodule en
tests, 20 november 2026. Zelfcontrole, geen onafhankelijke QA of vrijgave.
Fastify en Svelte bevatten MIT-notices; transitive notice- en containerreview
zijn nog niet afgerond. Npm audit is een momentopname, geen veiligheidsverklaring.

Tests genereren secrets tijdens uitvoering en verwijderen de tijdelijke DB's.
Geen vaste testwachtwoorden. node_modules, .test-data en secretbestanden staan
buiten Git. Dossier/testlogs staan bij de coordinator onder build-B1-development;
historie van de eerste blokkade blijft onder blocked-attempt-1 bewaard.
