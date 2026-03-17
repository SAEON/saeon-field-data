import { useState, useRef, useEffect } from 'react';
import { uploadFile, reparseFile, deleteFile, getVisit, getStationCoverage } from '../services/api.js';

const FORMAT_MAP = {
  xle:  { label: 'Solonist XLE',   icon: '💧', families: ['groundwater'] },
  xml:  { label: 'Solonist XML',   icon: '💧', families: ['groundwater'] },
  dat:  { label: 'Campbell TOA5', icon: '🌤', families: ['met'] },
  csv:  { label: 'HOBO / STOM',   icon: '🌧', families: ['rainfall', 'met'] },
  hobo: { label: 'HOBO Binary',   icon: '🌧', families: ['rainfall'] },
};

// Accepted extensions and MIME accept string per family
const FAMILY_ACCEPT = {
  groundwater: '.xle,.xml',
  rainfall:    '.csv,.hobo',
  met:         '.dat,.csv',
  default:     '.csv,.dat,.xle,.xml,.hobo',
};

// States where the file already exists on the server
const ON_SERVER = new Set(['pending', 'parsed', 'error']);

function detectFormat(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return { ext, ...(FORMAT_MAP[ext] || { label: 'Unknown', icon: '📄' }) };
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

export default function UploadFiles({ visitId, stationId, files, setFiles, dataFamily }) {
  const acceptedFormats = Object.entries(FORMAT_MAP)
    .filter(([, v]) => !dataFamily || v.families.includes(dataFamily))
    .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {});
  const acceptAttr = FAMILY_ACCEPT[dataFamily] || FAMILY_ACCEPT.default;
  const [dragging,      setDragging]      = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null); // localId awaiting delete confirm
  const [deleting,      setDeleting]      = useState(false);
  const [coverageEnd,   setCoverageEnd]   = useState(null);
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
          parseState: 'parsed',
          dateRange:  `${fmtDate(dbFile.date_range_start)} — ${fmtDate(dbFile.date_range_end)}`,
          records:    dbFile.record_count,
          hasGap:     dbFile.has_gap  ?? false,
          gapDays:    dbFile.gap_days ?? null,
        });
      } else if (dbFile.parse_status === 'error') {
        patchFile(localId, { parseState: 'error' });
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

  function addFiles(fileList) {
    const added = Array.from(fileList).map((raw, i) => {
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
    setFiles(prev => [...prev, ...added]);
    added.forEach(f => doUpload(f.localId, f.raw, f.abortController));
  }

  // ↺ Retry — file is on server in error state. Calls reparse, no re-upload.
  async function retryFile(localId) {
    const f = files.find(f => f.localId === localId);
    if (!f?.dbId) return;
    patchFile(localId, { parseState: 'pending' });
    try {
      await reparseFile(f.dbId);
      clearTimeout(pollTimers.current[localId]);
      pollTimers.current[localId] = setTimeout(() => pollStatus(localId, f.dbId), 1500);
    } catch {
      patchFile(localId, { parseState: 'error' });
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
    } else if (ON_SERVER.has(f.parseState)) {
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

        {/* ── Drop zone ──────────────────────────────────────────── */}
        <div
          data-dragging={dragging ? 'true' : undefined}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current.click()}
          className="drop-zone"
        >
          <div className="text-[36px] mb-2.5">{dragging ? '📂' : '📁'}</div>
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
                        isParsed   ? 'text-success' :
                        isErr      ? 'text-error'   :
                        isPending  ? 'text-warning'  :
                        isQueued   ? 'text-warning'  :
                        'text-blue'
                      }`}>
                        <span>
                          {isParsed ? '✓' : isErr ? '⚠' : isPending ? '🔄' : isQueued ? '📶' : '⏳'}
                        </span>
                        <span>
                          {isParsed   ? 'Parsed'
                          : isErr     ? 'Parse failed'
                          : isPending ? 'Processing…'
                          : isQueued  ? 'Queued — offline'
                          :             'Uploading…'}
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
                          Parser failed — tap ↺ to retry
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

        {!hasFiles && (
          <div className="text-center py-4 text-[12px] text-text-light">
            No files selected yet — tap the area above to browse.
          </div>
        )}
      </div>

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
