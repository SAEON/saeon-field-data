// Rules for one calibration check card. After the as-found check the technician records what was done;
// applying an offset is optional and the raw values are kept either way.
//   choice: null | 'offset' | 'raw' | 'replace'
//   action (stored): passed | offset_applied | raw_kept | replace_sensor
// Sign convention: error = transfer standard − sensor (positive means the sensor reads low).

export const CHOICES = [
  { id: 'offset',  label: 'Offset applied' },
  { id: 'raw',     label: 'No offset — raw values kept' },
  { id: 'replace', label: 'Replace sensor / send for factory calibration' },
];

const ACTION_FOR = { offset: 'offset_applied', raw: 'raw_kept', replace: 'replace_sensor' };

// Decide what the card shows and whether it can be saved
export function evaluateCheck({ hasReadings, phase1Pass, choice, offsetEntered, phase2Complete, phase2Pass, remarks }) {
  if (!hasReadings) return { canSave: false, label: 'Save', action: null };

  const failed = phase1Pass === false;
  const offsetComplete = !!offsetEntered && !!phase2Complete;

  if (choice === 'replace') return { canSave: true, label: 'Save — Flagged for replacement', action: 'replace_sensor' };

  if (choice === 'offset') {
    if (!offsetComplete)        return { canSave: false, label: 'Complete the offset below', action: 'offset_applied' };
    if (phase2Pass !== false)   return { canSave: true,  label: failed ? 'Save — Corrected & Passed' : 'Save — Passed, offset applied', action: 'offset_applied' };
    if (!String(remarks || '').trim()) return { canSave: false, label: 'Add remarks to save', action: 'offset_applied' };
    return { canSave: true, label: 'Save — Flagged (out of tolerance)', action: 'offset_applied' };
  }

  if (choice === 'raw' && failed) return { canSave: true, label: 'Save — Raw values kept', action: 'raw_kept' };

  if (failed) return { canSave: false, label: 'Choose what was done', action: null };
  return { canSave: true, label: phase1Pass === true ? 'Save — Passed' : 'Save', action: 'passed' };
}

// The request body. Offset fields are sent only when an offset was applied.
export function buildCheckBody({ base, action, offsetApplied, postNum, verifyNum, remarks }) {
  const body = { ...base, action_taken: action, remarks: String(remarks || '').trim() || null };
  if (action === 'offset_applied') {
    body.offset_applied = Number(offsetApplied);
    body.station_reading_post_cal = postNum;
    body.transfer_std_verification_reading = verifyNum;
  }
  return body;
}

// What the card shows after saving (also used for a check saved on the device while offline)
export function outcomeText(check) {
  const action = check.action_taken
    ?? (check.within_tolerance === false ? (check.offset_applied != null ? 'offset_applied' : 'raw_kept') : 'passed');
  if (action === 'replace_sensor') return 'Flagged for replacement / factory calibration';
  if (action === 'raw_kept')       return 'Out of tolerance — raw values kept, no offset applied';
  if (action === 'offset_applied') {
    if (check.post_cal_within_tolerance === false) return 'Offset applied — still outside tolerance';
    return check.within_tolerance === false ? 'Offset applied — corrected, within tolerance' : 'Within tolerance — offset applied';
  }
  return 'Within tolerance';
}

const signed = n => `${Number(n) >= 0 ? '+' : ''}${Number(n)}`;

// "Offset in datalogger: +1.5 (was +0.5)" — empty when no offset was applied
export function offsetText(check, unit = '') {
  if (check.offset_applied == null) return '';
  const before = check.offset_before != null ? ` (was ${signed(check.offset_before)}${unit})` : '';
  return `Offset in datalogger: ${signed(check.offset_applied)}${unit}${before}`;
}
