// Shared IndexedDB helper — single source of truth for DB name, version, and store setup.
// Both useStations and useDraftVisit import from here.
import { openDB } from 'idb';

export const DB_NAME = 'fds';
export const DB_VER  = 3;

export function getDB() {
  return openDB(DB_NAME, DB_VER, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('stations', { keyPath: 'id' });
      }
      if (oldVersion < 2) {
        // Single-row store — draft visit is stored with id = 'current'
        db.createObjectStore('draft_visit');
      }
      if (oldVersion < 3) {
        // Queue for readings that failed to POST while offline
        // Shape: { id(auto), visit_id, payload, attempts, status, created_at }
        db.createObjectStore('offline_readings_queue', { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}
