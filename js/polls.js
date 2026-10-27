import { getActivePolls, getPollResults, getMyPollVotes, castPollVote } from './api.js';
import { esc, toast, errMsg } from './util.js';

export async function mountPolls(root, uid) {
  if (!root) return;
  const polls = await getActivePolls();
  if (!polls.length) { root.innerHTML = ''; return; }
  let results = [], mine = [];
  const load = async () => {
    [results, mine] = await Promise.all([
      getPollResults(polls.map((p) => p.id)),
      uid ? getMyPollVotes(uid) : Promise.resolve([]),
    ]);
  };
  const isOpen = (p) => !p.closes_at || new Date(p.closes_at) > new Date();
  const draw = () => {
    root.innerHTML = polls.map((p) => {
      const opts = [...(p.options || [])].sort((a, b) => a.position - b.position);
      const counts = new Map(results.filter((r) => r.poll_id === p.id).map((r) => [r.option_id, Number(r.votes)]));
      const total = opts.reduce((sum, o) => sum + (counts.get(o.id) || 0), 0);
      const myChoice = mine.find((v) => v.poll_id === p.id)?.option_id;
      const open = isOpen(p);
      return `<article class="card poll" data-poll="${esc(p.id)}"><h3>${esc(p.question)}</h3>
        <p class="muted small">${total} ${total === 1 ? 'glas' : 'glasova'}${open ? '' : ' · anketa je zatvorena'}${p.closes_at && open ? ` · do ${esc(new Date(p.closes_at).toLocaleString('bs-BA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}` : ''}</p>
        <ul class="poll-options">${opts.map((o) => {
          const n = counts.get(o.id) || 0, pct = total ? Math.round((n / total) * 100) : 0, chosen = myChoice === o.id;
          const btn = open && uid ? `<button class="poll-btn" type="button" data-vote="${esc(o.id)}" aria-pressed="${chosen}">${esc(o.label)}</button>` : `<span class="poll-label">${esc(o.label)}</span>`;
          return `<li class="${chosen ? 'chosen' : ''}">${btn}<span class="poll-bar" style="--pct:${pct}%"></span><span class="poll-pct">${pct}% (${n})</span></li>`;
        }).join('')}</ul>
        ${!uid ? '<p class="muted small"><a href="#/prijava">Prijavi se</a> da glasaš.</p>' : ''}
        ${uid && open && myChoice ? '<p class="muted small">Tvoj glas je zabilježen. Možeš ga promijeniti klikom na drugu opciju.</p>' : ''}
      </article>`;
    }).join('');
  };
  await load(); draw();
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-vote]');
    if (!btn || !uid) return;
    const pollId = btn.closest('[data-poll]').dataset.poll;
    btn.disabled = true;
    try {
      await castPollVote(pollId, btn.dataset.vote);
      await load(); draw(); toast('Glas je zabilježen.');
    } catch (error) { toast(errMsg(error), 'err'); btn.disabled = false; }
  });
}
