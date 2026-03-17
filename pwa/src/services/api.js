// src/services/api.js
// All API calls in one place. Components never call fetch directly.

import keycloak from '../auth/keycloak';

const BASE = import.meta.env.VITE_API_URL ?? '';

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
    if (keycloak.token) headers['Authorization'] = `Bearer ${keycloak.token}`;

    const res = await fetch(`${BASE}${path}`, { ...options, headers, signal: controller.signal });
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
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ technician_id: technicianId }),
  });
}

export function updateVisit(visitId, { visited_at, notes }) {
  return request(`/api/visits/${visitId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visited_at, notes }),
  });
}

export function submitVisit(visitId) {
  return request(`/api/visits/${visitId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'submitted' }),
  });
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

export function reparseFile(fileId) {
  return request(`/api/files/${fileId}/reparse`, { method: 'POST' });
}

export function deleteFile(fileId) {
  return request(`/api/files/${fileId}`, { method: 'DELETE' });
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
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function deactivateStation(stationId) {
  return request(`/api/stations/${stationId}`, { method: 'DELETE' });
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

export function getAvailableKeycloakUsers() {
  return request('/api/users/available');
}

export function getMe() {
  return request('/api/users/me');
}

export function getUsers() {
  return request('/api/users');
}

export function createUser({ email, full_name, role }) {
  return request('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, full_name, role }),
  });
}

export function updateUser(userId, { role, active }) {
  return request(`/api/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, active }),
  });
}

// ── Readings ───────────────────────────────────────────────────────────────

export function createReading(visitId, { reading_type, value_numeric, value_text, unit, recorded_at, notes }) {
  return request(`/api/visits/${visitId}/readings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reading_type, value_numeric, value_text, unit, recorded_at, notes }),
  });
}
