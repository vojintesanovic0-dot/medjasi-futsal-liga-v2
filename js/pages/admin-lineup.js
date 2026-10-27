import { sb } from '../supabase.js';
import { getMatchPlayers, getSubstitutions, getMatchPlayerStats } from '../api.js';
import { esc, toast, errMsg } from '../util.js';

const MAX_STARTERS = 5;
export async function bindLineup(slot, match, players, refresh) {
  if (!slot) return;
  slot.innerHTML = '<p class="muted small">Učitavam sastav…</p>';
  let mp, subs, stats;
  try { [mp, subs, stats] = await Promise.all([getMatchPlayers(match.id), getSubstitutions(match.id), getMatchPlayerStats(match.id)]); }
  catch (e) { slot.innerHTML = '<p class="muted small">Sastav nije dostupan: ' + esc(errMsg(e)) + '</p>'; return; }
  const homeId = match.home_team_id, awayId = match.away_team_id;
  const teamNames = { [homeId]: match.home?.name || 'Domaćin', [awayId]: match.away?.name || 'Gost' };
  const teamPlayers = (id) => players.filter((p) => p.team_id === id).sort((a,b) => (a.number ?? 999)-(b.number ?? 999));
  const oldRole = (id) => mp.find((r) => r.player_id === id);
  const oldStat = (id) => stats.find((r) => r.player_id === id);
  const table = (teamId) => '<div class="lu-team" data-team="' + esc(teamId) + '"><h4>' + esc(teamNames[teamId]) + '</h4><table class="lu-table"><thead><tr><th>#</th><th>Igrač</th><th>Uloga</th><th>Ocjena</th><th>Odbrane</th></tr></thead><tbody>' +
    teamPlayers(teamId).map((p) => {
      const role = oldRole(p.id), stat = oldStat(p.id), selected = role ? (role.is_starter ? 'start' : 'bench') : '';
      return '<tr data-player="' + esc(p.id) + '"><td>' + (p.number ?? '–') + '</td><td>' + esc(p.first_name) + ' ' + esc(p.last_name) + '</td><td><select data-role>' +
        '<option value="" ' + (selected === '' ? 'selected' : '') + '>—</option><option value="start" ' + (selected === 'start' ? 'selected' : '') + '>Start</option><option value="bench" ' + (selected === 'bench' ? 'selected' : '') + '>Klupa</option></select></td>' +
        '<td><input class="lu-num" data-rating type="number" min="1" max="10" step=".1" value="' + (stat?.rating ?? '') + '"></td><td><input class="lu-num" data-saves type="number" min="0" max="99" step="1" value="' + (stat?.saves ?? 0) + '"></td></tr>';
    }).join('') + '</tbody></table></div>';
  const substitutions = subs.map((s) => '<li><span>' + s.minute + '\' ' + esc(teamNames[s.team_id]) + ': ↓ ' + esc(s.out?.first_name) + ' ' + esc(s.out?.last_name) + ' → ↑ ' + esc(s.in?.first_name) + ' ' + esc(s.in?.last_name) + '</span> <button type="button" class="btn btn-xs btn-ghost" data-del-sub="' + esc(s.id) + '">Obriši</button></li>').join('');
  slot.innerHTML = '<details class="ev-box lu-box"><summary>Sastav, ocjene i zamjene</summary><form class="lu-form"><div class="lu-teams">' + table(homeId) + table(awayId) + '</div>' +
    '<p class="muted small">Najviše ' + MAX_STARTERS + ' startera po ekipi. Ocjena 1–10; odbrane su broj odbrana golmana.</p><button class="btn btn-primary btn-sm" type="submit">Spremi sastav i ocjene</button></form>' +
    '<h4>Zamjene</h4><ul class="ev-list">' + (substitutions || '<li class="muted small">Još nema zamjena.</li>') + '</ul>' +
    '<form class="form grid-form lu-sub-form"><label>Ekipa<select name="team"><option value="' + esc(homeId) + '">' + esc(teamNames[homeId]) + '</option><option value="' + esc(awayId) + '">' + esc(teamNames[awayId]) + '</option></select></label>' +
    '<label>Minuta<input name="minute" type="number" min="0" max="200" value="0" required></label><label>Izlazi (start)<select name="out" required></select></label><label>Ulazi (klupa)<select name="in" required></select></label><button class="btn btn-sm" type="submit">Dodaj zamjenu</button></form></details>';
  const subForm = slot.querySelector('.lu-sub-form');
  const fillSubs = () => {
    const teamId = subForm.elements.team.value, rows = mp.filter((r) => r.team_id === teamId);
    const label = (r) => (r.player?.number ?? '–') + ' ' + (r.player?.first_name || '') + ' ' + (r.player?.last_name || '');
    subForm.elements.out.innerHTML = rows.filter((r) => r.is_starter).map((r) => '<option value="' + esc(r.player_id) + '">' + esc(label(r)) + '</option>').join('') || '<option value="">Nema startera</option>';
    subForm.elements.in.innerHTML = rows.filter((r) => !r.is_starter).map((r) => '<option value="' + esc(r.player_id) + '">' + esc(label(r)) + '</option>').join('') || '<option value="">Nema igrača na klupi</option>';
  };
  fillSubs(); subForm.elements.team.addEventListener('change', fillSubs);
  slot.querySelector('.lu-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const picked = [...slot.querySelectorAll('tr[data-player]')].map((tr) => {
      const ratingText = tr.querySelector('[data-rating]').value, savesText = tr.querySelector('[data-saves]').value;
      return { player_id: tr.dataset.player, team_id: tr.closest('.lu-team').dataset.team, role: tr.querySelector('[data-role]').value,
        rating: ratingText === '' ? null : Number(ratingText), saves: savesText === '' ? 0 : Number(savesText) };
    });
    for (const id of [homeId, awayId]) {
      if (picked.filter((p) => p.team_id === id && p.role === 'start').length > MAX_STARTERS) return toast('Najviše je 5 startera po ekipi.', 'err');
      if (picked.some((p) => p.team_id === id && p.rating !== null && (!Number.isFinite(p.rating) || p.rating < 1 || p.rating > 10))) return toast('Ocjena mora biti između 1 i 10.', 'err');
      if (picked.some((p) => p.team_id === id && (!Number.isInteger(p.saves) || p.saves < 0 || p.saves > 99))) return toast('Odbrane moraju biti cijeli broj od 0 do 99.', 'err');
    }
    const lineup = picked.filter((p) => p.role), lineupIds = new Set(lineup.map((p) => p.player_id));
    const starters = new Set(lineup.filter((p) => p.role === 'start').map((p) => p.player_id));
    const bench = new Set(lineup.filter((p) => p.role === 'bench').map((p) => p.player_id));
    const broken = subs.filter((s) => !starters.has(s.player_out_id) || !bench.has(s.player_in_id));
    if (broken.length && !confirm(broken.length + ' zamjena ne odgovara novom sastavu i biće obrisana. Nastaviti?')) return;
    try {
      if (broken.length) { const { error } = await sb.from('match_substitutions').delete().in('id', broken.map((s) => s.id)); if (error) throw error; }
      const removed = mp.map((r) => r.player_id).filter((id) => !lineupIds.has(id));
      if (removed.length) { const { error } = await sb.from('match_players').delete().eq('match_id', match.id).in('player_id', removed); if (error) throw error; }
      if (lineup.length) { const { error } = await sb.from('match_players').upsert(lineup.map((p) => ({ match_id: match.id, player_id: p.player_id, team_id: p.team_id, is_starter: p.role === 'start' })), { onConflict: 'match_id,player_id' }); if (error) throw error; }
      const withStats = picked.filter((p) => p.role && (p.rating !== null || p.saves > 0)), noStats = picked.filter((p) => !p.role || (p.rating === null && p.saves === 0)).map((p) => p.player_id);
      if (noStats.length) { const { error } = await sb.from('match_player_stats').delete().eq('match_id', match.id).in('player_id', noStats); if (error) throw error; }
      if (withStats.length) { const { error } = await sb.from('match_player_stats').upsert(withStats.map((p) => ({ match_id: match.id, player_id: p.player_id, team_id: p.team_id, rating: p.rating, saves: p.saves })), { onConflict: 'match_id,player_id' }); if (error) throw error; }
      toast('Sastav i ocjene su snimljeni.'); refresh();
    } catch (err) { toast(errMsg(err), 'err'); }
  });
  subForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget, out = f.elements.out.value, incoming = f.elements.in.value;
    if (!out || !incoming) return toast('Odaberi igrača koji izlazi i ulazi.', 'err');
    if (out === incoming) return toast('Isti igrač ne može izaći i ući.', 'err');
    const { error } = await sb.from('match_substitutions').insert({ match_id: match.id, team_id: f.elements.team.value, player_out_id: out, player_in_id: incoming, minute: Math.max(0, Math.min(200, Number(f.elements.minute.value) || 0)) });
    if (error) return toast(errMsg(error), 'err');
    toast('Zamjena dodana.'); refresh();
  });
  slot.querySelectorAll('[data-del-sub]').forEach((btn) => btn.addEventListener('click', async () => {
    const { error } = await sb.from('match_substitutions').delete().eq('id', btn.dataset.delSub);
    if (error) return toast(errMsg(error), 'err');
    refresh();
  }));
}
