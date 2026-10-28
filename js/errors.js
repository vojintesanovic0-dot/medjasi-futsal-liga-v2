import { sb } from './supabase.js';
import { state } from './state.js';

let installed = false;
let lastReport = '';

function cleanUrl() {
  // Do not send query strings or hashes, which can contain reset tokens.
  return String(location.origin + location.pathname).slice(0, 300);
}

async function report(message, stack = '') {
  const normalized = String(message || 'Nepoznata greška').slice(0, 500);
  const signature = normalized + '|' + cleanUrl();
  if (signature === lastReport) return;
  lastReport = signature;
  try {
    await sb.from('client_errors').insert({
      message: normalized,
      stack: String(stack || '').slice(0, 4000) || null,
      url: cleanUrl(),
      user_agent: String(navigator.userAgent || '').slice(0, 300),
      user_id: state.session?.user?.id || null,
    });
  } catch (_) {
    // Reporting must never interrupt the public app.
  }
}

export function initClientErrorReporting() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => {
    report(event.message || 'JavaScript greška', event.error?.stack || '');
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    report(reason?.message || String(reason || 'Neobraćeno odbijeno obećanje'), reason?.stack || '');
  });
}
