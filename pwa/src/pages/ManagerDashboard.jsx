import { useState, useEffect, useCallback } from 'react';
import ProfileButton from '../auth/ProfileSheet.jsx';
import { getDashboardStations, getFilesWithErrors, deleteFile, getStations } from '../services/api.js';
import UserManagement    from './UserManagement.jsx';
import RainfallDataTable from '../components/RainfallDataTable.jsx';
import VisitOversight    from './VisitOversight.jsx';
import StationRegistry   from './StationRegistry.jsx';
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

// ── Network tab ──────────────────────────────────────────────────────────────

function stationHealth(daysSince, frequency) {
  if (daysSince == null) return { color: '#E53935', label: 'Never visited' };
  const ratio = daysSince / frequency;
  if (ratio >= 1)    return { color: '#E53935', label: 'Overdue' };
  if (ratio >= 0.75) return { color: '#FB8C00', label: 'Due soon' };
  return { color: '#43A047', label: 'Current' };
}

function NetworkTab() {
  const [stations, setStations] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

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
                { label: 'Overdue', count: overdue,  color: '#E53935' },
                { label: 'Due soon', count: dueSoon, color: '#FB8C00' },
                { label: 'Current', count: current,  color: '#43A047' },
              ].map(p => (
                <div key={p.label} className="flex-1 rounded-xl px-3 py-2 text-center"
                  style={{ background: p.color + '18', border: `1px solid ${p.color}33` }}>
                  <div className="text-[20px] font-black" style={{ color: p.color }}>{p.count}</div>
                  <div className="text-[10px] font-semibold" style={{ color: p.color }}>{p.label}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 px-4 pb-6">
              {stations.map(station => {
                const h = stationHealth(station.days_since_visit, station.visit_frequency_days);
                return (
                  <div key={station.id} className="bg-white rounded-2xl overflow-hidden"
                    style={{ border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ height: 3, background: h.color }} />
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <div className="text-[13px] font-bold text-text-dark truncate">{station.display_name}</div>
                          <div className="text-[11px] text-text-light">{station.region ?? 'No region'}</div>
                        </div>
                        <FamilyBadge family={station.data_family} />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <div className="text-[11px] text-text-light">
                          Last visit: {formatDate(station.last_visited_at)}
                          {station.days_since_visit != null && (
                            <> · {station.days_since_visit}d ago</>
                          )}
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: h.color + '18', color: h.color }}>
                          {h.label}
                        </span>
                      </div>
                    </div>
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
            <div className="text-4xl">✓</div>
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

// ── Rainfall tab ──────────────────────────────────────────────────────────────

function RainfallTab() {
  const [stations, setStations] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    getStations()
      .then(all => {
        const rf = (all || []).filter(s => s.data_family === 'rainfall');
        setStations(rf);
        if (rf.length) setSelected(rf[0].id);
      })
      .catch(() => {});
  }, []);

  const stationName = stations.find(s => s.id === selected)?.display_name;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <AppBar title="Rainfall" subtitle={stationName} />

      <main className="flex-1 overflow-y-auto w-full max-w-[var(--max-width)] mx-auto">

        {/* Station selector */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Station</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {stations.map(s => (
              <button key={s.id} onClick={() => setSelected(s.id)}
                style={{ fontSize: 12, fontWeight: selected === s.id ? 700 : 500, padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${selected === s.id ? '#1565C0' : 'var(--color-border)'}`, background: selected === s.id ? '#EBF2FB' : 'var(--color-surface)', color: selected === s.id ? '#1565C0' : 'var(--color-text-med)', cursor: 'pointer' }}>
                {s.display_name}
              </button>
            ))}
          </div>
        </div>

        <RainfallDataTable stationId={selected} canReprocess={true} />
      </main>
    </div>
  );
}

// ── Dashboard shell ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'network',  label: 'Network',  icon: '◉' },
  { id: 'visits',   label: 'Visits',   icon: '☑' },
  { id: 'stations', label: 'Stations', icon: '⊞' },
  { id: 'errors',   label: 'Errors',   icon: '⚠' },
  { id: 'rainfall', label: 'Rainfall', icon: '≀' },
  { id: 'users',    label: 'Users',    icon: '◎' },
  { id: 'field',    label: 'Field',    icon: '⊕' },
];

export default function ManagerDashboard() {
  const [activeTab, setActiveTab] = useState('network');

  return (
    <div className="flex flex-col min-h-dvh app-layout">
      {activeTab === 'network'  && <NetworkTab />}
      {activeTab === 'visits'   && <VisitOversight />}
      {activeTab === 'stations' && <StationRegistry />}
      {activeTab === 'errors'   && <ErrorsTab />}
      {activeTab === 'rainfall' && <RainfallTab />}
      {activeTab === 'users'    && <UserManagement />}
      {activeTab === 'field'    && <FieldApp embedded={true} />}

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
          >
            <span className="tab-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
