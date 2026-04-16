// Stacked bar chart showing valid, double-tip, interfere, and manual-tip counts per period.
// Mirrors the inline-SVG approach used by RainfallBarChart in LeadDashboard.
// Props:
//   data        — array of rainfall rows (from getStationRainfall), each with
//                 { period_start, valid_tips, double_tip_count, interfere_count, manual_tip_count }
//   resolution  — current resolution string (used only for label formatting)

const SERIES = [
  { key: 'valid_tips',       label: 'Valid',       color: '#3B7DD8' },
  { key: 'double_tip_count', label: 'Double tip',  color: '#E65100' },
  { key: 'interfere_count',  label: 'Interfere',   color: '#F59E0B' },
  { key: 'manual_tip_count', label: 'Manual tip',  color: '#7C3AED' },
];

export default function RainfallTipChart({ data, resolution }) {
  if (!data || data.length === 0) return null;

  const W = 400, H = 72, barArea = 56, labelY = H - 1;
  const gap  = W / data.length;
  const barW = Math.max(Math.min(gap - 0.5, 4), 1.5);

  // Determine max total per period for scaling
  const maxCount = Math.max(
    ...data.map(r =>
      (r.valid_tips || 0) +
      (r.double_tip_count || 0) +
      (r.interfere_count || 0) +
      (r.manual_tip_count || 0)
    ),
    1
  );

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
        {data.map((r, i) => {
          const x = i * gap + gap / 2 - barW / 2;
          const d = new Date(r.period_start);
          const showLabel = d.getDate() === 1 || (data.length <= 31 && d.getDay() === 1);

          // Stack bars bottom-up: valid → double → interfere → manual
          let yOffset = barArea;
          const segments = SERIES.map(s => {
            const count = r[s.key] || 0;
            const h = (count / maxCount) * barArea;
            yOffset -= h;
            return { color: s.color, h, y: yOffset, count };
          });

          return (
            <g key={r.period_start}>
              {segments.map((seg, si) =>
                seg.count > 0 ? (
                  <rect key={si} x={x} y={seg.y} width={barW} height={seg.h}
                    fill={seg.color} rx={0.5} />
                ) : null
              )}
              {showLabel && (
                <text x={x + barW / 2} y={labelY}
                  fontSize="6" fill="#9CA3AF" textAnchor="middle">
                  {d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
        {SERIES.map(s => (
          <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#6B7280' }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color, display: 'inline-block', flexShrink: 0 }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
