'use strict';
// Quick regression test for the HOBO CSV parser.
// Runs the parser on sample files and checks timestamps are correct UTC.
//
// Usage: node scripts/test_hobo_parser.js

const path  = require('path');
const parse = require('../api/src/parsers/hobo');

const SAMPLES_DIR = path.join(__dirname, '../samples');

const cases = [
  {
    label: 'try_1 — combined datetime, YYYY/MM/DD 24h (8B_Langrivier 2011)',
    file:  '8B_Langrivier08August2011.csv',
    // First data row: 2011/07/04 12:00:00 SAST (GMT+02:00) → UTC 10:00:00
    expect: [
      { phenomenon: 'temp_c',             utc: '2011-07-04T10:00:00.000Z' },
      { phenomenon: 'batt_v',             utc: '2011-07-04T10:00:00.000Z' },
      { phenomenon: 'rain_tip',           utc: '2011-07-04T10:00:00.000Z' }, // cumm=0.0, delta=0 → NOT emitted
    ],
    firstTipUtc: null, // first row cumm=0, no tip emitted
    firstTempUtc: '2011-07-04T10:00:00.000Z',
  },
  {
    label: 'try_1 — combined datetime, MM/DD/YY AM/PM (2B_Swartboschkloof)',
    file:  '2B_Swartboschkloof_calcheck26May2021.csv',
    // First row: 05/26/21 12:40:12 PM SAST → UTC 10:40:12
    firstTempUtc: '2021-05-26T10:40:12.000Z',
    firstTipUtc:  null, // cumm=0.000, no tip
  },
  {
    label: 'try_1 — combined datetime, YY/MM/DD 24h (8B_Langrivier 2025, raw_files)',
    file:  '../data/raw_files/2026/08/c2a05c7ec3ac364604d978c6c073c0609887e23dac8137ffede6e3d956721c93_8B_Langrivier_0.csv',
    // First row: 25/03/12 15:00:00 SAST → UTC 13:00:00
    firstTempUtc: '2025-03-12T13:00:00.000Z',
    firstTipUtc:  null, // cumm=0.000, no tip
  },
  {
    label: 'try_5 — SEPARATE datetime, YY-MM-DD (synthetic Rion-style file) ← FIX UNDER TEST',
    file:  'test_try5_separate_datetime.csv',
    // Row 1: 26-03-27 09:20:00 SAST → UTC 07:20:00
    firstTempUtc: '2026-03-27T07:20:00.000Z',
    // Row 4: 26-03-27 22:55:24 SAST → UTC 20:55:24  (first tip, delta 0.0→0.2)
    firstTipUtc:  '2026-03-27T20:55:24.000Z',
  },
];

async function collect(filePath) {
  const result  = await parse(filePath);
  const records = [];
  for await (const batch of result.stream) {
    for (const m of batch) records.push(m);
  }
  return records;
}

async function run() {
  let passed = 0, failed = 0;

  for (const c of cases) {
    const filePath = path.isAbsolute(c.file)
      ? c.file
      : path.join(SAMPLES_DIR, c.file);

    let records;
    try {
      records = await collect(filePath);
    } catch (e) {
      console.error(`FAIL  ${c.label}`);
      console.error(`      Parse error: ${e.message}`);
      failed++;
      continue;
    }

    const tips  = records.filter(r => r.phenomenon_name === 'rain_tip');
    const temps = records.filter(r => r.phenomenon_name === 'temp_c');

    let ok = true;

    // Check first temp timestamp
    if (c.firstTempUtc) {
      const got = temps[0]?.measured_at?.toISOString();
      if (got !== c.firstTempUtc) {
        console.error(`FAIL  ${c.label}`);
        console.error(`      temp_c[0].measured_at: expected ${c.firstTempUtc}, got ${got}`);
        ok = false;
      }
    }

    // Check first rain_tip timestamp
    if (c.firstTipUtc !== undefined) {
      if (c.firstTipUtc === null) {
        if (tips.length > 0 && tips[0].value_numeric > 0) {
          const got = tips[0]?.measured_at?.toISOString();
          // Allow first cumm-0 row to produce no tip; just log count
          console.log(`      rain_tip count: ${tips.length}`);
        }
      } else {
        const got = tips[0]?.measured_at?.toISOString();
        if (got !== c.firstTipUtc) {
          console.error(`FAIL  ${c.label}`);
          console.error(`      rain_tip[0].measured_at: expected ${c.firstTipUtc}, got ${got}`);
          ok = false;
        }
      }
    }

    if (ok) {
      console.log(`PASS  ${c.label}`);
      console.log(`      temps: ${temps.length}, tips: ${tips.length}` +
        (temps[0] ? `, first_temp_utc: ${temps[0].measured_at.toISOString()}` : '') +
        (tips[0]  ? `, first_tip_utc: ${tips[0].measured_at.toISOString()}`  : ''));
      passed++;
    } else {
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
