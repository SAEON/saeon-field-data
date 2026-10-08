import React, { useState, useEffect, useCallback } from 'react';
import ProfileButton from '../auth/ProfileSheet.jsx';
import { getDashboardStations, getFilesWithErrors, deleteFile, getStationCalibrationHistory, getPendingColumnMappings, resolveColumnMapping, ignoreColumnMapping, getAllPhenomena, getActiveMappings, updateColumnMappingNodes, createPhenomenon, updatePhenomenon, reassignColumnMapping } from '../services/api.js';
import UserManagement    from './UserManagement.jsx';
import DataTab from './DataTab.jsx';
import StationRegistry   from './StationRegistry.jsx';
import HistoryTab        from './HistoryTab.jsx';
import { FieldApp }      from '../App.jsx';

// ── Shared helpers ────────────────────────────────────────────────────────────

function AppBar({ title, subtitle }) {
  return (
    <header className="bg-navy h-14 flex items-center px-4 sticky top-0 z-50 shrink-0">
      <div className="w-10" />
      <div className="flex-1 text-center px-2">
        <div className="text-white text-[17px] font-bold truncate leading-tight">{title}</div>
        {subtitle && <div className="text-white text-[11px] opacity-60 leading-tight">{subtitle}</div>}
      </div>
      <ProfileButton />
    </header>
  );
}

function FamilyBadge({ family }) {
  const MAP = {
    groundwater: { label: 'Groundwater',    bg: '#E3F2FD', color: '#1565C0' },
    rainfall:    { label: 'Rainfall',       bg: '#E8F5E9', color: '#2E7D32' },
    met:         { label: 'Meteorological', bg: '#FFF3E0', color: '#E65100' },
    other:       { label: 'Other',          bg: '#F5F5F5', color: '#616161' },
  };
  const s = MAP[family] || MAP.other;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 6px',
      borderRadius: 4, background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}


function formatDate(iso) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Calibration history panel (met stations) ──────────────────────────────────

const CAL_PARAM_UNIT = { temperature: '°C', humidity: '%', pressure: ' hPa' };

