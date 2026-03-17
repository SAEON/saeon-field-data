import { useState, useEffect, useCallback } from 'react';
import ProfileButton from '../auth/ProfileSheet.jsx';
import { getVisits, getStations, getUsers, assignVisit, getOverdueStations, updateStation } from '../services/api.js';

function AppBar({ title }) {
  return (
    <header className="bg-navy h-14 flex items-center px-4 sticky top-0 z-50 shrink-0">
      <div className="w-10" />
      <div className="flex-1 text-center">
        <div className="text-white text-[17px] font-bold">{title}</div>
      </div>
      <ProfileButton />
    </header>
  );
}

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

function FamilyBadge({ family }) {
  const MAP = {
    groundwater: { label: 'Groundwater',    bg: '#E3F2FD', color: '#1565C0' },
    rainfall:    { label: 'Rainfall',       bg: '#E8F5E9', color: '#2E7D32' },
    met:         { label: 'Meteorological', bg: '#FFF3E0', color: '#E65100' },
  };
  const s = MAP[family] || { label: family ?? 'Other', bg: '#F5F5F5', color: '#616161' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 6px',
      borderRadius: 4, background: s.bg, color: s.color,
      letterSpacing: '0.04em',
    }}>
      {s.label}
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function urgencyColor(days, frequency) {
  if (days == null) return 'var(--color-error)';
  const ratio = days / frequency;
  if (ratio >= 2)   return 'var(--color-error)';
  if (ratio >= 1.5) return '#E65100';
  return '#F9A825';
}

function daysSinceLabel(days) {
  if (days == null) return 'Never visited';
  if (days === 0)   return 'Visited today';
  if (days === 1)   return '1 day ago';
  return `${days} days ago`;
}

// ── Assign visit sheet ───────────────────────────────────────────────────────
function AssignVisitSheet({ visit, technicians, onClose, onAssigned }) {
  const [selected, setSelected] = useState(visit.assigned_technician_id ?? '');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await assignVisit(visit.id, selected || null);
      onAssigned(visit.id, selected || null, technicians.find(t => t.id === selected));
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
        <div className="text-[12px] text-text-light mb-4">
          {visit.station_display_name} · {formatDate(visit.visited_at)}
        </div>

        <div className="flex flex-col gap-2 mb-4 max-h-52 overflow-y-auto">
          <button
            onClick={() => setSelected('')}
            className="text-left px-3 py-2.5 rounded-xl border text-[13px]"
            style={{
              borderColor: !selected ? 'var(--color-navy)' : 'var(--color-border)',
              background:  !selected ? '#EAF0FB' : 'white',
              fontWeight:  !selected ? 600 : 400,
            }}
          >
            Unassigned
          </button>
          {technicians.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className="text-left px-3 py-2.5 rounded-xl border text-[13px]"
              style={{
                borderColor: selected === t.id ? 'var(--color-navy)' : 'var(--color-border)',
                background:  selected === t.id ? '#EAF0FB' : 'white',
                fontWeight:  selected === t.id ? 600 : 400,
              }}
            >
              {t.full_name}
            </button>
          ))}
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

// ── Assign station sheet (overdue mode) ──────────────────────────────────────
function AssignStationSheet({ station, technicians, onClose, onAssigned }) {
  const [selected, setSelected] = useState(station.assigned_technician_id ?? '');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
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
        <div className="text-[12px] text-text-light mb-4">{station.display_name}</div>

        <div className="flex flex-col gap-2 mb-4 max-h-60 overflow-y-auto">
          <button
            onClick={() => setSelected('')}
            className="text-left px-3 py-2.5 rounded-xl border text-[13px]"
            style={{
              borderColor: selected === '' ? 'var(--color-navy)' : 'var(--color-border)',
              background:  selected === '' ? '#EAF0FB' : 'white',
              fontWeight:  selected === '' ? 600 : 400,
            }}
          >
            Unassigned
          </button>
          {technicians.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className="text-left px-3 py-2.5 rounded-xl border text-[13px]"
              style={{
                borderColor: selected === t.id ? 'var(--color-navy)' : 'var(--color-border)',
                background:  selected === t.id ? '#EAF0FB' : 'white',
                fontWeight:  selected === t.id ? 600 : 400,
              }}
            >
              {t.full_name}
              {!t.active && <span className="ml-2 text-[11px] text-text-light">(inactive)</span>}
            </button>
          ))}
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

