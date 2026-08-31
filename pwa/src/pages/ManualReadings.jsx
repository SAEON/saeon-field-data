import { useState, useEffect, useRef } from 'react';
import { createReading, deleteReading, getVisit, createInstrumentRecord, getStationSensors, getTransferStandards, createCalibrationCheck, getCalibrationChecks, getMetInstrumentTypes, assignSensor, decommissionSensor } from '../services/api.js';
import { useOfflineQueue } from '../hooks/useOfflineQueue.js';

const REQUIRED_TYPES = {
  rainfall:           ['logger_activities', 'raingauge_activities', 'gauge_condition', 'overall_site_condition'],
  groundwater_level:  ['logger_activities', 'dipper_depth', 'dipper_time', 'overall_site_condition'],
  groundwater_baro:   ['logger_activities', 'overall_site_condition'],
  met:                ['met_activities', 'pyranometer_clean', 'anemometer_spinning', 'rain_gauge_clear', 'overall_site_condition'],
};

const MET_ACTS = [
  { value: 'download',          label: 'Download' },
  { value: 'maintenance',       label: 'Maintenance' },
  { value: 'calibration_check', label: 'Calibration check' },
  { value: 'instrument_change', label: 'Instrument change' },
];

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
  { value: 'raingauge_download',          label: 'Download' },
  { value: 'raingauge_maintenance',       label: 'Maintenance' },
  { value: 'raingauge_deploy',            label: 'Deploy' },
  { value: 'raingauge_calibration_check', label: 'Calibration check' },
  { value: 'raingauge_decommission',      label: 'Decommission' },
  { value: 'raingauge_calibrate',         label: 'Calibrate' },
];

const RG_MAINT_CHECKS     = ['Funnel removed & inspected', 'Funnel clear of obstruction', 'Tipping mechanism checked', 'Tipping mechanism cleaned', 'Bubble level OK', 'Cable connection intact', 'Bracket secure', 'Bucket test done'];
const LOGGER_MAINT_CHECKS = ['Display checked', 'Battery changed', 'Cable intact', 'Connections checked', 'Memory full — reset', 'Memory reset', 'Logger relaunched', 'Mount secure', 'Enclosure inspected'];

