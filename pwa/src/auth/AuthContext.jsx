import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { initLoginFlow, kratosLogout, submitLogin, checkSession } from './kratos.js';
import { loadCachedProfile, saveCachedProfile, clearCachedProfile } from './authCache.js';
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

  // Only a definitive "no session" signs the user out. If the server can't be reached (no signal, weak
  // link, captive portal, 5xx) the cached profile keeps the app usable and the check is repeated later.
  const applySession = useCallback(async ({ fromExpiry = false } = {}) => {
    const res = await checkSession();

    if (res.status === 'none') {
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
      }
      setIsReady(true);
      return;
    }

    setSessionExpired(false);
    setOfflineSession(false);
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
    setUnauthorizedHandler(() => applySession({ fromExpiry: true }));
    return () => setUnauthorizedHandler(null);
  }, [applySession]);

  // Re-check every 5 min, and as soon as connectivity returns, so server-side expiry is noticed
  // and an offline session is confirmed — without ever signing out on a mere network failure.
  useEffect(() => {
    if (!userFields) return undefined;
    const recheck = () => { applySession({ fromExpiry: true }); };
    const interval = setInterval(recheck, 5 * 60 * 1000);
    const onOnline = () => { if (offlineSession) recheck(); };
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [userFields, offlineSession, applySession]);

  const login = useCallback(async (email, password) => {
    const flow = await initLoginFlow();
    const csrfToken = flow.ui?.nodes?.find(n => n.attributes?.name === 'csrf_token')?.attributes?.value ?? '';
    await submitLogin(flow.id, csrfToken, email, password);
    setJustSignedOut(false);
    setSessionExpired(false);
    await applySession();
  }, [applySession]);

  const logout = useCallback(async () => {
    await kratosLogout().catch(() => {});
    await clearCachedProfile();
    await clearRefCache();
    setOfflineSession(false);
    setUserFields(null);
    setJustSignedOut(true);
  }, []);

  const hasRole = useCallback((minimumRole) => {
    const userLevel = ROLE_HIERARCHY[userFields?.role] ?? 0;
    return userLevel >= (ROLE_HIERARCHY[minimumRole] ?? 99);
  }, [userFields]);

  return (
    <AuthContext.Provider value={{ isReady, login, logout, hasRole, justSignedOut, sessionExpired, offlineSession, applySession, ...(userFields ?? {}) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

function deriveInitials(name) {
  if (!name) return '??';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}
