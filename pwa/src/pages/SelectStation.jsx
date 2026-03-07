import { useState } from 'react';
import { useStations } from '../hooks/useStations.js';

const FAMILY_ICONS = {
  rainfall:    '🌧',
  groundwater: '💧',
  met:         '🌤',
};

const FAMILY_LABELS = {
  rainfall:    'Rainfall',
  groundwater: 'Groundwater',
  met:         'Met',
};

export default function SelectStation({ setStation, advance }) {
  const { stations, loading, offline } = useStations();

  const [query,      setQuery]      = useState('');
  const [filter,     setFilter]     = useState('all');
  const [selectedId, setSelectedId] = useState(null);

  const filtered = stations
    .filter(s => {
      const q      = query.toLowerCase();
      const matchQ = s.display_name.toLowerCase().includes(q) ||
                     (s.region || '').toLowerCase().includes(q);
      const matchF = filter === 'all' || s.data_family === filter;
      return matchQ && matchF;
    })
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  const selectedStation = stations.find(s => s.id === selectedId);

  function handleStart() {
    if (!selectedStation) return;
    setStation(selectedStation);
    advance(2);
  }

  return (
    <div className="flex flex-col min-h-dvh max-w-[var(--max-width)] mx-auto w-full bg-surface">

      {/* ── Custom app bar — no step counter on Screen 1 ─────────── */}
      <header className="bg-navy px-5 pt-2 pb-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="nav-icon nav-icon--logo">🛰</div>
          <div>
            <div className="text-white font-bold text-base tracking-wide">SAEON FDS</div>
            <div className="text-white/40 text-[10px] mt-0.5">Field Data System</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="nav-icon">🔔</div>
          <div className="avatar">SJ</div>
        </div>
      </header>

      {/* ── Summary strip ─────────────────────────────────────────── */}
      <div className="bg-navy px-5 pb-4 flex gap-2.5 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="stat-tile">
          <div className="text-lg font-bold text-white/90">{loading ? '…' : stations.length}</div>
          <div className="text-[10px] text-white/40 mt-0.5">Stations</div>
        </div>
        <div className="stat-tile">
          <div className={`text-lg font-bold ${offline ? 'text-warning' : 'text-white/40'}`}>
            {offline ? 'Yes' : 'No'}
          </div>
          <div className="text-[10px] text-white/40 mt-0.5">Offline</div>
        </div>
        <div className="stat-tile">
          <div className="text-lg font-bold text-white/40">—</div>
          <div className="text-[10px] text-white/40 mt-0.5">My visits</div>
        </div>
      </div>

      {/* Offline banner */}
      {offline && (
        <div className="bg-warning-light text-warning text-xs text-center py-2 px-4 shrink-0" style={{ borderBottom: '1px solid rgba(230,81,0,0.2)' }}>
          Offline — showing cached stations
        </div>
      )}

      {/* ── Search ────────────────────────────────────────────────── */}
      <div className="px-4 pt-3.5 pb-1.5 shrink-0">
        <div className="relative flex items-center">
          <span className="absolute left-3.5 text-text-light pointer-events-none">🔍</span>
          <input
            className="search-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by station or region…"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 w-[22px] h-[22px] rounded-full bg-surface-dark text-text-med text-[11px] border-none flex items-center justify-center"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Filter chips ──────────────────────────────────────────── */}
      <div className="flex items-center px-4 py-2 gap-1.5 overflow-x-auto shrink-0">
        {['all', 'rainfall', 'groundwater', 'met'].map(f => (
          <button
            key={f}
            data-family={f}
            data-active={filter === f ? 'true' : undefined}
            onClick={() => setFilter(f)}
            className="filter-chip"
          >
            {f !== 'all' && <span>{FAMILY_ICONS[f]}</span>}
            {f === 'all' ? 'All' : FAMILY_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="px-4 pb-2 text-[11px] text-text-light font-medium shrink-0">
        {loading
          ? 'Loading stations…'
          : `${filtered.length} station${filtered.length !== 1 ? 's' : ''}`}
        {filter !== 'all' && ` · ${FAMILY_LABELS[filter]}`}
        {query && ` · "${query}"`}
      </div>

      {/* ── Station list ──────────────────────────────────────────── */}
      <div className="flex-1 px-4 flex flex-col gap-2">
        {filtered.map(s => (
          <div
            key={s.id}
            data-family={s.data_family}
            data-selected={selectedId === s.id ? 'true' : undefined}
            onClick={() => setSelectedId(s.id)}
            className="station-card"
          >
            <div className="family-icon">{FAMILY_ICONS[s.data_family]}</div>

            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-text-dark truncate">
                {s.display_name}
              </div>
              {s.region && (
                <div className="text-[11px] text-text-light mt-0.5">{s.region}</div>
              )}
              <div className="family-badge">
                {FAMILY_ICONS[s.data_family]} {FAMILY_LABELS[s.data_family]}
              </div>
            </div>

            <span className={`text-lg shrink-0 ${selectedId === s.id ? 'text-blue' : 'text-border'}`}>›</span>
          </div>
        ))}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-text-light text-sm">
            No stations match your search.
          </div>
        )}

        {/* Spacer so sticky CTA doesn't obscure last card */}
        <div className={selectedId ? 'h-24' : 'h-8'} />
      </div>

      {/* ── Sticky CTA ────────────────────────────────────────────── */}
      {selectedId && (
        <div
          className="sticky bottom-0 px-4 pb-7 pt-4 shrink-0"
          style={{ background: 'linear-gradient(to top, var(--color-surface) 70%, transparent)' }}
        >
          <button onClick={handleStart} className="cta-btn">
            Start visit — {selectedStation?.display_name.split(' ').slice(0, 3).join(' ')}
            <span className="text-lg">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
