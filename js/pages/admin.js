import { sb } from '../supabase.js';
import { state, isStaff, isAdmin } from '../state.js';
import { getActiveSeason, getSeasons, getTeams, getPlayers, getMatches, getEvents, getAllNews, getGallery, uploadMedia } from '../api.js';
import { esc, toast, errMsg, empty, matchElapsed, mmss, toLocalInput, fromLocalInput, slugify, STATUS_LABEL, safeColor } from '../util.js';
import { badge } from '../components.js';
import { sectionNews2 } from './admin-news.js';
import { sectionGenerator, sectionAudit, sectionReports } from './admin-extra.js';
import { sectionSponsors, sectionApplications } from './admin-v8.js';

const POS = { '': '—', golman: 'Golman', odbrana: 'Odbrana', vezni: 'Vezni', napad: 'Napad' };
const EVENT_TYPES = { goal: 'Gol', own_goal: 'Autogol', yellow: 'Žuti karton', red: 'Crveni karton' };

// Svaki odjeljak dobija ctx i sam se iscrtava, forme ostaju funkcionalne
const SECTIONS = {
  utakmice: { label: 'Utakmice', roles: ['admin'], render: sectionMatches },
  ekipe: { label: 'Ekipe i igrači', roles: ['admin'], render: sectionTeams },
  sezone: { label: 'Sezone', roles: ['admin'], render: sectionSeasons },
  vijesti: { label: 'Vijesti', roles: ['admin', 'editor'], render: sectionNews2 },
  galerija: { label: 'Galerija', roles: ['admin', 'editor'], render: sectionGallery },
  uloge: { label: 'Korisnici i uloge', roles: ['admin'], render: sectionUsers },
  kolo: { label: 'Generator kola', roles: ['admin'], render: sectionGenerator },
  prijave: { label: 'Prijave', roles: ['admin', 'editor'], render: sectionReports },
  izmjene: { label: 'Istorija izmjena', roles: ['admin'], render: sectionAudit },
  sponzori: { label: 'Sponzori', roles: ['admin'], render: sectionSponsors },
  prijave_ekipa: { label: 'Prijave ekipa', roles: ['admin'], render: sectionApplications },
};

const toastErr = (e) => toast(errMsg(e), 'err');

export function registerAdmin(route) {
  const adminPage = async (ctx, section) => {
    if (!isStaff()) { ctx.app.innerHTML = `<div class="card">Nemaš pristup administraciji.</div>`; return; }
    const allowed = Object.entries(SECTIONS).filter(([, s]) => s.roles.includes(state.profile.role));
    const current = allowed.find(([k]) => k === section) ? section : allowed[0][0];
    ctx.app.innerHTML = `
      <div class="page-head"><h1>Administracija</h1><p class="muted">Uloga: ${esc(state.profile.role)}</p></div>
      <nav class="subnav">${allowed.map(([k, s]) => `<a href="#/admin/${k}" class="${k === current ? 'on' : ''}">${esc(s.label)}</a>`).join('')}</nav>
      <div id="admin-body">${'<div class="loader">Učitavanje…</div>'}</div>`;
    await SECTIONS[current].render(ctx, ctx.app.querySelector('#admin-body'));
  };
  route('/admin', adminPage);
  route('/admin/:section', adminPage);
}

