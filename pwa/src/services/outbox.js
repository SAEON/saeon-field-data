// Outbox — every change a technician makes that must reach the server is stored here first
// (IndexedDB 'outbox'), then replayed in order by flushOutbox(). Survives reloads and app restarts.
//
// Op shape: { id, user_id, visit_id, type, payload, attempts, status, error, created_at }
//   status: 'queued' (waiting / retrying)  |  'failed' (server rejected it — needs a person)
//
// Flush rules:
//   - network failure, timeout or 5xx  → stop, back off, nothing is lost, no attempt is burned
//   - 401                              → stop and pause until the user signs in again, nothing is lost
//   - other 4xx                        → that op is marked 'failed' with the server message
//   - 'submit' / 'abandon' for a visit are held while any op of that visit is 'failed'
//   - ops of a visit that has no server id yet wait for its 'visit_create' (see remapVisit)

import { getDB } from '../hooks/idb.js';
import * as api from './api.js';
import { isLocalVisit } from '../utils/visitId.js';

const STORE = 'outbox';

let currentUser = null;
const stateListeners  = new Set();
const syncedListeners = new Set();
const eventListeners  = new Set();
let lastSyncedAt = null;
let syncing = false;
let failures = 0;
let backoffUntil = 0;
let flushPromise = null;
let authPaused = false;

