<script>
 export let protocol;
 export let endpoint;
 export let saved=false;
 export let publicMode=false;
 $: standardPort=protocol==='IMAP'?(endpoint.tls==='implicit'?993:143):(endpoint.tls==='implicit'?465:587);
</script>

<fieldset>
 <legend>{protocol}</legend>
 <label>Host<input bind:value={endpoint.host} required/></label>
 <label>Poort<input type="number" bind:value={endpoint.port} min={publicMode?standardPort:1} max={publicMode?standardPort:65535} required/></label>
 <label>TLS<select bind:value={endpoint.tls} onchange={e=>{if(publicMode)endpoint.port=protocol==='IMAP'?(e.currentTarget.value==='implicit'?993:143):(e.currentTarget.value==='implicit'?465:587);}}><option value="implicit">Implicit TLS</option><option value="starttls">Verplicht STARTTLS</option></select></label>
 <label>Gebruikersnaam<input bind:value={endpoint.user} required autocomplete="off"/></label>
 <label>Wachtwoord{saved?' (leeg = behouden)':''}<input type="password" bind:value={endpoint.password} autocomplete="new-password" required={!saved}/></label>
</fieldset>
