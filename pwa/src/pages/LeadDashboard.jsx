import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import ProfileButton from '../auth/ProfileSheet.jsx';
import { getStations, getStationRainfallSummary } from '../services/api.js';
import RainfallDataTable from '../components/RainfallDataTable.jsx';
import VisitOversight  from './VisitOversight.jsx';
import StationRegistry from './StationRegistry.jsx';
import UserManagement  from './UserManagement.jsx';
import { FieldApp } from '../App.jsx';

const TABS = [
  { id: 'visits',   label: 'Visits',   icon: '☑' },
  { id: 'stations', label: 'Stations', icon: '◉' },
  { id: 'rainfall', label: 'Rainfall', icon: '≀' },
  { id: 'users',    label: 'Users',    icon: '◎' },
  { id: 'field',    label: 'Field',    icon: '⊕' },
];

// ── Rainfall overview tab ─────────────────────────────────────────────────────

function RainfallOverview() {
  const [stations,    setStations]    = useState([]);
  const [stationData, setStationData] = useState({});
  const [expanded,    setExpanded]    = useState(null);

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
    setExpanded(prev => prev === stationId ? null : stationId);
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
                          const sum = sd.summary;
                          const flagged = (sum.double_tip_count || 0) + (sum.interfere_count || 0) + (sum.pseudo_event_count || 0);
                          return <>{parseFloat(sum.total_mm || 0).toFixed(1)} mm · {flagged > 0 ? <span style={{ color: '#E65100' }}>{flagged} flagged tip{flagged !== 1 ? 's' : ''}</span> : '0 flagged tips'}</>;
                        })()
                      : 'Loading…'}
                  </div>
                </button>
                <span
                  onClick={() => handleExpand(s.id)}
                  style={{ fontSize: 18, color: 'var(--color-border)', cursor: 'pointer', display: 'inline-block', transition: 'transform 0.2s', transform: isExp ? 'rotate(90deg)' : 'none' }}
                >›</span>
              </div>

              {isExp && (
                <div style={{ borderTop: '1px solid var(--color-surface-dark)' }}>
                  <RainfallDataTable stationId={s.id} canReprocess={true} />
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
      {activeTab === 'field'    && <FieldApp embedded={true} />}
      <LeadNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
