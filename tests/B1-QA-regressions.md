# Gerichte browserregressies B1-QA-002/003

Geen nieuwe packages. Bouw eerst met `npm run build`, start dan vanuit de repo:

    node tests/browser-harness.ts

Open uitsluitend de gelogde loopback-URL met pad `/__test_login`. Dit is een
synthetische testsessie, geen productlogin-backdoor; de harness zit niet in het
runtime-image. Laad de inhoud van `tests/browser-regressions.js` in de browser
(bijvoorbeeld DevTools of browserautomation Runtime.evaluate). De tests bewaren
synthetische concepten via de echte API en bedienen de gebouwde Svelte-interface.

    await window.b1Regression.dirtyDrafts()
    await window.b1Regression.sendResponseLoss()

Beide moeten `passed: true` opleveren. Herhaal desktop én mobiel (390×844). Bewaar
resultaten met viewport en geladen JS-asset/broncommit. Bij een CDP-helper met korte
RPC-timeout: start de promise, schrijf het resultaat naar een window-variabele en
lees die in een volgende browserstap uit; een nog onvolledige array is geen PASS.

002 test same-id dirty cancel/accept, andere concept-id op ander account cancel/
accept, en schoon heropenen. `window.confirm` wordt tijdens deze geautomatiseerde
casus met expliciete cancel/accept-antwoorden aangestuurd en in finally hersteld.
Een aanvullende native-dialogcontrole kan met CDP Page.handleJavaScriptDialog.
Geen model-/bronstringtest als browserbewijs gebruiken.

003 armt een harness-only onSend-hook. De echte backend verwerkt POST /send;
vervolgens ontvangt de browser headers en een afgebroken JSON-body. Hierdoor gaat
het echte HTTP-resultaat verloren (geen fetch-mock). Meteen sluiten vóór headers
bleek in Chromium een automatische HTTP-herhaling te kunnen veroorzaken; daarom
wordt de respons bewust ná headers afgebroken. De bestaande backend-journal blijft
ongewijzigd. Testmetrics tellen POSTs en afgebroken replies.

De API-hostallowlist is leeg: SMTP wordt vóór aanbieding geweigerd. Het verwachte
traject is UI outcome_unknown → status-GET → failed_before_submit. Test beide
zichtbare meldingen, behouden tekst, vergrendelde composer en exact één POST na
herhaalde statusrefresh. Dit is bewijs van HTTP-foutafhandeling, niet van positieve
SMTP-aflevering of een daadwerkelijk aangenomen mail. De bestaande volledige suite
blijft daarnaast TLS/auth/DATA-ackverlies en journaling testen.

De harness genereert eigen secrets zonder logwaarden. Stop de harness na afloop;
geen QA-kopieën of gedeelde productdata gebruiken/wijzigen.
