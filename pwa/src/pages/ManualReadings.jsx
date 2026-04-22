// ManualReadings — family-specific site readings form.
// Each field has its own Save button; state is local to each field component.
// Existing readings are loaded from the server on mount to pre-populate saved state.
// Offline: readings are queued in IndexedDB and flushed when reconnected.
import { useState, useEffect, useRef } from 'react';
import { createReading, deleteReading, getVisit, createInstrumentRecord } from '../services/api.js';
import { useOfflineQueue } from '../hooks/useOfflineQueue.js';

const REQUIRED_TYPES = {
  rainfall:    ['logger_activities', 'raingauge_activities', 'gauge_condition', 'overall_site_condition'],
  groundwater: ['dipper_depth', 'dipper_time', 'overall_site_condition'],
  met:         ['pyranometer_clean', 'anemometer_spinning', 'rain_gauge_clear', 'overall_site_condition'],
};

const LOGGER_ACTS = [
  { value: 'logger_download',     label: 'Download' },
  { value: 'logger_maintenance',  label: 'Maintenance' },
  { value: 'logger_missing',      label: 'Missing' },
  { value: 'logger_deploy',       label: 'Deployed' },
  { value: 'logger_decommission', label: 'Decommission' },
  { value: 'logger_program',      label: 'Programmed' },
  { value: 'logger_stopped',      label: 'Stopped' },
];

const RAINGAUGE_ACTS = [
  { value: 'raingauge_maintenance',       label: 'Maintenance' },
  { value: 'raingauge_missing',           label: 'Missing' },
  { value: 'raingauge_deploy',            label: 'Deployed' },
  { value: 'raingauge_decommission',      label: 'Decommission' },
  { value: 'raingauge_calibrate',         label: 'Calibrate' },
  { value: 'raingauge_calibration_check', label: 'Cal. check' },
  { value: 'pseudo_events',               label: 'Water entry' },
];

const RG_MAINT_CHECKS     = ['Interior clear', 'Funnel clear', 'Orifice cleared', 'Obstruction removed', 'Debris cleared', 'Bucket cleaned', 'Gauge levelled', 'Bracket secure', 'Brush cleared', 'Bucket test done'];
const LOGGER_MAINT_CHECKS = ['Display checked', 'Battery changed', 'Cable intact', 'Connections checked', 'Memory full — reset', 'Memory reset', 'Logger relaunched', 'Mount secure', 'Enclosure inspected'];

const LOGGER_PROBLEM    = new Set(['logger_missing', 'logger_stopped', 'logger_decommission']);
const RAINGAUGE_PROBLEM = new Set(['raingauge_missing', 'raingauge_decommission']);


// ── Save button ───────────────────────────────────────────────────────────────

function SaveBtn({ state, hasValue, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={!hasValue || state === 'saving' || state === 'saved' || state === 'queued'}
      className={`px-3 h-8 rounded-lg text-[11px] font-semibold border-none shrink-0 transition-colors ${
        state === 'saved'  ? 'bg-success-light text-success' :
        state === 'error'  ? 'bg-error-light text-error'     :
        state === 'queued' ? 'bg-surface-dark text-blue'     :
        hasValue           ? 'bg-navy text-white'             :
        'bg-surface-dark text-text-light'
      }`}
    >
      {state === 'saving' ? '…'
        : state === 'saved'  ? '✓ Saved'
        : state === 'error'  ? 'Retry'
        : state === 'queued' ? '≡ Queued'
        : 'Save'}
    </button>
  );
}

// ── Chip select field (single-select pills) ────────────────────────────────────

