'use strict';

// HOBO binary (.hobo) parser for Pendant Event loggers
//
// FILE LAYOUT
//   [4 bytes]  Magic "HOBO"
//   [N bytes]  Header — TLV records:  0x88 | tag | length | data[length]
//   [1–4 bytes] End-of-header sentinel: one or more 0xFF bytes
//   [M bytes]  Data section — 1-byte event records
//
// HEADER TAGS (key ones)
//   0x05  model string
//   0x06  serial number string
//   0x07  launch timestamp [century*100+year, month, day, hour, min, sec, 0, 0]
//          stored in LOCAL time (CAT = UTC+2 for South African stations)
//   0x0a  station label string
//   0x14  timezone string
//   0x18  channel name
//   0x19  mm per tip — big-endian float32 (e.g. 0.254)
//   0x21  units string
//   0xb5  channel label (e.g. "Temp", "Rainfall")
//
// DATA SECTION — 1-byte event records (SINGLE-CHANNEL event loggers only)
//   Each byte = [event_type: 4 bits (high) | delta: 4 bits (low)]
//   Cursor advances by delta × 100 seconds for every byte, starting from launch time.
//   The time unit is 100 seconds (not 1 minute) — confirmed empirically against
//   HOBOware output for single-channel HOBO files.
//   event_type == 7  → rainfall tip at current cursor time
//   event_type == 1  → Host Connected (technician plugged in download cable)
//
// DUAL-CHANNEL LIMITATION
//   Loggers with temperature recording enabled (e.g. UA-003-64 Pendant Temp/Event)
//   interleave multi-byte temperature records with event records in the data section.
//   The 1-byte parser cannot distinguish temperature data bytes from event bytes,
//   causing ~21× time over-accumulation and completely wrong tip timestamps.
//   These files are rejected until Onset binary SDK support is added.

const CAT_OFFSET_S = 2 * 3600; // UTC+2

function decodeTimestamp(b) {
  const year  = b[0] * 100 + b[1];
  const month = b[2] - 1;
  const localMs = Date.UTC(year, month, b[3], b[4], b[5], b[6]);
  return new Date(localMs - CAT_OFFSET_S * 1000);
}

function parseHeader(buf, limit) {
  const meta = { channelLabels: [] };
  let i = 4;
  while (i < limit - 2 && buf[i] === 0x88) {
    const tag = buf[i + 1];
    const len = buf[i + 2];
    const val = buf.slice(i + 3, i + 3 + len);
    switch (tag) {
      case 0x05: meta.model    = val.toString(); break;
      case 0x06: meta.serial   = val.toString(); break;
      case 0x07: meta.launched = decodeTimestamp(val); break;
      case 0x0a: meta.label    = val.toString(); break;
      case 0x14: meta.timezone = val.toString(); break;
      case 0x18: meta.channel  = val.toString(); break;
      case 0x19: meta.mmPerTip = val.readFloatBE(0); break;
      case 0x21: meta.units    = val.toString(); break;
      case 0xb5: meta.channelLabels.push(val.toString()); break;
    }
    i += 3 + len;
  }
  return meta;
}

async function parseHoboBinary(buf) {
  if (buf.slice(0, 4).toString() !== 'HOBO') {
    throw new Error('Not a HOBO binary file (missing HOBO magic)');
  }

  let headerEnd = 4;
  while (headerEnd < buf.length - 2 && buf[headerEnd] === 0x88) {
    headerEnd += 3 + buf[headerEnd + 2];
  }

  const meta = parseHeader(buf, headerEnd);

  if (!meta.launched) {
    throw new Error('HOBO file missing launch timestamp (tag 0x07)');
  }
  if (!meta.mmPerTip || meta.mmPerTip <= 0) {
    throw new Error('HOBO file missing or invalid mm-per-tip (tag 0x19)');
  }

  // Dual-channel loggers (temperature + event) interleave multi-byte temperature
  // records in the data section. The 1-byte parser cannot separate these from
  // event records, producing ~21× time over-accumulation and wrong timestamps.
  // Reject these files until multi-byte format support is added.
  const hasTemperatureChannel = meta.channelLabels.some(
    l => /temp/i.test(l)
  );
  if (hasTemperatureChannel) {
    const model = meta.model || 'unknown model';
    throw new Error(
      `HOBO dual-channel logger detected (${model}): temperature channel data ` +
      `bytes interfere with event timing in the binary format. ` +
      `Upload a HOBOware CSV export instead, or contact your team lead.`
    );
  }

  let dataStart = headerEnd;
  while (dataStart < buf.length && buf[dataStart] === 0xFF) dataStart++;
  if (dataStart >= buf.length) throw new Error('HOBO file: data section not found after header');

  // Secondary dual-channel guard for old firmware that omits tag 0xb5 channel labels.
  // Temperature data bytes make typeHi=0xF anomalously common (>10% of data section).
  // Confirmed: 8B 2011 = 19.8%, 8B 2013 = 21.7% vs 8A = 2.4%, 8C = 2.5% (event-only).
  const dataLen = buf.length - dataStart;
  if (dataLen > 0) {
    let type15Count = 0;
    for (let k = dataStart; k < buf.length; k++) {
      if ((buf[k] >> 4) === 0xF) type15Count++;
    }
    if (type15Count / dataLen > 0.10) {
      const model = meta.model || 'unknown model';
      throw new Error(
        `HOBO dual-channel logger detected (${model}): old firmware without channel labels ` +
        `detected via data pattern. Upload a HOBOware CSV export instead, or contact your team lead.`
      );
    }
  }

  const tips          = [];
  const connectEvents = [];
  let cursorMs = meta.launched.getTime();

  for (let i = dataStart; i < buf.length; i++) {
    const typeHi  = buf[i] >> 4;
    const delta   = buf[i] & 0xF;
    cursorMs += delta * 100000; // 100-second units

    if (typeHi === 7) {
      tips.push(new Date(cursorMs));
    } else if (typeHi === 0x1) {
      connectEvents.push(new Date(cursorMs));
    }
  }

  const measurements = [
    ...tips.map(ts => ({
      phenomenon_name: 'rain_tip',
      measured_at:     ts.toISOString(),
      value_numeric:   meta.mmPerTip,
      value_text:      null,
      is_interference: false,
    })),
    ...(connectEvents.length ? [{
      phenomenon_name: 'logger_interference',
      measured_at:     connectEvents[connectEvents.length - 1].toISOString(),
      value_numeric:   null,
      value_text:      'Host Connected',
      is_interference: true,
    }] : []),
  ];

  return {
    streamName: 'raw_rainfall',
    measurements,
    metadata: {
      label:               meta.label    || null,
      serial:              meta.serial   || null,
      model:               meta.model    || null,
      timezone:            meta.timezone || null,
      mmPerTip:            meta.mmPerTip,
      logger_launched_at:  meta.launched.toISOString(),
      logger_downloaded_at: connectEvents.length
        ? connectEvents[connectEvents.length - 1].toISOString()
        : null,
      date_range_start: tips.length ? tips[0].toISOString()               : null,
      date_range_end:   tips.length ? tips[tips.length - 1].toISOString() : null,
      record_count:     tips.length,
    },
  };
}

module.exports = parseHoboBinary;
