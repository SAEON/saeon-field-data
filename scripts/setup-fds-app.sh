#!/usr/bin/env bash
# setup-fds-app.sh
# Sets up the FDS application on a fresh Ubuntu 24.04 server.
# Run as root. Prerequisites: setup-postgres.sh must have run first.

set -euo pipefail

REPO_URL="https://github.com/SAEON/saeon-field-data.git"
INSTALL_DIR="/opt/saeon-field-data"
FILE_STORAGE="/var/saeon-data/raw_files"
APP_USER="saeon"

KEYCLOAK_URL="https://fds.saeon.ac.za"
KEYCLOAK_REALM="saeon-internal"
KEYCLOAK_CLIENT_ID="fds"
APP_URL="https://fds.saeon.ac.za"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || error "Run this script as root: sudo bash $0"

# ── Collect secrets up-front ──────────────────────────────────────────────────
echo ""
echo "You will need the DB password printed at the end of setup-postgres.sh."
echo ""
read -rsp "  DB password for user 'fds': " DB_PASSWORD; echo
[[ -n "$DB_PASSWORD" ]] || error "DB password is required."

read -rsp "  Keycloak admin password (KC_ADMIN_PASSWORD on auth server): " KC_ADMIN_PASSWORD; echo
[[ -n "$KC_ADMIN_PASSWORD" ]] || error "Keycloak admin password is required."

# ── 1. Install Node.js 20 LTS ─────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -e 'process.stdout.write(process.version.split(".")[0].replace("v",""))')" -lt 20 ]]; then
  info "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null
  apt-get install -y nodejs > /dev/null
else
  info "Node.js $(node --version) already installed."
fi

# ── 2. Install Git ────────────────────────────────────────────────────────────
info "Installing git..."
apt-get install -y git > /dev/null

# ── 3. Create system user ─────────────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
  info "Creating system user '${APP_USER}'..."
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

# ── 4. Clone repo ─────────────────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Repo already exists — pulling latest..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning repo → ${INSTALL_DIR}..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

# ── 5. File storage directory ─────────────────────────────────────────────────
info "Creating file storage directory..."
mkdir -p "$FILE_STORAGE"
chown -R "$APP_USER:$APP_USER" "$(dirname "$FILE_STORAGE")"

# ── 6. Install API dependencies ───────────────────────────────────────────────
info "Installing API dependencies..."
npm ci --omit=dev --prefix "$INSTALL_DIR/api" > /dev/null

# ── 7. Build PWA ──────────────────────────────────────────────────────────────
info "Installing PWA dependencies..."
npm ci --prefix "$INSTALL_DIR/pwa" > /dev/null

info "Building PWA..."
VITE_KEYCLOAK_URL="$KEYCLOAK_URL" \
VITE_KEYCLOAK_REALM="$KEYCLOAK_REALM" \
VITE_KEYCLOAK_CLIENT_ID="$KEYCLOAK_CLIENT_ID" \
  npm run build --prefix "$INSTALL_DIR/pwa"

# ── 8. Write .env at repo root (where index.js and pool.js expect it) ─────────
JWT_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))")

info "Writing ${INSTALL_DIR}/.env..."
cat > "$INSTALL_DIR/.env" <<ENV
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fds
DB_USER=fds
DB_PASSWORD=${DB_PASSWORD}
PORT=3000
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=4096
FILE_STORAGE_PATH=${FILE_STORAGE}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=8h
APP_URL=${APP_URL}
KEYCLOAK_URL=${KEYCLOAK_URL}
KEYCLOAK_REALM=${KEYCLOAK_REALM}
KEYCLOAK_CLIENT_ID=${KEYCLOAK_CLIENT_ID}
KC_ADMIN_USER=admin
KC_ADMIN_PASSWORD=${KC_ADMIN_PASSWORD}
ENV

chmod 600 "$INSTALL_DIR/.env"
chown "$APP_USER:$APP_USER" "$INSTALL_DIR/.env"

# ── 9. Install PM2 and start API ─────────────────────────────────────────────
info "Installing PM2..."
npm install -g pm2 > /dev/null

info "Starting API with PM2 as '${APP_USER}'..."
sudo -u "$APP_USER" pm2 delete fds-api 2>/dev/null || true
sudo -u "$APP_USER" pm2 start "$INSTALL_DIR/api/src/index.js" \
  --name fds-api \
  --cwd "$INSTALL_DIR/api"
sudo -u "$APP_USER" pm2 save

# ── 10. Configure PM2 startup ────────────────────────────────────────────────
info "Configuring PM2 to start on boot..."
env PATH="$PATH:/usr/bin" \
  pm2 startup systemd -u "$APP_USER" --hp "/home/${APP_USER}" | tail -1 | bash || \
  warn "PM2 startup config failed — run 'pm2 startup' manually."

sleep 3

# ── 11. Health check ─────────────────────────────────────────────────────────
info "Health check..."
if curl -sf http://localhost:3000/health > /dev/null; then
  echo -e "  ${GREEN}✓ API is up${NC}"
else
  warn "API health check failed — check logs: sudo -u ${APP_USER} pm2 logs fds-api"
fi

if curl -sf http://localhost:3000/health/db > /dev/null; then
  echo -e "  ${GREEN}✓ Database connection OK${NC}"
else
  warn "DB health check failed — verify ${INSTALL_DIR}/.env"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  FDS app setup complete${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  API status  : sudo -u ${APP_USER} pm2 status"
echo "  API logs    : sudo -u ${APP_USER} pm2 logs fds-api"
echo "  Health      : curl http://localhost:3000/health"
echo "  PWA dist    : ${INSTALL_DIR}/pwa/dist"
echo "  .env        : ${INSTALL_DIR}/.env"
echo ""