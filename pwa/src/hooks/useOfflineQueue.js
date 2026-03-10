// useOfflineQueue — manages manual readings that fail to POST while offline.
// Backed by IndexedDB 'offline_readings_queue' store (schema in idb.js).
// Shape: { id(auto), visit_id, payload, attempts, status, created_at }

import { useState, useEffect, useCallback } from 'react';
import { getDB } from './idb.js';
import { createReading } from '../services/api.js';

const STORE   = 'offline_readings_queue';
const MAX_ATT = 3;

export function useOfflineQueue(visitId) {
  const [items, setItems] = useState([]);

  async function refreshItems() {
    try {
      const db  = await getDB();
      const all = await db.getAll(STORE);
      setItems(all.filter(i => i.visit_id === visitId));
    } catch { /* IDB unavailable — non-fatal */ }
  }

  useEffect(() => {
    if (visitId) refreshItems();
  }, [visitId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Add a reading payload to the IDB queue
  const enqueue = useCallback(async (payload) => {
    const db   = await getDB();
    const item = {
      visit_id:   visitId,
      payload,
      attempts:   0,
      status:     'queued',
      created_at: new Date().toISOString(),
    };
    const id = await db.add(STORE, item);
    setItems(prev => [...prev, { ...item, id }]);
    return id;
  }, [visitId]);

  // Attempt to POST all queued readings for this visit.
  // Returns array of server-saved reading results so callers can merge into state.
  const flushQueue = useCallback(async () => {
    if (!navigator.onLine || !visitId) return [];
    const db   = await getDB();
    const all  = await db.getAll(STORE);
    const mine = all.filter(i => i.visit_id === visitId && i.status === 'queued');
    const saved = [];

    for (const item of mine) {
      try {
        const result = await createReading(visitId, item.payload);
        await db.delete(STORE, item.id);
        saved.push(result);
      } catch {
        const attempts = item.attempts + 1;
        await db.put(STORE, {
          ...item,
          attempts,
          status: attempts >= MAX_ATT ? 'failed' : 'queued',
        });
      }
    }

    await refreshItems();
    return saved;
  }, [visitId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remove all queue items for this visit (call after a visit is submitted)
  const clearVisitQueue = useCallback(async () => {
    try {
      const db  = await getDB();
      const all = await db.getAll(STORE);
      await Promise.all(
        all.filter(i => i.visit_id === visitId).map(i => db.delete(STORE, i.id))
      );
      setItems([]);
    } catch { /* non-fatal */ }
  }, [visitId]);

  // Reset a single failed item to queued and immediately attempt flush
  const retryItem = useCallback(async (id) => {
    try {
      const db   = await getDB();
      const item = await db.get(STORE, id);
      if (!item) return;
      await db.put(STORE, { ...item, status: 'queued', attempts: 0 });
      await refreshItems();
      if (navigator.onLine) await flushQueue();
    } catch { /* non-fatal */ }
  }, [visitId, flushQueue]); // eslint-disable-line react-hooks/exhaustive-deps

  const queuedCount = items.filter(i => i.status === 'queued').length;
  const failedCount = items.filter(i => i.status === 'failed').length;

  return { enqueue, flushQueue, clearVisitQueue, retryItem, items, queuedCount, failedCount };
}