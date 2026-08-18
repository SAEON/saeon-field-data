// Solinst XLE groundwater logger — XML format
// Supports: LT_Gold, LT_Jr, LT_EDGE, LT_EDGE_JR, LTC_Jr, LTC_EDGE, L5_LT, L5_LTC
// Handles level loggers (Ch1 unit: m) and barologgers (Ch1 unit: kPa or psi)

const xml2js = require('xml2js');

const PHEN_MAP = {
  'level':        'water_level_smp',
  'water level':  'water_level_smp',
  'pressure':     'water_level_smp',
  'temperature':  'water_temp_smp',
  'temp':         'water_temp_smp',
  'conductivity': 'conductivity_smp',
  'baromatic':    'baro_pressure_smp',
  'barometric':   'baro_pressure_smp',
};

function resolvePhenName(identification) {
  if (!identification) return null;
  const lower = identification.toLowerCase().trim();
  for (const [key, val] of Object.entries(PHEN_MAP)) {
    if (lower.includes(key)) return val;
  }
  return lower.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_smp';
}

function parseSolinstDate(dateStr, timeStr) {
  const d = (dateStr || '').trim().replace(/\//g, '-');
  const t = (timeStr || '00:00:00').trim();
  return new Date(`${d}T${t}+02:00`);
}

function text(node) {
  if (!node) return null;
  if (typeof node === 'string') return node.trim();
  if (Array.isArray(node)) return text(node[0]);
  if (node._) return node._.trim();
  return null;
}

// Newer Solinst software uses locale decimal separators (e.g. "0,12619") in header fields
function parseHeaderNum(val) {
  if (val === null || val === undefined) return NaN;
  return parseFloat(String(val).replace(',', '.'));
}

module.exports = async function parseSolinst(buffer) {
  const xmlStr = buffer.toString('utf8');

  let parsed;
  try {
    parsed = await xml2js.parseStringPromise(xmlStr, { explicitArray: true });
  } catch (e) {
    throw new Error(`Solinst XLE: XML parse failed — ${e.message}`);
  }

  const body = parsed['Body_xle'];
  if (!body) throw new Error('Solinst XLE: missing Body_xle root element');

  const fileInfo  = body.File_info?.[0]                   || {};
  const instrInfo = body.Instrument_info?.[0]             || {};
  const instrData = body.Instrument_info_data_header?.[0] || {};

  const dlDateStr = text(fileInfo.Date);
  const dlTimeStr = text(fileInfo.Time);
  const loggerDownloadedAt = dlDateStr
    ? parseSolinstDate(dlDateStr, dlTimeStr || '00:00:00')
    : null;

  const startRaw = text(instrData.Start_time);
  let loggerLaunchedAt = null;
  if (startRaw) {
    const parts = startRaw.split(' ');
    loggerLaunchedAt = parseSolinstDate(parts[0], parts[1] || '00:00:00');
  }

  const loggerSerial = text(instrInfo.Serial_number) || null;
  const loggerLabel  = text(instrData.Project_ID)    || null;

  const channels = [];
  let chIndex = 1;
  while (body[`Ch${chIndex}_data_header`]) {
    const ch    = body[`Ch${chIndex}_data_header`][0];
    const ident = text(ch.Identification);
    const unit  = text(ch.Unit);
    const offsetNode = ch.Parameters?.[0]?.Offset?.[0];
    const offset     = parseHeaderNum(offsetNode?.$?.Val ?? null) || 0;

    let phenName = resolvePhenName(ident);
    // Barologgers label Ch1 as "LEVEL" — unit is the only reliable distinguisher
    if (chIndex === 1 && (unit === 'kPa' || unit === 'psi')) {
      phenName = 'baro_pressure_smp';
    }

    channels.push({ index: chIndex, phenName, unit, offset });
    chIndex++;
  }

  if (!channels.length) throw new Error('Solinst XLE: no channel headers found');

  const logEntries = body.Data?.[0]?.Log ?? [];

  const measurements = [];
  let dateRangeStart = null;
  let dateRangeEnd   = null;

  for (const log of logEntries) {
    const dateStr = text(log.Date);
    const timeStr = text(log.Time);
    if (!dateStr || !timeStr) continue;

    let measuredAt;
    try {
      measuredAt = parseSolinstDate(dateStr, timeStr);
      if (isNaN(measuredAt.getTime())) continue;
    } catch {
      continue;
    }

    if (!dateRangeStart || measuredAt < dateRangeStart) dateRangeStart = measuredAt;
    if (!dateRangeEnd   || measuredAt > dateRangeEnd)   dateRangeEnd   = measuredAt;

    for (const ch of channels) {
      const rawVal = text(log[`ch${ch.index}`] || log[`Ch${ch.index}`]);
      if (rawVal === null || rawVal === '') continue;

      let num = parseFloat(rawVal) + ch.offset;
      if (ch.unit === 'psi') num = num * 6.89476; // older Sibhayi barologgers export in psi
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
      serial:               loggerSerial,
      label:                loggerLabel,
      logger_downloaded_at: loggerDownloadedAt,
      logger_launched_at:   loggerLaunchedAt,
      date_range_start:     dateRangeStart,
      date_range_end:       dateRangeEnd,
      record_count:         measurements.length,
    },
    measurements,
  };
};
