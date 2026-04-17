// parsers/hobo.js
// HOBO CSV rainfall logger — HOBOware export, streaming version
// Uses readline to process line-by-line; never loads the full file into memory.
//
// Handles all 5 structural variants (try_1 through try_5):
//
//   try_1: title(row1) + header(row2) + id_col(#) + combined datetime   → data_row=3
//   try_2: title(row1) + header(row2) + no id_col  + combined datetime   → data_row=3
//   try_3: no title    + header(row1) + no id_col  + combined datetime   → data_row=2
//   try_4: no title    + header(row1) + no id_col  + SEPARATE date+time  → data_row=2
//   try_5: title(row1) + header(row2) + id_col(#)  + SEPARATE date+time → data_row=3
//
// Column header serial number forms:
//   "Rainfall (mm) LGR S/N: 20102559, SEN S/N: 20102559"
//   "Rainfall (mm) #20102559"
//
// Interference columns: "Coupler Detached", "Host Connected", "End Of File"

'use strict';
const readline = require('readline');
const fs       = require('fs');

const INTERFERENCE_KEYWORDS = ['Coupler Detached', 'Host Connected', 'End Of File'];

function splitCsvLine(line) {
  const fields = [];
  let cur = '', inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { fields.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  fields.push(cur.trim());
  return fields;
}

function cleanHeader(h) {
  return h
    .replace(/\s+LGR\s+S\/N:.*$/i, '')
    .replace(/\s+#\d+.*$/, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

function extractSerial(h) {
  let m = h.match(/LGR\s+S\/N:\s*(\d+)/i);
  if (m) return m[1];
  m = h.match(/#(\d+)/);
  if (m) return m[1];
  return null;
}

function parseDateTime(dateStr, timeStr) {
  const s = (timeStr ? `${dateStr.trim()} ${timeStr.trim()}` : dateStr.trim())
    .replace(/"/g, '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(AM|PM)?$/i);
  if (m) {
    let [, mo, dy, yr, hr, mn, sc, period] = m;
    if (yr.length === 2) yr = '20' + yr;
    hr = parseInt(hr, 10);
    if (period) {
      if (period.toUpperCase() === 'PM' && hr !== 12) hr += 12;
      if (period.toUpperCase() === 'AM' && hr === 12) hr = 0;
    }
    return new Date(Date.UTC(+yr, +mo - 1, +dy, hr, +mn, +sc));
  }
  throw new Error(`Unrecognised HOBO date: "${s}"`);
}

function classifyColumn(cleanedHeader) {
  for (const kw of INTERFERENCE_KEYWORDS) {
    if (cleanedHeader.includes(kw)) {
      return { phenomenonName: 'logger_interference', isInterference: true };
    }
  }
  const h = cleanedHeader.toLowerCase();
  if (h.includes('rainfall') || h.includes('rain')) {
    return { phenomenonName: 'rain_tip', isInterference: false };
  }
  const slug = h.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return { phenomenonName: slug || 'unknown', isInterference: false };
}

// Read the first N lines without loading the whole file
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

module.exports = async function parseHobo(filePath) {
  // ── Eagerly read first 2 lines to detect variant ───────────────────────────
  const firstLines = await readFirstNLines(filePath, 2);
  if (firstLines.length < 1) throw new Error('HOBO file is empty');

  function rowLooksLikeHeader(row) {
    return row.some(f => /date|time/i.test(f));
  }

  const row0 = splitCsvLine(firstLines[0]);
  const row1 = firstLines[1] ? splitCsvLine(firstLines[1]) : [];

  let headerRowIdx;
  if (rowLooksLikeHeader(row0)) {
    headerRowIdx = 0; // try_3 or try_4
  } else if (row1.length > 0 && rowLooksLikeHeader(row1)) {
    headerRowIdx = 1; // try_1, try_2, or try_5
  } else {
    throw new Error('HOBO file: cannot locate header row');
  }

  const headers   = headerRowIdx === 0 ? row0 : row1;
  const dataStart = headerRowIdx + 1; // 0-indexed line number where data begins

  // ── Detect id column ────────────────────────────────────────────────────────
  const hasIdCol  = headers[0].trim() === '#';
  const colOffset = hasIdCol ? 1 : 0;

  // ── Detect separate vs combined datetime ────────────────────────────────────
  const dtH0 = (headers[colOffset]     || '').toLowerCase();
  const dtH1 = (headers[colOffset + 1] || '').toLowerCase();
  const separateDatetime =
    dtH0.includes('date') && !dtH0.includes('time') && dtH1.includes('time');

  const phenColStart = separateDatetime ? colOffset + 2 : colOffset + 1;

  // ── Extract logger serial number ────────────────────────────────────────────
  let loggerSn = null;
  for (let i = phenColStart; i < headers.length; i++) {
    const sn = extractSerial(headers[i]);
    if (sn) { loggerSn = sn; break; }
  }

  // ── Build column metadata ───────────────────────────────────────────────────
  const cols = [];
  for (let i = phenColStart; i < headers.length; i++) {
    const cleaned = cleanHeader(headers[i]);
    if (!cleaned) continue;
    const { phenomenonName, isInterference } = classifyColumn(cleaned);
    cols.push({ index: i, rawHeader: headers[i], cleaned, phenomenonName, isInterference });
  }

  // ── Streaming data rows ─────────────────────────────────────────────────────
  async function* stream() {
    const rl = readline.createInterface({
      input:     fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });

    let lineNum = 0; // 0-indexed
    for await (const line of rl) {
      if (lineNum <= dataStart) { lineNum++; continue; } // skip header row(s)
      lineNum++;

      const trimmed = line.trim();
      if (!trimmed) continue;

      const fields = splitCsvLine(line);
      if (fields.length < 2) continue;

      let measuredAt;
      try {
        if (separateDatetime) {
          measuredAt = parseDateTime(fields[colOffset], fields[colOffset + 1]);
        } else {
          measuredAt = parseDateTime(fields[colOffset]);
        }
        if (isNaN(measuredAt.getTime())) continue;
      } catch (e) { continue; }

      const rowMeasurements = [];
      for (const col of cols) {
        const raw = (fields[col.index] !== undefined ? fields[col.index] : '')
          .replace(/"/g, '').trim();
        if (raw === '') continue;

        if (col.isInterference) {
          const eventName = cleanHeader(col.rawHeader).replace(/\(.*?\)/g, '').trim();
          rowMeasurements.push({
            phenomenon_name: 'logger_interference',
            measured_at:     measuredAt,
            value_numeric:   null,
            value_text:      eventName || col.cleaned,
            is_interference: true,
          });
        } else {
          const num = parseFloat(raw);
          rowMeasurements.push({
            phenomenon_name: col.phenomenonName,
            measured_at:     measuredAt,
            value_numeric:   isNaN(num) ? null : num,
            value_text:      isNaN(num) ? raw : null,
            is_interference: false,
          });
        }
      }
      if (rowMeasurements.length > 0) yield rowMeasurements;
    }
  }

  return { streamName: 'raw_rainfall', stream: stream() };
};

module.exports.streaming = true;
