// Groundwater data table — mirrors RainfallDataTable structure.
// Fetches processed groundwater levels for a station with a date range.

import { useState, useEffect, useRef } from 'react';
import { getStationGroundwater } from '../services/api.js';
import GroundwaterLineChart from './GroundwaterLineChart.jsx';

function isoDate(d) { return d.toISOString().slice(0, 10); }

function fmtNum(v, d = 3) { return v != null ? Number(v).toFixed(d) : '—'; }

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

const PAGE_SIZES = [25, 50, 100];

export default function GroundwaterDataTable({ stationId }) {
  const [from,     setFrom]     = useState(isoDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)));
  const [to,       setTo]       = useState(isoDate(new Date()));
  const [data,     setData]     = useState([]);
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState(null);
  const [page,        setPage]        = useState(1);
  const [pageSize,    setPageSize]    = useState(50);
  const [outlierOnly, setOutlierOnly] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!stationId) { setData([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFetching(true);
      setFetchErr(null);
      getStationGroundwater(stationId, { from, to: to ? `${to}T23:59:59` : to })
        .then(r => { setData(r.data || []); setPage(1); setOutlierOnly(false); })
        .catch(e => setFetchErr(e.message || 'Failed to load'))
        .finally(() => setFetching(false));
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [stationId, from, to]);

  const viewData  = outlierOnly ? data.filter(r => r.bt_outlier) : data;
  const total     = viewData.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageData  = viewData.slice((page - 1) * pageSize, page * pageSize);

  const inputStyle = {
    fontSize: 11, padding: '4px 8px', borderRadius: 8,
    border: '1.5px solid var(--color-border)', background: 'white',
    color: 'var(--color-text-dark)', height: 28,
  };

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Date range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-light)', fontWeight: 600 }}>From</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        <span style={{ fontSize: 11, color: 'var(--color-text-light)', fontWeight: 600 }}>To</span>
        <input type="date" value={to}   onChange={e => setTo(e.target.value)}   style={inputStyle} />
        {fetching && <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>Loading…</span>}
      </div>

      {fetchErr && (
        <div style={{ fontSize: 11, color: 'var(--color-error)', background: '#FFF3E0', padding: '6px 10px', borderRadius: 8 }}>
          {fetchErr}
        </div>
      )}

      {/* Summary strip */}
      {!fetching && data.length > 0 && (() => {
        const withLevel = data.filter(r => r.level_m_asl != null);
        const withRaw   = data.filter(r => r.level_m_raw != null);
        const withTemp  = data.filter(r => r.temp_c != null);
        const outliers  = data.filter(r => r.bt_outlier);
        const levelSrc  = withLevel.length ? withLevel.map(r => r.level_m_asl) : withRaw.map(r => r.level_m_raw);
        const levelLabel = withLevel.length ? 'm asl' : 'm raw';
        const minL = levelSrc.length ? Math.min(...levelSrc) : null;
        const maxL = levelSrc.length ? Math.max(...levelSrc) : null;
        return (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
              Records <span style={{ fontWeight: 700, color: 'var(--color-text-dark)' }}>{total.toLocaleString()}</span>
            </span>
            {minL != null && (
              <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
                Level <span style={{ fontWeight: 700, color: 'var(--color-text-dark)' }}>{minL.toFixed(3)}–{maxL.toFixed(3)} {levelLabel}</span>
              </span>
            )}
            {withLevel.length === 0 && withRaw.length > 0 && (
              <span style={{ fontSize: 10, color: '#9333ea', fontWeight: 600 }}>uncompensated — no barologger data</span>
            )}
            {withTemp.length > 0 && (() => {
              const minT = Math.min(...withTemp.map(r => r.temp_c));
              const maxT = Math.max(...withTemp.map(r => r.temp_c));
              return (
                <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
                  Temp <span style={{ fontWeight: 700, color: 'var(--color-text-dark)' }}>{minT.toFixed(1)}–{maxT.toFixed(1)} °C</span>
                </span>
              );
            })()}
            {outliers.length > 0 && (
              <button onClick={() => { setOutlierOnly(v => !v); setPage(1); }} style={{
                fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
                padding: '2px 8px', borderRadius: 20,
                background: outlierOnly ? '#E65100' : '#FFF3E0',
                color: outlierOnly ? 'white' : '#E65100',
              }}>
                ⚠ {outliers.length} outlier{outliers.length !== 1 ? 's' : ''} flagged
              </button>
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
          <GroundwaterLineChart data={data} />
        </div>
      )}

      {/* Table */}
      {!fetching && data.length > 0 && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid var(--color-border)' }}>
                  {['Date / time', 'Raw (m)', 'Level (m asl)', 'Comp. level (m)', 'Temp (°C)', 'Outlier'].map(h => (
                    <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 700, color: 'var(--color-text-light)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border)', background: r.bt_outlier ? '#FFF8F0' : 'transparent' }}>
                    <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtDateTime(r.measured_at)}</td>
                    <td style={{ padding: '4px 8px', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-light)' }}>{fmtNum(r.level_m_raw)}</td>
                    <td style={{ padding: '4px 8px', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(r.level_m_asl)}</td>
                    <td style={{ padding: '4px 8px', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(r.level_m_comp)}</td>
                    <td style={{ padding: '4px 8px', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(r.temp_c, 2)}</td>
                    <td style={{ padding: '4px 8px', color: r.bt_outlier ? '#E65100' : 'var(--color-text-light)', fontWeight: r.bt_outlier ? 700 : 400 }}>
                      {r.bt_outlier ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>⚠ {r.bt_outlier_rule || 'outlier'}</span>
                          <span
                            title="Hampel filter: |value − window median| > 5 × 1.4826 × MAD (half-window = 10 pts, k = 1.4826)"
                            style={{ cursor: 'help', fontSize: 10, color: '#9CA3AF', fontWeight: 400 }}>ⓘ</span>
                        </span>
                      ) : '—'}
                    </td>
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
