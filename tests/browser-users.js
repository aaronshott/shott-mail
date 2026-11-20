// Self-running real DOM workflow; served exclusively by the loopback harness.
// Generates its own disposable passwords in the page; never logs them.
const tests=[];
const check=(name,condition)=>{if(!condition)throw new Error(name);tests.push(name);};
const pause=()=>new Promise(r=>setTimeout(r,50));
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
async function until(name,fn){for(let i=0;i<200;i++){const value=fn();if(value)return value;await pause();}throw new Error('Timed out: '+name);}
async function click(text){const b=await until(text,()=>{const b=button(text);return b&&!b.disabled&&b;});b.click();}
function fill(input,value){if(!input)throw new Error('Missing form field');input.value=value;input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));}
const form=()=>document.querySelector('main form');
const exact=text=>[...document.querySelectorAll('main h1')].some(e=>e.textContent===text);
const pass=()=>crypto.randomUUID()+crypto.randomUUID();
const nick=crypto.randomUUID().slice(0,8),alice='alice-'+nick,bob='bob-'+nick,alicePass=pass(),bobPass=pass();
async function createUser(name,password){
 const fields=form().querySelectorAll('input');fill(fields[0],name);fill(fields[1],password);await click('Gebruiker aanmaken');
 await until('provisioned '+name,()=>document.querySelector('.feedback')?.innerText.includes(`Gebruiker ${name} aangemaakt.`));
 check('password field cleared after user creation',!form().querySelector('input[type=password]').value);
}
async function login(name,password){
 await until('login form',()=>document.querySelector('.login form'));
 const fields=form().querySelectorAll('input');fill(fields[0],name);fill(fields[1],password);await click('Aanmelden');
 await until('authenticated '+name,()=>document.querySelector('header')?.innerText.includes(name)&&button('Vernieuwen')&&!button('Vernieuwen').disabled);
 check('no administration controls for '+name,!button('Gebruikers'));
}
async function addMailbox(name){
 await click('Accounts');await click('Account toevoegen');
 const fields=form().querySelectorAll('input');
 for(const [i,value] of [name,`${name}@example.test`,'mail.invalid','993',name,pass(),'mail.invalid','465',name,pass()].entries())fill(fields[i],value);
 await click('Account opslaan');await until('saved mailbox',()=>document.querySelector('.feedback')?.innerText.includes('Account opgeslagen'));
}
const options=()=>[...document.querySelectorAll('aside select option')].map(e=>e.textContent);
try{
 await click('Gebruikers');await until('admin panel',()=>exact('Gebruikers beheren'));
 await createUser(alice,alicePass);await createUser(bob,bobPass);
 check('both new logins in admin UI',document.querySelector('main ul').innerText.includes(alice)&&document.querySelector('main ul').innerText.includes(bob));
 await click('Uitloggen');await login(alice,alicePass);
 check('Alice starts with no admin mailboxes',options().length===1);
 await addMailbox('alice-work');await addMailbox('alice-private');
 check('unified selector contains both Alice mailboxes',options().length===3&&options().includes('Alle accounts')&&options().some(v=>v.includes('alice-work'))&&options().some(v=>v.includes('alice-private')));
 await click('+ Nieuw bericht');
 const sender=form().querySelector('select');fill(sender,sender.options[1].value);
 const [to,subject]=form().querySelectorAll('input');fill(to,'recipient@example.test');fill(subject,'Alice only');fill(form().querySelector('textarea'),'Synthetic draft body');
 await click('Concept bewaren');await until('draft saved',()=>document.querySelector('.feedback')?.innerText.includes('Opgeslagen op Shott Mail'));
 await click('Uitloggen');await login(bob,bobPass);
 check('Bob sees no Alice accounts or active editor',options().length===1&&!button('Actief concept hervatten'));
 await click('Concepten / verzendstatus');await until('Bob draft list',()=>exact('Concepten en verzendstatus'));
 check('Bob does not see the Alice draft',!document.querySelector('main').innerText.includes('Alice only'));
 await addMailbox('bob-work');
 check('Bob only sees own mailbox',options().length===2&&options().some(v=>v.includes('bob-work')));
 await click('Uitloggen');await login(alice,alicePass);
 check('Alice still sees her two mailboxes and not Bob’s',options().length===3&&!options().some(v=>v.includes('bob-work')));
 await click('Concepten / verzendstatus');await until('Alice draft list',()=>exact('Concepten en verzendstatus'));
 check('Alice’s saved draft is still visible',document.querySelector('main').innerText.includes('Alice only'));
 window.multiuserBrowserResult={passed:true,tests};
}catch(error){window.multiuserBrowserResult={passed:false,tests,error:error.message};}
