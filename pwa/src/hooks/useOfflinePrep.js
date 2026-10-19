import { useEffect } from 'react';
import { refreshStationsForOffline } from '../services/stationCache.js';

// Keep the station list and each station's data saved on this device while signed in, whichever screen
// is open, and again whenever the connection returns.
export function useOfflinePrep(userId) {
  useEffect(() => {
    if (!userId) return undefined;
    refreshStationsForOffline();
    const refresh = () => { refreshStationsForOffline(); };
    window.addEventListener('online', refresh);
    window.addEventListener('fds-link-restored', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('fds-link-restored', refresh);
    };
  }, [userId]);
}
