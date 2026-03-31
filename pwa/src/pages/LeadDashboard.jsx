import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import ProfileButton from '../auth/ProfileSheet.jsx';
import { getStations, getStationRainfall, getStationRainfallSummary, processStationRainfall } from '../services/api.js';
import VisitOversight  from './VisitOversight.jsx';
import StationRegistry from './StationRegistry.jsx';
import UserManagement  from './UserManagement.jsx';

const TABS = [
  { id: 'visits',   label: 'Visits',   icon: '☑' },
  { id: 'stations', label: 'Stations', icon: '◉' },
  { id: 'rainfall', label: 'Rainfall', icon: '≀' },
  { id: 'users',    label: 'Users',    icon: '◎' },
];

// ── SVG bar chart ─────────────────────────────────────────────────────────────

function RainfallBarChart({ data }) {
  if (!data.length) return null;
  const maxMm  = Math.max(...data.map(r => parseFloat(r.rain_mm)), 1);
  const W = 400, H = 72, barArea = 56, labelY = H - 1;
  const gap  = W / data.length;
  const barW = Math.max(Math.min(gap - 0.5, 4), 1.5);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {data.map((r, i) => {
        const mm        = parseFloat(r.rain_mm);
        const h         = (mm / maxMm) * barArea;
        const x         = i * gap + gap / 2 - barW / 2;
        const y         = barArea - h;
        const d         = new Date(r.period_start);
        const showLabel = d.getDate() === 1 || (data.length <= 31 && d.getDay() === 1);
        return (
          <g key={r.period_start}>
            {mm > 0 && (
              <rect x={x} y={y} width={barW} height={h}
                fill={r.has_anomaly ? '#F59E0B' : '#3B7DD8'} rx={0.5} />
            )}
            {showLabel && (
              <text x={x + barW / 2} y={labelY}
                fontSize="6" fill="#9CA3AF" textAnchor="middle">
                {d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Rainfall overview tab ─────────────────────────────────────────────────────

const PERIODS = [
  { label: '30 d',   days: 30  },
  { label: '90 d',   days: 90  },
  { label: '12 mo',  days: 365 },
];

function RainfallOverview() {
  const [stations,     setStations]     = useState([]);
  const [stationData,  setStationData]  = useState({});
  const [expanded,     setExpanded]     = useState(null);
  const [reprocessing, setReprocessing] = useState(null);
  const [period,       setPeriod]       = useState(1); // index into PERIODS

  useEffect(() => {
    getStations()
      .then(all => {
        const rf = (all || []).filter(s => s.data_family === 'rainfall');
        setStations(rf);
        Promise.all(rf.map(s =>
          getStationRainfallSummary(s.id)
            .then(res => ({ id: s.id, summary: res }))
            .catch(() => ({ id: s.id, summary: null }))
        )).then(results => {
          const map = {};
          for (const { id, summary } of results) map[id] = { summary };
          setStationData(map);
        });
      })
      .catch(() => {});
  }, []);

  function handleExpand(stationId) {
    if (expanded === stationId) { setExpanded(null); return; }
    setExpanded(stationId);
    loadChart(stationId, period);
  }

  function loadChart(stationId, periodIdx) {
    const from = new Date(Date.now() - PERIODS[periodIdx].days * 24 * 60 * 60 * 1000).toISOString();
    getStationRainfall(stationId, { resolution: 'daily', from })
      .then(res => setStationData(prev => ({
        ...prev,
        [stationId]: { ...prev[stationId], chartData: res.data || [], chartPeriod: periodIdx },
      })))
      .catch(() => {});
  }

  function handlePeriod(idx) {
    setPeriod(idx);
    if (expanded) loadChart(expanded, idx);
  }

  function handleReprocess(stationId) {
    setReprocessing(stationId);
    processStationRainfall(stationId).finally(() => setReprocessing(null));
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header className="bg-navy h-14 flex items-center px-4 sticky top-0 z-50 shrink-0">
        <div className="w-10" />
        <div className="flex-1 text-center">
          <div className="text-white text-[17px] font-bold">Rainfall</div>
        </div>
        <ProfileButton />
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 24px' }}>
        {stations.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 48, fontSize: 13, color: 'var(--color-text-light)' }}>
            No rainfall stations
          </div>
        ) : stations.map(s => {
          const sd    = stationData[s.id];
          const isExp = expanded === s.id;
          const isProc = reprocessing === s.id;
          return (
            <div key={s.id} style={{ background: 'white', borderRadius: 10, border: '1px solid var(--color-border)', marginBottom: 8, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                <button
                  onClick={() => handleExpand(s.id)}
                  style={{ flex: 1, background: 'transparent', border: 'none', textAlign: 'left', padding: 0, cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-dark)' }}>{s.display_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-light)', marginTop: 1 }}>
                    {sd?.summary
                      ? (() => {
                          const s = sd.summary;
                          const flagged = (s.double_tip_count || 0) + (s.interfere_count || 0) + (s.pseudo_event_count || 0);
                          return <>{parseFloat(s.total_mm || 0).toFixed(1)} mm · {flagged > 0 ? <span style={{ color: '#E65100' }}>{flagged} flagged tip{flagged !== 1 ? 's' : ''}</span> : '0 flagged tips'}</>;
                        })()
                      : 'Loading…'}
                  </div>
                </button>
                <button
                  onClick={() => handleReprocess(s.id)}
                  disabled={isProc}
                  style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-dark)', cursor: isProc ? 'default' : 'pointer', opacity: isProc ? 0.5 : 1 }}
                >
                  {isProc ? '…' : 'Reprocess'}
                </button>
                <span
                  onClick={() => handleExpand(s.id)}
                  style={{ fontSize: 18, color: 'var(--color-border)', cursor: 'pointer', display: 'inline-block', transition: 'transform 0.2s', transform: isExp ? 'rotate(90deg)' : 'none' }}
                >›</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--color-surface-dark)' }}>
                  <div style={{ display: 'flex', gap: 4, paddingTop: 8, marginBottom: 6 }}>
                    {PERIODS.map((p, i) => (
                      <button key={p.label} onClick={() => handlePeriod(i)}
                        style={{ fontSize: 10, fontWeight: period === i ? 700 : 500, padding: '2px 8px', borderRadius: 10,
                          border: `1.5px solid ${period === i ? '#1565C0' : 'var(--color-border)'}`,
                          background: period === i ? '#EBF2FB' : 'transparent',
                          color: period === i ? '#1565C0' : 'var(--color-text-light)', cursor: 'pointer' }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {sd?.chartData ? (
                    sd.chartData.length > 0
                      ? <RainfallBarChart data={sd.chartData} />
                      : <div style={{ fontSize: 12, color: 'var(--color-text-light)', textAlign: 'center', padding: '12px 0' }}>No data for this period</div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--color-text-light)', textAlign: 'center', padding: '12px 0' }}>Loading…</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function LeadNav({ activeTab, setActiveTab }) {
  const { initials } = useAuth();
  return (
    <nav className="bottom-tab-bar shrink-0">
      <div className="sidebar-brand">
        <span style={{ fontSize: '22px' }}>🛰</span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-navy)' }}>SAEON FDS</div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-light)' }}>Field Network</div>
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
      <div
        className="hidden"
        style={{ marginTop: 'auto', paddingTop: 16, display: 'none' }}
        data-xl-show="flex"
      >
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--color-navy)', color: 'white',
          fontSize: 13, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {initials ?? '??'}
        </div>
      </div>
    </nav>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function LeadDashboard() {
  const [activeTab, setActiveTab] = useState('visits');

  return (
    <div className="flex flex-col min-h-dvh app-layout">
      {activeTab === 'visits'   && <VisitOversight />}
      {activeTab === 'stations' && <StationRegistry />}
      {activeTab === 'rainfall' && <RainfallOverview />}
      {activeTab === 'users'    && <UserManagement />}
      <LeadNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