function ChipsField({ readingType, label, required, hint, options, existingReading, onSave }) {
  const init = existingReading?.value_text ?? null;
  const [value,     setValue]    = useState(init);
  const [saveState, setSaveState] = useState(existingReading ? 'saved' : 'idle');
  const saved = saveState === 'saved';

  async function handleSave() {
    setSaveState('saving');
    try {
      await onSave({ reading_type: readingType, value_text: value, recorded_at: new Date().toISOString() });
      setSaveState('saved');
    } catch (err) {
      setSaveState(err?.offline ? 'queued' : 'error');
    }
  }

  return (
    <div className="form-card">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[12px] font-semibold text-text-dark">
          {label} {required && <span className="text-warning text-[11px]">*</span>}
        </div>
        {hint && <span className="text-[10px] text-text-light">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {options.map(opt => (
          <button
            key={opt.value}
            data-selected={value === opt.value ? 'true' : undefined}
            data-danger={opt.danger ? 'true' : undefined}
            onClick={() => !saved && setValue(value === opt.value ? null : opt.value)}
            disabled={saved}
            className="note-chip"
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <SaveBtn state={saveState} hasValue={!!value} onClick={handleSave} />
      </div>
    </div>
  );
}

// ── Yes / No toggle field ─────────────────────────────────────────────────────

function ToggleField({ readingType, label, required, existingReading, onSave }) {
  const init = existingReading ? existingReading.value_text === 'Yes' : null;
  const [value,     setValue]    = useState(init);
  const [saveState, setSaveState] = useState(existingReading ? 'saved' : 'idle');
  const saved = saveState === 'saved';

  async function handleSave() {
    setSaveState('saving');
    try {
      await onSave({ reading_type: readingType, value_text: value ? 'Yes' : 'No', recorded_at: new Date().toISOString() });
      setSaveState('saved');
    } catch (err) {
      setSaveState(err?.offline ? 'queued' : 'error');
    }
  }

  return (
    <div
      className="form-card flex items-center justify-between"
      style={{ borderColor: value !== null ? '#BBF7D0' : undefined }}
    >
      <div className="text-[12px] font-medium text-text-dark">
        {label} {required && <span className="text-warning text-[10px]">*</span>}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          {[true, false].map(isYes => {
            const active = value === isYes;
            const lbl    = isYes ? 'Yes' : 'No';
            return (
              <button
                key={lbl}
                onClick={() => !saved && setValue(active ? null : isYes)}
                disabled={saved}
                className="w-10 h-7 rounded-md text-[11px] font-semibold"
                style={{
                  border:     `1.5px solid ${active ? (isYes ? '#2E7D32' : '#B71C1C') : 'var(--color-border)'}`,
                  background: active ? (isYes ? '#E8F5E9' : '#FFEBEE') : 'var(--color-surface)',
                  color:      active ? (isYes ? '#2E7D32' : '#B71C1C') : 'var(--color-text-light)',
                }}
              >{lbl}</button>
            );
          })}
        </div>
        <SaveBtn state={saveState} hasValue={value !== null} onClick={handleSave} />
      </div>
    </div>
  );
}

// ── Number input field ────────────────────────────────────────────────────────

function NumberField({ readingType, label, required, hint, unit, placeholder, step = '0.01', existingReading, onSave }) {
  const init = existingReading?.value_numeric != null ? String(existingReading.value_numeric) : '';
  const [value,     setValue]    = useState(init);
  const [saveState, setSaveState] = useState(existingReading ? 'saved' : 'idle');
  const saved = saveState === 'saved';

  async function handleSave() {
    setSaveState('saving');
    try {
      await onSave({ reading_type: readingType, value_numeric: parseFloat(value), unit: unit || null, recorded_at: new Date().toISOString() });
      setSaveState('saved');
    } catch (err) {
      setSaveState(err?.offline ? 'queued' : 'error');
    }
  }

  return (
    <div className="form-card">
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[12px] font-semibold text-text-dark">
          {label} {required && <span className="text-warning text-[11px]">*</span>}
        </div>
        {hint && <span className="text-[10px] text-text-light">{hint}</span>}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="number"
            step={step}
            value={value}
            onChange={e => { setValue(e.target.value); setSaveState('idle'); }}
            placeholder={placeholder}
            disabled={saved}
            className={`field-input w-full ${value ? 'field-input--active' : ''}`}
            style={{ height: '38px', ...(unit && { paddingRight: '44px' }) }}
          />
          {unit && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-text-light pointer-events-none">
              {unit}
            </span>
          )}
        </div>
        <SaveBtn state={saveState} hasValue={value.trim() !== ''} onClick={handleSave} />
      </div>
    </div>
  );
}

// ── Time input field ──────────────────────────────────────────────────────────

function TimeField({ readingType, label, required, hint, existingReading, onSave }) {
  const init = existingReading?.value_text ?? '';
  const [value,     setValue]    = useState(init);
  const [saveState, setSaveState] = useState(existingReading ? 'saved' : 'idle');
  const saved = saveState === 'saved';

  async function handleSave() {
    setSaveState('saving');
    try {
      await onSave({ reading_type: readingType, value_text: value, recorded_at: new Date().toISOString() });
      setSaveState('saved');
    } catch (err) {
      setSaveState(err?.offline ? 'queued' : 'error');
    }
  }

  return (
    <div className="form-card">
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[12px] font-semibold text-text-dark">
          {label} {required && <span className="text-warning text-[11px]">*</span>}
        </div>
        {hint && <span className="text-[10px] text-text-light">{hint}</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="time"
          value={value}
          onChange={e => { setValue(e.target.value); setSaveState('idle'); }}
          disabled={saved}
          className={`field-input flex-1 ${value ? 'field-input--active' : ''}`}
          style={{ height: '38px' }}
        />
        <SaveBtn state={saveState} hasValue={!!value} onClick={handleSave} />
      </div>
    </div>
  );
}

// Convert stored UTC ISO string → datetime-local input format (local time)
function isoToLocalInput(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d)) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Datetime-local field ──────────────────────────────────────────────────────

function DateTimeField({ readingType, label, hint, existingReading, onSave }) {
  const init = isoToLocalInput(existingReading?.value_text);
  const [value,     setValue]    = useState(init);
  const [saveState, setSaveState] = useState(existingReading ? 'saved' : 'idle');

  async function handleSave() {
    setSaveState('saving');
    try {
      const iso = value ? new Date(value).toISOString() : value;
      await onSave({ reading_type: readingType, value_text: iso, recorded_at: new Date().toISOString() });
      setSaveState('saved');
    } catch (err) {
      setSaveState(err?.offline ? 'queued' : 'error');
    }
  }

  return (
    <div className="form-card">
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[12px] font-semibold text-text-dark">{label}</div>
        {hint && <span className="text-[10px] text-text-light">{hint}</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="datetime-local"
          value={value}
          onChange={e => { setValue(e.target.value); setSaveState('idle'); }}
          className={`field-input flex-1 ${value ? 'field-input--active' : ''}`}
          style={{ height: '38px' }}
        />
        <SaveBtn state={saveState} hasValue={!!value} onClick={handleSave} />
      </div>
    </div>
  );
}

// ── Wind vane (3-option) ──────────────────────────────────────────────────────

function WindVaneField({ existingReading, onSave }) {
  const init = existingReading?.value_text ?? null;
  const [value,     setValue]    = useState(init);
  const [saveState, setSaveState] = useState(existingReading ? 'saved' : 'idle');
  const saved = saveState === 'saved';

  async function handleSave() {
    setSaveState('saving');
    try {
      await onSave({ reading_type: 'wind_vane', value_text: value, recorded_at: new Date().toISOString() });
      setSaveState('saved');
    } catch (err) {
      setSaveState(err?.offline ? 'queued' : 'error');
    }
  }

  return (
    <div className="form-card">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[12px] font-semibold text-text-dark">Wind vane readable?</div>
        <span className="text-[10px] text-text-light">Optional</span>
      </div>
      <div className="flex gap-1.5 mb-2.5">
        {['Yes', 'No', 'Not installed'].map(opt => (
          <button
            key={opt}
            onClick={() => !saved && setValue(value === opt ? null : opt)}
            disabled={saved}
            className="flex-1 h-8 rounded-lg text-[11px] font-semibold transition-colors"
            style={{
              border:     `1.5px solid ${value === opt ? 'var(--color-blue)' : 'var(--color-border)'}`,
              background: value === opt ? 'var(--color-blue-light)' : 'var(--color-surface)',
              color:      value === opt ? 'var(--color-blue-dark)'  : 'var(--color-text-light)',
            }}
          >
            {opt}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <SaveBtn state={saveState} hasValue={!!value} onClick={handleSave} />
      </div>
    </div>
  );
}

// ── Shared site condition ─────────────────────────────────────────────────────

function SiteConditionSection({ existingReading, onSave }) {
  const init = existingReading?.value_text ?? null;
  const [value,     setValue]    = useState(init);
  const [saveState, setSaveState] = useState(existingReading ? 'saved' : 'idle');
  const saved = saveState === 'saved';

  async function handleSave() {
    setSaveState('saving');
    try {
      await onSave({ reading_type: 'overall_site_condition', value_text: value, recorded_at: new Date().toISOString() });
      setSaveState('saved');
    } catch (err) {
      setSaveState(err?.offline ? 'queued' : 'error');
    }
  }

  return (
    <div className="form-card">
      <div className="text-[13px] font-bold text-text-dark mb-3">
        Overall site condition <span className="text-warning text-[11px]">*</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {[
          { value: 'good',     label: 'Good'     },
          { value: 'fair',     label: 'Fair'     },
          { value: 'poor',     label: 'Poor',     danger: true },
          { value: 'critical', label: 'Critical', danger: true },
        ].map(opt => (
          <button
            key={opt.value}
            data-selected={value === opt.value ? 'true' : undefined}
            data-danger={opt.danger ? 'true' : undefined}
            onClick={() => !saved && setValue(value === opt.value ? null : opt.value)}
            disabled={saved}
            className="note-chip"
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <SaveBtn state={saveState} hasValue={!!value} onClick={handleSave} />
      </div>
    </div>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────

function SectionDivider({ label }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: 'var(--color-text-light)',
      borderTop: '1px solid var(--color-border)',
      paddingTop: 10, marginTop: 6, marginBottom: 4,
    }}>
      {label}
    </div>
  );
}

// ── Family form components ────────────────────────────────────────────────────

function RainfallForm({ saved, onSave, visitId, stationId }) {
  function ex(type) { return saved.find(r => r.reading_type === type); }

  function parseActs(reading) {
    if (!reading?.value_text) return new Set();
    try { return new Set(JSON.parse(reading.value_text)); }
    catch { return new Set(); }
  }

  // Activity selections
  const [loggerActs, setLoggerActs] = useState(() => parseActs(ex('logger_activities')));
  const [rgActs,     setRgActs]     = useState(() => parseActs(ex('raingauge_activities')));

  // Logger-specific fields
  const [loggerSerial,      setLoggerSerial]      = useState('');
  const [loggerNotes,       setLoggerNotes]        = useState(ex('logger_problem_notes')?.value_text ?? '');
  const [loggerMaintChecks, setLoggerMaintChecks]  = useState(() => parseActs(ex('logger_maintenance_checks')));
  const [battery,      setBattery]      = useState(ex('battery_voltage')?.value_numeric != null ? String(ex('battery_voltage').value_numeric) : '');
  const [memory,       setMemory]       = useState(ex('memory_used_pct')?.value_numeric != null ? String(ex('memory_used_pct').value_numeric) : '');

  // Raingauge-specific fields
  const [rgSerial,      setRgSerial]      = useState('');
  const [rgMmPerTip,    setRgMmPerTip]    = useState('');
  const [rgCalSerial,   setRgCalSerial]   = useState('');
  const [rgCalMm,       setRgCalMm]       = useState('');
  const [rgNotes,       setRgNotes]       = useState(ex('raingauge_problem_notes')?.value_text ?? '');
  const [rgMaintChecks, setRgMaintChecks] = useState(() => parseActs(ex('raingauge_maintenance_checks')));

  // Gauge + site
  const [gaugeCondition, setGaugeCondition] = useState(() => parseActs(ex('gauge_condition')));
  const [gaugeReading,   setGaugeReading]   = useState(ex('gauge_reading')?.value_numeric != null ? String(ex('gauge_reading').value_numeric) : '');
  const [lastEmptied,    setLastEmptied]     = useState(isoToLocalInput(ex('last_emptied')?.value_text));
  const [didTip,         setDidTip]          = useState(() => { const r = ex('did_tip'); return r ? r.value_text === 'yes' : null; });
  const [siteCondition,  setSiteCondition]   = useState(ex('overall_site_condition')?.value_text ?? null);
  const [saveState,      setSaveState]       = useState('idle');

  function toggleAct(setFn, value) {
    setFn(prev => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  }

  const hasLoggerDeploy       = loggerActs.has('logger_deploy');
  const hasLoggerMaintenance  = loggerActs.has('logger_maintenance') || loggerActs.has('logger_download');
  const hasLoggerProblem      = [...loggerActs].some(v => LOGGER_PROBLEM.has(v));
  const hasRgDeploy       = rgActs.has('raingauge_deploy');
  const hasRgCal          = rgActs.has('raingauge_calibrate') || rgActs.has('raingauge_calibration_check');
  const hasRgProblem      = [...rgActs].some(v => RAINGAUGE_PROBLEM.has(v));
  const hasMaintenance    = rgActs.has('raingauge_maintenance');

  async function handleSaveAll() {
    setSaveState('saving');
    const now = new Date().toISOString();
    const saves = [];

    // Activities as JSON arrays
    if (loggerActs.size > 0)
      saves.push(onSave({ reading_type: 'logger_activities', value_text: JSON.stringify([...loggerActs]), recorded_at: now }));
    if (rgActs.size > 0)
      saves.push(onSave({ reading_type: 'raingauge_activities', value_text: JSON.stringify([...rgActs]), recorded_at: now }));

    // Logger deploy → instrument_history
    if (hasLoggerDeploy && loggerSerial.trim())
      saves.push(createInstrumentRecord(stationId, {
        instrument_type: 'datalogger', serial_no: loggerSerial.trim(),
        mm_per_tip: null, visit_id: visitId,
        notes: 'Recorded on-site by technician during visit',
      }));

    if (hasLoggerMaintenance && loggerMaintChecks.size > 0)
      saves.push(onSave({ reading_type: 'logger_maintenance_checks', value_text: JSON.stringify([...loggerMaintChecks]), recorded_at: now }));
    if (hasLoggerProblem && loggerNotes.trim())
      saves.push(onSave({ reading_type: 'logger_problem_notes', value_text: loggerNotes, recorded_at: now }));
    if (battery)
      saves.push(onSave({ reading_type: 'battery_voltage', value_numeric: parseFloat(battery), unit: '%', recorded_at: now }));
    if (memory)
      saves.push(onSave({ reading_type: 'memory_used_pct', value_numeric: parseFloat(memory), unit: '%', recorded_at: now }));

    // Raingauge deploy → instrument_history
    if (hasRgDeploy && rgSerial.trim())
      saves.push(createInstrumentRecord(stationId, {
        instrument_type: 'raingauge', serial_no: rgSerial.trim(),
        mm_per_tip: rgMmPerTip ? parseFloat(rgMmPerTip) : 0.254,
        visit_id: visitId,
        notes: 'Recorded on-site by technician during visit',
      }));

    // Raingauge calibration → instrument_history (requires both serial and mm/tip)
    if (hasRgCal && rgCalSerial.trim() && rgCalMm)
      saves.push(createInstrumentRecord(stationId, {
        instrument_type: 'raingauge', serial_no: rgCalSerial.trim(),
        mm_per_tip: parseFloat(rgCalMm), visit_id: visitId,
        notes: rgActs.has('raingauge_calibrate') ? 'Calibration recorded on-site' : 'Calibration check — factor confirmed',
      }));

    if (hasMaintenance && rgMaintChecks.size > 0)
      saves.push(onSave({ reading_type: 'raingauge_maintenance_checks', value_text: JSON.stringify([...rgMaintChecks]), recorded_at: now }));
    if (hasRgProblem && rgNotes.trim())
      saves.push(onSave({ reading_type: 'raingauge_problem_notes', value_text: rgNotes, recorded_at: now }));
    if (gaugeCondition.size > 0)
      saves.push(onSave({ reading_type: 'gauge_condition', value_text: JSON.stringify([...gaugeCondition]), recorded_at: now }));
    if (gaugeReading)
      saves.push(onSave({ reading_type: 'gauge_reading', value_numeric: parseFloat(gaugeReading), unit: 'mm', recorded_at: now }));
    if (lastEmptied)
      saves.push(onSave({ reading_type: 'last_emptied', value_text: new Date(lastEmptied).toISOString(), recorded_at: now }));
    if (didTip !== null)
      saves.push(onSave({ reading_type: 'did_tip', value_text: didTip ? 'yes' : 'no', recorded_at: now }));
    if (siteCondition)
      saves.push(onSave({ reading_type: 'overall_site_condition', value_text: siteCondition, recorded_at: now }));

    try {
      await Promise.all(saves);
      setSaveState('idle');
    } catch (err) {
      setSaveState(err?.offline ? 'idle' : 'error');
    }
  }

  const canSave = loggerActs.size > 0 && rgActs.size > 0 && gaugeCondition.size > 0 && !!siteCondition
    && (hasRgProblem || didTip !== null);

  return (
    <>
      {/* ── RAINGAUGE ────────────────────────────────────────────── */}
      <SectionDivider label="Raingauge" />

      <div className="form-card">
        <div className="text-[12px] font-semibold text-text-dark mb-2">
          What happened with the raingauge? <span className="text-warning text-[11px]">*</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RAINGAUGE_ACTS.map(opt => (
            <button key={opt.value}
              data-selected={rgActs.has(opt.value) ? 'true' : undefined}
              onClick={() => toggleAct(setRgActs, opt.value)}
              className="note-chip">
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {hasRgDeploy && (
        <div className="form-card" style={{ borderColor: '#BBF7D0' }}>
          <div className="text-[12px] font-semibold text-text-dark mb-2">New raingauge</div>
          <div className="flex flex-col gap-2">
            <input type="text" value={rgSerial} onChange={e => setRgSerial(e.target.value)}
              placeholder="New serial no. (from instrument label)"
              className={`field-input w-full ${rgSerial ? 'field-input--active' : ''}`}
              style={{ height: 36 }} />
            <div className="relative">
              <input type="number" step="0.001" value={rgMmPerTip} onChange={e => setRgMmPerTip(e.target.value)}
                placeholder="mm per tip — leave blank for 0.254 default"
                className={`field-input w-full ${rgMmPerTip ? 'field-input--active' : ''}`}
                style={{ height: 36, paddingRight: 60 }} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-text-light pointer-events-none">mm/tip</span>
            </div>
          </div>
        </div>
      )}

      {hasRgCal && (
        <div className="form-card" style={{ borderColor: '#DBEAFE' }}>
          <div className="text-[12px] font-semibold text-text-dark mb-2">
            {rgActs.has('raingauge_calibrate') ? 'Calibration details' : 'Calibration check'}
          </div>
          <div className="flex flex-col gap-2">
            <input type="text" value={rgCalSerial} onChange={e => setRgCalSerial(e.target.value)}
              placeholder="Current gauge serial no."
              className={`field-input w-full ${rgCalSerial ? 'field-input--active' : ''}`}
              style={{ height: 36 }} />
            <div className="relative">
              <input type="number" step="0.001" value={rgCalMm} onChange={e => setRgCalMm(e.target.value)}
                placeholder="Confirmed mm per tip (e.g. 0.254)"
                className={`field-input w-full ${rgCalMm ? 'field-input--active' : ''}`}
                style={{ height: 36, paddingRight: 60 }} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-text-light pointer-events-none">mm/tip</span>
            </div>
          </div>
        </div>
      )}

      <div className="form-card">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[12px] font-semibold text-text-dark">Raingauge condition <span className="text-warning text-[11px]">*</span></div>
          <span className="text-[10px] text-text-light">How did you find the gauge?</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[{ value: 'good', label: 'Good' }, { value: 'blocked', label: 'Blocked' }, { value: 'bucket_obstructed', label: 'Bucket obstructed' }, { value: 'orifice_missing', label: 'Orifice missing' }, { value: 'debris', label: 'Debris inside' }, { value: 'damaged', label: 'Damaged' }, { value: 'submerged', label: 'Submerged' }].map(opt => (
            <button key={opt.value} data-selected={gaugeCondition.has(opt.value) ? 'true' : undefined}
              onClick={() => toggleAct(setGaugeCondition, opt.value)}
              className="note-chip">{opt.label}</button>
          ))}
        </div>
      </div>

      {hasMaintenance && (
        <div className="form-card">
          <div className="text-[12px] font-semibold text-text-dark mb-1.5">Raingauge checks</div>
          <div className="text-[11px] text-text-light mb-2.5">Select all that apply.</div>
          <div className="flex flex-wrap gap-1.5">
            {RG_MAINT_CHECKS.map(opt => (
              <button key={opt}
                data-selected={rgMaintChecks.has(opt) ? 'true' : undefined}
                onClick={() => toggleAct(setRgMaintChecks, opt)}
                className="note-chip">
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasRgProblem && (
        <div className="form-card" style={{ borderColor: '#FDE68A' }}>
          <div className="text-[12px] font-semibold text-text-dark mb-1">
            Notes <span className="text-warning text-[11px]">*</span>
          </div>
          <textarea value={rgNotes} onChange={e => setRgNotes(e.target.value)}
            placeholder="e.g. Raingauge was missing — mounting bracket removed."
            rows={3} className="notes-textarea w-full" />
        </div>
      )}

      {!hasRgProblem && (
        <>
          <div className="form-card">
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="text-[12px] font-semibold text-text-dark">Rainfall accumulated in gauge</div>
              <span className="text-[10px] text-text-light">Optional</span>
            </div>
            <div className="relative" style={{ display: 'inline-block' }}>
              <input type="number" step="0.01" value={gaugeReading} onChange={e => setGaugeReading(e.target.value)}
                placeholder="0.0"
                className={`field-input ${gaugeReading ? 'field-input--active' : ''}`}
                style={{ height: '36px', width: 120, paddingRight: '34px' }} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-text-light pointer-events-none">mm</span>
            </div>
          </div>

          <div className="form-card">
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="text-[12px] font-semibold text-text-dark">When did you last check the gauge?</div>
              <span className="text-[10px] text-text-light">Optional</span>
            </div>
            <div className="flex gap-2.5">
              <div className="flex-1">
                <div className="text-[11px] text-text-light font-medium mb-1">Date</div>
                <input type="date"
                  value={lastEmptied ? lastEmptied.slice(0, 10) : ''}
                  onChange={e => setLastEmptied(e.target.value + 'T' + (lastEmptied ? lastEmptied.slice(11) : '00:00'))}
                  className={`field-input ${lastEmptied ? 'field-input--active' : ''}`} />
              </div>
              <div className="flex-1">
                <div className="text-[11px] text-text-light font-medium mb-1">Time</div>
                <input type="time"
                  value={lastEmptied ? lastEmptied.slice(11) : ''}
                  onChange={e => setLastEmptied((lastEmptied ? lastEmptied.slice(0, 10) : new Date().toISOString().slice(0, 10)) + 'T' + e.target.value)}
                  className={`field-input ${lastEmptied ? 'field-input--active' : ''}`} />
              </div>
            </div>
          </div>

          <div className="form-card">
            <div className="text-[12px] font-semibold text-text-dark mb-2">
              Did you tip the bucket manually?
              {didTip === null && <span style={{ color: 'var(--color-error)', marginLeft: 4 }}>*</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button className="note-chip" data-selected={didTip === true  ? 'true' : undefined}
                onClick={() => setDidTip(v => v === true  ? null : true)}>Yes</button>
              <button className="note-chip" data-selected={didTip === false ? 'true' : undefined}
                onClick={() => setDidTip(v => v === false ? null : false)}>No</button>
            </div>
          </div>
        </>
      )}

      {/* ── LOGGER ──────────────────────────────────────────────── */}
      <SectionDivider label="Logger" />

      <div className="form-card">
        <div className="text-[12px] font-semibold text-text-dark mb-2">
          What happened with the logger? <span className="text-warning text-[11px]">*</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LOGGER_ACTS.map(opt => (
            <button key={opt.value}
              data-selected={loggerActs.has(opt.value) ? 'true' : undefined}
              onClick={() => toggleAct(setLoggerActs, opt.value)}
              className="note-chip">
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {hasLoggerDeploy && (
        <div className="form-card" style={{ borderColor: '#BBF7D0' }}>
          <div className="text-[12px] font-semibold text-text-dark mb-2">New logger serial no.</div>
          <input type="text" value={loggerSerial} onChange={e => setLoggerSerial(e.target.value)}
            placeholder="From instrument label"
            className={`field-input w-full ${loggerSerial ? 'field-input--active' : ''}`}
            style={{ height: 36 }} />
        </div>
      )}

      {!hasLoggerProblem && (
        <div className="form-card">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[12px] font-semibold text-text-dark">Logger readings</div>
            <span className="text-[10px] text-text-light">From HOBO display (Optional)</span>
          </div>
          <div className="flex gap-8">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-text-light font-medium">Battery</span>
              <div className="relative">
                <input type="number" step="1" min="0" max="100" value={battery} onChange={e => setBattery(e.target.value)}
                  placeholder="—"
                  className={`field-input ${battery ? 'field-input--active' : ''}`}
                  style={{ height: '36px', width: 120, paddingRight: '28px' }} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-text-light pointer-events-none">%</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-text-light font-medium">Memory used</span>
              <div className="relative">
                <input type="number" step="1" min="0" max="100" value={memory} onChange={e => setMemory(e.target.value)}
                  placeholder="—"
                  className={`field-input ${memory ? 'field-input--active' : ''}`}
                  style={{ height: '36px', width: 120, paddingRight: '28px' }} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-text-light pointer-events-none">%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {hasLoggerMaintenance && (
        <div className="form-card">
          <div className="text-[12px] font-semibold text-text-dark mb-1.5">Logger checks</div>
          <div className="text-[11px] text-text-light mb-2.5">Select all that apply.</div>
          <div className="flex flex-wrap gap-1.5">
            {LOGGER_MAINT_CHECKS.map(opt => (
              <button key={opt}
                data-selected={loggerMaintChecks.has(opt) ? 'true' : undefined}
                onClick={() => toggleAct(setLoggerMaintChecks, opt)}
                className="note-chip">
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasLoggerProblem && (
        <div className="form-card" style={{ borderColor: '#FDE68A' }}>
          <div className="text-[12px] font-semibold text-text-dark mb-1">
            Notes <span className="text-warning text-[11px]">*</span>
          </div>
          <textarea value={loggerNotes} onChange={e => setLoggerNotes(e.target.value)}
            placeholder="e.g. Logger was missing from mount — bracket broken. No data since last visit."
            rows={3} className="notes-textarea w-full" />
        </div>
      )}

      {/* ── SITE ─────────────────────────────────────────────────── */}
      <SectionDivider label="Site" />

      <div className="form-card">
        <div className="text-[13px] font-bold text-text-dark mb-3">
          Overall site condition <span className="text-warning text-[11px]">*</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { value: 'good',     label: 'Good'     },
            { value: 'fair',     label: 'Fair'     },
            { value: 'poor',     label: 'Poor',     danger: true },
            { value: 'critical', label: 'Critical', danger: true },
          ].map(opt => (
            <button key={opt.value}
              data-selected={siteCondition === opt.value ? 'true' : undefined}
              data-danger={opt.danger ? 'true' : undefined}
              onClick={() => setSiteCondition(v => v === opt.value ? null : opt.value)}
              className="note-chip">
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {saveState === 'error' && (
        <div className="text-[12px] text-error text-center mb-2">Save failed — check connection and try again.</div>
      )}
      <button
        onClick={handleSaveAll}
        disabled={!canSave || saveState === 'saving'}
        className="w-full h-12 rounded-xl text-[15px] font-bold border-none transition-opacity mt-1 mb-2 bg-navy text-white"
        style={{ opacity: (!canSave || saveState === 'saving') ? 0.4 : 1 }}
      >
        {saveState === 'saving' ? 'Saving…' : 'Save'}
      </button>
    </>
  );
}

function GroundwaterForm({ saved, onSave }) {
  function ex(type) { return saved.find(r => r.reading_type === type); }
  return (
    <>
      <NumberField
        readingType="dipper_depth" label="Dipper depth" required
        hint="Measured at visit" unit="m" placeholder="0.00"
        existingReading={ex('dipper_depth')} onSave={onSave}
      />
      <TimeField
        readingType="dipper_time" label="Time of dipper reading" required
        hint="Exact time tape entered water"
        existingReading={ex('dipper_time')} onSave={onSave}
      />
      <ChipsField
        readingType="water_colour" label="Water colour / clarity" hint="Optional"
        options={[
          { value: 'clear',  label: 'Clear' },
          { value: 'turbid', label: 'Turbid' },
          { value: 'brown',  label: 'Brown' },
          { value: 'black',  label: 'Black' },
          { value: 'dry',    label: 'Dry — no water' },
        ]}
        existingReading={ex('water_colour')} onSave={onSave}
      />
      <NumberField
        readingType="battery_voltage" label="Battery voltage" hint="Optional"
        unit="V" placeholder="0.0"
        existingReading={ex('battery_voltage')} onSave={onSave}
      />
    </>
  );
}

function MetForm({ saved, onSave }) {
  function ex(type) { return saved.find(r => r.reading_type === type); }
  return (
    <>
      <ToggleField readingType="pyranometer_clean"   label="Pyranometer clean?"   required existingReading={ex('pyranometer_clean')}   onSave={onSave} />
      <ToggleField readingType="anemometer_spinning" label="Anemometer spinning?" required existingReading={ex('anemometer_spinning')} onSave={onSave} />
      <ToggleField readingType="rain_gauge_clear"    label="Rain gauge clear?"    required existingReading={ex('rain_gauge_clear')}    onSave={onSave} />
      <NumberField
        readingType="battery_voltage" label="Battery voltage" hint="Optional"
        unit="V" placeholder="0.0"
        existingReading={ex('battery_voltage')} onSave={onSave}
      />
      <WindVaneField existingReading={ex('wind_vane')} onSave={onSave} />
      <NumberField
        readingType="logger_screen" label="Data logger screen reading" hint="Optional"
        placeholder="e.g. 1024" step="1"
        existingReading={ex('logger_screen')} onSave={onSave}
      />
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

const FAMILY_LABEL = { rainfall: 'Rainfall', groundwater: 'Groundwater', met: 'Meteorological' };

export default function ManualReadings({ visitId, stationId, dataFamily, onReadingsSaved, onLoggerUnavailable }) {
  const [saved,    setSaved]    = useState([]);
  const [loaded,   setLoaded]   = useState(false);
  const [formKey,  setFormKey]  = useState(0);   // increment to remount fields after queue flush
  const calledDone  = useRef(false);
  const onlineTimer = useRef(null);

  const { enqueue, flushQueue, failedCount } = useOfflineQueue(visitId);

  // Load existing readings so fields pre-populate as ✓ Saved
  useEffect(() => {
    if (!visitId) { setLoaded(true); return; }
    getVisit(visitId)
      .then(v => { setSaved(v.readings || []); setLoaded(true); })
      .catch(()  => setLoaded(true));
  }, [visitId]);

  // Signal completion once all required readings are saved
  useEffect(() => {
    // Detect logger unavailable — notify parent so upload step can be skipped (or re-enabled)
    const loggerActsReading = saved.find(r => r.reading_type === 'logger_activities');
    let isUnavailable = false;
    if (loggerActsReading?.value_text) {
      try {
        const acts = JSON.parse(loggerActsReading.value_text);
        isUnavailable = acts.some(a => LOGGER_PROBLEM.has(a));
      } catch {}
    }
    onLoggerUnavailable?.(isUnavailable);

    if (calledDone.current) return;
    const required = REQUIRED_TYPES[dataFamily] || [];
    if (required.length === 0) return;
    const savedTypes = new Set(saved.map(r => r.reading_type));
    if (required.every(t => savedTypes.has(t))) {
      calledDone.current = true;
      onReadingsSaved?.();
    }
  }, [saved, dataFamily, onReadingsSaved]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush queued readings when reconnected (2.5s debounce for network stabilisation)
  useEffect(() => {
    if (!visitId) return;
    function handleOnline() {
      clearTimeout(onlineTimer.current);
      onlineTimer.current = setTimeout(async () => {
        const flushed = await flushQueue();
        if (flushed.length > 0) {
          setSaved(prev => [...prev, ...flushed]);
          setFormKey(k => k + 1); // remount fields — they re-read existingReading as saved
        }
      }, 2500);
    }
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      clearTimeout(onlineTimer.current);
    };
  }, [visitId, flushQueue]);

  async function handleSave(reading) {
    if (!navigator.onLine) {
      await enqueue(reading);
      const err = new Error('offline');
      err.offline = true;
      throw err;
    }
    const result = await createReading(visitId, reading);
    setSaved(prev => {
      const without = prev.filter(r => r.reading_type !== result.reading_type);
      return [...without, result];
    });
    return result;
  }

  async function handleDelete(readingType) {
    await deleteReading(visitId, readingType);
    setSaved(prev => prev.filter(r => r.reading_type !== readingType));
  }

  async function handleRetryFailed() {
    const flushed = await flushQueue();
    if (flushed.length > 0) {
      setSaved(prev => [...prev, ...flushed]);
      setFormKey(k => k + 1);
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center flex-1 text-text-light text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1" data-family={dataFamily}>
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">

        {/* Failed-sync warning */}
        {failedCount > 0 && (
          <div
            className="flex items-center justify-between bg-error-light rounded-xl px-3 py-2.5 mb-3"
            style={{ border: '1px solid rgba(183,28,28,0.2)' }}
          >
            <span className="text-[12px] text-error font-medium">
              ⚠ {failedCount} reading{failedCount !== 1 ? 's' : ''} failed to sync after 3 attempts.
            </span>
            <button
              onClick={handleRetryFailed}
              className="text-[11px] font-semibold text-error bg-transparent border-none ml-3 shrink-0"
            >
              Retry →
            </button>
          </div>
        )}

        {/* Family context strip */}
        <div className="flex items-center gap-1.5 pb-3 text-[12px] font-semibold" style={{ color: 'var(--fc-text)' }}>
          {FAMILY_LABEL[dataFamily]} station — record all readings below
        </div>

        {/* Family-specific fields + shared section — keyed so they remount after queue flush */}
        <div key={formKey}>
          {dataFamily === 'rainfall'    && <RainfallForm    saved={saved} onSave={handleSave} visitId={visitId} stationId={stationId} />}
          {dataFamily === 'groundwater' && <GroundwaterForm saved={saved} onSave={handleSave} />}
          {dataFamily === 'met'         && <MetForm         saved={saved} onSave={handleSave} />}

          {dataFamily !== 'rainfall' && (
            <SiteConditionSection
              existingReading={saved.find(r => r.reading_type === 'overall_site_condition')}
              onSave={handleSave}
            />
          )}
        </div>

      </div>
    </div>
  );
}
