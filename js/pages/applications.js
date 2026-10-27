import { sb } from '../supabase.js';
import { state } from '../state.js';
import { esc, toast, errMsg } from '../util.js';

const STATUS = { pending: 'na čekanju', approved: 'odobrena', rejected: 'odbijena' };
export function registerApplications(route) {
  route('/prijava-ekipe', async (ctx) => {
    const uid = state.session?.user?.id;
    if (!uid) { ctx.app.innerHTML = `<div class="card">Za prijavu ekipe moraš biti prijavljen. <a href="#/prijava">Prijava</a></div>`; return; }
    const { data: mine, error } = await sb.from('team_applications').select('team_name,status,created_at').eq('applicant_id',uid).order('created_at',{ascending:false}).limit(5);
    if (error) throw error;
    if (!ctx.current()) return;
    ctx.app.innerHTML = `<div class="page-head"><h1>Prijava nove ekipe</h1><p class="muted">Admin pregledava prijavu i kontaktira te.</p></div>
      <div class="card form narrow"><form id="app-form">
      <label>Naziv ekipe<input name="team_name" required minlength="2" maxlength="60"></label>
      <label>Kontakt (e-mail ili telefon)<input name="contact" required minlength="3" maxlength="120"></label>
      <label>Poruka (opciono)<textarea name="message" maxlength="500" rows="4"></textarea></label>
      <button class="btn btn-primary" type="submit">Pošalji prijavu</button><p class="msg" id="app-msg" role="status"></p></form></div>
      ${mine?.length ? `<section class="block"><h2>Tvoje prijave</h2><ul class="plain">${mine.map(a=>`<li>${esc(a.team_name)} — ${esc(STATUS[a.status]||a.status)}</li>`).join('')}</ul></section>` : ''}`;
    ctx.app.querySelector('#app-form').addEventListener('submit', async e => {
      e.preventDefault(); const form=e.currentTarget; const f=new FormData(form); const button=form.querySelector('button'); const msg=ctx.app.querySelector('#app-msg');
      button.disabled=true; msg.textContent='Šaljem prijavu…';
      try {
        const {error:insertError}=await sb.from('team_applications').insert({applicant_id:uid,team_name:String(f.get('team_name')).trim(),contact:String(f.get('contact')).trim(),message:String(f.get('message')||'').trim()||null});
        if(insertError) throw insertError;
        form.reset(); msg.textContent='Prijava je poslana. Hvala!'; toast('Prijava poslana.');
      } catch(err) { msg.textContent=err.code==='23505'?'Već imaš prijavu na čekanju.':errMsg(err); }
      finally { button.disabled=false; }
    });
  });
}
