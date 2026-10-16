import { useEffect, useRef, useState } from 'react';
import { subscribeNotice } from '../services/notice.js';

export default function Notice() {
  const [notice, setNotice] = useState(null);
  const timer = useRef(null);

  useEffect(() => subscribeNotice(n => {
    clearTimeout(timer.current);
    setNotice(n);
    timer.current = setTimeout(() => setNotice(null), n.ms);
  }), []);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!notice) return null;
  return (
    <div
      role="status"
      onClick={() => setNotice(null)}
      style={{
        position: 'fixed', left: 12, right: 12, top: 12, zIndex: 110,
        maxWidth: 520, margin: '0 auto',
        background: '#0D1B2E', color: '#fff', borderRadius: 12,
        padding: '10px 14px', fontSize: 12, lineHeight: 1.4,
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)', cursor: 'pointer',
      }}
    >
      {notice.text}
    </div>
  );
}
