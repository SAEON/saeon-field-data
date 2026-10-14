// Per-sensor maintenance fields (QMS sensor lookup). Each answer is stored as a manual reading:
// reading_type = smaint:<station_sensor_id>:<field key>.

const YES_NO = [['yes', 'Yes'], ['no', 'No']];

export const MAINT_FIELDS = [
  { key: 'physical_condition', label: 'Sensor & cable physical condition', options: [['good', 'Good'], ['fair', 'Fair'], ['poor', 'Poor'], ['damaged', 'Damaged']] },
  { key: 'cleanliness',        label: 'Cleanliness as found', options: [['clean', 'Clean'], ['slightly_dirty', 'Slightly dirty'], ['dirty', 'Dirty'], ['obstructed', 'Obstructed']] },
  { key: 'cleaning_done',      label: 'Cleaning done', options: [['yes', 'Yes'], ['no', 'No'], ['not_needed', 'Not needed']] },
  { key: 'level_as_found',     label: 'Level as found', options: [['level', 'Level'], ['not_level', 'Not level']] },
  { key: 'level_if_adjusted',  label: 'Level if adjusted', options: [['adjusted', 'Adjusted — now level'], ['not_adjusted', 'Not adjusted'], ['n/a', 'N/A']], onlyWhen: { key: 'level_as_found', value: 'not_level' } },
  { key: 'live_reading',       label: 'Live reading', type: 'text', placeholder: 'e.g. 23.4 °C / 51 %' },
  { key: 'sensor_element_replaced', label: 'Sensor element replaced', options: YES_NO },
  { key: 'filter_replacement', label: 'Filter replaced', options: YES_NO },
  { key: 'desiccant_replaced', label: 'Desiccant replaced', options: YES_NO },
  { key: 'orientation_verification', label: 'Orientation verification (compass degrees)', type: 'orientation' },
  { key: 'bearing_condition',  label: 'Bearing condition', options: [['good', 'Good'], ['worn', 'Worn'], ['noisy', 'Noisy'], ['seized', 'Seized']] },
  { key: 'bearings_replaced',  label: 'Bearings replaced', options: YES_NO },
  { key: 'wetness_test',       label: 'Wetness test — responds to water', options: YES_NO },
];

export const MAINT_PREFIX = 'smaint:';

export const maintType = (sensorId, key) => `${MAINT_PREFIX}${sensorId}:${key}`;

export function parseMaintType(readingType) {
  if (!readingType?.startsWith(MAINT_PREFIX)) return null;
  const [sensorId, key] = readingType.slice(MAINT_PREFIX.length).split(':');
  return { sensorId, key };
}

export function maintFieldLabel(key) {
  if (key === 'remarks') return 'Remarks';
  if (key === 'confirmation') return 'Sensor check';
  return MAINT_FIELDS.find(f => f.key === key)?.label ?? key.replace(/_/g, ' ');
}

export function maintValueLabel(key, reading) {
  if (key === 'confirmation') return reading.value_text === 'changed' ? 'Changed' : 'No change';
  if (key === 'orientation_verification') {
    return reading.value_text === 'n/a' ? 'N/A' : `${reading.value_numeric}°`;
  }
  const opt = MAINT_FIELDS.find(f => f.key === key)?.options?.find(([v]) => v === reading.value_text);
  return opt ? opt[1] : (reading.value_text ?? '—');
}
