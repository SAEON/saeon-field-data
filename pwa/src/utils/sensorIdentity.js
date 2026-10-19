// How an instrument is identified: a serial number, an asset number, or (for small sensors that have
// neither) where it is installed. Every screen builds its identity text here so they all read the same.

const clean = v => (typeof v === 'string' ? v.trim() : v) || '';

// Parts in a stable order: "S/N 123", "Asset A-100", "10 cm"
export function identityParts(s) {
  if (!s) return [];
  const parts = [];
  if (clean(s.serial_no))      parts.push(`S/N ${clean(s.serial_no)}`);
  if (clean(s.asset_no))       parts.push(`Asset ${clean(s.asset_no)}`);
  if (clean(s.position_label)) parts.push(clean(s.position_label));
  return parts;
}

export function sensorIdentity(s) {
  return identityParts(s).join(' · ');
}

// Same, for the calibration endpoints that return sensor_serial_no / sensor_asset_no / sensor_position_label
export function calibrationSensorIdentity(r) {
  return sensorIdentity({
    serial_no: r?.sensor_serial_no, asset_no: r?.sensor_asset_no, position_label: r?.sensor_position_label,
  });
}

// "Hygrovue 5 (S/N 123)" — falls back to the bare label when nothing identifies the sensor
export function sensorName(s) {
  const id = sensorIdentity(s);
  return id ? `${s.label} (${id})` : s.label;
}

// Can this sensor be saved? Serial or asset always; models that normally have no serial may use a position label.
export function hasIdentifier({ serial, asset, position }, serialExpected = true) {
  return !!(clean(serial) || clean(asset) || (!serialExpected && clean(position)));
}

export function identifierHint(serialExpected = true) {
  return serialExpected
    ? 'Enter a serial number, or an asset number if the sensor has no serial.'
    : 'Enter a serial or asset number if it has one, otherwise where it is installed (e.g. "10 cm depth").';
}
