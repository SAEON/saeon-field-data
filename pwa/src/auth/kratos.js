const BASE = import.meta.env.VITE_KRATOS_PUBLIC_URL;

export async function initLoginFlow() {
  const r = await fetch(`${BASE}/self-service/login/browser`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!r.ok) throw new Error('Could not initiate login flow');
  return r.json();
}

export async function submitLogin(flowId, identifier, password) {
  const r = await fetch(`${BASE}/self-service/login?flow=${flowId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ method: 'password', identifier, password }),
  });
  const data = await r.json();
  if (!r.ok) throw data;
  return data;
}

export async function whoami() {
  const r = await fetch(`${BASE}/sessions/whoami`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) return null;
  return r.json();
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
    });
  }
}
