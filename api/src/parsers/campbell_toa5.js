// parsers/campbell_toa5.js
// Campbell Scientific TOA5 meteorological logger — streaming version
// Uses readline to process line-by-line; never loads the full file into memory.
//
// Header structure (confirmed from cs_toa5.rda, data_row=4):
//   Line 1: "TOA5","StationName","CR1000","SN","OS","Program","Sig","TableName"
//   Line 2: column names  — "TIMESTAMP","RECORD","AirTemp_Avg",...
//   Line 3: units         — "TS","RN","degC",...
//   Line 4: measure types — "","","Avg","Tot","Smp",...
//   Line 5+: data rows
//
// TIMESTAMP column is always first. Format: "YYYY-MM-DD HH:MM:SS"

'use strict';
const readline = require('readline');
const fs       = require('fs');

// Map Campbell column names (lowercase) to phenomenon names in the phenomena table.
// Two naming conventions are in use across SAEON stations:
//   New standard (five_min/hourly tables): lowercase snake_case — temp_air_avg, humid_rel, ...
//   Old standard (TableHour/TableDay):     PascalCase          — WSpd_Avg, BPress_Avg, ...
// Both are normalised to lowercase before lookup.
const PHEN_NAME_MAP = {
  // ── Air temperature ──────────────────────────────────────────────────────────
  'airtc_avg':        'air_temp_avg',
  'airtc_min':        'air_temp_min',
  'airtc_max':        'air_temp_max',
  'airtemp_avg':      'air_temp_avg',
  'airtemp_min':      'air_temp_min',
  'airtemp_max':      'air_temp_max',
  'air_temp_avg':     'air_temp_avg',
  'air_temp_min':     'air_temp_min',
  'air_temp_max':     'air_temp_max',
  'temp_air_avg':     'air_temp_avg',
  'temp_air_min':     'air_temp_min',
  'temp_air_max':     'air_temp_max',

  // ── Relative humidity ────────────────────────────────────────────────────────
  'rh':               'rh_avg',
  'rh_avg':           'rh_avg',
  'relhumidity':      'rh_avg',
  'humid_rel':        'rh_avg',

  // ── Wind speed ───────────────────────────────────────────────────────────────
  'ws_ms_s_wvt':      'wind_speed_avg',
  'windspeed_avg':    'wind_speed_avg',
  'wind_speed_avg':   'wind_speed_avg',
  'wspd_avg':         'wind_speed_avg',

  // ── Wind direction ───────────────────────────────────────────────────────────
  'winddir_d1_wvt':   'wind_dir_avg',
  'winddir_avg':      'wind_dir_avg',
  'wind_dir_avg':     'wind_dir_avg',
  'wdir_avg':         'wind_dir_avg',

  // ── Solar radiation (shortwave) ──────────────────────────────────────────────
  'slrw_avg':         'solar_rad_avg',
  'solarrad_avg':     'solar_rad_avg',
  'solar_rad_avg':    'solar_rad_avg',
  'rad_short_in_avg': 'solar_rad_avg',

  // ── Atmospheric pressure ─────────────────────────────────────────────────────
  'bp_kpa':           'atm_pressure_avg',
  'atmpres_avg':      'atm_pressure_avg',
  'atm_pressure_avg': 'atm_pressure_avg',
  'pressure_atm':     'atm_pressure_avg',
  'bpress_avg':       'atm_pressure_avg',
  'bpressure_avg':    'atm_pressure_avg',
  'bp_mbar_avg':      'atm_pressure_avg',

  // ── Rainfall ─────────────────────────────────────────────────────────────────
  'rain_mm_tot':      'rain_tot',
  'rain_tot':         'rain_tot',
  'rainfall_tot':     'rain_tot',

  // ── UV radiation ─────────────────────────────────────────────────────────────
  'rad_uv_avg':       'uv_rad_avg',
  'uv_w_avg':         'uv_rad_avg',
  'uvslrw_avg':       'uv_rad_avg',

  // ── Soil / ground temperature ─────────────────────────────────────────────────
  'temp_ground_avg':  'soil_temp_avg',
  'soiltemp_avg':     'soil_temp_avg',
  't107_c_avg':       'soil_temp_avg',
  't108_c_avg':       'soil_temp_avg',
  't109_c_avg':       'soil_temp_avg',

  // ── Leaf wetness ──────────────────────────────────────────────────────────────
  'leafwetmv_avg':    'leaf_wetness_mv',
  'lwmv_avg':         'leaf_wetness_mv',

  // ── Soil moisture ────────────────────────────────────────────────────────────
  'vw_avg':           'soil_moisture_avg',

  // ── Logger diagnostics ───────────────────────────────────────────────────────
  'loggertemp_avg':        'temp_c',
  'loggerbattery_avg':     'batt_v',
  'loggerbatt_avg':        'batt_v',
  'battv_min':             'batt_v',
  'batt_min':              'batt_v',
  'loggerlithiumbatt_avg': 'batt_v_lithium',
};

