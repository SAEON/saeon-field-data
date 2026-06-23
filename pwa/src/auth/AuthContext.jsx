import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { initLoginFlow, kratosLogout, submitLogin, whoami } from './kratos.js';
import { getMe } from '../services/api.js';

const STORAGE_KEY = 'kratos_session';

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

  // Validate a token, fetch FDS profile, populate state.
  // Token must already be in localStorage before calling so getMe() can attach it.
  const applySession = useCallback(async (token) => {
    const session = await whoami(token);
    if (!session) {
      localStorage.removeItem(STORAGE_KEY);
      setUserFields(null);
      setIsReady(true);
      return;
    }
    const traits = session.identity.traits;
    const me = await getMe().catch(() => null);
    setUserFields({
      name:       traits.name,
      email:      traits.email,
      full_name:  me?.full_name  ?? traits.name,
      id:         me?.id         ?? null,
      role:       me?.role       ?? null,
      roles:      me?.role       ? [me.role] : [],
      initials:   deriveInitials(traits.name),
      department: me?.department ?? null,
    });
    setIsReady(true);
  }, []);

  // On mount: restore session from localStorage
  useEffect(() => {
    const token = localStorage.getItem(STORAGE_KEY);
    if (token) {
      applySession(token);
    } else {
      setIsReady(true);
    }
  }, [applySession]);

  // Poll whoami every 5 min to detect server-side session expiry
  useEffect(() => {
    if (!userFields) return;
    const id = setInterval(async () => {
      const token = localStorage.getItem(STORAGE_KEY);
      if (!token) return;
      const session = await whoami(token);
      if (!session) {
        localStorage.removeItem(STORAGE_KEY);
        setUserFields(null);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [userFields]);

  const login = useCallback(async (email, password) => {
    const { id: flowId } = await initLoginFlow();
    const result = await submitLogin(flowId, email, password);
    const token = result.session_token;
    localStorage.setItem(STORAGE_KEY, token);
    setJustSignedOut(false);
    await applySession(token);
  }, [applySession]);

  const logout = useCallback(async () => {
    const token = localStorage.getItem(STORAGE_KEY);
    if (token) await kratosLogout(token).catch(() => {});
    localStorage.removeItem(STORAGE_KEY);
    setUserFields(null);
    setJustSignedOut(true);
  }, []);

  const hasRole = useCallback((minimumRole) => {
    const userLevel = ROLE_HIERARCHY[userFields?.role] ?? 0;
    return userLevel >= (ROLE_HIERARCHY[minimumRole] ?? 99);
  }, [userFields]);

  return (
    <AuthContext.Provider value={{ isReady, login, logout, hasRole, justSignedOut, ...(userFields ?? {}) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

function deriveInitials(name) {
  if (!name) return '??';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}
