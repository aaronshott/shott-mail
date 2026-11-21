# MAILCLIENT-14 — lokale browserregressie

Gebruik de lokale Node-toolchain die aan `package.json` voldoet. Voer vanuit de repo uit:

```
npm run build
npm run typecheck
npm test
node tests/browser-harness.ts --composer
```

Open in een nieuw Chromium-tabblad `<BROWSER_HARNESS>/__test_login`, met de loopback-URL die de harness print. De test-login gebruikt intern gegenereerde wegwerpgegevens; er is geen echte mailbox nodig. Voer in de browserconsole uit:

```js
await (await import('/__test_composer.js')).runComposer()
```

Herhaal in een nieuw tabblad met mobiele emulatie (390×844; desktop 1280×900). Verwacht `passed: true` en vijf geslaagde controles per viewport: direct geaccepteerd, verloren HTTP-antwoord gevolgd door geaccepteerde status-GET, vertraagd POST-antwoord na wisseling, vertraagde status-GET na wisseling, en een echt opslagconflict. De harness gebruikt een expliciet ingeschakelde lokale TLS SMTP/IMAP-fixture zonder relay; POST- en afleveraantallen worden in de fixture gecontroleerd. De backendgeschiedenis moet beschikbaar blijven. Stop de harness met Ctrl+C.

Voor RED: bouw `0d80df037fc0f82a146c3543712345140e83bdb4` in een aparte werkmap met alleen de gewijzigde browserharness en het testscript uit deze PR. Verwacht vier falende controles per viewport (composer blijft open na bevestiging; vertraagde antwoorden muteren het nieuwe concept), terwijl het opslagconflict slaagt.

De bestaande browserworkflows blijven apart uitvoerbaar met `node tests/browser-harness.ts` (zonder `--composer`): `/__test_login?workflow=b1` schrijft naar `window.b1Results`; `/__test_login?workflow=1` schrijft naar `window.multiuserBrowserResult`.
