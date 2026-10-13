// Inline-SVG line chart for processed groundwater levels.
// Left axis: most-processed level series available (m asl → compensated → raw).
// Right axis: water temperature (°C), amber, on its own scale.
// Outlier points rendered as open orange circles.

const W = 500, H = 110, PL = 36, PR = 30, PT = 14, PB = 14;
const CW = W - PL - PR;
const CH = H - PT - PB;

const SERIES = {
  asl:  { field: 'level_m_asl',  axis: 'm asl', label: 'Level (m asl)' },
  comp: { field: 'level_m_comp', axis: 'm comp.', label: 'Comp. level (m)' },
  raw:  { field: 'level_m_raw',  axis: 'm raw', label: 'Raw (m)' },
  baro: { field: 'level_m_raw',  axis: 'kPa',   label: 'Pressure (kPa)' },
};

export default function GroundwaterLineChart({ data, variant }) {
  if (!data || data.length === 0) return null;

  // Thin large datasets so SVG stays fast
  const MAX_PTS = 600;
  const step = Math.max(1, Math.floor(data.length / MAX_PTS));
  const pts  = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  const has = f => pts.some(r => r[f] != null);
  const kind = variant === 'barologger' ? 'baro' : has('level_m_asl') ? 'asl' : has('level_m_comp') ? 'comp' : has('level_m_raw') ? 'raw' : null;
  if (!kind) return null;
  const S = SERIES[kind];

  const levelPts = pts.filter(r => r[S.field] != null);
  const tempPts  = pts.filter(r => r.temp_c != null);
  const levels   = levelPts.map(r => Number(r[S.field]));
  const temps    = tempPts.map(r => Number(r.temp_c));

  const minL = Math.min(...levels), maxL = Math.max(...levels);
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

  const polyL = levelPts.map(r => `${xOf(new Date(r.measured_at).getTime())},${yOfL(Number(r[S.field]))}`).join(' ');
  const polyT = tempPts.map(r => `${xOf(new Date(r.measured_at).getTime())},${yOfT(Number(r.temp_c))}`).join(' ');

  const outliers = kind === 'raw' || kind === 'baro' ? [] : levelPts.filter(r => r.bt_outlier);

  const labelIdxs = [0, Math.floor(levelPts.length / 2), levelPts.length - 1];
  const anchors   = ['start', 'middle', 'end'];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
        {/* plot area baseline + top guide */}
        <line x1={PL} y1={PT + CH} x2={W - PR} y2={PT + CH} stroke="var(--color-border)" strokeWidth={0.5} />
        <line x1={PL} y1={PT}      x2={W - PR} y2={PT}      stroke="var(--color-border)" strokeWidth={0.3} strokeDasharray="2 2" />

        {/* temperature (right axis) */}
        {polyT && <polyline points={polyT} fill="none" stroke="#F59E0B" strokeWidth={1} opacity={0.85} />}

        {/* level (left axis) */}
        <polyline points={polyL} fill="none" stroke="#1565C0" strokeWidth={1.2} />

        {outliers.map((r, i) => (
          <circle key={i}
            cx={xOf(new Date(r.measured_at).getTime())} cy={yOfL(Number(r[S.field]))}
            r={2.5} fill="none" stroke="#E65100" strokeWidth={1} />
        ))}

        {/* left axis: level */}
        <text x={0} y={PT - 4} fontSize={6} fill="#1565C0" fontWeight={700}>{S.axis}</text>
        <text x={PL - 3} y={PT + 4}      fontSize={6} fill="#6B7280" textAnchor="end">{maxL.toFixed(2)}</text>
        <text x={PL - 3} y={PT + CH}     fontSize={6} fill="#6B7280" textAnchor="end">{minL.toFixed(2)}</text>

        {/* right axis: temperature */}
        {polyT && (
          <>
            <text x={W - PR + 3} y={PT - 4}  fontSize={6} fill="#B45309" fontWeight={700}>°C</text>
            <text x={W - PR + 3} y={PT + 4}  fontSize={6} fill="#B45309">{maxT.toFixed(1)}</text>
            <text x={W - PR + 3} y={PT + CH} fontSize={6} fill="#B45309">{minT.toFixed(1)}</text>
          </>
        )}

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
          {S.label}
        </span>
        {polyT && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#6B7280' }}>
            <span style={{ width: 14, height: 2, background: '#F59E0B', display: 'inline-block' }} />
            {variant === 'barologger' ? 'Temperature (°C)' : 'Water temperature (°C)'}
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
