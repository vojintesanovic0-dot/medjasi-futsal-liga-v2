import { sb } from '../supabase.js';
import { getTeams, uploadMedia } from '../api.js';
import { esc, toast, errMsg, empty } from '../util.js';

const fail = e => toast(errMsg(e), 'err');

export async function sectionSponsors(ctx, body) {
  const {data,error}=await sb.from('sponsors').select('*').order('tier').order('name');
  if(!ctx.current())return;
  if(error)return fail(error);
  body.innerHTML=`<div class="card"><h3>Sponzori lige</h3><form id="new-sponsor" class="form grid-form">
    <label>Naziv<input name="name" required minlength="2" maxlength="80"></label>
    <label>Nivo<select name="tier"><option value="1">Glavni</option><option value="2">Partner</option><option value="3" selected>Podrška</option></select></label>
    <label>Web stranica (HTTPS)<input name="url" type="url" placeholder="https://"></label>
    <label>Logo (slika do 5 MB)<input name="logo" type="file" accept="image/*"></label>
    <label class="check"><input name="active" type="checkbox" checked> Prikaži na početnoj</label>
    <button class="btn btn-primary" type="submit">Dodaj sponzora</button></form></div>
    <div class="card"><h3>Postojeći sponzori</h3><ul class="roster-admin">${(data||[]).map(s=>`<li><span>${esc(s.name)} <span class="muted small">· nivo ${Number(s.tier)||3}${s.active?'':' · skriven'}</span></span><button class="btn btn-xs" data-toggle="${esc(s.id)}" data-active="${s.active?'1':'0}">${s.active?'Sakrij':'Prikaži'}</button><button class="btn btn-xs btn-danger" data-delete="${esc(s.id)}">Obriši</button></li>`).join('')||'<li class="muted">Nema sponzora.</li>'}</ul></div>`;
  body.querySelector('#new-sponsor').addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget;const f=new FormData(form);const btn=form.querySelector('button[type=submit]');btn.disabled=true;
    try{const file=f.get('logo');let logo_url=null;if(file?.size){if(!file.type.startsWith('image/')||file.size>5*1024*1024)throw new Error('Logo mora biti slika do 5 MB.');logo_url=await uploadMedia(file,'sponsors');}
      const url=String(f.get('url')||'').trim()||null;if(url&&!url.startsWith('https://'))throw new Error('Adresa sponzora mora počinjati sa https://.');
      const {error:err}=await sb.from('sponsors').insert({name:String(f.get('name')).trim(),tier:Number(f.get('tier')),url,logo_url,active:f.get('active')==='on'});if(err)throw err;
      toast('Sponzor dodan.');sectionSponsors(ctx,body);
    }catch(err){fail(err);}finally{btn.disabled=false;}
  });
  body.querySelectorAll('[data-toggle]').forEach(b=>b.addEventListener('click',async()=>{const {error:err}=await sb.from('sponsors').update({active:b.dataset.active!=='1'}).eq('id',b.dataset.toggle);if(err)return fail(err);sectionSponsors(ctx,body);}));
  body.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Obrisati sponzora?'))return;const {error:err}=await sb.from('sponsors').delete().eq('id',b.dataset.delete);if(err)return fail(err);sectionSponsors(ctx,body);}));
}

export async function sectionApplications(ctx, body) {
  const {data,error}=await sb.from('team_applications').select('*').order('created_at',{ascending:false});
  if(!ctx.current())return;
  if(error)return fail(error);
  const rows=data||[];const labels={pending:'na čekanju',approved:'odobrena',rejected:'odbijena'};
  body.innerHTML=`<div class="card"><h3>Prijave ekipa (${rows.filter(a=>a.status==='pending').length} na čekanju)</h3><p class="muted small">Odobravanje ne kreira ekipu automatski; ekipu zatim dodaj u odjeljku Ekipe i igrači.</p>
  ${rows.map(a=>`<article class="app-row" data-app="${esc(a.id)}"><div><strong>${esc(a.team_name)}</strong><span class="muted small"> · ${esc(labels[a.status]||a.status)}</span><div class="muted small">${esc(a.contact)}</div>${a.message?`<p class="small">${esc(a.message)}</p>`:''}</div>${a.status==='pending'?'<div class="row-actions"><button class="btn btn-xs btn-primary" data-status="approved">Odobri</button><button class="btn btn-xs btn-danger" data-status="rejected">Odbij</button></div>':''}</article>`).join('')||empty('Nema prijava.')}</div>`;
  body.querySelectorAll('[data-status]').forEach(b=>b.addEventListener('click',async()=>{const id=b.closest('[data-app]').dataset.app;const {error:err}=await sb.from('team_applications').update({status:b.dataset.status}).eq('id',id);if(err)return fail(err);toast('Status prijave ažuriran.');sectionApplications(ctx,body);}));
}
