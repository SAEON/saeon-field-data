import { useState, useEffect, useCallback } from 'react';
import ProfileButton from '../auth/ProfileSheet.jsx';
import { getStationsRegistry, createStation, updateStation, deactivateStation, getStationCoverage, getUsers } from '../services/api.js';

const DATA_FAMILY_OPTIONS = [
  { value: 'groundwater', label: 'Groundwater' },
  { value: 'rainfall',    label: 'Rainfall' },
  { value: 'met',         label: 'Meteorological' },
  { value: 'other',       label: 'Other' },
];

function slugify(text) {
  return text.toLowerCase().trim()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

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

function Fab({ label, onPress }) {
  return (
    <button
      onClick={onPress}
      className="fixed flex items-center gap-1.5 rounded-full bg-navy text-white text-[12px] font-semibold shadow-lg border-none z-40"
      style={{ bottom: 72, right: 16, height: 36, paddingLeft: 14, paddingRight: 14 }}
    >
      <span style={{ fontSize: 16, lineHeight: 1, marginTop: -1 }}>+</span>
      {label}
    </button>
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

// ── Station form sheet ───────────────────────────────────────────────────────
function StationSheet({ station, onClose, onSaved }) {
  const isNew = !station;
  const [form, setForm] = useState({
    name:                    station?.name                    ?? '',
    display_name:            station?.display_name            ?? '',
    data_family:             station?.data_family             ?? 'groundwater',
    region:                  station?.region                  ?? '',
    latitude:                station?.latitude                ?? '',
    longitude:               station?.longitude               ?? '',
    elevation_m:             station?.elevation_m             ?? '',
    visit_frequency_days:    station?.visit_frequency_days    ?? 30,
    notes:                   station?.notes                   ?? '',
    active:                  station?.active                  ?? true,
    assigned_technician_id:  station?.assigned_technician_id  ?? '',
  });
  const [technicians, setTechnicians] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  useEffect(() => {
    getUsers()
      .then(all => setTechnicians((all || []).filter(u => u.role === 'technician' && u.active)))
      .catch(() => {});
  }, []);

  function set(field, value) {
    setForm(f => {
      const next = { ...f, [field]: value };
      if (field === 'display_name' && isNew) next.name = slugify(value);
      return next;
    });
  }

  async function handleSave() {
    if (!form.display_name.trim() || !form.data_family) {
      setError('Display name and data family are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name:                   form.name || slugify(form.display_name),
        display_name:           form.display_name.trim(),
        data_family:            form.data_family,
        region:                 form.region.trim() || null,
        latitude:               form.latitude !== '' ? parseFloat(form.latitude) : null,
        longitude:              form.longitude !== '' ? parseFloat(form.longitude) : null,
        elevation_m:            form.elevation_m !== '' ? parseFloat(form.elevation_m) : null,
        visit_frequency_days:   parseInt(form.visit_frequency_days, 10) || 30,
        notes:                  form.notes.trim() || null,
        assigned_technician_id: form.assigned_technician_id ? parseInt(form.assigned_technician_id, 10) : null,
      };
      let saved;
      if (isNew) {
        saved = await createStation(payload);
      } else {
        saved = await updateStation(station.id, { ...payload, active: form.active });
      }
      onSaved(saved, isNew);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full h-9 px-2.5 rounded-lg border border-border bg-white text-[12px] text-text-dark';
  const labelCls = 'text-[10px] font-semibold text-text-light uppercase tracking-wide mb-1';

  return (
    <div className="back-sheet-overlay">
      <div className="back-sheet" style={{ maxHeight: '90dvh', overflowY: 'auto', paddingBottom: 24 }}>
        <div className="text-[13px] font-bold text-text-dark mb-3">
          {isNew ? 'Add station' : 'Edit station'}
        </div>

        <div className="flex flex-col gap-3.5">
          <div>
            <div className={labelCls}>Display name</div>
            <input className={inputCls} value={form.display_name}
              onChange={e => set('display_name', e.target.value)}
              placeholder="e.g. Klein Nuwejaar Groundwater 01" />
            {isNew && form.name && (
              <div className="text-[10px] text-text-light mt-0.5 font-mono">ID: {form.name}</div>
            )}
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <div className={labelCls}>Data family</div>
              <select className={inputCls} value={form.data_family} onChange={e => set('data_family', e.target.value)}>
                {DATA_FAMILY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <div className={labelCls}>Region</div>
              <input className={inputCls} value={form.region} onChange={e => set('region', e.target.value)}
                placeholder="e.g. Western Cape" />
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <div className={labelCls}>Latitude</div>
              <input className={inputCls} type="number" step="any" value={form.latitude}
                onChange={e => set('latitude', e.target.value)} placeholder="-34.123" />
            </div>
            <div className="flex-1">
              <div className={labelCls}>Longitude</div>
              <input className={inputCls} type="number" step="any" value={form.longitude}
                onChange={e => set('longitude', e.target.value)} placeholder="18.456" />
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <div className={labelCls}>Elevation (m)</div>
              <input className={inputCls} type="number" value={form.elevation_m}
                onChange={e => set('elevation_m', e.target.value)} placeholder="Optional" />
            </div>
            <div className="flex-1">
              <div className={labelCls}>Visit frequency (days)</div>
              <input className={inputCls} type="number" min="1" value={form.visit_frequency_days}
                onChange={e => set('visit_frequency_days', e.target.value)} />
            </div>
          </div>

          <div>
            <div className={labelCls}>Assigned technician</div>
            <select className={inputCls} value={form.assigned_technician_id}
              onChange={e => set('assigned_technician_id', e.target.value)}>
              <option value="">Unassigned</option>
              {technicians.map(u => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className={labelCls}>Notes</div>
            <textarea
              className="w-full px-2.5 py-2 rounded-lg border border-border bg-white text-[12px] text-text-dark resize-none"
              rows={2}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Access instructions, special conditions, etc."
            />
          </div>

          {!isNew && (
            <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-surface">
              <div>
                <div className="text-[12px] font-semibold text-text-dark">Active</div>
                <div className="text-[10px] text-text-light">Inactive stations are hidden from technicians</div>
              </div>
              <button
                onClick={() => set('active', !form.active)}
                className="relative w-10 h-5 rounded-full transition-colors duration-200 border-none shrink-0"
                style={{ background: form.active ? 'var(--color-navy)' : '#BDBDBD' }}
                aria-pressed={form.active}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200"
                  style={{ transform: form.active ? 'translateX(20px)' : 'translateX(0)' }}
                />
              </button>
            </div>
          )}
        </div>

        {error && <div className="text-[11px] text-error mt-2">{error}</div>}

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} disabled={saving}
            className="flex-1 h-10 border-[1.5px] border-border rounded-xl bg-white text-text-med text-[12px] font-semibold">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 h-10 rounded-xl bg-navy text-white text-[12px] font-semibold border-none">
            {saving ? 'Saving…' : isNew ? 'Add station' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm deactivate sheet ─────────────────────────────────────────────────
function DeactivateSheet({ station, onClose, onDeactivated }) {
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      await deactivateStation(station.id);
      onDeactivated(station.id);
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
        <div className="text-[15px] font-bold text-text-dark mb-1">Deactivate station?</div>
        <div className="text-[13px] text-text-light mb-4 leading-relaxed">
          <strong>{station.display_name}</strong> will be hidden from technicians. Visit history is preserved.
          You can re-activate it by editing the station.
        </div>
        {error && <div className="text-[12px] text-error mb-3">{error}</div>}
        <div className="flex gap-2.5">
          <button onClick={onClose} disabled={saving}
            className="flex-1 h-12 border-[1.5px] border-border rounded-xl bg-white text-text-med text-sm font-semibold">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={saving}
            className="flex-1 h-12 rounded-xl text-white text-sm font-semibold border-none"
            style={{ background: 'var(--color-error)' }}>
            {saving ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>
  );
}

const STREAM_LABEL = {
  raw_rainfall:    { label: 'Rainfall',       icon: '🌧' },
  raw_groundwater: { label: 'Groundwater',    icon: '💧' },
  raw_5_min:       { label: 'Met (5-min)',    icon: '🌤' },
  raw_hourly:      { label: 'Met (hourly)',   icon: '🌤' },
  raw_stom:        { label: 'STOM',           icon: '📡' },
};

function AssignTechnicianSheet({ station, onClose, onAssigned }) {
  const [users,    setUsers]    = useState([]);
  const [selected, setSelected] = useState(station.assigned_technician_id ?? '');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    getUsers().then(setUsers).catch(() => {});
  }, []);

  const technicians = users.filter(u => u.role === 'technician' && u.active);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const saved = await updateStation(station.id, {
        assigned_technician_id: selected ? parseInt(selected, 10) : null,
      });
      onAssigned(saved);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full h-10 px-3 rounded-xl border border-border bg-white text-[13px] text-text-dark';

  return (
    <div className="back-sheet-overlay">
      <div className="back-sheet">
        <div className="text-[15px] font-bold text-text-dark mb-1">Assign technician</div>
        <div className="text-[12px] text-text-light mb-4">{station.display_name}</div>

        <select
          className={inputCls}
          value={selected}
          onChange={e => setSelected(e.target.value)}
          style={{ marginBottom: 16 }}
        >
          <option value="">Unassigned</option>
          {technicians.map(u => (
            <option key={u.id} value={u.id}>{u.full_name}</option>
          ))}
        </select>

        {error && <div className="text-[12px] text-error mb-3">{error}</div>}

        <div className="flex gap-2.5">
          <button onClick={onClose} disabled={saving}
            className="flex-1 h-12 border-[1.5px] border-border rounded-xl bg-white text-text-med text-sm font-semibold">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 h-12 rounded-xl bg-navy text-white text-sm font-semibold border-none">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CoverageSheet({ station, onClose }) {
  const [coverage, setCoverage] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    getStationCoverage(station.id)
      .then(data => setCoverage(data.coverage || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [station.id]);

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  return (
    <div className="back-sheet-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="back-sheet" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>

        <div className="flex justify-center pt-2.5 pb-0 shrink-0">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0">
          <div>
            <div className="text-[15px] font-bold text-text-dark">{station.display_name}</div>
            <div className="text-[11px] text-text-light mt-0.5 font-mono">{station.name}</div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-light text-[16px] shrink-0 bg-transparent border-none"
            style={{ border: '1px solid var(--color-border)' }}
          >✕</button>
        </div>

        <div className="text-[11px] font-bold text-text-light uppercase tracking-wide px-5 pb-2 shrink-0">
          Data Coverage
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {loading && (
            <div className="text-[13px] text-text-light py-6 text-center">Loading…</div>
          )}
          {error && (
            <div className="text-[12px] text-error py-4 text-center">{error}</div>
          )}
          {!loading && !error && coverage?.length === 0 && (
            <div className="text-[13px] text-text-light py-6 text-center">
              No data uploaded yet for this station.
            </div>
          )}
          {!loading && !error && coverage?.length > 0 && (
            <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1.5px solid var(--color-border)' }}>
              {coverage.map((row, i) => {
                const meta = STREAM_LABEL[row.stream_name] || { label: row.stream_name, icon: '📁' };
                return (
                  <div
                    key={row.stream_name}
                    className="px-3.5 py-3"
                    style={{ borderBottom: i < coverage.length - 1 ? '1px solid var(--color-surface-dark)' : 'none' }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-semibold text-text-dark">
                        {meta.icon} {meta.label}
                      </span>
                      <span className="text-[11px] text-text-light">
                        {row.file_count} {row.file_count === 1 ? 'file' : 'files'}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-light">
                      {fmtDate(row.coverage_start)} — {fmtDate(row.coverage_end)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StationRegistry() {
  const [stations,         setStations]         = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState(null);
  const [showInactive,     setShowInactive]     = useState(false);
  const [editTarget,       setEditTarget]       = useState(undefined);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [coverageTarget,   setCoverageTarget]   = useState(null);
  const [assignTarget,     setAssignTarget]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getStationsRegistry();
      setStations(s);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSaved(saved, isNew) {
    setStations(prev => {
      if (isNew) return [saved, ...prev];
      return prev.map(s => s.id === saved.id ? saved : s);
    });
  }

  function handleDeactivated(stationId) {
    setStations(prev => prev.map(s =>
      s.id === stationId ? { ...s, active: false } : s
    ));
  }

  function handleAssigned(saved) {
    setStations(prev => prev.map(s => s.id === saved.id ? { ...s, ...saved } : s));
  }

  const displayed = showInactive ? stations : stations.filter(s => s.active);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <AppBar title="Station Registry" />

      {/* Show inactive toggle */}
      <div className="shrink-0 px-4 py-2 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="text-[12px] text-text-med">
          {stations.filter(s => !s.active).length} inactive
        </span>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-[12px] text-text-med">Show inactive</span>
          <div
            onClick={() => setShowInactive(v => !v)}
            className="relative w-10 h-5 rounded-full cursor-pointer transition-colors duration-200"
            style={{ background: showInactive ? 'var(--color-navy)' : '#BDBDBD' }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200"
              style={{ transform: showInactive ? 'translateX(20px)' : 'translateX(0)' }}
            />
          </div>
        </label>
      </div>

      <main className="flex-1 overflow-y-auto w-full max-w-[var(--max-width)] mx-auto pb-24">
        {loading && (
          <div className="flex items-center justify-center h-40 text-text-light text-sm">Loading…</div>
        )}

        {!loading && error && (
          <div className="mx-4 mt-4 p-4 bg-warning-light rounded-xl text-[13px] text-warning">{error}</div>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-2.5 p-3">
            {displayed.map(station => (
              <div
                key={station.id}
                className="bg-white rounded-xl px-3 py-2"
                style={{
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  opacity: station.active ? 1 : 0.6,
                }}
              >
                <div className="mb-0.5">
                  <div className="text-[12px] font-bold text-text-dark truncate">
                    {station.display_name}
                    {!station.active && (
                      <span className="ml-1.5 text-[10px] font-normal text-text-light">(inactive)</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] text-text-light min-w-0">
                    <FamilyBadge family={station.data_family} />
                    {station.region ?? 'No region'}
                    {' · '}every {station.visit_frequency_days}d
                    {station.last_visited_at && (
                      <> · Last: {formatDate(station.last_visited_at)}</>
                    )}
                    <span className={`ml-1 font-semibold ${station.assigned_technician_name ? 'text-blue' : 'text-warning'}`}>
                      · {station.assigned_technician_name ?? 'Unassigned'}
                    </span>
                  </div>

                  <div className="flex gap-1 shrink-0">
                    {[
                      { label: 'Assign',     onClick: () => setAssignTarget(station) },
                      { label: 'History',    onClick: () => setCoverageTarget(station) },
                      { label: 'Edit',       onClick: () => setEditTarget(station) },
                      ...(station.active ? [{ label: 'Deactivate', onClick: () => setDeactivateTarget(station) }] : []),
                    ].map(btn => (
                      <button key={btn.label} onClick={btn.onClick}
                        className="h-6 px-1.5 rounded text-[9px] font-semibold"
                        style={{ background: 'white', color: '#374151', border: '1px solid var(--color-border)' }}>
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {displayed.length === 0 && !loading && (
              <div className="text-center text-text-light text-[13px] mt-10">No stations found.</div>
            )}
          </div>
        )}
      </main>

      <Fab label="Add station" onPress={() => setEditTarget(null)} />

      {editTarget !== undefined && (
        <StationSheet
          station={editTarget}
          onClose={() => setEditTarget(undefined)}
          onSaved={handleSaved}
        />
      )}

      {deactivateTarget && (
        <DeactivateSheet
          station={deactivateTarget}
          onClose={() => setDeactivateTarget(null)}
          onDeactivated={handleDeactivated}
        />
      )}

      {coverageTarget && (
        <CoverageSheet
          station={coverageTarget}
          onClose={() => setCoverageTarget(null)}
        />
      )}

      {assignTarget && (
        <AssignTechnicianSheet
          station={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={handleAssigned}
        />
      )}
    </div>
  );
}
