import { useState, useRef, useEffect } from 'react';
import { uploadFile, reparseFile, deleteFile, getVisit, getStationCoverage } from '../services/api.js';

const FORMAT_MAP = {
  xle: { label: 'Solonist XLE',  icon: '⊥', families: ['groundwater'] },
  xml: { label: 'Solonist XML',  icon: '⊥', families: ['groundwater'] },
  dat: { label: 'Campbell TOA5', icon: '△', families: ['met'] },
  csv: { label: 'HOBO / STOM',   icon: '≀', families: ['rainfall', 'met'] },
};

// Accepted extensions and MIME accept string per family
const FAMILY_ACCEPT = {
  groundwater: '.xle,.xml',
  rainfall:    '.csv',
  met:         '.dat,.csv',
  default:     '.csv,.dat,.xle,.xml',
};

// States where the file already exists on the server
const ON_SERVER = new Set(['pending', 'parsed', 'error', 'retrying']);

// ── Client-side CSV preview scanner ───────────────────────────────────────
// Reads the file in the browser, scans headers + data rows, returns a summary.
// Non-blocking: returns null on any parse error so the upload can still proceed.
function splitCSVLine(line) {
  const fields = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  fields.push(cur.trim());
  return fields;
}

function fmtPreviewDate(raw) {
  // Handles YY/MM/DD, YYYY/MM/DD, MM/DD/YY [AM/PM] — shows local date only
  const s = raw.replace(/"/g, '').trim();
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m1) return raw;
  let [, a, b, c] = m1;
  let yr, mo, dy;
  if (c.length === 4) { yr = +c; mo = +a; dy = +b; }  // MM/DD/YYYY
  else if (+a > 12)   { yr = 2000 + +a; mo = +b; dy = +c; } // YY/MM/DD
  else                { yr = 2000 + +c; mo = +a; dy = +b; } // MM/DD/YY
  const d = new Date(yr, mo - 1, dy);
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function cleanColHeader(raw) {
  return raw
    .replace(/\s*\(LGR\s+S\/N:.*?\)/gi, '')
    .replace(/\s+LGR\s+S\/N:.*$/i, '')
    .replace(/\s+#\d+.*$/, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

async function previewHoboCSV(rawFile) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = e => {
      try {
        const lines = e.target.result.replace(/^﻿/, '').split(/\r?\n/);

        // Locate header row (first row containing "date" or "time")
        let headerIdx = -1;
        for (let i = 0; i < Math.min(3, lines.length); i++) {
          if (/date|time/i.test(lines[i])) { headerIdx = i; break; }
        }
        if (headerIdx === -1) return resolve(null);

        const headers   = splitCSVLine(lines[headerIdx]);
        const colOffset = headers[0].replace(/"/g, '').trim() === '#' ? 1 : 0;

        // Table headers: skip the id (#) column, clean labels
        const tableHeaders = headers.slice(colOffset).map(cleanColHeader);

        // Identify column indices for rain, temp, batt; extract serial from headers
        let rainIdx = -1, tempIdx = -1, battIdx = -1, serial = null;
        for (let i = colOffset + 1; i < headers.length; i++) {
          const raw = headers[i];
          const h   = raw.toLowerCase().replace(/"/g, '');
          if (!serial) {
            const m = raw.match(/LGR\s+S\/N:\s*(\d+)/i) || raw.match(/#(\d+)/);
            if (m) serial = m[1];
          }
          if (rainIdx < 0 && (h.includes('rain') || h.includes('event'))) rainIdx = i;
          if (tempIdx < 0 && h.includes('temp')) tempIdx = i;
          if (battIdx < 0 && h.includes('batt')) battIdx = i;
        }

        let tipCount = 0, totalMm = 0, prevRain = 0;
        let firstTs = null, lastTs = null;
        let tempMin = Infinity, tempMax = -Infinity, lastBatt = null;
        const tableRows = [];

        for (let i = headerIdx + 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const f = splitCSVLine(line);
          if (f.length < 2) continue;

          const ts = (f[colOffset] || '').replace(/"/g, '').trim();
          if (!ts) continue;

          // Collect row for table (skip id col)
          tableRows.push(f.slice(colOffset).map(v => v.replace(/^"|"$/g, '')));

          if (rainIdx >= 0) {
            const v = parseFloat(f[rainIdx]);
            if (!isNaN(v)) {
              const delta = v - prevRain;
              if (delta > 0) {
                tipCount++;
                totalMm += delta;
                if (!firstTs) firstTs = ts;
                lastTs = ts;
              }
              prevRain = v;
            }
          }
          if (tempIdx >= 0) {
            const v = parseFloat(f[tempIdx]);
            if (!isNaN(v)) { tempMin = Math.min(tempMin, v); tempMax = Math.max(tempMax, v); }
          }
          if (battIdx >= 0) {
            const v = parseFloat(f[battIdx]);
            if (!isNaN(v)) lastBatt = v;
          }
        }

        resolve({
          serial,
          tipCount,
          totalMm:      parseFloat(totalMm.toFixed(3)),
          firstTs:      firstTs ? fmtPreviewDate(firstTs) : null,
          lastTs:       lastTs  ? fmtPreviewDate(lastTs)  : null,
          tempMin:      tempMin === Infinity  ? null : parseFloat(tempMin.toFixed(1)),
          tempMax:      tempMax === -Infinity ? null : parseFloat(tempMax.toFixed(1)),
          lastBatt:     lastBatt != null ? parseFloat(lastBatt.toFixed(2)) : null,
          tableHeaders,
          tableRows,
        });
      } catch { resolve(null); }
    };
    reader.readAsText(rawFile, 'utf-8');
  });
}

const PAGE_SIZE = 20;

function FilePreviewCard({ raw, preview }) {
  const [page, setPage] = useState(0);
  if (!preview) {
    return (
      <div className="rounded-xl p-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="text-[12px] font-semibold text-text-dark truncate mb-1">{raw.name}</div>
        <div className="text-[11px] text-text-light">Preview not available — file will still upload normally.</div>
      </div>
    );
  }

  const totalPages = Math.ceil(preview.tableRows.length / PAGE_SIZE);
  const pageRows   = preview.tableRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
      {/* Summary strip */}
      <div className="px-3 py-2.5" style={{ background: 'var(--color-surface)' }}>
        <div className="text-[12px] font-semibold text-text-dark truncate mb-2">{raw.name}</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {preview.serial && (
            <span className="text-[11px] text-text-light">Serial <span className="font-semibold text-text-dark">{preview.serial}</span></span>
          )}
          {preview.firstTs && preview.lastTs && (
            <span className="text-[11px] text-text-light">
              Period <span className="font-semibold text-text-dark">{preview.firstTs} – {preview.lastTs}</span>
            </span>
          )}
          {preview.tipCount > 0 && (
            <span className="text-[11px] text-text-light">
              Tips <span className="font-semibold text-text-dark">{preview.tipCount.toLocaleString()} · {preview.totalMm.toFixed(1)} mm</span>
            </span>
          )}
          {preview.tempMin != null && (
            <span className="text-[11px] text-text-light">
              Temp <span className="font-semibold text-text-dark">{preview.tempMin}–{preview.tempMax}°C</span>
            </span>
          )}
          {preview.lastBatt != null && (
            <span className="text-[11px] text-text-light">
              Batt <span className="font-semibold text-text-dark">{preview.lastBatt} V</span>
            </span>
          )}
        </div>
      </div>

      {/* Raw data table */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 300, borderTop: '1px solid var(--color-border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: 'monospace' }}>
          <thead>
            <tr style={{ background: 'var(--color-surface-dark)' }}>
              <th style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--color-text-light)', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid var(--color-border)' }}>#</th>
              {preview.tableHeaders.map((h, i) => (
                <th key={i} style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--color-text-light)', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, ri) => {
              const absRow = page * PAGE_SIZE + ri + 1;
              return (
                <tr key={ri} style={{ background: ri % 2 === 0 ? 'white' : 'var(--color-surface)' }}>
                  <td style={{ padding: '3px 6px', textAlign: 'right', color: 'var(--color-text-light)', borderBottom: '1px solid var(--color-surface-dark)' }}>{absRow}</td>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ padding: '3px 8px', whiteSpace: 'nowrap', color: cell ? 'var(--color-text-dark)' : 'var(--color-text-light)', borderBottom: '1px solid var(--color-surface-dark)' }}>
                      {cell || '—'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2" style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-[10px] font-semibold px-2 py-1 rounded"
            style={{ color: page === 0 ? 'var(--color-text-light)' : 'var(--color-blue)', background: 'none', border: 'none', cursor: page === 0 ? 'default' : 'pointer' }}
          >
            ← Prev
          </button>
          <span className="text-[11px] text-text-light">
            Rows {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, preview.tableRows.length)} of {preview.tableRows.length.toLocaleString()}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="text-[10px] font-semibold px-2 py-1 rounded"
            style={{ color: page === totalPages - 1 ? 'var(--color-text-light)' : 'var(--color-blue)', background: 'none', border: 'none', cursor: page === totalPages - 1 ? 'default' : 'pointer' }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function detectFormat(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return { ext, ...(FORMAT_MAP[ext] || { label: 'Unknown', icon: '▢' }) };
}

function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function UploadFiles({ visitId, stationId, files, setFiles, dataFamily, loggerUnavailable = false }) {
  const acceptedFormats = Object.entries(FORMAT_MAP)
    .filter(([, v]) => !dataFamily || v.families.includes(dataFamily))
    .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {});
  const acceptAttr = FAMILY_ACCEPT[dataFamily] || FAMILY_ACCEPT.default;
  const [dragging,        setDragging]        = useState(false);
  const [pendingDelete,   setPendingDelete]   = useState(null); // localId awaiting delete confirm
  const [deleting,        setDeleting]        = useState(false);
  const [coverageEnd,     setCoverageEnd]     = useState(null);
  const [pendingPreviews, setPendingPreviews] = useState(null); // [{ raw, preview }] awaiting confirm
  const [rejectedFiles,   setRejectedFiles]   = useState([]);   // file names blocked upfront
  const fileInputRef   = useRef(null);
  const pollTimers     = useRef({});   // localId → timeout handle
  const onlineTimer    = useRef(null);

  // Clear all poll timers on unmount
  useEffect(() => {
    return () => {
      Object.values(pollTimers.current).forEach(clearTimeout);
      clearTimeout(onlineTimer.current);
    };
  }, []);

  // Fetch station data coverage to show last download date hint
  useEffect(() => {
    if (!stationId) return;
    getStationCoverage(stationId)
      .then(data => {
        const rows = data.coverage || [];
        const latest = rows.reduce((max, row) => {
          if (!row.coverage_end) return max;
          return !max || row.coverage_end > max ? row.coverage_end : max;
        }, null);
        setCoverageEnd(latest);
      })
      .catch(() => {}); // non-critical — silently ignore
  }, [stationId]);

  // Auto-retry queued files (current session only — need raw file) on reconnect
  useEffect(() => {
    function handleOnline() {
      clearTimeout(onlineTimer.current);
      onlineTimer.current = setTimeout(() => {
        setFiles(prev => {
          prev.filter(f => f.parseState === 'queued' && f.raw).forEach(f => {
            const ac = new AbortController();
            patchFile(f.localId, { parseState: 'uploading', abortController: ac });
            doUpload(f.localId, f.raw, ac);
          });
          return prev;
        });
      }, 2500);
    }
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Start polling for any files already in 'pending' state (handles page-refresh resume)
  useEffect(() => {
    files.forEach(f => {
      if (f.parseState === 'pending' && f.dbId && !pollTimers.current[f.localId]) {
        pollTimers.current[f.localId] = setTimeout(() => pollStatus(f.localId, f.dbId), 1000);
      }
    });
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  function patchFile(localId, patch) {
    setFiles(prev => prev.map(f => f.localId === localId ? { ...f, ...patch } : f));
  }

  // Poll GET /api/visits/:id until this file reaches a terminal parse_status
  async function pollStatus(localId, dbId) {
    try {
      const visit  = await getVisit(visitId);
      const dbFile = (visit.files || []).find(f => f.id === dbId);
      if (!dbFile) return;

      if (dbFile.parse_status === 'parsed') {
        patchFile(localId, {
          parseState:  'parsed',
          dateRange:   `${fmtDate(dbFile.date_range_start)} — ${fmtDate(dbFile.date_range_end)}`,
          records:     dbFile.record_count,
          hasGap:      dbFile.has_gap  ?? false,
          gapDays:     dbFile.gap_days ?? null,
          parseError:  null,
        });
      } else if (dbFile.parse_status === 'error') {
        patchFile(localId, { parseState: 'error', parseError: dbFile.parse_error || 'Unknown parse error' });
      } else {
        pollTimers.current[localId] = setTimeout(() => pollStatus(localId, dbId), 2000);
      }
    } catch {
      pollTimers.current[localId] = setTimeout(() => pollStatus(localId, dbId), 3000);
    }
  }

  async function doUpload(localId, rawFile, abortController) {
    if (!navigator.onLine) {
      patchFile(localId, { parseState: 'queued', abortController: null });
      return;
    }
    try {
      const result = await uploadFile(visitId, rawFile, abortController.signal);
      patchFile(localId, { parseState: 'pending', dbId: result.id, abortController: null });
      pollTimers.current[localId] = setTimeout(() => pollStatus(localId, result.id), 1500);
    } catch (err) {
      if (err.name === 'AbortError') return; // user cancelled — file already removed from list
      patchFile(localId, { parseState: navigator.onLine ? 'error' : 'queued', abortController: null });
    }
  }

  async function addFiles(fileList) {
    const allowedExts = new Set(
      acceptAttr.split(',').map(s => s.trim().replace(/^\./, '').toLowerCase())
    );
    const accepted = [];
    const rejected = [];
    for (const f of Array.from(fileList)) {
      const ext = f.name.split('.').pop().toLowerCase();
      (allowedExts.has(ext) ? accepted : rejected).push(f);
    }
    setRejectedFiles(rejected.map(f => f.name));
    if (accepted.length === 0) return;
    const previews = await Promise.all(accepted.map(async raw => {
      const ext = raw.name.split('.').pop().toLowerCase();
      const preview = ext === 'csv' ? await previewHoboCSV(raw) : null;
      return { raw, preview };
    }));
    setPendingPreviews(previews);
  }

  function confirmPreviews() {
    if (!pendingPreviews) return;
    const added = pendingPreviews.map(({ raw }, i) => {
      const abortController = new AbortController();
      return {
        localId:         `${Date.now()}-${i}`,
        name:            raw.name,
        size:            raw.size,
        raw,
        parseState:      'uploading',
        dbId:            null,
        abortController,
        dateRange:       null,
        records:         null,
      };
    });
    setPendingPreviews(null);
    setFiles(prev => [...prev, ...added]);
    added.forEach(f => doUpload(f.localId, f.raw, f.abortController));
  }

  // ↺ Retry — file is on server in error state. Calls reparse, no re-upload.
  async function retryFile(localId) {
    const f = files.find(f => f.localId === localId);
    if (!f?.dbId) return;
    patchFile(localId, { parseState: 'retrying', parseError: null });
    try {
      await reparseFile(f.dbId);
      patchFile(localId, { parseState: 'pending' });
      clearTimeout(pollTimers.current[localId]);
      pollTimers.current[localId] = setTimeout(() => pollStatus(localId, f.dbId), 1500);
    } catch (err) {
      patchFile(localId, { parseState: 'error', parseError: err.message || 'Retry request failed' });
    }
  }

  // ✕ Remove — behaviour depends on where in the lifecycle the file is.
  function removeFile(localId) {
    const f = files.find(f => f.localId === localId);
    if (!f) return;

    if (f.parseState === 'uploading') {
      // Cancel in-flight upload — no API call, nothing written to DB yet
      f.abortController?.abort();
      clearTimeout(pollTimers.current[localId]);
      delete pollTimers.current[localId];
      setFiles(prev => prev.filter(f => f.localId !== localId));
    } else if (ON_SERVER.has(f.parseState) && f.dbId) {
      // File landed on server — must confirm before DELETE /api/files/:id
      setPendingDelete(localId);
    } else {
      // Queued (no dbId) — safe to remove locally
      clearTimeout(pollTimers.current[localId]);
      delete pollTimers.current[localId];
      setFiles(prev => prev.filter(f => f.localId !== localId));
    }
  }

  async function confirmDelete() {
    const localId = pendingDelete;
    const f = files.find(f => f.localId === localId);
    setPendingDelete(null);
    if (!f?.dbId) return;

    setDeleting(true);
    try {
      await deleteFile(f.dbId);
    } catch {
      // Server delete failed — still remove from UI (user made the decision)
    } finally {
      setDeleting(false);
    }
    clearTimeout(pollTimers.current[localId]);
    delete pollTimers.current[localId];
    setFiles(prev => prev.filter(f => f.localId !== localId));
  }

  function retryAllFailed() {
    files.filter(f => f.parseState === 'error').forEach(f => retryFile(f.localId));
  }

  const hasFiles  = files.length > 0;
  const hasErrors = files.some(f => f.parseState === 'error');

  const pendingDeleteFile = pendingDelete ? files.find(f => f.localId === pendingDelete) : null;

  return (
    <div className="flex flex-col flex-1">

      {/* ── Scrollable body ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pt-4">

        {/* ── Coverage hint ──────────────────────────────────────── */}
        {coverageEnd && (
          <div
            className="rounded-xl px-3.5 py-2.5 mb-3 flex items-start gap-2"
            style={{ background: '#EBF2FB', border: '1px solid #3B7DD833' }}
          >
            <div>
              <div className="text-[12px] font-semibold text-navy">Last data ends {fmtDate(coverageEnd)}</div>
              <div className="text-[11px] text-text-med mt-0.5">
                Ensure your logger download starts from this date to avoid gaps.
              </div>
            </div>
          </div>
        )}

        {/* ── Logger unavailable notice / Drop zone ──────────────── */}
        {loggerUnavailable ? (
          <div
            className="rounded-xl px-4 py-5 mb-4 flex flex-col gap-2"
            style={{ background: '#FFF8E1', border: '1.5px solid #FFD54F' }}
          >
            <div className="text-[14px] font-bold" style={{ color: '#E65100' }}>
              No file expected for this visit
            </div>
            <div className="text-[12px] leading-relaxed" style={{ color: '#795548' }}>
              The logger was recorded as missing, stopped, or decommissioned. No download was possible — this visit can be submitted without a file.
            </div>
            <div className="text-[11px] font-semibold mt-1" style={{ color: '#9E9E9E' }}>
              If you did manage to download data, you can still add a file below.
            </div>
            <div
              className="drop-zone mt-2"
              data-dragging={dragging ? 'true' : undefined}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current.click()}
              style={{ marginBottom: 0 }}
            >
              <div className="text-[12px] text-text-light">Tap to add a file anyway</div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={acceptAttr}
                onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
                className="hidden"
              />
            </div>
          </div>
        ) : (
          <div
            data-dragging={dragging ? 'true' : undefined}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current.click()}
            className="drop-zone"
          >
            <div className="text-[36px] mb-2.5">▢</div>
            <div className="text-[14px] font-semibold text-text-dark mb-1">
              {dragging ? 'Drop files here' : 'Tap to select logger files'}
            </div>
            <div className="text-[12px] text-text-light mb-3 leading-relaxed">
              or drag and drop from your device
            </div>

            {/* Accepted format badges — filtered by station family */}
            <div className="flex justify-center flex-wrap gap-1.5">
              {Object.entries(acceptedFormats).map(([ext, fmt]) => (
                <div key={ext} data-format={ext} className="format-badge">
                  {fmt.icon} .{ext}
                </div>
              ))}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={acceptAttr}
              onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
              className="hidden"
            />
          </div>
        )}

        {/* ── Rejected file warning ──────────────────────────────── */}
        {rejectedFiles.length > 0 && (
          <div
            className="rounded-xl px-3.5 py-2.5 mb-3 flex items-start justify-between gap-2"
            style={{ background: '#FFF3E0', border: '1px solid #E6510033' }}
          >
            <div>
              <div className="text-[12px] font-semibold" style={{ color: '#E65100' }}>
                {rejectedFiles.length === 1
                  ? `"${rejectedFiles[0]}" is not an accepted format`
                  : `${rejectedFiles.length} files are not an accepted format`}
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: '#795548' }}>
                Only {acceptAttr.replace(/,/g, ', ')} files are accepted for this station.
              </div>
            </div>
            <button
              onClick={() => setRejectedFiles([])}
              className="text-[14px] shrink-0 mt-0.5"
              style={{ color: '#E65100', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ── File list ──────────────────────────────────────────── */}
        {hasFiles && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[12px] font-semibold text-text-med">
                {files.length} file{files.length !== 1 ? 's' : ''} selected
              </span>
              {hasErrors && (
                <button
                  onClick={retryAllFailed}
                  className="text-[11px] font-semibold text-blue bg-transparent border-none"
                >
                  Retry all failed →
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {files.map(file => {
                const fmt         = detectFormat(file.name);
                const isErr       = file.parseState === 'error';
                const isParsed    = file.parseState === 'parsed';
                const isUploading = file.parseState === 'uploading';
                const isPending   = file.parseState === 'pending';
                const isQueued    = file.parseState === 'queued';
                const isRetrying  = file.parseState === 'retrying';

                const removeTitle = isUploading
                  ? 'Cancel upload (nothing written to server yet)'
                  : ON_SERVER.has(file.parseState)
                    ? 'Delete from server — will ask for confirmation'
                    : 'Remove (not yet uploaded)';

                return (
                  <div
                    key={file.localId}
                    data-format={fmt.ext}
                    data-state={file.parseState}
                    className="file-card"
                  >
                    {/* Top row */}
                    <div className="flex items-start gap-2.5">
                      <div className="format-icon">{fmt.icon}</div>

                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-text-dark truncate">
                          {file.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span data-format={fmt.ext} className="format-label">{fmt.label}</span>
                          <span className="text-border text-[11px]">·</span>
                          <span className="text-[11px] text-text-light">{formatBytes(file.size)}</span>
                        </div>
                      </div>

                      <div className="flex gap-1.5 shrink-0">
                        {isErr && (
                          <button
                            onClick={() => retryFile(file.localId)}
                            title="Re-run parser on stored file (no re-upload)"
                            className="file-action-btn file-action-btn--retry"
                          >
                            ↺
                          </button>
                        )}
                        <button
                          onClick={() => removeFile(file.localId)}
                          title={removeTitle}
                          className="file-action-btn"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Indeterminate progress bar — only while uploading */}
                    {isUploading && (
                      <div className="mt-2.5">
                        <div className="h-1 rounded-full bg-surface-dark overflow-hidden">
                          <div className="file-progress-bar" />
                        </div>
                      </div>
                    )}

                    {/* Status row */}
                    <div
                      className="mt-2.5 pt-2 flex items-center justify-between"
                      style={{ borderTop: '1px solid var(--color-surface)' }}
                    >
                      <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${
                        isParsed    ? 'text-success' :
                        isErr       ? 'text-error'   :
                        isRetrying  ? 'text-blue'    :
                        isPending   ? 'text-warning'  :
                        isQueued    ? 'text-warning'  :
                        'text-blue'
                      }`}>
                        <span>
                          {isParsed ? '✓' : isErr ? '⚠' : isRetrying ? '↺' : isPending ? '↻' : isQueued ? '≡' : '○'}
                        </span>
                        <span>
                          {isParsed    ? 'Parsed'
                          : isErr      ? 'Parse failed'
                          : isRetrying ? 'Retrying…'
                          : isPending  ? 'Processing…'
                          : isQueued   ? 'Queued — offline'
                          :              'Uploading…'}
                        </span>
                      </div>

                      {isParsed && file.dateRange && (
                        <div className="text-[10px] text-text-light text-right">
                          {file.dateRange}
                          {file.records != null && (
                            <span className="ml-1.5 text-success font-semibold">
                              {Number(file.records).toLocaleString()} records
                            </span>
                          )}
                        </div>
                      )}

                      {isErr && (
                        <div className="text-[10px] text-error text-right" style={{ maxWidth: '60%' }}>
                          {file.parseError || 'Parser failed — tap ↺ to retry'}
                        </div>
                      )}
                    </div>

                    {isParsed && file.hasGap && (
                      <div
                        className="mt-2 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold"
                        style={{ background: '#FFF3E0', color: '#E65100', border: '1px solid #E6510033' }}
                      >
                        Gap detected — {file.gapDays ?? '?'} day{file.gapDays !== 1 ? 's' : ''} of missing data before this file
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!hasFiles && !loggerUnavailable && (
          <div className="text-center py-4 text-[12px] text-text-light">
            No files selected yet — tap the area above to browse.
          </div>
        )}
      </div>

      {/* ── Upload preview sheet ────────────────────────────────── */}
      {pendingPreviews && (
        <div className="back-sheet-overlay">
          <div className="back-sheet" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
            {/* Header */}
            <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
              <div className="text-[15px] font-bold text-text-dark">
                Preview{pendingPreviews.length > 1 ? ` — ${pendingPreviews.length} files` : ''}
              </div>
              <div className="text-[12px] text-text-light mt-0.5">
                Review your data before uploading.
              </div>
            </div>

            {/* Scrollable file cards */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
              {pendingPreviews.map(({ raw, preview }, idx) => (
                <FilePreviewCard key={idx} raw={raw} preview={preview} />
              ))}
            </div>

            {/* Action buttons */}
            <div className="px-4 py-3 flex gap-2.5" style={{ borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
              <button
                onClick={() => setPendingPreviews(null)}
                className="flex-1 h-12 border-[1.5px] border-border rounded-xl bg-white text-text-med text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={confirmPreviews}
                className="flex-1 h-12 border-none rounded-xl text-white text-sm font-semibold"
                style={{ background: 'var(--color-blue)' }}
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation sheet ───────────────────────────── */}
      {pendingDeleteFile && (
        <div className="back-sheet-overlay">
          <div className="back-sheet">
            <div className="text-[15px] font-bold text-text-dark mb-1.5">
              Delete this file?
            </div>
            <div className="text-[13px] font-semibold text-text-med truncate mb-1">
              {pendingDeleteFile.name}
            </div>
            <div className="text-[12px] text-text-light mb-5 leading-relaxed">
              This permanently removes the file from the server and deletes all parsed records. This cannot be undone.
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="flex-1 h-12 border-[1.5px] border-border rounded-xl bg-white text-text-med text-sm font-semibold"
              >
                Keep file
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 h-12 border-none rounded-xl text-white text-sm font-semibold"
                style={{ background: 'var(--color-error)' }}
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
