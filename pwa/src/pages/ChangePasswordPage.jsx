import { useState } from 'react';
import { initSettingsFlow, submitPasswordChange } from '../auth/kratos.js';
import { acknowledgePasswordChange } from '../services/api.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function ChangePasswordPage() {
  const { applySession, logout, full_name } = useAuth();
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

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
      await acknowledgePasswordChange();
      await applySession();
    } catch (err) {
      const msg = err?.ui?.nodes?.find(n => n.messages?.length)?.messages?.[0]?.text
        ?? err?.message
        ?? 'Could not update password. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#F4F6F8', padding: '40px 24px',
    }}>
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 48, height: 48, borderRadius: 12, background: '#0D1B2E', marginBottom: 14,
        }}>
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            <circle cx="12" cy="16" r="1.5" fill="white" stroke="none" />
          </svg>
        </div>
        <div style={{ fontSize: 19, fontWeight: 800, color: '#0D1B2E' }}>Set your password</div>
        <div style={{ fontSize: 12, color: '#8A9BB0', marginTop: 6, maxWidth: 300 }}>
          Welcome{full_name ? `, ${full_name.split(' ')[0]}` : ''}. Please choose a personal password before continuing.
        </div>
      </div>

      <div style={{
        width: '100%', maxWidth: 400, background: '#fff',
        borderRadius: 16, boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
        border: '1px solid #E4E6EA', padding: '32px 28px',
      }}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#4A5568', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              New password
            </label>
            <input
              type="password" required autoComplete="new-password"
              placeholder="Min 8 characters"
              value={password} onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', height: 44, borderRadius: 10, border: '1.5px solid #CBD5E0', padding: '0 13px', fontSize: 14, color: '#1A1A2E', background: '#F7F8FA', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: 22 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#4A5568', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Confirm password
            </label>
            <input
              type="password" required autoComplete="new-password"
              placeholder="Repeat your new password"
              value={confirm} onChange={e => setConfirm(e.target.value)}
              style={{ width: '100%', height: 44, borderRadius: 10, border: '1.5px solid #CBD5E0', padding: '0 13px', fontSize: 14, color: '#1A1A2E', background: '#F7F8FA', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {error && (
            <div style={{ marginBottom: 18, padding: '10px 13px', background: '#FFF5F5', border: '1px solid rgba(192,57,43,0.25)', borderRadius: 8, fontSize: 13, color: '#c0392b' }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', height: 46, borderRadius: 10,
              background: loading ? '#8A9BB0' : '#0D1B2E',
              border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Saving…' : 'Set password'}
          </button>
        </form>
      </div>

      <button
        onClick={logout}
        style={{ marginTop: 20, background: 'none', border: 'none', fontSize: 12, color: '#A0AEC0', cursor: 'pointer' }}
      >
        Sign out
      </button>
    </div>
  );
}
