#!/usr/bin/env bash
# setup-postgres.sh
# Installs the latest stable PostgreSQL via the official PGDG apt repo,
# creates the fds DB role + database, and runs all migrations.
# Run as root on Ubuntu 24.04 LTS.

set -euo pipefail

REPO_DIR="/opt/saeon-field-data"
MIGRATIONS_DIR="$REPO_DIR/db/migrations"

DB_NAME="fds"
DB_USER="fds"

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Must run as root ──────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || error "Run this script as root: sudo bash $0"

# ── 1. Add PGDG apt repo and install latest PostgreSQL ───────────────────────
if dpkg -l postgresql 2>/dev/null | grep -q '^ii'; then
  info "PostgreSQL already installed — skipping repo setup and install."
else
  info "Adding official PostgreSQL apt repository..."
  apt-get install -y curl ca-certificates gnupg lsb-release > /dev/null

  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --yes --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg

  DISTRO=$(lsb_release -cs)
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] \
https://apt.postgresql.org/pub/repos/apt ${DISTRO}-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list

  apt-get update -q
  info "Installing latest PostgreSQL (this may take a moment)..."
  apt-get install -y postgresql > /dev/null
fi

# Detect the installed major version (e.g. 18)
PG_VERSION=$(pg_lsclusters --no-header | awk '{print $1}' | head -1)
info "PostgreSQL ${PG_VERSION} installed."

# ── 1b. Install PostGIS if not present ───────────────────────────────────────
POSTGIS_PKG="postgresql-${PG_VERSION}-postgis-3"
if ! dpkg -l "$POSTGIS_PKG" 2>/dev/null | grep -q '^ii'; then
  info "Installing PostGIS (${POSTGIS_PKG})..."
  apt-get install -y "$POSTGIS_PKG" > /dev/null
else
  info "PostGIS already installed."
fi

# ── 2. Start PostgreSQL ───────────────────────────────────────────────────────
systemctl enable postgresql || true
systemctl start postgresql || true
sleep 2  # give the cluster a moment

# ── 3. Generate a random DB password ─────────────────────────────────────────
DB_PASSWORD=$(openssl rand -hex 16)

# ── 4. Create role and database ───────────────────────────────────────────────
info "Creating role '${DB_USER}'..."
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
    RAISE NOTICE 'Role ${DB_USER} created.';
  ELSE
    ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
    RAISE NOTICE 'Role ${DB_USER} already exists — password updated.';
  END IF;
END
\$\$;
SQL

# ── 5. Run migration 000 (creates the database) ───────────────────────────────
info "Running migration 000 (create database)..."
sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres < "$MIGRATIONS_DIR/000_create_db.sql"

# ── 6. Run migrations 001–006 against the fds database ───────────────────────
# 002_tables.sql is fully up-to-date (includes department, rainfall_status,
# gap_type). 007–010 exist only to patch pre-existing databases; they are
# no-ops on a fresh install and are skipped here.
FRESH_MIGRATIONS=(
  "001_extensions.sql"
  "002_tables.sql"
  "003_indices.sql"
  "004_seed.sql"
  "005_rainfall.sql"
  "006_instrument_history.sql"
)

info "Running migrations 001–006..."
for name in "${FRESH_MIGRATIONS[@]}"; do
  info "  → $name"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" < "$MIGRATIONS_DIR/$name"
done

# ── 7. Grant fds role access to all tables ───────────────────────────────────
info "Granting table permissions to '${DB_USER}'..."
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" <<SQL
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_USER};
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};
SQL

# ── 8. Ensure pg_hba allows local fds user connections ────────────────────────
HBA_CONF=$(sudo -u postgres psql -tAc "SHOW hba_file;")
if ! grep -q "^host.*${DB_NAME}.*${DB_USER}" "$HBA_CONF" 2>/dev/null; then
  info "Adding pg_hba.conf entry for ${DB_USER}..."
  echo "host    ${DB_NAME}    ${DB_USER}    127.0.0.1/32    scram-sha-256" >> "$HBA_CONF"
  echo "host    ${DB_NAME}    ${DB_USER}    ::1/128         scram-sha-256" >> "$HBA_CONF"
  systemctl reload postgresql || true
fi

# ── 8. Done — print credentials ───────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  PostgreSQL ${PG_VERSION} setup complete${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  DB_HOST=localhost"
echo "  DB_PORT=5432"
echo "  DB_NAME=${DB_NAME}"
echo "  DB_USER=${DB_USER}"
echo -e "  DB_PASSWORD=${YELLOW}${DB_PASSWORD}${NC}   ← save this, you'll need it for setup-fds-app.sh"
echo ""
echo "  Connection string:"
echo "  postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
echo ""
