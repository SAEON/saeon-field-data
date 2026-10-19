// Runs the outbox flush for the whole app (not tied to any one screen):
// on start, when connectivity returns, when the app comes back to the foreground,
// and every 30 s while anything is waiting.
import { useEffect, useState } from 'react';
import { setOutboxUser, flushOutbox, subscribeOutbox, getOutboxState, onOpEvent } from '../services/outbox.js';
import { showNotice } from '../services/notice.js';

export function useSyncEngine(userId) {
  useEffect(() => {
    setOutboxUser(userId);
    if (!userId) return undefined;

    const kick = () => { flushOutbox(); };
    kick();

    // A submitted visit finishes in the background, so say when it lands or is refused
    const stopEvents = onOpEvent(({ phase, op, error }) => {
      if (op.type !== 'submit') return;
      if (phase === 'synced') showNotice('Your queued visit has been submitted.');
      if (phase === 'failed') showNotice(`A queued visit could not be submitted: ${error || 'rejected by the server'}. Open the Queue tab.`, { ms: 12000 });
    });

    let onlineTimer;
    const onOnline = () => {
      clearTimeout(onlineTimer);
      onlineTimer = setTimeout(() => flushOutbox({ force: true }), 1500);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') kick(); };

    window.addEventListener('online', onOnline);
    window.addEventListener('fds-link-restored', onOnline);   // the connection held up again after a weak spell
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(kick, 30000);

    return () => {
      stopEvents();
      clearTimeout(onlineTimer);
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('fds-link-restored', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);
}

// { queued, failed, syncing, lastSyncedAt } — live
export function useOutboxStatus() {
  const [state, setState] = useState({ queued: 0, failed: 0, syncing: false, lastSyncedAt: null });
  useEffect(() => {
    let alive = true;
    getOutboxState().then(s => { if (alive) setState(s); });
    const unsub = subscribeOutbox(s => { if (alive) setState(s); });
    return () => { alive = false; unsub(); };
  }, []);
  return state;
}
