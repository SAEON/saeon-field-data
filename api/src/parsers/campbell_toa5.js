'use strict';
const readline = require('readline');
const fs       = require('fs');

const PHEN_NAME_MAP = {
  'airtc_avg':        'temp_air_avg',
  'airtc_min':        'temp_air_min',
  'airtc_max':        'temp_air_max',
  'airtemp_avg':      'temp_air_avg',
  'airtemp_min':      'temp_air_min',
  'airtemp_max':      'temp_air_max',
  'air_temp_avg':     'temp_air_avg',
  'air_temp_min':     'temp_air_min',
  'air_temp_max':     'temp_air_max',
  'temp_air_avg':     'temp_air_avg',
  'temp_air_min':     'temp_air_min',
  'temp_air_max':     'temp_air_max',
  'rh':               'humid_rel_avg',
  'rh_avg':           'humid_rel_avg',
  'relhumidity':      'humid_rel_avg',
  'humid_rel':        'humid_rel_avg',
  'humid_rel_avg':    'humid_rel_avg',
  'ws_ms_s_wvt':      'wind_speed_avg',
  'windspeed_avg':    'wind_speed_avg',
  'wind_speed_avg':   'wind_speed_avg',
  'wspd_avg':         'wind_speed_avg',
  'winddir_d1_wvt':   'wind_dir_avg',
  'winddir_avg':      'wind_dir_avg',
  'wind_dir_avg':     'wind_dir_avg',
  'wdir_avg':         'wind_dir_avg',
  'slrw_avg':         'rad_solar_avg',
  'solarrad_avg':     'rad_solar_avg',
  'solar_rad_avg':    'rad_solar_avg',
  'rad_short_in_avg': 'rad_solar_avg',
  'rad_solar_avg':    'rad_solar_avg',
  'bp_kpa':           'pressure_atm_avg',
  'atmpres_avg':      'pressure_atm_avg',
  'atm_pressure_avg': 'pressure_atm_avg',
  'pressure_atm':     'pressure_atm_avg',
  'pressure_atm_avg': 'pressure_atm_avg',
  'bpress_avg':       'pressure_atm_avg',
  'bpressure_avg':    'pressure_atm_avg',
  'bp_mbar_avg':      'pressure_atm_avg',
  'rain_mm_tot':      'rain_tot',
  'rain_tot':         'rain_tot',
  'rainfall_tot':     'rain_tot',
  'rad_uv_avg':       'rad_uv_avg',
  'uv_w_avg':         'rad_uv_avg',
  'uvslrw_avg':       'rad_uv_avg',
  'uv_rad_avg':       'rad_uv_avg',
  'temp_ground_avg':  'temp_soil_avg',
  'soiltemp_avg':     'temp_soil_avg',
  'soil_temp_avg':    'temp_soil_avg',
  'temp_soil_avg':    'temp_soil_avg',
  't107_c_avg':       'temp_soil_avg',
  't108_c_avg':       'temp_soil_avg',
  't109_c_avg':       'temp_soil_avg',
  'leafwetmv_avg':    'leaf_wet_avg',
  'lwmv_avg':         'leaf_wet_avg',
  'leaf_wet_avg':     'leaf_wet_avg',
  'vw_avg':           'moisture_soil_avg',
  'moisture_soil_avg':'moisture_soil_avg',
  'loggertemp_avg':        'temp_logg_avg',
  'temp_logg_avg':         'temp_logg_avg',
  'loggerbattery_avg':     'batt_avg',
  'loggerbatt_avg':        'batt_avg',
  'battv_min':             'batt_avg',
  'batt_min':              'batt_avg',
  'batt_avg':              'batt_avg',
  'loggerlithiumbatt_avg': 'batt_lith_avg',
  'batt_lith_avg':         'batt_lith_avg',
  'etos':                  'et_ref_tot',
  'et_ref_tot':            'et_ref_tot',
  'pressure_vapour_def_avg': 'pressure_vpd_avg',
  'pressure_vpd_avg':        'pressure_vpd_avg',
  'vpd_avg':                 'pressure_vpd_avg',
  'temp_dew_point_avg':    'temp_dew_avg',
  'temp_dew_avg':          'temp_dew_avg',
  'dewpoint_avg':          'temp_dew_avg',
  'temp_ground_min':       'temp_ground_min',
  'wind_dir_sd':           'wind_dir_sd',
  'winddir_sd':            'wind_dir_sd',
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

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

function parseToa5Date(raw) {
  const s = raw.trim().replace(/"/g, '');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(\.\d+)?$/);
  if (!m) throw new Error(`Unrecognised TOA5 timestamp: "${s}"`);
  const [, yr, mo, dy, hr, mn, sc] = m;
  return new Date(Date.UTC(+yr, +mo - 1, +dy, +hr, +mn, +sc) - SAST_OFFSET_MS);
}

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

module.exports = async function parseCampbellToa5(filePath, { extraMappings = {} } = {}) {
  const headerLines = await readFirstNLines(filePath, 4);
  if (headerLines.length < 4) throw new Error('TOA5 file too short — expected at least 4 header lines');

  const row0 = splitLine(headerLines[0]);
  const row1 = splitLine(headerLines[1]);
  const row2 = splitLine(headerLines[2]);
  const row3 = splitLine(headerLines[3]);

  const streamName = row0[row0.length - 1] || 'raw_met';

  const tsIdx = row1.findIndex(n => n.toUpperCase() === 'TIMESTAMP');
  if (tsIdx === -1) throw new Error('TOA5 file: no TIMESTAMP column');

  const unmappedColumns = new Map();
  const cols = [];
  for (let i = 0; i < row1.length; i++) {
    if (i === tsIdx) continue;
    const name = row1[i].trim();
    if (!name || name.toUpperCase() === 'RECORD') continue;
    const key     = name.toLowerCase();
    const phenName = PHEN_NAME_MAP[key] || extraMappings[key] || null;
    if (!phenName) unmappedColumns.set(name, {
      uz_units:   (row2[i] || '').trim() || null,
      uz_measure: (row3[i] || '').trim() || null,
    });
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
      if (lineNum <= 4) continue;
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

  return { streamName, stream: stream(), _metadata: { unmappedColumns: [...unmappedColumns.entries()].map(([name, meta]) => ({ name, ...meta })) } };
};

module.exports.streaming = true;
