const HTML_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => HTML_MAP[c]);
export const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#22c55e');
export const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
const fmtDate = (iso) => new Date(iso).toLocaleDateString('bs-BA', { weekday: 'short', day: '2-digit', month: 'short' });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit' });
export const fmtDateTime = (iso) => `${fmtDate(iso)} · ${fmtTime(iso)}`;
export const fmtLong = (iso) => new Date(iso).toLocaleDateString('bs-BA', { day: '2-digit', month: 'long', year: 'numeric' });
export const mmss = (s) => {
  const t = Math.max(0, Math.floor(s));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
export function matchElapsed(m, now = Date.now()) {
  let s = m.clock_seconds || 0;
  if (m.status === 'live' && m.clock_started_at) s += (now - Date.parse(m.clock_started_at)) / 1000;
  return Math.min(s, (m.periods_limit_seconds || m.period_minutes * 60));
}
export const STATUS_LABEL = { scheduled: 'Zakazana', live: 'Uživo', paused: 'Pauza', finished: 'Završena' };
export function periodName(m) {
  if (m.status === 'finished') return 'Kraj';
  if (m.periods === 2) return m.current_period === 1 ? '1. poluvrijeme' : '2. poluvrijeme';
  return `${m.current_period}. period`;
}
export function toLocalInput(iso) {
  const d = new Date(iso);
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export const fromLocalInput = (v) => new Date(v).toISOString();
export function slugify(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vijest';
}
export const errMsg = (e) => e?.message || String(e);
export const loading = () => '<div class="loader" role="status">Učitavanje…</div>';
export const empty = (t) => `<div class="empty">${esc(t)}</div>`;
export function toast(msg, kind = 'ok') {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}