// local visit id → real id, remembered after the server creates the visit. A screen that still holds the
// old id (a save timer that started before the switch) is then re-pointed instead of being left stranded.
const MAP_KEY = 'fds_visit_map';
function readVisitMap() {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) || '{}'); } catch { return {}; }
}
function rememberVisitMapping(localId, realId) {
  try {
    const entries = Object.entries({ ...readVisitMap(), [localId]: realId }).slice(-50);
    localStorage.setItem(MAP_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* storage unavailable */ }
}
export function resolveVisitId(id) {
  return isLocalVisit(id) ? (readVisitMap()[id] ?? id) : id;
}

// An op with every occurrence of the visit id switched (the id also lives inside some payloads)
function withVisitId(op, localId, realId) {
  const next = { ...op, visit_id: realId };
  if (op.payload?.data?.visit_id === localId)   next.payload = { ...next.payload, data:   { ...op.payload.data,   visit_id: realId } };
  if (op.payload?.assign?.visit_id === localId) next.payload = { ...next.payload, assign: { ...op.payload.assign, visit_id: realId } };
  return next;
}

// A 401 pauses the queue so it does not keep hitting the server; signing in again resumes it.
export function resumeAfterAuth() {
  if (!authPaused) return;
  authPaused = false;
  backoffUntil = 0;
  flushOutbox({ force: true });
}

const syncedKey = () => `fds_last_synced_${currentUser}`;
function readLastSynced() {
  try {
    const v = localStorage.getItem(syncedKey());
    return v ? new Date(v) : null;
  } catch { return null; }
}

export function setOutboxUser(userId) {
  if ((userId ?? null) !== currentUser) lastSyncedAt = null;
  currentUser = userId ?? null;
  emit();
}

export function subscribeOutbox(fn) {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

// fn({ phase, op, result?, error? }) for every step of a flush:
//   'start' (about to send) · 'synced' · 'transient' (will retry later) · 'failed' (server rejected it)
export function onOpEvent(fn) {
  eventListeners.add(fn);
  return () => eventListeners.delete(fn);
}
const fire = evt => eventListeners.forEach(fn => fn(evt));

// fn({ op, result }) after an op has been accepted by the server
export function onOpSynced(fn) {
  syncedListeners.add(fn);
  return () => syncedListeners.delete(fn);
}

async function mine() {
  const db  = await getDB();
  const all = await db.getAll(STORE);
  return all.filter(o => o.user_id == null || o.user_id === currentUser).sort((a, b) => a.id - b.id);
}

export async function getOutboxState() {
  let ops = [];
  try { ops = await mine(); } catch { /* IDB unavailable */ }
  return {
    queued:  ops.filter(o => o.status === 'queued').length,
    failed:  ops.filter(o => o.status === 'failed').length,
    syncing,
    lastSyncedAt: lastSyncedAt ?? (currentUser ? readLastSynced() : null),
  };
}

async function emit() {
  if (!stateListeners.size) return;
  const state = await getOutboxState();
  stateListeners.forEach(fn => fn(state));
}

export async function getOps(visitId) {
  try {
    const ops = await mine();
    const id  = resolveVisitId(visitId);
    return visitId == null ? ops : ops.filter(o => o.visit_id === id);
  } catch {
    return [];
  }
}

export async function enqueueOp(type, visitId, payload) {
  const db = await getDB();
  const id = await db.add(STORE, {
    user_id: currentUser,
    visit_id: resolveVisitId(visitId),
    type,
    payload,
    attempts: 0,
    status: 'queued',
    error: null,
    created_at: new Date().toISOString(),
  });
  emit();
  return id;
}

// For "last write wins" ops (e.g. the visit's date/notes): drop earlier queued copies, keep the newest.
export async function enqueueOpReplacing(type, visitId, payload) {
  const db = await getDB();
  visitId = resolveVisitId(visitId);
  for (const op of (await mine()).filter(o => o.visit_id === visitId && o.type === type && o.status === 'queued')) {
    await db.delete(STORE, op.id);
  }
  return enqueueOp(type, visitId, payload);
}

// Layer queued (not yet synced) readings/deletes over what the server returned for a visit,
// so forms show — and count — values the technician has already entered offline.
export function overlayPending(serverReadings, ops) {
  let out = [...serverReadings];
  for (const op of ops) {
    if (op.status !== 'queued' && op.status !== 'failed') continue;
    if (op.type === 'reading') {
      const p = op.payload;
      out = out.filter(r => r.reading_type !== p.reading_type);
      out.push({ ...p, id: null, pending: true });
    } else if (op.type === 'reading_delete') {
      out = out.filter(r => r.reading_type !== op.payload.reading_type);
    }
  }
  return out;
}

export async function retryOp(id) {
  const db = await getDB();
  const op = await db.get(STORE, id);
  if (!op) return;
  await db.put(STORE, { ...op, status: 'queued', error: null });
  backoffUntil = 0;
  emit();
  flushOutbox({ force: true });
}

export async function retryAllFailed() {
  const db = await getDB();
  for (const op of (await mine()).filter(o => o.status === 'failed')) {
    await db.put(STORE, { ...op, status: 'queued', error: null });
  }
  backoffUntil = 0;
  emit();
  flushOutbox({ force: true });
}

export async function discardOp(id) {
  const db = await getDB();
  await db.delete(STORE, id);
  emit();
}

// Everything stored under a visit's local id moves to the real id the server just gave it:
// queued ops (including ids nested in their payloads), stored files waiting to upload, and the draft.
export async function remapVisit(localId, realId) {
  rememberVisitMapping(localId, realId);
  const db = await getDB();
  for (const op of await db.getAll(STORE)) {
    if (op.visit_id !== localId) continue;
    await db.put(STORE, withVisitId(op, localId, realId));
  }
  for (const rec of await db.getAll('upload_queue')) {
    if (rec.visit_id === localId) await db.put('upload_queue', { ...rec, visit_id: realId });
  }
  const drafts = db.transaction('draft_visit', 'readwrite');
  for (const key of await drafts.store.getAllKeys()) {
    const d = await drafts.store.get(key);
    if (d?.visitId === localId) await drafts.store.put({ ...d, visitId: realId, pendingCreate: false }, key);
  }
  await drafts.done;
}

// Drop a visit that never reached the server: its queued ops and any files stored for upload
export async function discardLocalVisit(localId) {
  const db = await getDB();
  for (const op of await db.getAll(STORE)) if (op.visit_id === localId) await db.delete(STORE, op.id);
  for (const rec of await db.getAll('upload_queue')) if (rec.visit_id === localId) await db.delete('upload_queue', rec.localId);
  emit();
}

export async function clearVisitOps(visitId) {
  const db = await getDB();
  visitId = resolveVisitId(visitId);
  for (const op of (await mine()).filter(o => o.visit_id === visitId)) await db.delete(STORE, op.id);
  emit();
}

// ── Handlers ────────────────────────────────────────────────────────────────

const HANDLERS = {
  // A visit started with no signal. client_ref makes a repeat (lost reply) return the same visit.
  async visit_create(op) {
    const { station_id, visited_at, client_ref } = op.payload;
    const visit = await api.createVisit({ station_id, visited_at, client_ref, status: 'draft' });
    await remapVisit(op.visit_id, visit.id);
    return visit;
  },
  reading:        op => api.createReading(op.visit_id, op.payload),
  reading_delete: op => api.deleteReading(op.visit_id, op.payload.reading_type),
  visit_update:   op => api.updateVisit(op.visit_id, op.payload),
  instrument:     op => api.createInstrumentRecord(op.payload.station_id, op.payload.data),
  calibration:    op => api.createCalibrationCheck(op.visit_id, op.payload),
  submit:         op => api.submitVisit(op.visit_id),
  abandon:        op => api.abandonVisit(op.visit_id),

  // Sensor swap/upgrade/decommission and the "changed" confirmation reading, kept together
  // because the confirmation needs the id of the sensor the server creates.
  async sensor_change(op) {
    const { station_id, mode, sensor_id, assign } = op.payload;
    if (mode === 'decommission') {
      await api.decommissionSensor(station_id, sensor_id);
      return { created: null };
    }
    const created = await api.assignSensor(station_id, assign);
    if (created?.id) {
      await api.createReading(op.visit_id, {
        reading_type: `smaint:${created.id}:confirmation`,
        value_text: 'changed',
        recorded_at: new Date().toISOString(),
      });
    }
    return { created };
  },
};

// Other modules (e.g. file uploads) register their own op types
export function registerHandler(type, fn) {
  HANDLERS[type] = fn;
}

// ── Flush ───────────────────────────────────────────────────────────────────

function scheduleBackoff() {
  failures += 1;
  backoffUntil = Date.now() + Math.min(30000 * 2 ** (failures - 1), 5 * 60 * 1000);
}

export function flushOutbox({ force = false } = {}) {
  if (flushPromise) return flushPromise;
  flushPromise = doFlush(force).finally(() => {
    flushPromise = null;
    syncing = false;
    emit();
  });
  return flushPromise;
}

async function doFlush(force) {
  if (!currentUser || authPaused) return { synced: 0 };
  if (!force && Date.now() < backoffUntil) return { synced: 0 };

  let ops;
  try { ops = await mine(); } catch { return { synced: 0 }; }
  const queued = ops.filter(o => o.status === 'queued');
  if (queued.length === 0) return { synced: 0 };

  if (!(await api.isReachable())) {
    scheduleBackoff();
    return { synced: 0 };
  }

  syncing = true;
  emit();

  const db = await getDB();
  const visitsWithFailures = new Set(ops.filter(o => o.status === 'failed').map(o => o.visit_id));
  let synced = 0;

  for (let op of queued) {
    // A change saved under the temporary id after its visit was registered: re-point it before sending
    const realId = resolveVisitId(op.visit_id);
    if (realId !== op.visit_id) {
      op = withVisitId(op, op.visit_id, realId);
      await db.put(STORE, op);
    }
    if ((op.type === 'submit' || op.type === 'abandon') && visitsWithFailures.has(op.visit_id)) continue;
    if (isLocalVisit(op.visit_id) && op.type !== 'visit_create') continue;   // waits for its visit to exist
    const handler = HANDLERS[op.type];
    if (!handler) continue;

    // Skip ops that were cancelled or discarded since the flush began
    if (!(await db.get(STORE, op.id))) continue;

    try {
      fire({ phase: 'start', op });
      const result = await handler(op);
      await db.delete(STORE, op.id);
      synced += 1;
      failures = 0;
      lastSyncedAt = new Date();
      try { localStorage.setItem(syncedKey(), lastSyncedAt.toISOString()); } catch { /* storage unavailable */ }
      syncedListeners.forEach(fn => fn({ op, result }));
      fire({ phase: 'synced', op, result });
      // The visit now has a server id and its other ops were re-addressed: carry on with them right away
      if (op.type === 'visit_create') {
        const more = await doFlush(true);
        return { synced: synced + more.synced };
      }
    } catch (err) {
      if (err?.status === 401) {                           // auth layer takes over
        authPaused = true;
        fire({ phase: 'transient', op });
        emit();
        return { synced };
      }
      if (api.isTransientError(err)) {
        // A server error (not a lost connection) is remembered on the change so the Queue can say so
        if (err?.status >= 500) {
          await db.put(STORE, { ...op, error: `The server returned an error (${err.status}) — retrying` }).catch(() => {});
        }
        fire({ phase: 'transient', op });
        scheduleBackoff();
        return { synced };
      }
      // Cancelled mid-flight (op no longer exists): nothing to record
      if (!(await db.get(STORE, op.id))) continue;
      const message = String(err?.message || 'Rejected by server').slice(0, 300);
      await db.put(STORE, { ...op, attempts: (op.attempts ?? 0) + 1, status: 'failed', error: message });
      visitsWithFailures.add(op.visit_id);
      fire({ phase: 'failed', op, error: message });
    }
  }
  return { synced };
}
