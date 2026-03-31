const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const crypto  = require('crypto');
const fs      = require('fs');
const { requireAuth } = require('../middleware/auth');
const { log } = require('../middleware/logger');

router.use(requireAuth);
const path    = require('path');
const db      = require('../db/queries');
const { processRainfall } = require('../processors/rainfall');

// Multer — store in memory so we can hash before writing to disk
const upload = multer({ storage: multer.memoryStorage() });

// Detect logger format from file extension + buffer peek for CSV disambiguation
function detectFileFormat(filename, buffer) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.hobo') return 'hobo_binary';
  if (ext === '.xle') return 'solonist_xle';
  if (ext === '.dat') return 'campbell_toa5';
  if (ext === '.csv') {
    // STOM exports have ISO 8601 "Timestamp" column or "# Citation link:" header.
    // HOBO exports use "Date Time, GMT..." as the datetime column name.
    const head = buffer.toString('utf8', 0, 512);
    if (head.includes('# Citation link:') || /(?:^|\n)Timestamp,/i.test(head)) {
      return 'saeon_stom';
    }
    return 'hobo_csv';
  }
  return 'generic_csv';
}

// Build storage path: FILE_STORAGE_PATH/{year}/{month}/{hash}_{originalname}
function buildStoragePath(fileHash, originalName, uploadedAt) {
  const year  = uploadedAt.getFullYear().toString();
  const month = String(uploadedAt.getMonth() + 1).padStart(2, '0');
  const dir   = path.join(process.env.FILE_STORAGE_PATH, year, month);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${fileHash}_${originalName}`);
}

// Async background parser — called after response is sent
async function parseInBackground(fileRecord, visitId) {
  const format = fileRecord.file_format;

  // Parsers are loaded dynamically. If a parser does not exist yet, skip silently.
  let parser;
  try {
    parser = require(`../parsers/${formatToModule(format)}`);
  } catch (e) {
    log.warn('[parse] No parser available — skipping', { file_id: fileRecord.id, format });
    return;
  }

  const parseStart = Date.now();
  log.info('[parse] Started', { file_id: fileRecord.id, format, file: fileRecord.original_name });

  try {
    const visit   = await db.getVisitById(visitId);
    const phenMap = await db.getAllPhenomena();
    log.info('[parse] Station context', { file_id: fileRecord.id, station_id: visit?.station_id, data_family: visit?.data_family });

    // Streaming parsers receive filePath and return { streamName, stream: AsyncGenerator }.
    // Buffer-based parsers (e.g. solonist XML) receive a Buffer and return { streamName, measurements[], metadata }.
    // Both are normalised below into a single async-iterable interface.
    let result;
    if (parser.streaming) {
      result = await parser(fileRecord.storage_path);
    } else {
      const buffer = fs.readFileSync(fileRecord.storage_path);
      const parsed = await parser(buffer);
      result = {
        streamName: parsed.streamName || format,
        stream:     (async function* () { yield parsed.measurements; })(),
        _metadata:  parsed.metadata,
      };
    }

    const streamId = await db.getOrCreateStream(visit.station_id, result.streamName);

    // Insert in 20K-row chunks, up to 4 chunks concurrently.
    const CHUNK_SIZE  = 20000;
    const CONCURRENCY = 4;

    let chunk   = [];
    let pending = []; // full chunks waiting to be inserted
    let dateRangeStart = null;
    let dateRangeEnd   = null;
    let recordCount    = 0;

    async function flush(force = false) {
      while (pending.length >= CONCURRENCY || (force && pending.length > 0)) {
        const batch = pending.splice(0, CONCURRENCY);
        await Promise.all(batch.map(c => db.bulkInsertMeasurements(fileRecord.id, c)));
      }
    }

    for await (const rowMeasurements of result.stream) {
      for (const m of rowMeasurements) {
        const phenomenon = phenMap[m.phenomenon_name];
        if (!phenomenon) continue;

        if (!m.is_interference) {
          recordCount++;
          if (!dateRangeStart || m.measured_at < dateRangeStart) dateRangeStart = m.measured_at;
          if (!dateRangeEnd   || m.measured_at > dateRangeEnd)   dateRangeEnd   = m.measured_at;
        }

        chunk.push({
          streamId,
          phenomenonId:   phenomenon.id,
          measuredAt:     m.measured_at,
          valueNumeric:   m.value_numeric  ?? null,
          valueText:      m.value_text     ?? null,
          isInterference: m.is_interference ?? false,
        });
        if (chunk.length === CHUNK_SIZE) {
          pending.push(chunk);
          chunk = [];
          await flush();
        }
      }
    }
    if (chunk.length > 0) pending.push(chunk);
    await flush(true);

    // Use parser-provided metadata when available (buffer-based parsers); otherwise use tracked values.
    const meta           = result._metadata || {};
    const resolvedStart  = meta.date_range_start ?? dateRangeStart;
    const resolvedEnd    = meta.date_range_end   ?? dateRangeEnd;
    const resolvedCount  = meta.record_count     ?? recordCount;

    await db.updateFileParsed(fileRecord.id, {
      dateRangeStart: resolvedStart,
      dateRangeEnd:   resolvedEnd,
      recordCount:    resolvedCount,
      streamName:     result.streamName,
      loggerLabel:    meta.label        ?? null,
      loggerSerial:   meta.serial       ?? null,
      downloadedAt:   meta.logger_launched_at ?? null,
    });

    log.info('[parse] Complete', {
      file_id:    fileRecord.id,
      records:    resolvedCount,
      stream:     result.streamName,
      from:       resolvedStart,
      to:         resolvedEnd,
      ms:         Date.now() - parseStart,
    });

    // ── Gap detection ──────────────────────────────────────────────────────
    const GAP_TOLERANCE_S = 7200; // 2 hours — allow for download overlap / clock drift
    if (resolvedStart) {
      await db.clearFileGap(fileRecord.id); // reset in case of reparse
      const priorEnd = await db.getPriorCoverageEnd(
        visit.station_id,
        result.streamName,
        fileRecord.id
      );
      if (priorEnd !== null) {
        const gapSeconds = (new Date(resolvedStart).getTime() - new Date(priorEnd).getTime()) / 1000;
        if (gapSeconds > GAP_TOLERANCE_S) {
          const gapDays = Math.ceil(gapSeconds / 86400);
          await db.markFileGap(fileRecord.id, gapDays);
          await db.updateVisitStatus(visit.id, 'flagged');
          log.warn('[parse] Gap detected — visit flagged', {
            file_id:    fileRecord.id,
            station_id: visit.station_id,
            gap_days:   gapDays,
            prior_end:  priorEnd,
            file_start: resolvedStart,
          });
        }
      }
    }
    // ── End gap detection ──────────────────────────────────────────────────

    // Trigger rainfall processing for rainfall stations after a successful parse
    if (visit?.data_family === 'rainfall') {
      log.info('[rainfall] Processing triggered', { station_id: visit.station_id, file_id: fileRecord.id });
      processRainfall(visit.station_id)
        .then(r => log.info('[rainfall] Complete', { station_id: visit.station_id, ...r }))
        .catch(e => log.error('[rainfall] Processing failed', { station_id: visit.station_id, error: e.message }));
    }
  } catch (err) {
    log.error('[parse] Failed', { file_id: fileRecord.id, error: err.message, stack: err.stack?.split('\n')[1]?.trim() });
    await db.updateFileParseError(fileRecord.id, err.message);
  }
}

function formatToModule(format) {
  const map = {
    hobo_binary:   'hobo_binary',
    hobo_csv:      'hobo',
    solonist_xle:  'solonist',
    campbell_toa5: 'campbell_toa5',
    saeon_stom:    'saeon_stom',
  };
  return map[format] || null;
}


// =============================================================
// POST /api/visits/:id/files
// =============================================================
router.post('/:id/files', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use multipart field name: file' });
    }

    const visitId = parseInt(req.params.id, 10);

    // Verify visit exists
    const visit = await db.getVisitById(visitId);
    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    // Validate format against station family
    const fileFormat = detectFileFormat(req.file.originalname, req.file.buffer);
    if (visit.data_family === 'rainfall' && fileFormat !== 'hobo_binary') {
      return res.status(400).json({ error: 'Rainfall stations only accept HOBO binary (.hobo) files. CSV exports from HOBOware contain cumulative totals and cannot be used by the rainfall pipeline.' });
    }

    // SHA-256 hash of file contents
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    // Deduplication — same file uploaded twice to the SAME visit: return existing record
    const existingInVisit = await db.getFileByHashAndVisit(fileHash, visitId);
    if (existingInVisit) {
      return res.status(200).json({ ...existingInVisit, duplicate: true });
    }

    // Check if the file already exists on disk from a previous visit (same content, different visit)
    const uploadedAt  = new Date();
    const anyExisting = await db.getFileByHash(fileHash);
    const storagePath = anyExisting?.storage_path && fs.existsSync(anyExisting.storage_path)
      ? anyExisting.storage_path  // reuse existing file on disk — no re-write needed
      : buildStoragePath(fileHash, req.file.originalname, uploadedAt);

    if (!anyExisting?.storage_path || !fs.existsSync(anyExisting.storage_path)) {
      fs.writeFileSync(storagePath, req.file.buffer);
    }

    // Insert DB record
    const fileRecord = await db.createUploadedFile({
      visitId,
      originalName:  req.file.originalname,
      fileHash,
      fileSizeBytes: req.file.size,
      storagePath,
      fileFormat,
    });

    log.info('[upload] File accepted', {
      file_id:  fileRecord.id,
      visit_id: visitId,
      file:     req.file.originalname,
      size_kb:  Math.round(req.file.size / 1024),
      format:   fileRecord.file_format,
    });

    // Respond immediately — parse happens in background
    res.status(201).json(fileRecord);

    // Kick off background parse (does not block response)
    setImmediate(() => parseInBackground(fileRecord, visitId));
  } catch (err) {
    next(err);
  }
});

// =============================================================
// POST /api/files/:id/reparse
// Re-triggers background parsing for a file stuck in pending/error.
// =============================================================
router.post('/:id/reparse', async (req, res, next) => {
  try {
    const fileRecord = await db.getFileById(parseInt(req.params.id, 10));
    if (!fileRecord) return res.status(404).json({ error: 'File not found' });

    if (fileRecord.parse_status === 'parsed') {
      return res.status(409).json({ error: 'File already parsed. Delete raw_measurements first if you need to reparse.' });
    }

    if (!fs.existsSync(fileRecord.storage_path)) {
      return res.status(404).json({ error: 'File not found on disk — cannot reparse' });
    }

    // Reset status so background parse will run cleanly
    await db.resetFileToPending(fileRecord.id);

    res.json({ message: 'Reparse triggered', file_id: fileRecord.id });

    setImmediate(() => parseInBackground(fileRecord, fileRecord.visit_id));
  } catch (err) {
    next(err);
  }
});

// =============================================================
// DELETE /api/files/:id
// Removes DB record, raw_measurements, and the file from disk.
// =============================================================
router.delete('/:id', async (req, res, next) => {
  try {
    const fileRecord = await db.getFileById(parseInt(req.params.id, 10));
    if (!fileRecord) return res.status(404).json({ error: 'File not found' });

    // CASCADE on file_id FK removes raw_measurements automatically
    await db.deleteUploadedFile(fileRecord.id);

    if (fs.existsSync(fileRecord.storage_path)) {
      fs.unlinkSync(fileRecord.storage_path);
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// =============================================================
// GET /api/files/:id/download
// =============================================================
router.get('/:id/download', async (req, res, next) => {
  try {
    const fileRecord = await db.getFileById(parseInt(req.params.id, 10));

    if (!fileRecord) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (!fs.existsSync(fileRecord.storage_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.original_name}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    fs.createReadStream(fileRecord.storage_path).pipe(res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.parseInBackground = parseInBackground;
