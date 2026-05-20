# SAEON Field Data System (FDS)

---

## Overview

FDS is a progressive web application for managing field visits to rain gauge stations across SAEON's Jonkershoek monitoring network. Technicians use it in the field (offline-capable) to record manual sensor readings, upload HOBO and other logger files, and track station maintenance. Technician leads and data managers use it to monitor visit compliance, review and reprocess rainfall data, and manage the station and user registry.

Key capabilities:
- Offline-first PWA — visits and readings queued locally, synced on reconnect
- Multi-format logger file ingestion (HOBO CSV/binary, Campbell TOA5, Solonist XLE, SAEON STOM)
- Automated rainfall aggregation (5 min → hourly → daily → monthly → yearly) with QA flagging
- Data gap detection between logger deployments
- Role-based access: technician / technician_lead / data_manager

---

## System Architecture

Production runs across two servers:

| Server | Hosts |
|--------|-------|
| **App server** | Node.js API · React PWA (nginx) · Keycloak (Docker) |
| **Database server** | PostgreSQL 16 (FDS data) |

Four runtime components:

```
Browser (PWA)
    │  HTTPS /api/*
    ▼
Node.js / Express API  ──────►  PostgreSQL 16
    │  JWT validation
    ▼
Keycloak 24 (identity provider)
```

- **PWA** — React + Vite SPA served as static files. All API calls go through `services/api.js`. IndexedDB provides offline queuing.
- **API** — Stateless Express server. Parses logger files in the background after responding 202. All SQL in `api/src/db/queries.js`.
- **PostgreSQL** — Single source of truth for all FDS state (visits, measurements, rainfall, users).
- **Keycloak** — Issues JWTs only. FDS roles are stored in the FDS database, not in Keycloak.

See [docs/architecture.md](docs/architecture.md) for the full data pipeline and auth flow.

---

## Repository Structure

```
saeon-field-data/
├── api/                  Node.js / Express REST API
│   └── src/
│       ├── routes/       HTTP endpoint handlers
│       ├── middleware/   Auth (JWT), error handling, logging
│       ├── parsers/      Logger file parsers (HOBO, Campbell, Solonist, STOM)
│       ├── processors/   Rainfall aggregation, gap detection
│       └── db/           PostgreSQL connection pool + all SQL queries
├── pwa/                  React + Vite progressive web app
│   └── src/
│       ├── pages/        Role-based screens
│       ├── components/   Shared UI components
│       ├── auth/         Keycloak integration (keycloak-js)
│       ├── hooks/        Offline queue, IndexedDB, station state
│       └── services/     api.js — all fetch calls
├── db/
│   └── migrations/       SQL migration files — run in numeric order (000–00N)
├── authcloack/           Keycloak 24 + its own PostgreSQL via Docker Compose
├── docs/                 Technical documentation
├── samples/              Sample logger files for testing uploads
└── .env.example          Environment variable template
```

---

## Prerequisites

| Dependency | Version | Purpose |
|------------|---------|---------|
| Node.js | 20 LTS | API and PWA build |
| PostgreSQL | 16 | FDS database |
| Docker + Docker Compose | any recent | Runs Keycloak |
| nginx | any recent | Production reverse proxy (not needed for local dev) |

---

## Quick Start (local development)

### 1. Clone and configure

```bash
git clone https://github.com/SAEON/saeon-field-data.git
cd saeon-field-data
cp .env.example .env
# Edit .env — set DB credentials, Keycloak URL/realm/client, JWT secret
```

### 2. Start Keycloak

```bash
# Create authcloack/.env with:
#   KC_DB_PASSWORD=...
#   KC_ADMIN_USER=admin
#   KC_ADMIN_PASSWORD=...
cd authcloack
docker compose up -d
cd ..
```

Keycloak admin console: `http://localhost:8080/authcloack/admin`

### 3. Set up the database

```bash
psql -U postgres -f db/migrations/000_create_db.sql

for f in db/migrations/00{1..9}_*.sql; do
  psql -U postgres -d fds -f "$f"
done
```

### 4. Start the API

```bash
cd api && npm install && npm run dev
# Listening on http://localhost:3000
```

### 5. Start the PWA

```bash
cd pwa && npm install && npm run dev
# Listening on http://localhost:5173
# /api and /authcloack are proxied to localhost — see pwa/vite.config.js
```

---

## Authentication

FDS uses **Keycloak** as its identity provider.

- The PWA uses `keycloak-js` to redirect users to Keycloak for login and receive a JWT access token
- The JWT is sent as `Authorization: Bearer <token>` on every API request
- The API validates the JWT signature against Keycloak's JWKS endpoint, then resolves the user's FDS role from the database
- **Roles are stored in the FDS `users` table** — not in Keycloak. Keycloak only handles identity.

Role hierarchy:

| Role | Level | Access summary |
|------|-------|----------------|
| `technician` | 1 | Own visits, readings, file uploads |
| `technician_lead` | 2 | All technician access + oversight, station registry, user management |
| `data_manager` | 3 | Full access including rainfall reprocessing and compliance dashboard |

New users land on the app after first login with no role assigned. A `data_manager` or `technician_lead` must assign their role via User Management before they can act.

See [docs/deployment.md](docs/deployment.md) for Keycloak realm and client setup instructions.

---

## Documentation

| Document | Audience | Description |
|----------|----------|-------------|
| [docs/architecture.md](docs/architecture.md) | Developers | System design, data pipeline, auth flow |
| [docs/deployment.md](docs/deployment.md) | Ops | Production deployment guide |

| [docs/data-formats.md](docs/data-formats.md) | Developers / Field leads | Logger file formats and parser behaviour |
| [docs/user-guide.md](docs/user-guide.md) | All users | How to use the app by role |
