// Run a reload function when the device comes back online, so a list that failed with "Offline"
// fills itself in without the user having to leave and re-open the tab.
import { useEffect, useRef } from 'react';

export function useOnReconnect(reload) {
  const latest = useRef(reload);
  useEffect(() => { latest.current = reload; });

  useEffect(() => {
    let timer;
    const onOnline = () => {
      clearTimeout(timer);
      timer = setTimeout(() => latest.current?.(), 1000);   // let the connection settle first
    };
    window.addEventListener('online', onOnline);
    return () => { clearTimeout(timer); window.removeEventListener('online', onOnline); };
  }, []);
}