/* ---------- Utakmice ---------- */
async function sectionMatches(ctx, body) {
  const season = await getActiveSeason();
  if (!season) { body.innerHTML = empty('Prvo napravi i aktiviraj sezonu.'); return; }
  const [matches, teams, players] = await Promise.all([getMatches(season.id), getTeams(), getPlayers()]);
  if (!ctx.current()) return;
  const teamOpts = teams.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  const playerOpts = (selected = '') => `<option value="">—</option>` + Object.entries(players.reduce((acc, p) => { (acc[p.team?.name || '?'] ||= []).push(p); return acc; }, {})).map(([tn, ps]) => `<optgroup label="${esc(tn)}">${ps.map((p) => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${p.number ?? ''} ${esc(p.first_name)} ${esc(p.last_name)}</option>`).join('')}</optgroup>`).join('');
  body.innerHTML = `
    <details class="card" open><summary><strong>Nova utakmica</strong></summary>
      <form id="new-match" class="form grid-form">
        <label>Kolo<input name="round" type="number" min="1" value="${(matches.at(-1)?.round || 0) + 1}" required></label>
        <label>Domaćin<select name="home" required>${teamOpts}</select></label>
        <label>Gost<select name="away" required>${teamOpts}</select></label>
        <label>Datum i vrijeme<input name="at" type="datetime-local" required></label>
        <label>Teren<input name="venue" maxlength="80"></label>
        <label>Broj perioda<select name="periods"><option value="2" selected>2 (poluvremena)</option><option value="1">1</option><option value="3">3</option><option value="4">4</option></select></label>
        <label>Minuta po periodu<input name="period_minutes" type="number" min="1" max="60" value="20" required></label>
        <button class="btn btn-primary" type="submit">Dodaj utakmicu</button>
      </form>
    </details>
    <div class="match-admin-list">${matches.length ? matches.map((m) => `
      <article class="card ma" data-id="${esc(m.id)}">
        <header class="ma-head"><span class="muted">${m.round}. kolo · ${esc(STATUS_LABEL[m.status])}</span>
          <strong>${esc(m.home?.name)} <span class="score">${m.home_score}:${m.away_score}</span> ${esc(m.away?.name)}</strong></header>
        <div class="ma-clock"><span class="clock${m.status === 'scheduled' ? ' muted' : ''}" data-clock data-base="${m.clock_seconds || 0}" data-start="${esc(m.clock_started_at || '')}" data-live="${m.status === 'live' ? 1 : 0}" data-limit="${m.period_minutes * 60}">${mmss(matchElapsed(m))}</span><span class="muted">period ${m.current_period}/${m.periods}</span></div>
        <div class="ma-actions">
          ${m.status === 'scheduled' || m.status === 'paused' ? `<button class="btn btn-primary btn-sm" data-act="start">${m.status === 'scheduled' ? 'Pokreni' : 'Nastavi'}</button>` : ''}
          ${m.status === 'live' ? `<button class="btn btn-sm" data-act="pause">Pauza</button>` : ''}
          ${(m.status === 'live' || m.status === 'paused') && m.current_period < m.periods ? `<button class="btn btn-sm" data-act="next">Sljedeći period</button>` : ''}
          ${m.status !== 'finished' && m.status !== 'scheduled' ? `<button class="btn btn-sm btn-danger" data-act="finish">Završi</button>` : ''}
          <a class="btn btn-sm btn-ghost" href="#/utakmica/${esc(m.id)}">Pogledaj</a><button class="btn btn-sm btn-ghost" data-act="del">Obriši</button>
        </div>
        <details class="ev-box"><summary>Događaji</summary>
          <form class="form grid-form ev-form"><label>Igrač<select name="player" required>${playerOpts()}</select></label>
            <label>Događaj<select name="type">${Object.entries(EVENT_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
            <label>Minuta<input name="minute" type="number" min="0" max="200" value="${Math.min(200, Math.floor(matchElapsed(m) / 60) + 1)}"></label>
            <label>Asistencija<select name="assist">${playerOpts()}</select></label><button class="btn btn-sm" type="submit">Dodaj događaj</button>
          </form><ul class="ev-list" data-events></ul></details>
      </article>`).join('') : empty('Nema utakmica.')}</div>`;

  // Podrazumijevani datum: sljedeći sat
  const dt = body.querySelector('#new-match [name=at]');
  if (dt) dt.value = toLocalInput(new Date(Date.now() + 3600e3).toISOString());
  const away = body.querySelector('#new-match [name=away]'); if (away && teams[1]) away.selectedIndex = 1;
  body.querySelector('#new-match').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    if (f.get('home') === f.get('away')) { toast('Domaćin i gost moraju biti različite ekipe.', 'err'); return; }
    const { error } = await sb.from('matches').insert({ season_id: season.id, round: Number(f.get('round')), home_team_id: f.get('home'), away_team_id: f.get('away'), scheduled_at: fromLocalInput(f.get('at')), venue: String(f.get('venue') || '').trim() || null, periods: Number(f.get('periods')), period_minutes: Number(f.get('period_minutes')) });
    if (error) return toastErr(error); toast('Utakmica dodana.'); sectionMatches(ctx, body);
  });
  for (const card of body.querySelectorAll('.ma')) {
    const id = card.dataset.id; const m = matches.find((x) => x.id === id);
    const update = async (patch) => { const { error } = await sb.from('matches').update(patch).eq('id', id); if (error) return toastErr(error); sectionMatches(ctx, body); };
    const elapsed = () => Math.floor(matchElapsed(m));
    card.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      if (act === 'del') { if (!confirm('Obrisati utakmicu i sve njene događaje?')) return; const { error } = await sb.from('matches').delete().eq('id', id); return error ? toastErr(error) : sectionMatches(ctx, body); }
      if (act === 'start') return update({ status: 'live', clock_started_at: new Date().toISOString(), clock_seconds: m.status === 'scheduled' ? 0 : m.clock_seconds });
      if (act === 'pause') return update({ status: 'paused', clock_seconds: elapsed(), clock_started_at: null });
      if (act === 'next') return update({ current_period: m.current_period + 1, clock_seconds: 0, clock_started_at: null, status: 'paused' });
      if (act === 'finish') return update({ status: 'finished', clock_seconds: elapsed(), clock_started_at: null });
    }));
    const evList = card.querySelector('[data-events]');
    const loadEvents = async () => {
      const evs = await getEvents(id);
      evList.innerHTML = evs.length ? evs.map((ev) => `<li><span>${ev.minute}' ${esc(EVENT_TYPES[ev.type])} — ${esc(ev.player?.first_name || '')} ${esc(ev.player?.last_name || '')}${ev.assist ? ` (ast: ${esc(ev.assist.first_name)} ${esc(ev.assist.last_name)})` : ''}</span><button class="btn btn-xs btn-ghost" data-del="${esc(ev.id)}">✕</button></li>`).join('') : '<li class="muted">Nema događaja.</li>';
      evList.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { const { error } = await sb.from('match_events').delete().eq('id', b.dataset.del); if (error) return toastErr(error); sectionMatches(ctx, body); }));
    };
    loadEvents();
    card.querySelector('.ev-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = new FormData(e.target); const playerId = f.get('player'); const player = players.find((p) => p.id === playerId);
      if (!player) { toast('Odaberi igrača.', 'err'); return; }
      const { error } = await sb.from('match_events').insert({ match_id: id, team_id: player.team_id, player_id: player.id, assist_id: f.get('assist') || null, type: f.get('type'), minute: Number(f.get('minute')) || 0 });
      if (error) return toastErr(error); toast('Događaj dodan.'); sectionMatches(ctx, body);
    });
  }
}

