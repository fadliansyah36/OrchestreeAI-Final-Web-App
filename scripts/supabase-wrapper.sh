#!/usr/bin/env bash
set -e

REAL_BIN="/root/.npm/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-linux-x64/bin/supabase"
if [ ! -f "$REAL_BIN" ]; then
  REAL_BIN=$(find /root/.npm -path "*/cli-linux-*/bin/supabase" -type f 2>/dev/null | head -n 1)
fi

# Load DATABASE_URL from .env if not set
if [ -z "$DATABASE_URL" ]; then
  ENV_FILE=""
  if [ -f ".env" ]; then
    ENV_FILE=".env"
  elif [ -f "$(dirname "$0")/../../.env" ]; then
    ENV_FILE="$(dirname "$0")/../../.env"
  fi
  if [ -n "$ENV_FILE" ]; then
    DATABASE_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" | head -n 1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  fi
fi

ARGS=()
HAS_DB_URL=false
IS_DB_OP=false

prev=""
for arg in "$@"; do
  if [[ "$arg" == "--db-url"* ]] || [[ "$prev" == "--db-url" ]]; then
    HAS_DB_URL=true
  fi
  if [[ "$arg" == "push" || "$arg" == "pull" || "$arg" == "reset" || "$arg" == "diff" || "$arg" == "list" ]]; then
    IS_DB_OP=true
  fi
  ARGS+=("$arg")
  prev="$arg"
done

if [ "$IS_DB_OP" = true ] && [ "$HAS_DB_URL" = false ] && [ -n "$DATABASE_URL" ]; then
  ARGS+=("--db-url" "$DATABASE_URL")
fi

exec "$REAL_BIN" "${ARGS[@]}"
