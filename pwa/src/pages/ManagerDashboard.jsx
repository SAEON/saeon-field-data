import { useState, useEffect, useCallback, useRef } from 'react';
import ProfileButton from '../auth/ProfileSheet.jsx';
import { getDashboardStations, getRecentVisits, getFilesWithErrors, deleteFile, getStations, getStationRainfall, processStationRainfall } from '../services/api.js';
import UserManagement from './UserManagement.jsx';

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

function StatusBadge({ status }) {
  const MAP = {
    draft:     { label: 'Draft',     bg: '#F5F5F5', color: '#757575' },
    submitted: { label: 'Submitted', bg: '#E8F5E9', color: '#2E7D32' },
    approved:  { label: 'Approved',  bg: '#E3F2FD', color: '#1565C0' },
    flagged:   { label: 'Flagged',   bg: '#FFF3E0', color: '#E65100' },
  };
  const s = MAP[status] || { label: status, bg: '#F5F5F5', color: '#757575' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px',
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

// ── Feed tab ──────────────────────────────────────────────────────────────────

function FeedTab() {
  const [visits,  setVisits]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    getRecentVisits(50)
      .then(setVisits)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <AppBar title="Visit Feed" subtitle={visits.length ? `Last ${visits.length} visits` : undefined} />

      <main className="flex-1 overflow-y-auto w-full max-w-[var(--max-width)] mx-auto">
        {loading && (
          <div className="flex items-center justify-center h-40 text-text-light text-sm">Loading…</div>
        )}
        {!loading && error && (
          <div className="mx-4 mt-4 p-4 bg-warning-light rounded-xl text-[13px] text-warning">{error}</div>
        )}
        {!loading && !error && visits.length === 0 && (
          <div className="text-center text-text-light text-[13px] mt-16">No visits recorded yet.</div>
        )}
        {!loading && !error && visits.length > 0 && (
          <div className="flex flex-col gap-2 p-4">
            {visits.map(visit => (
              <div key={visit.id} className="bg-white rounded-2xl px-4 py-3"
                style={{ border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="text-[13px] font-bold text-text-dark truncate">{visit.station_name}</div>
                  <StatusBadge status={visit.status} />
                </div>
                <div className="text-[11px] text-text-light">
                  {visit.technician_name} · {formatDateTime(visit.visited_at)}
                </div>
              </div>
            ))}
          </div>
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

function ErrorsTab() {
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
        title="Parse Errors"
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
            <div className="text-[15px] font-semibold text-text-dark">No parse errors</div>
            <div className="text-[13px] text-text-light">All uploaded files have been parsed successfully.</div>
          </div>
        )}
        {!loading && !error && files.length > 0 && (
          <div className="flex flex-col gap-2 p-4">
            {files.map(file => (
              <div key={file.id} className="bg-white rounded-2xl px-4 py-3"
                style={{ border: '1px solid #FFCDD2', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-text-dark truncate">{file.original_name}</div>
                    <div className="text-[11px] text-text-light">
                      {file.station_name} · {file.technician_name}
                    </div>
                    <div className="text-[11px] text-text-light">{formatDateTime(file.uploaded_at)}</div>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(file)}
                    className="h-7 px-2.5 rounded-lg text-[11px] font-semibold border-none shrink-0"
                    style={{ background: '#FFEBEE', color: '#C62828' }}
                  >
                    Delete
                  </button>
                </div>
                <div className="text-[11px] font-mono text-warning leading-relaxed mt-1 p-2 rounded-lg"
                  style={{ background: '#FFF8E1' }}>
                  {(file.parse_error ?? 'Unknown error').slice(0, 120)}
                  {(file.parse_error ?? '').length > 120 && '…'}
                </div>
              </div>
            ))}
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

function isoDate(d) { return d.toISOString().slice(0, 10); }


const RESOLUTIONS = [
  { value: '5min',       label: '5 min'     },
  { value: 'hourly',     label: 'Hourly'    },
  { value: 'daily',      label: 'Daily'     },
  { value: 'saws_daily', label: 'SAWS daily'},
  { value: 'monthly',    label: 'Monthly'   },
  { value: 'yearly',     label: 'Yearly'    },
];

const FLAG_FILTERS = [
  { value: '',              label: 'All'          },
  { value: 'double_tip',    label: 'Double tip'   },
  { value: 'interfere',     label: 'Interfere'    },
  { value: 'manual_tip',    label: 'Manual tip'   },
  { value: 'non_rainfall',  label: 'Non-rainfall' },
  { value: 'anomaly',       label: 'Anomaly'      },
];

function fmtPeriod(iso, resolution) {
  const d = new Date(iso);
  if (resolution === '5min' || resolution === 'hourly') {
    return d.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (resolution === 'monthly') return d.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
  if (resolution === 'yearly')  return d.toLocaleDateString('en-ZA', { year: 'numeric' });
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function FlagCell({ value }) {
  if (!value) return <span style={{ color: 'var(--color-text-light)' }}>—</span>;
  return <span style={{ color: '#E65100', fontWeight: 700 }}>{value}</span>;
}

function RainfallTab() {
  const [stations,     setStations]     = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [from,         setFrom]         = useState(isoDate(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)));
  const [to,           setTo]           = useState(isoDate(new Date()));
  const [resolution,   setResolution]   = useState('daily');
  const [flagFilter,   setFlagFilter]   = useState('');
  const [data,         setData]         = useState([]);
  const [fetching,     setFetching]     = useState(false);
  const [fetchErr,     setFetchErr]     = useState(null);
  const [reprocessing, setReprocessing] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    getStations()
      .then(all => {
        const rf = (all || []).filter(s => s.data_family === 'rainfall');
        setStations(rf);
        if (rf.length) setSelected(rf[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFetching(true);
      setFetchErr(null);
      getStationRainfall(selected, {
        resolution,
        from: new Date(from).toISOString(),
        to:   new Date(to + 'T23:59:59').toISOString(),
      })
        .then(res => setData(res.data || []))
        .catch(e => setFetchErr(e.message))
        .finally(() => setFetching(false));
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [selected, from, to, resolution]);

  function handleReprocess() {
    if (!selected) return;
    setReprocessing(true);
    processStationRainfall(selected).finally(() => {
      setReprocessing(false);
      setTo(isoDate(new Date()));
    });
  }

  // Client-side filter
  const filtered = data.filter(row => {
    if (!flagFilter)                 return true;
    if (flagFilter === 'double_tip') return row.double_tip_count > 0;
    if (flagFilter === 'interfere')  return row.interfere_count > 0;
    if (flagFilter === 'manual_tip') return row.manual_tip_count > 0;
    if (flagFilter === 'non_rainfall') return row.non_rainfall_count > 0;
    if (flagFilter === 'anomaly')    return row.has_anomaly;
    return true;
  });

  // Summary derived from full data (not filtered)
  const totalMm    = data.reduce((s, r) => s + parseFloat(r.rain_mm || 0), 0);
  const totalFlagged = data.reduce((s, r) => s + (r.double_tip_count || 0) + (r.interfere_count || 0) + (r.pseudo_event_count || 0), 0);

  const stationName = stations.find(s => s.id === selected)?.display_name;
  const pillBtn = (active, onClick, label) => (
    <button onClick={onClick} style={{
      fontSize: 11, fontWeight: active ? 700 : 500,
      padding: '3px 10px', borderRadius: 20,
      border: `1.5px solid ${active ? 'var(--color-navy)' : 'var(--color-border)'}`,
      background: active ? 'var(--color-navy)' : 'white',
      color: active ? 'white' : 'var(--color-text-med)',
      cursor: 'pointer', whiteSpace: 'nowrap',
    }}>{label}</button>
  );

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

        {/* Date range */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ flex: 1, fontSize: 12, padding: '6px 8px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'white' }} />
          <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ flex: 1, fontSize: 12, padding: '6px 8px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'white' }} />
        </div>

        {/* Resolution pills */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 6, overflowX: 'auto' }}>
          {RESOLUTIONS.map(r => pillBtn(resolution === r.value, () => setResolution(r.value), r.label))}
        </div>

        {/* Flag filter pills */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 6, overflowX: 'auto' }}>
          {FLAG_FILTERS.map(f => pillBtn(flagFilter === f.value, () => setFlagFilter(f.value), f.label))}
        </div>

        {/* Summary strip + reprocess */}
        {data.length > 0 && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface)' }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-med)' }}>
              <span style={{ fontWeight: 700, color: '#1565C0' }}>{totalMm.toFixed(1)} mm</span>
              {' · '}{data.length} periods
              {totalFlagged > 0 && <span style={{ color: '#E65100', fontWeight: 600 }}> · {totalFlagged} flagged</span>}
              {flagFilter && <span style={{ color: 'var(--color-text-light)' }}> (showing {filtered.length})</span>}
            </span>
            <button onClick={handleReprocess} disabled={reprocessing || !selected}
              style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'white', color: 'var(--color-text-med)', cursor: reprocessing ? 'default' : 'pointer', opacity: reprocessing ? 0.5 : 1 }}>
              {reprocessing ? 'Processing…' : 'Reprocess'}
            </button>
          </div>
        )}

        {fetching && <div style={{ textAlign: 'center', padding: 32, fontSize: 13, color: 'var(--color-text-light)' }}>Loading…</div>}
        {!fetching && fetchErr && <div style={{ margin: 16, padding: '12px 16px', borderRadius: 12, background: '#FFF3E0', fontSize: 12, color: '#E65100' }}>{fetchErr}</div>}

        {/* Data table */}
        {!fetching && !fetchErr && (
          filtered.length === 0
            ? <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: 'var(--color-text-light)' }}>{data.length === 0 ? 'No processed data for this period' : 'No rows match this filter'}</div>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--color-surface)', borderBottom: '2px solid var(--color-border)' }}>
                      {[
                        { label: 'Period',       align: 'left'  },
                        { label: 'Rain mm',      align: 'right' },
                        { label: 'Valid tips',   align: 'right' },
                        { label: 'Double tip',   align: 'right', title: '1s bounce'       },
                        { label: 'Interfere',    align: 'right', title: 'Visit proximity' },
                        { label: 'Manual tip',   align: 'right', title: 'Technician tipped bucket' },
                        { label: 'Non-rainfall', align: 'right', title: 'Declared water entry' },
                        { label: '!',            align: 'center', title: 'Anomaly >10mm'  },
                      ].map(col => (
                        <th key={col.label} title={col.title || ''} style={{ padding: '6px 10px', fontWeight: 700, fontSize: 11, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: col.align, whiteSpace: 'nowrap' }}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, i) => (
                      <tr key={row.period_start} style={{ borderBottom: '1px solid var(--color-surface-dark)', background: i % 2 === 0 ? 'white' : 'var(--color-surface)' }}>
                        <td style={{ padding: '5px 10px', color: 'var(--color-text-dark)', whiteSpace: 'nowrap' }}>{fmtPeriod(row.period_start, resolution)}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 600, color: parseFloat(row.rain_mm) > 0 ? '#1565C0' : 'var(--color-text-light)' }}>{parseFloat(row.rain_mm).toFixed(3)}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: row.valid_tips === row.tip_count ? '#2E7D32' : 'var(--color-text-dark)' }}>{row.valid_tips}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right' }}><FlagCell value={row.double_tip_count} /></td>
                        <td style={{ padding: '5px 10px', textAlign: 'right' }}><FlagCell value={row.interfere_count} /></td>
                        <td style={{ padding: '5px 10px', textAlign: 'right' }}><FlagCell value={row.manual_tip_count} /></td>
                        <td style={{ padding: '5px 10px', textAlign: 'right' }}><FlagCell value={row.non_rainfall_count} /></td>
                        <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                          {row.has_anomaly && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#FFF9C4', color: '#F57F17' }}>!</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}
      </main>
    </div>
  );
}

// ── Dashboard shell ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'network',  label: 'Network',  icon: '◉' },
  { id: 'feed',     label: 'Feed',     icon: '↓' },
  { id: 'errors',   label: 'Errors',   icon: '⚠' },
  { id: 'rainfall', label: 'Rainfall', icon: '≀' },
  { id: 'users',    label: 'Users',    icon: '◎' },
];

export default function MarcDashboard() {
  const [activeTab, setActiveTab] = useState('network');

  return (
    <div className="flex flex-col min-h-dvh app-layout">
      {activeTab === 'network'  && <NetworkTab />}
      {activeTab === 'feed'     && <FeedTab />}
      {activeTab === 'errors'   && <ErrorsTab />}
      {activeTab === 'rainfall' && <RainfallTab />}
      {activeTab === 'users'    && <UserManagement />}

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
