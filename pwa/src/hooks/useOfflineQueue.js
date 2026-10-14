// useOfflineQueue — per-visit view of the outbox (services/outbox.js).
// Kept as a thin wrapper so screens can enqueue a reading and show what is waiting for this visit.
// Syncing itself is done app-wide by useSyncEngine; this hook never flushes on its own schedule.

import { useState, useEffect, useCallback } from 'react';
import { enqueueOp, flushOutbox, getOps, retryOp, subscribeOutbox } from '../services/outbox.js';

export function useOfflineQueue(visitId) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!visitId) return undefined;
    let alive = true;
    const load = () => { getOps(visitId).then(ops => { if (alive) setItems(ops); }); };
    load();
    const unsubscribe = subscribeOutbox(load);
    return () => { alive = false; unsubscribe(); };
  }, [visitId]);

  // Queue a manual reading (the payload accepted by createReading)
  const enqueue = useCallback(payload => enqueueOp('reading', visitId, payload), [visitId]);

  // Ask the engine to sync now. Results arrive through onOpSynced, not as a return value.
  const flushQueue = useCallback(async () => {
    await flushOutbox({ force: true });
    return [];
  }, []);

  const retryItem = useCallback(async id => { await retryOp(id); }, []);

  const visitItems  = visitId ? items : [];
  const queuedCount = visitItems.filter(i => i.status === 'queued').length;
  const failedCount = visitItems.filter(i => i.status === 'failed').length;

  return { enqueue, flushQueue, retryItem, items: visitItems, queuedCount, failedCount };
}