function splitLine(line) {
  const fields = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { fields.push(cur); cur = ''; continue; }
    cur += ch;
  }
  fields.push(cur);
  return fields;
}

function parseToa5Date(raw) {
  const s = raw.trim().replace(/"/g, '');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(\.\d+)?$/);
  if (!m) throw new Error(`Unrecognised TOA5 timestamp: "${s}"`);
  const [, yr, mo, dy, hr, mn, sc] = m;
  return new Date(Date.UTC(+yr, +mo - 1, +dy, +hr, +mn, +sc));
}

// Read the first N lines of a file without loading the whole file
function readFirstNLines(filePath, n) {
  return new Promise((resolve, reject) => {
    const lines = [];
    const rl = readline.createInterface({
      input:     fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });
    rl.on('line', line => {
      lines.push(line);
      if (lines.length >= n) rl.close();
    });
    rl.on('close', () => resolve(lines));
    rl.on('error', reject);
  });
}

module.exports = async function parseCampbellToa5(filePath) {
  // ── Eagerly read 4-line header ──────────────────────────────────────────────
  const headerLines = await readFirstNLines(filePath, 4);
  if (headerLines.length < 4) throw new Error('TOA5 file too short — expected at least 4 header lines');

  const row0 = splitLine(headerLines[0]); // file info
  const row1 = splitLine(headerLines[1]); // column names
  const row2 = splitLine(headerLines[2]); // units
  const row3 = splitLine(headerLines[3]); // measure types

  const streamName = row0[row0.length - 1] || 'raw_met';

  const tsIdx = row1.findIndex(n => n.toUpperCase() === 'TIMESTAMP');
  if (tsIdx === -1) throw new Error('TOA5 file: no TIMESTAMP column');

  const cols = [];
  for (let i = 0; i < row1.length; i++) {
    if (i === tsIdx) continue;
    const name = row1[i].trim();
    if (!name || name.toUpperCase() === 'RECORD') continue;
    const phenName = PHEN_NAME_MAP[name.toLowerCase()] || null;
    cols.push({
      index:   i,
      unit:    (row2[i] || '').trim(),
      measure: (row3[i] || '').trim(),
      phenName,
    });
  }

  // ── Streaming data rows ─────────────────────────────────────────────────────
  async function* stream() {
    const rl = readline.createInterface({
      input:     fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });

    let lineNum = 0;
    for await (const line of rl) {
      lineNum++;
      if (lineNum <= 4) continue; // skip 4-line header
      const trimmed = line.trim();
      if (!trimmed) continue;

      const fields = splitLine(line);
      if (fields.length < 2) continue;

      let measuredAt;
      try {
        measuredAt = parseToa5Date(fields[tsIdx]);
        if (isNaN(measuredAt.getTime())) continue;
      } catch (e) { continue; }

      const rowMeasurements = [];
      for (const col of cols) {
        if (!col.phenName) continue;
        const raw = (fields[col.index] !== undefined ? fields[col.index] : '').trim();
        if (raw === '' || raw === 'NAN' || raw === 'INF' || raw === '-INF') continue;
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

  return { streamName, stream: stream() };
};

module.exports.streaming = true;
