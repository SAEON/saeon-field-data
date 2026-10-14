const BASE = import.meta.env.VITE_KRATOS_PUBLIC_URL;

export async function initLoginFlow() {
  const r = await fetch(`${BASE}/self-service/login/browser`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!r.ok) throw new Error('Could not initiate login flow');
  return r.json();
}

export async function submitLogin(flowId, csrfToken, identifier, password) {
  const r = await fetch(`${BASE}/self-service/login?flow=${flowId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ method: 'password', identifier, password, csrf_token: csrfToken }),
  });
  const data = await r.json();
  if (!r.ok) throw data;
  return data;
}

// Session check with three outcomes, so "no signal" is never mistaken for "signed out":
//   { status: 'ok', session }  — signed in
//   { status: 'none' }         — the server says there is no session (401/403)
//   { status: 'unreachable' }  — network error, timeout, 5xx, or a non-JSON reply (captive portal)
export async function checkSession(timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/sessions/whoami`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (r.status === 401 || r.status === 403) return { status: 'none' };
    if (!r.ok) return { status: 'unreachable' };
    try {
      return { status: 'ok', session: await r.json() };
    } catch {
      return { status: 'unreachable' };
    }
  } catch {
    return { status: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

export async function whoami() {
  const res = await checkSession();
  return res.status === 'ok' ? res.session : null;
}

export async function initSettingsFlow() {
  const r = await fetch(`${BASE}/self-service/settings/browser`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!r.ok) throw new Error('Could not initiate settings flow');
  return r.json();
}

export async function submitPasswordChange(flowId, csrfToken, password) {
  const r = await fetch(`${BASE}/self-service/settings?flow=${flowId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ method: 'password', password, csrf_token: csrfToken }),
  });
  const data = await r.json();
  if (!r.ok) throw data;
  return data;
}

export async function kratosLogout() {
  const r = await fetch(`${BASE}/self-service/logout/browser`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) return;
  const { logout_token } = await r.json();
  if (logout_token) {
    await fetch(`${BASE}/self-service/logout?token=${logout_token}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  }
}
