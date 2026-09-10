import { useState, useEffect, useRef } from 'react';
import { getStationMetData } from '../services/api.js';
import MetLineChart from './MetLineChart.jsx';

function isoDate(d) { return d.toISOString().slice(0, 10); }
function fmtNum(v, d = 2) { return v != null ? Number(v).toFixed(d) : '—'; }
function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function pillBtn(active, onClick, label) {
  return (
    <button onClick={onClick} style={{
      fontSize: 11, fontWeight: active ? 700 : 500,
      padding: '3px 10px', borderRadius: 20,
      border: `1.5px solid ${active ? 'var(--color-navy)' : 'var(--color-border)'}`,
      background: active ? 'var(--color-navy)' : 'white',
      color: active ? 'white' : 'var(--color-text-med)',
      cursor: 'pointer', whiteSpace: 'nowrap',
    }}>{label}</button>
  );
}

const CATEGORIES = [
  { id: 'temperature',   label: 'Temperature'   },
  { id: 'wind',          label: 'Wind'          },
  { id: 'radiation',     label: 'Radiation'     },
  { id: 'uv',            label: 'UV'            },
  { id: 'pressure',      label: 'Pressure'      },
  { id: 'rainfall',      label: 'Rainfall'      },
  { id: 'soil_temp',     label: 'Soil Temp'     },
  { id: 'leaf_wetness',  label: 'Leaf Wetness'  },
  { id: 'soil_moisture', label: 'Soil Moisture' },
];

const RESOLUTIONS = [
  { id: 'raw',  label: 'Raw'    },
  { id: 'hour', label: 'Hourly' },
  { id: 'day',  label: 'Daily'  },
];

// Column definitions per category
const COLUMNS = {
  temperature: [
    { key: 'air_temp_avg', label: 'Avg (°C)',  dp: 2 },
    { key: 'air_temp_min', label: 'Min (°C)',  dp: 2 },
    { key: 'air_temp_max', label: 'Max (°C)',  dp: 2 },
    { key: 'rh_avg',       label: 'RH (%)',    dp: 1 },
  ],
  wind: [
    { key: 'wind_speed_avg', label: 'Speed (m/s)', dp: 2 },
    { key: 'wind_dir_avg',   label: 'Direction (°)', dp: 1 },
  ],
  radiation: [
    { key: 'solar_rad_avg', label: 'Solar Rad (W/m²)', dp: 1 },
  ],
  uv: [
    { key: 'uv_rad_avg', label: 'UV Rad (W/m²)', dp: 2 },
  ],
  pressure: [
    { key: 'atm_pressure_avg', label: 'Pressure (hPa)', dp: 2 },
  ],
  rainfall: [
    { key: 'rain_tot', label: 'Rain (mm)', dp: 2 },
  ],
  soil_temp: [
    { key: 'soil_temp_avg', label: 'Soil Temp (°C)', dp: 2 },
  ],
  leaf_wetness: [
    { key: 'leaf_wetness_mv', label: 'Leaf Wetness (mV)', dp: 1 },
  ],
  soil_moisture: [
    { key: 'soil_moisture_avg', label: 'VWC (%)', dp: 2 },
  ],
};

// Primary field used for summary stats
const PRIMARY_FIELD = {
  temperature:   'air_temp_avg',
  wind:          'wind_speed_avg',
  radiation:     'solar_rad_avg',
  uv:            'uv_rad_avg',
  pressure:      'atm_pressure_avg',
  rainfall:      'rain_tot',
  soil_temp:     'soil_temp_avg',
  leaf_wetness:  'leaf_wetness_mv',
  soil_moisture: 'soil_moisture_avg',
};

const PAGE_SIZES = [25, 50, 100];

function pivotRows(rawRows) {
  const byPeriod = {};
  const ordered  = [];
  for (const r of rawRows) {
    const key = r.period;
    if (!byPeriod[key]) {
      byPeriod[key] = { period: key };
      ordered.push(byPeriod[key]);
    }
    byPeriod[key][r.phenomenon] = Number(r.value);
  }
  return ordered;
}

