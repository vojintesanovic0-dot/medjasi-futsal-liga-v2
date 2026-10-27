import { state } from '../state.js';
import { getMyTeamApplications, createTeamApplication } from '../api.js';
import { esc, toast, errMsg } from '../util.js';
const STATUS={pending:'Na čekanju',accepted:'Prihvaćena',rejected:'Odbijena'};
export function registerApply(route){
 route('/prijava-ekipe',async ctx=>{
  if(!state.session){ctx.app.innerHTML='<div class="page-head"><h1>Prijava nove ekipe</h1></div><div class="card"><p>Da bi prijavio ekipu, prvo se prijavi ili napravi nalog.</p><a class="btn btn-primary" href="#/prijava">Prijava</a></div>';return;}
  try {
   const apps=await getMyTeamApplications(state.session.user.id);if(!ctx.current())return;
   const open=apps.find(a=>a.status==='pending'),last=apps[0];
   if(open){ctx.app.innerHTML='<div class="page-head"><h1>Prijava nove ekipe</h1></div><div class="card"><p><strong>Tvoja prijava za ekipu „'+esc(open.team_name)+'“ je na čekanju.</strong></p><p class="muted small">Poslana: '+esc(new Date(open.created_at).toLocaleDateString('bs-BA'))+'. Javićemo ti se na e-mail '+esc(open.contact_email)+'.</p></div>';return;}
   const notice=last?'<div class="card"><p>Posljednja prijava za „'+esc(last.team_name)+'“: <strong>'+esc(STATUS[last.status]||last.status)+'</strong>. Možeš poslati novu.</p></div>':'';
   ctx.app.innerHTML='<div class="page-head"><h1>Prijava nove ekipe</h1><p class="muted">Ispuni podatke o ekipi. Administrator će pregledati prijavu.</p></div>'+notice+
    '<form id="team-app" class="card form grid-form"><label>Naziv ekipe<input name="team_name" required minlength="2" maxlength="60"></label><label>Ime kontakt osobe<input name="contact_name" required minlength="2" maxlength="80"></label><label>E-mail<input name="contact_email" type="email" required maxlength="200" value="'+esc(state.session.user.email||'')+'"></label><label>Telefon (opciono)<input name="contact_phone" maxlength="30" autocomplete="tel"></label><label class="full">Poruka (opciono)<textarea name="message" rows="4" maxlength="1000"></textarea></label><p class="muted small full">Podaci se koriste za obradu prijave. Pogledaj <a href="privatnost.html">privatnost i uslove</a>.</p><div class="full"><button class="btn btn-primary" type="submit">Pošalji prijavu</button></div></form>';
   ctx.app.querySelector('#team-app').addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget,f=new FormData(form),btn=form.querySelector('button');btn.disabled=true;
    try{await createTeamApplication({user_id:state.session.user.id,team_name:String(f.get('team_name')).trim(),contact_name:String(f.get('contact_name')).trim(),contact_email:String(f.get('contact_email')).trim().toLowerCase(),contact_phone:String(f.get('contact_phone')||'').trim()||null,message:String(f.get('message')||'').trim()||null});
     toast('Prijava je poslana. Hvala!');form.outerHTML='<div class="card"><p><strong>Prijava je poslana i čeka pregled.</strong></p></div>';
    }catch(error){toast(error?.code==='23505'?'Već imaš prijavu na čekanju.':errMsg(error),'err');btn.disabled=false;}
   });
  } catch(e) { if(ctx.current())ctx.app.innerHTML='<div class="card error">Prijavu trenutno nije moguće učitati.</div>'; }
 });
}
