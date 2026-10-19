// "New version available" — shown only when a new build is waiting. The service worker is not swapped
// automatically, so a technician is never switched to new code in the middle of a visit. Everything
// entered is stored on the device, so updating at a convenient moment loses nothing.
import { useRegisterSW } from 'virtual:pwa-register/react';

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Look for a new version hourly while the app stays open
      if (registration) setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      style={{
        position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 100,
        maxWidth: 520, margin: '0 auto',
        background: '#0D1B2E', color: '#fff', borderRadius: 12,
        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)', fontSize: 12,
      }}
    >
      <div style={{ flex: 1, lineHeight: 1.4 }}>
        A new version is ready.
      </div>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: '#fff', color: '#0D1B2E', border: 'none', borderRadius: 8,
          height: 32, padding: '0 12px', fontSize: 12, fontWeight: 700, flexShrink: 0,
        }}
      >
        Update
      </button>
    </div>
  );
}
