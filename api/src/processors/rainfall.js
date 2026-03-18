const db = require('../db/queries');

const RAIN_MM_PER_TIP      = 0.254;
const INTERFERE_WINDOW_MS  = 600_000;
const ANOMALY_THRESHOLD_MM = 10;

function to5MinBucket(date) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
  return d;
}

function classifyTips(tips, visitTimes, pseudoWindows) {
  const result = new Map();

  for (let i = 0; i < tips.length; i++) {
    const tip = tips[i];
    const ts  = new Date(tip.measured_at).getTime();

    const prevMs = i > 0               ? new Date(tips[i - 1].measured_at).getTime() : null;
    const nextMs = i < tips.length - 1 ? new Date(tips[i + 1].measured_at).getTime() : null;
    if ((prevMs !== null && ts - prevMs === 1000) ||
        (nextMs !== null && nextMs - ts === 1000)) {
      result.set(tip.id, 'double_tip');
      continue;
    }

    let flag = null;
    for (const win of pseudoWindows) {
      if (ts >= win.start.getTime() && ts <= win.end.getTime()) {
        flag = 'pseudo_event';
        break;
      }
    }
    if (flag) { result.set(tip.id, flag); continue; }

    for (const vt of visitTimes) {
      if (Math.abs(ts - vt.getTime()) <= INTERFERE_WINDOW_MS) {
        flag = 'interfere';
        break;
      }
    }

    result.set(tip.id, flag);
  }

  return result;
}

async function processRainfall(stationId) {
  const [tips, visitTimes, pseudoWindows] = await Promise.all([
    db.getRawTipsForStation(stationId),
    db.getVisitTimestampsForStation(stationId),
    db.getPseudoEventWindows(stationId),
  ]);

  if (!tips.length) return { processed: 0, reclassified: 0 };

  const flagMap = classifyTips(tips, visitTimes, pseudoWindows);
  const tipById = new Map(tips.map(t => [t.id, t]));

  const updates = [];
  for (const [id, flag] of flagMap) {
    if (tipById.get(id).qa_flag !== flag) updates.push({ id, flag });
  }
  if (updates.length) await db.bulkUpdateFlags(updates);

  const buckets = new Map();
  for (const tip of tips) {
    const flag   = flagMap.get(tip.id);
    const bucket = to5MinBucket(tip.measured_at);
    const key    = `${tip.stream_id}|${bucket.toISOString()}`;
    if (!buckets.has(key)) buckets.set(key, { streamId: tip.stream_id, bucket, all: 0, valid: 0 });
    const b = buckets.get(key);
    b.all++;
    if (flag === null) b.valid++;
  }

  const rows = [];
  for (const [, b] of buckets) {
    const rainMm = b.valid * RAIN_MM_PER_TIP;
    rows.push({
      stationId,
      streamId:    b.streamId,
      periodStart: b.bucket.toISOString(),
      rainMm,
      tipCount:    b.all,
      validTips:   b.valid,
      isAnomaly:   rainMm > ANOMALY_THRESHOLD_MM,
    });
  }

  if (rows.length) await db.upsertRainfallRows(rows);

  return { processed: rows.length, reclassified: updates.length };
}

module.exports = { processRainfall };
