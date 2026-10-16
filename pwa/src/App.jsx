import { useState, useEffect, useRef, useCallback } from 'react';
import { loadDraft, saveDraft, clearDraft, removeLegacyDraft } from './hooks/useDraftVisit.js';
import { createVisit, submitVisit, abandonVisit, getVisit, isTransientError, prefetchVisitData } from './services/api.js';
import { enqueueOp, getOps, onOpSynced, onOpEvent, flushOutbox, clearVisitOps } from './services/outbox.js';
import { hasStoredFile } from './services/uploadQueue.js';  // also registers the upload handlers
import { showNotice } from './services/notice.js';
import { useSyncEngine, useOutboxStatus } from './hooks/useSyncEngine.js';
import { useAuth } from './auth/AuthContext.jsx';
import ProfileButton from './auth/ProfileSheet.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ChangePasswordPage from './pages/ChangePasswordPage.jsx';
import SelectStation  from './pages/SelectStation.jsx';
import VisitDetails   from './pages/VisitDetails.jsx';
import UploadFiles    from './pages/UploadFiles.jsx';
import ManualReadings from './pages/ManualReadings.jsx';
import QueueTab       from './pages/QueueTab.jsx';
import HistoryTab     from './pages/HistoryTab.jsx';
import DataTab from './pages/DataTab.jsx';
import LeadDashboard    from './pages/LeadDashboard.jsx';
import ManagerDashboard, { ErrorsTab } from './pages/ManagerDashboard.jsx';

function isStandaloneDisplayMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// ── Bottom Tab Bar ─────────────────────────────────────────────────────────
const TABS = [
  { id: 'stations', icon: '◉', label: 'Stations' },
  { id: 'visit',    icon: '☐', label: 'Visit'    },
  { id: 'queue',    icon: '▤', label: 'Queue'    },
  { id: 'history',  icon: '≡', label: 'History'  },
  { id: 'data',     icon: '≀', label: 'Data'     },
  { id: 'errors',   icon: '⚠', label: 'Errors'   },
];

