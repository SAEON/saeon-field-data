import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

// Shown when the server says the session has ended while this device still holds an open visit or unsent
// changes. It never replaces the screen: the technician keeps working and signs in when they have signal;
// everything saved on the device then syncs.
export default function ReauthPrompt() {
  const { needsReauth, login, email: knownEmail } = useAuth();
  const [open,     setOpen]     = useState(false);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [noSignal, setNoSignal] = useState(!navigator.onLine);

  useEffect(() => { if (knownEmail && !email) setEmail(knownEmail); }, [knownEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const on  = () => setNoSignal(false);
    const off = () => setNoSignal(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => { if (!needsReauth) { setOpen(false); setPassword(''); setError(''); } }, [needsReauth]);

  if (!needsReauth) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!navigator.onLine) { setNoSignal(true); return; }
    setNoSignal(false);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      const kratosCode = err?.ui?.messages?.[0]?.id;
      if (kratosCode === 4000006) setError('Invalid email or password.');
      else if (err instanceof TypeError || err?.message === 'Could not initiate login flow') setNoSignal(true);
      else setError('Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 90,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        padding: '8px 12px', background: 'var(--color-surface-dark)', borderBottom: '1px solid var(--color-border)',
        fontSize: 12, color: 'var(--color-text-dark)',
      }}>
        <span>Signed out — your work is saved on this device. Sign in to sync it.</span>
        <button onClick={() => setOpen(true)}
          style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--color-navy)', color: 'white', whiteSpace: 'nowrap' }}>
          Sign in
        </button>
      </div>

      {open && (
        <div className="back-sheet-overlay" style={{ zIndex: 110 }} onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="back-sheet">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[13px] font-bold text-text-dark">Sign in</div>
              <button onClick={() => setOpen(false)} aria-label="Close"
                className="border-none bg-transparent text-text-light" style={{ fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            <div className="text-[12px] text-text-light mb-3">
              Your open visit and everything saved on this device stay as they are.
              {noSignal && ' No signal right now — sign in when you have coverage.'}
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
              <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email address" className="field-input w-full" style={{ height: 40 }} />
              <input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Password" className="field-input w-full" style={{ height: 40 }} />
              {error && <div className="text-[12px] text-error">{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full h-10 rounded-xl text-white text-[12px] font-semibold border-none"
                style={{ background: loading ? '#8A9BB0' : 'var(--color-navy)', fontSize: 12 }}>
                {loading ? 'Signing in…' : noSignal ? 'Try again' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
