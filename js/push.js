import { VAPID_PUBLIC_KEY } from './config.js';
import { saveSubscription, removeSubscription } from './api.js';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64ToBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};
export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('sw.js'); } catch (_) { /* offline ili HTTP — nije kritično */ }
}
export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
export async function enablePush(userId) {
  if (!pushSupported()) throw new Error('Ovaj preglednik ne podržava obavještenja.');
  if (!VAPID_PUBLIC_KEY) throw new Error('Obavještenja još nisu podešena (VAPID ključ u js/config.js).');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Dozvola za obavještenja nije odobrena.');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) });
  await saveSubscription(userId, sub.toJSON());
  return sub;
}
export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await removeSubscription(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}
