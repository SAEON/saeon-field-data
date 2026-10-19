import { useState, useEffect } from 'react';
import { getDB } from './idb.js';
import { getStations, prefetchAllStations } from '../services/api.js';
import { saveStationList } from '../services/stationCache.js';
import { useOnReconnect } from './useOnReconnect.js';

const STORE = 'stations';

export function useStations() {
  const [stations, setStations] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [offline,  setOffline]  = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Refresh the list (and the saved station data) when signal returns
  useOnReconnect(() => setReloadKey(k => k + 1));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // 1. Serve from IndexedDB immediately (instant / offline-first)
      try {
        const db     = await getDB();
        const cached = await db.getAll(STORE);
        if (!cancelled && cached.length > 0) {
          setStations(cached);
          setLoading(false);
        }
      } catch {
        // IDB unavailable — continue to network
      }

      // 2. Fetch fresh data from API
      try {
        const fresh = await getStations();
        if (!cancelled) {
          setStations(fresh);
          setOffline(false);
          setLoading(false);

          // Persist to IDB for next offline load
          await saveStationList(fresh);

          // Save each station's sensors, standards and details so any of them can be started offline
          prefetchAllStations(fresh);
        }
      } catch {
        if (!cancelled) {
          setOffline(true);
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  return { stations, loading, offline };
}
