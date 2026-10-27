import { sb } from '../supabase.js';
import { esc, safeUrl } from '../util.js';

export async function loadSponsors() {
  const {data,error}=await sb.from('sponsors').select('id,name,logo_url,url,tier').eq('active',true).order('tier').order('name');
  return error ? [] : data || [];
}
export function sponsorStrip(list) {
  if (!list.length) return '';
  return `<section class="block sponsors"><div class="block-head"><h2>Partneri lige</h2></div><div class="sponsor-grid">${list.map(s=>{
    const logo=safeUrl(s.logo_url); const url=safeUrl(s.url);
    const inner=logo ? `<img src="${esc(logo)}" alt="${esc(s.name)}" loading="lazy">` : `<strong>${esc(s.name)}</strong>`;
    return url ? `<a class="sponsor sponsor-t${Number(s.tier)||3}" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.name)}">${inner}</a>`
      : `<div class="sponsor sponsor-t${Number(s.tier)||3}" title="${esc(s.name)}">${inner}</div>`;
  }).join('')}</div></section>`;
}
