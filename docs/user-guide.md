# User Guide

---

## Roles

| Role | Who | What they can do |
|------|-----|-----------------|
| **Technician** | Field staff | Record visits, upload logger files, enter manual readings |
| **Technician Lead** | Abri and senior leads | Everything a technician can do, plus: oversee all technicians, manage stations, assign visits, manage users |
| **Data Manager** | Data team | Full access, reprocess rainfall, view compliance dashboards |

Roles are assigned by a Data Manager or Technician Lead in the User Management screen after first login.

---

## Technician — recording a field visit

### 1. Start a visit

- Open the app and tap your assigned station from the station list
- Tap **Start visit** — this creates a draft visit for today

### 2. Enter manual readings

Tap **Readings** to open the form. Work through each section:

**Purpose of visit** — select all that apply (Routine download, Cal. check, Calibration, etc.)

**Logger activity** — select what was done with the logger (Download, Replace, etc.). If a problem was found, a notes field appears below — fill it in.

**Routine maintenance checks** — tick off each completed item on the AWS Inspection Checklist

**Calibration check** — if you performed a cal check:
- Enter the expected tip count (from the cal jug)
- Enter the actual tip count recorded by the logger
- The app shows a live pass/fail: ±3% drift = Pass; outside that = Fail
- If the cal check passes, proceed to calibration. If it fails, do not calibrate — flag for inspection.

**Calibrate** — if you calibrated the raingauge, enter the serial number and notes

**Raingauge condition** — select the current condition. "Good" is mutually exclusive with the problem conditions (blocked, damaged, etc.)

**Problem notes** — if any raingauge problem was selected, add descriptive notes here

### 3. Upload logger files

Tap **Files** and select the logger file(s) to upload.

Accepted formats: `.csv` (HOBOware export), `.xle` (Solonist), `.dat` (Campbell TOA5), `.stom` (SAEON STOM)

The `.hobo` binary format is not accepted for upload — export as CSV from HOBOware first.

The app shows a status badge per file:
- **Uploading** — transfer in progress
- **Processing** — server is parsing the file
- **Parsed** — data extracted successfully
- **Error** — parsing failed (see the error message; contact your lead)

### 4. Submit the visit

When all readings and files are done, tap **Submit**. This locks the visit and notifies your lead.

---

## Technician Lead — overseeing the team

### Overdue stations

The **Overview** tab shows stations that have not been visited within their scheduled frequency. Orange cards = overdue. Tap any card to see the last visit and assign a technician.

### Visits tab

Lists all pending and submitted visits across your team. Tap a visit to review readings and files. Use the filter to find visits by station or technician.

### History tab

Shows completed visits across all stations with full reading detail.

### Station Registry

Add, edit, or deactivate stations. Each station has:
- Name, display name, region, coordinates, elevation
- Data family (rainfall, etc.)
- Visit frequency (days)
- Assigned technician
- Logger serial number

### User Management

Add new users (they must have logged in at least once) and assign roles. You can deactivate users without deleting their visit history.

---

## Data Manager — monitoring data quality

### Dashboard

The **Stations** tab shows all stations with last-visit date and compliance status.

### Rainfall tab (per station)

Two views:

**Processed** — aggregated totals at your chosen resolution (5 min, hourly, daily, SAWS daily, monthly, yearly). Includes QA flag counts per period. Use the flag filter pills to isolate double tips, interference events, etc.

**Raw tips** — individual logger tip events with exact timestamps and mm/tip values. Use this to compare directly against HOBOware's display for calibration verification.

**Data gaps** — shown below the table. Orange = problem gap (>6 hours of missing data). Each gap shows start date, end date, and duration.

### Reprocess

If a station's calibration or instrument history has been updated, use the **Reprocess** button to recalculate all rainfall aggregates from the raw tip data.

---

## Common tasks

### Uploading a file that fails

If a file shows an Error badge:
1. Read the error message — it usually says what is wrong (wrong format, duplicate file, binary guard triggered)
2. For `.hobo` binary files from dual-channel loggers (UA-003-64): export as CSV from HOBOware, then upload the CSV instead
3. Tap the ✕ on the error file to remove it, then re-upload the corrected file

### Reading the gap list

- **Missing data** (orange) — a gap between two logger deployments longer than 6 hours. Rainfall during this period was not recorded.
- **Documented** (green) — a gap where a field visit noted the logger was offline (missing, stopped, or decommissioned). Still missing data, but the reason is recorded.

### Understanding the cal check result

The drift percentage is calculated as: `|(expected − actual) / expected| × 100`

- ≤ 3% → **Pass** — proceed to calibration if scheduled
- > 3% → **Fail** — do not calibrate; flag the raingauge for inspection and record the problem in notes

The serial number entered during the cal check automatically carries over to the calibration card if you proceed to calibrate in the same visit.
