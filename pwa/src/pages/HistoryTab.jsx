// HistoryTab — visit history with scope toggle (all/mine), status filters, overdue view,
// and oversight actions (notes edit, reparse, assign) for lead/manager roles.
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getVisits, getVisit, uploadFile, getStationRainfall,
  getUsers, getStations, getOverdueStations, assignVisit, updateVisit, reparseFile, updateStation,
} from '../services/api.js';
import { useAuth } from '../auth/AuthContext.jsx';

const ADD_FILE_WINDOW_DAYS = 7;
const OVERSIGHT_ROLES = new Set(['technician_lead', 'data_manager']);

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
  rainfall:    { label: 'Rainfall',       icon: '≀', color: '#1565C0', bg: '#EBF2FB', border: '#3B7DD8' },
  groundwater: { label: 'Groundwater',    icon: '⊥', color: '#00695C', bg: '#E0F2F1', border: '#00695C' },
  met:         { label: 'Meteorological', icon: '△', color: '#2E7D32', bg: '#E8F5E9', border: '#2E7D32' },
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
  battery_voltage:        { label: 'Logger battery',        unit: '%'  },
  overall_site_condition: { label: 'Site condition',        unit: ''   },
  gauge_condition:        { label: 'Raingauge condition',   unit: ''   },
  gauge_reading:          { label: 'Rainfall in gauge',     unit: 'mm' },
  last_emptied:           { label: 'Gauge last checked',    unit: ''   },
  pyranometer_clean:      { label: 'Pyranometer clean',     unit: ''   },
  anemometer_spinning:    { label: 'Anemometer spinning',   unit: ''   },
  rain_gauge_clear:       { label: 'Rain gauge clear',      unit: ''   },
  wind_vane:              { label: 'Wind vane readable',    unit: ''   },
  logger_screen:          { label: 'Logger screen reading', unit: ''   },
  raining:                { label: 'Was it raining',        unit: ''   },
  no_rainfall_confirmed:  { label: 'No rainfall confirmed', unit: ''   },
  event_type:             { label: 'Visit activity',        unit: ''   },
  event_problem_notes:    { label: 'Problem description',   unit: ''   },
  did_tip:                { label: 'Tipped bucket',         unit: ''   },
  memory_used_pct:        { label: 'Logger memory used',    unit: '%'  },
};

const REQUIRED_PER_FAMILY = {
  rainfall:    ['event_type', 'gauge_condition'],
  groundwater: ['dipper_depth', 'dipper_time'],
  met:         ['pyranometer_clean', 'anemometer_spinning', 'rain_gauge_clear'],
};

const EVENT_TYPE_LABELS = {
  logger_download: 'Logger download', logger_maintenance: 'Logger maintenance',
  logger_missing: 'Logger missing', logger_deploy: 'Logger deployed',
  logger_decommission: 'Logger decommissioned', logger_program: 'Logger programmed',
  logger_stopped: 'Logger stopped', raingauge_maintenance: 'Raingauge maintenance',
  raingauge_download: 'Raingauge download', raingauge_missing: 'Raingauge missing',
  raingauge_deploy: 'Raingauge deployed', raingauge_decommission: 'Raingauge decommissioned',
  raingauge_calibrate: 'Raingauge calibration', raingauge_calibration_check: 'Calibration check',
  pseudo_events: 'Non-rainfall water entry',
};

