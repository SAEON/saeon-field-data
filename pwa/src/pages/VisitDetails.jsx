import { useState, useEffect, useRef } from 'react';
import { createVisit } from '../services/api.js';

const PROMPTS = [
  {
    id: 'access',
    label: 'Site access',
    icon: '🚗',
    options: ['No issues', 'Gate locked — used key', 'Road flooded', 'Road damaged', '4x4 required'],
  },
  {
    id: 'weather',
    label: 'Weather',
    icon: '🌦',
    options: ['Clear / sunny', 'Overcast', 'Light rain', 'Heavy rain', 'High wind', 'Foggy'],
  },
  {
    id: 'equipment',
    label: 'Equipment',
    icon: '🔧',
    options: ['All good', 'Minor corrosion', 'Vandalism noted', 'Animal damage', 'Flooding near sensor', 'Equipment missing'],
  },
];

const DANGER_OPTIONS = new Set(['Vandalism noted', 'Animal damage', 'Equipment missing', 'Flooding near sensor']);

function nowDateTime() {
  const d   = new Date();
  const pad = n => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export default function VisitDetails({ station, setVisitId, advance, reset, setBackInterceptor }) {
  const { date: todayDate, time: nowTime } = nowDateTime();

  const [visitDate,  setVisitDate]  = useState(todayDate);
  const [visitTime,  setVisitTime]  = useState(nowTime);
  const [selections, setSelections] = useState({ access: [], weather: [], equipment: [] });
  const [extraNotes, setExtraNotes] = useState('');
  const [showBack,   setShowBack]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState(null);

  const dateInputRef = useRef(null);

  // Intercept the AppBar back arrow — show sheet instead of navigating away.
  // NOTE: plain function ref, NOT () => () => fn — that would store a thunk.
  useEffect(() => {
    setBackInterceptor(() => setShowBack(true));
    return () => setBackInterceptor(null);
  }, [setBackInterceptor]);

  const isToday        = visitDate === todayDate;
  const allPromptsDone = Object.values(selections).every(arr => arr.length > 0);
  const canContinue    = allPromptsDone && !saving;

  function toggle(id, opt) {
    setSelections(prev => {
      const arr = prev[id];
      return {
        ...prev,
        [id]: arr.includes(opt) ? arr.filter(v => v !== opt) : [...arr, opt],
      };
    });
  }

  function buildNote() {
    const parts = PROMPTS
      .map(p => {
        const chosen = selections[p.id];
        if (chosen.length === 0) return null;
        return `${p.icon} ${p.label}: ${chosen.join(', ')}`;
      })
      .filter(Boolean);
    if (extraNotes.trim()) parts.push(`📝 ${extraNotes.trim()}`);
    return parts.join(' · ');
  }

  const promptSummary = PROMPTS
    .map(p => {
      const chosen = selections[p.id];
      if (chosen.length === 0) return null;
      return `${p.icon} ${chosen.join(', ')}`;
    })
    .filter(Boolean)
    .join('  ·  ');

  async function handleContinue() {
    if (!canContinue) return;
    setSaving(true);
    setError(null);
    try {
      const visited_at = new Date(`${visitDate}T${visitTime}`).toISOString();
      const visit = await createVisit({
        station_id:    station.id,
        technician_id: 1,           // Phase 2: from auth
        visited_at,
        notes: buildNote(),
      });
      setVisitId(visit.id);
      advance(3);
    } catch (e) {
      setError(e.message || 'Failed to create visit. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col flex-1">

      {/* ── Scrollable body ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pt-4">

        {/* ── Date & Time card ───────────────────────────────────── */}
        <div className="form-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-semibold text-text-dark">📅 Date &amp; time of visit</span>
            <button
              onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.focus()}
              className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border-[1.5px] ${
                !isToday
                  ? 'text-blue-dark bg-blue-light border-blue'
                  : 'text-text-light bg-white border-border'
              }`}
            >
              {!isToday ? '✓ Past visit' : 'Past visit?'}
            </button>
          </div>

          <div className="flex gap-2.5">
            <div className="flex-1">
              <div className="text-[11px] text-text-light font-medium mb-1">Date</div>
              <input
                ref={dateInputRef}
                type="date"
                value={visitDate}
                max={todayDate}
                onChange={e => setVisitDate(e.target.value)}
                className={`field-input ${!isToday ? 'field-input--active' : ''}`}
              />
            </div>
            <div className="flex-1">
              <div className="text-[11px] text-text-light font-medium mb-1">Time</div>
              <input
                type="time"
                value={visitTime}
                onChange={e => setVisitTime(e.target.value)}
                className="field-input"
              />
            </div>
          </div>

          {!isToday && (
            <div className="mt-2.5 bg-blue-light rounded-lg px-2.5 py-2 text-[11px] text-blue-dark" style={{ border: '1px solid color-mix(in srgb, var(--color-blue) 30%, transparent)' }}>
              ℹ️ Recording a past visit — {visitDate}
            </div>
          )}
        </div>

        {/* ── Site notes card ────────────────────────────────────── */}
        <div className={`form-card ${!allPromptsDone ? 'form-card--alert' : ''}`} style={{ marginBottom: 24 }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[13px] font-semibold text-text-dark">📝 Site notes</span>
            {!allPromptsDone
              ? <span className="text-[10px] font-semibold text-warning bg-warning-light px-2 py-0.5 rounded-full">Required</span>
              : <span className="text-[10px] font-semibold text-success bg-success-light px-2 py-0.5 rounded-full">✓ Done</span>
            }
          </div>
          <div className="text-[11px] text-text-light mb-3 leading-relaxed">
            Select all that apply in each category.
          </div>

          {PROMPTS.map((section, si) => (
            <div key={section.id} className={si < PROMPTS.length - 1 ? 'mb-3.5' : ''}>

              {/* Section label — no inline selected value, just a count badge */}
              <div className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5">
                <span>{section.icon}</span>
                <span className={selections[section.id].length > 0 ? 'text-text-dark' : 'text-text-light'}>
                  {section.label}
                </span>
                {selections[section.id].length > 0 && (
                  <span className="text-[10px] font-semibold text-blue bg-blue-light px-1.5 py-0.5 rounded-full">
                    {selections[section.id].length}
                  </span>
                )}
              </div>

              {/* Option chips — multi-select */}
              <div className="flex flex-wrap gap-1.5">
                {section.options.map(opt => (
                  <button
                    key={opt}
                    data-selected={selections[section.id].includes(opt) ? 'true' : undefined}
                    data-danger={DANGER_OPTIONS.has(opt) ? 'true' : undefined}
                    onClick={() => toggle(section.id, opt)}
                    className="note-chip"
                  >
                    {opt}
                  </button>
                ))}
              </div>

              {si < PROMPTS.length - 1 && (
                <div className="mt-3.5" style={{ borderTop: '1.5px solid var(--color-border)' }} />
              )}
            </div>
          ))}

          {/* Free text */}
          <div className="mt-3.5">
            <div className="text-[11px] font-semibold text-text-light mb-1.5 flex justify-between">
              <span>✏️ Anything else?</span>
              <span className="font-normal text-border">Optional</span>
            </div>
            <textarea
              value={extraNotes}
              onChange={e => setExtraNotes(e.target.value)}
              placeholder="e.g. hippo tracks near borehole, unusual smell, GPS drift…"
              rows={2}
              className="notes-textarea"
            />
          </div>

          {/* Note preview — shown once all prompts are answered */}
          {allPromptsDone && (
            <div className="mt-3 bg-surface border border-surface-dark rounded-xl px-3 py-2.5">
              <div className="text-[10px] text-text-light font-semibold uppercase tracking-wide mb-1">
                Note preview
              </div>
              <div className="text-[12px] text-text-med leading-relaxed">
                {promptSummary}
                {extraNotes && (
                  <><br /><span className="text-text-light">📝 {extraNotes}</span></>
                )}
              </div>
            </div>
          )}
        </div>

      </div>{/* end scrollable */}

      {/* ── Sticky CTA ────────────────────────────────────────── */}
      <div
        className="px-4 pb-7 pt-3 shrink-0"
        style={{ background: 'linear-gradient(to top, var(--color-surface) 70%, transparent)' }}
      >
        {error && (
          <div className="text-[11px] text-error text-center mb-2">{error}</div>
        )}
        {!canContinue && !saving && (
          <div className="text-[11px] text-warning text-center mb-2 font-medium">
            ⚠ Select at least one option per category in Site notes
          </div>
        )}
        <button onClick={handleContinue} disabled={!canContinue} className="cta-btn">
          {saving ? 'Saving…' : <span>Upload files <span className="text-lg">→</span></span>}
        </button>
      </div>

      {/* ── Back confirmation sheet ────────────────────────────── */}
      {showBack && (
        <div className="back-sheet-overlay">
          <div className="back-sheet">
            <div className="text-[15px] font-bold text-text-dark mb-1.5">
              Go back to station list?
            </div>
            <div className="text-[13px] text-text-light mb-5 leading-relaxed">
              Your visit details won't be saved and your station selection will be cleared.
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowBack(false)}
                className="flex-1 h-12 border-[1.5px] border-border rounded-xl bg-white text-text-med text-sm font-semibold"
              >
                Keep editing
              </button>
              <button
                onClick={reset}
                className="flex-1 h-12 border-none rounded-xl bg-navy text-white text-sm font-semibold"
              >
                Yes, go back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
