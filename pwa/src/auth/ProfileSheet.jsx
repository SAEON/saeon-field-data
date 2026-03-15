import { useEffect, useRef, useState } from 'react';
import keycloak from './keycloak.js';
import { useAuth } from './AuthContext.jsx';
import { getMe } from '../services/api.js';

// ── Dropdown ────────────────────────────────────────────────────────────────
function ProfileDropdown({ onClose }) {
  const [me, setMe] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    getMe().then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    function handlePointer(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('pointerdown', handlePointer);
    return () => document.removeEventListener('pointerdown', handlePointer);
  }, [onClose]);

  function handleLogout() {
    keycloak.logout({ redirectUri: window.location.origin + '/fds' });
  }

  const ROLE_LABELS = {
    technician: 'Technician',
    technician_lead: 'Lead Technician',
    data_manager: 'Data Manager',
  };

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 6,
        background: '#f7f8fa',
        borderRadius: 12,
        boxShadow: '0 6px 24px rgba(0,0,0,0.13)',
        border: '1px solid #e4e6ea',
        minWidth: 220,
        zIndex: 200,
        overflow: 'hidden',
      }}
    >
      {/* Identity block */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #e4e6ea' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 3 }}>
          {me?.full_name ?? '…'}
        </div>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>
          {me?.role ? ROLE_LABELS[me.role] ?? me.role : '…'}
        </div>
        <div style={{ fontSize: 11, color: '#aaa' }}>
          Technician #{me?.id ?? '…'}
        </div>
      </div>

      {/* Sign out */}
      <button
        onClick={handleLogout}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '12px 16px',
          background: 'none', border: 'none',
          textAlign: 'left', fontSize: 13, fontWeight: 600,
          color: '#c0392b', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 15 }}>⏻</span>
        Sign out
      </button>
    </div>
  );
}

// ── Shared trigger button — use this in every AppBar ───────────────────────
export default function ProfileButton() {
  const auth = useAuth();
  const initials = auth?.initials ?? '??';
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Account"
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          height: 34, borderRadius: 20,
          background: 'rgba(255,255,255,0.18)',
          border: '1.5px solid rgba(255,255,255,0.35)',
          color: 'white', padding: '0 10px 0 10px',
          cursor: 'pointer', fontSize: 12, fontWeight: 700,
          letterSpacing: '0.03em',
        }}
      >
        {initials}
        <span style={{ fontSize: 8, opacity: 0.75, marginLeft: 1 }}>▾</span>
      </button>
      {open && <ProfileDropdown onClose={() => setOpen(false)} />}
    </div>
  );
}
