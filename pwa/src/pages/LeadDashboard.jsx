import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { getStations, getStationRainfall, processStationRainfall } from '../services/api.js';
import VisitOversight  from './VisitOversight.jsx';
import StationRegistry from './StationRegistry.jsx';
import UserManagement  from './UserManagement.jsx';

const TABS = [
  { id: 'visits',   label: 'Visits',   icon: '☑' },
  { id: 'stations', label: 'Stations', icon: '◉' },
  { id: 'rainfall', label: 'Rainfall', icon: '~' },
  { id: 'users',    label: 'Users',    icon: '◎' },
];

// ── SVG bar chart ─────────────────────────────────────────────────────────────

function RainfallBarChart({ data }) {
  if (!data.length) return null;
  const maxMm  = Math.max(...data.map(r => parseFloat(r.rain_mm)), 1);
  const W = 400, H = 80, barArea = 62;
  const gap  = W / data.length;
  const barW = Math.max(Math.min(gap - 1, 7), 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {data.map((r, i) => {
        const mm       = parseFloat(r.rain_mm);
        const h        = (mm / maxMm) * barArea;
        const x        = i * gap + gap / 2 - barW / 2;
        const y        = barArea - h;
        const d        = new Date(r.period_start);
        const showLabel = d.getDay() === 1;
        return (
          <g key={r.period_start}>
            {mm > 0 && (
              <rect x={x} y={y} width={barW} height={h}
                fill={r.has_anomaly ? '#F59E0B' : '#3B7DD8'} rx={1} />
            )}
            {showLabel && (
              <text x={x + barW / 2} y={H - 2}
                fontSize="7" fill="#9CA3AF" textAnchor="middle">
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

function RainfallOverview() {
  const [stations,    setStations]    = useState([]);
  const [stationData, setStationData] = useState({});
  const [expanded,    setExpanded]    = useState(null);
  const [reprocessing, setReprocessing] = useState(null);

  const thirtyDaysAgo  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo  = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  useEffect(() => {
    getStations()
      .then(all => {
        const rf = (all || []).filter(s => s.data_family === 'rainfall');
        setStations(rf);
        Promise.all(rf.map(s =>
          getStationRainfall(s.id, { resolution: 'daily', from: thirtyDaysAgo })
            .then(res => ({ id: s.id, data: res.data || [] }))
            .catch(() => ({ id: s.id, data: [] }))
        )).then(results => {
          const map = {};
          for (const { id, data } of results) {
            map[id] = {
              totalMm:      data.reduce((sum, r) => sum + parseFloat(r.rain_mm || 0), 0),
              anomalyCount: data.filter(r => r.has_anomaly).length,
            };
          }
          setStationData(map);
        });
      })
      .catch(() => {});
  }, []);

  function handleExpand(stationId) {
    if (expanded === stationId) { setExpanded(null); return; }
    setExpanded(stationId);
    if (!stationData[stationId]?.data90) {
      getStationRainfall(stationId, { resolution: 'daily', from: ninetyDaysAgo })
        .then(res => setStationData(prev => ({
          ...prev,
          [stationId]: { ...prev[stationId], data90: res.data || [] },
        })))
        .catch(() => {});
    }
  }

  function handleReprocess(stationId) {
    setReprocessing(stationId);
    processStationRainfall(stationId).finally(() => setReprocessing(null));
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--color-border)', background: 'white' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-navy)' }}>Rainfall</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 2 }}>
          Processed data · last 30 days
        </div>
      </div>

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
            <div key={s.id} style={{ background: 'white', borderRadius: 12, border: '1.5px solid var(--color-border)', marginBottom: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                <button
                  onClick={() => handleExpand(s.id)}
                  style={{ flex: 1, background: 'transparent', border: 'none', textAlign: 'left', padding: 0, cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-dark)' }}>{s.display_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 2 }}>
                    {sd
                      ? <>{sd.totalMm.toFixed(1)} mm · {sd.anomalyCount} anomal{sd.anomalyCount === 1 ? 'y' : 'ies'}</>
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
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: 10, marginBottom: 8 }}>
                    Last 90 days · daily
                  </div>
                  {sd?.data90 ? (
                    sd.data90.length > 0
                      ? <RainfallBarChart data={sd.data90} />
                      : <div style={{ fontSize: 12, color: 'var(--color-text-light)', textAlign: 'center', padding: '12px 0' }}>No processed data</div>
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
