// What a visit has to contain follows from what it is for. The technician chooses the purpose during the
// visit (the Purpose of visit / activity buttons on the Readings step), nothing is chosen up front.
//   - Collecting data (a Download) is a routine visit: the full set of readings, the site notes and the
//     logger file are all needed.
//   - Any other purpose (maintenance, calibration, instrument change, deployment …) asks only for the work
//     that was done and the site condition; the rest stays available but optional.
//   - Until a purpose is chosen the visit counts as routine, so nothing is skipped by accident.

export const DOWNLOAD_ACTS = new Set(['download', 'logger_download', 'raingauge_download']);

const ACTIVITY_TYPES = ['logger_activities', 'raingauge_activities', 'met_activities'];

export function isRoutine(purposes) {
  return !purposes || purposes.length === 0 || purposes.some(p => DOWNLOAD_ACTS.has(p));
}

// The purposes recorded so far, read from the saved activity readings
export function purposesFromReadings(readings) {
  const out = [];
  for (const r of readings || []) {
    if (!ACTIVITY_TYPES.includes(r.reading_type) || !r.value_text) continue;
    try { out.push(...JSON.parse(r.value_text)); } catch { /* not a list */ }
  }
  return out;
}

// Are the manual readings complete? `required` is the family's full list (used by routine visits).
export function readingsComplete({ saved, required, routine }) {
  const types = new Set(saved.map(r => r.reading_type));
  if (!routine) return types.has('overall_site_condition') && ACTIVITY_TYPES.some(t => types.has(t));
  return required.every(t => types.has(t));
}

// Site notes (access / equipment prompts, rainfall question) and the logger file belong to a routine visit
export const detailsRequired = routine => routine;
export const filesRequired   = routine => routine;

// ── Sensor scope (met stations) ──────────────────────────────────────────────
// The sensors the technician said the work was done on. null means every sensor (a visit saved before this
// choice existed); a new visit starts with nothing chosen.

export const initialScope = () => [];

export function scopedSensors(sensors, scope) {
  return scope == null ? sensors : sensors.filter(s => scope.includes(s.id));
}

export const scopeIsEmpty = scope => scope != null && scope.length === 0;

export function addToScope(scope, id) {
  if (scope == null || scope.includes(id)) return scope;
  return [...scope, id];
}

export function addAllToScope(scope, sensors) {
  if (scope == null) return scope;
  return [...new Set([...scope, ...sensors.map(s => s.id)])];
}

export function removeFromScope(scope, id) {
  return scope == null ? scope : scope.filter(x => x !== id);
}

// A replaced sensor gets a new id: carry the choice over to it
export function replaceInScope(scope, oldId, newId) {
  if (scope == null) return scope;
  return scope.includes(oldId) ? [...scope.filter(x => x !== oldId), newId] : scope;
}
