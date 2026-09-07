#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! docker compose ps --status running 2>/dev/null | grep -q postgres; then
  docker compose up -d
  echo "Waiting for PostgreSQL..."
  sleep 3
fi

if [ ! -d backend/.venv ]; then
  python3.11 -m venv backend/.venv 2>/dev/null || python3 -m venv backend/.venv
  backend/.venv/bin/pip install -r backend/requirements.txt -q
fi

cd backend
source .venv/bin/activate
exec uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
