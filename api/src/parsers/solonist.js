// parsers/solonist.js
// Solonist XLE groundwater logger — XML format
// XPaths confirmed from solonist.rda:
//   instrument info : //Body_xle/Instrument_info
//   channel headers : //Body_xle/Ch*_data_header  (Ch1, Ch2, ...)
//   data records    : //Body_xle/Data/Log
//   date            : //Body_xle/Data/Log/Date
//   time            : //Body_xle/Data/Log/Time

const xml2js = require('xml2js');

// Map Solonist channel identifiers to phenomenon names in the phenomena table
const PHEN_MAP = {
  'level':       'water_level_smp',
  'water level': 'water_level_smp',
  'pressure':    'water_level_smp',
  'temperature': 'water_temp_smp',
  'temp':        'water_temp_smp',
  'conductivity':'conductivity_smp',
  'baromatic':   'baro_pressure_smp',
  'barometric':  'baro_pressure_smp',
};

function resolvePhenName(identification) {
  if (!identification) return null;
  const lower = identification.toLowerCase().trim();
  for (const [key, val] of Object.entries(PHEN_MAP)) {
    if (lower.includes(key)) return val;
  }
  // Fallback: snake_case the identification string
  return lower.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_smp';
}

// Parse "YYYY/MM/DD" + "HH:MM:SS" → UTC Date
function parseSolonistDate(dateStr, timeStr) {
  const d = (dateStr || '').trim();
  const t = (timeStr || '').trim();
  // Date comes as YYYY/MM/DD or YYYY-MM-DD
  const dateNorm = d.replace(/\//g, '-');
  return new Date(`${dateNorm}T${t}Z`);
}

// Safely get text content from a parsed xml2js node
function text(node) {
  if (!node) return null;
  if (typeof node === 'string') return node.trim();
  if (Array.isArray(node)) return text(node[0]);
  if (node._) return node._.trim();
  return null;
}

module.exports = async function parseSolonist(buffer) {
  const xmlStr = buffer.toString('utf8');
  const parsed = await xml2js.parseStringPromise(xmlStr, { explicitArray: true });

  const body = parsed['Body_xle'];
  if (!body) throw new Error('Solonist XLE: missing Body_xle root element');

  // ── Channel metadata (phenomena) ──────────────────────────────────────────
  // Channels live at Ch1_data_header, Ch2_data_header, ...
  const channels = [];
  let chIndex = 1;
  while (body[`Ch${chIndex}_data_header`]) {
    const ch      = body[`Ch${chIndex}_data_header`][0];
    const ident   = text(ch.Identification);
    const unit    = text(ch.Unit);
    const offset  = parseFloat(text(ch.Offset)) || 0;

    channels.push({
      index:     chIndex,         // 1-based, matches Ch1 in data rows
      phenName:  resolvePhenName(ident),
      unit,
      offset,
    });
    chIndex++;
  }

  if (!channels.length) throw new Error('Solonist XLE: no channel headers found');

  // ── Data records ───────────────────────────────────────────────────────────
  const logEntries = (body.Data && body.Data[0] && body.Data[0].Log) ? body.Data[0].Log : [];

  const measurements = [];
  let dateRangeStart = null;
  let dateRangeEnd   = null;

  for (const log of logEntries) {
    const dateStr = text(log.Date);
    const timeStr = text(log.Time);
    if (!dateStr || !timeStr) continue;

    let measuredAt;
    try {
      measuredAt = parseSolonistDate(dateStr, timeStr);
      if (isNaN(measuredAt.getTime())) continue;
    } catch (e) {
      continue;
    }

    if (!dateRangeStart || measuredAt < dateRangeStart) dateRangeStart = measuredAt;
    if (!dateRangeEnd   || measuredAt > dateRangeEnd)   dateRangeEnd   = measuredAt;

    for (const ch of channels) {
      // Channel values are in Ch1, Ch2, ... nodes within each Log entry
      const rawVal = text(log[`ch${ch.index}`] || log[`Ch${ch.index}`]);
      if (rawVal === null || rawVal === '') continue;

      const num = parseFloat(rawVal) + ch.offset;

      measurements.push({
        phenomenon_name: ch.phenName,
        measured_at:     measuredAt,
        value_numeric:   isNaN(num) ? null : num,
        value_text:      null,
        is_interference: false,
      });
    }
  }

  return {
    streamName: 'raw_groundwater',
    metadata: {
      date_range_start: dateRangeStart,
      date_range_end:   dateRangeEnd,
      record_count:     measurements.length,
    },
    measurements,
  };
};
