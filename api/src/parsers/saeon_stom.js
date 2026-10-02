'use strict';
const readline = require('readline');
const fs       = require('fs');

const PHEN_NAME_MAP = {
  'humid_rel':        'humid_rel_avg',
  'humid_rel_avg':    'humid_rel_avg',
  'rh_avg':           'humid_rel_avg',
  'rad_solar_avg':    'rad_solar_avg',
  'solar_rad_avg':    'rad_solar_avg',
  'rain_tot':         'rain_tot',
  'temp_air_avg':     'temp_air_avg',
  'temp_air_min':     'temp_air_min',
  'temp_air_max':     'temp_air_max',
  'air_temp_avg':     'temp_air_avg',
  'air_temp_min':     'temp_air_min',
  'air_temp_max':     'temp_air_max',
  'wind_dir_avg':     'wind_dir_avg',
  'wind_speed_avg':   'wind_speed_avg',
  'wind_speed_max':   'wind_speed_max',
  'atm_press_avg':    'pressure_atm_avg',
  'atm_pressure_avg': 'pressure_atm_avg',
  'pressure_atm_avg': 'pressure_atm_avg',
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

    let phase  = 'comments';
    let tsIdx  = -1;
    let cols   = [];

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (phase === 'comments') {
        if (trimmed.startsWith('#')) continue;
        const headerRow = splitCsvLine(line);
        tsIdx = headerRow.findIndex(h => h.toLowerCase() === 'timestamp');
        if (tsIdx === -1) return;

        for (let i = 0; i < headerRow.length; i++) {
          if (i === tsIdx) continue;
          const name = headerRow[i].trim();
          const phenName = PHEN_NAME_MAP[name.toLowerCase()] || null;
          if (name && phenName) cols.push({ index: i, phenName });
        }
        phase = 'units_check';
        continue;
      }

      if (phase === 'units_check') {
        const fields = splitCsvLine(line);
        if (fields[tsIdx] === '' || fields[tsIdx].toLowerCase() === 'unit') {
          phase = 'data';
          continue;
        }
        phase = 'data';
      }

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
