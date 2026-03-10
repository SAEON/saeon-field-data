import { useState, useEffect } from 'react';
import { getDB } from './idb.js';
import { getStations } from '../services/api.js';

const STORE = 'stations';

export function useStations() {
  const [stations, setStations] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [offline,  setOffline]  = useState(false);

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
          const db = await getDB();
          const tx = db.transaction(STORE, 'readwrite');
          await Promise.all([...fresh.map(s => tx.store.put(s)), tx.done]);
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
  }, []);

  return { stations, loading, offline };
}
