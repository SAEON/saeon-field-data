// Shared rainfall data table — used by ManagerDashboard and TechnicianDataTab.
// Owns: date range, resolution, flag filter, fetched data, summary strip.
// Does NOT own: station selection (parent supplies stationId).
// Reprocess button only renders when canReprocess === true.

import { useState, useEffect, useRef } from 'react';
import { getStationRainfall, processStationRainfall } from '../services/api.js';
import RainfallTipChart from './RainfallTipChart.jsx';

const RESOLUTIONS = [
  { value: '5min',       label: '5 min'     },
  { value: 'hourly',     label: 'Hourly'    },
  { value: 'daily',      label: 'Daily'      },
  { value: 'saws_daily', label: 'SAWS daily' },
  { value: 'monthly',    label: 'Monthly'   },
  { value: 'yearly',     label: 'Yearly'    },
];

const FLAG_FILTERS = [
  { value: '',              label: 'All'          },
  { value: 'double_tip',    label: 'Double tip'   },
  { value: 'interfere',     label: 'Interfere'    },
  { value: 'manual_tip',    label: 'Manual tip'   },
  { value: 'non_rainfall',  label: 'Non-rainfall' },
  { value: 'anomaly',       label: 'Anomaly'      },
];

function isoDate(d) { return d.toISOString().slice(0, 10); }

