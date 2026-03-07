import { useState } from 'react';

const TOTAL_STEPS = 5;

// ── App Bar ────────────────────────────────────────────────────────────────
function AppBar({ step, station, onBack }) {
  const showBack = step > 1;
  const title = step > 1 && station ? station.display_name : 'SAEON FDS';

  return (
    <header
      style={{
        backgroundColor: 'var(--color-navy)',
        height: 'var(--app-bar-h)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-2)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        flexShrink: 0,
      }}
    >
      {/* Left — back arrow */}
      <div style={{ width: 40, display: 'flex', alignItems: 'center' }}>
        {showBack && (
          <button
            onClick={onBack}
            aria-label="Go back"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-white)',
              padding: 0,
              minHeight: 'var(--touch-target)',
              minWidth: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Back arrow SVG */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
      </div>

      {/* Centre — title */}
      <span
        style={{
          flex: 1,
          textAlign: 'center',
          color: 'var(--color-white)',
          fontSize: '17px',
          fontWeight: 700,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          paddingInline: 'var(--space-1)',
        }}
      >
        {title}
      </span>

      {/* Right — step counter */}
      <div style={{ width: 40, textAlign: 'right' }}>
        <span
          style={{
            color: 'var(--color-white)',
            fontSize: 'var(--font-sm)',
            fontWeight: 400,
            opacity: 0.85,
          }}
        >
          {step} / {TOTAL_STEPS}
        </span>
      </div>
    </header>
  );
}

// ── Progress Bar ───────────────────────────────────────────────────────────
function ProgressBar({ step }) {
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  const complete = step === TOTAL_STEPS;

  return (
    <div
      style={{
        height: 'var(--progress-h)',
        backgroundColor: 'var(--color-navy-med)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          backgroundColor: complete ? 'var(--color-success)' : 'var(--color-blue)',
          transition: 'width 0.2s ease, background-color 0.2s ease',
        }}
      />
    </div>
  );
}

// ── Screen placeholder ─────────────────────────────────────────────────────
// Replaced one-by-one as screens are built.
function ScreenPlaceholder({ step }) {
  const labels = ['', 'Select Station', 'Visit Details', 'Upload Files', 'Manual Readings', 'Confirmation'];
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-3)',
        color: 'var(--color-text-med)',
      }}
    >
      <p style={{ fontSize: 'var(--font-lg)', fontWeight: 600, textAlign: 'center' }}>
        Screen {step}: {labels[step]}
      </p>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep]               = useState(1);
  const [station, setStation]         = useState(null);
  const [visitId, setVisitId]         = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);

  function handleBack() {
    if (step > 1) setStep(s => s - 1);
  }

  function advance(nextStep) {
    setStep(nextStep);
  }

  function reset() {
    setStep(1);
    setStation(null);
    setVisitId(null);
    setUploadedFiles([]);
  }

  // Shared props passed to every screen
  const screenProps = { step, station, setStation, visitId, setVisitId, uploadedFiles, setUploadedFiles, advance, reset };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <AppBar step={step} station={station} onBack={handleBack} />
      <ProgressBar step={step} />

      {/* Centred single-column content — max 480px */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          maxWidth: 'var(--max-width)',
          marginInline: 'auto',
        }}
      >
        {/* Screens are dropped in here as they are built */}
        <ScreenPlaceholder step={step} {...screenProps} />
      </main>
    </div>
  );
}