/* ---------- Ekipe i igrači ---------- */
async function sectionTeams(ctx, body) {
  const season = await getActiveSeason(); const [teams, players] = await Promise.all([getTeams(), getPlayers()]);
  if (!ctx.current()) return;
  body.innerHTML = `<details class="card" open><summary><strong>Nova ekipa</strong></summary><form id="new-team" class="form grid-form"><label>Naziv<input name="name" required maxlength="40"></label><label>Skraćenica<input name="short_name" maxlength="4" placeholder="MED"></label><label>Boja<input name="color" type="color" value="#22c55e"></label><label>Logo (URL)<input name="logo_url" type="url"></label><label>Logo (fajl)<input name="logo_file" type="file" accept="image/*"></label><button class="btn btn-primary" type="submit" ${season ? '' : 'disabled'}>Dodaj ekipu</button></form></details>
    ${teams.map((t) => { const squad = players.filter((p) => p.team_id === t.id).sort((a, b) => (a.number ?? 99) - (b.number ?? 99)); return `<details class="card team-admin" data-team="${esc(t.id)}"><summary>${badge(t, 'sm')} <strong>${esc(t.name)}</strong> <span class="muted">· ${squad.length} igrača</span><button class="btn btn-xs btn-danger" data-del-team>Obriši ekipu</button></summary><ul class="roster-admin">${squad.map((p) => `<li><span>${p.number ?? '–'} ${esc(p.first_name)} ${esc(p.last_name)} <span class="muted">${esc(POS[p.position] || '')}${p.is_captain ? ' · kapiten' : ''}</span></span><button class="btn btn-xs btn-ghost" data-del-player="${esc(p.id)}">✕</button></li>`).join('')}</ul>
      <form class="form grid-form new-player"><label>Ime<input name="first_name" required maxlength="30"></label><label>Prezime<input name="last_name" required maxlength="30"></label><label>Broj<input name="number" type="number" min="0" max="99"></label><label>Pozicija<select name="position">${Object.entries(POS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label><label>Fotografija<input name="photo" type="file" accept="image/*"></label><label class="check"><input name="is_captain" type="checkbox"> Kapiten</label><button class="btn btn-sm" type="submit">Dodaj igrača</button></form></details>`; }).join('') || empty('Nema ekipa.')}`;
  body.querySelector('#new-team')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    let logo_url = String(f.get('logo_url') || '').trim() || null;
    const logoFile = f.get('logo_file');
    try {
      if (logoFile?.size) { if (!logoFile.type.startsWith('image/') || logoFile.size > 5 * 1024 * 1024) throw new Error('Logo mora biti slika do 5 MB.'); logo_url = await uploadMedia(logoFile, 'logos'); }
    } catch (err) { return toastErr(err); }
    const { error } = await sb.from('teams').insert({ season_id: season.id, name: String(f.get('name')).trim(), short_name: String(f.get('short_name') || '').trim() || null, color: safeColor(f.get('color')), logo_url });
    if (error) return toastErr(error); toast('Ekipa dodana.'); sectionTeams(ctx, body);
  });
  body.querySelectorAll('[data-del-team]').forEach((b) => b.addEventListener('click', async (e) => {
    e.preventDefault(); if (!confirm('Obrisati ekipu i sve njene igrače i utakmice?')) return;
    const id = b.closest('[data-team]').dataset.team; const { error } = await sb.from('teams').delete().eq('id', id); return error ? toastErr(error) : sectionTeams(ctx, body);
  }));
  body.querySelectorAll('[data-del-player]').forEach((b) => b.addEventListener('click', async () => { const { error } = await sb.from('players').delete().eq('id', b.dataset.delPlayer); return error ? toastErr(error) : sectionTeams(ctx, body); }));
  body.querySelectorAll('.new-player').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(form); const teamId = form.closest('[data-team]').dataset.team; const num = f.get('number');
    let photo_url = null;
    const photoFile = f.get('photo');
    try {
      if (photoFile?.size) { if (!photoFile.type.startsWith('image/') || photoFile.size > 5 * 1024 * 1024) throw new Error('Fotografija mora biti slika do 5 MB.'); photo_url = await uploadMedia(photoFile, 'players'); }
    } catch (err) { return toastErr(err); }
    const { error } = await sb.from('players').insert({ team_id: teamId, first_name: String(f.get('first_name')).trim(), last_name: String(f.get('last_name')).trim(), number: num === '' ? null : Number(num), position: f.get('position') || null, is_captain: f.get('is_captain') === 'on', photo_url });
    if (error) return toastErr(error); toast('Igrač dodan.'); sectionTeams(ctx, body);
  }));
}

