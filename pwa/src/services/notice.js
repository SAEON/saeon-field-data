// Tiny app-wide message bus: any code can show a short confirmation, and <Notice /> (mounted once at the
// root) displays it — even after the screen that raised it has been left.
const listeners = new Set();

export function showNotice(text, { ms = 6000 } = {}) {
  listeners.forEach(fn => fn({ text, ms }));
}

export function subscribeNotice(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
