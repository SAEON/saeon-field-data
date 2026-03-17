import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import VisitOversight   from './VisitOversight.jsx';
import StationRegistry  from './StationRegistry.jsx';
import UserManagement   from './UserManagement.jsx';

const TABS = [
  { id: 'visits',   label: 'Visits',   icon: '☑' },
  { id: 'stations', label: 'Stations', icon: '◉' },
  { id: 'users',    label: 'Users',    icon: '◎' },
];

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

export default function LeadDashboard() {
  const [activeTab, setActiveTab] = useState('visits');

  return (
    <div className="flex flex-col min-h-dvh app-layout">
      {activeTab === 'visits'   && <VisitOversight />}
      {activeTab === 'stations' && <StationRegistry />}
      {activeTab === 'users'    && <UserManagement />}
      <LeadNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
