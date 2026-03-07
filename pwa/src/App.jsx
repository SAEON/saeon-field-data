import { useState, useRef } from 'react';
import SelectStation from './pages/SelectStation.jsx';
import VisitDetails  from './pages/VisitDetails.jsx';

const TOTAL_STEPS = 5;

// ── App Bar ────────────────────────────────────────────────────────────────
function AppBar({ step, station, onBack }) {
  const showBack = step > 1;
  const title    = step > 1 && station ? station.display_name : 'SAEON FDS';

  return (
    <header className="bg-navy h-14 flex items-center px-4 sticky top-0 z-50 shrink-0">
      {/* Left — back arrow */}
      <div className="w-10 flex items-center">
        {showBack && (
          <button
            onClick={onBack}
            aria-label="Go back"
            className="bg-transparent border-none text-white p-0 w-10 min-h-[var(--touch-target)] flex items-center justify-center"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
      </div>

      {/* Centre — title */}
      <span className="flex-1 text-center text-white text-[17px] font-bold truncate px-2">
        {title}
      </span>

      {/* Right — step counter */}
      <div className="w-10 text-right">
        <span className="text-white text-[length:var(--font-sm)] opacity-85">
          {step} / {TOTAL_STEPS}
        </span>
      </div>
    </header>
  );
}

// ── Progress Bar ───────────────────────────────────────────────────────────
function ProgressBar({ step }) {
  const pct      = Math.round((step / TOTAL_STEPS) * 100);
  const complete = step === TOTAL_STEPS;

  return (
    <div className="h-1 bg-navy-med shrink-0">
      <div
        className={`h-full transition-[width,background-color] duration-200 ${complete ? 'bg-success' : 'bg-blue'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Screen placeholder ─────────────────────────────────────────────────────
// Replaced one-by-one as screens are built.
function ScreenPlaceholder({ step }) {
  const labels = ['', 'Select Station', 'Visit Details', 'Upload Files', 'Manual Readings', 'Confirmation'];
  return (
    <div className="flex-1 flex items-center justify-center p-6 text-text-med">
      <p className="text-lg font-semibold text-center">
        Screen {step}: {labels[step]}
      </p>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep]                   = useState(1);
  const [station, setStation]             = useState(null);
  const [visitId, setVisitId]             = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);

  // Screens can register a custom back handler (e.g. to show a confirmation sheet)
  const backInterceptorRef = useRef(null);
  function setBackInterceptor(fn) { backInterceptorRef.current = fn; }

  function handleBack() {
    if (backInterceptorRef.current) {
      backInterceptorRef.current();
    } else if (step > 1) {
      setStep(s => s - 1);
    }
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

  const screenProps = { step, station, setStation, visitId, setVisitId, uploadedFiles, setUploadedFiles, advance, reset };

  // Screen 1 owns its own full-screen layout (custom header, no step indicator)
  if (step === 1) {
    return <SelectStation setStation={setStation} advance={advance} />;
  }

  return (
    <div className="flex flex-col min-h-dvh">
      <AppBar step={step} station={station} onBack={handleBack} />
      <ProgressBar step={step} />

      <main className="flex-1 flex flex-col w-full max-w-[var(--max-width)] mx-auto">
        {step === 2
          ? <VisitDetails
              station={station}
              setVisitId={setVisitId}
              advance={advance}
              reset={reset}
              setBackInterceptor={setBackInterceptor}
            />
          : <ScreenPlaceholder step={step} {...screenProps} />
        }
      </main>
    </div>
  );
}