export default function VisitOversight() {
  const [visits,          setVisits]          = useState([]);
  const [overdueStations, setOverdueStations] = useState([]);
  const [technicians,     setTechnicians]     = useState([]);
  const [stations,        setStations]        = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [assignTarget,    setAssignTarget]    = useState(null);

  // Filters
  const [filterStatus,      setFilterStatus]      = useState('');
  const [filterTechnician,  setFilterTechnician]  = useState('');
  const [filterStation,     setFilterStation]     = useState('');

  const isOverdueMode = filterStatus === 'overdue';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isOverdueMode) {
        const [s, u] = await Promise.all([getOverdueStations(), getUsers()]);
        setOverdueStations(s);
        setTechnicians(u.filter(u => u.active));
      } else {
        const [v, u, s] = await Promise.all([getVisits({}), getUsers(), getStations()]);
        setVisits(v);
        setTechnicians(u.filter(u => u.role === 'technician' && u.active));
        setStations(s);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isOverdueMode]);

  useEffect(() => { load(); }, [load]);

  // Visit filtering (non-overdue mode)
  const filteredVisits = visits.filter(v => {
    if (filterStatus      && v.status !== filterStatus)                            return false;
    if (filterTechnician  && String(v.technician_id) !== String(filterTechnician)) return false;
    if (filterStation     && String(v.station_id)    !== String(filterStation))    return false;
    return true;
  });

  // Overdue station filtering
  const filteredOverdue = overdueStations.filter(s => {
    if (filterTechnician && String(s.assigned_technician_id) !== String(filterTechnician)) return false;
    if (filterStation    && String(s.id)                     !== String(filterStation))    return false;
    return true;
  });

  function handleVisitAssigned(visitId, technicianId) {
    setVisits(prev => prev.map(v =>
      v.id === visitId ? { ...v, assigned_technician_id: technicianId } : v
    ));
  }

  function handleStationAssigned(stationId, technicianId) {
    const tech = technicians.find(t => t.id === technicianId);
    setOverdueStations(prev => prev.map(s =>
      s.id === stationId
        ? { ...s, assigned_technician_id: technicianId, assigned_technician_name: tech?.full_name ?? null }
        : s
    ));
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <AppBar title="All Visits" />

      {/* Filters */}
      <div className="shrink-0 px-4 py-2 flex gap-2 overflow-x-auto" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="text-[12px] h-8 px-2 rounded-lg border border-border bg-white text-text-med shrink-0"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="flagged">Flagged</option>
          <option value="overdue">Overdue</option>
        </select>

        <select
          value={filterTechnician}
          onChange={e => setFilterTechnician(e.target.value)}
          className="text-[12px] h-8 px-2 rounded-lg border border-border bg-white text-text-med shrink-0"
        >
          <option value="">All technicians</option>
          {technicians.map(t => (
            <option key={t.id} value={t.id}>{t.full_name}</option>
          ))}
        </select>

        <select
          value={filterStation}
          onChange={e => setFilterStation(e.target.value)}
          className="text-[12px] h-8 px-2 rounded-lg border border-border bg-white text-text-med shrink-0"
        >
          <option value="">All stations</option>
          {stations.map(s => (
            <option key={s.id} value={s.id}>{s.display_name}</option>
          ))}
        </select>
      </div>

      <main className="flex-1 overflow-y-auto w-full max-w-[var(--max-width)] mx-auto">
        {loading && (
          <div className="flex items-center justify-center h-40 text-text-light text-sm">Loading…</div>
        )}

        {!loading && error && (
          <div className="mx-4 mt-4 p-4 bg-warning-light rounded-xl text-[13px] text-warning">{error}</div>
        )}

        {/* ── Overdue stations view ── */}
        {!loading && !error && isOverdueMode && (
          filteredOverdue.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 gap-3 text-center px-8">
              <div className="text-[15px] font-semibold text-text-dark">All stations are current</div>
              <div className="text-[13px] text-text-light leading-relaxed">
                No stations are overdue based on their configured visit frequency.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-4">
              {filteredOverdue.map(station => {
                const color = urgencyColor(station.days_since_visit, station.visit_frequency_days);
                return (
                  <div
                    key={station.id}
                    className="bg-white rounded-2xl overflow-hidden"
                    style={{ border: '1px solid var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                  >
                    <div style={{ height: 4, background: color }} />
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="text-[14px] font-bold text-text-dark truncate">
                            {station.display_name}
                          </div>
                          <div className="text-[11px] text-text-light mt-0.5">
                            {station.region ?? 'No region'}
                          </div>
                        </div>
                        <FamilyBadge family={station.data_family} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[22px] font-black leading-none" style={{ color }}>
                            {station.days_since_visit ?? '∞'}
                          </div>
                          <div className="text-[11px] text-text-light mt-0.5">
                            {daysSinceLabel(station.days_since_visit)}
                            {' · '}threshold {station.visit_frequency_days}d
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[11px] text-text-light mb-1">
                            {station.assigned_technician_name ?? 'Unassigned'}
                          </div>
                          <button
                            onClick={() => setAssignTarget({ type: 'station', data: station })}
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

        {/* ── Normal visits view ── */}
        {!loading && !error && !isOverdueMode && (
          filteredVisits.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 gap-2 text-center px-8">
              <div className="text-[15px] font-semibold text-text-dark">No visits found</div>
              <div className="text-[13px] text-text-light">Try adjusting the filters above.</div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-4">
              {filteredVisits.map(visit => (
                <div
                  key={visit.id}
                  className="bg-white rounded-2xl px-4 py-3"
                  style={{ border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="text-[13px] font-bold text-text-dark truncate">
                      {visit.station_display_name}
                    </div>
                    <StatusBadge status={visit.status} />
                  </div>

                  <div className="text-[12px] text-text-med mb-2">
                    {visit.technician_name} · {formatDate(visit.visited_at)}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-3 text-[11px] text-text-light">
                      <span>{visit.file_count} file{visit.file_count !== 1 ? 's' : ''}</span>
                      {visit.file_error_count > 0 && (
                        <span style={{ color: 'var(--color-error)' }}>
                          {visit.file_error_count} error{visit.file_error_count !== 1 ? 's' : ''}
                        </span>
                      )}
                      {visit.file_gap_count > 0 && (
                        <span style={{ color: '#E65100', fontWeight: 700 }}>
                          {visit.file_gap_count} gap{visit.file_gap_count !== 1 ? 's' : ''}
                        </span>
                      )}
                      <span>{visit.reading_count} reading{visit.reading_count !== 1 ? 's' : ''}</span>
                    </div>

                    {visit.status === 'draft' && (
                      <button
                        onClick={() => setAssignTarget({ type: 'visit', data: visit })}
                        className="h-7 px-2.5 rounded-lg text-[11px] font-semibold border-none"
                        style={{ background: '#EAF0FB', color: 'var(--color-navy)' }}
                      >
                        {visit.assigned_technician_id ? 'Reassign' : 'Assign'}
                      </button>
                    )}
                  </div>

                  {visit.site_condition && (
                    <div className="text-[11px] text-text-light mt-1.5 italic">
                      Site: {visit.site_condition}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </main>

      {assignTarget?.type === 'visit' && (
        <AssignVisitSheet
          visit={assignTarget.data}
          technicians={technicians}
          onClose={() => setAssignTarget(null)}
          onAssigned={handleVisitAssigned}
        />
      )}

      {assignTarget?.type === 'station' && (
        <AssignStationSheet
          station={assignTarget.data}
          technicians={technicians}
          onClose={() => setAssignTarget(null)}
          onAssigned={handleStationAssigned}
        />
      )}
    </div>
  );
}
