#!/usr/bin/env bash
# Seamo Live: deploy the current main branch on the production droplet. Run as root on the server.
#
#   ADMIN_PASSWORD=... ADMIN_TOKEN_SECRET=... bash scripts/deploy.sh
#
# The two variables are only needed the first time (they are written to backend/.env if missing).
# Idempotent: safe to run again for every later deploy.
set -euo pipefail
REPO=/root/seamo-speechtotext
cd "$REPO"

echo "== 1. keep the server's secrets out of git's way"
cp -n backend/.env /root/backend.env.bak 2>/dev/null || true
cp -n backend/seamo.json /root/seamo.json.bak 2>/dev/null || true
git rm --cached --quiet backend/.env 2>/dev/null || true
git rm --cached --quiet backend/seamo.json 2>/dev/null || true
[ -f package-lock.json ] && mv -f package-lock.json /root/stray-root-package-lock.json || true

echo "== 2. pull the new code"
git fetch -q origin
git checkout -q -- . 2>/dev/null || true
git pull -q --ff-only origin main
git log --oneline -1
test -f backend/.env || cp /root/backend.env.bak backend/.env
test -f backend/seamo.json || cp /root/seamo.json.bak backend/seamo.json

echo "== 3. backend dependencies"
cd backend
npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -1

echo "== 4. backend env additions (only if missing)"
sed -i -e '$a\' .env
grep -q '^HOST=' .env || echo 'HOST=127.0.0.1' >> .env
grep -q '^ADMIN_EMAIL=' .env || echo 'ADMIN_EMAIL=admin@seamo.com' >> .env
if ! grep -q '^ADMIN_PASSWORD=' .env; then
  [ -n "${ADMIN_PASSWORD:-}" ] || { echo "ADMIN_PASSWORD is not in backend/.env; pass it as an environment variable"; exit 1; }
  echo "ADMIN_PASSWORD=${ADMIN_PASSWORD}" >> .env
fi
if ! grep -q '^ADMIN_TOKEN_SECRET=' .env; then
  [ -n "${ADMIN_TOKEN_SECRET:-}" ] || { echo "ADMIN_TOKEN_SECRET is not in backend/.env; pass it as an environment variable"; exit 1; }
  echo "ADMIN_TOKEN_SECRET=${ADMIN_TOKEN_SECRET}" >> .env
fi
grep -q '^ADMIN_TOKEN_TTL_HOURS=' .env || echo 'ADMIN_TOKEN_TTL_HOURS=24' >> .env
grep -q '^PAUSE_FROM_DISPLAY=' .env || echo 'PAUSE_FROM_DISPLAY=true' >> .env
chmod 600 .env seamo.json
node --check server.js

echo "== 5. frontend build (production URL comes from frontend/.env.production)"
cd ../frontend
npm ci --no-audit --no-fund 2>&1 | tail -1
NODE_OPTIONS=--max-old-space-size=768 npx vite build 2>&1 | tail -3
grep -q "translate.skybotai.com" dist/assets/*.js && echo "bundle targets translate.skybotai.com"

echo "== 6. publish the frontend"
rm -rf /var/www/html.bak
cp -r /var/www/html /var/www/html.bak
rm -rf /var/www/html/*
cp -r dist/* /var/www/html/

echo "== 7. nginx: enough connections for a thousand listeners"
if ! grep -q '^worker_rlimit_nofile' /etc/nginx/nginx.conf; then
  sed -i '0,/^worker_processes/s//worker_rlimit_nofile 65536;\nworker_processes/' /etc/nginx/nginx.conf
fi
sed -i -E 's/^(\s*)worker_connections\s+[0-9]+;/\1worker_connections 8192;/' /etc/nginx/nginx.conf
grep -q 'multi_accept' /etc/nginx/nginx.conf || sed -i -E 's/^(\s*)worker_connections 8192;/\1worker_connections 8192;\n\1multi_accept on;/' /etc/nginx/nginx.conf
nginx -t 2>&1 | tail -1
systemctl reload nginx

echo "== 8. restart the backend"
pm2 restart server --update-env --silent
sleep 4
pm2 list | grep -E "server" | cut -c1-110
echo "health: $(curl -s --max-time 10 http://127.0.0.1:5000/api/health)"
echo "listening: $(ss -ltnp | grep ':5000' | awk '{print $4}')"
echo "== done"
