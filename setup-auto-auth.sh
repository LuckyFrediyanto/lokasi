#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

read -r -s -p "1/2 Tempel API Token Cloudflare lalu Enter: " CF_T
echo
CF_T="$(printf '%s' "$CF_T" | tr -d '[:space:]')"
if [ -n "$CF_T" ]; then
  umask 077
  printf 'CLOUDFLARE_API_TOKEN=%s\n' "$CF_T" > "$ROOT/server/.env.deploy"
  chmod 600 "$ROOT/server/.env.deploy"
  echo "OK: Token Cloudflare tersimpan aman di server/.env.deploy (0600, di-gitignore)."
fi

read -r -s -p "2/2 Tempel GitHub Token (ghp_...) lalu Enter: " GH_T
echo
GH_T="$(printf '%s' "$GH_T" | tr -d '[:space:]')"
if [ -n "$GH_T" ]; then
  umask 077
  printf 'https://LuckyFrediyanto:%s@github.com\n' "$GH_T" > "$ROOT/.git/credentials"
  chmod 600 "$ROOT/.git/credentials"
  git config credential.helper "store --file=$ROOT/.git/credentials"
  echo "OK: Token GitHub tersimpan aman di .git/credentials (0600, lokal repo ini saja)."
fi

echo "Selesai! Selanjutnya deploy server & git push otomatis tanpa ketik token lagi."
