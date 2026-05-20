# Sample Logger Files

Use these files to test uploads and verify the system is parsing correctly after deployment.

| File | Format | Station | What it demonstrates |
|------|--------|---------|----------------------|
| `2B_Swartboschkloof_calcheck26May2021.csv` | HOBOware CSV | 2B Swartboschkloof | Cal check export — `Event, units` column header (no mm label) |
| `7B_Weikamp_calcheck20May2022.csv` | HOBOware CSV | 7B Weikamp | Cal check export — `Event, mm` column header, MM/DD/YY AM/PM date format |
| `8B_Langrivier08August2011.csv` | HOBOware CSV | 8B Langrivier | Old HOBOware export — YYYY/MM/DD 24-hour date format, 0.2 mm/tip gauge |
| `8A.hobo` | HOBO binary | 8A | Single-channel event logger — clean binary upload |

## Expected parse results

| File | Tips | Total mm |
|------|------|----------|
| `2B_Swartboschkloof_calcheck26May2021.csv` | 105 | 26.670 |
| `7B_Weikamp_calcheck20May2022.csv` | 95 | 24.130 |
| `8B_Langrivier08August2011.csv` | 586 | 117.200 |
| `8A.hobo` | varies | varies |

## Notes

- `.hobo` binary files from **dual-channel loggers** (e.g. HOBO UA-003-64 Pendant Temp/Event) are rejected by the binary guard — export as CSV from HOBOware first. See [docs/data-formats.md](../docs/data-formats.md).
- CSV timestamps are stored in UTC. The HOBOware header declares the local offset (GMT+02:00) and the parser converts automatically.
