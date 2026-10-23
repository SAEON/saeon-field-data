// "Same as last visit" — a prominent pill, so technicians notice they can start from what was recorded before.
// Sizes are set inline because the app's global button rule overrides font-size classes on buttons.
export default function CopyLastPill({ onClick, label = 'Same as last visit' }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12, fontWeight: 700, minHeight: 32, padding: '5px 14px', borderRadius: 999,
        color: 'var(--color-navy)', background: 'white', border: '1.5px solid var(--color-navy)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
