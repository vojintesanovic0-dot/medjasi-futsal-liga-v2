import { sb } from '../supabase.js';
import { state } from '../state.js';
import { getActiveSeason } from '../api.js';
import { esc, toast, errMsg, empty, toLocalInput } from '../util.js';

/* ---------- Generator kola: kružni raspored svako sa svakim ---------- */
export function roundRobin(ids) {
  const arr = [...ids];
  if (arr.length % 2) arr.push(null);
  const n = arr.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop());
  }
  return rounds;
}

export function buildFixtures(ids, start, gapDays, double, venue, seasonId) {
  const first = roundRobin(ids);
  const all = [...first];
  if (double) first.forEach((pairs) => all.push(pairs.map(([home, away]) => [away, home])));
  const rows = [];
  all.forEach((pairs, idx) => pairs.forEach(([home, away]) => rows.push({
    season_id: seasonId,
    round: idx + 1,
    home_team_id: home,
    away_team_id: away,
    scheduled_at: new Date(start.getTime() + idx * gapDays * 86400000).toISOString(),
    venue: venue || null,
  })));
  return rows;
}

export async function sectionGenerator(ctx, body) {
  const season = await getActiveSeason();
  if (!ctx.current()) return;
  if (!season) { body.innerHTML = empty('Prvo aktiviraj sezonu.'); return; }
  const { data: teams, error: teamsError } = await sb.from('teams')
    .select('id,name,season_id').eq('season_id', season.id).order('name');
  if (teamsError) { body.innerHTML = `<div class="card error">${esc(errMsg(teamsError))}</div>`; return; }
  if ((teams || []).length < 2) { body.innerHTML = empty('Dodaj bar dvije ekipe u aktivnoj sezoni prije generisanja.'); return; }

  body.innerHTML = `<div class="card form narrow">
    <h3>Generator kola (${esc(season.name)})</h3>
    <p class="muted small">Pravi raspored svako sa svakim. Prvo klikni Pregled, zatim Sačuvaj.
      Sve utakmice jednog kola počinju u istom terminu.</p>
    <label>Prvo kolo (datum i sat)<input type="datetime-local" name="start" required></label>
    <label>Razmak između kola (dana)<input type="number" name="gap" min="1" max="60" value="7" required></label>
    <label>Dvostruki krug<select name="double"><option value="0">Ne</option><option value="1">Da (svako s svakim dva puta)</option></select></label>
    <label>Mjesto (opciono)<input name="venue" maxlength="80"></label>
    <div class="row-gap"><button class="btn" type="button" id="gen-preview">Pregled</button>
      <button class="btn btn-primary" type="button" id="gen-save" disabled>Sačuvaj raspored</button></div>
    <div id="gen-out"></div>
  </div>`;

  const form = body.querySelector('.form');
  form.elements.start.value = toLocalInput(new Date(Date.now() + 7 * 86400000).toISOString());
  let pending = null;
  const names = Object.fromEntries(teams.map((t) => [t.id, t.name]));

  body.querySelector('#gen-preview').addEventListener('click', () => {
    const start = form.elements.start.value ? new Date(form.elements.start.value) : null;
    const gap = Number(form.elements.gap.value);
    if (!start || Number.isNaN(start.getTime())) { toast('Unesi datum i sat prvog kola.', 'err'); return; }
    if (!Number.isInteger(gap) || gap < 1 || gap > 60) { toast('Razmak mora biti od 1 do 60 dana.', 'err'); return; }
    pending = buildFixtures(teams.map((t) => t.id), start, gap, form.elements.double.value === '1', form.elements.venue.value.trim(), season.id);
    const byRound = {};
    pending.forEach((row) => { (byRound[row.round] ||= []).push(row); });
    body.querySelector('#gen-out').innerHTML = `<p><strong>${pending.length}</strong> utakmica u ${Object.keys(byRound).length} kola.</p>
      <ol class="plain">${Object.entries(byRound).slice(0, 12).map(([round, rows]) => `<li><strong>${round}. kolo</strong> · ${esc(new Date(rows[0].scheduled_at).toLocaleString('bs-BA'))}<br>
        <span class="muted small">${rows.map((r) => `${esc(names[r.home_team_id])} – ${esc(names[r.away_team_id])}`).join(' · ')}</span></li>`).join('')}</ol>
      ${Object.keys(byRound).length > 12 ? '<p class="muted small">Prikazano je prvih 12 kola.</p>' : ''}`;
    body.querySelector('#gen-save').disabled = !pending.length;
  });

  body.querySelector('#gen-save').addEventListener('click', async (e) => {
    if (!pending?.length) return;
    const { count, error: countError } = await sb.from('matches').select('id', { count: 'exact', head: true }).eq('season_id', season.id);
    if (countError) { toast(errMsg(countError), 'err'); return; }
    if (count && !confirm(`U sezoni već ima ${count} utakmica. Dodati ${pending.length} novih utakmica?`)) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const { error } = await sb.from('matches').insert(pending);
      if (error) throw error;
      toast(`Sačuvano: ${pending.length} utakmica.`);
      await sectionGenerator(ctx, body);
    } catch (err) {
      toast(errMsg(err), 'err');
      if (btn.isConnected) btn.disabled = false;
    }
  });
}

/* ---------- Istorija izmjena ---------- */
function summary(row) {
  const next = row.new_data || {};
  const prev = row.old_data || {};
  if (row.table_name === 'matches' && row.action === 'UPDATE')
    return `rezultat ${prev.home_score}:${prev.away_score} → ${next.home_score}:${next.away_score}, status ${prev.status} → ${next.status}`;
  if (row.table_name === 'profiles') return `uloga ${prev.role ?? '–'} → ${next.role ?? '–'} (${next.username ?? ''})`;
  if (row.table_name === 'match_events') return `${next.type || prev.type} u ${next.minute ?? prev.minute ?? '–'}'`;
  return String(next.title || next.name || next.status || '').slice(0, 100);
}

