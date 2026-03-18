// ManualReadings — family-specific site readings form.
// Each field has its own Save button; state is local to each field component.
// Existing readings are loaded from the server on mount to pre-populate saved state.
// Offline: readings are queued in IndexedDB and flushed when reconnected.
import { useState, useEffect, useRef } from 'react';
import { createReading, getVisit } from '../services/api.js';
import { useOfflineQueue } from '../hooks/useOfflineQueue.js';

const REQUIRED_TYPES = {
  rainfall:    ['event_type', 'gauge_condition', 'overall_site_condition'],
  groundwater: ['dipper_depth', 'dipper_time', 'overall_site_condition'],
  met:         ['pyranometer_clean', 'anemometer_spinning', 'rain_gauge_clear', 'overall_site_condition'],
};

const EVENT_TYPES = [
  { group: 'Logger', options: [
    { value: 'logger_download',     label: 'Logger download' },
    { value: 'logger_maintenance',  label: 'Logger maintenance' },
    { value: 'logger_missing',      label: 'Logger missing' },
    { value: 'logger_deploy',       label: 'Logger deployed' },
    { value: 'logger_decommission', label: 'Logger decommissioned' },
    { value: 'logger_program',      label: 'Logger programmed' },
    { value: 'logger_stopped',      label: 'Logger stopped' },
  ]},
  { group: 'Raingauge', options: [
    { value: 'raingauge_maintenance',       label: 'Raingauge maintenance' },
    { value: 'raingauge_missing',           label: 'Raingauge missing' },
    { value: 'raingauge_deploy',            label: 'Raingauge deployed' },
    { value: 'raingauge_decommission',      label: 'Raingauge decommissioned' },
    { value: 'raingauge_calibrate',         label: 'Raingauge calibration' },
    { value: 'raingauge_calibration_check', label: 'Calibration check' },
    { value: 'pseudo_events',              label: 'Non-rainfall water entry' },
  ]},
];

const PROBLEMATIC_EVENTS = new Set([
  'logger_maintenance', 'logger_missing', 'logger_stopped', 'logger_decommission',
  'raingauge_maintenance', 'raingauge_missing', 'raingauge_decommission',
]);

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
        : state === 'queued' ? '📶 Queued'
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

// ── Datetime-local field ──────────────────────────────────────────────────────

