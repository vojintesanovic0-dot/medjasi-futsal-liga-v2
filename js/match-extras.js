// MVP glasanje i razgovor vezan za jednu utakmicu.
import { sb } from './supabase.js';
import { state } from './state.js';
import { esc, toast, errMsg } from './util.js';
import { onLeave, render } from './router.js';

const timeOf = (iso) => new Date(iso).toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit' });
const rowHtml = (comment) => `<div class="comment" data-id="${esc(comment.id)}"><strong>${esc(comment.username)}</strong>
  <span class="muted small">${timeOf(comment.created_at)}</span><p>${esc(comment.content)}</p></div>`;

export async function loadMatchExtras(match) {
  const uid = state.session?.user?.id;
  const finished = match.status === 'finished';
  const [votesRes, mineRes, chatRes, playersRes] = await Promise.all([
    finished ? sb.from('mvp_results').select('player_id,votes').eq('match_id', match.id).order('votes', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    finished && uid ? sb.from('mvp_votes').select('player_id').eq('match_id', match.id).eq('user_id', uid).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb.from('match_comments').select('*').eq('match_id', match.id).order('created_at').limit(100),
    sb.from('players').select('id,first_name,last_name,number,team_id')
      .in('team_id', [match.home_team_id, match.away_team_id]).order('number'),
  ]);
  const error = votesRes.error || mineRes.error || chatRes.error || playersRes.error;
  if (error) throw error;

  const votes = votesRes.data || [];
  const mine = mineRes.data;
  const chat = chatRes.data || [];
  const players = playersRes.data || [];
  const playerName = (p) => `${esc(p.first_name)} ${esc(p.last_name)}${p.number != null ? ` (${p.number})` : ''}`;
  const teamShort = (id) => esc(id === match.home_team_id
    ? (match.home?.short_name || match.home?.name || 'Domaćin')
    : (match.away?.short_name || match.away?.name || 'Gost'));

  const top = votes.slice(0, 3).map((vote) => {
    const player = players.find((p) => p.id === vote.player_id);
    return player ? `<li>${playerName(player)} <strong>${vote.votes}</strong> glas(ova)</li>` : '';
  }).join('');

  const mvpHtml = finished ? `<section class="block"><h2>MVP utakmice</h2>
    ${uid ? `<form id="mvp-form" class="mvp-form">
      <select name="player" required><option value="">Izaberi igrača</option>
        ${players.map((p) => `<option value="${esc(p.id)}" ${mine?.player_id === p.id ? 'selected' : ''}>${playerName(p)} · ${teamShort(p.team_id)}</option>`).join('')}
      </select>
      <button class="btn btn-primary btn-sm" type="submit">${mine ? 'Promijeni glas' : 'Glasaj'}</button>
    </form>` : '<p class="muted small"><a href="#/prijava">Prijavi se</a> da glasaš.</p>'}
    ${top ? `<ol class="plain mvp-list">${top}</ol>` : '<p class="muted small">Još nema glasova.</p>'}
  </section>` : '';

  const chatHtml = `<section class="block"><h2>Razgovor o utakmici</h2>
    <div class="card match-chat" id="mc-list">${chat.map(rowHtml).join('') || '<p class="muted small" id="mc-empty">Budi prvi koji piše o ovoj utakmici.</p>'}</div>
    ${uid ? `<form id="mc-form" class="comment-form"><input name="c" maxlength="400" required placeholder="Napiši o utakmici…" autocomplete="off">
      <button class="btn btn-sm btn-primary" type="submit">Pošalji</button></form>` : '<p class="muted small"><a href="#/prijava">Prijavi se</a> da učestvuješ u razgovoru.</p>'}
  </section>`;

  return { html: mvpHtml + chatHtml };
}

export function mountMatchExtras(app, match) {
  const uid = state.session?.user?.id;
  app.querySelector('#mvp-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const player = form.elements.player.value;
    if (!player || !uid) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const { error } = await sb.from('mvp_votes').upsert(
        { match_id: match.id, user_id: uid, player_id: player, created_at: new Date().toISOString() },
        { onConflict: 'match_id,user_id' });
      if (error) throw error;
      toast('Glas sačuvan.');
      await render({ keepScroll: true });
    } catch (error) {
      toast(errMsg(error), 'err');
      if (button.isConnected) button.disabled = false;
    }
  });

  const list = app.querySelector('#mc-list');
  const addRow = (comment) => {
    if (!list || list.querySelector(`[data-id="${comment.id}"]`)) return;
    list.querySelector('#mc-empty')?.remove();
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    list.insertAdjacentHTML('beforeend', rowHtml(comment));
    if (nearBottom) list.scrollTop = list.scrollHeight;
  };
  if (list) list.scrollTop = list.scrollHeight;

  const form = app.querySelector('#mc-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = form.elements.c.value.trim();
    if (!content || !uid) return;
    const button = form.querySelector('button[type="submit"]');
    form.elements.c.disabled = true;
    button.disabled = true;
    try {
      const { data, error } = await sb.from('match_comments')
        .insert({ match_id: match.id, user_id: uid, username: 'korisnik', content }).select().single();
      if (error) throw error;
      form.elements.c.value = '';
      addRow(data);
    } catch (error) {
      toast(errMsg(error), 'err');
    } finally {
      form.elements.c.disabled = false;
      button.disabled = false;
    }
  });

  const channel = sb.channel(`match-chat-${match.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_comments', filter: `match_id=eq.${match.id}` },
      (payload) => addRow(payload.new))
    .subscribe();
  onLeave(() => sb.removeChannel(channel));
}