export async function sectionAudit(ctx, body) {
  const { data, error } = await sb.from('admin_audit').select('*, actor:profiles(username)')
    .order('created_at', { ascending: false }).limit(200);
  if (!ctx.current()) return;
  if (error) { body.innerHTML = `<div class="card error">${esc(errMsg(error))}</div>`; return; }
  body.innerHTML = `<div class="card"><h3>Istorija izmjena (zadnjih 200)</h3>
    <div class="table-wrap"><table><thead><tr><th class="left">Kada</th><th class="left">Ko</th><th>Tabela</th><th>Radnja</th><th class="left">Detalji</th></tr></thead><tbody>
    ${(data || []).map((row) => `<tr><td class="left">${esc(new Date(row.created_at).toLocaleString('bs-BA'))}</td>
      <td class="left">${esc(row.actor?.username || 'sistem')}</td><td>${esc(row.table_name)}</td><td>${esc(row.action)}</td>
      <td class="left small">${esc(summary(row))}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nema zapisa.</td></tr>'}
    </tbody></table></div></div>`;
}

/* ---------- Prijave sadržaja ---------- */
export async function sectionReports(ctx, body) {
  const { data: reports, error } = await sb.from('reports')
    .select('*, reporter:profiles!reports_reporter_id_fkey(username)')
    .eq('status', 'open').order('created_at');
  if (!ctx.current()) return;
  if (error) { body.innerHTML = `<div class="card error">${esc(errMsg(error))}</div>`; return; }

  const postIds = (reports || []).filter((r) => r.target_type === 'post').map((r) => r.target_id);
  const commentIds = (reports || []).filter((r) => r.target_type === 'comment').map((r) => r.target_id);
  const [postsRes, commentsRes] = await Promise.all([
    postIds.length ? sb.from('post_feed').select('id,content,username,user_id').in('id', postIds) : Promise.resolve({ data: [], error: null }),
    commentIds.length ? sb.from('post_comments').select('id,content,username,user_id').in('id', commentIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (postsRes.error || commentsRes.error) {
    body.innerHTML = `<div class="card error">${esc(errMsg(postsRes.error || commentsRes.error))}</div>`;
    return;
  }
  const posts = postsRes.data || [], comments = commentsRes.data || [];
  const targetFor = (report) => (report.target_type === 'post' ? posts : comments).find((row) => row.id === report.target_id);

  body.innerHTML = `<div class="card"><h3>Otvorene prijave (${reports?.length || 0})</h3>
    ${(reports || []).length ? reports.map((report) => {
      const target = targetFor(report);
      return `<article class="report card" data-report-card="${esc(report.id)}">
        <p class="small muted">${report.target_type === 'post' ? 'Objava' : 'Komentar'} · prijavio/la: @${esc(report.reporter?.username || '?')} · ${esc(new Date(report.created_at).toLocaleString('bs-BA'))}</p>
        <p><strong>Razlog:</strong> ${esc(report.reason)}</p>
        <blockquote class="small">${target ? `<strong>@${esc(target.username)}:</strong> ${esc(target.content)}` : '<em>Sadržaj je već obrisan.</em>'}</blockquote>
        <div class="row-gap">
          ${target ? `<button class="btn btn-sm btn-danger" data-act="delete" data-type="${report.target_type}" data-id="${esc(report.target_id)}" data-user="${esc(target.user_id)}">Obriši sadržaj</button>
          <button class="btn btn-sm" data-act="warn" data-user="${esc(target.user_id)}">Upozori korisnika</button>` : ''}
          <button class="btn btn-sm btn-ghost" data-act="dismiss">Odbaci</button>
          <button class="btn btn-sm btn-ghost" data-act="resolve">Riješeno</button>
        </div></article>`;
    }).join('') : empty('Nema otvorenih prijava.')}
  </div>`;

  body.onclick = async (event) => {
    const button = event.target.closest('[data-act]');
    if (!button) return;
    const card = button.closest('[data-report-card]');
    if (!card) return;
    const reportId = reports.find((r) => r.id === card.dataset.reportCard)?.id;
    if (!reportId) return;
    const action = button.dataset.act;
    button.disabled = true;
    try {
      if (action === 'delete') {
        if (!confirm('Trajno obrisati sadržaj?')) return;
        const table = button.dataset.type === 'post' ? 'posts' : 'post_comments';
        const { error: deleteError } = await sb.from(table).delete().eq('id', button.dataset.id);
        if (deleteError) throw deleteError;
        const { error: statusError } = await sb.from('reports').update({ status: 'resolved' }).eq('id', reportId);
        if (statusError) throw statusError;
      } else if (action === 'warn') {
        const message = prompt('Poruka upozorenja korisniku (vidjeće je na svom profilu):');
        if (!message || message.trim().length < 3) return;
        const { error: warningError } = await sb.from('user_warnings').insert({
          user_id: button.dataset.user, message: message.trim().slice(0, 500), created_by: state.session?.user?.id ?? null,
        });
        if (warningError) throw warningError;
        toast('Upozorenje poslano.');
        return;
      } else {
        const status = action === 'dismiss' ? 'dismissed' : 'resolved';
        const { error: updateError } = await sb.from('reports').update({ status }).eq('id', reportId);
        if (updateError) throw updateError;
      }
      toast('Gotovo.');
      await sectionReports(ctx, body);
    } catch (err) {
      toast(errMsg(err), 'err');
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  };
}
