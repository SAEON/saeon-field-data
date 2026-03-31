// QueueTab — upload and parse activity for the active draft visit.
// Two sections: logger files (grouped by parse state) + offline readings queue.
import { useEffect, useRef } from 'react';
import { getVisit, reparseFile } from '../services/api.js';
import { useOfflineQueue } from '../hooks/useOfflineQueue.js';

// ── Lookup tables ─────────────────────────────────────────────────────────────

const FAMILY_CONFIG = {
  rainfall:    { label: 'Rainfall',    icon: '≀', color: '#1565C0', bg: '#EBF2FB' },
  groundwater: { label: 'Groundwater', icon: '⊥', color: '#00695C', bg: '#E0F2F1' },
  met:         { label: 'Meteorological', icon: '△', color: '#2E7D32', bg: '#E8F5E9' },
};

const READING_META = {
  dipper_depth:           { label: 'Dipper depth',          unit: 'm'  },
  dipper_time:            { label: 'Time of measurement',   unit: ''   },
  water_colour:           { label: 'Water colour',          unit: ''   },
  battery_voltage:        { label: 'Battery voltage',       unit: 'V'  },
  overall_site_condition: { label: 'Site condition',        unit: ''   },
  gauge_condition:        { label: 'Gauge condition',       unit: ''   },
  gauge_reading:          { label: 'Gauge reading',         unit: 'mm' },
  last_emptied:           { label: 'Last emptied',          unit: ''   },
  pyranometer_clean:      { label: 'Pyranometer clean',     unit: ''   },
  anemometer_spinning:    { label: 'Anemometer spinning',   unit: ''   },
  rain_gauge_clear:       { label: 'Rain gauge clear',      unit: ''   },
  wind_vane:              { label: 'Wind vane readable',    unit: ''   },
  logger_screen:          { label: 'Logger screen reading', unit: ''   },
};

// State → visual style (color bar on card left edge carries the state meaning — no emojis)
const FILE_STATE = {
  uploading: { label: 'Uploading',         color: '#3B7DD8', groupLabel: 'Uploading now' },
  pending:   { label: 'Processing',        color: '#E65100', groupLabel: 'Processing'    },
  error:     { label: 'Parse failed',      color: '#B71C1C', groupLabel: 'Failed'        },
  queued:    { label: 'Waiting — offline', color: '#E65100', groupLabel: 'Waiting'       },
  parsed:    { label: 'Parsed',            color: '#2E7D32', groupLabel: 'Complete'      },
};

const GROUP_ORDER = ['uploading', 'pending', 'error', 'queued', 'parsed'];

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function readingValue(payload) {
  if (payload.value_numeric != null) {
    const meta = READING_META[payload.reading_type];
    const unit = payload.unit || meta?.unit || '';
    return unit ? `${payload.value_numeric} ${unit}` : String(payload.value_numeric);
  }
  return payload.value_text || '—';
}

// ── Main component ────────────────────────────────────────────────────────────

