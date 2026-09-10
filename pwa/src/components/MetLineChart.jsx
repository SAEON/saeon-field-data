// Inline-SVG line chart for met station time-series data.
// Receives pivoted rows (one per period) and a category string.
// Uses the same compact SVG approach as GroundwaterLineChart.

const W = 500, H = 100, PL = 8, PR = 8, PT = 8, PB = 14;
const CW = W - PL - PR;
const CH = H - PT - PB;

const MAX_PTS = 600;

// Series definitions per category: { field, color, strokeWidth, dash, label, unit }
const SERIES = {
  temperature: [
    { field: 'air_temp_avg', color: '#1565C0', sw: 1.2, dash: null,  label: 'Avg temp', unit: '°C' },
    { field: 'air_temp_min', color: '#90CAF9', sw: 0.8, dash: '3,2', label: 'Min temp', unit: '°C' },
    { field: 'air_temp_max', color: '#EF9A9A', sw: 0.8, dash: '3,2', label: 'Max temp', unit: '°C' },
    { field: 'rh_avg',       color: '#F59E0B', sw: 0.8, dash: null,  label: 'RH',       unit: '%', secondary: true },
  ],
  wind: [
    { field: 'wind_speed_avg', color: '#1565C0', sw: 1.2, dash: null, label: 'Wind speed', unit: 'm/s' },
  ],
  radiation: [
    { field: 'solar_rad_avg', color: '#F59E0B', sw: 1.2, dash: null, label: 'Solar rad', unit: 'W/m²' },
  ],
  uv: [
    { field: 'uv_rad_avg', color: '#7C3AED', sw: 1.2, dash: null, label: 'UV rad', unit: 'W/m²' },
  ],
  pressure: [
    { field: 'atm_pressure_avg', color: '#059669', sw: 1.2, dash: null, label: 'Pressure', unit: 'hPa' },
  ],
  rainfall: [
    { field: 'rain_tot', color: '#1565C0', sw: 1.2, dash: null, label: 'Rainfall', unit: 'mm', bars: true },
  ],
  soil_temp: [
    { field: 'soil_temp_avg', color: '#92400E', sw: 1.2, dash: null, label: 'Soil temp', unit: '°C' },
  ],
  leaf_wetness: [
    { field: 'leaf_wetness_mv', color: '#16A34A', sw: 1.2, dash: null, label: 'Leaf wetness', unit: 'mV' },
  ],
  soil_moisture: [
    { field: 'soil_moisture_avg', color: '#0369A1', sw: 1.2, dash: null, label: 'Soil moisture', unit: '%' },
  ],
};

function scaleRange(vals) {
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return { min, max, range: max - min || 0.001 };
}

function buildPolyline(pts, xOf, yOf, field) {
  return pts
    .filter(r => r[field] != null)
    .map(r => `${xOf(new Date(r.period).getTime())},${yOf(r[field])}`)
    .join(' ');
}

