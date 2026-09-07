#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! docker compose ps --status running 2>/dev/null | grep -q postgres; then
  docker compose up -d
  echo "Waiting for PostgreSQL..."
  sleep 3
fi

if [ ! -d .venv ]; then
  python3.11 -m venv .venv 2>/dev/null || python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt -q
fi

source .venv/bin/activate
exec uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