function DateTimeField({ readingType, label, hint, existingReading, onSave }) {
  const init = existingReading?.value_text ?? '';
  const [value,     setValue]    = useState(init);
  const [saveState, setSaveState] = useState(existingReading ? 'saved' : 'idle');
  const saved = saveState === 'saved';

  async function handleSave() {
    setSaveState('saving');
    try {
      // Convert datetime-local string to ISO with timezone so server-side Date parsing is unambiguous
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
          disabled={saved}
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

// ── Event type select field ───────────────────────────────────────────────────

function EventTypeField({ existingReading, onSave, onEventTypeChange }) {
  const init = existingReading?.value_text ?? '';
  const [value,     setValue]    = useState(init);
  const [saveState, setSaveState] = useState(existingReading ? 'saved' : 'idle');
  const saved = saveState === 'saved';

  useEffect(() => { onEventTypeChange?.(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleChange(e) {
    const val = e.target.value;
    setValue(val);
    setSaveState('saving');
    onEventTypeChange?.(val);
    try {
      await onSave({ reading_type: 'event_type', value_text: val, recorded_at: new Date().toISOString() });
      setSaveState('saved');
    } catch (err) {
      setSaveState(err?.offline ? 'queued' : 'error');
    }
  }

  return (
    <div className="form-card">
      <div className="flex items-baseline justify-between mb-0.5">
        <div className="text-[12px] font-semibold text-text-dark">
          Visit activity <span className="text-warning text-[11px]">*</span>
        </div>
        <span className={`text-[10px] font-semibold ${
          saveState === 'saved'  ? 'text-success' :
          saveState === 'error'  ? 'text-error'   :
          saveState === 'queued' ? 'text-blue'     : 'text-transparent'
        }`}>
          {saveState === 'saved' ? '✓ Saved' : saveState === 'error' ? 'Save failed' : saveState === 'queued' ? 'Queued' : '·'}
        </span>
      </div>
      <div className="text-[11px] text-text-light mb-1.5">What did you come to do at this station?</div>
      <select
        value={value}
        onChange={handleChange}
        className={`field-input w-full ${value ? 'field-input--active' : ''}`}
        style={{ height: '38px' }}
      >
        <option value="">Select what you did…</option>
        {EVENT_TYPES.map(group => (
          <optgroup key={group.group} label={group.group}>
            {group.options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

// ── Event problem notes field ─────────────────────────────────────────────────

function EventProblemNotesField({ existingReading, onSave }) {
  const init = existingReading?.value_text ?? '';
  const [value,     setValue]    = useState(init);
  const [saveState, setSaveState] = useState(existingReading ? 'saved' : 'idle');
  const saved = saveState === 'saved';

  async function handleSave() {
    setSaveState('saving');
    try {
      await onSave({ reading_type: 'event_problem_notes', value_text: value, recorded_at: new Date().toISOString() });
      setSaveState('saved');
    } catch (err) {
      setSaveState(err?.offline ? 'queued' : 'error');
    }
  }

  return (
    <div className="form-card" style={{ borderColor: '#FDE68A' }}>
      <div className="flex items-baseline justify-between mb-0.5">
        <div className="text-[12px] font-semibold text-text-dark">
          Describe what you found <span className="text-warning text-[11px]">*</span>
        </div>
      </div>
      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); setSaveState('idle'); }}
        placeholder="e.g. Logger was missing from mount — bracket broken. No data since last visit."
        rows={3}
        disabled={saved}
        className="notes-textarea w-full mb-2"
      />
      <div className="flex justify-end">
        <SaveBtn state={saveState} hasValue={value.trim() !== ''} onClick={handleSave} />
      </div>
    </div>
  );
}

// ── Family form components ────────────────────────────────────────────────────

function RainfallForm({ saved, onSave }) {
  function ex(type) { return saved.find(r => r.reading_type === type); }
  const initEventType = ex('event_type')?.value_text ?? '';
  const [eventType, setEventType] = useState(initEventType);
  const isProblematic = PROBLEMATIC_EVENTS.has(eventType);

  return (
    <>
      <EventTypeField
        existingReading={ex('event_type')}
        onSave={onSave}
        onEventTypeChange={setEventType}
      />
      {eventType === 'pseudo_events' ? (
        <>
          <DateTimeField
            readingType="event_start_dt" label="Water entry start" hint="When did non-rainfall tipping begin?"
            existingReading={ex('event_start_dt')} onSave={onSave}
          />
          <DateTimeField
            readingType="event_end_dt" label="Water entry end" hint="When did non-rainfall tipping stop?"
            existingReading={ex('event_end_dt')} onSave={onSave}
          />
        </>
      ) : isProblematic ? (
        <EventProblemNotesField
          existingReading={ex('event_problem_notes')}
          onSave={onSave}
        />
      ) : null}
      <ChipsField
        readingType="gauge_condition" label="Raingauge condition" required
        hint="How did you find the gauge?"
        options={[
          { value: 'good',      label: 'Good' },
          { value: 'debris',    label: 'Debris inside' },
          { value: 'damaged',   label: 'Damaged' },
          { value: 'submerged', label: 'Submerged' },
          { value: 'missing',   label: 'Missing' },
        ]}
        existingReading={ex('gauge_condition')} onSave={onSave}
      />
      <NumberField
        readingType="gauge_reading" label="Rainfall accumulated in gauge" hint="Optional"
        unit="mm" placeholder="0.0"
        existingReading={ex('gauge_reading')} onSave={onSave}
      />
      <DateTimeField
        readingType="last_emptied" label="When did you empty the gauge?" hint="Optional"
        existingReading={ex('last_emptied')} onSave={onSave}
      />
      <NumberField
        readingType="battery_voltage" label="Logger battery" hint="From HOBO display (Optional)"
        unit="%" placeholder="e.g. 87"
        existingReading={ex('battery_voltage')} onSave={onSave}
      />
      <NumberField
        readingType="memory_used_pct" label="Logger memory used" hint="From HOBO display (Optional)"
        unit="%" placeholder="e.g. 45" step="1"
        existingReading={ex('memory_used_pct')} onSave={onSave}
      />
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

export default function ManualReadings({ visitId, dataFamily, onReadingsSaved }) {
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
    if (calledDone.current) return;
    const required = REQUIRED_TYPES[dataFamily] || [];
    if (required.length === 0) return;
    const savedTypes = new Set(saved.map(r => r.reading_type));
    if (required.every(t => savedTypes.has(t))) {
      calledDone.current = true;
      onReadingsSaved?.();
    }
  }, [saved, dataFamily, onReadingsSaved]);

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
    setSaved(prev => [...prev, result]);
    return result;
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
          {dataFamily === 'rainfall'    && <RainfallForm    saved={saved} onSave={handleSave} />}
          {dataFamily === 'groundwater' && <GroundwaterForm saved={saved} onSave={handleSave} />}
          {dataFamily === 'met'         && <MetForm         saved={saved} onSave={handleSave} />}

          <SiteConditionSection
            existingReading={saved.find(r => r.reading_type === 'overall_site_condition')}
            onSave={handleSave}
          />
        </div>

      </div>
    </div>
  );
}