<script>
 export let protocol;
 export let endpoint;
 export let saved=false;
</script>

<fieldset>
 <legend>{protocol}</legend>
 <label>Host<input bind:value={endpoint.host} required/></label>
 <label>Poort<input type="number" bind:value={endpoint.port} min="1" max="65535" required/></label>
 <label>TLS<select bind:value={endpoint.tls}><option value="implicit">Implicit TLS</option><option value="starttls">Verplicht STARTTLS</option></select></label>
 <label>Gebruikersnaam<input bind:value={endpoint.user} required autocomplete="off"/></label>
 <label>Wachtwoord{saved?' (leeg = behouden)':''}<input type="password" bind:value={endpoint.password} autocomplete="new-password" required={!saved}/></label>
</fieldset>
