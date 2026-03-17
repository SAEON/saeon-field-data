import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import keycloak from './auth/keycloak'
import { AuthProvider } from './auth/AuthContext.jsx'

keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false })
  .then(authenticated => {
    if (!authenticated) {
      keycloak.login();
      return;
    }
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <AuthProvider>
          <App />
        </AuthProvider>
      </StrictMode>,
    );
  });
