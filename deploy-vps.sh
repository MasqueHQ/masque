#!/usr/bin/env bash
# MASQUE site + terminal → VPS. Run from Git Bash once the domain's A record points at 202.10.42.20:
#   bash deploy-vps.sh --domain masque.example.xyz
# serve.mjs serves site/ and the read-only /rpc proxy (Indonesian ISPs block the official RPC), so this is a
# small Node service behind nginx, not a plain static site. Wallet keys never touch the server.
set -euo pipefail
HOST="${HOST:-root@202.10.42.20}"
ROOT="D:/Claude/launches/2026-11-07-masq"
DOMAIN=""; [ "${1:-}" = "--domain" ] && DOMAIN="${2:?domain required}"
[ -n "$DOMAIN" ] || { echo "usage: bash deploy-vps.sh --domain masque.example.xyz"; exit 1; }
SSH="ssh -o ConnectTimeout=20 -o BatchMode=yes $HOST"
STAMP=$(date +%Y%m%d-%H%M%S)

echo "→ release $STAMP"
( cd "$ROOT" && tar --exclude='*.pre-qa.html' --exclude='shot*' --exclude='*.py' --exclude='site/brand/options' -czf - serve.mjs site ) | $SSH "set -e
  id masque >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin masque
  mkdir -p /opt/masque/releases/$STAMP && tar -xzf - -C /opt/masque/releases/$STAMP
  ln -sfn /opt/masque/releases/$STAMP /opt/masque/current && chmod -R a+rX /opt/masque
  ls -1dt /opt/masque/releases/* | tail -n +4 | xargs -r rm -rf"

$SSH "cat > /etc/systemd/system/masque.service" <<'UNIT'
[Unit]
Description=MASQUE (site + read-only RPC proxy) on 127.0.0.1:4850
After=network.target
[Service]
User=masque
Environment=PORT=4850
ExecStart=/usr/local/bin/node /opt/masque/current/serve.mjs
Restart=always
MemoryMax=96M
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
UNIT
$SSH "systemctl daemon-reload && systemctl enable masque >/dev/null 2>&1 && systemctl restart masque"

$SSH "cat > /etc/nginx/sites-available/masque" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;
    client_max_body_size 300k;
    gzip on;
    gzip_types text/css application/javascript text/javascript application/json image/svg+xml;
    location / {
        proxy_pass http://127.0.0.1:4850;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_read_timeout 60s;
    }
}
EOF
$SSH "set -e; ln -sfn /etc/nginx/sites-available/masque /etc/nginx/sites-enabled/masque; nginx -t 2>&1 | tail -1; systemctl reload nginx"
$SSH "certbot --nginx -n --agree-tos --register-unsafely-without-email --keep-until-expiring --redirect -d '$DOMAIN' && systemctl reload nginx" \
  || echo "!! certbot failed: check that $DOMAIN points to 202.10.42.20, then rerun"

URL="https://$DOMAIN"
echo "→ checks"
$SSH "systemctl is-active masque; journalctl -u masque -n 2 --no-pager | tail -2"
curl -s -o /dev/null -w "  site      %{http_code}\n" "$URL/" || true
curl -s -o /dev/null -w "  app       %{http_code}\n" "$URL/app.html" || true
curl -s -w "  rpc       %{http_code} " -X POST "$URL/rpc" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' || true; echo
echo "✓ live: $URL   terminal: $URL/app.html"
