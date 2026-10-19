// SyncQueue — everything this user has saved on the device that has not yet reached the server,
// across all visits: queued readings, notes, calibration checks, files and submits.
// Syncing itself is automatic (services/outbox.js); this page just shows it and lets a person intervene.
import { isLocalVisit } from '../utils/visitId.js';
import { useEffect, useState } from 'react';
import ProfileButton from '../auth/ProfileSheet.jsx';
import { getOps, subscribeOutbox, flushOutbox, retryOp, retryAllFailed, discardOp } from '../services/outbox.js';
import { useOutboxStatus } from '../hooks/useSyncEngine.js';
import { getVisit } from '../services/api.js';
import { opLabel, opDetail } from '../utils/queueLabels.js';

// Today: "09:25". Any other day: "15 Oct, 09:25".
function formatSynced(d) {
  const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}, ${time}`;
}

const btn = {
  fontSize: 12, height: 32, padding: '0 12px', borderRadius: 8, lineHeight: 1, fontWeight: 600,
  background: 'white', color: '#374151', border: '1px solid var(--color-border)', cursor: 'pointer',
};

export default function SyncQueue() {
  const status = useOutboxStatus();
  const [ops,    setOps]    = useState([]);
  const [visits, setVisits] = useState({});   // visit id → station name
  const [open,   setOpen]   = useState({});   // visit id → expanded? (unset: open only while something failed)

  useEffect(() => {
    let alive = true;
    const load = () => { getOps().then(o => { if (alive) setOps(o); }); };
    load();
    const unsubscribe = subscribeOutbox(load);
    return () => { alive = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    const missing = [...new Set(ops.map(o => o.visit_id))].filter(id => id != null && !(id in visits));
    missing.forEach(id => {
      if (isLocalVisit(id)) {   // not on the server yet: take the name from the queued create
        const create = ops.find(o => o.visit_id === id && o.type === 'visit_create');
        setVisits(prev => ({ ...prev, [id]: create?.payload?.station_name ? `${create.payload.station_name} (new visit)` : 'New visit' }));
        return;
      }
      getVisit(id)
        .then(v => setVisits(prev => ({ ...prev, [id]: v.station_display_name })))
        .catch(() => setVisits(prev => ({ ...prev, [id]: null })));
    });
  }, [ops]); // eslint-disable-line react-hooks/exhaustive-deps

  const byVisit = ops.reduce((acc, op) => { (acc[op.visit_id] ??= []).push(op); return acc; }, {});
  const failed  = ops.filter(o => o.status === 'failed').length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="bg-navy h-14 flex items-center px-4 shrink-0">
        <div className="w-10" />
        <div className="flex-1 text-center">
          <div className="text-white text-[17px] font-bold leading-tight">Queue</div>
        </div>
        <ProfileButton />
      </header>

      <main className="flex-1 overflow-y-auto w-full max-w-[var(--max-width)] mx-auto p-4">
        {ops.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-2 text-center px-8">
            <div className="text-[13px] font-semibold text-text-dark">Everything is synced</div>
            <div className="text-[12px] text-text-light">
              Changes saved while offline appear here until they reach the server.
              {status.lastSyncedAt && ` Last synced ${formatSynced(status.lastSyncedAt)}.`}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <button style={btn} onClick={() => flushOutbox({ force: true })} disabled={status.syncing}>
                {status.syncing ? 'Syncing…' : 'Sync now'}
              </button>
              {failed > 0 && <button style={btn} onClick={retryAllFailed}>Retry failed</button>}
            </div>

            <div className="flex flex-col gap-3">
              {Object.entries(byVisit).map(([visitId, list]) => {
                const failedHere = list.filter(o => o.status === 'failed').length;
                const isOpen     = open[visitId] ?? failedHere > 0;
                const summary    = failedHere > 0
                  ? `${failedHere} failed`
                  : `${list.length} change${list.length !== 1 ? 's' : ''} waiting`;
                return (
                <div key={visitId} className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                  <button
                    onClick={() => setOpen(prev => ({ ...prev, [visitId]: !isOpen }))}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left bg-surface border-none"
                    style={{ borderBottom: isOpen ? '1px solid var(--color-surface-dark)' : 'none' }}
                  >
                    <span className="text-[12px] font-bold text-text-dark truncate">{visits[visitId] || `Visit #${visitId}`}</span>
                    <span className="flex items-center gap-2 shrink-0 text-[11px] font-semibold"
                      style={{ color: failedHere > 0 ? '#B71C1C' : 'var(--color-text-light)' }}>
                      {summary}
                      <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                    </span>
                  </button>
                  {isOpen && list.map((op, i) => {
                    const isFailed = op.status === 'failed';
                    return (
                      <div key={op.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                        style={{ borderBottom: i < list.length - 1 ? '1px solid var(--color-surface-dark)' : 'none' }}>
                        <div className="min-w-0">
                          <div className="text-[12px] font-semibold text-text-dark truncate">{opLabel(op)}</div>
                          {opDetail(op) && <div className="text-[11px] text-text-light truncate">{opDetail(op)}</div>}
                          {isFailed && <div className="text-[10px] text-error mt-0.5">{op.error || 'The server rejected this change'}</div>}
                          {!isFailed && op.error && <div className="text-[10px] text-warning mt-0.5">{op.error}</div>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-semibold" style={{ color: isFailed ? '#B71C1C' : '#E65100' }}>
                            {isFailed ? 'Failed' : 'Queued'}
                          </span>
                          {isFailed && (
                            <>
                              <button style={{ ...btn, height: 28, padding: '0 10px', fontSize: 11 }} onClick={() => retryOp(op.id)}>Retry</button>
                              <button
                                style={{ ...btn, height: 28, padding: '0 10px', fontSize: 11, color: '#B71C1C' }}
                                onClick={() => { if (window.confirm('Discard this change? It will not be saved.')) discardOp(op.id); }}
                              >Discard</button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