function readingValue(r) {
  if (r.value_numeric != null) {
    const meta = READING_META[r.reading_type];
    const unit = r.unit || meta?.unit || '';
    return unit ? `${r.value_numeric} ${unit}` : String(r.value_numeric);
  }
  const text = r.value_text ?? '';
  if (text.startsWith('[')) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) {
        const isActivity = r.reading_type === 'logger_activities' || r.reading_type === 'raingauge_activities';
        return arr.map(v => isActivity ? (EVENT_TYPE_LABELS[v] || v) : v).join(', ') || '—';
      }
    } catch {}
  }
  if (r.reading_type === 'raining') return text === 'true' ? 'Yes' : 'No';
  if (r.reading_type === 'no_rainfall_confirmed') return 'Confirmed';
  if (r.reading_type === 'event_type') return EVENT_TYPE_LABELS[text] || text;
  if (r.reading_type === 'did_tip') return text === 'yes' ? 'Yes' : 'No';
  return text || '—';
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  draft:     { bg: '#F5F5F5', color: '#757575', label: 'Draft'     },
  submitted: { bg: '#E8F5E9', color: '#2E7D32', label: 'Submitted' },
  approved:  { bg: '#E3F2FD', color: '#1565C0', label: 'Approved'  },
  flagged:   { bg: '#FFF3E0', color: '#E65100', label: 'Flagged'   },
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || { bg: '#F5F5F5', color: '#616161', label: status };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px',
      borderRadius: 4, background: s.bg, color: s.color,
      letterSpacing: '0.04em', textTransform: 'uppercase',
    }}>
      {s.label}
    </span>
  );
}

// ── Overdue urgency helpers ───────────────────────────────────────────────────

function daysSinceLabel(days) {
  if (days == null) return 'Never visited';
  if (days === 0)   return 'Visited today';
  if (days === 1)   return '1 day ago';
  return `${days} days ago`;
}

// ── Assign visit sheet ────────────────────────────────────────────────────────

