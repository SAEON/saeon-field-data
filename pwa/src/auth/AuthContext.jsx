import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { initLoginFlow, kratosLogout, submitLogin, checkSession } from './kratos.js';
import { loadCachedProfile, saveCachedProfile, clearCachedProfile, hasUnsentWork } from './authCache.js';
import { resumeAfterAuth } from '../services/outbox.js';
import { requestPersistentStorage } from '../utils/persistStorage.js';
import { clearRefCache } from '../services/refCache.js';
import { getMe, setUnauthorizedHandler } from '../services/api.js';

const ROLE_HIERARCHY = {
  technician:      1,
  technician_lead: 2,
  data_manager:    3,
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [userFields,    setUserFields]    = useState(null);
  const [isReady,       setIsReady]       = useState(false);
  const [justSignedOut, setJustSignedOut] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  // True while the signed-in user is running on the cached profile because the server can't be reached
  const [offlineSession, setOfflineSession] = useState(false);
  // The server says the session has ended, but this device holds an open visit or unsent changes. The user
  // stays in the app (nothing is taken away) and is asked to sign in again without losing their place.
  const [needsReauth, setNeedsReauth] = useState(false);
  const userRef        = useRef(null);
  const needsReauthRef = useRef(false);
  const lastCheckRef   = useRef(0);
  useEffect(() => { userRef.current = userFields; }, [userFields]);
  useEffect(() => { needsReauthRef.current = needsReauth; }, [needsReauth]);

  // Only a definitive "no session" signs the user out. If the server can't be reached (no signal, weak
  // link, captive portal, 5xx) the cached profile keeps the app usable and the check is repeated later.
  const applySession = useCallback(async ({ fromExpiry = false } = {}) => {
    const res = await checkSession();

    if (res.status === 'none') {
      // Keep the user in the app when unsent work exists; only a clean device goes back to the login page
      const current = userRef.current ?? await loadCachedProfile();
      if (current && await hasUnsentWork(current.id)) {
        setUserFields(prev => prev ?? current);
        setSessionExpired(true);
        setNeedsReauth(true);
        setOfflineSession(false);
        setIsReady(true);
        return;
      }
      if (fromExpiry) setSessionExpired(true);
      setOfflineSession(false);
      setUserFields(null);
      await clearCachedProfile();
      setIsReady(true);
      return;
    }

    if (res.status === 'unreachable') {
      const cached = await loadCachedProfile();
      if (cached) {
        setUserFields(prev => prev ?? cached);
        setOfflineSession(true);
        // The last session expiry the server gave us has passed: say so now, instead of at the next connection
        const known = userRef.current?.sessionExpiresAt ?? cached.sessionExpiresAt;
        if (known && Date.parse(known) < Date.now()) setNeedsReauth(true);
      }
      setIsReady(true);
      return;
    }

    setSessionExpired(false);
    setNeedsReauth(false);
    setOfflineSession(false);
    resumeAfterAuth();
    const traits = res.session.identity.traits;
    const me = await getMe().catch(() => null);
    const cached = me ? null : await loadCachedProfile();

    const profile = {
      name:                    traits.name,
      email:                   traits.email,
      full_name:               me?.full_name  ?? cached?.full_name ?? traits.name,
      id:                      me?.id         ?? cached?.id         ?? null,
      role:                    me?.role       ?? cached?.role       ?? null,
      roles:                   (me?.role ?? cached?.role) ? [me?.role ?? cached?.role] : [],
      initials:                deriveInitials(traits.name),
      department:              me?.department ?? cached?.department ?? null,
      password_change_required: me?.password_change_required ?? cached?.password_change_required ?? false,
      sessionExpiresAt:        res.session.expires_at ?? null,
    };
    setUserFields(profile);
    if (profile.id != null) saveCachedProfile(profile);
    setIsReady(true);
  }, []);

  // On mount: check if a Kratos session cookie exists
  useEffect(() => {
    applySession();
  }, [applySession]);

  // Register 401 interceptor — any API call returning 401 triggers an immediate session re-check
  useEffect(() => {
    setUnauthorizedHandler(() => { if (!needsReauthRef.current) applySession({ fromExpiry: true }); });
    return () => setUnauthorizedHandler(null);
  }, [applySession]);

  // Re-check every 5 min, whenever connectivity returns and whenever the app comes back to the foreground,
  // so a session is renewed on every visit with signal and a server-side expiry is noticed promptly —
  // without ever signing out on a mere network failure.
  useEffect(() => {
    if (!userFields) return undefined;
    const recheck = () => { lastCheckRef.current = Date.now(); applySession({ fromExpiry: true }); };   // also lifts a reauth state once the session is valid again
    const interval = setInterval(recheck, 5 * 60 * 1000);
    const onOnline  = () => recheck();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheckRef.current > 60 * 1000) recheck();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('fds-link-restored', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('fds-link-restored', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userFields, applySession]);

  // Ask the browser not to clear this device's saved work, once someone is signed in
  const signedInId = userFields?.id;
  useEffect(() => { if (signedInId != null) requestPersistentStorage(); }, [signedInId]);

  const login = useCallback(async (email, password) => {
    const flow = await initLoginFlow();
    const csrfToken = flow.ui?.nodes?.find(n => n.attributes?.name === 'csrf_token')?.attributes?.value ?? '';
    await submitLogin(flow.id, csrfToken, email, password);
    setJustSignedOut(false);
    setSessionExpired(false);
    setNeedsReauth(false);
    await applySession();
  }, [applySession]);

  const logout = useCallback(async () => {
    await kratosLogout().catch(() => {});
    await clearCachedProfile();
    await clearRefCache();
    setOfflineSession(false);
    setNeedsReauth(false);
    setUserFields(null);
    setJustSignedOut(true);
  }, []);

  const hasRole = useCallback((minimumRole) => {
    const userLevel = ROLE_HIERARCHY[userFields?.role] ?? 0;
    return userLevel >= (ROLE_HIERARCHY[minimumRole] ?? 99);
  }, [userFields]);

  return (
    <AuthContext.Provider value={{ isReady, login, logout, hasRole, justSignedOut, sessionExpired, offlineSession, needsReauth, applySession, ...(userFields ?? {}) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

function deriveInitials(name) {
  if (!name) return '??';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}