function CalibrationHistoryPanel({ stationId }) {
  const [records, setRecords] = useState(null);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    getStationCalibrationHistory(stationId)
      .then(setRecords)
      .catch(() => setError('Failed to load calibration history'));
  }, [stationId]);

  if (error)   return <div className="text-[11px] text-error px-3 py-2">{error}</div>;
  if (!records) return <div className="text-[11px] text-text-light px-3 py-2">Loading…</div>;
  if (records.length === 0) return <div className="text-[11px] text-text-light px-3 py-2">No calibration checks recorded yet.</div>;

  return (
    <div className="rounded-lg overflow-hidden mt-2" style={{ border: '1px solid var(--color-border)' }}>
      {records.map((r, i) => {
        const unit      = CAL_PARAM_UNIT[r.parameter] ?? '';
        const passed    = r.within_tolerance !== false;
        const corrected = !passed && r.post_cal_within_tolerance;
        const flagged   = !passed && !r.post_cal_within_tolerance;
        const outcomeColor  = flagged ? '#E53935' : corrected ? '#FB8C00' : '#43A047';
        const outcomeLabel  = flagged ? 'Flagged' : corrected ? 'Corrected' : 'Pass';
        const calDate = r.calibration_date
          ? new Date(r.calibration_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
          : '—';
        return (
          <div key={r.id} className="px-3 py-2 border-b border-border last:border-0"
            style={{ background: i % 2 === 0 ? 'transparent' : 'var(--color-surface)' }}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-text-dark">{r.sensor_label}</span>
                <span className="text-[10px] text-text-light ml-1.5 capitalize">{r.parameter}</span>
                {r.sensor_serial_no && <span className="text-[10px] text-text-light ml-1.5">S/N: {r.sensor_serial_no}</span>}
              </div>
              <span className="text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded-full"
                style={{ background: outcomeColor + '18', color: outcomeColor }}>
                {outcomeLabel}
              </span>
            </div>
            <div className="text-[10px] text-text-light mt-0.5 flex flex-wrap gap-x-2">
              {r.as_found_error != null && (
                <span>Error: {r.as_found_error >= 0 ? '+' : ''}{Number(r.as_found_error).toFixed(3)}{unit}</span>
              )}
              <span>{r.kit_label} {r.transfer_std_model} (S/N: {r.transfer_std_serial})</span>
            </div>
            <div className="text-[10px] text-text-light mt-0.5">
              {calDate}
              {r.technician_name && <span className="ml-1">· <span className="font-medium text-text-dark">{r.technician_name}</span></span>}
            </div>
            {r.remarks && (
              <div className="text-[10px] mt-0.5 italic" style={{ color: '#E53935' }}>Remarks: {r.remarks}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Network tab ──────────────────────────────────────────────────────────────

function stationHealth(daysSince, frequency) {
  if (daysSince == null) return { label: 'Never visited', overdue: true };
  const ratio = daysSince / frequency;
  if (ratio >= 1)    return { label: 'Overdue',   overdue: true };
  if (ratio >= 0.75) return { label: 'Due soon',  overdue: false };
  return { label: 'Current', overdue: false };
}

function NetworkTab() {
  const [stations,       setStations]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [calOpenId,      setCalOpenId]      = useState(null);

  useEffect(() => {
    getDashboardStations()
      .then(setStations)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const overdue  = stations.filter(s => { const l = stationHealth(s.days_since_visit, s.visit_frequency_days).label; return l === 'Overdue' || l === 'Never visited'; }).length;
  const dueSoon  = stations.filter(s => stationHealth(s.days_since_visit, s.visit_frequency_days).label === 'Due soon').length;
  const current  = stations.filter(s => stationHealth(s.days_since_visit, s.visit_frequency_days).label === 'Current').length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <AppBar title="Network" subtitle={`${stations.length} stations`} />

      <main className="flex-1 overflow-y-auto w-full max-w-[var(--max-width)] mx-auto">
        {loading && (
          <div className="flex items-center justify-center h-40 text-text-light text-sm">Loading…</div>
        )}
        {!loading && error && (
          <div className="mx-4 mt-4 p-4 bg-warning-light rounded-xl text-[13px] text-warning">{error}</div>
        )}
        {!loading && !error && (
          <>
            {/* Summary pills */}
            <div className="flex gap-2 px-4 pt-4 pb-2">
              {[
                { label: 'Overdue',  count: overdue,  red: true  },
                { label: 'Due soon', count: dueSoon,  red: false },
                { label: 'Current',  count: current,  red: false },
              ].map(p => (
                <div key={p.label} className="flex-1 rounded-xl px-3 py-2 text-center"
                  style={{
                    background: p.red && p.count > 0 ? '#FEF2F2' : 'var(--color-surface-dark)',
                    border: `1px solid ${p.red && p.count > 0 ? '#FECACA' : 'var(--color-border)'}`,
                  }}>
                  <div className="text-[20px] font-black" style={{ color: p.red && p.count > 0 ? '#DC2626' : 'var(--color-text-dark)' }}>{p.count}</div>
                  <div className="text-[10px] font-semibold" style={{ color: p.red && p.count > 0 ? '#DC2626' : 'var(--color-text-light)' }}>{p.label}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 px-4 pb-6">
              {stations.map(station => {
                const h = stationHealth(station.days_since_visit, station.visit_frequency_days);
                return (
                  <div key={station.id} className="bg-white rounded-2xl px-4 py-3"
                    style={{ border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <div className="text-[13px] font-bold text-text-dark truncate">{station.display_name}</div>
                          <div className="text-[11px] text-text-light">{station.region ?? 'No region'}</div>
                        </div>
                        <FamilyBadge family={station.data_family} />
                      </div>
                      <div className="text-[11px] text-text-light mt-1">
                        {station.last_visited_at == null
                          ? <span className="font-medium" style={{ color: '#DC2626' }}>{h.label}</span>
                          : <>
                              Last visit: {formatDate(station.last_visited_at)}
                              {station.days_since_visit != null && <> · {station.days_since_visit}d ago</>}
                              {' · '}<span className="font-medium" style={{ color: h.overdue ? '#DC2626' : 'var(--color-text-dark)' }}>{h.label}</span>
                            </>
                        }
                      </div>
                      {station.data_family === 'met' && (
                        <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                          <button
                            onClick={() => setCalOpenId(id => id === station.id ? null : station.id)}
                            className="text-[11px] font-semibold text-navy bg-transparent border-none p-0"
                          >
                            {calOpenId === station.id ? '▾ Hide calibration history' : '▸ Calibration history'}
                          </button>
                          {calOpenId === station.id && (
                            <CalibrationHistoryPanel stationId={station.id} />
                          )}
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ── Errors tab ────────────────────────────────────────────────────────────────

function ConfirmDeleteSheet({ file, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteFile(file.id);
      onDeleted(file.id);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="back-sheet-overlay">
      <div className="back-sheet">
        <div className="text-[15px] font-bold text-text-dark mb-1">Delete file?</div>
        <div className="text-[13px] text-text-light mb-1 leading-relaxed">
          <strong>{file.original_name}</strong>
        </div>
        <div className="text-[12px] text-text-light mb-4">
          Station: {file.station_name} · Uploaded by {file.technician_name}
        </div>
        <div className="px-3 py-2 rounded-xl mb-4"
          style={{ background: '#FFF3E0', border: '1px solid #FFE0B2' }}>
          <div className="text-[11px] font-semibold text-warning mb-0.5">Parse error</div>
          <div className="text-[11px] text-text-med font-mono leading-relaxed break-words">
            {file.parse_error ?? 'Unknown error'}
          </div>
        </div>
        {error && <div className="text-[12px] text-error mb-3">{error}</div>}
        <div className="flex gap-2.5">
          <button onClick={onClose} disabled={deleting}
            className="flex-1 h-12 border-[1.5px] border-border rounded-xl bg-white text-text-med text-sm font-semibold">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 h-12 rounded-xl text-white text-sm font-semibold border-none"
            style={{ background: 'var(--color-error)' }}>
            {deleting ? 'Deleting…' : 'Delete file'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ErrorsTab({ canDelete = true }) {
  const [files,       setFiles]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFiles(await getFilesWithErrors());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleDeleted(fileId) {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <AppBar
        title="Errors"
        subtitle={files.length ? `${files.length} file${files.length !== 1 ? 's' : ''} with errors` : undefined}
      />

      <main className="flex-1 overflow-y-auto w-full max-w-[var(--max-width)] mx-auto">
        {loading && (
          <div className="flex items-center justify-center h-40 text-text-light text-sm">Loading…</div>
        )}
        {!loading && error && (
          <div className="mx-4 mt-4 p-4 bg-warning-light rounded-xl text-[13px] text-warning">{error}</div>
        )}
        {!loading && !error && files.length === 0 && (
          <div className="flex flex-col items-center justify-center h-60 gap-3 text-center px-8">
            <div className="text-[15px] font-semibold text-text-dark">No errors</div>
            <div className="text-[13px] text-text-light">All uploaded files have been parsed and processed successfully.</div>
          </div>
        )}
        {!loading && !error && files.length > 0 && (
          <div className="flex flex-col gap-2 p-4">
            {files.map(file => {
              const isRainfall = file.error_type === 'rainfall';
              const errorMsg   = isRainfall ? (file.rainfall_error ?? 'Unknown error') : (file.parse_error ?? 'Unknown error');
              return (
              <div key={file.id} className="bg-white rounded-2xl px-4 py-3"
                style={{ border: '1px solid #FFCDD2', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="text-[13px] font-bold text-text-dark truncate">{file.original_name}</div>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: isRainfall ? '#E3F2FD' : '#FFEBEE', color: isRainfall ? '#1565C0' : '#C62828' }}>
                        {isRainfall ? 'Rainfall' : 'Parse'}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-light">
                      {file.station_name} · {file.technician_name}
                    </div>
                    <div className="text-[11px] text-text-light">{formatDateTime(file.uploaded_at)}</div>
                  </div>
                  {canDelete && (
                  <button
                    onClick={() => setDeleteTarget(file)}
                    className="h-7 px-2.5 rounded-lg text-[11px] font-semibold border-none shrink-0"
                    style={{ background: '#FFEBEE', color: '#C62828' }}
                  >
                    Delete
                  </button>
                  )}
                </div>
                <div className="text-[11px] font-mono text-warning leading-relaxed mt-1 p-2 rounded-lg"
                  style={{ background: '#FFF8E1' }}>
                  {errorMsg.slice(0, 120)}
                  {errorMsg.length > 120 && '…'}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </main>

      {deleteTarget && (
        <ConfirmDeleteSheet
          file={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}

// ── Pheno Standard panel ──────────────────────────────────────────────────────

const NODES = ['arid', 'efteon', 'fynbos', 'gfw', 'ndlovu'];
const NODE_LABELS = { arid: 'Arid', efteon: 'EFTEON', fynbos: 'Fynbos', gfw: 'GFW', ndlovu: 'Ndlovu' };
const PANEL_TABS = [
  { id: 'phenomena', label: 'Phenomena'      },
  { id: 'pending',   label: 'Pending'        },
  { id: 'active',    label: 'Active Mappings' },
];

function NodeToggle({ label, active, onChange }) {
  return (
    <button
      onClick={() => onChange(!active)}
      style={{
        fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
        border: `1.5px solid ${active ? 'var(--color-navy)' : 'var(--color-border)'}`,
        background: active ? 'var(--color-navy)' : 'transparent',
        color: active ? 'white' : 'var(--color-text-light)',
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >{label}</button>
  );
}

const AM_PAGE_SIZES = [25, 50, 100];

function NodeCheck({ active, onChange }) {
  return (
    <button
      onClick={() => onChange(!active)}
      title={active ? 'Remove node' : 'Assign node'}
      style={{
        width: 18, height: 18, borderRadius: 4, cursor: 'pointer',
        border: `1.5px solid ${active ? 'var(--color-navy)' : 'var(--color-border)'}`,
        background: active ? 'var(--color-navy)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      {active && <span style={{ color: 'white', fontSize: 10, lineHeight: 1 }}>✓</span>}
    </button>
  );
}

const FAMILY_LABELS = { met: 'Meteorological', groundwater: 'Groundwater', rainfall: 'Rainfall' };
function familyLabel(f) { return FAMILY_LABELS[f] || f || '—'; }

function downloadCSV(rows) {
  const headers = ['raw_name', 'phenomenon_name', 'data_family', 'uz_units', 'uz_measure', 'nodes', 'mapped_date'];
  const lines = [
    headers.join(','),
    ...rows.map(r => {
      const activeNodes = NODES.filter(n => r[`node_${n}`]).map(n => NODE_LABELS[n]).join(', ');
      return [
        r.raw_name, r.phenomenon_name, familyLabel(r.data_family),
        r.uz_units || '', r.uz_measure || '',
        activeNodes,
        r.resolved_at ? new Date(r.resolved_at).toLocaleDateString('en-ZA') : '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    }),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pheno_standard_synonyms_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function ActiveMappingsTable({ rows, onNodeChange, onNodeSave, getNodeState, nodeEdits, saving, phenomena, onReassign }) {
  const [search,   setSearch]   = useState('');
  const [family,   setFamily]   = useState('all');
  const [nodeFilter, setNodeFilter] = useState('all');
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [reassigningId,   setReassigningId]   = useState(null);
  const [reassignQuery,   setReassignQuery]    = useState('');
  const [reassignSelId,   setReassignSelId]    = useState(null);
  const [reassignSaving,  setReassignSaving]   = useState(false);
  const [reassignError,   setReassignError]    = useState(null);

  async function handleReassign(row) {
    if (!reassignSelId || reassignSelId === row.phenomenon_id) return;
    setReassignSaving(true);
    setReassignError(null);
    try {
      const updated = await reassignColumnMapping(row.id, reassignSelId);
      const selPhen = phenomena?.find(p => p.id === reassignSelId);
      onReassign?.({
        ...updated,
        phenomenon_id:   reassignSelId,
        phenomenon_name: selPhen?.name ?? updated.phenomenon_name,
      });
      setReassigningId(null);
      setReassignQuery('');
      setReassignSelId(null);
    } catch {
      setReassignError('Failed to reassign — please try again.');
    } finally {
      setReassignSaving(false);
    }
  }

  function openReassign(row) {
    setReassigningId(row.id);
    setReassignQuery('');
    setReassignSelId(null);
    setReassignError(null);
  }

  const families = ['all', ...Array.from(new Set(rows.map(r => r.data_family).filter(Boolean))).sort()];

  const filtered = rows.filter(r => {
    if (family !== 'all' && r.data_family !== family) return false;
    if (nodeFilter !== 'all' && !r[`node_${nodeFilter}`]) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.raw_name.toLowerCase().includes(q) || r.phenomenon_name.toLowerCase().includes(q);
    }
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows  = filtered.slice((page - 1) * pageSize, page * pageSize);

  function handleFilterChange(fn) {
    fn();
    setPage(1);
  }

  const thStyle = {
    padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700,
    color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1.5px solid var(--color-border)', whiteSpace: 'nowrap', background: 'var(--color-surface)',
  };
  const tdStyle = { padding: '6px 8px', fontSize: 12, borderBottom: '1px solid var(--color-border)', verticalAlign: 'middle' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Info banner */}
      <div style={{
        background: '#EBF2FB', border: '1px solid #C5D9F1', borderRadius: 8,
        padding: '8px 12px', fontSize: 12, color: '#1A3A5C', lineHeight: 1.5,
      }}>
        These column names are recognised automatically in all future uploads.
        {rows.length > 0 && <span style={{ marginLeft: 6, fontWeight: 600 }}>{rows.length} synonym{rows.length !== 1 ? 's' : ''} active.</span>}
        <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: '#4A7AB5' }}>
          Use the node checkboxes to mark which SAEON research nodes use each synonym.
        </span>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text" placeholder="Search synonyms…" value={search}
          onChange={e => handleFilterChange(() => setSearch(e.target.value))}
          style={{
            fontSize: 12, padding: '5px 10px', borderRadius: 8, flex: '0 1 220px',
            border: '1.5px solid var(--color-border)', background: 'var(--color-surface)',
            color: 'var(--color-text-dark)',
          }}
        />
        <select value={family} onChange={e => handleFilterChange(() => setFamily(e.target.value))}
          style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-dark)' }}>
          <option value="all">All families</option>
          {families.filter(f => f !== 'all').map(f => <option key={f} value={f}>{familyLabel(f)}</option>)}
        </select>
        <select value={nodeFilter} onChange={e => handleFilterChange(() => setNodeFilter(e.target.value))}
          style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-dark)' }}>
          <option value="all">All nodes</option>
          {NODES.map(n => <option key={n} value={n}>{NODE_LABELS[n]}</option>)}
        </select>
        <button
          onClick={() => downloadCSV(filtered)}
          style={{
            fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 8,
            border: '1.5px solid var(--color-border)', background: 'var(--color-surface)',
            color: 'var(--color-text-med)', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >↓ Export CSV</button>
      </div>

      {rows.length === 0 && (
        <div style={{ textAlign: 'center', paddingTop: 40, fontSize: 13, color: 'var(--color-text-light)' }}>
          No active mappings yet
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--color-border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Raw name (in file)</th>
                  <th style={thStyle}>Standard name</th>
                  <th style={thStyle}>Family</th>
                  <th style={thStyle}>Units</th>
                  <th style={thStyle}>Measure</th>
                  {NODES.map(n => (
                    <th key={n} style={{ ...thStyle, textAlign: 'center', minWidth: 52 }}>{NODE_LABELS[n]}</th>
                  ))}
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ ...tdStyle, textAlign: 'center', color: 'var(--color-text-light)', padding: '24px 8px' }}>
                      No results match your filters
                    </td>
                  </tr>
                )}
                {pageRows.map(row => {
                  const isDirty    = !!nodeEdits[row.id];
                  const isSaving   = saving[`node_${row.id}`];
                  const isOpen     = reassigningId === row.id;
                  const phenQuery  = reassignQuery.toLowerCase();
                  const phenMatches = isOpen && phenomena
                    ? phenomena.filter(p =>
                        p.name.toLowerCase().includes(phenQuery) ||
                        (p.display_name || '').toLowerCase().includes(phenQuery)
                      ).slice(0, 8)
                    : [];
                  return (
                    <React.Fragment key={row.id}>
                      <tr style={{ background: isOpen ? '#FFFDE7' : isDirty ? '#F0F4FF' : 'transparent' }}>
                        <td style={tdStyle}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-navy)' }}>{row.raw_name}</span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontFamily: 'monospace', color: 'var(--color-text-dark)' }}>{row.phenomenon_name}</span>
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--color-text-med)' }}>
                          {familyLabel(row.data_family)}
                        </td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--color-text-light)' }}>{row.uz_units || '—'}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--color-text-light)' }}>{row.uz_measure || '—'}</td>
                        {NODES.map(n => (
                          <td key={n} style={{ ...tdStyle, textAlign: 'center' }}>
                            <NodeCheck
                              active={getNodeState(row, n)}
                              onChange={v => onNodeChange(row, n, v)}
                            />
                          </td>
                        ))}
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {isDirty && (
                              <button
                                disabled={isSaving}
                                onClick={() => onNodeSave(row)}
                                style={{
                                  fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 6,
                                  background: 'var(--color-navy)', color: 'white',
                                  border: 'none', cursor: 'pointer', opacity: isSaving ? 0.6 : 1,
                                }}
                              >{isSaving ? '…' : 'Save'}</button>
                            )}
                            <button
                              onClick={() => openReassign(row)}
                              style={{
                                fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                                background: 'transparent', color: 'var(--color-text-med)',
                                border: '1px solid var(--color-border)',
                                cursor: 'pointer',
                              }}
                            >Reassign</button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`reassign_${row.id}`}>
                          <td colSpan={10} style={{ padding: '0 8px 10px 8px', background: '#FFFDE7' }}>
                            <div style={{
                              padding: '10px 12px', borderRadius: 8,
                              background: '#FFFFF0', border: '1px solid #F9A825',
                            }}>
                              <div style={{ fontSize: 12, marginBottom: 6, color: 'var(--color-text-dark)' }}>
                                Reassign{' '}
                                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{row.raw_name}</span>
                                {' '}from{' '}
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text-light)', textDecoration: 'line-through' }}>{row.phenomenon_name}</span>
                                {' '}to:
                              </div>
                              <div style={{ position: 'relative', marginBottom: 6 }}>
                                <input
                                  type="text"
                                  placeholder="Type to search phenomena…"
                                  value={reassignQuery}
                                  onChange={e => { setReassignQuery(e.target.value); setReassignSelId(null); }}
                                  onBlur={() => { if (!reassignSelId) setReassignQuery(''); }}
                                  style={{
                                    width: '100%', boxSizing: 'border-box',
                                    fontSize: 12, padding: '5px 10px', borderRadius: 6,
                                    border: `1.5px solid ${reassignSelId ? 'var(--color-navy)' : 'var(--color-border)'}`,
                                    background: 'white', color: 'var(--color-text-dark)',
                                  }}
                                />
                                {reassignQuery && !reassignSelId && (
                                  <div
                                    onMouseDown={e => e.preventDefault()}
                                    style={{
                                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                                      background: 'white', border: '1.5px solid var(--color-border)',
                                      borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
                                      maxHeight: 180, overflowY: 'auto',
                                    }}>
                                    {phenMatches.length === 0 && (
                                      <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--color-text-light)' }}>No match</div>
                                    )}
                                    {phenMatches.map(p => (
                                      <div
                                        key={p.id}
                                        onClick={() => { setReassignSelId(p.id); setReassignQuery(p.name); }}
                                        style={{
                                          padding: '7px 10px', cursor: 'pointer', fontSize: 12,
                                          borderBottom: '1px solid var(--color-border)',
                                          display: 'flex', alignItems: 'baseline', gap: 6,
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#F0F4FF'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'white'}
                                      >
                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-navy)' }}>{p.name}</span>
                                        <span style={{ fontSize: 10, color: 'var(--color-text-light)' }}>{p.display_name}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div style={{ fontSize: 11, color: '#856404', marginBottom: 6 }}>
                                All data files across all stations will be reparsed in the background to re-attribute measurements to the column reassignment.
                              </div>
                              {reassignError && (
                                <div style={{ fontSize: 11, color: '#C62828', marginBottom: 6 }}>{reassignError}</div>
                              )}
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <button
                                  disabled={!reassignSelId || reassignSelId === row.phenomenon_id || reassignSaving}
                                  onClick={() => handleReassign(row)}
                                  style={{
                                    fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 6,
                                    background: (!reassignSelId || reassignSelId === row.phenomenon_id || reassignSaving) ? 'var(--color-border)' : 'var(--color-navy)',
                                    color: (!reassignSelId || reassignSelId === row.phenomenon_id || reassignSaving) ? 'var(--color-text-light)' : 'white',
                                    border: 'none', cursor: (!reassignSelId || reassignSaving) ? 'not-allowed' : 'pointer',
                                  }}
                                >{reassignSaving ? 'Reassigning…' : 'Reassign'}</button>
                                <button
                                  onClick={() => setReassigningId(null)}
                                  style={{
                                    fontSize: 11, padding: '5px 12px', borderRadius: 6,
                                    background: 'transparent', color: 'var(--color-text-med)',
                                    border: '1px solid var(--color-border)', cursor: 'pointer',
                                  }}
                                >Cancel</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {page > 1 && (
                <button onClick={() => setPage(p => p - 1)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, border: '1.5px solid var(--color-border)', background: 'white', cursor: 'pointer' }}>‹ Prev</button>
              )}
              <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
                {filtered.length === 0 ? '0' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)}`} of {filtered.length}
              </span>
              {page < pageCount && (
                <button onClick={() => setPage(p => p + 1)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, border: '1.5px solid var(--color-border)', background: 'white', cursor: 'pointer' }}>Next ›</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {AM_PAGE_SIZES.map(s => (
                <button key={s} onClick={() => { setPageSize(s); setPage(1); }} style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 20,
                  border: `1.5px solid ${pageSize === s ? 'var(--color-navy)' : 'var(--color-border)'}`,
                  background: pageSize === s ? 'var(--color-navy)' : 'white',
                  color: pageSize === s ? 'white' : 'var(--color-text-med)', cursor: 'pointer',
                }}>{s}</button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const MEASURE_LABELS = { avg: 'Average', cumm: 'Cumulative', event: 'Event', logi: 'Logical', max: 'Maximum', min: 'Minimum', mode: 'Mode', sd: 'Std dev', smp: 'Sample', text: 'Text', tot: 'Total' };

const PHEN_TYPES = [
  'Albedo',
  'Battery level',
  'Bowen ratio',
  'Carbon dioxide',
  'Daytime',
  'Electroconductivity',
  'Evapotranspiration',
  'Humidity, relative',
  'Interference event',
  'Latitude',
  'Leaf wetness',
  'Logger serial number',
  'Longitude',
  'Moisture, soil',
  'Moisture, soil, pulse time',
  'Ping duration',
  'Precipitation',
  'Pressure, ambient vapour',
  'Pressure, atmosphere',
  'Pressure, saturation vapour',
  'Pressure, vapour deficit',
  'Program name',
  'Program signature',
  'Radiation, long wave incoming',
  'Radiation, long wave outgoing',
  'Radiation, net',
  'Radiation, short wave incoming',
  'Radiation, short wave outgoing',
  'Radiation, solar',
  'Radiation, ultra violet',
  'Radiation, ultra violet dose',
  'Radiation, ultra violet index',
  'Record identification',
  'Scan, count',
  'Signal strength',
  'Temperature, air',
  'Temperature, dew point',
  'Temperature, ground level',
  'Temperature, logger',
  'Temperature, soil',
  'Temperature, water',
  'Timestamp',
  'Water level',
  'Water vapour, density',
  'Water vapour, mass density',
  'Water vapour, mix ratio',
  'Water vapour, mole fraction',
  'Wind direction',
  'Wind speed',
];

const UNITS = [
  '°C', '%', 'hPa', 'W/m²', 'µW/cm²', 'm/s', '°', 'mm', 'm',
  'm³/m³', 'µS/cm', 'mV', 'V', 'mm/hr', 'kPa', '-',
];

const VAR_TYPES = [
  { code: 'chr',      label: 'Character string' },
  { code: 'difftime', label: 'Difference in time' },
  { code: 'fac',      label: 'Factor' },
  { code: 'int',      label: 'Integer' },
  { code: 'logi',     label: 'Logical' },
  { code: 'num',      label: 'Numeric' },
  { code: 'posix',    label: 'Date / time (POSIX)' },
  { code: 'text',     label: 'Text' },
];

const BLANK_ADD_FORM = { name: '', display_name: '', phen_type: '', data_family: 'met', unit: '°C', measure: 'avg', var_type: 'num' };

function PhenomenaTable({ rows, onAdd, onEdit }) {
  const [search,    setSearch]    = useState('');
  const [famFilter, setFamFilter] = useState('all');
  const [page,      setPage]      = useState(1);
  const [pageSize,  setPageSize]  = useState(25);
  const [showAdd,   setShowAdd]   = useState(false);
  const [addForm,   setAddForm]   = useState(BLANK_ADD_FORM);
  const [addErr,    setAddErr]    = useState(null);
  const [addSaving, setAddSaving] = useState(false);
  const [editOpenId, setEditOpenId] = useState(null);
  const [editForm,   setEditForm]   = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState(null);

  function openEdit(p) {
    setEditOpenId(p.id);
    setEditForm({
      display_name: p.display_name || '',
      phen_type:    p.phen_type    || '',
      data_family:  p.data_family  || 'met',
      unit:         p.unit         || '°C',
      measure:      p.measure      || 'avg',
      var_type:     p.var_type     || 'num',
    });
    setEditError(null);
  }

  async function handleEditSave(phenId) {
    if (!editForm.display_name.trim()) { setEditError('Label is required.'); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      const row = await updatePhenomenon(phenId, editForm);
      onEdit?.(row);
      setEditOpenId(null);
    } catch (err) {
      setEditError(err.message || 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  }

  const families = ['all', ...Array.from(new Set(rows.map(r => r.data_family).filter(Boolean))).sort()];

  const filtered = rows.filter(r => {
    if (famFilter !== 'all' && r.data_family !== famFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) ||
             (r.display_name || '').toLowerCase().includes(q) ||
             (r.phen_type || '').toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => (a.phen_type || '').localeCompare(b.phen_type || '') || a.name.localeCompare(b.name));

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows  = filtered.slice((page - 1) * pageSize, page * pageSize);

  const byType = pageRows.reduce((acc, p) => {
    const key = p.phen_type || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const isFiltered = !!(search || famFilter !== 'all');

  function handleFilterChange(fn) { fn(); setPage(1); }

  async function handleAddSave() {
    setAddErr(null);
    if (!addForm.name.trim()) { setAddErr('Name is required.'); return; }
    if (!/^[a-z][a-z0-9_]*_[a-z0-9]+$/.test(addForm.name)) { setAddErr('Name must be lowercase with underscores — e.g. temp_air_avg.'); return; }
    if (!addForm.display_name.trim()) { setAddErr('Label is required.'); return; }
    setAddSaving(true);
    try {
      const row = await createPhenomenon(addForm);
      onAdd(row);
      setAddForm(BLANK_ADD_FORM);
      setShowAdd(false);
    } catch (err) {
      setAddErr(err.message || 'Failed to save');
    } finally {
      setAddSaving(false);
    }
  }

  const thStyle = {
    padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
    color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1.5px solid var(--color-border)', background: 'var(--color-surface)',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text" placeholder="Search phenomena…" value={search}
          onChange={e => handleFilterChange(() => setSearch(e.target.value))}
          style={{
            fontSize: 12, padding: '5px 10px', borderRadius: 8, flex: '0 1 220px',
            border: '1.5px solid var(--color-border)', background: 'var(--color-surface)',
            color: 'var(--color-text-dark)',
          }}
        />
        <select value={famFilter} onChange={e => handleFilterChange(() => setFamFilter(e.target.value))}
          style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-dark)' }}>
          <option value="all">All families</option>
          {families.filter(f => f !== 'all').map(f => <option key={f} value={f}>{familyLabel(f)}</option>)}
        </select>
        {isFiltered && (
          <button onClick={() => { setSearch(''); setFamFilter('all'); setPage(1); }}
            style={{ fontSize: 11, color: 'var(--color-navy)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            Clear
          </button>
        )}
        <button
          onClick={() => {
            const headers = ['name', 'display_name', 'phen_type', 'data_family', 'unit', 'measure'];
            const lines = [
              headers.join(','),
              ...filtered.map(p => [
                p.name, p.display_name || '', p.phen_type || '',
                familyLabel(p.data_family), p.unit || '', MEASURE_LABELS[p.measure] || p.measure || '',
              ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
            ];
            const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `phenomena_standard_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
          style={{
            fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 8,
            border: '1.5px solid var(--color-border)', background: 'var(--color-surface)',
            color: 'var(--color-text-med)', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >↓ Export CSV</button>
        <button
          onClick={() => { setShowAdd(v => !v); setAddErr(null); setAddForm(BLANK_ADD_FORM); }}
          style={{
            fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 8,
            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 'auto',
            background: showAdd ? 'var(--color-text-med)' : 'var(--color-navy)',
            color: 'white',
          }}
        >{showAdd ? '✕ Cancel' : '+ Add Phenomenon'}</button>
      </div>

      {/* Add Phenomenon form */}
      {showAdd && (
        <div style={{
          border: '1.5px solid var(--color-navy)', borderRadius: 10,
          padding: '14px 16px', background: '#F8F9FB', display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-navy)' }}>Add Phenomenon</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ fontWeight: 600, color: 'var(--color-text-med)' }}>Label</span>
              <input type="text" value={addForm.display_name}
                onChange={e => setAddForm(f => ({ ...f, display_name: e.target.value }))}
                placeholder="e.g. Air Temperature Average"
                style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--color-border)', background: 'white' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ fontWeight: 600, color: 'var(--color-text-med)' }}>Name</span>
              <input type="text" value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. temp_air_avg"
                style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--color-border)', background: 'white', fontFamily: 'monospace' }} />
              {addForm.name && !/^[a-z][a-z0-9_]*_[a-z0-9]+$/.test(addForm.name) && (
                <span style={{ fontSize: 10, color: '#C0392B' }}>Must be lowercase with underscores — e.g. temp_air_avg</span>
              )}
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ fontWeight: 600, color: 'var(--color-text-med)' }}>Type</span>
              <select value={addForm.phen_type} onChange={e => setAddForm(f => ({ ...f, phen_type: e.target.value }))}
                style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--color-border)', background: 'white' }}>
                <option value="">— select type —</option>
                {PHEN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ fontWeight: 600, color: 'var(--color-text-med)' }}>Family</span>
              <select value={addForm.data_family} onChange={e => setAddForm(f => ({ ...f, data_family: e.target.value }))}
                style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--color-border)', background: 'white' }}>
                {['met', 'groundwater', 'rainfall', 'all'].map(fam => <option key={fam} value={fam}>{familyLabel(fam)}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ fontWeight: 600, color: 'var(--color-text-med)' }}>Unit</span>
              <select value={addForm.unit} onChange={e => setAddForm(f => ({ ...f, unit: e.target.value }))}
                style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--color-border)', background: 'white' }}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ fontWeight: 600, color: 'var(--color-text-med)' }}>Measure</span>
              <select value={addForm.measure} onChange={e => setAddForm(f => ({ ...f, measure: e.target.value }))}
                style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--color-border)', background: 'white' }}>
                {Object.entries(MEASURE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ fontWeight: 600, color: 'var(--color-text-med)' }}>Value type</span>
              <select value={addForm.var_type} onChange={e => setAddForm(f => ({ ...f, var_type: e.target.value }))}
                style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--color-border)', background: 'white' }}>
                {VAR_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </label>
          </div>
          {addErr && <div style={{ fontSize: 11, color: '#C0392B' }}>{addErr}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleAddSave} disabled={addSaving}
              style={{ fontSize: 12, fontWeight: 700, padding: '7px 18px', borderRadius: 8, background: addSaving ? 'var(--color-border)' : 'var(--color-navy)', color: 'white', border: 'none', cursor: addSaving ? 'default' : 'pointer' }}>
              {addSaving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setShowAdd(false); setAddErr(null); setAddForm(BLANK_ADD_FORM); }}
              style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'white', color: 'var(--color-text-med)', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', paddingTop: 32, fontSize: 13, color: 'var(--color-text-light)' }}>
          No phenomena match your search
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--color-border)', marginBottom: 2 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Label</th>
                <th style={thStyle}>Family</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Unit</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Measure</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byType).sort(([a], [b]) => a.localeCompare(b)).map(([type, phens]) => (
                <React.Fragment key={type}>
                  {/* Group header row */}
                  <tr>
                    <td colSpan={6} style={{
                      padding: '6px 12px', background: '#F2F4F8',
                      borderTop: '1px solid var(--color-border)',
                      borderBottom: '1px solid var(--color-border)',
                      fontSize: 10, fontWeight: 700, color: 'var(--color-text-light)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      {type}
                    </td>
                  </tr>
                  {/* Phenomenon rows */}
                  {phens.sort((a, b) => a.name.localeCompare(b.name)).map((p, i) => (
                    <React.Fragment key={p.id}>
                      <tr style={{ background: editOpenId === p.id ? '#F0F4FF' : i % 2 === 0 ? 'white' : '#FAFBFC' }}>
                        <td style={{ padding: '6px 12px', borderBottom: '1px solid var(--color-border)', fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-navy)', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-med)' }}>
                          {p.display_name || '—'}
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-light)', fontSize: 11 }}>
                          {familyLabel(p.data_family)}
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: '1px solid var(--color-border)', textAlign: 'right', color: 'var(--color-text-med)', fontFamily: 'monospace', fontSize: 11 }}>
                          {p.unit || '—'}
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: '1px solid var(--color-border)', textAlign: 'right', color: 'var(--color-text-light)', fontSize: 11, whiteSpace: 'nowrap' }}>
                          {MEASURE_LABELS[p.measure] || p.measure || '—'}
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: '1px solid var(--color-border)', textAlign: 'right' }}>
                          <button
                            onClick={() => editOpenId === p.id ? setEditOpenId(null) : openEdit(p)}
                            style={{
                              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                              background: 'transparent', color: 'var(--color-text-med)',
                              border: '1px solid var(--color-border)', cursor: 'pointer',
                            }}
                          >{editOpenId === p.id ? '✕' : 'Edit'}</button>
                        </td>
                      </tr>
                      {editOpenId === p.id && (
                        <tr>
                          <td colSpan={6} style={{ padding: '10px 14px 14px', background: '#F0F4FF', borderBottom: '1px solid var(--color-border)' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-navy)', marginBottom: 10 }}>
                              Edit <span style={{ fontFamily: 'monospace' }}>{p.name}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', marginBottom: 10 }}>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                                <span style={{ fontWeight: 600, color: 'var(--color-text-med)' }}>Label</span>
                                <input type="text" value={editForm.display_name}
                                  onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))}
                                  style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--color-border)', background: 'white' }} />
                              </label>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                                <span style={{ fontWeight: 600, color: 'var(--color-text-med)' }}>Type</span>
                                <select value={editForm.phen_type} onChange={e => setEditForm(f => ({ ...f, phen_type: e.target.value }))}
                                  style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--color-border)', background: 'white' }}>
                                  <option value="">— none —</option>
                                  {PHEN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </label>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                                <span style={{ fontWeight: 600, color: 'var(--color-text-med)' }}>Family</span>
                                <select value={editForm.data_family} onChange={e => setEditForm(f => ({ ...f, data_family: e.target.value }))}
                                  style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--color-border)', background: 'white' }}>
                                  {['met', 'groundwater', 'rainfall', 'all'].map(fam => <option key={fam} value={fam}>{familyLabel(fam)}</option>)}
                                </select>
                              </label>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                                <span style={{ fontWeight: 600, color: 'var(--color-text-med)' }}>Unit</span>
                                <select value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))}
                                  style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--color-border)', background: 'white' }}>
                                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                              </label>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                                <span style={{ fontWeight: 600, color: 'var(--color-text-med)' }}>Measure</span>
                                <select value={editForm.measure} onChange={e => setEditForm(f => ({ ...f, measure: e.target.value }))}
                                  style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--color-border)', background: 'white' }}>
                                  {Object.entries(MEASURE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                              </label>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                                <span style={{ fontWeight: 600, color: 'var(--color-text-med)' }}>Value type</span>
                                <select value={editForm.var_type} onChange={e => setEditForm(f => ({ ...f, var_type: e.target.value }))}
                                  style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--color-border)', background: 'white' }}>
                                  {VAR_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
                                </select>
                              </label>
                            </div>
                            {editError && <div style={{ fontSize: 11, color: '#C0392B', marginBottom: 8 }}>{editError}</div>}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => handleEditSave(p.id)} disabled={editSaving}
                                style={{ fontSize: 12, fontWeight: 700, padding: '6px 16px', borderRadius: 8, background: editSaving ? 'var(--color-border)' : 'var(--color-navy)', color: 'white', border: 'none', cursor: editSaving ? 'default' : 'pointer' }}>
                                {editSaving ? 'Saving…' : 'Save'}
                              </button>
                              <button onClick={() => { setEditOpenId(null); setEditError(null); }}
                                style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'white', color: 'var(--color-text-med)', cursor: 'pointer' }}>
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {page > 1 && (
              <button onClick={() => setPage(p => p - 1)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, border: '1.5px solid var(--color-border)', background: 'white', cursor: 'pointer' }}>‹ Prev</button>
            )}
            <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
            </span>
            {page < pageCount && (
              <button onClick={() => setPage(p => p + 1)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, border: '1.5px solid var(--color-border)', background: 'white', cursor: 'pointer' }}>Next ›</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {AM_PAGE_SIZES.map(s => (
              <button key={s} onClick={() => { setPageSize(s); setPage(1); }} style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 20,
                border: `1.5px solid ${pageSize === s ? 'var(--color-navy)' : 'var(--color-border)'}`,
                background: pageSize === s ? 'var(--color-navy)' : 'white',
                color: pageSize === s ? 'white' : 'var(--color-text-med)', cursor: 'pointer',
              }}>{s}</button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

function PhenoStandardPanel({ onCountChange }) {
  const [panelTab,   setPanelTab]   = useState('phenomena');
  const [pending,    setPending]    = useState([]);
  const [active,     setActive]     = useState([]);
  const [phenomena,  setPhenomena]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState({});
  const [saving,     setSaving]     = useState({});
  const [resolved,   setResolved]   = useState({});
  const [resolveErr, setResolveErr] = useState({});
  const [nodeEdits,  setNodeEdits]  = useState({});

  function reload() {
    setLoading(true);
    Promise.all([getPendingColumnMappings(), getActiveMappings(), getAllPhenomena()])
      .then(([pend, act, phens]) => {
        setPending(pend);
        setActive(act);
        setPhenomena(phens);
        onCountChange?.(pend.length);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, []);

  function removePending(id) {
    setPending(r => {
      const next = r.filter(row => row.id !== id);
      onCountChange?.(next.length);
      return next;
    });
  }

  async function handleResolve(id) {
    const phenId = selected[id];
    if (!phenId) return;
    setSaving(s => ({ ...s, [id]: true }));
    setResolveErr(e => ({ ...e, [id]: null }));
    try {
      await resolveColumnMapping(id, parseInt(phenId, 10));
      setSaving(s => ({ ...s, [id]: false }));
      setResolved(r => ({ ...r, [id]: true }));
      reload();
      setTimeout(() => removePending(id), 900);
    } catch {
      setSaving(s => ({ ...s, [id]: false }));
      setResolveErr(e => ({ ...e, [id]: 'Failed to save — please try again.' }));
    }
  }

  async function handleIgnore(id) {
    setSaving(s => ({ ...s, [id]: true }));
    setResolveErr(e => ({ ...e, [id]: null }));
    try {
      await ignoreColumnMapping(id);
      setSaving(s => ({ ...s, [id]: false }));
      setResolved(r => ({ ...r, [id]: 'ignored' }));
      setTimeout(() => removePending(id), 700);
    } catch {
      setSaving(s => ({ ...s, [id]: false }));
      setResolveErr(e => ({ ...e, [id]: 'Failed — please try again.' }));
    }
  }

  async function handleNodeSave(row) {
    const edits = nodeEdits[row.id];
    if (!edits) return;
    setSaving(s => ({ ...s, [`node_${row.id}`]: true }));
    try {
      const updated = await updateColumnMappingNodes(row.id, edits);
      setActive(a => a.map(r => r.id === row.id ? { ...r, ...updated } : r));
      setNodeEdits(e => { const n = { ...e }; delete n[row.id]; return n; });
    } finally {
      setSaving(s => ({ ...s, [`node_${row.id}`]: false }));
    }
  }

  function getNodeState(row, node) {
    return nodeEdits[row.id]
      ? (nodeEdits[row.id][node] ?? false)
      : (row[`node_${node}`] ?? false);
  }

  function setNode(row, node, val) {
    const current = NODES.reduce((acc, n) => ({
      ...acc, [n]: nodeEdits[row.id]?.[n] ?? row[`node_${n}`] ?? false,
    }), {});
    setNodeEdits(e => ({ ...e, [row.id]: { ...current, [node]: val } }));
  }

  const cardStyle = {
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 12, padding: '12px 14px', marginBottom: 10,
  };

  const subLabelStyle = { fontSize: 10, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <AppBar title="Phenomenon Standard" subtitle={pending.length > 0 ? `${pending.length} pending` : 'All mapped'} />

      {/* Panel tab strip */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)', flexShrink: 0 }}>
        {PANEL_TABS.map(t => (
          <button key={t.id} onClick={() => setPanelTab(t.id)} style={{
            flex: 1, padding: '9px 0', fontSize: 12,
            fontWeight: panelTab === t.id ? 700 : 500,
            color: panelTab === t.id ? 'var(--color-navy)' : 'var(--color-text-light)',
            background: 'transparent', border: 'none', cursor: 'pointer',
            borderBottom: panelTab === t.id ? '2px solid var(--color-navy)' : '2px solid transparent',
            position: 'relative',
          }}>
            {t.label}
            {t.id === 'pending' && pending.length > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 6,
                background: '#C62828', color: 'white',
                fontSize: 9, fontWeight: 700, lineHeight: 1,
                padding: '2px 4px', borderRadius: 8, minWidth: 14, textAlign: 'center',
              }}>{pending.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '12px 16px' }}>
        {loading && <p style={{ fontSize: 13, color: 'var(--color-text-light)' }}>Loading…</p>}

        {/* ── Pending tab ─────────────────────────────────────────────────── */}
        {!loading && panelTab === 'pending' && (
          <>
            {pending.length === 0 && (
              <div style={{ textAlign: 'center', paddingTop: 40, fontSize: 13, color: 'var(--color-text-light)' }}>
                All column names are recognised
              </div>
            )}
            {pending.map(row => {
              const isResolved = resolved[row.id] === true;
              const isIgnored  = resolved[row.id] === 'ignored';
              const isSaving   = saving[row.id];
              const err        = resolveErr[row.id];

              if (isResolved || isIgnored) {
                return (
                  <div key={row.id} style={{ ...cardStyle, background: isResolved ? '#F1F8E9' : 'var(--color-surface)', border: `1px solid ${isResolved ? '#C5E1A5' : 'var(--color-border)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: isResolved ? '#388E3C' : 'var(--color-text-light)' }}>
                        {row.raw_name}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: isResolved ? '#388E3C' : 'var(--color-text-light)' }}>
                        {isResolved ? 'Mapped' : 'Ignored'}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={row.id} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--color-navy)' }}>
                      {row.raw_name}
                    </span>
                    {row.data_family && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 8,
                        background: '#FFF3E0', color: '#E65100',
                      }}>{row.data_family}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginBottom: 6 }}>
                    {row.station_name && <span>{row.station_name}</span>}
                    {row.source_file_name && <span style={{ marginLeft: 8, opacity: 0.7 }}>· {row.source_file_name}</span>}
                  </div>
                  {(row.uz_units || row.uz_measure) && (
                    <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                      {row.uz_units && (
                        <div>
                          <div style={subLabelStyle}>Units (in file)</div>
                          <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-dark)' }}>{row.uz_units}</div>
                        </div>
                      )}
                      {row.uz_measure && (
                        <div>
                          <div style={subLabelStyle}>Measure (in file)</div>
                          <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-dark)' }}>{row.uz_measure}</div>
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                      value={selected[row.id] || ''}
                      onChange={e => setSelected(s => ({ ...s, [row.id]: e.target.value }))}
                      style={{
                        flex: 1, fontSize: 12, padding: '4px 8px', borderRadius: 8,
                        border: '1.5px solid var(--color-border)', background: 'var(--color-surface)',
                        color: 'var(--color-text-dark)',
                      }}
                    >
                      <option value="">Select phenomenon…</option>
                      {phenomena.map(p => (
                        <option key={p.id} value={p.id}>{p.name}{p.phen_type ? ` — ${p.phen_type}` : ''}</option>
                      ))}
                    </select>
                    <button
                      disabled={!selected[row.id] || isSaving}
                      onClick={() => handleResolve(row.id)}
                      style={{
                        padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: selected[row.id] && !isSaving ? 'var(--color-navy)' : 'var(--color-border)',
                        color: selected[row.id] && !isSaving ? 'white' : 'var(--color-text-light)',
                        border: 'none', cursor: selected[row.id] && !isSaving ? 'pointer' : 'default',
                        minWidth: 60,
                      }}
                    >{isSaving ? 'Saving…' : 'Map'}</button>
                    <button
                      disabled={isSaving}
                      onClick={() => handleIgnore(row.id)}
                      style={{
                        padding: '4px 10px', borderRadius: 8, fontSize: 12,
                        background: 'transparent', color: 'var(--color-text-light)',
                        border: '1px solid var(--color-border)', cursor: 'pointer',
                      }}
                    >Ignore</button>
                  </div>
                  {err && <div style={{ fontSize: 11, color: '#C0392B', marginTop: 6 }}>{err}</div>}
                </div>
              );
            })}
          </>
        )}

        {/* ── Active Mappings tab ──────────────────────────────────────────── */}
        {!loading && panelTab === 'active' && (
          <ActiveMappingsTable
            rows={active}
            onNodeChange={(row, node, val) => setNode(row, node, val)}
            onNodeSave={handleNodeSave}
            getNodeState={getNodeState}
            nodeEdits={nodeEdits}
            saving={saving}
            phenomena={phenomena}
            onReassign={updated => setActive(a => a.map(r => r.id === updated.id ? { ...r, phenomenon_name: updated.phenomenon_name, phenomenon_id: updated.phenomenon_id } : r))}
          />
        )}

        {/* ── Phenomena tab ────────────────────────────────────────────────── */}
        {!loading && panelTab === 'phenomena' && (
          <PhenomenaTable
            rows={phenomena}
            onAdd={row => setPhenomena(prev => [...prev, row])}
            onEdit={row => setPhenomena(prev => prev.map(p => p.id === row.id ? row : p))}
          />
        )}
      </div>
    </div>
  );
}

// ── Dashboard shell ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'network',  label: 'Network',  icon: '◉' },
  { id: 'history',  label: 'History',  icon: '≡' },
  { id: 'errors',   label: 'Errors',   icon: '⚠' },
  { id: 'stations', label: 'Stations', icon: '⊞' },
  { id: 'data',     label: 'Data',     icon: '≀' },
  { id: 'columns',  label: 'Pheno',    icon: '⌗' },
  { id: 'users',    label: 'Users',    icon: '◎' },
  { id: 'field',    label: 'Field',    icon: '⊕' },
];

export default function ManagerDashboard() {
  const [activeTab,        setActiveTab]        = useState('network');
  const [pendingColCount,  setPendingColCount]  = useState(null);

  useEffect(() => {
    getPendingColumnMappings()
      .then(rows => setPendingColCount(rows.length))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col min-h-dvh app-layout">
      {activeTab === 'network'  && <NetworkTab />}
      {activeTab === 'history'  && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="bg-navy h-14 flex items-center px-4 shrink-0">
            <div className="w-10" />
            <div className="flex-1 text-center">
              <div className="text-white text-[17px] font-bold">History</div>
            </div>
            <ProfileButton />
          </header>
          <div className="flex-1 flex flex-col overflow-hidden w-full max-w-[var(--max-width)] mx-auto">
            <HistoryTab defaultScope="all" onGoToColumns={() => setActiveTab('columns')} />
          </div>
        </div>
      )}
      {activeTab === 'stations' && <StationRegistry />}
      {activeTab === 'errors'   && <ErrorsTab />}
      {activeTab === 'columns'  && <PhenoStandardPanel onCountChange={setPendingColCount} />}
      {activeTab === 'data'     && <DataTab />}
      {activeTab === 'users'    && <UserManagement />}
      {activeTab === 'field'    && <FieldApp embedded={true} onGoToColumns={() => setActiveTab('columns')} onUnmappedDetected={() => getPendingColumnMappings().then(r => setPendingColCount(r.length)).catch(() => {})} />}

      <nav className="bottom-tab-bar shrink-0">
        <div className="sidebar-brand">
          <span style={{ fontSize: '22px' }}>🛰</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-navy)' }}>SAEON FDS</div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-light)' }}>Data Manager</div>
          </div>
        </div>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            data-active={activeTab === tab.id ? 'true' : undefined}
            className="tab-btn"
            style={{ position: 'relative' }}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.id === 'columns' && pendingColCount > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                background: '#C62828', color: 'white',
                fontSize: 9, fontWeight: 700, lineHeight: 1,
                padding: '2px 4px', borderRadius: 8,
                minWidth: 14, textAlign: 'center',
              }}>
                {pendingColCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
