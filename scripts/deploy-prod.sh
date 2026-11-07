#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

git fetch origin
git checkout main
git pull --ff-only origin main

echo "Deploying commit: $(git rev-parse --short HEAD)"
docker compose -f docker-compose.prod.yml up -d --build

docker compose -f docker-compose.prod.yml ps
echo "Health:"
curl -fsS "https://aitradebot.pro/api/v1/health" || curl -fsS "http://127.0.0.1/api/v1/health" || true
