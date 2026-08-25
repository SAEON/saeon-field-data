'use strict';
const db  = require('../db/queries');
const { log } = require('../middleware/logger');

// Hampel filter parameters (groundwater-specific — see gw_naartjie_clean.r)
const HALF_WIN   = 10;     // half-window → 21-point total window
const MAD_DEV    = 5;      // MAD multiplier (package default is 3; GW uses 5)
const MAD_K      = 1.4826; // consistency constant
const WIN_NA_TOL = 0.25;   // within-window NA tolerance (proportion)
const SEG_NA_TOL = 0.75;   // segment-level NA tolerance (proportion)
const BARO_NA_MAX = 5;     // max baro gap in consecutive sample intervals before level_m_comp = null

// Drift correction window parameters (gw_driffter settings)
const DRIFT_RNG_MAX = 24;  // max non-null values to collect per window side

// ─── Math helpers ─────────────────────────────────────────────────────────────

function sortedMedian(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = (s.length - 1) / 2;
  return (s[Math.floor(mid)] + s[Math.ceil(mid)]) / 2;
}

function computeMAD(values, med) {
  return sortedMedian(values.map(v => Math.abs(v - med))) ?? 0;
}

function computeTypicalInterval(baro) {
  if (baro.length < 2) return 15 * 60 * 1000; // default 15 min
  const diffs = [];
  for (let i = 1; i < baro.length; i++) diffs.push(baro[i].t - baro[i - 1].t);
  return sortedMedian(diffs);
}

// ─── Stage 1: Barometric compensation ─────────────────────────────────────────

// Returns interpolated baro kPa, or null if surrounding gap > BARO_NA_MAX × typical interval
function baroInterpolate(baro, targetMs, typicalIntervalMs) {
  const n = baro.length;
  if (!n) return null;

  // Binary search for insert position of targetMs
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (baro[mid].t <= targetMs) lo = mid + 1; else hi = mid;
  }
  const rightIdx = lo;
  const leftIdx  = lo - 1;

  if (leftIdx < 0 || rightIdx >= n) return null; // outside baro coverage

  const t0 = baro[leftIdx].t;
  const t1 = baro[rightIdx].t;
  if (t1 - t0 > BARO_NA_MAX * typicalIntervalMs) return null; // gap too large

  const frac = (targetMs - t0) / (t1 - t0);
  return baro[leftIdx].v + frac * (baro[rightIdx].v - baro[leftIdx].v);
}

// ─── Stage 2: Hampel filter ────────────────────────────────────────────────────

// Split rows into segments at:
//   1. File download boundaries (date_range_start of files 2..N)  — "dwn" events in R
//   2. null↔non-null transitions in levelMComp                    — "nd"  events in R
// This mirrors gw_f1_naartjie_clean.r lines 78-104.
function buildSegments(rows, files) {
  if (!rows.length) return [];

  const fileBoundaries = new Set();
  if (files.length >= 2) {
    const sorted = [...files]
      .filter(f => f.date_range_start)
      .sort((a, b) => new Date(a.date_range_start) - new Date(b.date_range_start));
    for (const f of sorted.slice(1)) {
      fileBoundaries.add(new Date(f.date_range_start).getTime());
    }
  }

  const segments = [];
  let segStart = 0;
  for (let i = 1; i < rows.length; i++) {
    const atFileBoundary = fileBoundaries.has(new Date(rows[i].measuredAt).getTime());
    // NA run boundary: any transition between null and non-null (or vice-versa)
    const prevNull = rows[i - 1].levelMComp == null;
    const currNull = rows[i].levelMComp == null;
    if (atFileBoundary || prevNull !== currNull) {
      segments.push({ start: segStart, end: i });
      segStart = i;
    }
  }
  segments.push({ start: segStart, end: rows.length });
  return segments;
}

