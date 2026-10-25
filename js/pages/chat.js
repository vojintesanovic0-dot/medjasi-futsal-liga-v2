import { sb } from '../supabase.js';
import { state } from '../state.js';
import { esc, toast, errMsg, empty } from '../util.js';
import { onLeave } from '../router.js';

const fmt = (iso) => new Date(iso).toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit' });
function row(m) {
  const mine = state.session?.user?.id === m.user_id;
  return `<div class="msg${mine ? ' mine' : ''}" data-id="${esc(m.id)}"><div class="msg-head"><strong>${esc(m.username)}</strong><time>${fmt(m.created_at)}</time></div><p>${esc(m.content)}</p></div>`;
}
export function registerChat(route) {
  route('/chat', async (ctx) => {
    const { data, error } = await sb.from('messages').select('*').order('created_at', { ascending: false }).limit(60);
    if (error) throw error;
    if (!ctx.current()) return;
    const msgs = (data || []).reverse();
    const canWrite = !!state.session;
    ctx.app.innerHTML = `<div class="page-head"><h1>Chat</h1><p class="muted">Razgovor navijača i igrača</p></div><div class="chat card"><div class="chat-list" id="chat-list" aria-live="polite">${msgs.length ? msgs.map(row).join('') : empty('Budi prvi koji će napisati poruku.')}</div>${canWrite ? `<form class="chat-form" id="chat-form"><input id="chat-input" maxlength="500" placeholder="Napiši poruku…" autocomplete="off" required><button class="btn btn-primary" type="submit">Pošalji</button></form>` : `<p class="chat-login">Za pisanje se <a href="#/prijava">prijavi</a>.</p>`}</div>`;
    const list = ctx.app.querySelector('#chat-list'); list.scrollTop = list.scrollHeight;
    const channel = sb.channel('chat-room').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      if (!ctx.current() || !list.isConnected) return;
      const m = payload.new; if (list.querySelector(`[data-id="${m.id}"]`)) return;
      const empty_ = list.querySelector('.empty'); if (empty_) empty_.remove();
      const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
      list.insertAdjacentHTML('beforeend', row(m)); if (nearBottom) list.scrollTop = list.scrollHeight;
    }).subscribe();
    onLeave(() => sb.removeChannel(channel));
    ctx.app.querySelector('#chat-form')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const input = ctx.app.querySelector('#chat-input'); const content = input.value.trim(); if (!content) return;
      input.disabled = true;
      const { error: err } = await sb.from('messages').insert({ user_id: state.session.user.id, username: state.profile?.username || 'korisnik', content });
      input.disabled = false; if (err) { toast(errMsg(err), 'err'); return; }
      input.value = ''; input.focus();
    });
  });
}
