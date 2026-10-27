import { sb } from './supabase.js';
import { isStaff } from './state.js';
import { esc, toast, errMsg } from './util.js';

export async function loadNotes(matchId) {
  const {data,error}=await sb.from('match_notes').select('*').eq('match_id',matchId).order('created_at',{ascending:false}).limit(100);
  return error ? [] : data || [];
}
const listHtml=notes=>notes.map(n=>`<li data-note="${esc(n.id)}"><span class="no">${Number(n.minute)||0}'</span><span>${esc(n.text)}</span>${isStaff()? ` <button class="btn btn-xs btn-ghost" data-del-note="${esc(n.id)}" aria-label="Obriši bilješku">✕</button>`:''}</li>`).join('') || '<li class="muted">Još nema bilješki.</li>';
export function notesHtml(notes) {
  return `<section class="block" id="live-notes"><h2>Tekst uživo</h2>${isStaff()? `<form id="note-form" class="comment-form"><input name="minute" type="number" min="0" max="200" value="0" aria-label="Minuta" style="max-width:6rem"><input name="text" required minlength="2" maxlength="200" placeholder="Kratka bilješka iz utakmice" autocomplete="off"><button class="btn btn-sm btn-primary" type="submit">Dodaj</button></form>`:''}<ul class="notes" id="notes-list">${listHtml(notes)}</ul></section>`;
}
export function mountNotes(app,match,onLeave) {
  let disposed=false;
  const refresh=async()=>{const el=app.querySelector('#notes-list');if(el&&!disposed)el.innerHTML=listHtml(await loadNotes(match.id));};
  app.querySelector('#note-form')?.addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget;const f=new FormData(form);const button=form.querySelector('button');button.disabled=true;
    const {error}=await sb.from('match_notes').insert({match_id:match.id,minute:Number(f.get('minute'))||0,text:String(f.get('text')).trim()});
    button.disabled=false;if(error)return toast(errMsg(error),'err');form.reset();refresh();
  });
  app.querySelector('#notes-list')?.addEventListener('click',async e=>{
    const b=e.target.closest('[data-del-note]');if(!b)return;
    const {error}=await sb.from('match_notes').delete().eq('id',b.dataset.delNote);
    if(error)return toast(errMsg(error),'err');refresh();
  });
  const channel=sb.channel(`match-notes-${match.id}`).on('postgres_changes',{event:'*',schema:'public',table:'match_notes',filter:`match_id=eq.${match.id}`},refresh).subscribe();
  onLeave(()=>{disposed=true;sb.removeChannel(channel);});
}
