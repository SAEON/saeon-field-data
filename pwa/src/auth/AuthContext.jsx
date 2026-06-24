import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { initLoginFlow, kratosLogout, submitLogin, whoami } from './kratos.js';
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

  const applySession = useCallback(async () => {
    const session = await whoami();
    if (!session) {
      setUserFields(null);
      setIsReady(true);
      return;
    }
    const traits = session.identity.traits;
    const me = await getMe().catch(() => null);
    setUserFields({
      name:                    traits.name,
      email:                   traits.email,
      full_name:               me?.full_name  ?? traits.name,
      id:                      me?.id         ?? null,
      role:                    me?.role       ?? null,
      roles:                   me?.role       ? [me.role] : [],
      initials:                deriveInitials(traits.name),
      department:              me?.department ?? null,
      password_change_required: me?.password_change_required ?? false,
    });
    setIsReady(true);
  }, []);

  // On mount: check if a Kratos session cookie exists
  useEffect(() => {
    applySession();
  }, [applySession]);

  // Register 401 interceptor — any API call returning 401 triggers immediate session refresh
  useEffect(() => {
    setUnauthorizedHandler(applySession);
    return () => setUnauthorizedHandler(null);
  }, [applySession]);

  // Poll whoami every 5 min to detect server-side session expiry
  useEffect(() => {
    if (!userFields) return;
    const id = setInterval(async () => {
      const session = await whoami();
      if (!session) setUserFields(null);
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [userFields]);

  const login = useCallback(async (email, password) => {
    const flow = await initLoginFlow();
    const csrfNode = flow.ui?.nodes?.find(n => n.attributes?.name === 'csrf_token');
    const csrfToken = csrfNode?.attributes?.value ?? '';
    await submitLogin(flow.id, csrfToken, email, password);
    setJustSignedOut(false);
    await applySession();
  }, [applySession]);

  const logout = useCallback(async () => {
    await kratosLogout().catch(() => {});
    setUserFields(null);
    setJustSignedOut(true);
  }, []);

  const hasRole = useCallback((minimumRole) => {
    const userLevel = ROLE_HIERARCHY[userFields?.role] ?? 0;
    return userLevel >= (ROLE_HIERARCHY[minimumRole] ?? 99);
  }, [userFields]);

  return (
    <AuthContext.Provider value={{ isReady, login, logout, hasRole, justSignedOut, applySession, ...(userFields ?? {}) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

function deriveInitials(name) {
  if (!name) return '??';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}
