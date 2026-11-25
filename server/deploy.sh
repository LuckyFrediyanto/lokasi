#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -f ".env.deploy" ]; then
  echo "File server/.env.deploy belum ada. Jalankan dulu: bash ../setup-auto-auth.sh"
  exit 1
fi
set -a
source .env.deploy
set +a
rm -rf node_modules/.cache/wrangler
exec corepack pnpm@9.15.4 exec wrangler deploy