export default function MetDataTable({ stationId }) {
  const [category,   setCategory]   = useState('temperature');
  const [resolution, setResolution] = useState('hour');
  const [from,       setFrom]       = useState(isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [to,         setTo]         = useState(isoDate(new Date()));
  const [data,       setData]       = useState([]);
  const [fetching,   setFetching]   = useState(false);
  const [fetchErr,   setFetchErr]   = useState(null);
  const [page,       setPage]       = useState(1);
  const [pageSize,   setPageSize]   = useState(50);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!stationId) { setData([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFetching(true);
      setFetchErr(null);
      getStationMetData(stationId, {
        from, to: to ? `${to}T23:59:59` : to, category, resolution,
      })
        .then(rows => { setData(pivotRows(rows)); setPage(1); })
        .catch(e => setFetchErr(e.message || 'Failed to load'))
        .finally(() => setFetching(false));
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [stationId, from, to, category, resolution]);

  const cols      = COLUMNS[category] || [];
  const primField = PRIMARY_FIELD[category];
  const total     = data.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageData  = data.slice((page - 1) * pageSize, page * pageSize);

  const inputStyle = {
    fontSize: 11, padding: '4px 8px', borderRadius: 8,
    border: '1.5px solid var(--color-border)', background: 'white',
    color: 'var(--color-text-dark)', height: 28,
  };

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Category tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 4 }}>
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => { setCategory(c.id); setPage(1); }} style={{
            flex: 1, padding: '7px 0', fontSize: 11,
            fontWeight: category === c.id ? 700 : 500,
            color: category === c.id ? 'var(--color-navy)' : 'var(--color-text-light)',
            background: 'transparent', border: 'none', cursor: 'pointer',
            borderBottom: category === c.id ? '2px solid var(--color-navy)' : '2px solid transparent',
          }}>{c.label}</button>
        ))}
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-light)', fontWeight: 600 }}>From</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        <span style={{ fontSize: 11, color: 'var(--color-text-light)', fontWeight: 600 }}>To</span>
        <input type="date" value={to}   onChange={e => setTo(e.target.value)}   style={inputStyle} />
        <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
          {RESOLUTIONS.map(r => pillBtn(resolution === r.id, () => { setResolution(r.id); setPage(1); }, r.label))}
        </div>
        {fetching && <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>Loading…</span>}
      </div>

      {fetchErr && (
        <div style={{ fontSize: 11, color: 'var(--color-error)', background: '#FFF3E0', padding: '6px 10px', borderRadius: 8 }}>
          {fetchErr}
        </div>
      )}

      {/* Summary strip */}
      {!fetching && data.length > 0 && (() => {
        const primVals = data.map(r => r[primField]).filter(v => v != null);
        const minV = primVals.length ? Math.min(...primVals) : null;
        const maxV = primVals.length ? Math.max(...primVals) : null;
        const col  = cols.find(c => c.key === primField);
        return (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
              Records <span style={{ fontWeight: 700, color: 'var(--color-text-dark)' }}>{total.toLocaleString()}</span>
            </span>
            {minV != null && col && (
              <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
                Range{' '}
                <span style={{ fontWeight: 700, color: 'var(--color-text-dark)' }}>
                  {minV.toFixed(col.dp)}–{maxV.toFixed(col.dp)} {col.label.match(/\(([^)]+)\)/)?.[1] || ''}
                </span>
              </span>
            )}
          </div>
        );
      })()}

      {/* Chart */}
      {!fetching && data.length > 0 && (
        <div style={{
          background: 'var(--color-surface)', borderRadius: 10,
          border: '1px solid var(--color-border)', padding: '10px 12px',
        }}>
          <MetLineChart data={data} category={category} />
        </div>
      )}

      {/* Table */}
      {!fetching && data.length > 0 && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid var(--color-border)' }}>
                  <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 700, color: 'var(--color-text-light)', whiteSpace: 'nowrap' }}>
                    Date / time
                  </th>
                  {cols.map(c => (
                    <th key={c.key} style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 700, color: 'var(--color-text-light)', whiteSpace: 'nowrap' }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtDateTime(r.period)}
                    </td>
                    {cols.map(c => (
                      <td key={c.key} style={{ padding: '4px 8px', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtNum(r[c.key], c.dp)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {page > 1 && pillBtn(false, () => setPage(p => p - 1), '‹ Prev')}
              <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}
              </span>
              {page < pageCount && pillBtn(false, () => setPage(p => p + 1), 'Next ›')}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {PAGE_SIZES.map(s => pillBtn(pageSize === s, () => { setPageSize(s); setPage(1); }, String(s)))}
            </div>
          </div>
        </>
      )}

      {!fetching && data.length === 0 && !fetchErr && (
        <div style={{ textAlign: 'center', paddingTop: 32, fontSize: 13, color: 'var(--color-text-light)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div>No data in this date range.</div>
          <button
            onClick={() => { setFrom('2000-01-01'); setTo(isoDate(new Date())); }}
            style={{
              fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 20,
              border: '1.5px solid var(--color-navy)', background: 'white',
              color: 'var(--color-navy)', cursor: 'pointer',
            }}>
            Show all time
          </button>
        </div>
      )}
    </div>
  );
}
