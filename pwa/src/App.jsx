import { useState, useEffect, useRef, useCallback } from 'react';
import { loadDraft, saveDraft, clearDraft } from './hooks/useDraftVisit.js';
import { createVisit, submitVisit } from './services/api.js';
import SelectStation  from './pages/SelectStation.jsx';
import VisitDetails   from './pages/VisitDetails.jsx';
import UploadFiles    from './pages/UploadFiles.jsx';
import ManualReadings from './pages/ManualReadings.jsx';
import QueueTab       from './pages/QueueTab.jsx';
import HistoryTab     from './pages/HistoryTab.jsx';

function isStandaloneDisplayMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// ── Bottom Tab Bar ─────────────────────────────────────────────────────────
const TABS = [
  { id: 'stations', icon: '🧭', label: 'Stations' },
  { id: 'visit',    icon: '🗒️',  label: 'Visit'    },
  { id: 'queue',    icon: '🗂️',  label: 'Queue'    },
  { id: 'history',  icon: '📜', label: 'History'  },
];

function BottomNav({ activeTab, setActiveTab, visitBadge, queueBadge, queueErrors }) {
  return (
    <nav className="bottom-tab-bar shrink-0">
      {/* Visible only on desktop — hidden via CSS on mobile */}
      <div className="sidebar-brand">
        <span style={{ fontSize: '22px' }}>🛰</span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-navy)' }}>SAEON FDS</div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-light)' }}>Field Data System</div>
        </div>
      </div>
      {TABS.map(tab => {
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
function AppBar({ title, subtitle }) {
  return (
    <header className="bg-navy h-14 flex items-center px-4 sticky top-0 z-50 shrink-0">
      <div className="w-10" />
      <div className="flex-1 text-center px-2">
        <div className="text-white text-[17px] font-bold truncate leading-tight">{title}</div>
        {subtitle && (
          <div className="text-white text-[11px] opacity-60 leading-tight">{subtitle}</div>
        )}
      </div>
      <div className="w-10" />
    </header>
  );
}

// ── Visit section segmented control ───────────────────────────────────────
const SECTIONS = [
  { id: 'details',  label: 'Details'  },
  { id: 'files',    label: 'Files'    },
  { id: 'readings', label: 'Readings' },
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

// ── Submit confirmation sheet ──────────────────────────────────────────────
function SubmitSheet({ draftVisit, visitFiles, hasReadings, onKeep, onConfirm, submitting }) {
  const fileCount   = visitFiles.filter(f => f.dbId).length;
  const parsedCount = visitFiles.filter(f => f.parseState === 'parsed').length;
  const missingFiles    = fileCount === 0;
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
        {fileCount === 0 && !missingReadings && (
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

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
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
  const [showSubmit,   setShowSubmit]   = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [readingsDone, setReadingsDone] = useState(false);
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

  // ── On mount: restore draft from IndexedDB ──────────────────────────────
  useEffect(() => {
    loadDraft().then(draft => {
      if (draft) {
        setDraftVisit({ visitId: draft.visitId, station: draft.station });
        setFormState(draft.formState || null);
        setVisitFiles(draft.files || []);
        setActiveTab('visit');
      }
      setDraftLoading(false);
    });
  }, []);

  // ── Debounced IDB save whenever draft state changes ────────────────────
  const persistDraft = useCallback((visitId, station, files, form) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft({ visitId, station, formState: form, files });
    }, 500);
  }, []);

  useEffect(() => {
    if (!draftVisit) return;
    persistDraft(draftVisit.visitId, draftVisit.station, visitFiles, formState);
  }, [draftVisit, visitFiles, formState, persistDraft]);

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
        station_id:    station.id,
        technician_id: 4,          // Phase 2: from auth
        status:        'draft',
      });
      const draft = { visitId: visit.id, station };
      setDraftVisit(draft);
      setFormState(null);
      setVisitFiles([]);
      setReadingsDone(false);
      await saveDraft({ visitId: visit.id, station, formState: null, files: [] });
      setActiveTab('visit');
      setVisitSection('details');
    } catch (err) {
      console.error('Failed to create draft visit:', err.message);
    }
  }

  async function handleDiscardAndStart() {
    setShowDiscard(false);
    await clearDraft();
    setDraftVisit(null);
    setVisitFiles([]);
    setFormState(null);
    if (pendingStation) {
      await doStartVisit(pendingStation);
      setPendingStation(null);
    }
  }

  // ── Submit visit ───────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!draftVisit) return;
    setSubmitting(true);
    try {
      await submitVisit(draftVisit.visitId);
      await clearDraft();
      setDraftVisit(null);
      setVisitFiles([]);
      setFormState(null);
      setShowSubmit(false);
      setActiveTab('history');
    } catch (err) {
      console.error('Submit failed:', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────
  const hasFiles      = visitFiles.some(f => f.dbId);
  const queueActive   = visitFiles.filter(f => ['uploading', 'pending', 'queued'].includes(f.parseState)).length;
  const queueErrors   = visitFiles.filter(f => f.parseState === 'error').length;
  const queueBadge    = queueActive + queueErrors;  // drives nav badge count
  const visitBadge    = draftVisit ? 1 : 0;  // dot indicator when draft exists

  // Section completion
  const detailsDone = !!formState?.visitDate;
  const filesDone   = hasFiles;
  const completionMap = { details: detailsDone, files: filesDone, readings: readingsDone };

  const canSubmit = draftVisit && (hasFiles || readingsDone);

  if (draftLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-surface">
        <div className="text-text-light text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-dvh app-layout">

      {/* ── Global offline banner ────────────────────────────────────── */}
      {isOffline && (
        <div
          className="bg-warning-light text-warning text-[12px] font-medium px-5 py-2 flex items-center gap-2 shrink-0 z-50"
          style={{ borderBottom: '1px solid rgba(230,81,0,0.2)' }}
        >
          Offline — changes will sync when you reconnect
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
                  />
                )}
                {visitSection === 'files' && (
                  <UploadFiles
                    visitId={draftVisit.visitId}
                    files={visitFiles}
                    setFiles={setVisitFiles}
                    dataFamily={draftVisit.station.data_family}
                  />
                )}
                {visitSection === 'readings' && (
                  <ManualReadings
                    visitId={draftVisit.visitId}
                    dataFamily={draftVisit.station.data_family}
                    onReadingsSaved={() => setReadingsDone(true)}
                  />
                )}
              </main>

              {/* Submit bar */}
              <div className="px-4 pb-3 pt-2 shrink-0 bg-surface border-t border-surface-dark">
                <button
                  onClick={() => setShowSubmit(true)}
                  disabled={!canSubmit}
                  className="cta-btn"
                >
                  {canSubmit ? 'Review & submit visit →' : 'Add files or readings to submit'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="text-[40px]">🗒️</div>
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

      {/* ── Bottom nav (always visible) ─────────────────────────────── */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        visitBadge={visitBadge}
        queueBadge={queueBadge}
        queueErrors={queueErrors}
      />

      {/* ── Sheets ──────────────────────────────────────────────────── */}
      {showDiscard && (
        <DiscardSheet
          stationName={draftVisit?.station?.display_name}
          onKeep={() => { setShowDiscard(false); setPendingStation(null); }}
          onDiscard={handleDiscardAndStart}
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
