import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';


export default function LoginPage() {
  const { login, justSignedOut } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      const msg = err?.ui?.messages?.[0]?.text
        ?? err?.message
        ?? 'Invalid email or password.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      background: '#F4F6F8',
    }}>

      {/* ── Left brand panel (hidden on narrow screens) ────────────────── */}
      <div style={{
        display: 'none',
        width: 380,
        flexShrink: 0,
        background: '#0D1B2E',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 40px',
      }}
        className="login-brand-panel"
      >
        {/* Wordmark */}
        <div>
          <div style={{ marginBottom: 24 }}>
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="SAEON FDS" style={{ width: 44, height: 44, objectFit: 'contain', display: 'block' }} />
          </div>
          <div style={{ color: 'white', fontSize: 22, fontWeight: 800, lineHeight: 1.2, marginBottom: 8 }}>
            Field Data System
          </div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 1.6 }}>
            South African Environmental<br />Observation Network
          </div>
        </div>

        {/* Bottom tagline */}
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>
          © {new Date().getFullYear()} SAEON
        </div>
      </div>

      {/* ── Right form panel ────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}>

        {/* Mobile-only header */}
        <div style={{ marginBottom: 32, textAlign: 'center' }} className="login-mobile-header">
          <div style={{ marginBottom: 14 }}>
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="SAEON FDS" style={{ width: 48, height: 48, objectFit: 'contain', display: 'block' }} />
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: '#0D1B2E' }}>
            Field Data System
          </div>
          <div style={{ fontSize: 12, color: '#8A9BB0', marginTop: 4 }}>
            South African Environmental Observation Network
          </div>
        </div>

        {/* Signed-out confirmation */}
        {justSignedOut && (
          <div style={{
            width: '100%', maxWidth: 400,
            marginBottom: 16,
            padding: '12px 16px',
            background: '#F0FAF4',
            border: '1px solid rgba(39,174,96,0.3)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 15, color: '#27AE60' }}>✓</span>
            <span style={{ fontSize: 13, color: '#1E7A44', fontWeight: 500 }}>
              You've been signed out successfully.
            </span>
          </div>
        )}

        {/* Form card */}
        <div style={{
          width: '100%', maxWidth: 400,
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
          border: '1px solid #E4E6EA',
          padding: '32px 28px',
        }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#0D1B2E', marginBottom: 24 }}>
            Sign in
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#4A5568', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Email address
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{
                  width: '100%', height: 44, borderRadius: 10,
                  border: '1.5px solid #CBD5E0', padding: '0 13px',
                  fontSize: 14, color: '#1A1A2E', background: '#F7F8FA',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#4A5568', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{
                  width: '100%', height: 44, borderRadius: 10,
                  border: '1.5px solid #CBD5E0', padding: '0 13px',
                  fontSize: 14, color: '#1A1A2E', background: '#F7F8FA',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {error && (
              <div style={{
                marginBottom: 18, padding: '10px 13px',
                background: '#FFF5F5',
                border: '1px solid rgba(192,57,43,0.25)',
                borderRadius: 8, fontSize: 13, color: '#c0392b',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', height: 46, borderRadius: 10,
                background: loading ? '#8A9BB0' : '#0D1B2E',
                border: 'none', color: '#fff',
                fontSize: 14, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                letterSpacing: '0.02em',
                transition: 'background 0.15s',
              }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <div style={{ marginTop: 20, fontSize: 12, color: '#A0AEC0', textAlign: 'center' }}>
          Don't have access? Contact your team lead.
        </div>
      </div>

      {/* Inline CSS for responsive brand panel */}
      <style>{`
        @media (min-width: 720px) {
          .login-brand-panel { display: flex !important; }
          .login-mobile-header { display: none !important; }
        }
      `}</style>
    </div>
  );
}