function fmtPeriod(iso, resolution) {
  const d = new Date(iso);
  if (resolution === '5min' || resolution === 'hourly') {
    return d.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (resolution === 'monthly') return d.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
  if (resolution === 'yearly')  return d.toLocaleDateString('en-ZA', { year: 'numeric' });
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function FlagCell({ value }) {
  if (!value) return <span style={{ color: 'var(--color-text-light)' }}>—</span>;
  return <span style={{ color: '#E65100', fontWeight: 700 }}>{value}</span>;
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

const PAGE_SIZES = [25, 50, 100];

export default function RainfallDataTable({ stationId, canReprocess = false }) {
  const [from,         setFrom]         = useState(isoDate(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)));
  const [to,           setTo]           = useState(isoDate(new Date()));
  const [resolution,   setResolution]   = useState('daily');
  const [flagFilter,   setFlagFilter]   = useState('');
  const [data,         setData]         = useState([]);
  const [fetching,     setFetching]     = useState(false);
  const [fetchErr,     setFetchErr]     = useState(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [page,         setPage]         = useState(1);
  const [pageSize,     setPageSize]     = useState(50);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!stationId) { setData([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFetching(true);
      setFetchErr(null);
      getStationRainfall(stationId, {
        resolution,
        from: new Date(from).toISOString(),
        to:   new Date(to + 'T23:59:59').toISOString(),
      })
        .then(res => setData(res.data || []))
        .catch(e => setFetchErr(e.message))
        .finally(() => setFetching(false));
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [stationId, from, to, resolution]);

  function handleReprocess() {
    if (!stationId) return;
    setReprocessing(true);
    processStationRainfall(stationId).finally(() => {
      setReprocessing(false);
      setTo(isoDate(new Date()));
    });
  }

  // Client-side filter
  const filtered = data.filter(row => {
    if (!flagFilter)                   return true;
    if (flagFilter === 'double_tip')   return row.double_tip_count > 0;
    if (flagFilter === 'interfere')    return row.interfere_count > 0;
    if (flagFilter === 'manual_tip')   return row.manual_tip_count > 0;
    if (flagFilter === 'non_rainfall') return row.non_rainfall_count > 0;
    if (flagFilter === 'anomaly')      return row.has_anomaly;
    return true;
  });

  // Reset to page 1 when data or filter changes
  useEffect(() => { setPage(1); }, [stationId, from, to, resolution, flagFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pageStart  = (safePage - 1) * pageSize;
  const paginated  = filtered.slice(pageStart, pageStart + pageSize);

  // Summary derived from full data
  const totalMm      = data.reduce((s, r) => s + parseFloat(r.rain_mm || 0), 0);
  const totalFlagged = data.reduce((s, r) => s + (r.double_tip_count || 0) + (r.interfere_count || 0) + (r.pseudo_event_count || 0), 0);

  return (
    <>
      {/* Date range */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          style={{ flex: 1, fontSize: 12, padding: '6px 8px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'white' }} />
        <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          style={{ flex: 1, fontSize: 12, padding: '6px 8px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'white' }} />
      </div>

      {/* ── Section gap ── */}
      <div style={{ height: 8, background: 'var(--color-surface-dark)' }} />

      {/* Resolution pills (aggregation) */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {RESOLUTIONS.map(r => pillBtn(resolution === r.value, () => setResolution(r.value), r.label))}
      </div>

      {/* ── Section gap ── */}
      <div style={{ height: 8, background: 'var(--color-surface-dark)' }} />

      {/* Flag filter pills (tip types) */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {FLAG_FILTERS.map(f => pillBtn(flagFilter === f.value, () => setFlagFilter(f.value), f.label))}
      </div>

      {/* ── Section gap ── */}
      <div style={{ height: 8, background: 'var(--color-surface-dark)' }} />

      {/* Summary strip + (optional) reprocess */}
      {(data.length > 0 || canReprocess) && (
        <div style={{ padding: '6px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface)' }}>
          {data.length > 0
            ? <span style={{ fontSize: 12, color: 'var(--color-text-med)' }}>
                <span style={{ fontWeight: 700, color: '#1565C0' }}>{totalMm.toFixed(1)} mm</span>
                {' · '}{data.length} periods
                {totalFlagged > 0 && <span style={{ color: '#E65100', fontWeight: 600 }}> · {totalFlagged} flagged</span>}
                {flagFilter && <span style={{ color: 'var(--color-text-light)' }}> (showing {filtered.length})</span>}
              </span>
            : <span style={{ fontSize: 12, color: 'var(--color-text-light)' }}>No processed data</span>
          }
          {canReprocess && (
            <button onClick={handleReprocess} disabled={reprocessing || !stationId}
              style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 8, border: '1.5px solid #BDBDBD', background: '#E0E0E0', color: '#555', cursor: reprocessing ? 'default' : 'pointer', opacity: reprocessing ? 0.5 : 1 }}>
              {reprocessing ? 'Processing…' : 'Reprocess'}
            </button>
          )}
        </div>
      )}

      {/* Tip count chart — daily / saws_daily / monthly / yearly only */}
      {!fetching && !fetchErr && filtered.length > 0 && (resolution === 'daily' || resolution === 'saws_daily' || resolution === 'monthly' || resolution === 'yearly') && (
        <div style={{ padding: '4px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <RainfallTipChart data={filtered} resolution={resolution} />
        </div>
      )}

      {/* ── Section gap (before table) ── */}
      {!fetching && !fetchErr && filtered.length > 0 && (
        <div style={{ height: 8, background: 'var(--color-surface-dark)' }} />
      )}

      {fetching && <div style={{ textAlign: 'center', padding: 32, fontSize: 13, color: 'var(--color-text-light)' }}>Loading…</div>}
      {!fetching && fetchErr && <div style={{ margin: 16, padding: '12px 16px', borderRadius: 12, background: '#FFF3E0', fontSize: 12, color: '#E65100' }}>{fetchErr}</div>}

      {/* Data table */}
      {!fetching && !fetchErr && (
        filtered.length === 0
          ? <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: 'var(--color-text-light)' }}>{data.length === 0 ? 'No processed data for this period' : 'No rows match this filter'}</div>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface)', borderBottom: '2px solid var(--color-border)' }}>
                    {[
                      { label: 'Period',       align: 'left'  },
                      { label: 'Rain mm',      align: 'right' },
                      { label: 'Valid tips',   align: 'right' },
                      { label: 'Double tip',   align: 'right', title: '1s bounce'       },
                      { label: 'Interfere',    align: 'right', title: 'Visit proximity' },
                      { label: 'Manual tip',   align: 'right', title: 'Technician tipped bucket' },
                      { label: 'Non-rainfall', align: 'right', title: 'Declared water entry' },
                      { label: '!',            align: 'center', title: 'Anomaly >10mm'  },
                    ].map(col => (
                      <th key={col.label} title={col.title || ''} style={{ padding: '6px 10px', fontWeight: 700, fontSize: 11, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: col.align, whiteSpace: 'nowrap' }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((row, i) => (
                    <tr key={row.period_start} style={{ borderBottom: '1px solid var(--color-surface-dark)', background: i % 2 === 0 ? 'white' : 'var(--color-surface)' }}>
                      <td style={{ padding: '5px 10px', color: 'var(--color-text-dark)', whiteSpace: 'nowrap' }}>{fmtPeriod(row.period_start, resolution)}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 600, color: parseFloat(row.rain_mm) > 0 ? '#1565C0' : 'var(--color-text-light)' }}>{parseFloat(row.rain_mm).toFixed(3)}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: row.valid_tips === row.tip_count ? '#2E7D32' : 'var(--color-text-dark)' }}>{row.valid_tips}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right' }}><FlagCell value={row.double_tip_count} /></td>
                      <td style={{ padding: '5px 10px', textAlign: 'right' }}><FlagCell value={row.interfere_count} /></td>
                      <td style={{ padding: '5px 10px', textAlign: 'right' }}><FlagCell value={row.manual_tip_count} /></td>
                      <td style={{ padding: '5px 10px', textAlign: 'right' }}><FlagCell value={row.non_rainfall_count} /></td>
                      <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                        {row.has_anomaly && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#FFF9C4', color: '#F57F17' }}>!</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}

      {/* Pagination bar */}
      {!fetching && !fetchErr && filtered.length > pageSize && (
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'var(--color-surface)' }}>
          {/* Row range label */}
          <span style={{ fontSize: 11, color: 'var(--color-text-light)', whiteSpace: 'nowrap' }}>
            {pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} of {filtered.length}
          </span>

          {/* Prev / page indicator / Next */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              style={{ fontSize: 13, fontWeight: 600, padding: '3px 10px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'white', color: safePage === 1 ? 'var(--color-text-light)' : 'var(--color-text-dark)', cursor: safePage === 1 ? 'default' : 'pointer' }}
            >‹</button>
            <span style={{ fontSize: 11, color: 'var(--color-text-med)', padding: '0 4px', whiteSpace: 'nowrap' }}>
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              style={{ fontSize: 13, fontWeight: 600, padding: '3px 10px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'white', color: safePage === totalPages ? 'var(--color-text-light)' : 'var(--color-text-dark)', cursor: safePage === totalPages ? 'default' : 'pointer' }}
            >›</button>
          </div>

          {/* Page size selector */}
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'white', color: 'var(--color-text-med)', cursor: 'pointer' }}
          >
            {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      )}
    </>
  );
}
