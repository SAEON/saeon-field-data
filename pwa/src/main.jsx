import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import UpdatePrompt from './components/UpdatePrompt.jsx'
import Notice from './components/Notice.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
      <UpdatePrompt />
      <Notice />
    </AuthProvider>
  </StrictMode>,
);
