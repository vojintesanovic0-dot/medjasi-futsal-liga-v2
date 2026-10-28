// PNG grafike za utakmicu, tabelu i karticu igrača; bez vanjskih biblioteka.
import { LEAGUE_NAME } from './config.js';
import { renderMatchCanvas } from './share.js';

const W = 1080, H = 1080;
const safeHex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#22c55e');
const clip = (s, n) => { const t = String(s ?? ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

export const TEMPLATES = { match: 'Utakmica', tabela: 'Tabela (top 8)', igrac: 'Kartica igrača' };

function frame(kicker) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nije podržan u ovom pregledniku.');
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0b0d12'); g.addColorStop(1, '#1c2230');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#22c55e'; ctx.fillRect(0, 0, W, 14);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#22c55e'; ctx.font = '800 44px system-ui, Arial, sans-serif';
  ctx.fillText(LEAGUE_NAME.toUpperCase(), W / 2, 110);
  ctx.fillStyle = '#9aa3b5'; ctx.font = '600 36px system-ui, Arial, sans-serif';
  ctx.fillText(kicker, W / 2, 170);
  return { canvas, ctx };
}

export function renderStandingsCanvas(rows) {
  const { canvas, ctx } = frame('Tabela');
  const top = (rows || []).slice(0, 8);
  ctx.textAlign = 'left'; ctx.fillStyle = '#9aa3b5'; ctx.font = '700 30px system-ui, Arial, sans-serif';
  ctx.fillText('#', 80, 260); ctx.fillText('Ekipa', 150, 260);
  ctx.textAlign = 'right'; ctx.fillText('ODR', 760, 260); ctx.fillText('GR', 880, 260); ctx.fillText('BOD', 1000, 260);
  top.forEach((r, i) => {
    const y = 330 + i * 80;
    ctx.textAlign = 'left'; ctx.fillStyle = safeHex(r.color); ctx.fillRect(60, y - 26, 8, 52);
    ctx.fillStyle = '#eef1f7'; ctx.font = '800 40px system-ui, Arial, sans-serif';
    ctx.fillText(String(i + 1), 80, y); ctx.fillText(clip(r.name, 22), 150, y);
    ctx.textAlign = 'right'; ctx.font = '700 40px system-ui, Arial, sans-serif';
    ctx.fillText(String(r.played ?? 0), 760, y); ctx.fillText(String(r.goal_diff ?? 0), 880, y);
    ctx.fillStyle = '#22c55e'; ctx.fillText(String(r.points ?? 0), 1000, y);
  });
  return canvas;
}

export function renderPlayerCanvas(p) {
  const { canvas, ctx } = frame('Kartica igrača');
  ctx.fillStyle = '#eef1f7'; ctx.font = '900 82px system-ui, Arial, sans-serif';
  ctx.fillText(clip(`${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(), 22), W / 2, 380);
  ctx.fillStyle = '#9aa3b5'; ctx.font = '600 40px system-ui, Arial, sans-serif';
  ctx.fillText(`${clip(p.team_name, 30)}${p.number != null ? ' · #' + p.number : ''}`, W / 2, 470);
  const stats = [['Golovi', p.goals], ['Asistencije', p.assists], ['Žuti', p.yellow], ['Crveni', p.red]];
  stats.forEach(([label, val], i) => {
    const x = 180 + i * 210;
    ctx.fillStyle = '#22c55e'; ctx.font = '900 100px system-ui, Arial, sans-serif'; ctx.fillText(String(val ?? 0), x + 90, 650);
    ctx.fillStyle = '#9aa3b5'; ctx.font = '600 30px system-ui, Arial, sans-serif'; ctx.fillText(label, x + 90, 740);
  });
  return canvas;
}

export function renderTemplate(kind, data) {
  if (kind === 'match') return renderMatchCanvas(data);
  if (kind === 'igrac') return renderPlayerCanvas(data);
  return renderStandingsCanvas(data);
}
