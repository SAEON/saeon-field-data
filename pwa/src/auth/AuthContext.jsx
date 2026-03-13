import { createContext, useContext, useEffect, useState } from 'react';
import keycloak from './keycloak';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (keycloak.authenticated) {
      setUser({
        name: keycloak.tokenParsed?.name,
        email: keycloak.tokenParsed?.email,
        roles: keycloak.tokenParsed?.realm_access?.roles ?? [],
        initials: deriveInitials(keycloak.tokenParsed?.name),
        token: keycloak.token,
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