export default function MetLineChart({ data, category }) {
  if (!data || data.length === 0) return null;

  const seriesDef = SERIES[category];
  if (!seriesDef) return null;

  // Thin large datasets
  const step = Math.max(1, Math.floor(data.length / MAX_PTS));
  const pts   = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  const times  = pts.map(r => new Date(r.period).getTime());
  const t0     = Math.min(...times);
  const tRange = (Math.max(...times) - t0) || 1;
  const xOf    = t => PL + ((t - t0) / tRange) * CW;

  // Compute primary scale (all non-secondary series)
  const primaryFields = seriesDef.filter(s => !s.secondary && !s.bars).map(s => s.field);
  const primaryVals   = pts.flatMap(r => primaryFields.map(f => r[f]).filter(v => v != null));
  if (primaryVals.length === 0) return null;
  const { min: pMin, max: pMax, range: pRange } = scaleRange(primaryVals);
  const yOfPrimary = v => PT + CH - ((v - pMin) / pRange) * CH;

  // Compute secondary (RH) scale for temperature category
  const secondaryDef = seriesDef.find(s => s.secondary);
  let yOfSecondary = null;
  let sMin = 0, sMax = 0;
  if (secondaryDef) {
    const sVals = pts.map(r => r[secondaryDef.field]).filter(v => v != null);
    if (sVals.length > 0) {
      const { min, max, range } = scaleRange(sVals);
      sMin = min; sMax = max;
      yOfSecondary = v => PT + CH - ((v - min) / range) * CH;
    }
  }

  // Rainfall bar rendering
  const barDef = seriesDef.find(s => s.bars);
  let bars = [];
  if (barDef && pts.length > 0) {
    const vals = pts.map(r => r[barDef.field]).filter(v => v != null);
    if (vals.length > 0) {
      const maxV = Math.max(...vals) || 0.001;
      const barW = Math.max(1, (CW / pts.length) * 0.8);
      bars = pts
        .filter(r => r[barDef.field] != null && r[barDef.field] > 0)
        .map(r => {
          const bh = (r[barDef.field] / maxV) * CH;
          const bx = xOf(new Date(r.period).getTime()) - barW / 2;
          return { x: bx, y: PT + CH - bh, w: barW, h: bh, v: r[barDef.field] };
        });
    }
  }

  // Three x-axis labels
  const labelIdxs = [0, Math.floor(pts.length / 2), pts.length - 1];
  const anchors   = ['start', 'middle', 'end'];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
        {/* baseline */}
        <line x1={PL} y1={PT + CH} x2={W - PR} y2={PT + CH}
          stroke="var(--color-border)" strokeWidth={0.5} />

        {/* bar chart (rainfall) */}
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h}
            fill="#1565C0" opacity={0.6} />
        ))}

        {/* secondary series (RH) */}
        {secondaryDef && yOfSecondary && (() => {
          const poly = buildPolyline(pts, xOf, yOfSecondary, secondaryDef.field);
          return poly ? (
            <polyline points={poly} fill="none"
              stroke={secondaryDef.color} strokeWidth={secondaryDef.sw} opacity={0.5} />
          ) : null;
        })()}

        {/* primary series */}
        {seriesDef.filter(s => !s.secondary && !s.bars).map(s => {
          const poly = buildPolyline(pts, xOf, yOfPrimary, s.field);
          return poly ? (
            <polyline key={s.field} points={poly} fill="none"
              stroke={s.color} strokeWidth={s.sw}
              strokeDasharray={s.dash || undefined} />
          ) : null;
        })}

        {/* y-axis labels for primary */}
        <text x={PL} y={PT + 5}      fontSize={6} fill="#9CA3AF">{pMax.toFixed(1)}</text>
        <text x={PL} y={PT + CH - 2} fontSize={6} fill="#9CA3AF">{pMin.toFixed(1)}</text>

        {/* x-axis date labels */}
        {labelIdxs.map((idx, i) => {
          const r = pts[idx];
          if (!r) return null;
          return (
            <text key={i}
              x={xOf(new Date(r.period).getTime())} y={H - 2}
              fontSize={6} fill="#9CA3AF" textAnchor={anchors[i]}>
              {new Date(r.period).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: '2-digit' })}
            </text>
          );
        })}
      </svg>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
        {seriesDef.map(s => {
          if (s.bars) {
            return (
              <span key={s.field} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#6B7280' }}>
                <span style={{ width: 10, height: 10, background: s.color, display: 'inline-block', opacity: 0.6 }} />
                {s.label} ({s.unit})
              </span>
            );
          }
          if (s.secondary && !yOfSecondary) return null;
          return (
            <span key={s.field} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#6B7280' }}>
              <span style={{
                width: 14, height: 2, background: s.color, display: 'inline-block',
                opacity: s.secondary ? 0.5 : 1,
              }} />
              {s.label} ({s.unit}){s.secondary ? ' — right scale' : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}
