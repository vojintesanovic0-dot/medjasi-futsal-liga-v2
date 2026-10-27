import { sb } from './supabase.js';

export function mountNewsletter(el) {
  if (!el) return;
  el.innerHTML=`<form class="newsletter" id="nl-form"><strong>Obavještenja na e-mail</strong>
    <p class="muted small">Novosti, rezultati i vijesti. Odjava je moguća u svakom trenutku.</p>
    <div class="nl-row"><input name="email" type="email" required maxlength="200" autocomplete="email" placeholder="tvoj@e-mail.ba" aria-label="E-mail">
    <button class="btn btn-sm btn-primary" type="submit">Prijavi se</button></div>
    <label class="check small"><input name="consent" type="checkbox" required> Slažem se da primam obavještenja e-mailom. <a href="privatnost.html">Privatnost</a></label>
    <p class="small" id="nl-msg" role="status" aria-live="polite"></p></form>`;
  el.querySelector('#nl-form').addEventListener('submit',async e=>{
    e.preventDefault(); const form=e.currentTarget; const email=String(new FormData(form).get('email')||'').trim().toLowerCase(); const button=form.querySelector('button'); const msg=el.querySelector('#nl-msg');
    button.disabled=true; msg.textContent='Prijavljujem…';
    try {
      const {data,error}=await sb.rpc('subscribe_newsletter',{p_email:email});
      if(error) throw error;
      if(data!==true) throw new Error('Unesi ispravnu e-mail adresu.');
      form.reset(); msg.textContent='Hvala! Prijava je zabilježena.';
    } catch(error) { msg.textContent=error.message==='Unesi ispravnu e-mail adresu.'?error.message:'Prijava nije uspjela. Provjeri adresu i pokušaj ponovo.'; }
    finally { button.disabled=false; }
  });
}
