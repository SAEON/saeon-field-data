// Connection health, decided for the user. On a weak link a request can hang for 30 seconds before it
// fails, so a form that saves several readings would crawl. Instead, the first failure (or a failed quick
// check) switches the app to offline mode for everything: changes go straight into the queue, reads use
// the saved copies, nothing waits. A background check watches for the link to recover, and once it has
// held up the app switches back and everything queued is sent. The user never has to do anything.

const BASE = import.meta.env.VITE_API_URL ?? '';

const VERIFIED_MS      = 30 * 1000;   // a recent success counts as proof the link works
const PROBE_TIMEOUT_MS = 3 * 1000;    // longer than this and the link is too weak to be worth waiting for
const GOOD_MS          = 2 * 1000;    // to switch back, the check must come back at least this quickly…
const RECOVER_NEEDS    = 2;           // …twice in a row
const RECOVER_EVERY_MS = 10 * 1000;

let down        = false;
let lastOk      = 0;
let inflight    = null;
let goodStreak  = 0;
let recoverTimer = null;

const deviceOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export const isLinkDown = () => down || deviceOffline();

// One tiny request to the server. Returns how long it took in ms, or null if it failed or timed out.
async function probeOnce() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = performance.now();
  try {
    const res = await fetch(`${BASE}/api/health`, { cache: 'no-store', credentials: 'include', signal: controller.signal });
    return res.status < 500 ? performance.now() - started : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Any answer from the server (even a rejection) proves the link works
export function noteSuccess() { lastOk = Date.now(); }

// No usable answer: go offline and start watching for recovery
export function noteFailure() {
  down = true;
  goodStreak = 0;
  if (!recoverTimer) recoverTimer = setInterval(checkRecovery, RECOVER_EVERY_MS);
}

async function checkRecovery() {
  if (!down) return;
  if (deviceOffline()) { goodStreak = 0; return; }
  const ms = await probeOnce();
  goodStreak = ms !== null && ms <= GOOD_MS ? goodStreak + 1 : 0;
  if (goodStreak >= RECOVER_NEEDS) restore();
}

function restore() {
  down = false;
  goodStreak = 0;
  lastOk = Date.now();
  clearInterval(recoverTimer);
  recoverTimer = null;
  window.dispatchEvent(new Event('fds-link-restored'));   // the sync engine, lists and session check pick it up
}

// Call before a request. False means "treat as offline right now" — no waiting.
export async function ensureLink() {
  if (isLinkDown()) return false;
  if (Date.now() - lastOk < VERIFIED_MS) return true;
  if (!inflight) {
    inflight = probeOnce().then(ms => {
      inflight = null;
      if (ms === null) { noteFailure(); return false; }
      lastOk = Date.now();
      return true;
    });
  }
  return inflight;
}

if (typeof window !== 'undefined') {
  // The device itself says the network is back: check straight away instead of waiting for the next tick
  window.addEventListener('online', () => { if (down) checkRecovery(); });
}
