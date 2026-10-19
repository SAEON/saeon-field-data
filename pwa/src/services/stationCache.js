// The station list, kept on the device so a visit can be started with no signal. It is saved as soon as
// someone is signed in and the connection works — on whatever screen they are on — not only when the
// Field screen has been opened, then each station's sensors and details are saved behind it.

import { getDB } from '../hooks/idb.js';
import { getStations, prefetchAllStations } from './api.js';

const STORE = 'stations';

// Replace what is stored with the current list, so stations that were removed or reassigned disappear
export async function saveStationList(list) {
  const db = await getDB();
  const tx = db.transaction(STORE, 'readwrite');
  await tx.store.clear();
  await Promise.all([...list.map(s => tx.store.put(s)), tx.done]);
}

let running = false;

export async function refreshStationsForOffline() {
  if (running) return null;
  running = true;
  try {
    const fresh = await getStations();
    await saveStationList(fresh);
    prefetchAllStations(fresh);
    return fresh;
  } catch {
    return null;        // no usable connection right now — it runs again when one returns
  } finally {
    running = false;
  }
}