function applyHampel(rows, segments) {
  for (const { start, end } of segments) {
    const segVals = [];
    for (let i = start; i < end; i++) {
      if (rows[i].levelMComp != null) segVals.push(rows[i].levelMComp);
    }

    // R: skip segments with ≤ 3 rows (too few for meaningful cleaning)
    // R: skip when NA_count / nonNA_count > seg_na_t (NOT na/total)
    const nonNaCount = segVals.length;
    const naCount    = (end - start) - nonNaCount;
    const tooSparse  = nonNaCount === 0 || naCount / nonNaCount > SEG_NA_TOL;
    const tooSmall   = (end - start) <= 3;
    if (tooSmall || tooSparse) {
      for (let i = start; i < end; i++) {
        rows[i].btOutlier      = false;
        rows[i].btOutlierRule  = null;
        rows[i].levelMCleaned  = null;
      }
      continue;
    }

    // Segment MAD for implosion guard (flat water level causes MAD ≈ 0)
    const segMed = sortedMedian(segVals);
    const segMAD = segMed != null ? computeMAD(segVals, segMed) : 0;

    // Apply Hampel row by row, window confined to this segment
    for (let i = start; i < end; i++) {
      const winStart = Math.max(start, i - HALF_WIN);
      const winEnd   = Math.min(end - 1, i + HALF_WIN);
      const window   = [];
      for (let j = winStart; j <= winEnd; j++) {
        if (rows[j].levelMComp != null) window.push(rows[j].levelMComp);
      }

      const winTotal = winEnd - winStart + 1;
      if (window.length / winTotal < (1 - WIN_NA_TOL)) {
        // More than WIN_NA_TOL of the window is NA — skip this position
        rows[i].btOutlier     = false;
        rows[i].btOutlierRule = null;
        rows[i].levelMCleaned = rows[i].levelMComp;
        continue;
      }

      const med = sortedMedian(window);
      if (med == null) {
        rows[i].btOutlier     = false;
        rows[i].btOutlierRule = null;
        rows[i].levelMCleaned = rows[i].levelMComp;
        continue;
      }

      let mad = computeMAD(window, med);
      // Implosion guard: when water level is stable (flat series), MAD ≈ 0 causes false outliers
      if (mad < 1e-10) mad += segMAD / 1000;

      const threshold = MAD_DEV * MAD_K * mad;
      const v = rows[i].levelMComp;

      if (v == null || Math.abs(v - med) > threshold) {
        rows[i].btOutlier     = true;
        rows[i].btOutlierRule = 'hf_10_5';
        rows[i].levelMCleaned = parseFloat(med.toFixed(6));
      } else {
        rows[i].btOutlier     = false;
        rows[i].btOutlierRule = null;
        rows[i].levelMCleaned = v;
      }
    }
  }
}

// ─── Stage 3: Manual outlier masking ──────────────────────────────────────────

function applyManualOutliers(rows, handles) {
  for (const h of handles) {
    if (!h.end_at) continue; // manual_outliers requires end_at
    const startMs = new Date(h.start_at).getTime();
    const endMs   = new Date(h.end_at).getTime();
    for (const row of rows) {
      const tMs = new Date(row.measuredAt).getTime();
      if (tMs >= startMs && tMs <= endMs) {
        row.levelMCleaned = null;
        row.btOutlier     = true;
        row.btOutlierRule = 'manual_outlier';
      }
    }
  }
}

// ─── Stage 4: Drift correction ────────────────────────────────────────────────

// Collect up to maxCount non-null levelMCleaned values in direction (±1) from startIdx
function collectNonNull(rows, startIdx, direction, maxCount) {
  const vals = [];
  let i = startIdx;
  while (i >= 0 && i < rows.length && vals.length < maxCount) {
    if (rows[i].levelMCleaned != null) vals.push(rows[i].levelMCleaned);
    i += direction;
  }
  return vals;
}

