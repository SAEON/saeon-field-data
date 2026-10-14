// Logger-file uploads that survive reloads, tab switches and weak signal.
// The picked File is stored in IndexedDB ('upload_queue') before anything is sent; the app-wide sync
// engine (services/outbox.js) uploads it, retrying with backoff, and removes the stored copy only once
// the server has accepted it.

import { getDB } from '../hooks/idb.js';
import { enqueueOp, getOps, discardOp, retryOp, registerHandler } from './outbox.js';
import { uploadFile, deleteFile } from './api.js';

const STORE = 'upload_queue';
const inFlight = new Map(); // localId → AbortController

export async function queueUpload(visitId, file, localId) {
  const db = await getDB();
  await db.put(STORE, { localId, visit_id: visitId, blob: file, name: file.name, size: file.size, created_at: new Date().toISOString() });
  await enqueueOp('upload', visitId, { localId, name: file.name, size: file.size });
}

export async function hasStoredFile(localId) {
  try { return !!(await (await getDB()).get(STORE, localId)); } catch { return false; }
}

// Stop and forget an upload that has not reached the server (user removed the file)
export async function cancelUpload(localId) {
  inFlight.get(localId)?.abort();
  inFlight.delete(localId);
  try {
    const db = await getDB();
    await db.delete(STORE, localId);
    for (const op of await getOps()) {
      if (op.type === 'upload' && op.payload?.localId === localId) await discardOp(op.id);
    }
  } catch { /* non-fatal */ }
}

// Put a failed upload back in the queue (re-adds it if the old op is gone but the file is still stored)
export async function retryUpload(visitId, localId) {
  const failed = (await getOps(visitId)).find(o => o.type === 'upload' && o.payload?.localId === localId);
  if (failed) { await retryOp(failed.id); return true; }
  const db = await getDB();
  const rec = await db.get(STORE, localId);
  if (!rec) return false;
  await enqueueOp('upload', visitId, { localId, name: rec.name, size: rec.size });
  return true;
}

registerHandler('upload', async op => {
  const { localId } = op.payload;
  const db  = await getDB();
  const rec = await db.get(STORE, localId);
  if (!rec) {
    throw Object.assign(new Error('This file is no longer stored on the device — please add it again.'), { status: 410 });
  }
  const controller = new AbortController();
  inFlight.set(localId, controller);
  try {
    const result = await uploadFile(op.visit_id, rec.blob, controller.signal);
    await db.delete(STORE, localId);
    return result;
  } finally {
    inFlight.delete(localId);
  }
});

registerHandler('file_delete', op => deleteFile(op.payload.dbId));
