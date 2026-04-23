const db = require('../db/queries');
const { log } = require('../middleware/logger');

const DEFAULT_MM_PER_TIP   = 0.254; // fallback when no instrument_history exists
const INTERFERE_WINDOW_MS  = 600_000;
const ANOMALY_THRESHOLD_MM = 10;

function getMmPerTip(periods, measuredAt, rawMmPerTip) {
  const ts = new Date(measuredAt).getTime();
  const raw = rawMmPerTip ? parseFloat(rawMmPerTip) : 0;
  let mm = raw > 0 ? raw : DEFAULT_MM_PER_TIP;
  for (const p of periods) {
    if (new Date(p.effective_from).getTime() <= ts) mm = parseFloat(p.mm_per_tip);
  }
  return mm;
}

function to5MinBucket(date) {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 5) * 5);
  return d;
}

// Returns Map<id, {flag, reason}> where flag/reason are null for valid tips.
function classifyTips(tips, visitTimes, pseudoWindows) {
  const result = new Map();

  for (let i = 0; i < tips.length; i++) {
    const tip = tips[i];
    const ts  = new Date(tip.measured_at).getTime();

    // Only the LATER of a 1-second pair is the bounce — keep the earlier (real) tip.
    // R spec: double_tips vector is prepended with FALSE so only tip[i] is marked
    // when |date_time[i] − date_time[i−1]| == 1.
    const prevMs = i > 0 ? new Date(tips[i - 1].measured_at).getTime() : null;
    if (prevMs !== null && ts - prevMs === 1000) {
      result.set(tip.id, { flag: 'double_tip', reason: '1s_bounce' });
      continue;
    }

    let entry = { flag: null, reason: null };
    for (const win of pseudoWindows) {
      if (ts >= win.start.getTime() && ts <= win.end.getTime()) {
        entry = { flag: 'pseudo_event', reason: win.reason };
        break;
      }
    }
    if (entry.flag) { result.set(tip.id, entry); continue; }

    for (const vt of visitTimes) {
      // R spec line 156: raining gates ALL false-tip types — if it was raining
      // during this visit, tips near the download are real rainfall, not interfere.
      if (vt.raining) continue;
      if (Math.abs(ts - vt.time.getTime()) <= INTERFERE_WINDOW_MS) {
        entry = { flag: 'interfere', reason: 'visit_proximity' };
        break;
      }
    }

    result.set(tip.id, entry);
  }

  return result;
}

async function processRainfall(stationId) {
  const [tips, visitTimes, rawPseudoWindows, calibrationPeriods] = await Promise.all([
    db.getRawTipsForStation(stationId),
    db.getVisitTimestampsForStation(stationId),
    db.getPseudoEventWindows(stationId),
    db.getCalibrationPeriodsForStation(stationId),
  ]);

  // Discard inverted windows (start >= end) — data entry error
  const pseudoWindows = rawPseudoWindows.filter(w => w.start < w.end);
  const invertedCount = rawPseudoWindows.length - pseudoWindows.length;
  if (invertedCount > 0) {
    log.warn('[rainfall] Inverted pseudo-event windows discarded', { station_id: stationId, count: invertedCount });
  }

  log.info('[rainfall] Classifying tips', {
    station_id:    stationId,
    tips:          tips.length,
    visit_windows: visitTimes.length,
    pseudo_windows: pseudoWindows.length,
  });

  if (!tips.length) {
    log.warn('[rainfall] No tips found — nothing to process', { station_id: stationId });
    return { processed: 0, reclassified: 0 };
  }

  const flagMap = classifyTips(tips, visitTimes, pseudoWindows);
  const tipById = new Map(tips.map(t => [t.id, t]));

  const updates = [];
  for (const [id, { flag, reason }] of flagMap) {
    const tip = tipById.get(id);
    if (tip.qa_flag !== flag || tip.flag_reason !== reason) updates.push({ id, flag, reason });
  }
  if (updates.length) await db.bulkUpdateFlags(updates);

  const buckets = new Map();
  for (const tip of tips) {
    const { flag, reason } = flagMap.get(tip.id);
    const bucket = to5MinBucket(tip.measured_at);
    const key    = `${tip.stream_id}|${bucket.toISOString()}`;
    if (!buckets.has(key)) buckets.set(key, { streamId: tip.stream_id, bucket, rain_mm: 0, all: 0, valid: 0, double_tip: 0, interfere: 0, pseudo_event: 0, manual_tip: 0, non_rainfall: 0 });
    const b = buckets.get(key);
    b.all++;
    if (flag === null) {
      b.valid++;
      b.rain_mm += getMmPerTip(calibrationPeriods, tip.measured_at, tip.value_numeric);
    } else if (flag === 'double_tip') b.double_tip++;
    else if (flag === 'interfere')  b.interfere++;
    else if (flag === 'pseudo_event') {
      b.pseudo_event++;
      if (reason === 'manual_tip')              b.manual_tip++;
      else if (reason === 'non_rainfall_entry') b.non_rainfall++;
    }
  }

  const rows = [];
  for (const [, b] of buckets) {
    const rainMm = b.rain_mm;
    rows.push({
      stationId,
      streamId:         b.streamId,
      periodStart:      b.bucket.toISOString(),
      rainMm,
      tipCount:         b.all,
      validTips:        b.valid,
      doubleTipCount:   b.double_tip,
      interfereCount:   b.interfere,
      pseudoEventCount: b.pseudo_event,
      manualTipCount:   b.manual_tip,
      nonRainfallCount: b.non_rainfall,
      isAnomaly:        rainMm > ANOMALY_THRESHOLD_MM,
    });
  }

  if (rows.length) await db.upsertRainfallRows(rows);

  const flagCounts = {};
  for (const [, { flag, reason }] of flagMap) {
    if (flag) {
      const key = reason ? `${flag}:${reason}` : flag;
      flagCounts[key] = (flagCounts[key] || 0) + 1;
    }
  }
  log.info('[rainfall] Classification summary', {
    station_id:    stationId,
    buckets:       rows.length,
    reclassified:  updates.length,
    flags:         flagCounts,
  });

  return { processed: rows.length, reclassified: updates.length };
}

module.exports = { processRainfall };
