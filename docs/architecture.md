# Architecture

---

## System overview

Production runs across two servers:

```
┌─────────────────────────────────────────────────────────────────────┐
│  APP SERVER                                                          │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  nginx                                                        │   │
│  │  /          → PWA static files (pwa/dist/)                   │   │
│  │  /api/*     → Node.js API  :3000                             │   │
│  │  /authcloack → Keycloak    :8080                             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Node.js / Express API        Keycloak 24 (Docker)                  │
│  Routes · Parsers · Processors  └─ identity provider only           │
└───────────────────────┬─────────────────────────────────────────────┘
                        │ SQL (pg)
┌───────────────────────▼─────────────────────────────────────────────┐
│  DATABASE SERVER                                                     │
│                                                                      │
│  PostgreSQL 16 — FDS database                                        │
└─────────────────────────────────────────────────────────────────────┘

Browser (PWA) connects over HTTPS to the app server only.
```

nginx on the app server proxies `/api` to Node.js port 3000, `/authcloack` to Keycloak port 8080, and serves the PWA `dist/` as static files.

---

## Component responsibilities

### PWA (`pwa/`)

- React + Vite single-page app, installable as a PWA
- Offline-first: visits and readings are queued in IndexedDB and synced when connectivity returns (`hooks/useOfflineQueue`)
- All API calls go through `services/api.js` — no component calls `fetch` directly
- Role-based routing in `App.jsx`: `technician` → FieldApp, `technician_lead` → LeadDashboard, `data_manager` → ManagerDashboard (exclusive, not hierarchical)

### API (`api/`)

- Stateless Node.js / Express — no session state, all auth via JWT
- File uploads are processed in the background after the HTTP response is sent (202 Accepted pattern) — the client polls or re-fetches file status
- All SQL lives in `api/src/db/queries.js` — routes call named query functions, never raw SQL inline

### Database

- Single PostgreSQL 16 instance holds all FDS state
- Keycloak has its own separate PostgreSQL instance (managed by Docker Compose)
- FDS schema is managed via numbered SQL migration files in `db/migrations/`

### Keycloak

- Identity provider only — authenticates users and issues JWTs
- FDS roles (`technician`, `technician_lead`, `data_manager`) are **not** stored in Keycloak; they live in the FDS `users` table
- The API validates the JWT signature on every request using Keycloak's JWKS endpoint, then looks up the user's role from the DB

---

## Auth flow

```
1. User opens PWA → keycloak-js redirects to Keycloak login page
2. User authenticates → Keycloak issues an access token (JWT)
3. PWA includes token as: Authorization: Bearer <token>
4. API middleware (auth.js):
   a. Verifies JWT signature against Keycloak JWKS
   b. Extracts auth_provider_id (JWT "sub" claim)
   c. Looks up user in FDS users table by auth_provider_id
   d. If user not found: auto-creates a record (role = null until assigned)
   e. Attaches user object (id, role, active) to req.user
5. Route handlers check req.user.role via requireRole() middleware
```

First-time users land on the app with no role — a data_manager must assign one via User Management before they can do anything.

---

## Role hierarchy

| Level | Role | Access |
|-------|------|--------|
| 1 | `technician` | Own visits only: create, edit, submit; upload files; enter readings |
| 2 | `technician_lead` | All technician access + view all visits, manage stations, manage users, see overdue panel |
| 3 | `data_manager` | Full access including compliance dashboard, reprocess rainfall, deactivate stations |

Role checks use `ROLE_HIERARCHY` in `api/src/middleware/auth.js` — a numeric comparison, so `technician_lead` implicitly passes any `requireRole('technician')` check.

---

## Data pipeline: file upload → rainfall

```
1. POST /api/visits/:id/files
   ├── multer buffers file in memory
   ├── SHA-256 hash computed → duplicate check
   ├── Format detected (extension + content sniffing)
   └── 202 Accepted returned to client

2. Background (same process, setImmediate):
   ├── Parser selected: hobo.js | hobo_binary.js | campbell_toa5.js |
   │                    solonist_xle.js | saeon_stom.js
   ├── Parser emits measurements via async generator (stream)
   ├── Measurements bulk-inserted into raw_measurements
   ├── uploaded_files.parse_status = 'parsed' (or 'error')
   └── If rainfall station:
       ├── processRainfall(stationId) — aggregates raw tips into rainfall table
       └── processGaps(stationId) — recomputes all data gaps for this station

3. Client polls or re-fetches visit detail to see updated file status
```

---

## Offline queue

The PWA can create visits, enter readings, and queue files while offline. IndexedDB stores draft visits and the queue of pending API calls. On reconnect, `useOfflineQueue` replays them in order. The server is the source of truth — drafts are reconciled on sync.
