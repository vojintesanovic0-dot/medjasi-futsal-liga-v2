import { esc } from './util.js';

// Render only HTTPS destinations; escape all DB-provided text and attributes.
const httpsUrl = (value) => (/^https:\/\//i.test(value || '') ? value : '');

export function sponsorsHtml(list) {
  if (!list?.length) return '';
  const items = list.map((s) => {
    const logo = httpsUrl(s.logo_url);
    const site = httpsUrl(s.website_url);
    const inner = logo
      ? `<img src="${esc(logo)}" alt="${esc(s.name)}" loading="lazy" width="160" height="64">`
      : `<span class="sp-name">${esc(s.name)}</span>`;
    return site
      ? `<a class="sp-item" href="${esc(site)}" target="_blank" rel="noopener nofollow" title="${esc(s.name)}">${inner}</a>`
      : `<span class="sp-item" title="${esc(s.name)}">${inner}</span>`;
  }).join('');
  return `<section class="block home-block sponsors-block" aria-labelledby="sp-title"><div class="block-head"><h2 id="sp-title">Partneri lige</h2></div><div class="sp-row">${items}</div></section>`;
}
