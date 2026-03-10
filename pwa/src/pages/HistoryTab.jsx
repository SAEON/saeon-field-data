// HistoryTab — submitted visit history with family filter, richer cards,
// and a detail sheet showing site condition, files, and split readings.
import { useState, useEffect, useRef } from 'react';
import { getVisits, getVisit, uploadFile } from '../services/api.js';

const ADD_FILE_WINDOW_DAYS = 7;

function daysSince(isoDate) {
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })} at ${d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`;
}

// ── Lookup tables ─────────────────────────────────────────────────────────────

const FAMILY_CONFIG = {
  rainfall:    { label: 'Rainfall',    icon: '🌧', color: '#1565C0', bg: '#EBF2FB', border: '#3B7DD8' },
  groundwater: { label: 'Groundwater', icon: '💧', color: '#00695C', bg: '#E0F2F1', border: '#00695C' },
  met:         { label: 'Meteorological', icon: '🌤', color: '#2E7D32', bg: '#E8F5E9', border: '#2E7D32' },
};

const CONDITION_STYLE = {
  good:     { color: '#2E7D32', bg: '#E8F5E9' },
  fair:     { color: '#E65100', bg: '#FFF3E0' },
  poor:     { color: '#B71C1C', bg: '#FFEBEE' },
  critical: { color: '#B71C1C', bg: '#FFEBEE' },
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

// Required reading types per family — excludes overall_site_condition (shown in banner)
const REQUIRED_PER_FAMILY = {
  rainfall:    ['gauge_condition'],
  groundwater: ['dipper_depth', 'dipper_time'],
  met:         ['pyranometer_clean', 'anemometer_spinning', 'rain_gauge_clear'],
};

function readingValue(r) {
  if (r.value_numeric != null) {
    const meta = READING_META[r.reading_type];
    const unit = r.unit || meta?.unit || '';
    return unit ? `${r.value_numeric} ${unit}` : String(r.value_numeric);
  }
  return r.value_text || '—';
}

// ── Add-file sheet (nested inside detail sheet) ───────────────────────────────

function AddFileSheet({ visit, onClose }) {
  const [files,    setFiles]    = useState([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  async function addFiles(fileList) {
    const added = Array.from(fileList).map((raw, i) => ({
      localId: `${Date.now()}-${i}`,
      name:    raw.name,
      raw,
      parseState: 'uploading',
    }));
    setFiles(prev => [...prev, ...added]);
    for (const f of added) {
      try {
        await uploadFile(visit.id, f.raw);
        setFiles(prev => prev.map(x => x.localId === f.localId ? { ...x, parseState: 'pending' } : x));
      } catch {
        setFiles(prev => prev.map(x => x.localId === f.localId ? { ...x, parseState: 'error' } : x));
      }
    }
  }

  const allDone = files.length > 0 && files.every(f => f.parseState !== 'uploading');

  return (
    <div className="back-sheet-overlay">
      <div className="back-sheet" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[15px] font-bold text-text-dark">Add file to visit</div>
          <button onClick={onClose} className="text-text-light text-[20px] leading-none bg-transparent border-none">×</button>
        </div>
        <div className="text-[12px] text-text-light mb-4">
          {visit.station_display_name} · {fmtDate(visit.visited_at)}
        </div>

        <div
          data-dragging={dragging ? 'true' : undefined}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current.click()}
          className="drop-zone mb-4"
          style={{ padding: '24px 16px' }}
        >
          <div className="text-[28px] mb-1.5">{dragging ? '📂' : '📁'}</div>
          <div className="text-[13px] font-semibold text-text-dark mb-1">
            {dragging ? 'Drop here' : 'Tap to select a file'}
          </div>
          <input ref={inputRef} type="file" multiple onChange={e => { addFiles(e.target.files); e.target.value = ''; }} className="hidden" />
        </div>

        {files.map(f => (
          <div key={f.localId} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--color-surface-dark)' }}>
            <span className="text-[12px] font-medium text-text-dark truncate flex-1 mr-2">{f.name}</span>
            <span className={`text-[11px] font-semibold shrink-0 ${
              f.parseState === 'parsed'  ? 'text-success' :
              f.parseState === 'error'   ? 'text-error'   :
              f.parseState === 'pending' ? 'text-warning'  : 'text-blue'
            }`}>
              {f.parseState === 'uploading' ? 'Uploading…'
               : f.parseState === 'pending' ? 'Processing…'
               : f.parseState === 'parsed'  ? '✓ Done'
               : '⚠ Failed'}
            </span>
          </div>
        ))}

        <button onClick={onClose} disabled={files.length > 0 && !allDone} className="cta-btn mt-4">
          {allDone ? 'Done' : 'Close'}
        </button>
      </div>
    </div>
  );
}

// ── Visit detail sheet ────────────────────────────────────────────────────────

function VisitDetailSheet({ visitId, onClose }) {
  const [visit,   setVisit]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    getVisit(visitId)
      .then(setVisit)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visitId]);

  if (loading) {
    return (
      <div className="back-sheet-overlay">
        <div className="back-sheet">
          <div className="text-[13px] text-text-light py-6 text-center">Loading…</div>
        </div>
      </div>
    );
  }

  if (!visit) return null;

  const cfg          = FAMILY_CONFIG[visit.data_family] || FAMILY_CONFIG.groundwater;
  const canAddFile   = daysSince(visit.visited_at) <= ADD_FILE_WINDOW_DAYS;
  const siteReading  = (visit.readings || []).find(r => r.reading_type === 'overall_site_condition');
  const condStyle    = siteReading ? (CONDITION_STYLE[siteReading.value_text?.toLowerCase()] || {}) : {};
  const requiredTypes = REQUIRED_PER_FAMILY[visit.data_family] || [];
  const requiredReadings = (visit.readings || []).filter(r => requiredTypes.includes(r.reading_type));
  const optionalReadings = (visit.readings || []).filter(r =>
    r.reading_type !== 'overall_site_condition' && !requiredTypes.includes(r.reading_type)
  );

  return (
    <div className="back-sheet-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="back-sheet" style={{ maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>

        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-0 shrink-0">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-3 shrink-0">
          <div>
            <div className="text-[16px] font-bold text-text-dark">
              {cfg.icon} {visit.station_display_name}
            </div>
            <div className="text-[12px] text-text-light mt-0.5">
              {fmtDateTime(visit.visited_at)} · {visit.technician_name}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-light text-[16px] shrink-0 bg-transparent border-none"
            style={{ border: '1px solid var(--color-border)' }}
          >✕</button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">

          {/* Site condition banner */}
          {siteReading && (
            <div
              className="flex items-center justify-between rounded-xl px-3.5 py-2.5 mb-3.5"
              style={{ background: condStyle.bg || 'var(--color-surface)', border: `1px solid ${condStyle.color || 'var(--color-border)'}33` }}
            >
              <span className="text-[12px] font-semibold text-text-light">Overall site condition</span>
              <span className="text-[13px] font-bold" style={{ color: condStyle.color || 'var(--color-text-dark)' }}>
                {siteReading.value_text}
              </span>
            </div>
          )}

          {/* Visit notes */}
          {visit.notes && (
            <div className="bg-white rounded-xl px-3.5 py-3 mb-3.5" style={{ border: '1.5px solid var(--color-border)' }}>
              <div className="text-[11px] font-semibold text-text-light uppercase tracking-wide mb-1.5">Visit notes</div>
              <div className="text-[13px] text-text-med leading-relaxed">{visit.notes}</div>
            </div>
          )}

          {/* Logger files */}
          <div className="mb-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-text-light uppercase tracking-wide">
                Logger files ({(visit.files || []).length})
              </span>
              {canAddFile && (
                <button
                  onClick={() => setShowAdd(true)}
                  className="text-[11px] font-semibold text-white px-2.5 py-1 rounded-md border-none"
                  style={{ background: '#3B7DD8' }}
                >
                  + Add file
                </button>
              )}
            </div>

            {(visit.files || []).length === 0 ? (
              <div className="text-[12px] text-text-light text-center py-3">No files uploaded</div>
            ) : (
              <div className="flex flex-col gap-2">
                {visit.files.map(f => {
                  const ext       = f.original_name.split('.').pop().toUpperCase();
                  const isParsed  = f.parse_status === 'parsed';
                  const isError   = f.parse_status === 'error';
                  const borderCol = isError ? '#FECACA' : isParsed ? '#BBF7D0' : 'var(--color-border)';
                  return (
                    <div key={f.id} className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2.5"
                      style={{ border: `1.5px solid ${borderCol}` }}>
                      <div
                        className="rounded-md text-[10px] font-bold shrink-0 px-1.5 py-0.5"
                        style={{ background: cfg.bg, color: cfg.color }}
                      >.{ext}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-text-dark truncate">{f.original_name}</div>
                        {f.date_range_start && (
                          <div className="text-[10px] text-text-light mt-0.5">
                            {fmtDate(f.date_range_start)} — {fmtDate(f.date_range_end)}
                            {f.record_count != null && (
                              <span className="text-success font-semibold ml-1.5">
                                {Number(f.record_count).toLocaleString()} records
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className={`text-[11px] font-semibold shrink-0 ${isParsed ? 'text-success' : isError ? 'text-error' : 'text-warning'}`}>
                        {isParsed ? '✓ Parsed' : isError ? '⚠ Failed' : 'Processing'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {!canAddFile && (
              <div className="text-[10px] text-text-light text-center mt-2">
                Add file window closed — visits lock 7 days after submission
              </div>
            )}
          </div>

          {/* Manual readings */}
          {(requiredReadings.length > 0 || optionalReadings.length > 0) && (
            <div>
              <div className="text-[11px] font-bold text-text-light uppercase tracking-wide mb-2">
                Manual readings
              </div>
              <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1.5px solid var(--color-border)' }}>

                {requiredReadings.map((r, i) => {
                  const meta = READING_META[r.reading_type] || { label: r.reading_type.replace(/_/g, ' '), unit: '' };
                  return (
                    <div key={r.id}
                      className="flex items-center justify-between px-3.5 py-2.5"
                      style={{ borderBottom: (i < requiredReadings.length - 1 || optionalReadings.length > 0) ? '1px solid var(--color-surface-dark)' : 'none' }}
                    >
                      <span className="text-[12px] font-medium text-text-med">{meta.label}</span>
                      <span className="text-[13px] font-bold text-text-dark">{readingValue(r)}</span>
                    </div>
                  );
                })}

                {optionalReadings.length > 0 && (
                  <>
                    <div className="px-3.5 py-1.5 text-[10px] font-semibold text-text-light uppercase tracking-wide bg-surface"
                      style={{ borderTop: requiredReadings.length > 0 ? '1px solid var(--color-surface-dark)' : 'none',
                               borderBottom: '1px solid var(--color-surface-dark)' }}>
                      Optional
                    </div>
                    {optionalReadings.map((r, i) => {
                      const meta = READING_META[r.reading_type] || { label: r.reading_type.replace(/_/g, ' '), unit: '' };
                      return (
                        <div key={r.id}
                          className="flex items-center justify-between px-3.5 py-2.5 opacity-80"
                          style={{ borderBottom: i < optionalReadings.length - 1 ? '1px solid var(--color-surface-dark)' : 'none' }}
                        >
                          <span className="text-[12px] text-text-light">{meta.label}</span>
                          <span className="text-[13px] font-semibold text-text-med">{readingValue(r)}</span>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {showAdd && (
        <AddFileSheet visit={visit} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────

export default function HistoryTab() {
  const [visits,     setVisits]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [filter,     setFilter]     = useState('all');

  useEffect(() => {
    getVisits({ status: 'submitted' })
      .then(rows => setVisits(rows || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? visits : visits.filter(v => v.data_family === filter);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[13px] text-text-light">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* Filter chips */}
      <div className="flex gap-1.5 px-4 py-2.5 shrink-0 bg-white overflow-x-auto" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {['all', 'rainfall', 'groundwater', 'met'].map(f => {
          const cfg = f !== 'all' ? FAMILY_CONFIG[f] : null;
          return (
            <button
              key={f}
              data-family={f}
              data-active={filter === f ? 'true' : undefined}
              onClick={() => setFilter(f)}
              className="filter-chip"
            >
              {cfg && <span>{cfg.icon}</span>}
              {f === 'all' ? 'All' : cfg.label}
            </button>
          );
        })}
      </div>

      {/* Visit list */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 pt-16 text-center">
            <div className="text-[15px] font-semibold text-text-dark">
              {filter === 'all' ? 'No submitted visits yet' : `No ${FAMILY_CONFIG[filter]?.label} visits`}
            </div>
            <div className="text-[13px] text-text-light leading-relaxed">
              {filter === 'all'
                ? 'Completed visits will appear here once submitted.'
                : 'Try switching the filter to All.'}
            </div>
          </div>
        ) : (
          <div className="history-list flex flex-col gap-2">
            {filtered.map(v => {
              const cfg          = FAMILY_CONFIG[v.data_family] || FAMILY_CONFIG.groundwater;
              const withinWindow = daysSince(v.visited_at) <= ADD_FILE_WINDOW_DAYS;
              const hasError     = (v.file_error_count ?? 0) > 0; // populated if API returns it
              const siteCondition = v.site_condition; // summary field — not returned yet, will be null
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedId(v.id)}
                  className="bg-white rounded-2xl text-left w-full transition-colors"
                  style={{
                    border:     `1.5px solid ${hasError ? '#FECACA' : 'var(--color-border)'}`,
                    padding:    '12px 14px',
                    boxShadow:  '0 1px 3px rgba(13,27,46,0.04)',
                  }}
                >
                  {/* Top row */}
                  <div className="flex items-start gap-2.5">
                    {/* Family icon */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ background: cfg.bg, border: `1px solid ${cfg.border}22` }}
                    >{cfg.icon}</div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-semibold text-text-dark truncate">{v.station_display_name}</div>
                      <div className="text-[11px] text-text-light mt-0.5">
                        {fmtDate(v.visited_at)} · {v.technician_name?.split(' ')[0]}
                      </div>
                    </div>

                    {/* Right badges */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {siteCondition && (() => {
                        const cs = CONDITION_STYLE[siteCondition.toLowerCase()] || {};
                        return (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                            style={{ color: cs.color || '#2E7D32', background: cs.bg || '#E8F5E9' }}>
                            {siteCondition}
                          </span>
                        );
                      })()}
                      {hasError && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md text-error bg-error-light">
                          ⚠ File error
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bottom row */}
                  <div className="flex items-center justify-between mt-2.5 pt-2" style={{ borderTop: '1px solid var(--color-surface-dark)' }}>
                    <div className="flex gap-3">
                      <span className="text-[11px] text-text-light">
                        {v.file_count} {v.file_count === 1 ? 'file' : 'files'}
                      </span>
                      <span className="text-[11px] text-text-light">
                        {v.reading_count} readings
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {withinWindow && (
                        <span className="text-[10px] font-semibold text-white px-2 py-0.5 rounded-md"
                          style={{ background: '#3B7DD8' }}>
                          + Add file
                        </span>
                      )}
                      <span className="text-border text-[18px] leading-none">›</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedId && (
        <VisitDetailSheet
          visitId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
