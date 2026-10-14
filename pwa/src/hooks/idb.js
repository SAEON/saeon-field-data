// Shared IndexedDB helper — single source of truth for DB name, version, and store setup.
import { openDB } from 'idb';

export const DB_NAME = 'fds';
export const DB_VER  = 4;

export function getDB() {
  return openDB(DB_NAME, DB_VER, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        db.createObjectStore('stations', { keyPath: 'id' });
      }
      if (oldVersion < 2) {
        // Single-row store — draft visit is stored with id = 'current'
        db.createObjectStore('draft_visit');
      }
      if (oldVersion < 3) {
        // Legacy readings-only queue (replaced by 'outbox' in v4)
        db.createObjectStore('offline_readings_queue', { keyPath: 'id', autoIncrement: true });
      }
      if (oldVersion < 4) {
        // Typed outbox: { id(auto), user_id, visit_id, type, payload, attempts, status, error, created_at }
        const outbox = db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
        // Reference-data cache for offline use: { key, data, fetched_at }
        db.createObjectStore('ref_cache', { keyPath: 'key' });
        // Last known non-secret user profile (single row, key 'current')
        db.createObjectStore('auth_cache');
        // Logger files waiting to upload: { localId, user_id, visit_id, blob, name, size, ... }
        db.createObjectStore('upload_queue', { keyPath: 'localId' });

        // Carry over anything still waiting in the legacy queue
        if (oldVersion >= 3) {
          tx.objectStore('offline_readings_queue').getAll().then(rows => {
            for (const r of rows) {
              outbox.add({
                user_id: null,
                visit_id: r.visit_id,
                type: 'reading',
                payload: r.payload,
                attempts: r.attempts ?? 0,
                status: r.status === 'failed' ? 'failed' : 'queued',
                error: null,
                created_at: r.created_at,
              });
            }
          });
        }
      }
    },
  });
}
