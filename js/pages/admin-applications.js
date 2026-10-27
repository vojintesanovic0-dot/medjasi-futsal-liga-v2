import { sb } from '../supabase.js';
import { getAllTeamApplications, getActiveSeason } from '../api.js';
import { esc, toast, errMsg, empty } from '../util.js';
const STATUS={pending:'Na čekanju',accepted:'Prihvaćena',rejected:'Odbijena'};
export async function sectionTeamApplications(ctx,body){
 const [apps,season]=await Promise.all([getAllTeamApplications(),getActiveSeason()]);if(!ctx.current())return;
 const pending=apps.filter(a=>a.status==='pending'),rest=apps.filter(a=>a.status!=='pending');
 const card=a=>'<article class="card ta" data-id="'+esc(a.id)+'"><header class="ma-head"><strong>'+esc(a.team_name)+'</strong><span class="muted small">'+esc(STATUS[a.status])+' · '+esc(new Date(a.created_at).toLocaleDateString('bs-BA'))+'</span></header><p class="small">'+esc(a.contact_name)+' · <a href="mailto:'+esc(a.contact_email)+'">'+esc(a.contact_email)+'</a>'+(a.contact_phone?' · '+esc(a.contact_phone):'')+'</p>'+(a.message?'<p class="small muted">'+esc(a.message)+'</p>':'')+'<div class="ma-actions">'+(a.status==='pending'?'<button class="btn btn-primary btn-sm" data-act="accept" type="button">Prihvati i kreiraj ekipu</button><button class="btn btn-sm" data-act="reject" type="button">Odbij</button>':'')+'<button class="btn btn-sm btn-ghost" data-act="del" type="button">Obriši</button></div></article>';
 body.innerHTML='<section class="card"><h2>Prijave ekipa</h2><p class="muted small">Aktivna sezona: '+(season?esc(season.name):'<strong>nema aktivne sezone — prvo aktiviraj sezonu</strong>')+'</p></section><h3>Na čekanju ('+pending.length+')</h3>'+(pending.length?pending.map(card).join(''):empty('Nema novih prijava.'))+'<h3>Ranije</h3>'+(rest.length?rest.map(card).join(''):'<p class="muted small">Nema.</p>');
 const refresh=()=>sectionTeamApplications(ctx,body);
 body.querySelectorAll('.ta').forEach(el=>{const a=apps.find(x=>x.id===el.dataset.id);el.querySelectorAll('[data-act]').forEach(btn=>btn.addEventListener('click',async()=>{
  const act=btn.dataset.act;btn.disabled=true;
  if(act==='del'){if(!confirm('Obrisati prijavu?')){btn.disabled=false;return;}const {error}=await sb.from('team_applications').delete().eq('id',a.id);if(error){toast(errMsg(error),'err');btn.disabled=false;return;}return refresh();}
  if(act==='reject'){const {error}=await sb.from('team_applications').update({status:'rejected'}).eq('id',a.id);if(error){toast(errMsg(error),'err');btn.disabled=false;return;}return refresh();}
  if(act==='accept'){if(!season){toast('Prvo aktiviraj sezonu u admin panelu.','err');btn.disabled=false;return;}if(!confirm('Kreirati ekipu „'+a.team_name+'“ u sezoni '+season.name+'?')){btn.disabled=false;return;}
   const {error:te}=await sb.from('teams').insert({season_id:season.id,name:a.team_name});if(te){toast(te.code==='23505'?'Ekipa s tim imenom već postoji u ovoj sezoni.':errMsg(te),'err');btn.disabled=false;return;}
   const {error}=await sb.from('team_applications').update({status:'accepted'}).eq('id',a.id);if(error){toast('Ekipa je kreirana, ali status prijave nije ažuriran: '+errMsg(error),'err');btn.disabled=false;return;}toast('Ekipa je kreirana. Dodaj igrače u sekciji Ekipe i igrači.');return refresh();
  }
 }));});
}
