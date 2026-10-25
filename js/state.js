import { sb } from './supabase.js';

export const state = { session: null, profile: null, ready: false };
const listeners = new Set();

export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export const isStaff = () => ['admin', 'editor'].includes(state.profile?.role);
export const isAdmin = () => state.profile?.role === 'admin';

async function loadProfile() {
  if (!state.session) { state.profile = null; return; }
  const { data, error } = await sb.from('profiles').select('*')
    .eq('id', state.session.user.id).maybeSingle();
  state.profile = error ? null : data;
}

export async function initAuth() {
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  await loadProfile();
  state.ready = true;
  sb.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    await loadProfile();
    listeners.forEach((fn) => fn(state, _event));
  });
}