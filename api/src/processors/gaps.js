const db = require('../db/queries');

const GAP_PROBLEM_THRESH_S = 6 * 60 * 60; // 6 hours
const LOGGER_PROBLEM_ACTS  = new Set(['logger_missing', 'logger_stopped', 'logger_decommission']);

async function processGaps(stationId) {
  const files = await db.getFilesForGapProcessing(stationId);

  // Group by stream_id
  const byStream = {};
  for (const f of files) {
    if (!byStream[f.stream_id]) byStream[f.stream_id] = [];
    byStream[f.stream_id].push(f);
  }

  for (const [streamIdStr, streamFiles] of Object.entries(byStream)) {
    const streamId = Number(streamIdStr);
    const gaps     = [];
    const overlaps = new Map();

    for (let i = 0; i < streamFiles.length - 1; i++) {
      const a = streamFiles[i];
      const b = streamFiles[i + 1];

      const gapStart = new Date(a.date_range_end);
      const gapEnd   = new Date(b.date_range_start);
      const gapMs    = gapEnd - gapStart;

      if (gapMs < 0) {
        overlaps.set(b.id, parseFloat((Math.abs(gapMs) / 86400000).toFixed(1)));
        continue;
      }
      if (gapMs === 0) continue;

      const gapSeconds = Math.round(gapMs / 1000);
      const gapDays    = parseFloat((gapSeconds / 86400).toFixed(1));

      // Check for visits within this gap that declared logger unavailable
      const visits = await db.getVisitNotesInGap(stationId, gapStart, gapEnd);
      const problemVisit = visits.find(v => {
        try {
          const acts = JSON.parse(v.logger_activities || '[]');
          return acts.some(a => LOGGER_PROBLEM_ACTS.has(a));
        } catch { return false; }
      });

      const isProblem = problemVisit ? true : gapSeconds > GAP_PROBLEM_THRESH_S;
      const gapType   = problemVisit ? 'documented' : 'missing';
      const notes     = problemVisit
        ? (problemVisit.problem_notes || 'Logger declared unavailable during this period')
        : null;

      gaps.push({ stationId, streamId, gapStart, gapEnd, gapSeconds, gapDays, isProblem, gapType, notes });
    }

    await db.upsertStationGaps(gaps);
    const keepGapStarts = gaps.map(g => g.gapStart);
    await db.deleteStaleGaps(stationId, streamId, keepGapStarts);

    // Update has_gap / gap_days and has_overlap / overlap_days on uploaded_files.
    await syncFileGapFlags(stationId, streamId, gaps, overlaps, streamFiles);
  }
}

async function syncFileGapFlags(stationId, streamId, gaps, overlaps, files) {
  // Build lookup: file.date_range_start (ISO) → gap
  const gapByEnd = {};
  for (const g of gaps) {
    gapByEnd[new Date(g.gapEnd).toISOString()] = g;
  }

  for (const f of files) {
    const key = new Date(f.date_range_start).toISOString();
    if (gapByEnd[key]) {
      await db.markFileGap(f.id, Math.round(gapByEnd[key].gapDays));
    } else {
      await db.clearFileGap(f.id);
    }

    if (overlaps.has(f.id)) {
      await db.markFileOverlap(f.id, overlaps.get(f.id));
    } else {
      await db.clearFileOverlap(f.id);
    }
  }
}

module.exports = { processGaps };
