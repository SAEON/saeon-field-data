// src/services/api.js
// All API calls in one place. Components never call fetch directly.

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
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

export function createVisit({ station_id, technician_id, visited_at, notes }) {
  return request('/api/visits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ station_id, technician_id, visited_at, notes }),
  });
}

// ── Files ──────────────────────────────────────────────────────────────────

export function uploadFile(visitId, file) {
  const form = new FormData();
  form.append('file', file);
  return request(`/api/visits/${visitId}/files`, {
    method: 'POST',
    body: form,
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
