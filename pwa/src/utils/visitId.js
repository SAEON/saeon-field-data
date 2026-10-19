// A visit started with no signal has a local id until the server creates it; after that it gets the
// server's integer id and everything stored under the local id is moved across (see outbox.remapVisit).

export const newLocalVisitId = () =>
  `local-${(globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`)}`;

export const isLocalVisit = id => typeof id === 'string' && id.startsWith('local-');