/* ---------- Sezone ---------- */
async function sectionSeasons(ctx, body) {
  const seasons = await getSeasons(); if (!ctx.current()) return;
  body.innerHTML = `<form id="new-season" class="card form grid-form"><label>Naziv sezone<input name="name" required placeholder="2026/27" maxlength="30"></label><button class="btn btn-primary" type="submit">Dodaj sezonu</button></form><div class="card"><ul class="plain">${seasons.map((s) => `<li><strong>${esc(s.name)}</strong> ${s.is_active ? '<span class="pill pill-live">aktivna</span>' : `<button class="btn btn-xs" data-activate="${s.id}">Aktiviraj</button>`}</li>`).join('') || '<li class="muted">Nema sezona.</li>'}</ul><p class="muted small">Samo jedna sezona može biti aktivna. Tabela i utakmice prikazuju aktivnu sezonu.</p></div>`;
  body.querySelector('#new-season').addEventListener('submit', async (e) => { e.preventDefault(); const { error } = await sb.from('seasons').insert({ name: String(new FormData(e.target).get('name')).trim(), is_active: false }); if (error) return toastErr(error); toast('Sezona dodana.'); sectionSeasons(ctx, body); });
  body.querySelectorAll('[data-activate]').forEach((b) => b.addEventListener('click', async () => {
    const { error: e1 } = await sb.from('seasons').update({ is_active: false }).eq('is_active', true); if (e1) return toastErr(e1);
    const { error: e2 } = await sb.from('seasons').update({ is_active: true }).eq('id', b.dataset.activate); if (e2) return toastErr(e2);
    toast('Aktivna sezona promijenjena.'); sectionSeasons(ctx, body);
  }));
}

