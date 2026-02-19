#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env.self-host}"
SKIP_CI="${SKIP_CI:-0}"
SKIP_DOCKER_BUILD="${SKIP_DOCKER_BUILD:-0}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command '$1' is not installed." >&2
    exit 1
  fi
}

read_env_value() {
  local key="$1"
  grep "^${key}=" "$ENV_FILE" | cut -d'=' -f2- || true
}

validate_env_value() {
  local key="$1"
  local value="$2"
  local placeholder="$3"

  if [[ -z "$value" || "$value" == "$placeholder" ]]; then
    echo "error: ${key} is missing or placeholder in $ENV_FILE." >&2
    exit 1
  fi
}

print_section() {
  echo
  echo "== $1 =="
}

main() {
  print_section "Ashim deploy preflight"
  echo "Root: $ROOT_DIR"
  echo "Env file: $ENV_FILE"

  require_command npm
  require_command docker

  if ! docker compose version >/dev/null 2>&1; then
    echo "error: docker compose v2 is required." >&2
    exit 1
  fi

  if [[ ! -f "$ENV_FILE" ]]; then
    echo "error: env file not found: $ENV_FILE" >&2
    echo "hint: run ./scripts/self-host-setup.sh first." >&2
    exit 1
  fi

  local supabase_url
  local supabase_anon_key
  local mock_connectors
  local normalized_mock_connectors

  supabase_url="$(read_env_value VITE_SUPABASE_URL)"
  supabase_anon_key="$(read_env_value VITE_SUPABASE_ANON_KEY)"
  mock_connectors="$(read_env_value VITE_ENABLE_MOCK_CONNECTORS)"
  normalized_mock_connectors="$(echo "$mock_connectors" | tr '[:upper:]' '[:lower:]')"

  print_section "Validate deploy env"
  validate_env_value "VITE_SUPABASE_URL" "$supabase_url" "https://your-project-ref.supabase.co"
  validate_env_value "VITE_SUPABASE_ANON_KEY" "$supabase_anon_key" "your-supabase-anon-key"

  if [[ "$normalized_mock_connectors" =~ ^(true|1|yes|on)$ ]]; then
    echo "error: VITE_ENABLE_MOCK_CONNECTORS must be false for deployment." >&2
    exit 1
  fi
  echo "Environment validation passed."

  print_section "Validate compose config"
  docker compose --env-file "$ENV_FILE" config >/dev/null
  echo "docker compose config passed."

  if [[ "$SKIP_CI" != "1" ]]; then
    print_section "Run CI gate"
    npm run ci
  else
    print_section "Run CI gate"
    echo "Skipped (SKIP_CI=1)."
  fi

  if [[ "$SKIP_DOCKER_BUILD" != "1" ]]; then
    print_section "Build deploy image"
    docker compose --env-file "$ENV_FILE" build app
  else
    print_section "Build deploy image"
    echo "Skipped (SKIP_DOCKER_BUILD=1)."
  fi

  print_section "Preflight complete"
  echo "Deploy gate checks passed."
  echo "Next: docker compose --env-file $ENV_FILE up -d"
}

main "$@"
