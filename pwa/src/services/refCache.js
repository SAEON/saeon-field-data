// Reference-data cache (IndexedDB 'ref_cache'). Data a visit needs — sensors, transfer standards,
// station detail, … — is kept after every successful fetch, so a technician who loses signal mid-visit
// still gets the last known copy instead of an error.

import { getDB } from '../hooks/idb.js';

const STORE = 'ref_cache';

const isTransient = err => !!(err?.network || err?.offline || err?.timeout || err?.status === 401 || err?.status >= 500);

export async function cacheGet(key) {
  try { return (await (await getDB()).get(STORE, key))?.data; } catch { return undefined; }
}

export async function cacheSet(key, data) {
  try { await (await getDB()).put(STORE, { key, data, fetched_at: new Date().toISOString() }); } catch { /* non-fatal */ }
}

export async function clearRefCache() {
  try { await (await getDB()).clear(STORE); } catch { /* non-fatal */ }
}

// Fetch fresh data and remember it. If the network is down, slow (> patienceMs) or the server errors,
// answer from the cache instead; the late response still refreshes the cache for next time.
export async function cachedGet(key, fetcher, { patienceMs = 4000 } = {}) {
  const cached = await cacheGet(key);
  const fetching = fetcher().then(async data => { await cacheSet(key, data); return data; });
  if (cached === undefined) return fetching;

  fetching.catch(() => {});
  const fresh = fetching.catch(err => { if (isTransient(err)) return cached; throw err; });
  const slow  = new Promise(resolve => setTimeout(() => resolve(cached), patienceMs));
  return Promise.race([fresh, slow]);
}
