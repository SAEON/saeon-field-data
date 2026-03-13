import { useEffect, useRef, useState } from 'react';
import keycloak from './keycloak.js';
import { getMe } from '../services/api.js';

export default function ProfileDropdown({ onClose }) {
  const [me, setMe] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    getMe().then(setMe).catch(() => {});
  }, []);

  // Close on click outside
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

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 6,
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 6px 24px rgba(0,0,0,0.13)',
        border: '1px solid var(--color-border)',
        minWidth: 210,
        zIndex: 200,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-dark)', marginBottom: 2 }}>
          {me?.full_name ?? '…'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
          ID #{me?.id ?? '…'}
        </div>
      </div>

      <button
        onClick={handleLogout}
        style={{
          display: 'block', width: '100%',
          padding: '11px 16px',
          background: 'none', border: 'none',
          textAlign: 'left', fontSize: 13, fontWeight: 600,
          color: 'var(--color-error)', cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </div>
  );
}
