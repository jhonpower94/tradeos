#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Load VPS_* from .env.production when present (do not export secrets broadly).
if [[ -f "$ROOT/.env.production" ]]; then
  # shellcheck disable=SC1091
  set -a
  # Only pull the VPS connection vars; keep secrets out of the environment dump.
  VPS_HOST="$(grep -E '^VPS_HOST=' "$ROOT/.env.production" | head -1 | cut -d= -f2-)"
  VPS_USER="$(grep -E '^VPS_USER=' "$ROOT/.env.production" | head -1 | cut -d= -f2-)"
  VPS_PASSWORD="$(grep -E '^VPS_PASSWORD=' "$ROOT/.env.production" | head -1 | cut -d= -f2-)"
  set +a
fi

VPS_HOST="${VPS_HOST:-}"
VPS_USER="${VPS_USER:-root}"
VPS_PASSWORD="${VPS_PASSWORD:-}"
REMOTE_DIR="${VPS_REMOTE_DIR:-/opt/tradeos}"

is_on_vps() {
  [[ -z "$VPS_HOST" ]] && return 0
  local ips
  ips="$(hostname -I 2>/dev/null || true)"
  [[ "$ips" == *"$VPS_HOST"* ]] && return 0
  # macOS / no hostname -I
  local my
  my="$(ipconfig getifaddr en0 2>/dev/null || true)"
  [[ -n "$my" && "$my" == "$VPS_HOST" ]] && return 0
  return 1
}

deploy_local() {
  git fetch origin
  git checkout main
  git pull --ff-only origin main

  echo "Deploying commit: $(git rev-parse --short HEAD)"
  docker compose -f docker-compose.prod.yml up -d --build

  docker compose -f docker-compose.prod.yml ps
  echo "Health:"
  curl -fsS "https://aitradebot.pro/api/v1/health" || curl -fsS "http://127.0.0.1/api/v1/health" || true
}

if [[ -n "$VPS_HOST" ]] && ! is_on_vps; then
  if [[ -z "$VPS_PASSWORD" ]]; then
    echo "VPS_HOST=$VPS_HOST is set but VPS_PASSWORD is missing in .env.production" >&2
    exit 1
  fi
  if ! command -v sshpass >/dev/null 2>&1; then
    echo "sshpass is required to deploy to VPS_HOST=$VPS_HOST from this machine" >&2
    exit 1
  fi
  echo "Deploying on remote VPS $VPS_USER@$VPS_HOST:$REMOTE_DIR (not this machine)"
  export SSHPASS="$VPS_PASSWORD"
  sshpass -e ssh -o StrictHostKeyChecking=accept-new \
    -o PreferredAuthentications=password \
    -o PubkeyAuthentication=no \
    "$VPS_USER@$VPS_HOST" \
    "cd '$REMOTE_DIR' && bash scripts/deploy-prod.sh"
  echo "Remote health:"
  curl -fsS "https://aitradebot.pro/api/v1/health" || true
  JS="$(curl -fsS https://aitradebot.pro/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1 || true)"
  echo "Live bundle: ${JS:-unknown}"
  exit 0
fi

deploy_local
