// QueueTab — shows ALL upload/parse activity for the active draft visit.
// Not scoped to a single section; lives at the Queue tab level.
// Polls GET /api/visits/:visitId every 5s for any file in 'pending' state.
import { useEffect, useRef } from 'react';
import { getVisit, reparseFile } from '../services/api.js';

function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

const FORMAT_LABELS = {
  xle: { label: 'Solonist XLE', icon: '💧' },
  xml: { label: 'Solonist XML', icon: '💧' },
  dat: { label: 'Campbell TOA5', icon: '🌤' },
  csv: { label: 'HOBO / STOM',  icon: '🌧' },
};

function detectFormat(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return { ext, ...(FORMAT_LABELS[ext] || { label: 'Unknown', icon: '📄' }) };
}

const GROUP_ORDER = ['uploading', 'pending', 'error', 'parsed', 'queued'];

const GROUP_LABELS = {
  uploading: 'Uploading',
  pending:   'Processing',
  error:     'Failed',
  parsed:    'Complete',
  queued:    'Waiting — offline',
};

export default function QueueTab({ visitId, files, setFiles, onGoToFiles }) {
  const pollTimer = useRef(null);

  function patchFile(localId, patch) {
    setFiles(prev => prev.map(f => f.localId === localId ? { ...f, ...patch } : f));
  }

  // Poll for any file still in 'pending' state
  useEffect(() => {
    if (!visitId) return;
    const hasPending = files.some(f => f.parseState === 'pending' && f.dbId);
    if (!hasPending) {
      clearTimeout(pollTimer.current);
      return;
    }
    clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(async () => {
      try {
        const visit = await getVisit(visitId);
        for (const dbFile of (visit.files || [])) {
          const local = files.find(f => f.dbId === dbFile.id);
          if (!local || local.parseState !== 'pending') continue;
          if (dbFile.parse_status === 'parsed') {
            patchFile(local.localId, {
              parseState: 'parsed',
              dateRange:  `${fmtDate(dbFile.date_range_start)} — ${fmtDate(dbFile.date_range_end)}`,
              records:    dbFile.record_count,
            });
          } else if (dbFile.parse_status === 'error') {
            patchFile(local.localId, { parseState: 'error' });
          }
        }
      } catch {
        // silent — retry next cycle
      }
    }, 5000);

    return () => clearTimeout(pollTimer.current);
  }); // no dep array — re-evaluate every render so pending count stays fresh

  async function retryFile(localId) {
    const f = files.find(f => f.localId === localId);
    if (!f?.dbId) return;
    patchFile(localId, { parseState: 'pending' });
    try {
      await reparseFile(f.dbId);
    } catch {
      patchFile(localId, { parseState: 'error' });
    }
  }

  function retryAllFailed() {
    files.filter(f => f.parseState === 'error').forEach(f => retryFile(f.localId));
  }

  if (!visitId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-[40px]">📶</div>
        <div className="text-[15px] font-semibold text-text-dark">No active visit</div>
        <div className="text-[13px] text-text-light leading-relaxed">
          Start a visit to see file upload progress here.
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-[40px]">📭</div>
        <div className="text-[15px] font-semibold text-text-dark">No files yet</div>
        <div className="text-[13px] text-text-light leading-relaxed">
          Files you upload will appear here with live parse status.
        </div>
        <button onClick={onGoToFiles} className="cta-btn mt-2">
          Upload files →
        </button>
      </div>
    );
  }

  const hasErrors = files.some(f => f.parseState === 'error');

  // Group by state
  const groups = {};
  for (const f of files) {
    const key = f.parseState;
    if (!groups[key]) groups[key] = [];
    groups[key].push(f);
  }

  return (
    <div className="flex flex-col flex-1 overflow-y-auto px-4 pt-4 pb-6">

      {hasErrors && (
        <div className="flex justify-end mb-3">
          <button
            onClick={retryAllFailed}
            className="text-[12px] font-semibold text-blue bg-transparent border-none"
          >
            Retry all failed →
          </button>
        </div>
      )}

      {GROUP_ORDER.filter(g => groups[g]?.length > 0).map(group => (
        <div key={group} className="mb-5">
          <div className="text-[11px] font-semibold text-text-light uppercase tracking-wide mb-2">
            {GROUP_LABELS[group]} · {groups[group].length}
          </div>

          <div className="flex flex-col gap-2">
            {groups[group].map(file => {
              const fmt       = detectFormat(file.name);
              const isParsed  = file.parseState === 'parsed';
              const isErr     = file.parseState === 'error';
              const isPending = file.parseState === 'pending';

              return (
                <div
                  key={file.localId}
                  data-format={fmt.ext}
                  data-state={file.parseState}
                  className="file-card"
                  role="button"
                  tabIndex={0}
                  onClick={onGoToFiles}
                  onKeyDown={e => e.key === 'Enter' && onGoToFiles()}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="format-icon">{fmt.icon}</div>

                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-text-dark truncate">
                        {file.name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span data-format={fmt.ext} className="format-label">{fmt.label}</span>
                        {file.size != null && (
                          <>
                            <span className="text-border text-[11px]">·</span>
                            <span className="text-[11px] text-text-light">{formatBytes(file.size)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {isErr && (
                      <button
                        onClick={e => { e.stopPropagation(); retryFile(file.localId); }}
                        title="Re-run parser on stored file"
                        className="file-action-btn file-action-btn--retry"
                      >
                        ↺
                      </button>
                    )}
                  </div>

                  {/* Indeterminate bar while uploading */}
                  {file.parseState === 'uploading' && (
                    <div className="mt-2.5">
                      <div className="h-1 rounded-full bg-surface-dark overflow-hidden">
                        <div className="file-progress-bar" />
                      </div>
                    </div>
                  )}

                  {/* Status + result row */}
                  <div
                    className="mt-2 pt-2 flex items-center justify-between"
                    style={{ borderTop: '1px solid var(--color-surface)' }}
                  >
                    <div className={`text-[11px] font-semibold ${
                      isParsed  ? 'text-success' :
                      isErr     ? 'text-error'   :
                      isPending ? 'text-warning'  :
                      'text-blue'
                    }`}>
                      {isParsed ? '✓ Parsed' : isErr ? '⚠ Parse failed' : isPending ? '🔄 Processing…' : file.parseState === 'queued' ? '📶 Queued' : '⏳ Uploading…'}
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
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
