#!/usr/bin/env bash
set -euo pipefail

# Bootstrap a small Ubuntu Tencent Lighthouse box for:
# - SIAGA production Node service behind Nginx
# - Optional Hermes Agent under a separate Linux user
#
# Run as root:
#   sudo SIAGA_REPO_URL="git@github.com:hjeruk1/siaga.git" SIAGA_DOMAIN="example.com" bash scripts/tencent-lighthouse-bootstrap.sh
#
# Optional:
#   INIT_DB=1 ADMIN_PASSWORD="change-this" bash scripts/tencent-lighthouse-bootstrap.sh
#   INSTALL_HERMES=1 bash scripts/tencent-lighthouse-bootstrap.sh

SIAGA_REPO_URL="${SIAGA_REPO_URL:-}"
SIAGA_DOMAIN="${SIAGA_DOMAIN:-_}"
SIAGA_PORT="${SIAGA_PORT:-3999}"
SIAGA_USER="${SIAGA_USER:-siaga}"
HERMES_USER="${HERMES_USER:-hermes}"
APP_DIR="${APP_DIR:-/opt/siaga/app}"
ENV_DIR="${ENV_DIR:-/etc/siaga}"
INIT_DB="${INIT_DB:-0}"
INSTALL_HERMES="${INSTALL_HERMES:-0}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
HERMES_INSTALLER_URL="${HERMES_INSTALLER_URL:-https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root with sudo."
  exit 1
fi

if [[ -z "${SIAGA_REPO_URL}" ]]; then
  echo "SIAGA_REPO_URL is required, for example:"
  echo "  sudo SIAGA_REPO_URL='git@github.com:hjeruk1/siaga.git' bash $0"
  exit 1
fi

if [[ "${INIT_DB}" == "1" && -z "${ADMIN_PASSWORD}" ]]; then
  echo "ADMIN_PASSWORD is required when INIT_DB=1."
  exit 1
fi

echo "==> Base packages"
apt-get update
apt-get install -y ca-certificates curl git nginx ufw build-essential python3 python3-pip python3-venv sqlite3

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 20 ]]; then
  echo "==> Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> Swap"
if [[ ! -f /swapfile ]]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

echo "==> Users"
id -u "${SIAGA_USER}" >/dev/null 2>&1 || adduser --system --group --home /opt/siaga "${SIAGA_USER}"
if [[ "${INSTALL_HERMES}" == "1" ]]; then
  id -u "${HERMES_USER}" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "${HERMES_USER}"
fi

echo "==> SIAGA checkout"
mkdir -p "$(dirname "${APP_DIR}")" "${ENV_DIR}" /var/log/siaga
chown -R "${SIAGA_USER}:${SIAGA_USER}" "$(dirname "${APP_DIR}")" /var/log/siaga

if [[ ! -d "${APP_DIR}/.git" ]]; then
  sudo -u "${SIAGA_USER}" git clone "${SIAGA_REPO_URL}" "${APP_DIR}"
else
  sudo -u "${SIAGA_USER}" git -C "${APP_DIR}" pull --ff-only
fi

echo "==> SIAGA dependencies and build"
sudo -u "${SIAGA_USER}" npm ci --prefix "${APP_DIR}"
sudo -u "${SIAGA_USER}" npm ci --prefix "${APP_DIR}/backend"
sudo -u "${SIAGA_USER}" npm ci --prefix "${APP_DIR}/frontend"
sudo -u "${SIAGA_USER}" npm run build --prefix "${APP_DIR}"

if [[ ! -f "${ENV_DIR}/siaga.env" ]]; then
  cat > "${ENV_DIR}/siaga.env" <<EOF
NODE_ENV=production
PORT=${SIAGA_PORT}
FRONTEND_URL=http://${SIAGA_DOMAIN}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF
  chmod 600 "${ENV_DIR}/siaga.env"
fi

if [[ "${INIT_DB}" == "1" ]]; then
  echo "==> Initializing SIAGA database"
  sudo -u "${SIAGA_USER}" env $(grep -v '^#' "${ENV_DIR}/siaga.env" | xargs) npm run init --prefix "${APP_DIR}"
fi

echo "==> SIAGA systemd service"
cat > /etc/systemd/system/siaga.service <<EOF
[Unit]
Description=SIAGA web application
After=network.target

[Service]
Type=simple
User=${SIAGA_USER}
Group=${SIAGA_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_DIR}/siaga.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
MemoryMax=900M

[Install]
WantedBy=multi-user.target
EOF

echo "==> Nginx reverse proxy"
cat > /etc/nginx/sites-available/siaga <<EOF
server {
    listen 80;
    server_name ${SIAGA_DOMAIN};

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:${SIAGA_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/siaga /etc/nginx/sites-enabled/siaga
rm -f /etc/nginx/sites-enabled/default
nginx -t

if [[ "${INSTALL_HERMES}" == "1" ]]; then
  echo "==> Hermes Agent install"
  sudo -u "${HERMES_USER}" bash -lc "curl -fsSL '${HERMES_INSTALLER_URL}' | bash -s -- --skip-setup"

  cat > /etc/systemd/system/hermes-gateway.service <<EOF
[Unit]
Description=Hermes Agent Gateway
After=network.target

[Service]
Type=simple
User=${HERMES_USER}
WorkingDirectory=/home/${HERMES_USER}
Environment=HOME=/home/${HERMES_USER}
ExecStart=/bin/bash -lc 'hermes gateway start --host 127.0.0.1'
Restart=on-failure
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true
MemoryMax=700M

[Install]
WantedBy=multi-user.target
EOF
fi

echo "==> Firewall and services"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl daemon-reload
systemctl enable --now siaga
systemctl restart nginx

echo
echo "Done."
echo "SIAGA: http://${SIAGA_DOMAIN}"
if [[ "${INSTALL_HERMES}" == "1" ]]; then
  echo
  echo "Next Hermes steps:"
  echo "  sudo -iu ${HERMES_USER}"
  echo "  hermes setup"
  echo "  hermes model"
  echo "  hermes doctor"
  echo
  echo "Start Hermes gateway only after setup:"
  echo "  sudo systemctl enable --now hermes-gateway"
fi
