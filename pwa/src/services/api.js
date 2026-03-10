// src/services/api.js
// All API calls in one place. Components never call fetch directly.

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Stations ───────────────────────────────────────────────────────────────

export function getStations() {
  return request('/api/stations');
}

export function getStationById(id) {
  return request(`/api/stations/${id}`);
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

export function getVisits({ status, technician_id } = {}) {
  const params = new URLSearchParams();
  if (status)       params.set('status', status);
  if (technician_id) params.set('technician_id', technician_id);
  const qs = params.toString() ? `?${params}` : '';
  return request(`/api/visits${qs}`);
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

// ── Readings ───────────────────────────────────────────────────────────────

export function createReading(visitId, { reading_type, value_numeric, value_text, unit, recorded_at, notes }) {
  return request(`/api/visits/${visitId}/readings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reading_type, value_numeric, value_text, unit, recorded_at, notes }),
  });
}