function applyDriftCorrection(rows, anchors, station) {
  if (!anchors.length) return;

  const controlPoints = []; // [{t: ms, offset: number}]

  for (const anchor of anchors) {
    const anchorMs = new Date(anchor.recorded_at).getTime();
    const casingHt = anchor.casing_ht_m != null ? parseFloat(anchor.casing_ht_m) : parseFloat(station.casing_ht_m ?? 0);
    const mLevel   = parseFloat(station.elevation_m) + casingHt - parseFloat(anchor.dipper_depth_m);

    // Find the row index closest to the anchor timestamp
    let anchorIdx = 0;
    let minDiff   = Infinity;
    for (let i = 0; i < rows.length; i++) {
      const diff = Math.abs(new Date(rows[i].measuredAt).getTime() - anchorMs);
      if (diff < minDiff) { minDiff = diff; anchorIdx = i; }
    }

    // Three window estimates per anchor (lead = left, center = both, trail = right)
    const leftVals  = collectNonNull(rows, anchorIdx - 1, -1, DRIFT_RNG_MAX);
    const rightVals = collectNonNull(rows, anchorIdx + 1,  1, DRIFT_RNG_MAX);
    const centerVal = rows[anchorIdx].levelMCleaned;
    const centerVals = [
      ...leftVals,
      ...(centerVal != null ? [centerVal] : []),
      ...rightVals,
    ];

    const calCenter = centerVals.length > 0 ? mLevel - sortedMedian(centerVals) : null;
    // R: when lead/trail window has no data, fall back to calCenter (gw_driffter.r lines 207, 237)
    const calLead  = leftVals.length  > 0 ? mLevel - sortedMedian(leftVals)  : calCenter;
    const calTrail = rightVals.length > 0 ? mLevel - sortedMedian(rightVals) : calCenter;

    const tBefore = anchorIdx > 0               ? new Date(rows[anchorIdx - 1].measuredAt).getTime() : null;
    const tAnchor =                               new Date(rows[anchorIdx].measuredAt).getTime();
    const tAfter  = anchorIdx < rows.length - 1  ? new Date(rows[anchorIdx + 1].measuredAt).getTime() : null;

    if (tBefore != null && calLead   != null) controlPoints.push({ t: tBefore, offset: calLead });
    if (calCenter != null)                    controlPoints.push({ t: tAnchor, offset: calCenter });
    if (tAfter  != null && calTrail  != null) controlPoints.push({ t: tAfter,  offset: calTrail });
  }

  if (!controlPoints.length) return;

  controlPoints.sort((a, b) => a.t - b.t);

  // Deduplicate (same timestamp, last value wins)
  const cps = [];
  for (const cp of controlPoints) {
    if (cps.length && cps[cps.length - 1].t === cp.t) cps[cps.length - 1].offset = cp.offset;
    else cps.push({ ...cp });
  }

  // Assign drift_offset_m and level_m_asl to every row
  for (const row of rows) {
    const t = new Date(row.measuredAt).getTime();

    // Binary search for surrounding control points
    let lo = 0, hi = cps.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cps[mid].t <= t) lo = mid + 1; else hi = mid;
    }
    const ri = lo, li = lo - 1;

    let offset;
    if (li < 0) {
      offset = cps[0].offset; // constant head extrapolation
    } else if (ri >= cps.length) {
      offset = cps[cps.length - 1].offset; // constant tail extrapolation
    } else {
      const frac = (t - cps[li].t) / (cps[ri].t - cps[li].t);
      offset = cps[li].offset + frac * (cps[ri].offset - cps[li].offset);
    }

    row.driftOffsetM = parseFloat(offset.toFixed(6));
    if (row.levelMCleaned != null) {
      row.levelMAsl = parseFloat((row.levelMCleaned + offset).toFixed(6));
    }
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function processGroundwater(stationId) {
  const station = await db.getStationById(stationId);
  if (!station) throw new Error(`Station ${stationId} not found`);

  if (!station.baro_station_id) {
    log.warn('[gw] No baro_station_id — baro compensation skipped', { station_id: stationId });
    return { processed: 0, skipped: 'no_baro_station' };
  }

  // Load raw level + ancillary measurements (water_level_smp, temp_c, conductivity_smp)
  const rawLevel = await db.getRawGroundwaterForStation(stationId);
  const levelPts = rawLevel.filter(r => r.phenomenon_name === 'water_level_smp');
  if (!levelPts.length) return { processed: 0 };

  const streamId = levelPts[0].stream_id;

  const tempMap = new Map(
    rawLevel.filter(r => r.phenomenon_name === 'temp_c')
      .map(r => [new Date(r.measured_at).getTime(), parseFloat(r.value_numeric)])
  );
  const condMap = new Map(
    rawLevel.filter(r => r.phenomenon_name === 'conductivity_smp')
      .map(r => [new Date(r.measured_at).getTime(), parseFloat(r.value_numeric)])
  );

  // Stage 1: baro interpolation → level_m_comp
  const rawBaro = await db.getBaroSeriesForStation(stationId);
  const baro = rawBaro.map(r => ({ t: new Date(r.measured_at).getTime(), v: parseFloat(r.value_numeric) }));
  const typicalIntervalMs = computeTypicalInterval(baro);

  const rows = levelPts.map(pt => {
    const tMs        = new Date(pt.measured_at).getTime();
    const levelMRaw  = parseFloat(pt.value_numeric);
    const baroKpa    = baroInterpolate(baro, tMs, typicalIntervalMs);
    const levelMComp = baroKpa != null
      ? parseFloat((levelMRaw - baroKpa / 9.80665).toFixed(6))
      : null;
    return {
      stationId,
      streamId,
      measuredAt:       pt.measured_at,
      levelMRaw,
      baroKpa:          baroKpa != null ? parseFloat(baroKpa.toFixed(6)) : null,
      levelMComp,
      tempC:            tempMap.get(tMs) ?? null,
      conductivityUsCm: condMap.get(tMs) ?? null,
      btOutlier:        false,
      btOutlierRule:    null,
      levelMCleaned:    null,
      driftOffsetM:     null,
      levelMAsl:        null,
    };
  });

  // Stage 2: Hampel outlier detection
  const files    = await db.getFilesForGapProcessing(stationId);
  const segments = buildSegments(rows, files);
  applyHampel(rows, segments);

  // Stage 3: Manual outlier masking
  const handles = await db.getDataHandlesForStation(stationId);
  applyManualOutliers(rows, handles.filter(h => h.handle_type === 'manual_outliers'));

  // Stage 4: Drift correction (requires elevation_m + dipper readings)
  if (station.elevation_m != null) {
    const dippers = await db.getDipperAnchorReadings(stationId);
    if (dippers.length) {
      applyDriftCorrection(rows, dippers, station);
    } else {
      log.info('[gw] No dipper readings — drift correction skipped', { station_id: stationId });
    }
  } else {
    log.info('[gw] elevation_m not set — drift correction skipped', { station_id: stationId });
  }

  await db.upsertGroundwaterLevels(rows);
  log.info('[gw] Processed', { station_id: stationId, rows: rows.length });
  return { processed: rows.length };
}

module.exports = { processGroundwater };
