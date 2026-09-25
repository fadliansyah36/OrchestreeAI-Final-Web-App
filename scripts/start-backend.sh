#!/usr/bin/env bash
set -e

# If backend is already running on port 8001 and responding, keep alive
if curl -s http://127.0.0.1:8001/health/live >/dev/null 2>&1; then
  echo "Backend already running and healthy on port 8001."
  while curl -s http://127.0.0.1:8001/health/live >/dev/null 2>&1; do
    sleep 3
  done
  echo "Backend stopped responding, attempting restart..."
fi

# Ensure port 8001 is clean before starting
pkill -f "uvicorn.*8001" 2>/dev/null || true
sleep 1

# Export environment variables from .env or apps/backend/.env
if [ -f ".env" ]; then
  set -a
  source .env
  set +a
fi
if [ -f "apps/backend/.env" ]; then
  set -a
  source apps/backend/.env
  set +a
fi

# If .venv/bin/uvicorn exists, use it
if [ -f ".venv/bin/uvicorn" ]; then
  export PYTHONPATH=apps/backend
  exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
fi

# If python3 -m uvicorn is available directly
if python3 -m uvicorn --version >/dev/null 2>&1; then
  export PYTHONPATH=apps/backend
  exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
fi

# Fallback: install uv and build venv
if ! command -v uv >/dev/null 2>&1 && [ -f "/root/.local/bin/uv" ]; then
  export PATH="/root/.local/bin:$PATH"
fi

if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="/root/.local/bin:$PATH"
fi

uv venv .venv
uv pip install -r apps/backend/requirements.txt

export PYTHONPATH=apps/backend
exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001
