// Grafika rezultata (canvas → PNG) i kalendar (.ics). Bez vanjskih biblioteka.
import { LEAGUE_NAME } from './config.js';
import { STATUS_LABEL } from './util.js';

const W = 1080, H = 1080;
const safeHex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#f5b400');

function drawTeam(ctx, team, cx, cy) {
  const color = safeHex(team?.color);
  ctx.beginPath(); ctx.arc(cx, cy, 120, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.font = '900 96px system-ui, Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText((team?.short_name || team?.name || '?').slice(0, 3).toUpperCase(), cx, cy + 6);
  ctx.fillStyle = '#eef1f7';
  ctx.font = '800 58px system-ui, Arial, sans-serif';
  const name = team?.name || '';
  ctx.fillText(name.length > 16 ? name.slice(0, 15) + '…' : name, cx, cy + 190);
}

export function renderMatchCanvas(m) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0b0d12'); g.addColorStop(1, '#1c2230');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f5b400'; ctx.fillRect(0, 0, W, 14);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f5b400';
  ctx.font = '800 44px system-ui, Arial, sans-serif';
  ctx.fillText(LEAGUE_NAME.toUpperCase(), W / 2, 110);
  ctx.fillStyle = '#9aa3b5';
  ctx.font = '600 36px system-ui, Arial, sans-serif';
  ctx.fillText(`${m.round}. kolo${m.venue ? ' · ' + m.venue : ''}`, W / 2, 170);
  drawTeam(ctx, m.home, 270, 480);
  drawTeam(ctx, m.away, 810, 480);
  const finished = m.status === 'finished';
  ctx.fillStyle = '#eef1f7';
  ctx.font = '900 190px system-ui, Arial, sans-serif';
  const score = finished || m.status === 'live' || m.status === 'paused' ? `${m.home_score} : ${m.away_score}` : 'vs';
  ctx.fillText(score, W / 2, 470);
  ctx.fillStyle = m.status === 'live' ? '#ff3b5c' : '#9aa3b5';
  ctx.font = '700 40px system-ui, Arial, sans-serif';
  const when = m.status === 'scheduled'
    ? new Date(m.scheduled_at).toLocaleString('bs-BA', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
    : (STATUS_LABEL[m.status] || m.status);
  ctx.fillText(when, W / 2, 800);
  ctx.fillStyle = '#5c6578';
  ctx.font = '600 30px system-ui, Arial, sans-serif';
  ctx.fillText(location.host || 'liga', W / 2, H - 60);
  return canvas;
}
export const toBlob = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));
export async function shareMatchImage(m) {
  const blob = await toBlob(renderMatchCanvas(m));
  const name = `medjasi-${m.home?.short_name || 'dom'}-${m.away?.short_name || 'gost'}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: LEAGUE_NAME }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
const icsDate = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/[;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
export function matchIcsUrl(m) {
  const start = new Date(m.scheduled_at);
  const end = new Date(start.getTime() + 90 * 60000);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Medjasi Futsal Liga//HR', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${m.id}@medjasi-liga`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(start.toISOString())}`,
    `DTEND:${icsDate(end.toISOString())}`,
    `SUMMARY:${icsText(`${m.home?.name} – ${m.away?.name}`)}`,
    `LOCATION:${icsText(m.venue || '')}`,
    `DESCRIPTION:${icsText(`${LEAGUE_NAME} · ${m.round}. kolo`)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
}
