// TechnicianDataTab — read-only rainfall view for the technician's own stations.
// Mirrors the Manager rainfall view but without Reprocess + with a parse-error
// banner that surfaces failed files for the selected station.

import { useState, useEffect } from 'react';
import ProfileButton from '../auth/ProfileSheet.jsx';
import { getStations, getFilesWithErrors } from '../services/api.js';
import RainfallDataTable from '../components/RainfallDataTable.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ErrorBanner({ errors, onToggle, expanded }) {
  if (errors.length === 0) return null;
  return (
    <div style={{ borderBottom: '1px solid var(--color-border)', background: '#FFF3E0' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 12, fontWeight: 600, color: '#E65100',
        }}
      >
        <span>⚠ {errors.length} parse error{errors.length !== 1 ? 's' : ''} on this station</span>
        <span style={{ fontSize: 14 }}>{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ fontSize: 11, color: '#E65100', marginBottom: 8 }}>
            Contact your team lead to retry parsing.
          </div>
          {errors.map(file => (
            <div key={file.id} style={{
              background: 'white', border: '1px solid #FFCDD2', borderRadius: 8,
              padding: '8px 10px', marginBottom: 6,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-dark)' }}>{file.original_name}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-light)' }}>{formatDateTime(file.uploaded_at)}</div>
              <div style={{
                fontSize: 10, fontFamily: 'monospace', color: '#E65100',
                marginTop: 4, padding: '4px 6px', borderRadius: 4, background: '#FFF8E1',
                wordBreak: 'break-word',
              }}>
                {(file.parse_error || 'Unknown error').slice(0, 160)}
                {(file.parse_error || '').length > 160 && '…'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TechnicianDataTab() {
  const auth = useAuth();
  const canReprocess = auth?.hasRole('technician_lead') ?? false;
  const [stations, setStations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [allErrors, setAllErrors] = useState([]);
  const [errorsExpanded, setErrorsExpanded] = useState(false);

  useEffect(() => {
    getStations()
      .then(all => {
        const rf = (all || []).filter(s => s.data_family === 'rainfall');
        setStations(rf);
        if (rf.length) setSelected(rf[0].id);
      })
      .catch(() => {});
    getFilesWithErrors()
      .then(setAllErrors)
      .catch(() => {});
  }, []);

  const stationName    = stations.find(s => s.id === selected)?.display_name;
  const stationErrors  = allErrors.filter(e => e.station_id === selected);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="bg-navy h-14 flex items-center px-4 sticky top-0 z-50 shrink-0">
        <div className="w-10" />
        <div className="flex-1 text-center px-2">
          <div className="text-white text-[17px] font-bold truncate leading-tight">Data</div>
          {stationName && <div className="text-white text-[11px] opacity-60 leading-tight">{stationName}</div>}
        </div>
        <ProfileButton />
      </header>

      <main className="flex-1 overflow-y-auto w-full max-w-[var(--max-width)] mx-auto">

        {stations.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 48, fontSize: 13, color: 'var(--color-text-light)' }}>
            No rainfall stations assigned to you.
          </div>
        )}

        {stations.length > 0 && (
          <>
            {/* Station selector */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Station</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {stations.map(s => (
                  <button key={s.id} onClick={() => { setSelected(s.id); setErrorsExpanded(false); }}
                    style={{ fontSize: 12, fontWeight: selected === s.id ? 700 : 500, padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${selected === s.id ? '#1565C0' : 'var(--color-border)'}`, background: selected === s.id ? '#EBF2FB' : 'var(--color-surface)', color: selected === s.id ? '#1565C0' : 'var(--color-text-med)', cursor: 'pointer' }}>
                    {s.display_name}
                  </button>
                ))}
              </div>
            </div>

            <ErrorBanner
              errors={stationErrors}
              expanded={errorsExpanded}
              onToggle={() => setErrorsExpanded(v => !v)}
            />

            <RainfallDataTable stationId={selected} canReprocess={canReprocess} />
          </>
        )}
      </main>
    </div>
  );
}
