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
      throw new Error('Session expired');
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  } catch (err) {
    if (callerAborted) throw err;

    if (err?.name === 'AbortError' || err instanceof TypeError) {
      const wrapped = new Error(!navigator.onLine ? 'Offline' : 'Request timed out');
      wrapped.offline = !navigator.onLine;
      wrapped.timeout = navigator.onLine;
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

// ── Stations ───────────────────────────────────────────────────────────────

export function getStations() {
  return request('/api/stations');
}

export function getStationById(id) {
  return request(`/api/stations/${id}`);
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
  return request(`/api/visits/${visitId}`);
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

export function uploadFile(visitId, file, signal) {
  const form = new FormData();
  form.append('file', file);
  return request(`/api/visits/${visitId}/files`, {
    method: 'POST',
    body: form,
    signal,
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
  });
}

export function deleteReading(visitId, readingType) {
  return request(`/api/visits/${visitId}/readings/${readingType}/delete`, { method: 'POST' });
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
