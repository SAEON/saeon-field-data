const BASE = import.meta.env.VITE_KRATOS_PUBLIC_URL;

export async function initLoginFlow() {
  const r = await fetch(`${BASE}/self-service/login/api`);
  if (!r.ok) throw new Error('Could not initiate login flow');
  return r.json(); // { id: flowId, ... }
}

export async function submitLogin(flowId, identifier, password) {
  const r = await fetch(`${BASE}/self-service/login?flow=${flowId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'password', identifier, password }),
  });
  const data = await r.json();
  if (!r.ok) throw data;
  return data; // { session_token, session: { identity: { traits: { email, name, role } } } }
}

export async function whoami(token) {
  const r = await fetch(`${BASE}/sessions/whoami`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  return r.json(); // { identity: { id, traits } }
}

export async function kratosLogout(token) {
  await fetch(`${BASE}/self-service/logout/api`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}