export default function QueueTab({ visitId, files, setFiles, onGoToFiles, station }) {
  const pollTimer = useRef(null);
  const { items: queuedReadings, failedCount, retryItem } = useOfflineQueue(visitId);

  const pendingReadings = queuedReadings.filter(r => r.status !== 'synced');

  function patchFile(localId, patch) {
    setFiles(prev => prev.map(f => f.localId === localId ? { ...f, ...patch } : f));
  }

  // Poll for files still in 'pending' parse state
  useEffect(() => {
    if (!visitId) return;
    const hasPending = files.some(f => f.parseState === 'pending' && f.dbId);
    if (!hasPending) { clearTimeout(pollTimer.current); return; }
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
      } catch { /* silent — retry next cycle */ }
    }, 5000);
    return () => clearTimeout(pollTimer.current);
  }); // no dep array — re-evaluate every render

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

  async function retryAllFailedReadings() {
    for (const r of queuedReadings.filter(r => r.status === 'failed')) {
      await retryItem(r.id);
    }
  }

  // ── Empty states ─────────────────────────────────────────────────────────────

  if (!visitId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-[15px] font-semibold text-text-dark">No active visit</div>
        <div className="text-[13px] text-text-light leading-relaxed">
          Start a visit to see file upload progress here.
        </div>
      </div>
    );
  }

  if (files.length === 0 && pendingReadings.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-[15px] font-semibold text-text-dark">No uploads in progress</div>
        <div className="text-[13px] text-text-light leading-relaxed">
          Files and readings will appear here once you start uploading.
        </div>
        <button onClick={onGoToFiles} className="cta-btn mt-2">Upload files →</button>
      </div>
    );
  }

  // ── Build file groups ─────────────────────────────────────────────────────

  const groups = {};
  for (const f of files) {
    if (!groups[f.parseState]) groups[f.parseState] = [];
    groups[f.parseState].push(f);
  }

  const cfg         = FAMILY_CONFIG[station?.data_family] || FAMILY_CONFIG.groundwater;
  const parsedCount = (groups['parsed'] || []).length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* Visit context strip */}
      <div
        className="flex items-center justify-between px-5 py-2 shrink-0 text-[12px] font-medium"
        style={{ background: cfg.bg, borderBottom: `1px solid ${cfg.color}33`, color: cfg.color }}
      >
        <span>{cfg.icon} Active visit — {station?.display_name || '…'}</span>
        {files.length > 0 && (
          <span className="font-semibold">{parsedCount}/{files.length} files done</span>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">

        {/* ── File groups ────────────────────────────────────────────── */}
        {GROUP_ORDER.filter(g => groups[g]?.length > 0).map(state => {
          const stateStyle = FILE_STATE[state];
          const groupFiles = groups[state];
          const isComplete = state === 'parsed';

          return (
            <div key={state} className="mb-4">
              {/* Group header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: stateStyle.color }}>
                    {stateStyle.groupLabel}
                  </span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ color: stateStyle.color, background: `${stateStyle.color}18` }}
                  >{groupFiles.length}</span>
                </div>
                {state === 'error' && (
                  <button
                    onClick={() => groupFiles.forEach(f => retryFile(f.localId))}
                    className="text-[11px] font-semibold text-blue bg-transparent border-none"
                  >Retry all →</button>
                )}
              </div>

              {/* File cards */}
              <div className="flex flex-col gap-1.5">
                {groupFiles.map(file => (
                  <div
                    key={file.localId}
                    className="bg-white rounded-xl overflow-hidden flex"
                    style={{
                      border:  `1.5px solid ${state === 'error' ? '#FECACA' : state === 'parsed' ? '#BBF7D0' : 'var(--color-border)'}`,
                      opacity: isComplete ? 0.75 : 1,
                    }}
                  >
                    {/* Left color bar */}
                    <div className="w-1 shrink-0" style={{ background: stateStyle.color }} />

                    <div className="flex-1 px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-semibold text-text-dark truncate">{file.name}</div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: cfg.bg, color: cfg.color }}
                            >{cfg.icon} {cfg.label}</span>
                            {file.size && (
                              <span className="text-[10px] text-text-light">{formatBytes(file.size)}</span>
                            )}
                            {file.records != null && (
                              <span className="text-[10px] font-semibold text-success">
                                {Number(file.records).toLocaleString()} records
                              </span>
                            )}
                          </div>
                          {file.dateRange && (
                            <div className="text-[10px] text-text-light mt-0.5">{file.dateRange}</div>
                          )}
                          {state === 'error' && (
                            <div className="text-[10px] text-error mt-1">Parser failed — tap ↺ to retry</div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {state === 'error' && (
                            <button
                              onClick={e => { e.stopPropagation(); retryFile(file.localId); }}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px] font-bold"
                              style={{ background: '#EBF2FB', border: '1px solid #BFDBFE', color: '#1565C0' }}
                            >↺</button>
                          )}
                        </div>
                      </div>

                      {/* Indeterminate progress bar — uploading only */}
                      {state === 'uploading' && (
                        <div className="mt-2">
                          <div className="h-1 rounded-full bg-surface-dark overflow-hidden">
                            <div className="file-progress-bar" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* ── Readings queue section ──────────────────────────────────── */}
        {pendingReadings.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-text-light uppercase tracking-wide">
                  Manual readings
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-warning-light text-warning">
                  {pendingReadings.length} pending
                </span>
              </div>
              {failedCount > 0 && (
                <button
                  onClick={retryAllFailedReadings}
                  className="text-[11px] font-semibold text-blue bg-transparent border-none"
                >Retry all →</button>
              )}
            </div>

            <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1.5px solid var(--color-border)' }}>
              {pendingReadings.map((r, i) => {
                const meta     = READING_META[r.payload?.reading_type] || { label: r.payload?.reading_type?.replace(/_/g, ' ') || '—', unit: '' };
                const isFailed = r.status === 'failed';
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between px-3.5 py-2.5"
                    style={{ borderBottom: i < pendingReadings.length - 1 ? '1px solid var(--color-surface-dark)' : 'none' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-text-dark">{meta.label}</div>
                      <div className="text-[11px] text-text-light mt-0.5">{readingValue(r.payload || {})}</div>
                      {isFailed && (
                        <div className="text-[10px] text-error mt-0.5">
                          Sync failed after {r.attempts} attempt{r.attempts !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[11px] font-semibold" style={{ color: isFailed ? '#B71C1C' : '#E65100' }}>
                        {isFailed ? '⚠ Failed' : 'Queued'}
                      </span>
                      {isFailed && (
                        <button
                          onClick={() => retryItem(r.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px] font-bold"
                          style={{ background: '#EBF2FB', border: '1px solid #BFDBFE', color: '#1565C0' }}
                        >↺</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-[10px] text-text-light text-center mt-1.5">
              Readings saved locally — will sync automatically on reconnect
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
