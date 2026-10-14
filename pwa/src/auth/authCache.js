// Last known user profile (non-secret: id, role, name, department) kept in IndexedDB so the app can
// start and keep working when the session check cannot reach the server. No tokens or passwords.
import { getDB } from '../hooks/idb.js';

const STORE = 'auth_cache';
const KEY   = 'current';

export async function loadCachedProfile() {
  try { return (await (await getDB()).get(STORE, KEY)) || null; } catch { return null; }
}

export async function saveCachedProfile(profile) {
  try { await (await getDB()).put(STORE, { ...profile, cachedAt: new Date().toISOString() }, KEY); } catch { /* non-fatal */ }
}

export async function clearCachedProfile() {
  try { await (await getDB()).delete(STORE, KEY); } catch { /* non-fatal */ }
}
