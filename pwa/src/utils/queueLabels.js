// Readable labels for the things waiting in the outbox (shared by the Queue screens).
import { parseMaintType, maintFieldLabel } from './sensorMaintenance.js';

const READING_META = {
  dipper_depth:           { label: 'Dipper depth',          unit: 'm'  },
  dipper_time:            { label: 'Time of measurement',   unit: ''   },
  water_colour:           { label: 'Water colour',          unit: ''   },
  battery_voltage:        { label: 'Battery voltage',       unit: 'V'  },
  overall_site_condition: { label: 'Site condition',        unit: ''   },
  gauge_condition:        { label: 'Gauge condition',       unit: ''   },
  gauge_reading:          { label: 'Gauge reading',         unit: 'mm' },
  last_emptied:           { label: 'Gauge last checked',    unit: ''   },
  solar_panel_capacity_w:       { label: 'Solar panel capacity',                     unit: 'W'  },
  solar_panel_voltage:          { label: 'Solar panel voltage (open circuit)',       unit: 'V'  },
  charge_controller_model:      { label: 'Charge controller model',                  unit: ''   },
  charge_controller_voltage:    { label: 'Charge controller output voltage',         unit: 'V'  },
  charge_controller_condition:  { label: 'Charge controller condition',              unit: ''   },
  battery_capacity_ah:          { label: 'Battery capacity',                         unit: 'Ah' },
  battery_voltage_disconnected: { label: 'Battery voltage (controller disconnected)', unit: 'V' },
  battery_voltage_connected:    { label: 'Battery voltage (controller connected)',    unit: 'V' },
  cables_condition:             { label: 'Cables intact',                            unit: ''   },
  pyranometer_clean:      { label: 'Pyranometer clean',     unit: ''   },
  anemometer_spinning:    { label: 'Anemometer spinning',   unit: ''   },
  rain_gauge_clear:       { label: 'Rain gauge clear',      unit: ''   },
  wind_vane:              { label: 'Wind vane readable',    unit: ''   },
  logger_screen:          { label: 'Logger screen reading', unit: ''   },
};

// State → visual style (color bar on card left edge carries the state meaning — no emojis)

const OP_LABEL = {
  visit_update:  'Visit details',
  instrument:    'Instrument record',
  calibration:   'Calibration check',
  sensor_change: 'Sensor change',
  upload:        'Logger file',
  submit:        'Submit visit',
  abandon:       'Abandon visit',
};

function readingLabel(type) {
  const maint = parseMaintType(type);
  return READING_META[type]?.label
    || (maint ? `Sensor #${maint.sensorId} — ${maintFieldLabel(maint.key)}` : (type?.replace(/_/g, ' ') || '—'));
}

export function opLabel(op) {
  if (op.type === 'reading')        return readingLabel(op.payload?.reading_type);
  if (op.type === 'reading_delete') return `Remove: ${readingLabel(op.payload?.reading_type)}`;
  return OP_LABEL[op.type] || op.type;
}

export function opDetail(op) {
  if (op.type === 'reading')     return readingValue(op.payload || {});
  if (op.type === 'upload')      return op.payload?.name || '';
  if (op.type === 'calibration') return [op.payload?.parameter, op.payload?.calibration_date].filter(Boolean).join(' · ');
  if (op.type === 'sensor_change') return op.payload?.mode === 'decommission' ? 'Decommission' : 'New sensor';
  if (op.type === 'submit')      return 'Sends when every change above has synced';
  return '';
}

function readingValue(payload) {
  if (payload.value_numeric != null) {
    const meta = READING_META[payload.reading_type];
    const unit = payload.unit || meta?.unit || '';
    return unit ? `${payload.value_numeric} ${unit}` : String(payload.value_numeric);
  }
  return payload.value_text || '—';
}

// ── Main component ────────────────────────────────────────────────────────────
