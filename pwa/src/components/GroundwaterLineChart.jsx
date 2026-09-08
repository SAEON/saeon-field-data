// Inline-SVG line chart for processed groundwater levels.
// Primary series: level_m_asl (blue). Secondary: temp_c (amber).
// Outlier points rendered as open orange circles.

const W = 500, H = 100, PL = 8, PR = 8, PT = 8, PB = 14;
const CW = W - PL - PR;
const CH = H - PT - PB;

export default function GroundwaterLineChart({ data }) {
  if (!data || data.length === 0) return null;

  // Thin large datasets so SVG stays fast
  const MAX_PTS = 600;
  const step = Math.max(1, Math.floor(data.length / MAX_PTS));
  const pts  = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  const levels    = pts.map(r => r.level_m_asl).filter(v => v != null);
  const rawLevels = pts.map(r => r.level_m_raw).filter(v => v != null);
  const temps     = pts.map(r => r.temp_c).filter(v => v != null);

  // When baro-compensation hasn't run yet, fall back to raw pressure-head values
  const useRaw    = levels.length === 0 && rawLevels.length > 0;
  const workLevels = useRaw ? rawLevels : levels;
  if (workLevels.length === 0) return null;

  const minL = Math.min(...workLevels), maxL = Math.max(...workLevels);
  const minT = temps.length ? Math.min(...temps) : 0;
  const maxT = temps.length ? Math.max(...temps) : 1;
  const rangeL = maxL - minL || 0.001;
  const rangeT = maxT - minT || 0.001;

  const times = pts.map(r => new Date(r.measured_at).getTime());
  const t0 = Math.min(...times);
  const tRange = (Math.max(...times) - t0) || 1;

  const xOf  = t => PL + ((t - t0) / tRange) * CW;
  const yOfL = v => PT + CH - ((v - minL) / rangeL) * CH;
  const yOfT = v => PT + CH - ((v - minT) / rangeT) * CH;

  const levelPts = pts.filter(r => (useRaw ? r.level_m_raw : r.level_m_asl) != null);
  const tempPts  = pts.filter(r => r.temp_c != null);

  const polyL = levelPts.map(r => {
    const v = useRaw ? r.level_m_raw : r.level_m_asl;
    return `${xOf(new Date(r.measured_at).getTime())},${yOfL(v)}`;
  }).join(' ');
  const polyT = tempPts.map(r =>  `${xOf(new Date(r.measured_at).getTime())},${yOfT(r.temp_c)}`).join(' ');

  const outliers = useRaw ? [] : levelPts.filter(r => r.bt_outlier);

  // Three date labels: start, mid, end
  const labelIdxs = [0, Math.floor(levelPts.length / 2), levelPts.length - 1];
  const anchors   = ['start', 'middle', 'end'];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
        {/* baseline */}
        <line x1={PL} y1={PT + CH} x2={W - PR} y2={PT + CH}
          stroke="var(--color-border)" strokeWidth={0.5} />

        {/* temperature (secondary, muted) */}
        {polyT && <polyline points={polyT} fill="none" stroke="#F59E0B" strokeWidth={0.8} opacity={0.5} />}

        {/* water level (primary) */}
        <polyline points={polyL} fill="none" stroke="#1565C0" strokeWidth={1.2} />

        {/* outlier markers */}
        {outliers.map((r, i) => (
          <circle key={i}
            cx={xOf(new Date(r.measured_at).getTime())} cy={yOfL(r.level_m_asl)}
            r={2.5} fill="none" stroke="#E65100" strokeWidth={1} />
        ))}

        {/* y-axis labels */}
        <text x={PL} y={PT + 5}    fontSize={6} fill="#9CA3AF">{maxL.toFixed(2)} m</text>
        <text x={PL} y={PT + CH - 2} fontSize={6} fill="#9CA3AF">{minL.toFixed(2)} m</text>

        {/* x-axis date labels */}
        {labelIdxs.map((idx, i) => {
          const r = levelPts[idx];
          if (!r) return null;
          return (
            <text key={i}
              x={xOf(new Date(r.measured_at).getTime())} y={H - 2}
              fontSize={6} fill="#9CA3AF" textAnchor={anchors[i]}>
              {new Date(r.measured_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: '2-digit' })}
            </text>
          );
        })}
      </svg>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#6B7280' }}>
          <span style={{ width: 14, height: 2, background: '#1565C0', display: 'inline-block' }} />
          {useRaw ? 'Raw level (m) — uncompensated' : 'Water level (m asl)'}
        </span>
        {polyT && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#6B7280' }}>
            <span style={{ width: 14, height: 2, background: '#F59E0B', display: 'inline-block', opacity: 0.5 }} />
            Temperature (°C)
          </span>
        )}
        {outliers.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#6B7280' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', border: '1.5px solid #E65100', display: 'inline-block' }} />
            Outlier ({outliers.length})
          </span>
        )}
      </div>
    </div>
  );
}
