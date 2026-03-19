// useDraftVisit — persists the active draft visit to IndexedDB.
// Draft shape:
//   { visitId, station, formState: { visitDate, visitTime, accessNotes,
//     weatherNotes, equipmentNotes, freeText }, files: [...serialisable] }
//
// raw File objects and abortControllers are NOT serialisable — strip them
// before saving. On restore, files that were 'uploading' become 'error'.

import { getDB } from './idb.js';

const STORE = 'draft_visit';
const KEY   = 'current';

export async function loadDraft() {
  try {
    const db = await getDB();
    return (await db.get(STORE, KEY)) || null;
  } catch {
    return null;
  }
}

export async function saveDraft(draft) {
  try {
    const db = await getDB();
    // Strip non-serialisable fields from files array
    const serialisable = {
      ...draft,
      files: (draft.files || []).map(f => ({
        localId:   f.localId,
        name:      f.name,
        size:      f.size,
        parseState:  f.parseState === 'uploading' || f.parseState === 'retrying' ? 'error' : f.parseState,
        dbId:        f.dbId,
        dateRange:   f.dateRange,
        records:     f.records,
        parseError:  f.parseError  ?? null,
        hasGap:      f.hasGap      ?? false,
        gapDays:     f.gapDays     ?? null,
        // raw, abortController intentionally omitted
      })),
    };
    await db.put(STORE, serialisable, KEY);
  } catch {
    // IDB write failure is non-fatal — session still works via in-memory state
  }
}

export async function clearDraft() {
  try {
    const db = await getDB();
    await db.delete(STORE, KEY);
  } catch {
    // non-fatal
  }
}
