import { sb } from '../supabase.js';
import { getActiveSeason, getTeams, getPlayers, getMatches, uploadMedia } from '../api.js';
import { parseCsv, toCsv, downloadCsv } from '../csv.js';
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

export async function sectionNewsletter(ctx, body) {
  const {count,error}=await sb.from('newsletter_subscribers').select('email',{count:'exact',head:true}).is('unsubscribed_at',null);
  if(!ctx.current())return;
  if(error)return fail(error);
  body.innerHTML=`<div class="card"><h3>E-mail obavještenja</h3><p class="muted">Aktivnih pretplatnika: <strong>${count??0}</strong></p>
    <form id="nl-send" class="form"><label>Naslov<input name="subject" required minlength="2" maxlength="120"></label>
    <label>Tekst poruke<textarea name="text" required minlength="2" maxlength="4000" rows="6"></textarea></label>
    <button class="btn btn-primary" type="submit">Pošalji pretplatnicima</button></form><p id="nl-out" class="muted small" role="status" aria-live="polite"></p></div>`;
  body.querySelector('#nl-send').addEventListener('submit',async e=>{
    e.preventDefault();if(!confirm(`Poslati e-mail svim aktivnim pretplatnicima (${count??0})?`))return;
    const form=e.currentTarget;const f=new FormData(form);const out=body.querySelector('#nl-out');const button=form.querySelector('button');button.disabled=true;out.textContent='Šaljem…';
    try{const {data,error:invokeError}=await sb.functions.invoke('send-newsletter',{body:{subject:String(f.get('subject')).trim(),text:String(f.get('text')).trim()}});
      if(invokeError||data?.error)throw invokeError||new Error(data.error);
      out.textContent=`Završeno — uspješno: ${Number(data.sent)||0}, neuspješno: ${Number(data.failed)||0}, ukupno: ${Number(data.total)||0}.`;
    }catch(err){out.textContent='Slanje nije uspjelo. Provjeri Edge Function i njene secrets.';fail(err);}finally{button.disabled=false;}
  });
}

const CSV_POSITIONS=['golman','odbrana','vezni','napad'];
export async function sectionImportExport(ctx, body) {
  const season=await getActiveSeason();
  const [teamResult,players,matches]=await Promise.all([sb.from('teams').select('id,name,short_name,color,logo_url,season_id').order('name'),getPlayers(),season?getMatches(season.id):Promise.resolve([])]);
  if(!ctx.current())return;
  if(teamResult.error)return fail(teamResult.error);
  const teams=teamResult.data||[];
  const teamName=id=>teams.find(t=>t.id===id)?.name||'';
  body.innerHTML=`<div class="card"><h3>Izvoz podataka (CSV)</h3><p class="muted small">CSV fajlovi su UTF-8 i mogu se otvoriti u Excel-u ili Google Sheets-u.</p>
    <div class="row-actions"><button class="btn btn-sm" data-export="teams">Ekipe</button><button class="btn btn-sm" data-export="players">Igrači</button><button class="btn btn-sm" data-export="matches">Utakmice aktivne sezone</button></div></div>
    <div class="card form narrow"><h3>Uvoz igrača iz CSV-a</h3><p class="muted small">Obavezne kolone: <code>ekipa,ime,prezime</code>. Opcionalno: <code>broj,pozicija,kapiten</code>. Ekipa mora već postojati. Maksimalno 1 MB; duplikati brojeva se odbijaju.</p>
    <label>CSV fajl<input id="csv-file" type="file" accept=".csv,text/csv"></label><div id="csv-preview" class="small" role="status" aria-live="polite"></div><button class="btn btn-primary" id="csv-import" type="button" disabled>Uvezi igrače</button></div>`;
  body.querySelectorAll('[data-export]').forEach(b=>b.addEventListener('click',()=>{
    if(b.dataset.export==='teams')downloadCsv('ekipe.csv',toCsv(teams,['name','short_name','color','logo_url']));
    else if(b.dataset.export==='players'){
      const rows=players.map(p=>({...p,team:teamName(p.team_id),is_captain:p.is_captain?'da':'ne'}));
      downloadCsv('igraci.csv',toCsv(rows,['team','first_name','last_name','number','position','is_captain','photo_url']));
    }else{
      const rows=matches.map(m=>({round:m.round,home:m.home?.name,away:m.away?.name,scheduled_at:m.scheduled_at,status:m.status,home_score:m.home_score,away_score:m.away_score,venue:m.venue}));
      downloadCsv('utakmice.csv',toCsv(rows,['round','home','away','scheduled_at','status','home_score','away_score','venue']));
    }
  }));
  const input=body.querySelector('#csv-file'),preview=body.querySelector('#csv-preview'),button=body.querySelector('#csv-import');
  let plan=[];
  input.addEventListener('change',async()=>{
    plan=[];button.disabled=true;preview.textContent='';
    const file=input.files?.[0];if(!file)return;
    if(file.size>1024*1024){preview.textContent='Fajl je prevelik (najviše 1 MB).';return;}
    if(!season){preview.textContent='Nema aktivne sezone.';return;}
    try{
      const [head,...rows]=parseCsv(await file.text());
      const headers=head.map(h=>h.trim().toLocaleLowerCase('bs'));
      const col=k=>headers.indexOf(k);
      if(['ekipa','ime','prezime'].some(k=>col(k)<0)){preview.textContent='Nedostaju kolone: ekipa, ime, prezime.';return;}
      const taken=new Set(players.filter(p=>p.number!=null).map(p=>p.team_id+':'+p.number)),seen=new Set(),errors=[];
      rows.forEach((row,i)=>{
        const get=k=>col(k)<0?'':String(row[col(k)]??'').trim();
        const team=teams.find(t=>t.season_id===season.id&&t.name.toLocaleLowerCase('bs')===get('ekipa').toLocaleLowerCase('bs'));
        const num=get('broj'),pos=get('pozicija').toLowerCase(),key=team?team.id+':'+num:'';
        const problems=[];
        if(!team)problems.push('nepoznata ekipa u aktivnoj sezoni');
        if(!get('ime')||!get('prezime'))problems.push('nedostaje ime ili prezime');
        if(num!==''&&(!Number.isInteger(Number(num))||Number(num)<0||Number(num)>99))problems.push('broj mora biti 0–99');
        if(pos&&!CSV_POSITIONS.includes(pos))problems.push('nepoznata pozicija');
        if(team&&num!==''&&(taken.has(key)||seen.has(key)))problems.push('broj dresa je zauzet');
        if(team&&num!=='')seen.add(key);
        if(problems.length){errors.push('red '+(i+2)+': '+problems.join(', '));return;}
        plan.push({team_id:team.id,first_name:get('ime'),last_name:get('prezime'),number:num===''?null:Number(num),position:pos||null,is_captain:['da','yes','1','true'].includes(get('kapiten').toLowerCase())});
      });
      preview.innerHTML=`<p>Spremno za uvoz: <strong>${plan.length}</strong>${errors.length?', preskočeno: '+errors.length:''}</p>${errors.length?`<ul>${errors.slice(0,20).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}`;
      button.disabled=plan.length===0;
    }catch(err){preview.textContent=err.message||'CSV nije moguće pročitati.';}
  });
  button.addEventListener('click',async()=>{
    if(!plan.length)return;button.disabled=true;
    const {error}=await sb.from('players').insert(plan);
    if(error){button.disabled=false;return fail(error);}
    toast('Uvezeno igrača: '+plan.length+'.');sectionImportExport(ctx,body);
  });
}
