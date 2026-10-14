import { cachedGet } from './refCache.js';

const BASE = import.meta.env.VITE_API_URL ?? '';

let _onUnauthorized = null;
export function setUnauthorizedHandler(fn) { _onUnauthorized = fn; }

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const timeoutMs = options.timeoutMs ?? (method === 'POST' ? 30000 : 12000);
  const controller = new AbortController();
  let callerAborted = false;

  function forwardAbort() {
    callerAborted = true;
    controller.abort();
  }

  if (options.signal) {
    if (options.signal.aborted) {
      callerAborted = true;
      controller.abort();
    } else {
      options.signal.addEventListener('abort', forwardAbort, { once: true });
    }
  }

  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = { ...(options.headers || {}) };

    const res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include', signal: controller.signal });
    if (res.status === 401) {
      _onUnauthorized?.();
      const authErr = new Error('Session expired');
      authErr.status = 401;
      throw authErr;
    }
    if (!res.ok) {
      const body = await res.text();
      const httpErr = new Error(body || `HTTP ${res.status}`);
      httpErr.status = res.status;
      throw httpErr;
    }
    if (res.status === 204) return null;
    return res.json();
  } catch (err) {
    if (callerAborted) throw err;

    if (err?.name === 'AbortError' || err instanceof TypeError) {
      const wrapped = new Error(!navigator.onLine ? 'Offline' : 'Request timed out');
      wrapped.offline = !navigator.onLine;
      wrapped.timeout = navigator.onLine;
      wrapped.network = true; // no usable response — connection down, flaky, or timed out
      throw wrapped;
    }

    throw err;
  } finally {
    window.clearTimeout(timeoutId);
    if (options.signal) {
      options.signal.removeEventListener('abort', forwardAbort);
    }
  }
}

// True when a failure means "couldn't get a usable answer" (retry later) rather than a server rejection.
export function isTransientError(err) {
  return !!(err?.network || err?.offline || err?.timeout || err?.status === 401 || (err?.status >= 500));
}

// Real connectivity check — navigator.onLine can say "online" with no usable data (weak signal, captive portal).
export async function isReachable(timeoutMs = 4000) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/api/health`, { cache: 'no-store', credentials: 'include', signal: controller.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

// ── Stations ───────────────────────────────────────────────────────────────

export function getStations() {
  return request('/api/stations');
}

export function getStationById(id) {
  return cachedGet(`station:${id}`, () => request(`/api/stations/${id}`));
}

export function getStationCoverage(id) {
  return request(`/api/stations/${id}/coverage`);
}

// ── Visits ─────────────────────────────────────────────────────────────────

export function createVisit({ station_id, technician_id, visited_at, notes, status }) {
  return request('/api/visits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ station_id, technician_id, visited_at, notes, status }),
  });
}

export function getVisit(visitId) {
  return cachedGet(`visit:${visitId}`, () => request(`/api/visits/${visitId}`));
}

export function getVisits({ status, technician_id, station_id } = {}) {
  const params = new URLSearchParams();
  if (status)       params.set('status', status);
  if (technician_id) params.set('technician_id', technician_id);
  if (station_id)   params.set('station_id', station_id);
  const qs = params.toString() ? `?${params}` : '';
  return request(`/api/visits${qs}`);
}

export function assignVisit(visitId, technicianId) {
  return request(`/api/visits/${visitId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ technician_id: technicianId }),
  });
}

export function updateVisit(visitId, { visited_at, notes }) {
  return request(`/api/visits/${visitId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visited_at, notes }),
  });
}

export function submitVisit(visitId) {
  return request(`/api/visits/${visitId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'submitted' }),
  });
}

export function abandonVisit(visitId) {
  return request(`/api/visits/${visitId}/abandon`, { method: 'POST' });
}

// ── Files ──────────────────────────────────────────────────────────────────

