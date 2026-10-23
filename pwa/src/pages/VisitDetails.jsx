// VisitDetails — auto-saving editor for an existing draft visit.
// The visit record already exists on the server (created by App.jsx on "Start visit").
// This component PATCHes /api/visits/:id whenever fields change (debounced 800ms).
import { useState, useEffect, useRef } from 'react';
import { updateVisit, getVisit, createReading, getStationLastVisit, isTransientError } from '../services/api.js';
import { parseSiteNotes } from '../utils/prefill.js';
import CopyLastPill from '../components/CopyLastPill.jsx';
import { enqueueOp, enqueueOpReplacing, getOps, overlayPending, onOpSynced } from '../services/outbox.js';

const PROMPTS = [
  {
    id: 'access',
    label: 'Site access',
    allClear: 'No issues',     // cannot be combined with any reported problem
    options: ['No issues', 'Gate locked — used key', 'Road flooded', 'Road damaged', '4x4 required', 'Other'],
  },
  {
    id: 'equipment',
    label: 'Equipment',
    allClear: 'All good',      // cannot be combined with any reported problem
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

function fmtCoverageDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function VisitDetails({ visitId, station, formState, setFormState, onDetailsDone, notesRequired = true }) {
  const { date: todayDate, time: nowTime } = nowDateTime();

  // Initialise from restored formState (draft resume) or defaults
  const [visitDate,  setVisitDate]  = useState(formState?.visitDate  || todayDate);
  const [visitTime,  setVisitTime]  = useState(formState?.visitTime  || nowTime);
  // "No issues" / "All good" stand alone: a saved draft that has them next to a problem keeps the problems
  const [selections, setSelections] = useState(() => {
    const saved = formState?.selections || { access: [], equipment: [] };
    return Object.fromEntries(PROMPTS.map(p => {
      const arr = saved[p.id] || [];
      return [p.id, p.allClear && arr.length > 1 ? arr.filter(v => v !== p.allClear) : arr];
    }));
  });
  const [extraNotes, setExtraNotes] = useState(formState?.extraNotes || '');
  const [otherNotes, setOtherNotes] = useState(formState?.otherNotes || {});
  const [saveState,    setSaveState]    = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [raining,      setRaining]      = useState(null);   // null | 'true' | 'false'
  const [rainConfirmed, setRainConfirmed] = useState(false);
  const [lastVisit,    setLastVisit]    = useState(null);   // what the previous visit recorded here

  useEffect(() => {
    if (station?.id) getStationLastVisit(station.id).then(setLastVisit).catch(() => {});
  }, [station?.id]);

  // Load existing raining readings on mount (draft resume)
  useEffect(() => {
    if (!station || station.data_family !== 'rainfall') return;
    (async () => {
      let serverReadings = [];
      try { serverReadings = (await getVisit(visitId)).readings || []; } catch { /* offline — use what is on this device */ }
      const readings = overlayPending(serverReadings, await getOps(visitId));
      const r = readings.find(x => x.reading_type === 'raining');
      const c = readings.find(x => x.reading_type === 'no_rainfall_confirmed');
      if (r) setRaining(r.value_text);
      if (c) setRainConfirmed(true);
    })();
  }, [visitId, station?.data_family]);

  useEffect(() => onOpSynced(({ op }) => {
    if (op.type === 'visit_update' && op.visit_id === visitId) setSaveState('saved');
  }), [visitId]);

  const dateInputRef = useRef(null);
  const saveTimer    = useRef(null);

  const isToday = visitDate === todayDate;

  // Build structured note string for the server
  function buildNote() {
    const parts = PROMPTS
      .map(p => {
        const chosen = selections[p.id];
        if (!chosen.length) return null;
        const items = chosen.map(o =>
          o === 'Other' && otherNotes[p.id]?.trim() ? `Other: ${otherNotes[p.id].trim()}` : o
        );
        return `• ${p.label}: ${items.join(', ')}`;
      })
      .filter(Boolean);
    if (extraNotes.trim()) parts.push(`• ${extraNotes.trim()}`);
    return parts.join(' · ');
  }

  // Debounced PATCH whenever any field changes
  useEffect(() => {
    clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(async () => {
      // Always keep the draft on this device first — it must survive a dropped connection or a reload
      setFormState({ visitDate, visitTime, selections, extraNotes, otherNotes });
      const body = { visited_at: new Date(`${visitDate}T${visitTime}`).toISOString(), notes: buildNote() };
      try {
        if (!navigator.onLine) throw Object.assign(new Error('offline'), { network: true });
        await updateVisit(visitId, body);
        setSaveState('saved');
      } catch (err) {
        if (isTransientError(err)) {
          await enqueueOpReplacing('visit_update', visitId, body);
          setSaveState('queued');
        } else {
          setSaveState('error');
        }
      }
    }, 800);
    return () => clearTimeout(saveTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitDate, visitTime, selections, extraNotes, otherNotes]);

  // Choosing "No issues" / "All good" clears the other choices in that group, and choosing a problem clears it
  function toggle(id, opt) {
    const clear = PROMPTS.find(p => p.id === id)?.allClear;
    if (opt === clear) setOtherNotes(prev => ({ ...prev, [id]: '' }));
    setSelections(prev => {
      const arr = prev[id];
      let next;
      if (arr.includes(opt))      next = arr.filter(v => v !== opt);
      else if (opt === clear)     next = [clear];
      else                        next = [...arr.filter(v => v !== clear), opt];
      return { ...prev, [id]: next };
    });
  }

  const allPromptsDone = PROMPTS.every(p => {
    const arr = selections[p.id];
    if (!arr.length) return false;
    if (arr.includes('Other') && !otherNotes[p.id]?.trim()) return false;
    return true;
  });

  // Send a reading, or keep it on this device when there is no usable connection
  async function sendReading(reading) {
    try {
      if (!navigator.onLine) throw Object.assign(new Error('offline'), { network: true });
      await createReading(visitId, reading);
    } catch (err) {
      if (!isTransientError(err)) throw err;
      await enqueueOp('reading', visitId, reading);
    }
  }

  async function saveRaining(val) {
    if (raining === val) return;
    const previous = raining;
    setRaining(val);
    try {
      await sendReading({ reading_type: 'raining', value_text: val, recorded_at: new Date().toISOString() });
    } catch {
      setRaining(previous); // the server rejected it
    }
  }

  async function saveRainConfirmed(val) {
    setRainConfirmed(val);
    if (!val) return;
    try {
      await sendReading({ reading_type: 'no_rainfall_confirmed', value_text: 'true', recorded_at: new Date().toISOString() });
    } catch {
      setRainConfirmed(false);
    }
  }

  const isRainfallReady = station?.data_family !== 'rainfall' ||
    (raining !== null && (raining === 'true' || rainConfirmed));
  // Only a visit that collects data needs the site-notes prompts and the rainfall question
  const allDetailsDone = !notesRequired || (allPromptsDone && isRainfallReady);

  useEffect(() => {
    if (allDetailsDone) onDetailsDone?.();
  }, [allDetailsDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const promptSummary = PROMPTS
    .map(p => {
      const chosen = selections[p.id];
      if (!chosen.length) return null;
      const items = chosen.map(o =>
        o === 'Other' && otherNotes[p.id]?.trim() ? `Other: ${otherNotes[p.id].trim()}` : o
      );
      return `• ${items.join(', ')}`;
    })
    .filter(Boolean)
    .join('  ·  ');

  return (
    <div className="flex flex-col flex-1">

      {/* Auto-save status */}
      <div className="px-4 pt-2 shrink-0 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-text-light">
          {station?.last_visited_at !== undefined && `Last station visit: ${fmtCoverageDate(station.last_visited_at)}`}
        </span>
        <span className={`text-[10px] font-semibold ${
          saveState === 'saved'  ? 'text-success' :
          saveState === 'queued' ? 'text-warning' :
          saveState === 'error'  ? 'text-error'   :
          saveState === 'saving' ? 'text-text-light' : 'text-transparent'
        }`}>
          {saveState === 'saved'  ? '✓ Saved'    :
           saveState === 'queued' ? 'Saved on this device' :
           saveState === 'error'  ? '⚠ Save failed' :
           saveState === 'saving' ? 'Saving…'    : '·'}
        </span>
      </div>

      {/* ── Scrollable body ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pt-2">

        {/* ── Date & Time card ───────────────────────────────────── */}
        <div className="form-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-semibold text-text-dark">Date &amp; time of visit</span>
            <button
              onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.focus()}
              className={`font-semibold rounded-full border-[1.5px] ${
                !isToday
                  ? 'text-blue-dark bg-blue-light border-blue'
                  : 'text-text-light bg-white border-border'
              }`}
              style={{ fontSize: 11, height: 26, padding: '0 10px', lineHeight: 1 }}
            >
              {!isToday ? '✓ Past visit' : 'Past visit?'}
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <label className="text-[12px] font-semibold text-text-dark">Date</label>
              <input
                ref={dateInputRef}
                type="date"
                value={visitDate}
                max={todayDate}
                onChange={e => setVisitDate(e.target.value)}
                className={`field-input ${!isToday ? 'field-input--active' : ''}`}
                style={{ width: 150, height: 34, fontSize: 12, flexShrink: 0 }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <label className="text-[12px] font-semibold text-text-dark">Time</label>
              <input
                type="time"
                value={visitTime}
                onChange={e => setVisitTime(e.target.value)}
                className="field-input"
                style={{ width: 150, height: 34, fontSize: 12, flexShrink: 0 }}
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
        <div className={`form-card ${notesRequired && !allPromptsDone ? 'form-card--alert' : ''}`} style={{ marginBottom: station?.data_family === 'rainfall' ? 12 : 24 }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[13px] font-semibold text-text-dark">Site notes</span>
            {!allPromptsDone
              ? (notesRequired
                  ? <span className="text-[10px] font-semibold text-warning bg-warning-light px-2 py-0.5 rounded-full">Required</span>
                  : <span className="text-[10px] font-semibold text-text-light bg-surface-dark px-2 py-0.5 rounded-full">Optional</span>)
              : <span className="text-[10px] font-semibold text-success bg-success-light px-2 py-0.5 rounded-full">✓ Done</span>
            }
          </div>
          <div className="text-[11px] text-text-light mb-3 leading-relaxed">
            Select all that apply in each category.
          </div>
          {(() => {
            // Offer last visit's answers as a starting point, only while nothing has been chosen yet
            const last = parseSiteNotes(lastVisit?.notes, PROMPTS);
            const nothingChosen = PROMPTS.every(p => selections[p.id].length === 0) && !extraNotes.trim();
            if (!last || !nothingChosen) return null;
            return (
              <div className="mb-3">
                <CopyLastPill onClick={() => { setSelections(last.selections); setOtherNotes(last.otherNotes); }} />
              </div>
            );
          })()}

          {PROMPTS.map((section, si) => (
            <div key={section.id} className={si < PROMPTS.length - 1 ? 'mb-3.5' : ''}>
              <div className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5">
                <span className={selections[section.id].length > 0 ? 'text-text-dark' : 'text-text-light'}>
                  {section.label}
                </span>
                {selections[section.id].length > 0 && (
                  <span className="text-[10px] font-semibold text-blue bg-blue-light px-1.5 py-0.5 rounded-full">
                    {selections[section.id].length}
                  </span>
                )}
              </div>

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

              {selections[section.id].includes('Other') && (
                <input
                  type="text"
                  value={otherNotes[section.id] || ''}
                  onChange={e => setOtherNotes(prev => ({ ...prev, [section.id]: e.target.value }))}
                  placeholder="Describe the issue…"
                  className="field-input mt-2"
                />
              )}

              {si < PROMPTS.length - 1 && (
                <div className="mt-3.5" style={{ borderTop: '1.5px solid var(--color-border)' }} />
              )}
            </div>
          ))}

          {/* Free text */}
          <div className="mt-3.5">
            <div className="text-[11px] font-semibold text-text-light mb-1.5 flex justify-between">
              <span>Anything else?</span>
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

          {/* Note preview */}
          {allPromptsDone && (
            <div className="mt-3 bg-surface border border-surface-dark rounded-xl px-3 py-2.5">
              <div className="text-[10px] text-text-light font-semibold uppercase tracking-wide mb-1">
                Note preview
              </div>
              <div className="text-[12px] text-text-med leading-relaxed">
                {promptSummary}
                {extraNotes && (
                  <><br /><span className="text-text-light">• {extraNotes}</span></>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Rainfall conditions card ────────────────────────────── */}
        {station?.data_family === 'rainfall' && (
          <div
            className={`form-card ${notesRequired && !isRainfallReady ? 'form-card--alert' : ''}`}
            style={{ marginBottom: 24 }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-semibold text-text-dark">Rainfall conditions</span>
              {!isRainfallReady
                ? (notesRequired
                    ? <span className="text-[10px] font-semibold text-warning bg-warning-light px-2 py-0.5 rounded-full">Required</span>
                    : <span className="text-[10px] font-semibold text-text-light bg-surface-dark px-2 py-0.5 rounded-full">Optional</span>)
                : <span className="text-[10px] font-semibold text-success bg-success-light px-2 py-0.5 rounded-full">✓ Done</span>
              }
            </div>

            <div className="text-[11px] font-semibold text-text-dark mb-1.5">Was it raining?</div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {['true', 'false'].map(val => (
                <button
                  key={val}
                  data-selected={raining === val ? 'true' : undefined}
                  onClick={() => saveRaining(val)}
                  className="note-chip"
                >
                  {val === 'true' ? 'Yes' : 'No'}
                </button>
              ))}
            </div>

            {raining === 'false' && (
              <label
                className="flex items-start gap-2.5 cursor-pointer"
                onClick={() => saveRainConfirmed(!rainConfirmed)}
              >
                <div
                  className="w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 transition-colors"
                  style={{
                    border: `2px solid ${rainConfirmed ? '#1565C0' : 'var(--color-border)'}`,
                    background: rainConfirmed ? '#1565C0' : 'var(--color-surface)',
                  }}
                >
                  {rainConfirmed && <span className="text-white text-[11px] font-bold leading-none">✓</span>}
                </div>
                <span className="text-[12px] text-text-med leading-snug">
                  I confirm no rainfall occurred during this period
                </span>
              </label>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
