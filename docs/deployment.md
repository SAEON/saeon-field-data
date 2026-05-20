# Production Deployment

---

## Prerequisites

| Component | Version | Notes |
|-----------|---------|-------|
| Node.js | 20 LTS | For the API |
| PostgreSQL | 16 | Main FDS database |
| Keycloak | 24.0 | Identity provider (runs in Docker) |
| Docker + Docker Compose | any recent | For Keycloak |
| nginx | any recent | Reverse proxy / static file serving |

---

## Environment variables

Copy `.env.example` to `.env` on the server. Never commit `.env`.

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `DB_HOST` | Yes | `localhost` | PostgreSQL host |
| `DB_PORT` | Yes | `5432` | PostgreSQL port |
| `DB_NAME` | Yes | `fds` | Database name |
| `DB_USER` | Yes | `fds_user` | Database user |
| `DB_PASSWORD` | Yes | — | Database password |
| `PORT` | Yes | `3000` | API listen port |
| `NODE_ENV` | Yes | `production` | Set to `production` |
| `FILE_STORAGE_PATH` | Yes | `/var/saeon-data/raw_files` | Absolute path for uploaded logger files — must exist and be writable |
| `APP_URL` | Yes | `https://fielddata.saeon.ac.za` | Public URL of the app — used for OAuth redirects |
| `JWT_SECRET` | Yes | 48-byte hex string | Signs session tokens — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | Yes | `8h` | Session token lifetime |
| `KEYCLOAK_URL` | Yes* | `https://fielddata.saeon.ac.za/authcloack` | Keycloak base URL |
| `KEYCLOAK_REALM` | Yes* | `fds` | Keycloak realm name |
| `KEYCLOAK_CLIENT_ID` | Yes* | `fds-app` | Keycloak client ID |
| `MICROSOFT_TENANT_ID` | Yes* | — | Azure AD tenant (alternative to Keycloak) |
| `MICROSOFT_CLIENT_ID` | Yes* | — | Azure AD app client ID |
| `MICROSOFT_CLIENT_SECRET` | Yes* | — | Azure AD client secret |

*Either the Keycloak set or the Microsoft set must be filled in. Not both.

---

## Database setup

```bash
# 1. Create the database
psql -U postgres -f db/migrations/000_create_db.sql

# 2. Run migrations in order
for f in db/migrations/00{1..9}_*.sql db/migrations/0[1-9][0-9]_*.sql; do
  echo "Running $f"
  psql -U postgres -d fds -f "$f"
done
```

---

## API

### Install dependencies

```bash
cd api
npm ci --omit=dev
```

### Run with systemd

Create `/etc/systemd/system/fds-api.service`:

```ini
[Unit]
Description=SAEON Field Data System API
After=network.target postgresql.service

[Service]
Type=simple
User=saeon
WorkingDirectory=/opt/saeon-field-data/api
EnvironmentFile=/opt/saeon-field-data/.env
ExecStart=/usr/bin/node src/app.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable fds-api
systemctl start fds-api
systemctl status fds-api
```

---

## PWA

```bash
cd pwa
npm ci
VITE_API_URL=https://fielddata.saeon.ac.za npm run build
# Output is in pwa/dist/
```

Serve the `pwa/dist/` directory as static files from nginx (see below).

---

## Keycloak setup

### Start Keycloak

Create `authcloack/.env`:

```env
KC_DB_PASSWORD=strong_password_here
KC_ADMIN_USER=admin
KC_ADMIN_PASSWORD=strong_admin_password_here
KEYCLOAK_URL=https://fielddata.saeon.ac.za/authcloack
```

```bash
cd authcloack
docker compose up -d
```

### Configure the realm

1. Open `https://fielddata.saeon.ac.za/authcloack/admin` and log in
2. Create a new realm — name it `fds`
3. Create a client:
   - Client ID: `fds-app`
   - Client authentication: OFF (public client)
   - Valid redirect URIs: `https://fielddata.saeon.ac.za/*`
   - Web origins: `https://fielddata.saeon.ac.za`
4. Create user accounts for the team (Users → Add user)
5. Set the API env vars: `KEYCLOAK_URL`, `KEYCLOAK_REALM=fds`, `KEYCLOAK_CLIENT_ID=fds-app`

> FDS roles (`technician`, `technician_lead`, `data_manager`) are stored in the FDS database, not in Keycloak. After a user logs in for the first time, a `data_manager` assigns their role in the User Management screen.

---

## nginx config

```nginx
server {
    listen 443 ssl;
    server_name fielddata.saeon.ac.za;

    # SSL — use certbot or your cert provider
    ssl_certificate     /etc/letsencrypt/live/fielddata.saeon.ac.za/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fielddata.saeon.ac.za/privkey.pem;

    # PWA static files
    root /opt/saeon-field-data/pwa/dist;
    index index.html;

    # API
    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        # Allow large file uploads
        client_max_body_size 50M;
    }

    # Keycloak
    location /authcloack/ {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # SPA fallback — all unmatched routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name fielddata.saeon.ac.za;
    return 301 https://$host$request_uri;
}
```

---

## File storage

Create the file storage directory and set ownership:

```bash
mkdir -p /var/saeon-data/raw_files
chown saeon:saeon /var/saeon-data/raw_files
```

This path must match `FILE_STORAGE_PATH` in `.env`.

---

## First-run checklist

- [ ] Database created and all migrations applied
- [ ] API starts without errors (`systemctl status fds-api`)
- [ ] Keycloak realm `fds` exists with client `fds-app` configured
- [ ] nginx serving PWA at root, proxying `/api` and `/authcloack`
- [ ] Open app in browser — redirected to Keycloak login
- [ ] Log in with a Keycloak user → lands on app with "No role assigned" message
- [ ] In database: `UPDATE users SET role = 'data_manager' WHERE email = 'your@email.com';`
- [ ] Refresh app — full access visible
- [ ] Use User Management to assign roles to other users
- [ ] Upload a test logger file to a station — confirm it parses and rainfall appears
