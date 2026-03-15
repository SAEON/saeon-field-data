import { useState, useEffect, useCallback } from 'react';
import ProfileButton from '../auth/ProfileSheet.jsx';
import { getOverdueStations, getUsers, updateStation } from '../services/api.js';

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

function daysSinceLabel(days) {
  if (days == null) return 'Never visited';
  if (days === 0)   return 'Visited today';
  if (days === 1)   return '1 day ago';
  return `${days} days ago`;
}

function urgencyColor(days, frequency) {
  if (days == null) return 'var(--color-error)';
  const ratio = days / frequency;
  if (ratio >= 2) return 'var(--color-error)';
  if (ratio >= 1.5) return '#E65100';
  return '#F9A825';
}

// ── Assign sheet ────────────────────────────────────────────────────────────
function AssignSheet({ station, technicians, onClose, onAssigned }) {
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
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-12 border-[1.5px] border-border rounded-xl bg-white text-text-med text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-12 rounded-xl bg-navy text-white text-sm font-semibold border-none"
          >
            {saving ? 'Saving…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OverdueDashboard() {
  const [stations,     setStations]     = useState([]);
  const [technicians,  setTechnicians]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, u] = await Promise.all([getOverdueStations(), getUsers()]);
      setStations(s);
      setTechnicians(u.filter(u => u.active));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleAssigned(stationId, technicianId) {
    const tech = technicians.find(t => t.id === technicianId);
    setStations(prev => prev.map(s =>
      s.id === stationId
        ? { ...s, assigned_technician_id: technicianId, assigned_technician_name: tech?.full_name ?? null }
        : s
    ));
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <AppBar
        title="Overdue Stations"
        subtitle={stations.length ? `${stations.length} station${stations.length !== 1 ? 's' : ''} overdue` : undefined}
      />

      <main className="flex-1 overflow-y-auto w-full max-w-[var(--max-width)] mx-auto">
        {loading && (
          <div className="flex items-center justify-center h-40 text-text-light text-sm">Loading…</div>
        )}

        {!loading && error && (
          <div className="mx-4 mt-4 p-4 bg-warning-light rounded-xl text-[13px] text-warning">
            {error}
          </div>
        )}

        {!loading && !error && stations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-60 gap-3 text-center px-8">
            <div className="text-4xl">✓</div>
            <div className="text-[15px] font-semibold text-text-dark">All stations are current</div>
            <div className="text-[13px] text-text-light leading-relaxed">
              No stations are overdue for a visit based on their configured frequency.
            </div>
          </div>
        )}

        {!loading && !error && stations.length > 0 && (
          <div className="flex flex-col gap-3 p-4">
            {stations.map(station => {
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
        )}
      </main>

      {assignTarget && (
        <AssignSheet
          station={assignTarget}
          technicians={technicians}
          onClose={() => setAssignTarget(null)}
          onAssigned={handleAssigned}
        />
      )}
    </div>
  );
}
