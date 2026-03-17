'use strict';

// HOBO UA-003-64 binary (.hobo) parser
//
// Binary format (reverse-engineered from 1C_latest.hobo + 1C.csv ground truth):
//
// FILE LAYOUT
//   [4 bytes]  Magic "HOBO"
//   [N bytes]  Header — TLV records:  0x88 | tag | length | data[length]
//   [3 bytes]  End-of-header sentinel: 0xFF 0xFF 0xFF
//   [M bytes]  Data section — nibble-aligned event records
//
// HEADER TAGS (key ones)
//   0x05  model string
//   0x06  serial number string
//   0x07  download timestamp [century*100+year, month, day, hour, min, sec, 0, 0]
//          NOTE: stored in local time (CAT = UTC+2 for South African stations)
//   0x0a  station label string
//   0x14  timezone string (e.g. "Central African Time")
//   0x18  channel name ("Rainfall")
//   0x19  mm per tip — big-endian float32 (e.g. 0.254)
//   0x21  units string ("mm")
//
// DATA SECTION — NIBBLE-ALIGNED RECORDS
//   Each record = 2 type nibbles + <lo> delta nibbles
//     type_hi  = category (7 = sensor event / rainfall tip)
//     type_lo  = number of subsequent nibbles encoding the time delta
//     delta    = big-endian value assembled from type_lo nibbles (in seconds)
//   Timestamps go FORWARD from the download timestamp.
//   Only events with type_hi == 7 (0x7x) are rainfall tip events.
//   Non-7x events (0x0x, 0x6x, etc.) are host/status events — ignored.
//   Parsing stops when a delta exceeds MAX_DELTA_S (corruption guard).

const MAX_DELTA_S = 86400 * 400; // 400 days — sanity cap

// CAT (Central African Time) = UTC+2 offset in seconds.
// All SAEON stations are in South Africa so this is always correct.
const CAT_OFFSET_S = 2 * 3600;

function decodeTimestamp(b) {
  // b[0]*100 + b[1] = full year (e.g. 20*100+25 = 2025)
  // Bytes store LOCAL time; convert to UTC by subtracting CAT offset.
  const year  = b[0] * 100 + b[1];
  const month = b[2] - 1; // 0-indexed for Date.UTC
  const localMs = Date.UTC(year, month, b[3], b[4], b[5], b[6]);
  return new Date(localMs - CAT_OFFSET_S * 1000);
}

// limit = byte offset where header TLV records end (first non-0x88 byte)
function parseHeader(buf, limit) {
  const meta = {};
  let i = 4;
  while (i < limit - 2 && buf[i] === 0x88) {
    const tag = buf[i + 1];
    const len = buf[i + 2];
    const val = buf.slice(i + 3, i + 3 + len);
    switch (tag) {
      case 0x05: meta.model     = val.toString(); break;
      case 0x06: meta.serial    = val.toString(); break;
      case 0x07: meta.downloaded = decodeTimestamp(val); break;
      case 0x0a: meta.label     = val.toString(); break;
      case 0x14: meta.timezone  = val.toString(); break;
      case 0x18: meta.channel   = val.toString(); break;
      case 0x19: meta.mmPerTip  = val.readFloatBE(0); break;
      case 0x21: meta.units     = val.toString(); break;
    }
    i += 3 + len;
  }
  return meta;
}

async function parseHoboBinary(buf) {
  if (buf.slice(0, 4).toString() !== 'HOBO') {
    throw new Error('Not a HOBO binary file (missing HOBO magic)');
  }

  // Find where header TLV records end (first non-0x88 byte = the FF sentinel)
  let headerEnd = 4;
  while (headerEnd < buf.length - 2 && buf[headerEnd] === 0x88) {
    headerEnd += 3 + buf[headerEnd + 2];
  }

  const meta = parseHeader(buf, headerEnd);

  if (!meta.downloaded) {
    throw new Error('HOBO file missing download timestamp (tag 0x07)');
  }
  if (!meta.mmPerTip || meta.mmPerTip <= 0) {
    throw new Error('HOBO file missing or invalid mm-per-tip (tag 0x19)');
  }

  // Skip the end-of-header sentinel (one or more 0xFF bytes)
  let dataStart = headerEnd;
  while (dataStart < buf.length && buf[dataStart] === 0xFF) dataStart++;
  if (dataStart >= buf.length) throw new Error('HOBO file: data section not found after header');
  const dataSection = buf.slice(dataStart);

  // Build nibble array
  const nibbles = new Uint8Array(dataSection.length * 2);
  for (let i = 0; i < dataSection.length; i++) {
    nibbles[i * 2]     = dataSection[i] >> 4;
    nibbles[i * 2 + 1] = dataSection[i] & 0xF;
  }

  // Parse nibble-aligned records, accumulate time forward from download timestamp
  let cursorMs = meta.downloaded.getTime();
  const tips = [];
  let npos = 0;

  while (npos + 2 <= nibbles.length) {
    const typeHi = nibbles[npos];
    const typeLo = nibbles[npos + 1];
    npos += 2;

    if (npos + typeLo > nibbles.length) break;

    let delta = 0;
    for (let k = 0; k < typeLo; k++) {
      delta = delta * 16 + nibbles[npos + k];
    }
    npos += typeLo;

    if (delta > MAX_DELTA_S) break; // corrupted record — stop

    cursorMs += delta * 1000;

    // Only type 0x7x events are rainfall tip events
    if (typeHi === 7) {
      tips.push(new Date(cursorMs));
    }
  }

  const measurements = tips.map(ts => ({
    phenomenon_name: 'rain_tip',
    measured_at:     ts.toISOString(),
    value_numeric:   meta.mmPerTip,
    value_text:      null,
    is_interference: false,
  }));

  return {
    streamName: 'raw_rainfall',
    measurements,
    metadata: {
      label:            meta.label    || null,
      model:            meta.model    || null,
      timezone:         meta.timezone || null,
      mmPerTip:         meta.mmPerTip,
      date_range_start: tips.length ? tips[0].toISOString()             : null,
      date_range_end:   tips.length ? tips[tips.length - 1].toISOString() : null,
      record_count:     tips.length,
    },
  };
}

module.exports = parseHoboBinary;
