#!/usr/bin/env bash
# setup-nginx.sh
# Installs nginx and writes the FDS site config.
# Assumes a Let's Encrypt cert already exists at the standard path.
# Pass --http-only to skip TLS (local/dev testing).
#
# Usage:
#   sudo bash setup-nginx.sh             # production — HTTPS with existing cert
#   sudo bash setup-nginx.sh --http-only # local testing — HTTP only

set -euo pipefail

DOMAIN="fds.saeon.ac.za"
PWA_DIST="/opt/saeon-field-data/pwa/dist"
API_PORT="3000"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
HTTP_ONLY=false

for arg in "$@"; do
  [[ "$arg" == "--http-only" ]] && HTTP_ONLY=true
done

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || error "Run this script as root: sudo bash $0"

if [[ "$HTTP_ONLY" == false ]] && [[ ! -f "${CERT_DIR}/fullchain.pem" ]]; then
  error "Certificate not found at ${CERT_DIR}. Run certbot first:\n  sudo certbot certonly --standalone -d ${DOMAIN}"
fi

# ── 1. Install nginx ──────────────────────────────────────────────────────────
info "Installing nginx..."
apt-get update -q
apt-get install -y nginx > /dev/null

# ── 2. Write site config ──────────────────────────────────────────────────────
SITE_CONF="/etc/nginx/sites-available/fds"
info "Writing nginx config → ${SITE_CONF}"

if [[ "$HTTP_ONLY" == true ]]; then
cat > "$SITE_CONF" <<NGINX
# FDS — HTTP only (testing)

server {
    listen 80;
    server_name ${DOMAIN};

    location /api/ {
        proxy_pass         http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        client_max_body_size 50M;
    }

    location /health {
        proxy_pass http://127.0.0.1:${API_PORT};
    }

    location /fds/ {
        alias ${PWA_DIST}/;
        try_files \$uri \$uri/ /fds/index.html;
    }

    location = / {
        return 301 /fds/;
    }
}
NGINX
else
cat > "$SITE_CONF" <<NGINX
# FDS — production HTTPS

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    # ── TLS ───────────────────────────────────────────────────────────────────
    ssl_certificate     ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    ssl_trusted_certificate ${CERT_DIR}/chain.pem;

    # Modern TLS — TLS 1.2+ only, strong ciphers
    ssl_protocols             TLSv1.2 TLSv1.3;
    ssl_ciphers               ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_cache         shared:SSL:10m;
    ssl_session_timeout       1d;
    ssl_session_tickets       off;
    ssl_stapling              on;
    ssl_stapling_verify       on;

    # ── Security headers ──────────────────────────────────────────────────────
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options           DENY                                            always;
    add_header X-Content-Type-Options    nosniff                                         always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin"               always;
    add_header Permissions-Policy        "geolocation=(), microphone=(), camera=()"      always;

    # ── Keycloak reverse proxy (browser never hits authcloak.saeon.ac.za directly)
    location ~ ^/(realms|resources|js|auth)/ {
        proxy_pass            https://192.168.117.185;
        proxy_ssl_server_name on;
        proxy_ssl_name        authcloak.saeon.ac.za;
        proxy_http_version    1.1;
        proxy_set_header      Host              authcloak.saeon.ac.za;
        proxy_set_header      X-Forwarded-Host  fds.saeon.ac.za;
        proxy_set_header      X-Forwarded-Proto https;
        proxy_set_header      X-Forwarded-Port  443;
        proxy_set_header      X-Real-IP         \$remote_addr;
        proxy_set_header      X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_buffer_size     16k;
        proxy_buffers         4 16k;
    }

    # ── API proxy ─────────────────────────────────────────────────────────────
    location /api/ {
        proxy_pass         http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        client_max_body_size 50M;
        proxy_read_timeout 60s;
    }

    location /health {
        proxy_pass http://127.0.0.1:${API_PORT};
    }

    # ── PWA static files ──────────────────────────────────────────────────────
    location /fds/ {
        alias ${PWA_DIST}/;
        try_files \$uri \$uri/ /fds/index.html;

        # Cache static assets aggressively; HTML never
        location ~* \.(js|css|woff2|png|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Redirect bare root → PWA
    location = / {
        return 301 /fds/;
    }

    # Block hidden files
    location ~ /\. {
        deny all;
    }
}
NGINX
fi

# ── 3. Enable site, disable default ──────────────────────────────────────────
ln -sf "$SITE_CONF" /etc/nginx/sites-enabled/fds
rm -f /etc/nginx/sites-enabled/default

info "Validating nginx config..."
nginx -t

systemctl enable nginx || true
systemctl reload nginx || systemctl start nginx

# ── 4. Done ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  nginx setup complete${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
if [[ "$HTTP_ONLY" == true ]]; then
  warn "HTTP-only mode — run without --http-only in production to enable HTTPS."
  echo "  http://${DOMAIN}/fds/   → PWA"
  echo "  http://${DOMAIN}/api/   → API"
  echo "  http://${DOMAIN}/health → Health check"
else
  echo "  https://${DOMAIN}/fds/   → PWA"
  echo "  https://${DOMAIN}/api/   → API"
  echo "  https://${DOMAIN}/health → Health check"
  echo ""
  echo "  Cert:       ${CERT_DIR}"
  echo "  Auto-renew: sudo certbot renew --dry-run"
fi
echo ""