const LOGGER_PROBLEM    = new Set(['logger_missing', 'logger_stopped', 'logger_decommission']);
const RAINGAUGE_PROBLEM = new Set(['raingauge_decommission']);


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

  const [loggerActs, setLoggerActs] = useState(() => parseActs(ex('logger_activities')));
  const [rgActs,     setRgActs]     = useState(() => parseActs(ex('raingauge_activities')));
  const [loggerSerial,      setLoggerSerial]      = useState('');
  const [loggerNotes,       setLoggerNotes]        = useState(ex('logger_problem_notes')?.value_text ?? '');
  const [loggerMaintChecks, setLoggerMaintChecks]  = useState(() => parseActs(ex('logger_maintenance_checks')));
  const [battery, setBattery] = useState(ex('battery_voltage')?.value_numeric != null ? String(ex('battery_voltage').value_numeric) : '');
  const [memory,  setMemory]  = useState(ex('memory_used_pct')?.value_numeric != null ? String(ex('memory_used_pct').value_numeric) : '');
  const [rgSerial,      setRgSerial]      = useState('');
  const [rgMmPerTip,    setRgMmPerTip]    = useState('');
  const [rgCalSerial,       setRgCalSerial]       = useState('');
  const [rgCalMm,           setRgCalMm]           = useState('');
  const [rgCalExpectedTips, setRgCalExpectedTips] = useState('');
  const [rgCalActualTips,   setRgCalActualTips]   = useState('');
  const [rgNotes,       setRgNotes]       = useState(ex('raingauge_problem_notes')?.value_text ?? '');
  const [rgMaintChecks, setRgMaintChecks] = useState(() => parseActs(ex('raingauge_maintenance_checks')));
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

  function toggleGaugeCondition(value) {
    setGaugeCondition(prev => {
      if (prev.has(value)) return new Set();
      if (value === 'good' || value === 'missing') return new Set([value]);
      const next = new Set(prev);
      next.delete('good');
      next.delete('missing'); // any observable condition means gauge is present
      next.add(value);
      return next;
    });
  }

  const hasLoggerDeploy       = loggerActs.has('logger_deploy');
  const hasLoggerMaintenance  = loggerActs.has('logger_maintenance') || loggerActs.has('logger_download');
  const hasLoggerProblem      = [...loggerActs].some(v => LOGGER_PROBLEM.has(v));
  const hasRgDeploy       = rgActs.has('raingauge_deploy');
  const hasRgCal          = rgActs.has('raingauge_calibrate') || rgActs.has('raingauge_calibration_check');
  const hasRgProblem      = [...rgActs].some(v => RAINGAUGE_PROBLEM.has(v)) || gaugeCondition.has('missing');
  const hasMaintenance    = rgActs.has('raingauge_maintenance');

  async function handleSaveAll() {
    setSaveState('saving');
    const now = new Date().toISOString();
    const saves = [];

    if (loggerActs.size > 0)
      saves.push(() => onSave({ reading_type: 'logger_activities', value_text: JSON.stringify([...loggerActs]), recorded_at: now }));
    if (rgActs.size > 0)
      saves.push(() => onSave({ reading_type: 'raingauge_activities', value_text: JSON.stringify([...rgActs]), recorded_at: now }));

    if (hasLoggerDeploy && loggerSerial.trim())
      saves.push(() => createInstrumentRecord(stationId, {
        instrument_type: 'datalogger', serial_no: loggerSerial.trim(),
        mm_per_tip: null, visit_id: visitId,
        notes: 'Recorded on-site by technician during visit',
      }));

    if (hasLoggerMaintenance && loggerMaintChecks.size > 0)
      saves.push(() => onSave({ reading_type: 'logger_maintenance_checks', value_text: JSON.stringify([...loggerMaintChecks]), recorded_at: now }));
    if (hasLoggerProblem && loggerNotes.trim())
      saves.push(() => onSave({ reading_type: 'logger_problem_notes', value_text: loggerNotes, recorded_at: now }));
    if (battery)
      saves.push(() => onSave({ reading_type: 'battery_voltage', value_numeric: parseFloat(battery), unit: '%', recorded_at: now }));
    if (memory)
      saves.push(() => onSave({ reading_type: 'memory_used_pct', value_numeric: parseFloat(memory), unit: '%', recorded_at: now }));

    if (hasRgDeploy && rgSerial.trim())
      saves.push(() => createInstrumentRecord(stationId, {
        instrument_type: 'raingauge', serial_no: rgSerial.trim(),
        mm_per_tip: rgMmPerTip ? parseFloat(rgMmPerTip) : 0.254,
        visit_id: visitId,
        notes: 'Recorded on-site by technician during visit',
      }));

    if (hasRgCal && rgCalSerial.trim() && rgCalMm)
      saves.push(() => createInstrumentRecord(stationId, {
        instrument_type: 'raingauge', serial_no: rgCalSerial.trim(),
        mm_per_tip: parseFloat(rgCalMm), visit_id: visitId,
        notes: rgActs.has('raingauge_calibrate') ? 'Calibration recorded on-site' : 'Calibration check — factor confirmed',
      }));
    if (rgActs.has('raingauge_calibration_check')) {
      if (rgCalExpectedTips) saves.push(() => onSave({ reading_type: 'cal_check_expected_tips', value_numeric: parseFloat(rgCalExpectedTips), recorded_at: now }));
      if (rgCalActualTips)   saves.push(() => onSave({ reading_type: 'cal_check_actual_tips',   value_numeric: parseFloat(rgCalActualTips),   recorded_at: now }));
    }

    if (hasMaintenance && rgMaintChecks.size > 0)
      saves.push(() => onSave({ reading_type: 'raingauge_maintenance_checks', value_text: JSON.stringify([...rgMaintChecks]), recorded_at: now }));
    if (hasRgProblem && rgNotes.trim())
      saves.push(() => onSave({ reading_type: 'raingauge_problem_notes', value_text: rgNotes, recorded_at: now }));
    if (gaugeCondition.size > 0)
      saves.push(() => onSave({ reading_type: 'gauge_condition', value_text: JSON.stringify([...gaugeCondition]), recorded_at: now }));
    if (gaugeReading)
      saves.push(() => onSave({ reading_type: 'gauge_reading', value_numeric: parseFloat(gaugeReading), unit: 'mm', recorded_at: now }));
    if (lastEmptied)
      saves.push(() => onSave({ reading_type: 'last_emptied', value_text: new Date(lastEmptied).toISOString(), recorded_at: now }));
    if (didTip !== null)
      saves.push(() => onSave({ reading_type: 'did_tip', value_text: didTip ? 'yes' : 'no', recorded_at: now }));
    if (siteCondition)
      saves.push(() => onSave({ reading_type: 'overall_site_condition', value_text: siteCondition, recorded_at: now }));

    try {
      for (const save of saves) await save();
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
          Purpose of visit? <span className="text-warning text-[11px]">*</span>
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
              placeholder="Gauge serial no."
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
          {rgActs.has('raingauge_calibration_check') && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
              <div className="text-[11px] text-text-light mb-2">
                Pour a known volume through the gauge and record the tip counts.
              </div>
              <div className="flex gap-3">
                <div className="flex flex-col gap-1 flex-1">
                  <span className="text-[11px] text-text-light font-medium">Expected tips</span>
                  <input type="number" step="1" min="0" value={rgCalExpectedTips} onChange={e => setRgCalExpectedTips(e.target.value)}
                    placeholder="e.g. 100"
                    className={`field-input w-full ${rgCalExpectedTips ? 'field-input--active' : ''}`}
                    style={{ height: 36 }} />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <span className="text-[11px] text-text-light font-medium">Actual tips</span>
                  <input type="number" step="1" min="0" value={rgCalActualTips} onChange={e => setRgCalActualTips(e.target.value)}
                    placeholder="e.g. 97"
                    className={`field-input w-full ${rgCalActualTips ? 'field-input--active' : ''}`}
                    style={{ height: 36 }} />
                </div>
              </div>
              {rgCalExpectedTips && rgCalActualTips && (() => {
                const pct = ((parseFloat(rgCalActualTips) / parseFloat(rgCalExpectedTips)) * 100).toFixed(1);
                const drift = Math.abs(100 - parseFloat(pct));
                const pass = drift <= 3;
                return (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] font-semibold" style={{ color: pass ? 'var(--color-success)' : 'var(--color-error)' }}>
                      {pass ? '✓ Pass' : '⚠ Fail'}
                    </span>
                    <span className="text-[11px] text-text-light">
                      {pct}% accuracy ({drift.toFixed(1)}% drift) —{' '}
                      {pass ? 'proceed to calibration' : 'do not calibrate, flag for inspection'}
                    </span>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {hasMaintenance && (
        <div className="form-card">
          <div className="text-[12px] font-semibold text-text-dark mb-1.5">Routine maintenance checks</div>
          <div className="text-[11px] text-text-light mb-2.5">Select all completed.</div>
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

      <div className="form-card">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[12px] font-semibold text-text-dark">Raingauge condition <span className="text-warning text-[11px]">*</span></div>
          <span className="text-[10px] text-text-light">How did you find the gauge?</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[{ value: 'good', label: 'Good' }, { value: 'missing', label: 'Missing' }, { value: 'mechanism_washed', label: 'Mechanism washed' }, { value: 'blocked', label: 'Blocked' }, { value: 'bucket_obstructed', label: 'Bucket obstructed' }, { value: 'orifice_missing', label: 'Orifice missing' }, { value: 'debris', label: 'Debris inside' }, { value: 'damaged', label: 'Damaged' }, { value: 'submerged', label: 'Submerged' }].map(opt => (
            <button key={opt.value} data-selected={gaugeCondition.has(opt.value) ? 'true' : undefined}
              onClick={() => toggleGaugeCondition(opt.value)}
              className="note-chip">{opt.label}</button>
          ))}
        </div>
      </div>

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

      {/* ── LOGGER ──────────────────────────────────────────────── */}
      <SectionDivider label="Logger" />

      <div className="form-card">
        <div className="text-[12px] font-semibold text-text-dark mb-2">
          Logger activity <span className="text-warning text-[11px]">*</span>
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

function BarologgerForm({ saved, onSave }) {
  function ex(type) { return saved.find(r => r.reading_type === type); }
  return (
    <>
      <ChipsField
        readingType="logger_activities" label="Logger activity" required
        options={LOGGER_ACTS}
        existingReading={ex('logger_activities')} onSave={onSave}
      />
      <NumberField
        readingType="battery_voltage" label="Battery voltage" hint="Optional"
        unit="V" placeholder="0.0"
        existingReading={ex('battery_voltage')} onSave={onSave}
      />
    </>
  );
}

function GroundwaterForm({ saved, onSave }) {
  function ex(type) { return saved.find(r => r.reading_type === type); }
  return (
    <>
      <ChipsField
        readingType="logger_activities" label="Logger activity" required
        options={LOGGER_ACTS}
        existingReading={ex('logger_activities')} onSave={onSave}
      />
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

function MetForm({ saved, onSave, onCalibrationSelected }) {
  function ex(type) { return saved.find(r => r.reading_type === type); }

  function normYesNo(v) {
    if (!v) return null;
    if (v === 'true')  return 'yes';
    if (v === 'false') return 'no';
    return v;
  }

  const [metActs,   setMetActs]   = useState(() => {
    const r = ex('met_activities');
    if (!r?.value_text) return new Set();
    try { return new Set(JSON.parse(r.value_text)); } catch { return new Set(); }
  });
  const [pyrano,    setPyrano]    = useState(() => normYesNo(ex('pyranometer_clean')?.value_text));
  const [anemo,     setAnemo]     = useState(() => normYesNo(ex('anemometer_spinning')?.value_text));
  const [rainGauge, setRainGauge] = useState(() => normYesNo(ex('rain_gauge_clear')?.value_text));
  const [battery,   setBattery]   = useState(ex('battery_voltage')?.value_numeric != null ? String(ex('battery_voltage').value_numeric) : '');
  const [windVane,  setWindVane]  = useState(ex('wind_vane')?.value_text ?? null);
  const [logger,    setLogger]    = useState(ex('logger_screen')?.value_numeric != null ? String(ex('logger_screen').value_numeric) : '');
  const [siteCond,  setSiteCond]  = useState(ex('overall_site_condition')?.value_text ?? null);

  const isAlreadySaved = !!(ex('met_activities') && ex('pyranometer_clean') && ex('anemometer_spinning') && ex('rain_gauge_clear') && ex('overall_site_condition'));
  const [saveState, setSaveState] = useState(isAlreadySaved ? 'saved' : 'idle');
  const locked = saveState === 'saved';

  function toggleAct(value) {
    if (locked) return;
    setMetActs(prev => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      onCalibrationSelected(next.has('calibration_check'));
      return next;
    });
    setSaveState('idle');
  }

  async function handleSave() {
    setSaveState('saving');
    const now = new Date().toISOString();
    const saves = [
      () => onSave({ reading_type: 'met_activities',    value_text:    JSON.stringify([...metActs]),        recorded_at: now }),
      ...(pyrano    ? [() => onSave({ reading_type: 'pyranometer_clean',   value_text:    pyrano,                     recorded_at: now })] : []),
      ...(anemo     ? [() => onSave({ reading_type: 'anemometer_spinning', value_text:    anemo,                      recorded_at: now })] : []),
      ...(rainGauge ? [() => onSave({ reading_type: 'rain_gauge_clear',    value_text:    rainGauge,                  recorded_at: now })] : []),
      ...(battery   ? [() => onSave({ reading_type: 'battery_voltage',     value_numeric: parseFloat(battery), unit: 'V', recorded_at: now })] : []),
      ...(windVane  ? [() => onSave({ reading_type: 'wind_vane',           value_text:    windVane,                   recorded_at: now })] : []),
      ...(logger    ? [() => onSave({ reading_type: 'logger_screen',       value_numeric: parseFloat(logger),         recorded_at: now })] : []),
      ...(siteCond  ? [() => onSave({ reading_type: 'overall_site_condition', value_text: siteCond,                   recorded_at: now })] : []),
    ];
    try {
      for (const fn of saves) await fn();
      setSaveState('saved');
    } catch (err) {
      setSaveState(err?.offline ? 'queued' : 'error');
    }
  }

  const canSave = !locked && metActs.size > 0 && !!pyrano && !!anemo && !!rainGauge && !!siteCond;

  return (
    <div className="form-card">
      <div className="text-[12px] font-semibold text-text-dark mb-2">
        Purpose of visit <span className="text-warning text-[11px]">*</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {MET_ACTS.map(opt => (
          <button
            key={opt.value}
            data-selected={metActs.has(opt.value) ? 'true' : undefined}
            onClick={() => toggleAct(opt.value)}
            disabled={locked}
            className="note-chip"
          >{opt.label}</button>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)', marginBottom: '0.75rem' }} />

      {[
        { key: 'pyr', label: 'Pyranometer clean?',  val: pyrano,    set: v => { setPyrano(v);    setSaveState('idle'); } },
        { key: 'ane', label: 'Anemometer spinning?', val: anemo,     set: v => { setAnemo(v);     setSaveState('idle'); } },
        { key: 'rg',  label: 'Rain gauge clear?',    val: rainGauge, set: v => { setRainGauge(v); setSaveState('idle'); } },
      ].map(({ key, label, val, set }) => (
        <div key={key} className="mb-3">
          <div className="text-[12px] font-semibold text-text-dark mb-1.5">
            {label} <span className="text-warning text-[11px]">*</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[['Yes', 'yes'], ['No', 'no']].map(([lbl, v]) => (
              <button key={lbl} onClick={() => !locked && set(val === v ? null : v)} disabled={locked}
                data-selected={val === v ? 'true' : undefined}
                className="note-chip"
              >{lbl}</button>
            ))}
          </div>
        </div>
      ))}

      <div style={{ borderTop: '1px solid var(--color-border)', marginBottom: '0.75rem' }} />

      <div className="mb-3">
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="text-[12px] font-semibold text-text-dark">Battery voltage</div>
          <span className="text-[10px] text-text-light">Optional</span>
        </div>
        <div className="relative" style={{ display: 'inline-block' }}>
          <input type="number" step="0.1" min="0" value={battery}
            onChange={e => { setBattery(e.target.value); setSaveState('idle'); }}
            disabled={locked} placeholder="12.6"
            className={`field-input ${battery ? 'field-input--active' : ''}`}
            style={{ height: '36px', width: 120, paddingRight: '30px' }}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-text-light pointer-events-none">V</span>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="text-[12px] font-semibold text-text-dark">Wind vane readable?</div>
          <span className="text-[10px] text-text-light">Optional</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['Yes', 'No', 'Not installed'].map(opt => (
            <button key={opt}
              onClick={() => { if (!locked) { setWindVane(windVane === opt ? null : opt); setSaveState('idle'); } }}
              disabled={locked}
              data-selected={windVane === opt ? 'true' : undefined}
              className="note-chip"
            >{opt}</button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="text-[12px] font-semibold text-text-dark">Logger screen reading</div>
          <span className="text-[10px] text-text-light">Optional</span>
        </div>
        <input type="number" step="1" min="0" value={logger}
          onChange={e => { setLogger(e.target.value); setSaveState('idle'); }}
          disabled={locked} placeholder="e.g. 1024"
          className={`field-input ${logger ? 'field-input--active' : ''}`}
          style={{ height: '36px', width: 120 }}
        />
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)', marginBottom: '0.75rem' }} />

      <div className="mb-4">
        <div className="text-[13px] font-bold text-text-dark mb-2">
          Overall site condition <span className="text-warning text-[11px]">*</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { value: 'good',     label: 'Good' },
            { value: 'fair',     label: 'Fair' },
            { value: 'poor',     label: 'Poor',     danger: true },
            { value: 'critical', label: 'Critical', danger: true },
          ].map(opt => (
            <button key={opt.value}
              data-selected={siteCond === opt.value ? 'true' : undefined}
              data-danger={opt.danger ? 'true' : undefined}
              onClick={() => { if (!locked) { setSiteCond(siteCond === opt.value ? null : opt.value); setSaveState('idle'); } }}
              disabled={locked}
              className="note-chip"
            >{opt.label}</button>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!canSave || saveState === 'saving'}
        className="w-full h-12 rounded-xl text-[15px] font-bold border-none transition-opacity mt-1 bg-navy text-white"
        style={{ opacity: (!canSave || saveState === 'saving') ? 0.4 : 1 }}
      >
        {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'queued' ? '≡ Queued' : saveState === 'error' ? 'Retry' : 'Save'}
      </button>
    </div>
  );
}

// ── Met sensor confirmation ───────────────────────────────────────────────────


function MetSensorConfirmationSection({ stationId, visitId, onAllConfirmed, onSensorsChanged }) {
  const [sensors,    setSensors]    = useState(null);
  const [types,      setTypes]      = useState([]);
  const [cardState,  setCardState]  = useState({});
  const [changeData, setChangeData] = useState({});
  const [error,      setError]      = useState(null);

  useEffect(() => {
    Promise.all([getStationSensors(stationId), getMetInstrumentTypes()])
      .then(([s, t]) => {
        setSensors(s);
        setTypes(t);
        const init = {};
        s.forEach(sensor => { init[sensor.id] = 'idle'; });
        setCardState(init);
      })
      .catch(() => setError('Could not load deployed sensors.'));
  }, [stationId]);

  useEffect(() => {
    if (!sensors) return;
    const allDone = sensors.every(s => ['confirmed', 'saved'].includes(cardState[s.id]));
    onAllConfirmed(sensors.length === 0 || allDone);
  }, [cardState, sensors]);

  function setField(sensorId, field, value) {
    setChangeData(prev => ({ ...prev, [sensorId]: { ...prev[sensorId], [field]: value } }));
  }

  function confirm(sensorId) {
    setCardState(prev => ({ ...prev, [sensorId]: 'confirmed' }));
  }

  function startChange(sensorId) {
    setCardState(prev => ({ ...prev, [sensorId]: 'changing' }));
    setChangeData(prev => ({ ...prev, [sensorId]: { mode: 'swap', newTypeId: '', newSerial: '' } }));
  }

  async function saveChange(sensor) {
    const data = changeData[sensor.id] || {};
    setCardState(prev => ({ ...prev, [sensor.id]: 'saving' }));
    try {
      if (data.mode === 'decommission') {
        await decommissionSensor(stationId, sensor.id);
      } else {
        const typeId = data.mode === 'swap' ? sensor.instrument_type_id : parseInt(data.newTypeId, 10);
        await assignSensor(stationId, {
          instrument_type_id: typeId,
          serial_no:          data.newSerial || null,
          effective_from:     new Date().toISOString(),
          visit_id:           visitId,
        });
      }
      setCardState(prev => ({ ...prev, [sensor.id]: 'saved' }));
      setSensors(prev => prev.filter(s => s.id !== sensor.id));
      onSensorsChanged();
    } catch {
      setCardState(prev => ({ ...prev, [sensor.id]: 'error' }));
    }
  }

  if (error) return <div className="form-card text-[12px] text-error">{error}</div>;
  if (!sensors) return <div className="form-card text-[12px] text-text-light">Loading deployed sensors…</div>;

  if (sensors.length === 0) {
    return (
      <div className="form-card text-[12px] text-text-light">
        No sensors registered for this station. Add sensors via the Station Registry before recording a visit.
      </div>
    );
  }

  const SOIL_CATS = new Set(['soil', 'leaf_wetness']);

  return (
    <>
      <div className="flex items-center gap-1.5 pb-2 pt-1 text-[12px] font-semibold text-text-dark">
        Confirm deployed sensors
      </div>
      {sensors.map(sensor => {
        const state = cardState[sensor.id];
        const data  = changeData[sensor.id] || {};

        if (state === 'confirmed' || state === 'saved') {
          return (
            <div key={sensor.id} className="form-card flex items-center justify-between">
              <div>
                <div className="text-[12px] font-semibold text-text-dark">{sensor.label}</div>
                {sensor.serial_no && <div className="text-[11px] text-text-light">S/N: {sensor.serial_no}</div>}
              </div>
              <span className="text-[11px] font-semibold text-success">✓ Confirmed</span>
            </div>
          );
        }

        const mode = data.mode || 'swap';
        const selectedType = mode === 'upgrade' ? types.find(t => t.id === parseInt(data.newTypeId)) : null;
        const canSave = state !== 'saving' && (
          mode === 'decommission' ||
          (mode === 'swap'    && data.newSerial?.trim()) ||
          (mode === 'upgrade' && data.newTypeId && (SOIL_CATS.has(selectedType?.category) || data.newSerial?.trim()))
        );

        return (
          <div key={sensor.id} className="form-card">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-[12px] font-semibold text-text-dark">{sensor.label}</div>
                {sensor.serial_no && <div className="text-[11px] text-text-light">S/N: {sensor.serial_no}</div>}
              </div>
              {state === 'idle' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => confirm(sensor.id)}
                    className="px-2.5 h-7 rounded-md text-[11px] font-semibold bg-success-light text-success border-none"
                  >
                    No change
                  </button>
                  <button
                    onClick={() => startChange(sensor.id)}
                    className="px-2.5 h-7 rounded-md text-[11px] font-semibold bg-surface-dark text-text-dark border-none"
                  >
                    Changed
                  </button>
                </div>
              )}
            </div>

            {state === 'changing' || state === 'saving' || state === 'error' ? (
              <div className="pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>

                {mode !== 'decommission' && (
                  <input
                    type="text"
                    placeholder="New serial number"
                    value={data.newSerial || ''}
                    onChange={e => setField(sensor.id, 'newSerial', e.target.value)}
                    className="w-full h-9 rounded-lg px-2 text-[12px] bg-surface-dark text-text-dark border-none mb-3"
                  />
                )}

                {mode === 'upgrade' && (
                  <select
                    value={data.newTypeId || ''}
                    onChange={e => setField(sensor.id, 'newTypeId', e.target.value)}
                    className="w-full h-9 rounded-lg px-2 text-[12px] bg-surface-dark text-text-dark border-none mb-3"
                  >
                    <option value="">Select new instrument type…</option>
                    {Object.entries(
                      types.reduce((acc, t) => { (acc[t.category] ??= []).push(t); return acc; }, {})
                    ).map(([cat, items]) => (
                      <optgroup key={cat} label={cat.replace(/_/g, ' ')}>
                        {items.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                )}

                {mode === 'decommission' && (
                  <div className="text-[11px] text-warning mb-3">
                    This sensor will be marked as removed from {new Date().toLocaleDateString()}.
                  </div>
                )}

                <div className="flex gap-3 mb-3 text-[11px]">
                  {[
                    { value: 'swap',         label: `Same model (${sensor.model || sensor.label})` },
                    { value: 'upgrade',      label: 'Different model' },
                    { value: 'decommission', label: 'Decommission' },
                  ].map(opt => (
                    <label key={opt.value} className="flex items-center gap-1 cursor-pointer text-text-light">
                      <input
                        type="radio"
                        name={`mode-${sensor.id}`}
                        value={opt.value}
                        checked={mode === opt.value}
                        onChange={() => setField(sensor.id, 'mode', opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setCardState(prev => ({ ...prev, [sensor.id]: 'idle' }))}
                    className="px-3 h-8 rounded-lg text-[11px] font-semibold bg-surface-dark text-text-light border-none"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => saveChange(sensor)}
                    disabled={!canSave}
                    className="flex-1 h-8 rounded-lg text-[11px] font-semibold border-none text-white transition-colors"
                    style={{ background: canSave ? 'var(--color-navy)' : '#BDBDBD' }}
                  >
                    {state === 'saving' ? 'Saving…' : 'Save change'}
                  </button>
                </div>
                {state === 'error' && (
                  <div className="text-[11px] text-error mt-1">Save failed — tap to retry</div>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

// ── Calibration check card ────────────────────────────────────────────────────

const PARAM_UNIT = { temperature: '°C', humidity: '%', pressure: ' hPa' };

function CalibrationCheckCard({ card, transferStandards, visitId, onSaved, existingCheck }) {
  const [tsId,           setTsId]           = useState('');
  const [tsReading,      setTsReading]      = useState('');
  const [sensorReading,  setSensorReading]  = useState('');
  const [offsetApplied,  setOffsetApplied]  = useState('');
  const [postCalReading, setPostCalReading] = useState('');
  const [verifyReading,  setVerifyReading]  = useState('');
  const [remarks,        setRemarks]        = useState('');
  const [saveState,      setSaveState]      = useState('idle');
  const [savedCheck,     setSavedCheck]     = useState(existingCheck ?? null);

  const { station_sensor_id, parameter, label, serial_no, tolerance } = card;
  const unit = PARAM_UNIT[parameter] ?? '';

  const relevant = transferStandards.filter(ts => Array.isArray(ts.parameters) && ts.parameters.includes(parameter));
  const byKit = {};
  for (const ts of relevant) { (byKit[ts.kit_label] ??= []).push(ts); }

  const tsNum = tsReading     !== '' ? Number(tsReading)     : null;
  const snNum = sensorReading !== '' ? Number(sensorReading) : null;
  const asFoundError = tsNum != null && snNum != null ? tsNum - snNum : null;
  const phase1HasReadings = !!tsId && tsNum != null && snNum != null;
  const phase1Pass =
    asFoundError == null ? null
    : tolerance  != null ? Math.abs(asFoundError) <= tolerance
    : true;

  const postNum   = postCalReading !== '' ? Number(postCalReading) : null;
  const verifyNum = verifyReading  !== '' ? Number(verifyReading)  : null;
  const asLeftError = verifyNum != null && postNum != null ? verifyNum - postNum : null;
  const phase2HasReadings = offsetApplied !== '' && postNum != null && verifyNum != null;
  const phase2Pass =
    asLeftError == null ? null
    : tolerance  != null ? Math.abs(asLeftError) <= tolerance
    : true;

  let canSave = false;
  let saveLabel = 'Save';
  if (savedCheck) {
    saveLabel = '✓ Saved';
  } else if (saveState === 'saving') {
    saveLabel = 'Saving…';
  } else if (phase1HasReadings) {
    if (phase1Pass !== false) {
      canSave = true;
      saveLabel = tolerance != null ? 'Save — Passed' : 'Save';
    } else if (!phase2HasReadings) {
      saveLabel = 'Complete correction below';
    } else if (phase2Pass !== false) {
      canSave = true;
      saveLabel = 'Save — Corrected & Passed';
    } else if (!remarks.trim()) {
      saveLabel = 'Add remarks to save';
    } else {
      canSave = true;
      saveLabel = 'Save — Flagged (out of tolerance)';
    }
  }

  async function handleSave() {
    if (!canSave) return;
    setSaveState('saving');
    try {
      const check = await createCalibrationCheck(visitId, {
        station_sensor_id,
        transfer_standard_id: parseInt(tsId, 10),
        parameter,
        calibration_date:  new Date().toISOString().slice(0, 10),
        transfer_std_reading:               tsNum,
        sensor_reading:                     snNum,
        correction_applied:                 phase1Pass === false,
        offset_applied:                     offsetApplied !== '' ? Number(offsetApplied) : null,
        station_reading_post_cal:           postNum,
        transfer_std_verification_reading:  verifyNum,
        remarks: remarks.trim() || null,
      });
      setSavedCheck(check);
      setSaveState('saved');
      onSaved();
    } catch {
      setSaveState('error');
    }
  }

  function ErrorBadge({ error, pass }) {
    if (error == null) return null;
    const sign = error >= 0 ? '+' : '';
    const tolStr = tolerance != null ? ` (tol. ±${tolerance}${unit})` : '';
    const passTag = tolerance != null ? ` — ${pass ? 'PASS' : 'FAIL'}` : '';
    return (
      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ml-2 ${
        pass === false ? 'bg-error-light text-error' : 'bg-success-light text-success'
      }`}>
        {sign}{error.toFixed(3)}{unit}{tolStr}{passTag}
      </span>
    );
  }

  if (savedCheck) {
    const outcome = savedCheck.within_tolerance === false
      ? (savedCheck.post_cal_within_tolerance ? 'Corrected — within tolerance' : 'Flagged: outside tolerance')
      : 'Within tolerance';
    return (
      <div className="form-card">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[12px] font-semibold text-text-dark">{label}</span>
          <span className="text-[11px] capitalize px-2 py-0.5 rounded-full bg-surface-dark text-text-light">{parameter}</span>
        </div>
        <div className="text-[11px] text-success font-medium mt-1">✓ Calibration check saved</div>
        <div className="text-[11px] text-text-light mt-0.5">{outcome}</div>
      </div>
    );
  }

  return (
    <div className="form-card">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-[12px] font-semibold text-text-dark">{label}</span>
          {serial_no && (
            <div className="text-[11px] text-text-light mt-0.5">
              Confirm instrument S/N matches: <span className="font-semibold text-text-dark">{serial_no}</span>
            </div>
          )}
        </div>
        <span className="text-[11px] capitalize px-2 py-0.5 rounded-full bg-surface-dark text-text-light shrink-0 ml-2">{parameter}</span>
      </div>

      <div className="mb-2">
        <label className="text-[11px] text-text-light block mb-1">Transfer standard</label>
        <select
          value={tsId}
          onChange={e => setTsId(e.target.value)}
          className="w-full h-9 rounded-lg px-2 text-[12px] bg-surface-dark text-text-dark border-none"
        >
          <option value="">Select kit…</option>
          {Object.entries(byKit).map(([kit, stds]) => (
            <optgroup key={kit} label={kit}>
              {stds.map(ts => (
                <option key={ts.id} value={ts.id}>
                  {ts.overdue ? '⚠ ' : ''}{kit} — {ts.model} (S/N: {ts.serial_no})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {relevant.some(ts => ts.overdue) && (
          <div className="text-[11px] text-warning mt-1">⚠ One or more kits are past their calibration due date.</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-1">
        <div>
          <label className="text-[11px] text-text-light block mb-1">Transfer std reading</label>
          <input
            type="number" step="any" value={tsReading}
            onChange={e => setTsReading(e.target.value)}
            placeholder={`value in ${unit.trim() || 'units'}`}
            className="w-full h-9 rounded-lg px-2 text-[12px] bg-surface-dark text-text-dark border-none"
          />
        </div>
        <div>
          <label className="text-[11px] text-text-light block mb-1">Station sensor reading</label>
          <input
            type="number" step="any" value={sensorReading}
            onChange={e => setSensorReading(e.target.value)}
            placeholder={`value in ${unit.trim() || 'units'}`}
            className="w-full h-9 rounded-lg px-2 text-[12px] bg-surface-dark text-text-dark border-none"
          />
        </div>
      </div>

      {asFoundError != null && (
        <div className="flex items-center mb-2 text-[11px] text-text-light">
          As-found error: <ErrorBadge error={asFoundError} pass={phase1Pass} />
        </div>
      )}

      {phase1Pass === false && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="text-[11px] text-warning font-medium mb-2">
            Out of tolerance — apply offset in datalogger, then record the post-correction readings below.
          </div>
          <div className="grid grid-cols-3 gap-2 mb-1">
            <div>
              <label className="text-[11px] text-text-light block mb-1">Offset applied</label>
              <input
                type="number" step="any" value={offsetApplied}
                onChange={e => setOffsetApplied(e.target.value)}
                placeholder="0.000"
                className="w-full h-9 rounded-lg px-2 text-[12px] bg-surface-dark text-text-dark border-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-text-light block mb-1">Station (post-cal)</label>
              <input
                type="number" step="any" value={postCalReading}
                onChange={e => setPostCalReading(e.target.value)}
                placeholder="0.000"
                className="w-full h-9 rounded-lg px-2 text-[12px] bg-surface-dark text-text-dark border-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-text-light block mb-1">Transfer std (verify)</label>
              <input
                type="number" step="any" value={verifyReading}
                onChange={e => setVerifyReading(e.target.value)}
                placeholder="0.000"
                className="w-full h-9 rounded-lg px-2 text-[12px] bg-surface-dark text-text-dark border-none"
              />
            </div>
          </div>
          {asLeftError != null && (
            <div className="flex items-center mb-2 text-[11px] text-text-light">
              Post-cal error: <ErrorBadge error={asLeftError} pass={phase2Pass} />
            </div>
          )}
          {phase2Pass === false && (
            <div>
              <label className="text-[11px] text-text-light block mb-1">Remarks <span className="text-warning">*</span></label>
              <textarea
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                rows={2}
                placeholder="Describe what was done and why it remained out of tolerance…"
                className="w-full rounded-lg px-2 py-1.5 text-[12px] bg-surface-dark text-text-dark border-none resize-none"
              />
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={!canSave || saveState === 'saving'}
        className="mt-3 w-full h-9 rounded-xl text-[12px] font-semibold border-none transition-colors"
        style={{ background: canSave ? 'var(--color-navy)' : '#BDBDBD', color: '#fff' }}
      >
        {saveLabel}
      </button>
      {saveState === 'error' && (
        <div className="text-[11px] text-error mt-1 text-center">Save failed — tap to retry</div>
      )}
    </div>
  );
}

// ── Met calibration section ────────────────────────────────────────────────────

function MetCalibrationSection({ visitId, stationId, onComplete }) {
  const [sensors,    setSensors]    = useState(null);
  const [standards,  setStandards]  = useState(null);
  const [existing,   setExisting]   = useState([]);
  const [savedCards, setSavedCards] = useState(new Set());
  const [error,      setError]      = useState(null);

  function buildRequired(sensorList) {
    const cards = [];
    for (const s of (sensorList || [])) {
      if (!s.requires_transfer_std || !s.transfer_std_parameters?.length) continue;
      for (const param of s.transfer_std_parameters) {
        cards.push({
          key: `${s.id}:${param}`,
          station_sensor_id: s.id,
          parameter: param,
          label: s.label,
          serial_no: s.serial_no ?? null,
          tolerance: s.parameters?.[param]?.tolerance ?? null,
        });
      }
    }
    return cards;
  }

  useEffect(() => {
    Promise.all([
      getStationSensors(stationId),
      getTransferStandards(),
      getCalibrationChecks(visitId),
    ])
      .then(([s, ts, checks]) => {
        setSensors(s);
        setStandards(ts);
        setExisting(checks);
        const preKeys = new Set(checks.map(c => `${c.station_sensor_id}:${c.parameter}`));
        setSavedCards(preKeys);
      })
      .catch(() => setError('Could not load calibration data — check connection and reload.'));
  }, [visitId, stationId]);

  useEffect(() => {
    if (!sensors) return;
    const required = buildRequired(sensors);
    onComplete(required.length === 0 || required.every(c => savedCards.has(c.key)));
  }, [savedCards, sensors]);

  function handleCardSaved(key) {
    setSavedCards(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }

  if (error) return <div className="form-card text-[12px] text-error">{error}</div>;

  if (!sensors || !standards) {
    return <div className="form-card text-[12px] text-text-light">Loading calibration data…</div>;
  }

  const required = buildRequired(sensors);

  if (required.length === 0) {
    return (
      <div className="form-card text-[12px] text-text-light">
        No transfer standard checks required for this station's sensors.
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1.5 pb-2 pt-1 text-[12px] font-semibold text-text-dark">
        Calibration checks ({savedCards.size}/{required.length} complete)
      </div>
      {required.map(card => (
        <CalibrationCheckCard
          key={card.key}
          card={card}
          transferStandards={standards}
          visitId={visitId}
          onSaved={() => handleCardSaved(card.key)}
          existingCheck={existing.find(c =>
            c.station_sensor_id === card.station_sensor_id && c.parameter === card.parameter
          ) ?? null}
        />
      ))}
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

const FAMILY_LABEL = { rainfall: 'Rainfall', groundwater: 'Groundwater', met: 'Meteorological' };

export default function ManualReadings({ visitId, stationId, dataFamily, isBarologger, onReadingsSaved, onLoggerUnavailable }) {
  const [saved,               setSaved]               = useState([]);
  const [loaded,              setLoaded]              = useState(false);
  const [formKey,             setFormKey]             = useState(0);   // increment to remount fields after queue flush
  const [calibrationSelected,    setCalibrationSelected]    = useState(false);
  const [sensorConfirmationDone, setSensorConfirmationDone] = useState(false);
  const [calibrationAllSaved,    setCalibrationAllSaved]    = useState(false);
  const [instrumentChangeKey,    setInstrumentChangeKey]    = useState(0);
  const calledDone  = useRef(false);
  const onlineTimer = useRef(null);

  const { enqueue, flushQueue, failedCount } = useOfflineQueue(visitId);

  useEffect(() => {
    if (!visitId) { setLoaded(true); return; }
    getVisit(visitId)
      .then(v => {
        setSaved(v.readings || []);
        if (dataFamily === 'met') {
          const actR = v.readings?.find(r => r.reading_type === 'met_activities');
          if (actR?.value_text) {
            try {
              const acts = JSON.parse(actR.value_text);
              setCalibrationSelected(acts.includes('calibration_check'));
            } catch {}
          }
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [visitId, dataFamily]);

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
    const familyKey = dataFamily === 'groundwater'
      ? (isBarologger ? 'groundwater_baro' : 'groundwater_level')
      : dataFamily;
    const required = REQUIRED_TYPES[familyKey] || [];
    if (required.length === 0) return;
    const savedTypes = new Set(saved.map(r => r.reading_type));
    const readingsDone = required.every(t => savedTypes.has(t));
    const calibDone = dataFamily !== 'met' || (!calibrationSelected || calibrationAllSaved);
    const confirmDone = dataFamily !== 'met' || sensorConfirmationDone;
    if (readingsDone && confirmDone && calibDone) {
      calledDone.current = true;
      onReadingsSaved?.();
    }
  }, [saved, dataFamily, sensorConfirmationDone, calibrationSelected, calibrationAllSaved, onReadingsSaved]);

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

        <div className="flex items-center gap-1.5 pb-3 text-[12px] font-semibold" style={{ color: 'var(--fc-text)' }}>
          {FAMILY_LABEL[dataFamily]} station — record all readings below
        </div>

        <div key={formKey}>
          {dataFamily === 'rainfall'    && <RainfallForm    saved={saved} onSave={handleSave} visitId={visitId} stationId={stationId} />}
          {dataFamily === 'groundwater' && isBarologger  && <BarologgerForm  saved={saved} onSave={handleSave} />}
          {dataFamily === 'groundwater' && !isBarologger && <GroundwaterForm saved={saved} onSave={handleSave} />}
          {dataFamily === 'met'         && (
            <MetForm
              saved={saved}
              onSave={handleSave}
              onCalibrationSelected={setCalibrationSelected}
            />
          )}
          {dataFamily === 'met' && (
            <MetSensorConfirmationSection
              stationId={stationId}
              visitId={visitId}
              onAllConfirmed={setSensorConfirmationDone}
              onSensorsChanged={() => setInstrumentChangeKey(k => k + 1)}
            />
          )}
          {dataFamily === 'met' && sensorConfirmationDone && calibrationSelected && (
            <MetCalibrationSection
              key={instrumentChangeKey}
              visitId={visitId}
              stationId={stationId}
              onComplete={setCalibrationAllSaved}
            />
          )}

          {dataFamily === 'groundwater' && (
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
