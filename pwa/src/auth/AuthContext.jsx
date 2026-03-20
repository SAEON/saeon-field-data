import { createContext, useContext, useEffect, useState } from 'react';
import keycloak from './keycloak';
import { getMe } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (keycloak.authenticated) {
      // Roles come from FDS DB, not Keycloak JWT
      getMe().then(me => {
        setUser({
          name: keycloak.tokenParsed?.name,
          email: keycloak.tokenParsed?.email,
          roles: me?.role ? [me.role] : [],
          initials: deriveInitials(keycloak.tokenParsed?.name),
          token: keycloak.token,
          full_name: me?.full_name ?? null,
          id: me?.id ?? null,
          role: me?.role ?? null,
        });
      }).catch(() => {
        // API unreachable — set user with no roles (technician fallback)
        setUser({
          name: keycloak.tokenParsed?.name,
          email: keycloak.tokenParsed?.email,
          roles: [],
          initials: deriveInitials(keycloak.tokenParsed?.name),
          token: keycloak.token,
          full_name: null,
          id: null,
          role: null,
        });
      });
    }

    // Auto-refresh token 60s before expiry, checked every 30s
    const interval = setInterval(() => {
      keycloak.updateToken(60).catch(() => keycloak.logout());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

function deriveInitials(name) {
  if (!name) return '??';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}
