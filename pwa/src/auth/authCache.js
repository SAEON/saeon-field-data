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

// Does this device hold work for the user that has not reached the server yet (an open visit, or queued
// changes)? Used so an expired session never takes that work out of reach.
export async function hasUnsentWork(userId) {
  if (userId == null) return false;
  try {
    const db = await getDB();
    if (await db.get('draft_visit', `user:${userId}`)) return true;
    return (await db.getAll('outbox')).some(o => o.user_id === userId);
  } catch { return false; }
}

export async function clearCachedProfile() {
  try { await (await getDB()).delete(STORE, KEY); } catch { /* non-fatal */ }
}