function BottomNav({ activeTab, setActiveTab, visitBadge, queueBadge, queueErrors, tabs = TABS, embedded = false }) {
  return (
    <nav className={`bottom-tab-bar shrink-0${embedded ? ' bottom-tab-bar--embedded' : ''}`}>
      {/* Visible only on desktop — hidden via CSS on mobile */}
      <div className="sidebar-brand">
        <span style={{ fontSize: '22px' }}>🛰</span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-navy)' }}>SAEON FDS</div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-light)' }}>Field Data System</div>
        </div>
      </div>
      {tabs.map(tab => {
        const badge    = tab.id === 'visit' ? visitBadge : tab.id === 'queue' ? queueBadge : 0;
        const hasError = tab.id === 'queue' && queueErrors > 0;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            data-active={activeTab === tab.id ? 'true' : undefined}
            className="tab-btn"
          >
            <span className="tab-icon">
              {tab.icon}
              {badge > 0 && (
                <span
                  className="tab-badge"
                  style={hasError ? { background: 'var(--color-error)' } : undefined}
                >{badge}</span>
              )}
            </span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ── App Bar ────────────────────────────────────────────────────────────────
function AppBar({ title, subtitle, onAbandon }) {
  return (
    <header className="bg-navy h-14 flex items-center px-4 sticky top-0 z-50 shrink-0">
      <div className="w-10">
        {onAbandon && (
          <button
            onClick={onAbandon}
            className="flex items-center justify-center w-8 h-8 rounded-full"
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1.5px solid rgba(255,255,255,0.35)',
              color: 'white',
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1,
            }}
            title="Cancel this draft visit"
          >
            ✕
          </button>
        )}
      </div>
      <div className="flex-1 text-center px-2">
        <div className="text-white text-[17px] font-bold truncate leading-tight">{title}</div>
        {subtitle && (
          <div className="text-white text-[11px] opacity-60 leading-tight">{subtitle}</div>
        )}
      </div>
      <ProfileButton />
    </header>
  );
}

// ── Visit section segmented control ───────────────────────────────────────
const SECTIONS = [
  { id: 'details',  label: 'Details'  },
  { id: 'readings', label: 'Readings' },
  { id: 'files',    label: 'Files'    },
];

function VisitSegmentedControl({ section, setSection, completionMap }) {
  return (
    <div className="flex gap-1 px-4 pt-3 pb-1 shrink-0">
      {SECTIONS.map(s => (
        <button
          key={s.id}
          onClick={() => setSection(s.id)}
          data-active={section === s.id ? 'true' : undefined}
          className="visit-section-btn"
        >
          <span>{completionMap[s.id] ? '✓ ' : ''}{s.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Discard draft sheet ────────────────────────────────────────────────────
function DiscardSheet({ stationName, onKeep, onDiscard }) {
  return (
    <div className="back-sheet-overlay">
      <div className="back-sheet">
        <div className="text-[15px] font-bold text-text-dark mb-1.5">
          Start a new visit?
        </div>
        <div className="text-[13px] text-text-light mb-5 leading-relaxed">
          You have an unsubmitted draft for <strong>{stationName}</strong>. Starting a new visit
          will discard it. Submitted files are already saved on the server.
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={onKeep}
            className="flex-1 h-12 border-[1.5px] border-border rounded-xl bg-white text-text-med text-sm font-semibold"
          >
            Keep draft
          </button>
          <button
            onClick={onDiscard}
            className="flex-1 h-12 border-none rounded-xl text-white text-sm font-semibold"
            style={{ background: 'var(--color-error)' }}
          >
            Discard &amp; start new
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Abandon draft sheet ────────────────────────────────────────────────────
function AbandonSheet({ stationName, onKeep, onConfirm, abandoning }) {
  return (
    <div className="back-sheet-overlay">
      <div className="back-sheet">
        <div className="text-[15px] font-bold text-text-dark mb-1.5">
          Cancel this visit?
        </div>
        <div className="text-[13px] text-text-light mb-5 leading-relaxed">
          The draft visit for <strong>{stationName}</strong> will be permanently deleted — including any uploaded files and readings. This cannot be undone.
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={onKeep}
            disabled={abandoning}
            className="flex-1 h-12 border-[1.5px] border-border rounded-xl bg-white text-text-med text-sm font-semibold"
          >
            Keep draft
          </button>
          <button
            onClick={onConfirm}
            disabled={abandoning}
            className="flex-1 h-12 border-none rounded-xl text-white text-sm font-semibold"
            style={{ background: 'var(--color-error)' }}
          >
            {abandoning ? 'Cancelling…' : 'Cancel visit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Submit confirmation sheet ──────────────────────────────────────────────
function SubmitSheet({ draftVisit, visitFiles, hasReadings, onKeep, onConfirm, submitting }) {
  const fileCount   = visitFiles.filter(f => f.dbId).length;
  // Files picked while offline are stored on the device and upload by themselves; they are not "missing"
  const waitingCount = visitFiles.filter(f => !f.dbId && ['queued', 'uploading'].includes(f.parseState)).length;
  const parsedCount = visitFiles.filter(f => f.parseState === 'parsed').length;
  const missingFiles    = fileCount === 0 && waitingCount === 0;
  const missingReadings = !hasReadings;
  return (
    <div className="back-sheet-overlay">
      <div className="back-sheet">
        <div className="text-[15px] font-bold text-text-dark mb-1">Submit this visit?</div>
        <div className="text-[12px] text-text-light mb-3">
          {draftVisit?.station?.display_name}
        </div>

        {/* Incomplete-data warnings */}
        {(missingFiles || missingReadings) && (
          <div className="flex flex-col gap-1.5 mb-4">
            {missingFiles && (
              <div className="flex items-start gap-2 bg-warning-light rounded-xl px-3 py-2.5" style={{ border: '1px solid rgba(230,81,0,0.2)' }}>
                <span className="text-warning text-[13px] shrink-0 mt-0.5">⚠</span>
                <span className="text-[12px] text-warning leading-relaxed font-medium">
                  No logger file uploaded — visit will be recorded without instrument data.
                </span>
              </div>
            )}
            {missingReadings && (
              <div className="flex items-start gap-2 bg-warning-light rounded-xl px-3 py-2.5" style={{ border: '1px solid rgba(230,81,0,0.2)' }}>
                <span className="text-warning text-[13px] shrink-0 mt-0.5">⚠</span>
                <span className="text-[12px] text-warning leading-relaxed font-medium">
                  No manual readings recorded — drift correction will not be possible for this visit.
                </span>
              </div>
            )}
          </div>
        )}

        {/* File summary (only when files exist) */}
        {fileCount > 0 && (
          <div className="text-[12px] text-text-med mb-4 leading-relaxed">
            {fileCount} file{fileCount !== 1 ? 's' : ''} uploaded
            {parsedCount < fileCount && ` (${fileCount - parsedCount} still parsing)`}.
            Once submitted this visit moves to History.
          </div>
        )}
        {waitingCount > 0 && (
          <div className="text-[12px] text-text-med mb-4 leading-relaxed">
            {waitingCount} file{waitingCount !== 1 ? 's' : ''}{' '}
            {navigator.onLine ? 'uploading.' : 'queued — uploads when back online.'}
          </div>
        )}
        {fileCount === 0 && waitingCount === 0 && !missingReadings && (
          <div className="text-[12px] text-text-med mb-4 leading-relaxed">
            Once submitted this visit moves to History.
          </div>
        )}

        <div className="flex gap-2.5">
          <button
            onClick={onKeep}
            disabled={submitting}
            className="flex-1 h-12 border-[1.5px] border-border rounded-xl bg-white text-text-med text-sm font-semibold"
          >
            Not yet
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 h-12 border-none rounded-xl bg-navy text-white text-sm font-semibold"
          >
            {submitting ? 'Submitting…' : (missingFiles || missingReadings) ? 'Submit anyway' : 'Submit visit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// After a reload, decide what really happened to files that had not reached the server:
// still stored on the device (the sync engine will send them), already uploaded while the app was
// closed (match by name), or lost (ask the technician to add them again).
async function reconcileFiles(visitId, list) {
  const unsent = f => !f.dbId && ['queued', 'uploading', 'error'].includes(f.parseState);
  if (!list.some(unsent)) return list;

  let serverFiles = null;
  const out = [];
  for (const f of list) {
    if (!unsent(f)) { out.push(f); continue; }
    if (await hasStoredFile(f.localId)) { out.push({ ...f, parseState: 'queued', parseError: null }); continue; }
    if (serverFiles === null) {
      try { serverFiles = (await getVisit(visitId)).files || []; } catch { serverFiles = []; }
    }
    const match = serverFiles.find(d => d.original_name === f.name && !list.some(x => x.dbId === d.id));
    out.push(match
      ? { ...f, dbId: match.id, parseState: 'pending', parseError: null }
      : { ...f, parseState: 'error', parseError: 'This file is no longer stored on the device — please add it again.' });
  }
  return out;
}

// ── Field PWA (shared by technicians, leads, and managers) ────────────────
export function FieldApp({ onExit, embedded = false, onGoToColumns, onUnmappedDetected, onLanding }) {
  const auth = useAuth();
  const [activeTab,    setActiveTab]    = useState('stations');
  const [visitSection, setVisitSection] = useState('details');
  const [draftVisit,   setDraftVisit]   = useState(null);   // { visitId, station }
  const [visitFiles,   setVisitFiles]   = useState([]);
  const [formState,    setFormState]    = useState(null);   // VisitDetails form values

  // Draft loading state
  const [draftLoading, setDraftLoading] = useState(true);

  // UI state
  const [showDiscard,  setShowDiscard]  = useState(false);
  const [pendingStation, setPendingStation] = useState(null); // station user wants to start
  const [showAbandon,  setShowAbandon]  = useState(false);
  const [abandoning,   setAbandoning]   = useState(false);
  const [showSubmit,   setShowSubmit]   = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [readingsDone,      setReadingsDone]      = useState(false);
  const [loggerUnavailable, setLoggerUnavailable] = useState(false);
  const [detailsAllDone, setDetailsAllDone] = useState(false);
  const [pendingSubmit,   setPendingSubmit]   = useState(false);   // submit queued, waiting for connectivity
  const outbox = useOutboxStatus();
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(isStandaloneDisplayMode());

  // Offline indicator
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    function handleOnline()  { setIsOffline(false); }
    function handleOffline() { setIsOffline(true);  }
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    function handleInstalled() {
      setIsInstalled(true);
      setInstallPrompt(null);
      setInstallDismissed(true);
    }

    function handleDisplayModeChange() {
      setIsInstalled(isStandaloneDisplayMode());
    }

    const media = window.matchMedia('(display-mode: standalone)');

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    media.addEventListener('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      media.removeEventListener('change', handleDisplayModeChange);
    };
  }, []);

  async function handleInstallApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setInstallPrompt(null);
    setInstallDismissed(true);
  }

  // Save timer for debounced IDB writes
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      let draft = await loadDraft(auth?.id);

      // A draft saved by an older version has no owner. Show it only if the server says the visit is
      // this user's; otherwise it stays hidden (it may belong to someone who used this device).
      if (draft?.unowned) {
        try {
          const v = await getVisit(draft.visitId);
          if (v?.technician_id === auth?.id) {
            draft = { ...draft, user_id: auth.id, unowned: undefined };
            await saveDraft(draft);
            await removeLegacyDraft();
          } else {
            draft = null;
          }
        } catch {
          draft = null;
        }
      }

      if (draft) {
        setDraftVisit({ visitId: draft.visitId, station: draft.station });
        setFormState(draft.formState || null);
        setReadingsDone(!!draft.progress?.readingsDone);
        setDetailsAllDone(!!draft.progress?.detailsAllDone);
        setLoggerUnavailable(!!draft.progress?.loggerUnavailable);
        if (draft.progress?.visitSection) setVisitSection(draft.progress.visitSection);
        setPendingSubmit(!!draft.pendingSubmit);
        if (navigator.onLine) prefetchVisitData(draft.station);
        const restoredFiles = draft.files || [];
        // Re-sync any already-uploaded files so hasUnmappedColumns + parseState are current
        if (restoredFiles.some(f => f.dbId)) {
          try {
            const visit   = await getVisit(draft.visitId);
            const dbFiles = visit.files || [];
            const synced  = restoredFiles.map(f => {
              if (!f.dbId) return f;
              const db = dbFiles.find(d => d.id === f.dbId);
              if (!db) return f;
              return {
                ...f,
                parseState:         db.parse_status === 'parsed' ? 'parsed' : db.parse_status === 'error' ? 'error' : 'pending',
                hasUnmappedColumns: db.has_unmapped_columns ?? false,
                dateRange:          db.date_range_start ? `${db.date_range_start} — ${db.date_range_end}` : f.dateRange,
                records:            db.record_count ?? f.records,
                parseError:         db.parse_error  ?? null,
                hasGap:             db.has_gap       ?? false,
                gapDays:            db.gap_days      ?? null,
              };
            });
            setVisitFiles(await reconcileFiles(draft.visitId, synced));
          } catch {
            setVisitFiles(await reconcileFiles(draft.visitId, restoredFiles));
          }
        } else {
          setVisitFiles(await reconcileFiles(draft.visitId, restoredFiles));
        }
        setActiveTab('visit');
      }
      setDraftLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounced IDB save whenever draft state changes ────────────────────
  const persistDraft = useCallback((visitId, station, files, form, extra) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft({ visitId, station, formState: form, files, user_id: auth?.id ?? null, ...extra });
    }, 500);
  }, [auth?.id]);

  useEffect(() => {
    if (!draftVisit) return;
    persistDraft(draftVisit.visitId, draftVisit.station, visitFiles, formState, {
      progress: { readingsDone, detailsAllDone, loggerUnavailable, visitSection },
      pendingSubmit,
    });
  }, [draftVisit, visitFiles, formState, readingsDone, detailsAllDone, loggerUnavailable, visitSection, pendingSubmit, persistDraft]);

  // ── Start visit: create draft on server, save to IDB ──────────────────
  async function handleStartVisit(station) {
    if (draftVisit) {
      // Guard: show discard sheet before replacing existing draft
      setPendingStation(station);
      setShowDiscard(true);
      return;
    }
    await doStartVisit(station);
  }

  async function doStartVisit(station) {
    try {
      const visit = await createVisit({
        station_id: station.id,
        status:     'draft',
      });
      const draft = { visitId: visit.id, station };
      setDraftVisit(draft);
      setFormState(null);
      setVisitFiles([]);
      setReadingsDone(false);
      setDetailsAllDone(false);
      setPendingSubmit(false);
      await saveDraft({ visitId: visit.id, station, formState: null, files: [], user_id: auth?.id ?? null });
      prefetchVisitData(station);   // keep what this visit needs on the device in case signal drops
      setActiveTab('visit');
      setVisitSection('details');
    } catch (err) {
      console.error('Failed to create draft visit:', err.message);
    }
  }

  async function handleDiscardAndStart() {
    setShowDiscard(false);
    await clearDraft(auth?.id);
    setDraftVisit(null);
    setVisitFiles([]);
    setFormState(null);
    if (pendingStation) {
      await doStartVisit(pendingStation);
      setPendingStation(null);
    }
  }

  // ── Abandon draft ──────────────────────────────────────────────────────
  async function handleAbandon() {
    if (!draftVisit) return;
    setAbandoning(true);
    const vid = draftVisit.visitId;
    try {
      await abandonVisit(vid);
      await clearVisitOps(vid);
    } catch (err) {
      // No signal: remember to abandon the server draft later instead of leaving it orphaned
      if (isTransientError(err) || !navigator.onLine) {
        await clearVisitOps(vid);
        await enqueueOp('abandon', vid, {});
      }
    } finally {
      setAbandoning(false);
    }
    await clearDraft(auth?.id);
    setDraftVisit(null);
    setVisitFiles([]);
    setFormState(null);
    setPendingSubmit(false);
    setShowAbandon(false);
    setActiveTab('stations');
  }

  // ── Submit visit ───────────────────────────────────────────────────────
  async function finishSubmit(vid) {
    await clearVisitOps(vid);
    await clearDraft(auth?.id);
    setDraftVisit(null);
    setVisitFiles([]);
    setFormState(null);
    setPendingSubmit(false);
    setShowSubmit(false);
    setActiveTab('history');
  }

  // Submit goes straight to the server when everything is already synced; otherwise (or with no
  // signal) it is queued behind the visit's other changes and sent automatically when connected.
  async function handleSubmit() {
    if (!draftVisit) return;
    setSubmitting(true);
    const vid = draftVisit.visitId;
    try {
      const waiting = (await getOps(vid)).filter(o => o.type !== 'submit');
      if (waiting.length === 0 && navigator.onLine) {
        try {
          await submitVisit(vid);
          await finishSubmit(vid);
          return;
        } catch (err) {
          if (!isTransientError(err)) { console.error('Submit failed:', err.message); return; }
        }
      }
      const queuedAlready = (await getOps(vid)).some(o => o.type === 'submit');
      if (!queuedAlready) await enqueueOp('submit', vid, {});
      flushOutbox({ force: true });

      // The technician is done: close the form and send them to their landing page. The queued files and
      // the submit stay in the outbox and go through, in order, on their own (so the queue is NOT cleared).
      await clearDraft(auth?.id);
      setDraftVisit(null);
      setVisitFiles([]);
      setFormState(null);
      setPendingSubmit(false);
      setShowSubmit(false);
      showNotice(navigator.onLine
        ? 'Visit saved — it will submit as soon as its files finish uploading.'
        : 'Visit saved on this device — it will submit automatically when you are back online.');
      if (onLanding) onLanding(); else setActiveTab('stations');
    } finally {
      setSubmitting(false);
    }
  }

  // Uploads are done by the sync engine; reflect each step on the file cards
  useEffect(() => onOpEvent(({ phase, op, result, error }) => {
    if (op.type !== 'upload' || !draftVisit || op.visit_id !== draftVisit.visitId) return;
    const { localId } = op.payload;
    const patch =
      phase === 'start'     ? { parseState: 'uploading' }
      : phase === 'synced'  ? { parseState: 'pending', dbId: result?.id ?? null, parseError: null }
      : phase === 'transient' ? { parseState: 'queued' }
      : phase === 'failed'  ? { parseState: 'error', parseError: error }
      : null;
    if (patch) setVisitFiles(prev => prev.map(f => f.localId === localId ? { ...f, ...patch } : f));
  }), [draftVisit]);

  // The queued submit was accepted by the server → close the visit out
  useEffect(() => onOpSynced(({ op }) => {
    if (op.type === 'submit' && draftVisit && op.visit_id === draftVisit.visitId) finishSubmit(op.visit_id);
  }), [draftVisit]);

  // If the app was closed while a submit was waiting, check whether it actually went through
  useEffect(() => {
    if (!pendingSubmit || !draftVisit || isOffline) return;
    let cancelled = false;
    (async () => {
      const stillQueued = (await getOps(draftVisit.visitId)).some(o => o.type === 'submit');
      if (stillQueued) return;
      try {
        const v = await getVisit(draftVisit.visitId);
        if (!cancelled && v?.status === 'submitted') finishSubmit(draftVisit.visitId);
      } catch { /* try again on the next reconnect */ }
    })();
    return () => { cancelled = true; };
  }, [pendingSubmit, draftVisit, isOffline]);

  // ── Derived ────────────────────────────────────────────────────────────
  const hasFiles      = visitFiles.some(f => f.dbId);
  const queueActive   = visitFiles.filter(f => ['uploading', 'pending', 'queued'].includes(f.parseState)).length;
  const queueErrors   = visitFiles.filter(f => f.parseState === 'error').length + outbox.failed;
  // Nav badge: files in flight or failed, plus every other change still waiting to sync
  const queueBadge    = queueActive + visitFiles.filter(f => f.parseState === 'error').length + outbox.queued + outbox.failed;
  const visitBadge    = draftVisit ? 1 : 0;  // dot indicator when draft exists

  // Section completion
  const detailsDone      = detailsAllDone;
  // A file stored on the device and waiting to upload counts: the queued submit goes out after it
  const filesDone        = hasFiles || loggerUnavailable || visitFiles.some(f => ['queued', 'uploading'].includes(f.parseState));
  const hasUnmappedFiles = visitFiles.some(f => f.hasUnmappedColumns);
  const completionMap    = { details: detailsDone, files: filesDone, readings: readingsDone };

  const canSubmit = draftVisit && detailsDone && filesDone && readingsDone && !hasUnmappedFiles;

  if (draftLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-surface">
        <div className="text-text-light text-sm">Loading…</div>
      </div>
    );
  }

  const visibleTabs = embedded ? TABS.filter(t => t.id !== 'data' && t.id !== 'errors') : TABS;

  return (
    <div className={embedded ? 'flex flex-col flex-1 overflow-hidden' : 'flex flex-col min-h-dvh app-layout'}>

      {/* ── Back to dashboard strip (leads/managers only) ────────────── */}
      {onExit && !embedded && (
        <div
          className="shrink-0 flex items-center px-4 py-2"
          style={{ background: '#EBF2FB', borderBottom: '1px solid #BFDBFE' }}
        >
          <button
            onClick={onExit}
            className="text-[12px] font-semibold bg-transparent border-none"
            style={{ color: '#1565C0', cursor: 'pointer', padding: 0 }}
          >
            ← Back to dashboard
          </button>
        </div>
      )}

      {/* ── Sync status ─────────────────────────────────────────────── */}
      {(isOffline || outbox.queued > 0 || outbox.failed > 0 || pendingSubmit) && (
        <div
          className="bg-warning-light text-warning text-[12px] font-medium px-5 py-2 flex items-center gap-2 shrink-0 z-50"
          style={{ borderBottom: '1px solid rgba(230,81,0,0.2)' }}
        >
          {outbox.failed > 0
            ? `${outbox.failed} item${outbox.failed !== 1 ? 's' : ''} could not be saved — open the Queue tab`
            : pendingSubmit
              ? (isOffline
                  ? 'Visit ready — it will be submitted automatically when you are back online'
                  : 'Submitting visit…')
              : isOffline
                ? (outbox.queued > 0
                    ? `Offline — ${outbox.queued} item${outbox.queued !== 1 ? 's' : ''} saved on this device, will sync when you reconnect`
                    : 'Offline — your entries are saved on this device and will sync when you reconnect')
                : outbox.syncing
                  ? `Syncing ${outbox.queued} item${outbox.queued !== 1 ? 's' : ''}…`
                  : `${outbox.queued} item${outbox.queued !== 1 ? 's' : ''} waiting to sync`}
        </div>
      )}

      {!isInstalled && !installDismissed && installPrompt && (
        <div
          className="px-4 py-3 shrink-0"
          style={{ background: '#EAF3FF', borderBottom: '1px solid rgba(59,125,216,0.18)' }}
        >
          <div className="max-w-[var(--max-width)] mx-auto flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-blue-dark">Install SAEON FDS</div>
              <div className="text-[11px] text-text-light">
                Add the app to this device for faster launch and a full-screen field workflow.
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setInstallDismissed(true)}
                className="h-9 px-3 rounded-lg border border-border bg-white text-text-med text-[12px] font-semibold"
              >
                Later
              </button>
              <button
                onClick={handleInstallApp}
                className="h-9 px-3 rounded-lg border-none bg-navy text-white text-[12px] font-semibold"
              >
                Install
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stations tab ────────────────────────────────────────────── */}
      {activeTab === 'stations' && (
        <SelectStation
          onStartVisit={handleStartVisit}
          hasDraft={!!draftVisit}
          draftStation={draftVisit?.station}
          onResumeDraft={() => setActiveTab('visit')}
        />
      )}

      {/* ── Visit tab ───────────────────────────────────────────────── */}
      {activeTab === 'visit' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <AppBar
            title={draftVisit ? draftVisit.station.display_name : 'Active Visit'}
            subtitle={draftVisit ? 'Draft visit' : 'No active visit'}
            onAbandon={draftVisit ? () => setShowAbandon(true) : undefined}
          />

          {draftVisit ? (
            <>
              <VisitSegmentedControl
                section={visitSection}
                setSection={setVisitSection}
                completionMap={completionMap}
              />

              <main className="flex-1 flex flex-col overflow-hidden w-full max-w-[var(--max-width)] mx-auto">
                {visitSection === 'details' && (
                  <VisitDetails
                    visitId={draftVisit.visitId}
                    station={draftVisit.station}
                    formState={formState}
                    setFormState={setFormState}
                    onDetailsDone={() => setDetailsAllDone(true)}
                  />
                )}
                {visitSection === 'readings' && (
                  <ManualReadings
                    visitId={draftVisit.visitId}
                    stationId={draftVisit.station.id}
                    dataFamily={draftVisit.station.data_family}
                    isBarologger={draftVisit.station.is_barologger ?? false}
                    onReadingsSaved={() => setReadingsDone(true)}
                    onLoggerUnavailable={v => setLoggerUnavailable(v)}
                  />
                )}
                {visitSection === 'files' && (
                  <UploadFiles
                    visitId={draftVisit.visitId}
                    stationId={draftVisit.station.id}
                    files={visitFiles}
                    setFiles={setVisitFiles}
                    dataFamily={draftVisit.station.data_family}
                    loggerUnavailable={loggerUnavailable}
                    onGoToColumns={onGoToColumns}
                    onUnmappedDetected={onUnmappedDetected}
                  />
                )}
              </main>

              {/* Submit bar */}
              <div className="px-4 pb-3 pt-2 shrink-0 bg-surface border-t border-surface-dark">
                <button
                  disabled={pendingSubmit}
                  style={pendingSubmit ? { opacity: 0.6 } : undefined}
                  onClick={() => {
                    if (canSubmit) { setShowSubmit(true); return; }
                    if (!detailsDone)  { setVisitSection('details');  return; }
                    if (!readingsDone) { setVisitSection('readings'); return; }
                    setVisitSection('files');
                  }}
                  className="cta-btn"
                >
                  {pendingSubmit      ? 'Submit queued — sends when connected'
                    : canSubmit       ? 'Review & submit visit →'
                    : !detailsDone    ? 'Complete site notes →'
                    : !readingsDone   ? 'Complete manual readings →'
                    : hasUnmappedFiles ? 'Map unknown column names before submitting'
                    : 'Upload a logger file →'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="text-[40px]">☐</div>
              <div className="text-[15px] font-semibold text-text-dark">No active visit</div>
              <div className="text-[13px] text-text-light leading-relaxed">
                Go to Stations, select a station, and tap "Start visit" to begin.
              </div>
              <button onClick={() => setActiveTab('stations')} className="cta-btn mt-2">
                Go to Stations →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Queue tab ───────────────────────────────────────────────── */}
      {activeTab === 'queue' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <AppBar title="Upload Queue" />
          <main className="flex-1 flex flex-col overflow-hidden w-full max-w-[var(--max-width)] mx-auto">
            <QueueTab
              visitId={draftVisit?.visitId}
              files={visitFiles}
              setFiles={setVisitFiles}
              onGoToFiles={() => { setActiveTab('visit'); setVisitSection('files'); }}
              station={draftVisit?.station}
            />
          </main>
        </div>
      )}

      {/* ── History tab ─────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <AppBar title="Visit History" />
          <main className="flex-1 flex flex-col overflow-hidden w-full max-w-[var(--max-width)] mx-auto">
            <HistoryTab />
          </main>
        </div>
      )}

      {/* ── Data tab (read-only rainfall + parse errors for own stations) ─ */}
      {activeTab === 'data' && <DataTab />}

      {/* ── Errors tab (own stations only, no delete) ───────────────── */}
      {activeTab === 'errors' && <ErrorsTab canDelete={false} />}

      {/* ── Bottom nav (always visible) ─────────────────────────────── */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        visitBadge={visitBadge}
        queueBadge={queueBadge}
        queueErrors={queueErrors}
        tabs={visibleTabs}
        embedded={embedded}
      />

      {/* ── Sheets ──────────────────────────────────────────────────── */}
      {showDiscard && (
        <DiscardSheet
          stationName={draftVisit?.station?.display_name}
          onKeep={() => { setShowDiscard(false); setPendingStation(null); }}
          onDiscard={handleDiscardAndStart}
        />
      )}

      {showAbandon && (
        <AbandonSheet
          stationName={draftVisit?.station?.display_name}
          onKeep={() => setShowAbandon(false)}
          onConfirm={handleAbandon}
          abandoning={abandoning}
        />
      )}

      {showSubmit && (
        <SubmitSheet
          draftVisit={draftVisit}
          visitFiles={visitFiles}
          hasReadings={readingsDone}
          onKeep={() => setShowSubmit(false)}
          onConfirm={handleSubmit}
          submitting={submitting}
        />
      )}
    </div>
  );
}

// ── App — role router ──────────────────────────────────────────────────────
export default function App() {
  const auth  = useAuth();
  useSyncEngine(auth?.id);

  if (!auth?.isReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: '#F4F6F8' }}>
        <div style={{ fontSize: 13, color: '#8A9BB0' }}>Loading…</div>
      </div>
    );
  }

  if (!auth?.id) return <LoginPage sessionExpired={auth?.sessionExpired ?? false} />;
  if (auth?.password_change_required) return <ChangePasswordPage />;

  const roles = auth?.roles ?? [];
  if (roles.includes('technician_lead')) return <LeadDashboard />;
  if (roles.includes('data_manager'))    return <ManagerDashboard />;

  return <FieldApp />;
}