// Logger files can be several MB on a weak link: allow ~20 KB/s (min 60 s, max 10 min) instead of the flat 30 s.
export function uploadFile(visitId, file, signal) {
  const form = new FormData();
  form.append('file', file);
  const timeoutMs = Math.min(10 * 60 * 1000, Math.max(60 * 1000, Math.ceil((file.size || 0) / 20000) * 1000));
  return request(`/api/visits/${visitId}/files`, {
    method: 'POST',
    body: form,
    signal,
    timeoutMs,
  });
}

export function getVisitDetail(visitId) {
  return request(`/api/visits/${visitId}`);
}

export function reparseFile(fileId) {
  return request(`/api/files/${fileId}/reparse`, { method: 'POST' });
}

export function deleteFile(fileId) {
  return request(`/api/files/${fileId}/delete`, { method: 'POST' });
}

// ── Station registry (technician_lead) ─────────────────────────────────────

export function getStationsRegistry() {
  return request('/api/stations?registry=true');
}

export function createStation(data) {
  return request('/api/stations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function updateStation(stationId, data) {
  return request(`/api/stations/${stationId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function deactivateStation(stationId) {
  return request(`/api/stations/${stationId}/deactivate`, { method: 'POST' });
}

export function getBarologgerStations() {
  return request('/api/stations/barologgers');
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export function getOverdueStations() {
  return request('/api/dashboard/overdue');
}

export function getDashboardStations() {
  return request('/api/dashboard/stations');
}

export function getRecentVisits(limit = 50) {
  return request(`/api/dashboard/visits/recent?limit=${limit}`);
}

export function getFilesWithErrors() {
  return request('/api/dashboard/files/errors');
}

// ── Users ──────────────────────────────────────────────────────────────────

export function getMe() {
  return request('/api/users/me');
}

export function getUsers() {
  return request('/api/users');
}

export function createUser({ email, full_name, role, department, password }) {
  return request('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, full_name, role, department, password }),
  });
}

export function updateUser(userId, { role, active, department }) {
  return request(`/api/users/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, active, department }),
  });
}

export function acknowledgePasswordChange() {
  return request('/api/users/me/password-changed', { method: 'POST' });
}

export function getDepartments() {
  return request('/api/users/departments');
}

// ── Rainfall ───────────────────────────────────────────────────────────────

export function getStationRainfall(stationId, { resolution = 'daily', from, to } = {}) {
  const params = new URLSearchParams({ resolution });
  if (from) params.set('from', from);
  if (to)   params.set('to',   to);
  return request(`/api/stations/${stationId}/rainfall?${params}`);
}

export function getStationRainfallSummary(stationId, { from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to)   params.set('to',   to);
  return request(`/api/stations/${stationId}/rainfall/summary?${params}`);
}

export function processStationRainfall(stationId) {
  return request(`/api/stations/${stationId}/rainfall/process`, { method: 'POST' });
}

export function getStationGaps(stationId) {
  return request(`/api/stations/${stationId}/gaps`);
}

export function getStationGroundwater(stationId, { from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to)   params.set('to',   to);
  return request(`/api/stations/${stationId}/groundwater?${params}`);
}

export function getStationRawTips(stationId, { from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to)   params.set('to',   to);
  return request(`/api/stations/${stationId}/raw-tips?${params}`);
}

// ── Readings ───────────────────────────────────────────────────────────────

export function createReading(visitId, { reading_type, value_numeric, value_text, unit, recorded_at, notes }) {
  return request(`/api/visits/${visitId}/readings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reading_type, value_numeric, value_text, unit, recorded_at, notes }),
    timeoutMs: 8000, // small payload — on a dead link, fall back to the queue quickly
  });
}

export function deleteReading(visitId, readingType) {
  return request(`/api/visits/${visitId}/readings/${encodeURIComponent(readingType)}/delete`, { method: 'POST', timeoutMs: 8000 });
}

// ── Instruments ────────────────────────────────────────────────────────────

export function getInstrumentHistory(stationId) {
  return request(`/api/stations/${stationId}/instruments`);
}

export function createInstrumentRecord(stationId, { instrument_type, serial_no, mm_per_tip, visit_id, notes }) {
  return request(`/api/stations/${stationId}/instruments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instrument_type, serial_no, mm_per_tip, visit_id, notes }),
  });
}

