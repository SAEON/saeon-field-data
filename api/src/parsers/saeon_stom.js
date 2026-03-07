// parsers/saeon_stom.js
// SAEON Terrestrial Observation Monitor (STOM) CSV export — streaming version
// Uses readline to process line-by-line; never loads the full file into memory.
//
// Source spec: cs_stom.r (ipayipi package)
// Variants detected by leading # comment line count:
//   try1: 2 # comment lines | phen row 3 | units row 4 | data from row 5
//   try2: 0 # comment lines | phen row 1 | no units    | data from row 2
//   try3: 1 # comment line  | phen row 2 | units row 3 | data from row 4

'use strict';
const readline = require('readline');
const fs       = require('fs');

// Map STOM column names (lowercase) → phenomena table names
const PHEN_NAME_MAP = {
  'humid_rel':        'rh_avg',
  'rad_solar_avg':    'solar_rad_avg',
  'rain_tot':         'rain_tot',
  'temp_air_avg':     'air_temp_avg',
  'wind_dir_avg':     'wind_dir_avg',
  'wind_speed_avg':   'wind_speed_avg',
  'atm_press_avg':    'atm_pressure_avg',
  'rh_avg':           'rh_avg',
  'solar_rad_avg':    'solar_rad_avg',
  'air_temp_avg':     'air_temp_avg',
  'air_temp_min':     'air_temp_min',
  'air_temp_max':     'air_temp_max',
  'wind_speed_max':   'wind_speed_max',
  'atm_pressure_avg': 'atm_pressure_avg',
};

function splitCsvLine(line) {
  const fields = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  fields.push(cur.trim());
  return fields;
}

function parseStomDate(raw) {
  const s = raw.replace(/"/g, '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    const [, yr, mo, dy, hr, mn, sc] = m;
    return new Date(Date.UTC(+yr, +mo - 1, +dy, +hr, +mn, +sc));
  }
  throw new Error(`Unrecognised STOM timestamp: "${s}"`);
}

module.exports = async function parseSaeonStom(filePath) {
  async function* stream() {
    const rl = readline.createInterface({
      input:     fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });

    let phase  = 'comments'; // → 'header' → 'units_check' → 'data'
    let tsIdx  = -1;
    let cols   = [];

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // ── Count comment lines, find header ──────────────────────────────────
      if (phase === 'comments') {
        if (trimmed.startsWith('#')) continue;
        const headerRow = splitCsvLine(line);
        tsIdx = headerRow.findIndex(h => h.toLowerCase() === 'timestamp');
        if (tsIdx === -1) return; // no timestamp column — abort

        for (let i = 0; i < headerRow.length; i++) {
          if (i === tsIdx) continue;
          const name = headerRow[i].trim();
          const phenName = PHEN_NAME_MAP[name.toLowerCase()] || null;
          if (name && phenName) cols.push({ index: i, phenName });
        }
        phase = 'units_check';
        continue;
      }

      // ── Skip units row if first cell is empty ─────────────────────────────
      if (phase === 'units_check') {
        const fields = splitCsvLine(line);
        if (fields[tsIdx] === '' || fields[tsIdx].toLowerCase() === 'unit') {
          phase = 'data';
          continue; // skip units row
        }
        phase = 'data';
        // fall through — this line IS a data row
      }

      // ── Parse data row ────────────────────────────────────────────────────
      const fields = splitCsvLine(line);
      if (fields.length < 2) continue;

      let measuredAt;
      try {
        measuredAt = parseStomDate(fields[tsIdx]);
        if (isNaN(measuredAt.getTime())) continue;
      } catch (e) { continue; }

      const rowMeasurements = [];
      for (const col of cols) {
        const raw = (fields[col.index] !== undefined ? fields[col.index] : '')
          .replace(/"/g, '').trim();
        if (raw === '' || raw === 'NA' || raw === 'NaN') continue;
        const num = parseFloat(raw);
        rowMeasurements.push({
          phenomenon_name: col.phenName,
          measured_at:     measuredAt,
          value_numeric:   isNaN(num) ? null : num,
          value_text:      isNaN(num) ? raw : null,
          is_interference: false,
        });
      }
      if (rowMeasurements.length > 0) yield rowMeasurements;
    }
  }

  return { streamName: 'raw_stom', stream: stream() };
};

module.exports.streaming = true;
