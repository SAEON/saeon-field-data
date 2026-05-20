# Logger Data Formats

---

## Supported formats

| Format | Extension | Parser | Notes |
|--------|-----------|--------|-------|
| HOBOware CSV | `.csv` | `api/src/parsers/hobo.js` | Exported from HOBOware software |
| HOBO binary | `.hobo` | `api/src/parsers/hobo_binary.js` | Raw logger download — see limitations below |
| Campbell TOA5 | `.dat` | `api/src/parsers/campbell_toa5.js` | Campbell Scientific datalogger ASCII export |
| Solonist XLE | `.xle` | `api/src/parsers/solonist_xle.js` | Solonist Level Logger XML export |
| SAEON STOM | `.stom` | `api/src/parsers/saeon_stom.js` | Custom SAEON format |

---

## HOBOware CSV

The preferred format for HOBO rain loggers. Export from HOBOware: File → Export Table Data → CSV.

### Date format variants

The parser handles all HOBOware date formats automatically:

| Format example | Description |
|----------------|-------------|
| `06/08/20 10:54:44 AM` | MM/DD/YY HH:MM:SS AM/PM — most common, modern HOBOware |
| `2011/07/24 04:02:31` | YYYY/MM/DD HH:MM:SS — old HOBOware exports (pre-2013) |

Timestamps are adjusted to UTC using the GMT offset in the date column header (e.g. `Date Time, GMT+02:00` → subtract 2 hours).

### Cumulative-to-delta conversion

HOBOware exports rainfall as a running cumulative total, not individual tip values. The parser converts this to per-tip values by taking the delta between consecutive rows:

- Row with delta = 0 (logger init, end-of-file duplicate) → filtered out
- Row with positive delta → one tip event with `value_numeric = delta`

### Rain column recognition

The parser recognises these column name patterns as rainfall event columns:
- `Rain (LGR S/N: …)` — old HOBOware
- `Event, mm (LGR S/N: …, LBL: Rainfall)` — modern HOBOware, mm calibrated
- `Event, units (LGR S/N: …, LBL: Rainfall)` — modern HOBOware, uncalibrated units

### Known limitations

HOBOware CSV files from **dual-channel loggers** (temperature + rainfall, e.g. UA-003-64) that were exported from **old HOBOware versions** may not include channel labels. These are handled correctly by the CSV parser. Do not use the `.hobo` binary format for these files (see HOBO binary section).

---

## HOBO binary (`.hobo`)

Raw logger downloads from HOBO Pendant and similar loggers.

### How it works

The binary file contains:
- A metadata header with tags: logger model, serial number, mm_per_tip (tag `0x19`), launch timestamp (tag `0x07`)
- A data section of event bytes, each encoding a `typeHi` nibble and a time delta

Rainfall tip events have `typeHi = 7`. The parser accumulates the time delta from the launch timestamp to derive each tip's UTC timestamp.

### Dual-channel guard

Old firmware HOBO loggers (UA-003-64 and similar) interleave temperature bytes with rainfall tip bytes in the data section without labelling them. This causes the parser to misidentify temperature bytes as time-advance events, producing wrong tip counts and shifted timestamps.

The parser detects this condition by counting `typeHi=15` bytes in the data section:
- < 10% → single-channel, safe to parse
- > 10% → dual-channel old firmware → file rejected with error

**If you see this error:** export the file as CSV from HOBOware instead and upload the `.csv`.

---

## File rejection rules

| Condition | Error |
|-----------|-------|
| Wrong file extension | Rejected at the UI before upload |
| Duplicate file (same hash on same visit) | `409 Conflict` |
| HOBO binary dual-channel detected | Error badge with message to use CSV |
| Unrecognised date format in CSV | Parse error with the offending date string |
| Empty file or no data rows | Parse error |

---

## Calibration and mm per tip

The rainfall processor uses a priority chain to determine mm per tip for each raw tip event:

1. **`instrument_history`** — if a `raingauge` record exists for this station with `effective_from` ≤ tip timestamp, use its `mm_per_tip`
2. **`value_numeric` from raw_measurements** — the parser stores the mm_per_tip read from the file header (binary tag `0x19` or inferred from CSV column). Used as fallback when no instrument history exists.
3. **System default: 0.254 mm** — last resort if neither of the above is available

This means:
- Modern files with instrument_history records always use the correct calibration
- Old files (no instrument_history) use the logger's own calibration value if available
- Files with no calibration metadata use the Onset default of 0.254 mm/tip

To correct historical data: add an `instrument_history` record with the correct `mm_per_tip` and `effective_from`, then reprocess the station via the Reprocess button.