export function getLoggerSnapshot(visitId) {
  return request(`/api/visits/${visitId}/logger-snapshot`);
}

export function getStationLoggerSnapshots() {
  return request(`/api/stations/logger-snapshots`);
}

// ── Met instruments ────────────────────────────────────────────────────────

export function getMetInstrumentTypes() {
  return cachedGet('met:instrument-types', () => request('/api/met/instrument-types'));
}

export function getTransferStandards() {
  return cachedGet('met:transfer-standards', () => request('/api/met/transfer-standards'));
}

export function getStationSensors(stationId) {
  return cachedGet(`station:${stationId}:sensors`, () => request(`/api/stations/${stationId}/sensors`));
}

export function getStationPowerSpecs(stationId) {
  return cachedGet(`station:${stationId}:power-specs`, () => request(`/api/stations/${stationId}/power-specs`));
}

export function getStationSensorHistory(stationId) {
  return cachedGet(`station:${stationId}:sensor-history`, () => request(`/api/stations/${stationId}/sensors/history`));
}

export function getStationCalibrationHistory(stationId) {
  return request(`/api/stations/${stationId}/calibration-history`);
}

export function getStationMetData(stationId, { from, to, category = 'temperature', resolution = 'hour' } = {}) {
  const params = new URLSearchParams({ category, resolution });
  if (from) params.set('from', from);
  if (to)   params.set('to',   to);
  return request(`/api/stations/${stationId}/met?${params}`);
}

export function decommissionSensor(stationId, sensorId) {
  return request(`/api/stations/${stationId}/sensors/${sensorId}/decommission`, { method: 'PATCH' });
}

export function assignSensor(stationId, data) {
  return request(`/api/stations/${stationId}/sensors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function createCalibrationCheck(visitId, data) {
  return request(`/api/visits/${visitId}/calibration-checks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function getCalibrationChecks(visitId) {
  return cachedGet(`visit:${visitId}:calibration-checks`, () => request(`/api/visits/${visitId}/calibration-checks`));
}

// Warm the cache with everything a visit at this station needs, while there is still signal.
export function prefetchVisitData(station) {
  if (!station?.id) return Promise.resolve([]);
  const id = station.id;
  const jobs = [getStationById(id)];
  if (station.data_family === 'met') {
    jobs.push(
      getStationSensors(id),
      getMetInstrumentTypes(),
      getTransferStandards(),
      getStationPowerSpecs(id),
      getStationSensorHistory(id),
    );
  }
  return Promise.allSettled(jobs);
}

export function getAllPhenomena() {
  return request('/api/phenomena');
}

export function createPhenomenon(data) {
  return request('/api/phenomena', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function updatePhenomenon(id, data) {
  return request(`/api/phenomena/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function getPendingColumnMappings() {
  return request('/api/column-mappings/pending');
}

export function resolveColumnMapping(id, phenomenonId) {
  return request(`/api/column-mappings/${id}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phenomenon_id: phenomenonId }),
  });
}

export function ignoreColumnMapping(id) {
  return request(`/api/column-mappings/${id}/ignore`, {
    method: 'POST',
  });
}

export function getActiveMappings() {
  return request('/api/column-mappings/active');
}

export function updateColumnMappingNodes(id, nodes) {
  return request(`/api/column-mappings/${id}/nodes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nodes),
  });
}

export function reassignColumnMapping(id, phenomenonId) {
  return request(`/api/column-mappings/${id}/reassign`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phenomenon_id: phenomenonId }),
  });
}
