// Starting points taken from the previous visit. They are only ever offered or filled into EMPTY fields, are
// always editable, and never include measurements (voltages, dipper depth, gauge readings, live readings) or
// one-off events (filter replaced, bearings replaced, cleaning done): those must be recorded afresh each visit.

// Per-sensor maintenance answers that describe the sensor's state and usually carry over
export const CARRY_OVER_MAINT_KEYS = ['physical_condition', 'cleanliness', 'level_as_found', 'level_if_adjusted', 'bearing_condition', 'wetness_test'];

// The answers from last visit for one sensor: { key: value }
export function lastSensorAnswers(lastVisit, sensorId, fieldKeys) {
  const out = {};
  for (const key of fieldKeys) {
    if (!CARRY_OVER_MAINT_KEYS.includes(key)) continue;
    const r = lastVisit?.readings?.[`smaint:${sensorId}:${key}`];
    if (r?.value_text) out[key] = r.value_text;
  }
  return out;
}

// "• Site access: No issues, Other: x · • Equipment: All good · • extra" → the chips chosen in each prompt
export function parseSiteNotes(notes, prompts) {
  if (!notes) return null;
  const segments = notes.split(' · ');
  const selections = {};
  const otherNotes = {};
  let found = false;
  for (const p of prompts) {
    selections[p.id] = [];
    const seg = segments.find(s => s.startsWith(`• ${p.label}: `));
    if (!seg) continue;
    const text = seg.slice(`• ${p.label}: `.length);
    for (const opt of p.options) {
      if (opt === 'Other') continue;
      if (text.split(', ').includes(opt)) { selections[p.id].push(opt); found = true; }
    }
    const other = text.match(/(?:^|, )Other(?:: (.*))?$/);
    if (other && p.options.includes('Other')) {
      selections[p.id].push('Other');
      if (other[1]) otherNotes[p.id] = other[1];
      found = true;
    }
  }
  // an old note may have "No issues" next to a problem: keep the problems
  for (const p of prompts) {
    if (p.allClear && selections[p.id].length > 1) selections[p.id] = selections[p.id].filter(v => v !== p.allClear);
  }
  return found ? { selections, otherNotes } : null;
}

// The newest gauge or logger record of one type: { serial_no, asset_no, mm_per_tip } or null
export function latestInstrument(history, type) {
  const rows = (history || []).filter(h => h.instrument_type === type);
  if (rows.length === 0) return null;
  rows.sort((a, b) => new Date(b.effective_from) - new Date(a.effective_from));
  const { serial_no, asset_no, mm_per_tip } = rows[0];
  return { serial_no: serial_no || '', asset_no: asset_no || '', mm_per_tip: mm_per_tip ?? null };
}

// Remember the transfer standard last used for a parameter on this device
const TS_KEY = parameter => `fds_last_ts_${parameter}`;
export function rememberTransferStandard(parameter, id) {
  try { localStorage.setItem(TS_KEY(parameter), String(id)); } catch { /* storage unavailable */ }
}
export function lastTransferStandard(parameter) {
  try { return localStorage.getItem(TS_KEY(parameter)) || ''; } catch { return ''; }
}
