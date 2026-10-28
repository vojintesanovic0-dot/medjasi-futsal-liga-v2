import { sb } from '../supabase.js';
import { uploadMedia } from '../api.js';
import { esc, toast, errMsg, safeColor } from '../util.js';

const POS = { '': '—', golman: 'Golman', odbrana: 'Odbrana', vezni: 'Vezni', napad: 'Napad' };
const hex6 = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#22c55e');

function openDialog(title, fields, onSubmit, onDone) {
  const dlg = document.createElement('dialog');
  dlg.className = 'edit-dialog';
  dlg.innerHTML = `<form class="form grid-form">
    <h3>${esc(title)}</h3>${fields}
    <p class="small" role="status" data-msg></p>
    <div class="row-actions"><button class="btn btn-primary" type="submit">Sačuvaj</button>
    <button class="btn btn-ghost" type="button" data-close>Otkaži</button></div>
  </form>`;
  document.body.appendChild(dlg);
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => dlg.remove());
  dlg.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = event.currentTarget.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await onSubmit(new FormData(event.currentTarget));
      toast('Sačuvano.');
      dlg.close();
      onDone?.();
    } catch (error) {
      dlg.querySelector('[data-msg]').textContent = errMsg(error);
      btn.disabled = false;
    }
  });
  dlg.showModal();
}

export async function openPlayerEdit(id, onDone) {
  const { data: player, error } = await sb.from('players').select('*').eq('id', id).maybeSingle();
  if (error || !player) return toast(error ? errMsg(error) : 'Igrač nije pronađen.', 'err');
  const posOpts = Object.entries(POS).map(([key, label]) =>
    `<option value="${key}" ${(player.position || '') === key ? 'selected' : ''}>${label}</option>`).join('');
  openDialog('Uredi igrača', `
    <label>Ime<input name="first_name" required maxlength="30" value="${esc(player.first_name)}"></label>
    <label>Prezime<input name="last_name" required maxlength="30" value="${esc(player.last_name)}"></label>
    <label>Broj<input name="number" type="number" min="0" max="99" value="${player.number ?? ''}"></label>
    <label>Pozicija<select name="position">${posOpts}</select></label>
    <label class="check"><input name="is_captain" type="checkbox" ${player.is_captain ? 'checked' : ''}> Kapiten</label>
    <label class="check"><input name="is_vice_captain" type="checkbox" ${player.is_vice_captain ? 'checked' : ''}> Zamjenik kapitena</label>
    <label>Nova fotografija (opciono)<input name="photo" type="file" accept="image/*"></label>`,
  async (form) => {
    const number = form.get('number');
    const photo = form.get('photo');
    const photo_url = photo?.size ? await uploadMedia(photo, 'players') : player.photo_url;
    const { error: updateError } = await sb.from('players').update({
      first_name: String(form.get('first_name') || '').trim(),
      last_name: String(form.get('last_name') || '').trim(),
      number: number === '' ? null : Number(number),
      position: form.get('position') || null,
      is_captain: form.get('is_captain') === 'on',
      is_vice_captain: form.get('is_vice_captain') === 'on',
      photo_url,
    }).eq('id', player.id);
    if (updateError) throw updateError;
  }, onDone);
}

export async function openTeamEdit(id, onDone) {
  const { data: team, error } = await sb.from('teams').select('*').eq('id', id).maybeSingle();
  if (error || !team) return toast(error ? errMsg(error) : 'Ekipa nije pronađena.', 'err');
  openDialog('Uredi ekipu', `
    <label>Naziv<input name="name" required maxlength="40" value="${esc(team.name)}"></label>
    <label>Skraćenica<input name="short_name" maxlength="4" value="${esc(team.short_name || '')}"></label>
    <label>Boja<input name="color" type="color" value="${hex6(team.color)}"></label>
    <label>Logo (URL)<input name="logo_url" type="url" value="${esc(team.logo_url || '')}"></label>
    <label>Trener<input name="coach_name" maxlength="60" value="${esc(team.coach_name || '')}" placeholder="Ime i prezime"></label>
    <label>Novi logo (fajl, opciono)<input name="logo_file" type="file" accept="image/*"></label>`,
  async (form) => {
    const file = form.get('logo_file');
    const logo_url = file?.size ? await uploadMedia(file, 'logos') : (String(form.get('logo_url') || '').trim() || null);
    const { error: updateError } = await sb.from('teams').update({
      name: String(form.get('name') || '').trim(),
      short_name: String(form.get('short_name') || '').trim() || null,
      color: safeColor(form.get('color')),
      logo_url,
      coach_name: String(form.get('coach_name') || '').trim() || null,
    }).eq('id', team.id);
    if (updateError) throw updateError;
  }, onDone);
}
