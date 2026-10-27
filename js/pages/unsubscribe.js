import { sb } from '../supabase.js';
import { esc } from '../util.js';

export function registerUnsubscribe(route) {
  route('/odjava-email', async (ctx) => {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const token = params.get('token');
    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) { ctx.app.innerHTML='<div class="card"><h1>Odjava s obavještenja</h1><p>Link za odjavu nije potpun ili nije ispravan.</p></div>'; return; }
    ctx.app.innerHTML='<div class="card"><h1>Odjava s obavještenja</h1><p>Obrađujem zahtjev…</p></div>';
    const {data,error}=await sb.rpc('unsubscribe_newsletter',{p_token:token});
    if (!ctx.current()) return;
    ctx.app.innerHTML=error ? '<div class="card"><h1>Odjava nije uspjela</h1><p>Molimo pokušaj ponovo kasnije.</p></div>'
      : `<div class="card"><h1>Odjava s obavještenja</h1><p>${data ? 'Uspješno si odjavljen/a.' : 'Ovaj link je već iskorišten ili nije važeći.'}</p></div>`;
  });
}