function AssignVisitSheet({ visit, technicians, onClose, onAssigned }) {
  const [selected, setSelected] = useState(visit.assigned_technician_id ?? '');
  const [search,   setSearch]   = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);

  const filtered = search.trim()
    ? technicians.filter(t => {
        const q = search.toLowerCase();
        return (t.full_name ?? '').toLowerCase().includes(q) || (t.email ?? '').toLowerCase().includes(q);
      })
    : [];

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      await assignVisit(visit.id, selected || null);
      onAssigned(visit.id, selected || null);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="back-sheet-overlay">
      <div className="back-sheet">
        <div className="text-[15px] font-bold text-text-dark mb-1">Assign visit</div>
        <div className="text-[12px] text-text-light mb-3">
          {visit.station_display_name} · {fmtDate(visit.visited_at)}
        </div>
        <input
          type="text" placeholder="Search by name or email…" value={search}
          onChange={e => setSearch(e.target.value)} autoFocus
          className="w-full h-10 px-3 rounded-xl border border-border bg-white text-[13px] text-text-dark mb-2"
        />
        <div className="flex flex-col gap-2 mb-4 max-h-52 overflow-y-auto">
          <button onClick={() => setSelected('')} className="text-left px-3 py-2.5 rounded-xl border text-[13px]"
            style={{ borderColor: !selected ? 'var(--color-navy)' : 'var(--color-border)', background: !selected ? '#EAF0FB' : 'white', fontWeight: !selected ? 600 : 400 }}>
            Unassigned
          </button>
          {filtered.map(t => (
            <button key={t.id} onClick={() => setSelected(t.id)} className="text-left px-3 py-2.5 rounded-xl border text-[13px]"
              style={{ borderColor: selected === t.id ? 'var(--color-navy)' : 'var(--color-border)', background: selected === t.id ? '#EAF0FB' : 'white', fontWeight: selected === t.id ? 600 : 400 }}>
              <div>{t.full_name}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>{t.email}</div>
            </button>
          ))}
          {!search.trim() && (
            <div className="text-center text-[13px] text-text-light py-3">Type a name or email to search</div>
          )}
          {search.trim() && filtered.length === 0 && (
            <div className="text-center text-[13px] text-text-light py-2">No matches.</div>
          )}
        </div>
        {error && <div className="text-[12px] text-error mb-3">{error}</div>}
        <div className="flex gap-2.5">
          <button onClick={onClose} disabled={saving}
            className="flex-1 h-12 border-[1.5px] border-border rounded-xl bg-white text-text-med text-sm font-semibold">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 h-12 rounded-xl bg-navy text-white text-sm font-semibold border-none">
            {saving ? 'Saving…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign station sheet (overdue mode) ───────────────────────────────────────

function AssignStationSheet({ station, technicians, onClose, onAssigned }) {
  const [selected, setSelected] = useState(station.assigned_technician_id ?? '');
  const [search,   setSearch]   = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);

  const filtered = search.trim()
    ? technicians.filter(t => {
        const q = search.toLowerCase();
        return (t.full_name ?? '').toLowerCase().includes(q) || (t.email ?? '').toLowerCase().includes(q);
      })
    : [];

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      await updateStation(station.id, { assigned_technician_id: selected || null });
      onAssigned(station.id, selected || null);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="back-sheet-overlay">
      <div className="back-sheet">
        <div className="text-[15px] font-bold text-text-dark mb-1">Assign technician</div>
        <div className="text-[12px] text-text-light mb-3">{station.display_name}</div>
        <input
          type="text" placeholder="Search by name or email…" value={search}
          onChange={e => setSearch(e.target.value)} autoFocus
          className="w-full h-10 px-3 rounded-xl border border-border bg-white text-[13px] text-text-dark mb-2"
        />
        <div className="flex flex-col gap-2 mb-4 max-h-52 overflow-y-auto">
          <button onClick={() => setSelected('')} className="text-left px-3 py-2.5 rounded-xl border text-[13px]"
            style={{ borderColor: selected === '' ? 'var(--color-navy)' : 'var(--color-border)', background: selected === '' ? '#EAF0FB' : 'white', fontWeight: selected === '' ? 600 : 400 }}>
            Unassigned
          </button>
          {filtered.map(t => (
            <button key={t.id} onClick={() => setSelected(t.id)} className="text-left px-3 py-2.5 rounded-xl border text-[13px]"
              style={{ borderColor: selected === t.id ? 'var(--color-navy)' : 'var(--color-border)', background: selected === t.id ? '#EAF0FB' : 'white', fontWeight: selected === t.id ? 600 : 400 }}>
              <div>{t.full_name}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>{t.email}</div>
            </button>
          ))}
          {!search.trim() && (
            <div className="text-center text-[13px] text-text-light py-3">Type a name or email to search</div>
          )}
          {search.trim() && filtered.length === 0 && (
            <div className="text-center text-[13px] text-text-light py-2">No matches.</div>
          )}
        </div>
        {error && <div className="text-[12px] text-error mb-3">{error}</div>}
        <div className="flex gap-2.5">
          <button onClick={onClose} disabled={saving}
            className="flex-1 h-12 border-[1.5px] border-border rounded-xl bg-white text-text-med text-sm font-semibold">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 h-12 rounded-xl bg-navy text-white text-sm font-semibold border-none">
            {saving ? 'Saving…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add-file sheet (nested inside detail sheet) ───────────────────────────────

function AddFileSheet({ visit, onClose }) {
  const [files,    setFiles]    = useState([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  async function addFiles(fileList) {
    const added = Array.from(fileList).map((raw, i) => ({
      localId: `${Date.now()}-${i}`,
      name: raw.name, raw,
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
          <div className="text-[28px] mb-1.5">▢</div>
          <div className="text-[13px] font-semibold text-text-dark mb-1">
            {dragging ? 'Drop here' : 'Tap to select a file'}
          </div>
          <input ref={inputRef} type="file" multiple onChange={e => { addFiles(e.target.files); e.target.value = ''; }} className="hidden" />
        </div>
        {files.map(f => (
          <div key={f.localId} className="flex items-center justify-between py-2"
            style={{ borderBottom: '1px solid var(--color-surface-dark)' }}>
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

function VisitDetailSheet({ visitId, onClose, technicians = [], onGoToColumns, onVisitAssigned }) {
  const [visit,           setVisit]           = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [showAdd,         setShowAdd]         = useState(false);
  const [rainfallSummary, setRainfallSummary] = useState(null);
  const [reparsing,       setReparsing]       = useState(new Set());
  const [notesValue,      setNotesValue]      = useState('');
  const [notesSaving,     setNotesSaving]     = useState(false);
  const [assignOpen,      setAssignOpen]      = useState(false);
  const noteTimer = useRef(null);

  const isOversight = technicians.length > 0;

  useEffect(() => {
    getVisit(visitId)
      .then(v => { setVisit(v); setNotesValue(v.notes || ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visitId]);

  useEffect(() => {
    if (!visit || visit.data_family !== 'rainfall') return;
    const parsedFile = (visit.files || []).find(f => f.parse_status === 'parsed' && f.date_range_start);
    if (!parsedFile) return;
    getStationRainfall(visit.station_id, {
      resolution: 'daily',
      from: parsedFile.date_range_start,
      to:   parsedFile.date_range_end,
    }).then(data => {
      const totalMm = (data.data || []).reduce((sum, r) => sum + parseFloat(r.rain_mm || 0), 0);
      const days    = (data.data || []).length;
      setRainfallSummary({ totalMm, days });
    }).catch(() => {});
  }, [visit]);

  function handleNotesChange(value) {
    setNotesValue(value);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(async () => {
      setNotesSaving(true);
      try { await updateVisit(visitId, { notes: value }); }
      finally { setNotesSaving(false); }
    }, 800);
  }

  async function handleReparse(fileId) {
    setReparsing(prev => new Set([...prev, fileId]));
    try {
      await reparseFile(fileId);
      setTimeout(() => {
        getVisit(visitId)
          .then(v => { setVisit(v); setReparsing(prev => { const s = new Set(prev); s.delete(fileId); return s; }); })
          .catch(() => { setReparsing(prev => { const s = new Set(prev); s.delete(fileId); return s; }); });
      }, 2000);
    } catch {
      setReparsing(prev => { const s = new Set(prev); s.delete(fileId); return s; });
    }
  }

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

  const cfg            = FAMILY_CONFIG[visit.data_family] || FAMILY_CONFIG.groundwater;
  const canAddFile     = daysSince(visit.visited_at) <= ADD_FILE_WINDOW_DAYS;
  const siteReading    = (visit.readings || []).find(r => r.reading_type === 'overall_site_condition');
  const condStyle      = siteReading ? (CONDITION_STYLE[siteReading.value_text?.toLowerCase()] || {}) : {};
  const requiredTypes  = REQUIRED_PER_FAMILY[visit.data_family] || [];
  const requiredReadings = (visit.readings || []).filter(r => requiredTypes.includes(r.reading_type));
  const optionalReadings = (visit.readings || []).filter(r =>
    r.reading_type !== 'overall_site_condition' && !requiredTypes.includes(r.reading_type)
  );
  const hasUnmapped    = (visit.files || []).some(f => f.has_unmapped_columns);
  const canAssign      = isOversight && (visit.status === 'draft' || visit.status === 'submitted');

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
            <div className="flex items-center gap-2">
              <div className="text-[16px] font-bold text-text-dark">
                {cfg.icon} {visit.station_display_name}
              </div>
              <StatusBadge status={visit.status} />
            </div>
            <div className="text-[12px] text-text-light mt-0.5">
              {fmtDateTime(visit.visited_at)} · {visit.technician_name}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canAssign && (
              <button
                onClick={() => setAssignOpen(true)}
                className="h-7 px-2.5 rounded-lg text-[11px] font-semibold border-none"
                style={{ background: '#EAF0FB', color: 'var(--color-navy)' }}
              >
                {visit.assigned_technician_id ? 'Reassign' : 'Assign'}
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-text-light text-[16px] bg-transparent border-none"
              style={{ border: '1px solid var(--color-border)' }}
            >✕</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">

          {/* Unmapped column warning */}
          {hasUnmapped && onGoToColumns && (
            <button
              onClick={() => { onGoToColumns(); onClose(); }}
              className="w-full text-left rounded-xl px-3.5 py-2.5 mb-3.5 bg-transparent border-none cursor-pointer"
              style={{ background: '#FFF8E1', border: '1px solid #F9A825' }}
            >
              <span className="text-[12px] font-semibold" style={{ color: '#F57F17' }}>
                ⚠ Unknown column names detected — Tap here to map them
              </span>
            </button>
          )}

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
          {isOversight ? (
            <div className="bg-white rounded-xl px-3.5 py-3 mb-3.5" style={{ border: '1.5px solid var(--color-border)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-text-light uppercase tracking-wide">Visit notes</span>
                {notesSaving && <span className="text-[10px] text-text-light">Saving…</span>}
              </div>
              <textarea
                value={notesValue}
                onChange={e => handleNotesChange(e.target.value)}
                placeholder="Add or edit visit notes…"
                rows={3}
                className="notes-textarea w-full"
                style={{ fontSize: 12 }}
              />
            </div>
          ) : (
            visit.notes && (
              <div className="bg-white rounded-xl px-3.5 py-3 mb-3.5" style={{ border: '1.5px solid var(--color-border)' }}>
                <div className="text-[11px] font-semibold text-text-light uppercase tracking-wide mb-1.5">Visit notes</div>
                <div className="text-[13px] text-text-med leading-relaxed">{visit.notes}</div>
              </div>
            )
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
                  const ext        = f.original_name.split('.').pop().toUpperCase();
                  const isParsed   = f.parse_status === 'parsed';
                  const isError    = f.parse_status === 'error';
                  const isRep      = reparsing.has(f.id);
                  const borderCol  = isError ? '#FECACA' : isParsed ? '#BBF7D0' : 'var(--color-border)';
                  return (
                    <div key={f.id} className="bg-white rounded-xl px-3 py-2.5"
                      style={{ border: `1.5px solid ${borderCol}` }}>
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-md text-[10px] font-bold shrink-0 px-1.5 py-0.5"
                          style={{ background: cfg.bg, color: cfg.color }}>
                          .{ext}
                        </div>
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
                          {f.parse_error && (
                            <div className="text-[10px] text-error mt-0.5">{f.parse_error}</div>
                          )}
                          {f.has_unmapped_columns && onGoToColumns && (
                            <button
                              onClick={() => { onGoToColumns(); onClose(); }}
                              className="text-[10px] font-semibold mt-0.5 text-left bg-transparent border-none p-0 cursor-pointer"
                              style={{ color: '#F57F17', textDecoration: 'underline dotted' }}
                            >
                              Unknown column names — tap to map
                            </button>
                          )}
                          {f.rainfall_status && (
                            <div className="text-[10px] mt-0.5" style={{
                              color: f.rainfall_status === 'done' ? '#2E7D32' : f.rainfall_status === 'error' ? '#C62828' : '#757575'
                            }}>
                              rainfall: {f.rainfall_status}
                              {f.rainfall_error && ` — ${f.rainfall_error}`}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className={`text-[11px] font-semibold ${isParsed ? 'text-success' : isError ? 'text-error' : 'text-warning'}`}>
                            {isParsed ? '✓ Parsed' : isError ? '⚠ Failed' : 'Processing'}
                          </span>
                          {isOversight && (
                            <button
                              disabled={isRep}
                              onClick={() => handleReparse(f.id)}
                              style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                                border: '1.5px solid var(--color-border)', background: 'white',
                                color: 'var(--color-text-dark)', opacity: isRep ? 0.5 : 1,
                                cursor: isRep ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
                            >
                              {isRep ? '…' : '↺ Reparse'}
                            </button>
                          )}
                        </div>
                      </div>
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

          {/* Processed rainfall summary — rainfall stations only */}
          {visit.data_family === 'rainfall' && (
            <div className="mb-3.5">
              <div className="text-[11px] font-bold text-text-light uppercase tracking-wide mb-2">
                Processed rainfall
              </div>
              <div className="bg-white rounded-xl px-3.5 py-3" style={{ border: '1.5px solid var(--color-border)' }}>
                {rainfallSummary ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-text-med">Total recorded</span>
                    <span className="text-[13px] font-bold text-text-dark">
                      {rainfallSummary.totalMm.toFixed(1)} mm over {rainfallSummary.days} day{rainfallSummary.days !== 1 ? 's' : ''}
                    </span>
                  </div>
                ) : (
                  <div className="text-[12px] text-text-light">
                    {(visit.files || []).some(f => f.parse_status === 'parsed') ? 'Loading…' : 'Processing…'}
                  </div>
                )}
              </div>
            </div>
          )}

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
                    <div key={r.id} className="flex items-center justify-between px-3.5 py-2.5"
                      style={{ borderBottom: (i < requiredReadings.length - 1 || optionalReadings.length > 0) ? '1px solid var(--color-surface-dark)' : 'none' }}>
                      <span className="text-[12px] font-medium text-text-med">{meta.label}</span>
                      <span className="text-[13px] font-bold text-text-dark">{readingValue(r)}</span>
                    </div>
                  );
                })}
                {optionalReadings.length > 0 && (
                  <>
                    <div className="px-3.5 py-1.5 text-[10px] font-semibold text-text-light uppercase tracking-wide bg-surface"
                      style={{ borderTop: requiredReadings.length > 0 ? '1px solid var(--color-surface-dark)' : 'none', borderBottom: '1px solid var(--color-surface-dark)' }}>
                      Optional
                    </div>
                    {optionalReadings.map((r, i) => {
                      const meta = READING_META[r.reading_type] || { label: r.reading_type.replace(/_/g, ' '), unit: '' };
                      return (
                        <div key={r.id} className="flex items-center justify-between px-3.5 py-2.5 opacity-80"
                          style={{ borderBottom: i < optionalReadings.length - 1 ? '1px solid var(--color-surface-dark)' : 'none' }}>
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

      {assignOpen && (
        <AssignVisitSheet
          visit={visit}
          technicians={technicians}
          onClose={() => setAssignOpen(false)}
          onAssigned={(visitId, techId) => {
            setVisit(prev => ({ ...prev, assigned_technician_id: techId }));
            onVisitAssigned?.(visitId, techId);
          }}
        />
      )}
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────

export default function HistoryTab({ defaultScope = 'mine', onGoToColumns }) {
  const user  = useAuth();
  const isOversight = OVERSIGHT_ROLES.has(user?.role);

  const [scope,         setScope]         = useState(defaultScope);
  const [statusFilter,  setStatusFilter]  = useState('all');
  const [familyFilter,  setFamilyFilter]  = useState('all');
  const [techFilter,    setTechFilter]    = useState('');
  const [stationFilter, setStationFilter] = useState('');

  const [visits,          setVisits]          = useState([]);
  const [overdueStations, setOverdueStations] = useState([]);
  const [technicians,     setTechnicians]     = useState([]);
  const [stations,        setStations]        = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [selectedId,      setSelectedId]      = useState(null);
  const [assignTarget,    setAssignTarget]    = useState(null);

  const isOverdueMode = scope === 'all' && statusFilter === 'overdue';

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      if (isOverdueMode) {
        const [s, u] = await Promise.all([getOverdueStations(), getUsers()]);
        setOverdueStations(s || []);
        setTechnicians((u || []).filter(u => (u.role === 'technician' || u.role === 'technician_lead') && u.active));
      } else if (scope === 'all') {
        const params = {};
        if (statusFilter !== 'all') params.status = statusFilter;
        if (techFilter)    params.technician_id = techFilter;
        if (stationFilter) params.station_id = stationFilter;
        const [v, u, s] = await Promise.all([getVisits(params), getUsers(), getStations()]);
        setVisits(v || []);
        setTechnicians((u || []).filter(u => (u.role === 'technician' || u.role === 'technician_lead') && u.active));
        setStations(s || []);
      } else {
        const v = await getVisits({ status: 'submitted', technician_id: user.id });
        setVisits(v || []);
      }
    } catch {}
    finally { setLoading(false); }
  }, [user?.id, scope, statusFilter, techFilter, stationFilter, isOverdueMode]);

  useEffect(() => { load(); }, [load]);

  // Client-side family filter (mine scope only)
  const displayedVisits = (scope === 'mine' && familyFilter !== 'all')
    ? visits.filter(v => v.data_family === familyFilter)
    : visits;

  // Overdue station filtering
  const filteredOverdue = overdueStations.filter(s => {
    if (techFilter    && String(s.assigned_technician_id) !== String(techFilter))    return false;
    if (stationFilter && String(s.id)                     !== String(stationFilter)) return false;
    return true;
  });

  function handleStationAssigned(stationId, techId) {
    const tech = technicians.find(t => t.id === techId);
    setOverdueStations(prev => prev.map(s =>
      s.id === stationId
        ? { ...s, assigned_technician_id: techId, assigned_technician_name: tech?.full_name ?? null }
        : s
    ));
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[13px] text-text-light">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* Scope toggle — leads/managers only */}
      {isOversight && (
        <div className="flex shrink-0 bg-white" style={{ borderBottom: '1px solid var(--color-border)' }}>
          {['all', 'mine'].map(s => (
            <button
              key={s}
              onClick={() => { setScope(s); setStatusFilter('all'); setFamilyFilter('all'); setTechFilter(''); setStationFilter(''); }}
              className="flex-1 py-2.5 text-[13px] font-semibold border-none bg-transparent"
              style={{
                color: scope === s ? 'var(--color-navy)' : 'var(--color-text-light)',
                borderBottom: scope === s ? '2px solid var(--color-navy)' : '2px solid transparent',
              }}
            >
              {s === 'all' ? 'All visits' : 'My visits'}
            </button>
          ))}
        </div>
      )}

      {/* Filter bar */}
      {scope === 'all' ? (
        <div className="shrink-0 bg-white" style={{ borderBottom: '1px solid var(--color-border)' }}>
          {/* Status chips */}
          <div className="flex gap-1.5 px-4 pt-2.5 pb-1.5 overflow-x-auto">
            {['all', 'draft', 'submitted', 'approved', 'flagged', 'overdue'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="filter-chip shrink-0"
                data-active={statusFilter === s ? 'true' : undefined}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          {/* Tech + station dropdowns */}
          {!isOverdueMode && (
            <div className="flex gap-2 px-4 pb-2.5 overflow-x-auto">
              <select
                value={techFilter}
                onChange={e => setTechFilter(e.target.value)}
                className="text-[12px] h-8 px-2 rounded-lg border border-border bg-white text-text-med shrink-0"
              >
                <option value="">All technicians</option>
                {technicians.map(t => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>
              <select
                value={stationFilter}
                onChange={e => setStationFilter(e.target.value)}
                className="text-[12px] h-8 px-2 rounded-lg border border-border bg-white text-text-med shrink-0"
              >
                <option value="">All stations</option>
                {stations.map(s => (
                  <option key={s.id} value={s.id}>{s.display_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      ) : (
        /* Family filter chips — mine scope */
        <div className="flex gap-1.5 px-4 py-2.5 shrink-0 bg-white overflow-x-auto" style={{ borderBottom: '1px solid var(--color-border)' }}>
          {['all', 'rainfall', 'groundwater', 'met'].map(f => {
            const cfg = f !== 'all' ? FAMILY_CONFIG[f] : null;
            return (
              <button
                key={f}
                data-family={f}
                data-active={familyFilter === f ? 'true' : undefined}
                onClick={() => setFamilyFilter(f)}
                className="filter-chip"
              >
                {cfg && <span>{cfg.icon}</span>}
                {f === 'all' ? 'All' : cfg.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">

        {/* ── Overdue stations view ── */}
        {isOverdueMode && (
          filteredOverdue.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 pt-16 text-center">
              <div className="text-[15px] font-semibold text-text-dark">All stations are current</div>
              <div className="text-[13px] text-text-light leading-relaxed">
                No stations are overdue based on their configured visit frequency.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredOverdue.map(station => {
                return (
                  <div
                    key={station.id}
                    className="bg-white rounded-2xl"
                    style={{ border: '1px solid var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                  >
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="text-[14px] font-bold text-text-dark truncate">{station.display_name}</div>
                          <div className="text-[11px] text-text-light mt-0.5">{station.region ?? 'No region'}</div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{
                          background: FAMILY_CONFIG[station.data_family]?.bg || '#F5F5F5',
                          color: FAMILY_CONFIG[station.data_family]?.color || '#616161',
                        }}>
                          {FAMILY_CONFIG[station.data_family]?.label || station.data_family}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[22px] font-black leading-none text-text-dark">
                            {station.days_since_visit ?? '∞'}
                          </div>
                          <div className="text-[11px] text-text-light mt-0.5">
                            {daysSinceLabel(station.days_since_visit)}{' · '}threshold {station.visit_frequency_days}d
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-text-light mb-1">
                            {station.assigned_technician_name ?? 'Unassigned'}
                          </div>
                          <button
                            onClick={() => setAssignTarget(station)}
                            className="h-8 px-3 rounded-lg text-[12px] font-semibold border-none"
                            style={{ background: 'var(--color-navy)', color: 'white' }}
                          >
                            {station.assigned_technician_id ? 'Reassign' : 'Assign'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── Visit list ── */}
        {!isOverdueMode && (
          displayedVisits.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 pt-16 text-center">
              <div className="text-[15px] font-semibold text-text-dark">
                {scope === 'mine' && familyFilter === 'all' ? 'No submitted visits yet'
                  : scope === 'mine' ? `No ${FAMILY_CONFIG[familyFilter]?.label} visits`
                  : 'No visits found'}
              </div>
              <div className="text-[13px] text-text-light leading-relaxed">
                {scope === 'mine' && familyFilter === 'all'
                  ? 'Completed visits will appear here once submitted.'
                  : scope === 'mine' ? 'Try switching the filter to All.'
                  : 'Try adjusting the filters above.'}
              </div>
            </div>
          ) : (
            <div className="history-list flex flex-col gap-2">
              {displayedVisits.map(v => {
                const cfg          = FAMILY_CONFIG[v.data_family] || FAMILY_CONFIG.groundwater;
                const withinWindow = daysSince(v.visited_at) <= ADD_FILE_WINDOW_DAYS;
                const hasError     = (v.file_error_count ?? 0) > 0;
                const siteCondition = v.site_condition;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedId(v.id)}
                    className="bg-white rounded-2xl text-left w-full transition-colors"
                    style={{
                      border:    `1.5px solid ${hasError ? '#FECACA' : 'var(--color-border)'}`,
                      padding:   '12px 14px',
                      boxShadow: '0 1px 3px rgba(13,27,46,0.04)',
                    }}
                  >
                    {/* Top row */}
                    <div className="flex items-start gap-2.5">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{ background: cfg.bg, border: `1px solid ${cfg.border}22` }}
                      >{cfg.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold text-text-dark truncate">{v.station_display_name}</div>
                        <div className="text-[11px] text-text-light mt-0.5">
                          {fmtDate(v.visited_at)}
                          {scope === 'all'
                            ? ` · ${v.technician_name || 'Unknown'}`
                            : ` · ${v.technician_name?.split(' ')[0]}`}
                        </div>
                      </div>
                      {/* Right badges */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <StatusBadge status={v.status} />
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
                        {(v.file_error_count > 0 || v.file_gap_count > 0) && (
                          <span className="text-[11px]" style={{ color: '#E65100', fontWeight: 700 }}>
                            {v.file_error_count > 0 && `${v.file_error_count} error${v.file_error_count !== 1 ? 's' : ''}`}
                            {v.file_error_count > 0 && v.file_gap_count > 0 && ' · '}
                            {v.file_gap_count > 0 && `${v.file_gap_count} gap${v.file_gap_count !== 1 ? 's' : ''}`}
                          </span>
                        )}
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
          )
        )}
      </div>

      {selectedId && (
        <VisitDetailSheet
          visitId={selectedId}
          onClose={() => setSelectedId(null)}
          technicians={isOversight && scope === 'all' ? technicians : []}
          onGoToColumns={onGoToColumns}
          onVisitAssigned={(visitId, techId) => {
            setVisits(prev => prev.map(v => v.id === visitId ? { ...v, assigned_technician_id: techId } : v));
          }}
        />
      )}

      {assignTarget && (
        <AssignStationSheet
          station={assignTarget}
          technicians={technicians}
          onClose={() => setAssignTarget(null)}
          onAssigned={handleStationAssigned}
        />
      )}
    </div>
  );
}