/* ---------- Vijesti ---------- */
async function sectionNews(ctx, body) {
  const news = await getAllNews(); if (!ctx.current()) return;
  const draw = (n = {}) => `<form id="news-form" class="card form" data-id="${esc(n.id || '')}"><h3>${n.id ? 'Izmijeni vijest' : 'Nova vijest'}</h3><label>Naslov<input name="title" required maxlength="160" value="${esc(n.title || '')}"></label><label>Kratki opis<input name="excerpt" maxlength="240" value="${esc(n.excerpt || '')}"></label><label>Tekst<textarea name="body" rows="8" required>${esc(n.body || '')}</textarea></label><label>Naslovna slika (URL)<input name="cover_url" type="url" value="${esc(n.cover_url || '')}"></label><label class="check"><input name="published" type="checkbox" ${n.published ? 'checked' : ''}> Objavi odmah</label><div class="row-gap"><button class="btn btn-primary" type="submit">Sačuvaj</button>${n.id ? '<button class="btn btn-ghost" type="button" id="news-new">Nova vijest</button>' : ''}</div></form>`;
  body.innerHTML = `<div class="two-col-admin"><div>${draw()}</div><div class="card"><h3>Sve vijesti</h3><ul class="plain">${news.map((n) => `<li><button class="link" data-edit="${esc(n.id)}">${esc(n.title)}</button><span class="pill ${n.published ? 'pill-finished' : ''}">${n.published ? 'objavljena' : 'skica'}</span></li>`).join('') || '<li class="muted">Nema vijesti.</li>'}</ul></div></div>`;
  const bindForm = () => {
    body.querySelector('#news-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = new FormData(e.target); const id = e.target.dataset.id; const published = f.get('published') === 'on';
      const row = { title: String(f.get('title')).trim(), excerpt: String(f.get('excerpt') || '').trim() || null, body: String(f.get('body')), cover_url: String(f.get('cover_url') || '').trim() || null, published, updated_at: new Date().toISOString() };
      let error;
      if (id) ({ error } = await sb.from('news').update(row).eq('id', id));
      else { row.slug = `${slugify(row.title)}-${Date.now().toString(36)}`; row.author_id = state.session.user.id; if (published) row.published_at = new Date().toISOString(); ({ error } = await sb.from('news').insert(row)); }
      if (error) return toastErr(error); toast('Vijest sačuvana.'); sectionNews(ctx, body);
    });
    body.querySelector('#news-new')?.addEventListener('click', () => sectionNews(ctx, body));
  };
  bindForm();
  body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => { const n = news.find((x) => x.id === b.dataset.edit); body.querySelector('#news-form').outerHTML = draw(n); bindForm(); }));
}

/* ---------- Galerija ---------- */
async function sectionGallery(ctx, body) {
  const items = await getGallery(); if (!ctx.current()) return;
  body.innerHTML = `<form id="gal-form" class="card form grid-form"><label>Link do slike ili videa<input name="media_url" type="url" required></label><label>Tip<select name="media_type"><option value="image">Slika</option><option value="video">Video</option></select></label><label>Naslov<input name="title" maxlength="80"></label><button class="btn btn-primary" type="submit">Dodaj</button></form><div class="gallery admin-gallery">${items.map((g) => `<figure>${g.media_type === 'video' ? `<video src="${esc(g.media_url)}" muted></video>` : `<img src="${esc(g.media_url)}" alt="" loading="lazy">`}<button class="btn btn-xs btn-danger" data-gdel="${esc(g.id)}">Obriši</button></figure>`).join('') || empty('Galerija je prazna.')}</div>`;
  body.querySelector('#gal-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    const { error } = await sb.from('gallery').insert({ media_url: String(f.get('media_url')).trim(), media_type: f.get('media_type'), title: String(f.get('title') || '').trim() || null, uploaded_by: state.session.user.id });
    if (error) return toastErr(error); toast('Dodano u galeriju.'); sectionGallery(ctx, body);
  });
  body.querySelectorAll('[data-gdel]').forEach((b) => b.addEventListener('click', async () => { if (!confirm('Obrisati stavku iz galerije?')) return; const { error } = await sb.from('gallery').delete().eq('id', b.dataset.gdel); return error ? toastErr(error) : sectionGallery(ctx, body); }));
}

/* ---------- Korisnici i uloge ---------- */
async function sectionUsers(ctx, body) {
  const { data, error } = await sb.from('profiles').select('id,username,role,created_at').order('created_at', { ascending: false }).limit(200);
  if (error) throw error; if (!ctx.current()) return;
  body.innerHTML = `<div class="card"><p class="muted small">Uloge: <strong>user</strong> (običan), <strong>editor</strong> (vijesti i galerija), <strong>admin</strong> (sve). Ne možeš promijeniti sopstvenu ulogu.</p><div class="table-wrap"><table><thead><tr><th class="left">Korisnik</th><th>Uloga</th></tr></thead><tbody>${data.map((u) => `<tr><td class="left">@${esc(u.username)}${u.id === state.session.user.id ? ' <span class="muted">(ti)</span>' : ''}</td><td><select data-role="${esc(u.id)}" ${u.id === state.session.user.id || !isAdmin() ? 'disabled' : ''}>${['user', 'editor', 'admin'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div></div>`;
  body.querySelectorAll('[data-role]').forEach((sel) => sel.addEventListener('change', async () => { const { error: e2 } = await sb.from('profiles').update({ role: sel.value }).eq('id', sel.dataset.role); if (e2) { toastErr(e2); return; } toast('Uloga promijenjena.'); }));
}
