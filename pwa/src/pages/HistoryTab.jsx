// HistoryTab — shows submitted visits; "Add file" within 7 days of visit date.
import { useState, useEffect, useRef } from 'react';
import { getVisits, getVisit, uploadFile } from '../services/api.js';

const ADD_FILE_WINDOW_DAYS = 7;

function daysSince(isoDate) {
  const ms = Date.now() - new Date(isoDate).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function fmtVisitDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ── Add-file bottom sheet ────────────────────────────────────────────────────
function AddFileSheet({ visit, onClose }) {
  const [files,    setFiles]    = useState([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  async function addFiles(fileList) {
    const added = Array.from(fileList).map((raw, i) => ({
      localId:    `${Date.now()}-${i}`,
      name:       raw.name,
      size:       raw.size,
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
          {visit.station_display_name} · {fmtVisitDate(visit.visited_at)}
        </div>

        {/* Drop zone */}
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
          <input
            ref={inputRef}
            type="file"
            multiple
            onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
            className="hidden"
          />
        </div>

        {/* File status list */}
        {files.map(f => (
          <div key={f.localId} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--color-surface-dark)' }}>
            <span className="text-[12px] font-medium text-text-dark truncate flex-1 mr-2">{f.name}</span>
            <span className={`text-[11px] font-semibold shrink-0 ${
              f.parseState === 'parsed'    ? 'text-success' :
              f.parseState === 'error'     ? 'text-error'   :
              f.parseState === 'pending'   ? 'text-warning'  :
              'text-blue'
            }`}>
              {f.parseState === 'uploading' ? '⏳ Uploading…'
               : f.parseState === 'pending' ? '🔄 Processing…'
               : f.parseState === 'parsed'  ? '✓ Done'
               : '⚠ Failed'}
            </span>
          </div>
        ))}

        <button
          onClick={onClose}
          disabled={files.length > 0 && !allDone}
          className="cta-btn mt-4"
        >
          {allDone ? 'Done' : 'Close'}
        </button>
      </div>
    </div>
  );
}

// ── Visit detail sheet (read-only) ───────────────────────────────────────────
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

  const canAddFile = visit && daysSince(visit.visited_at) <= ADD_FILE_WINDOW_DAYS;

  return (
    <div className="back-sheet-overlay">
      <div className="back-sheet" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[15px] font-bold text-text-dark">Visit detail</div>
          <button onClick={onClose} className="text-text-light text-[20px] leading-none bg-transparent border-none">×</button>
        </div>

        {loading && <div className="text-[13px] text-text-light py-6 text-center">Loading…</div>}

        {visit && !loading && (
          <>
            <div className="mb-4">
              <div className="text-[13px] font-semibold text-text-dark">{visit.station_display_name}</div>
              <div className="text-[12px] text-text-light mt-0.5">
                {fmtVisitDate(visit.visited_at)} · {visit.technician_name}
              </div>
            </div>

            {/* Files */}
            {(visit.files || []).length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] font-semibold text-text-light uppercase tracking-wide mb-2">Files</div>
                <div className="flex flex-col gap-1.5">
                  {visit.files.map(f => (
                    <div key={f.id} className="bg-white rounded-xl px-3 py-2 flex items-center justify-between" style={{ border: '1px solid var(--color-surface-dark)' }}>
                      <span className="text-[12px] text-text-med font-medium truncate flex-1 mr-2">{f.original_name}</span>
                      <span className={`text-[11px] font-semibold shrink-0 ${f.parse_status === 'parsed' ? 'text-success' : f.parse_status === 'error' ? 'text-error' : 'text-warning'}`}>
                        {f.parse_status === 'parsed' ? `✓ ${Number(f.record_count).toLocaleString()} records` : f.parse_status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Readings */}
            {(visit.readings || []).length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] font-semibold text-text-light uppercase tracking-wide mb-2">Readings</div>
                <div className="flex flex-col gap-1.5">
                  {visit.readings.map(r => (
                    <div key={r.id} className="bg-white rounded-xl px-3 py-2 flex items-center justify-between" style={{ border: '1px solid var(--color-surface-dark)' }}>
                      <span className="text-[12px] text-text-med font-medium">{r.reading_type.replace(/_/g, ' ')}</span>
                      <span className="text-[12px] font-semibold text-text-dark">
                        {r.value_numeric != null ? `${r.value_numeric} ${r.unit || ''}` : r.value_text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {visit.notes && (
              <div className="mb-4 text-[12px] text-text-med leading-relaxed">{visit.notes}</div>
            )}

            {canAddFile && (
              <button onClick={() => setShowAdd(true)} className="cta-btn">
                Add file to this visit →
              </button>
            )}
          </>
        )}
      </div>

      {showAdd && visit && (
        <AddFileSheet visit={visit} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}

// ── History Tab ──────────────────────────────────────────────────────────────
export default function HistoryTab() {
  const [visits,       setVisits]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedId,   setSelectedId]   = useState(null);

  useEffect(() => {
    getVisits({ status: 'submitted' })
      .then(rows => setVisits(rows || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[13px] text-text-light">
        Loading…
      </div>
    );
  }

  if (visits.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-[40px]">📁</div>
        <div className="text-[15px] font-semibold text-text-dark">No submitted visits yet</div>
        <div className="text-[13px] text-text-light leading-relaxed">
          Completed visits will appear here once submitted.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-y-auto px-4 pt-4 pb-6">
      <div className="flex flex-col gap-2">
        {visits.map(v => {
          const withinWindow = daysSince(v.visited_at) <= ADD_FILE_WINDOW_DAYS;
          return (
            <button
              key={v.id}
              onClick={() => setSelectedId(v.id)}
              className="form-card text-left w-full"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-text-dark truncate">
                    {v.station_display_name}
                  </div>
                  <div className="text-[11px] text-text-light mt-0.5">
                    {fmtVisitDate(v.visited_at)} · {v.technician_name}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] font-semibold text-success bg-success-light px-2 py-0.5 rounded-full">
                    Submitted
                  </span>
                  {withinWindow && (
                    <span className="text-[10px] font-semibold text-blue">
                      + Add file
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
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
