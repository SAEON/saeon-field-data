import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { initSettingsFlow, submitPasswordChange } from './kratos.js';
import { acknowledgePasswordChange } from '../services/api.js';

// ── Dropdown ────────────────────────────────────────────────────────────────
function ChangePasswordSheet({ onClose }) {
  const { applySession } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return; }
    setError('');
    setLoading(true);
    try {
      const flow      = await initSettingsFlow();
      const csrfNode  = flow.ui?.nodes?.find(n => n.attributes?.name === 'csrf_token');
      const csrfToken = csrfNode?.attributes?.value ?? '';
      await submitPasswordChange(flow.id, csrfToken, password);
      await acknowledgePasswordChange().catch(() => {});
      await applySession();
      setDone(true);
    } catch (err) {
      const msg = err?.ui?.nodes?.find(n => n.messages?.length)?.messages?.[0]?.text
        ?? err?.message
        ?? 'Could not update password. Sign out and sign back in, then try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: '100%', height: 40, borderRadius: 8, border: '1.5px solid #CBD5E0',
    padding: '0 12px', fontSize: 13, background: '#F7F8FA', outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#4A5568', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' };

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2E', marginBottom: 12 }}>Change password</div>
      {done ? (
        <div style={{ padding: '12px 14px', background: '#F0FAF4', border: '1px solid rgba(39,174,96,0.3)', borderRadius: 10, fontSize: 13, color: '#1E7A44', fontWeight: 500 }}>
          ✓ Password updated successfully.
          <button onClick={onClose} style={{ display: 'block', marginTop: 10, background: 'none', border: 'none', color: '#1E7A44', fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 600 }}>Close</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>New password</label>
            <input type="password" required autoComplete="new-password" placeholder="Min 8 characters"
              value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Confirm password</label>
            <input type="password" required autoComplete="new-password" placeholder="Repeat new password"
              value={confirm} onChange={e => setConfirm(e.target.value)} style={inputStyle} />
          </div>
          {error && (
            <div style={{ marginBottom: 12, padding: '9px 12px', background: '#FFF5F5', border: '1px solid rgba(192,57,43,0.25)', borderRadius: 8, fontSize: 12, color: '#c0392b' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, height: 38, borderRadius: 8, border: '1.5px solid #CBD5E0', background: 'white', fontSize: 13, fontWeight: 600, color: '#4A5568', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              style={{ flex: 1, height: 38, borderRadius: 8, border: 'none', background: loading ? '#8A9BB0' : '#0D1B2E', color: 'white', fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Saving…' : 'Update'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ProfileDropdown({ onClose }) {
  const me = useAuth();
  const ref = useRef(null);
  const [showChangePassword, setShowChangePassword] = useState(false);

  useEffect(() => {
    function handlePointer(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('pointerdown', handlePointer);
    return () => document.removeEventListener('pointerdown', handlePointer);
  }, [onClose]);

  async function handleLogout() {
    await me.logout();
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
          {me?.full_name ?? me?.name ?? '…'}
        </div>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>
          {me?.role ? ROLE_LABELS[me.role] ?? me.role : '…'}
        </div>
        <div style={{ fontSize: 11, color: '#aaa' }}>
          ID #{me?.id ?? '…'}
        </div>
      </div>

      {/* Change password */}
      {!showChangePassword ? (
        <button
          onClick={() => setShowChangePassword(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '12px 16px',
            background: 'none', border: 'none', borderBottom: '1px solid #e4e6ea',
            textAlign: 'left', fontSize: 13, fontWeight: 600,
            color: '#4A5568', cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 14 }}>🔑</span>
          Change password
        </button>
      ) : (
        <div style={{ borderBottom: '1px solid #e4e6ea', paddingTop: 12 }}>
          <ChangePasswordSheet onClose={() => setShowChangePassword(false)} />
        </div>
      )}

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