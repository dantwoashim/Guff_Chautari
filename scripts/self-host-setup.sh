#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.self-host"
DEFAULT_ENV_FILE="$ROOT_DIR/.env.example"
ENABLE_MONITORING="${ENABLE_MONITORING:-}"

harden_env_permissions() {
  # Best-effort protection for local secrets in self-host env file.
  chmod 600 "$ENV_FILE" 2>/dev/null || true
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command '$1' is not installed." >&2
    exit 1
  fi
}

update_env_value() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" "$ENV_FILE"; then
    if [[ "$(uname -s)" == "Darwin" ]]; then
      sed -i '' "s#^${key}=.*#${key}=${value}#" "$ENV_FILE"
    else
      sed -i "s#^${key}=.*#${key}=${value}#" "$ENV_FILE"
    fi
  else
    echo "${key}=${value}" >>"$ENV_FILE"
  fi
}

read_env_value() {
  local key="$1"
  grep "^${key}=" "$ENV_FILE" | cut -d'=' -f2- || true
}

prompt_with_default() {
  local label="$1"
  local default_value="$2"
  local value
  read -r -p "$label [$default_value]: " value
  if [[ -z "$value" ]]; then
    value="$default_value"
  fi
  echo "$value"
}

create_env_file_if_missing() {
  if [[ -f "$ENV_FILE" ]]; then
    harden_env_permissions
    return
  fi

  echo "Creating $ENV_FILE from .env.example..."
  if [[ -f "$DEFAULT_ENV_FILE" ]]; then
    cp "$DEFAULT_ENV_FILE" "$ENV_FILE"
  else
    cat >"$ENV_FILE" <<'ENVEOF'
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
GEMINI_API_KEY=
VITE_ENABLE_MOCK_CONNECTORS=false
ENVEOF
  fi

  cat >>"$ENV_FILE" <<'ENVEOF'

# Self-host runtime values
APP_PORT=4173
POSTGRES_PORT=54322
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
# Pin to a fixed image tag in production if required.
SUPABASE_POSTGRES_IMAGE=supabase/postgres:latest
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin
ENABLE_MONITORING=no
ENVEOF

  harden_env_permissions
}

ensure_env_defaults() {
  if [[ -z "$(read_env_value VITE_ENABLE_MOCK_CONNECTORS)" ]]; then
    update_env_value "VITE_ENABLE_MOCK_CONNECTORS" "false"
  fi
}

validate_deploy_inputs() {
  local supabase_url
  local supabase_anon_key
  local mock_connectors
  local normalized_mock_connectors

  supabase_url="$(read_env_value VITE_SUPABASE_URL)"
  supabase_anon_key="$(read_env_value VITE_SUPABASE_ANON_KEY)"
  mock_connectors="$(read_env_value VITE_ENABLE_MOCK_CONNECTORS)"
  normalized_mock_connectors="$(echo "$mock_connectors" | tr '[:upper:]' '[:lower:]')"

  if [[ -z "$supabase_url" || "$supabase_url" == "https://your-project-ref.supabase.co" ]]; then
    echo "error: set VITE_SUPABASE_URL in $ENV_FILE before deploy." >&2
    exit 1
  fi

  if [[ -z "$supabase_anon_key" || "$supabase_anon_key" == "your-supabase-anon-key" ]]; then
    echo "error: set VITE_SUPABASE_ANON_KEY in $ENV_FILE before deploy." >&2
    exit 1
  fi

  if [[ "$normalized_mock_connectors" =~ ^(true|1|yes|on)$ ]]; then
    echo "error: VITE_ENABLE_MOCK_CONNECTORS must be false for deploy readiness." >&2
    exit 1
  fi
}

print_header() {
  echo "== Ashim Self-Host Setup =="
  echo "Root: $ROOT_DIR"
  echo
}

validate_compose() {
  echo "Validating docker compose configuration..."
  docker compose --env-file "$ENV_FILE" config >/dev/null
}

start_stack() {
  local profiles=()
  local monitoring_value

  monitoring_value=$(grep '^ENABLE_MONITORING=' "$ENV_FILE" | cut -d'=' -f2- || true)
  monitoring_value="${ENABLE_MONITORING:-$monitoring_value}"
  if [[ "$monitoring_value" =~ ^(yes|true|1)$ ]]; then
    profiles+=(--profile monitoring)
  fi

  echo "Starting self-host stack..."
  docker compose --env-file "$ENV_FILE" "${profiles[@]}" up -d --build
}

wait_for_health() {
  local app_port
  app_port=$(grep '^APP_PORT=' "$ENV_FILE" | cut -d'=' -f2-)
  local app_health_url="http://127.0.0.1:${app_port}/healthz"

  echo "Waiting for app health endpoint: $app_health_url"
  for _ in {1..45}; do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS "$app_health_url" >/dev/null 2>&1; then
        echo "App health check passed."
        return
      fi
    elif command -v wget >/dev/null 2>&1; then
      if wget -q -O - "$app_health_url" >/dev/null 2>&1; then
        echo "App health check passed."
        return
      fi
    fi
    sleep 2
  done

  echo "warning: app health check did not pass within timeout." >&2
  docker compose --env-file "$ENV_FILE" ps
  exit 1
}

first_run_wizard() {
  if [[ ! -t 0 ]]; then
    echo "Non-interactive shell detected; skipping first-run wizard."
    return
  fi

  echo
  echo "First-run wizard"
  local supabase_url
  local supabase_anon_key
  local app_port
  local monitoring_choice
  local mock_connectors_choice

  supabase_url=$(prompt_with_default "Supabase URL" "$(read_env_value VITE_SUPABASE_URL)")
  supabase_anon_key=$(prompt_with_default "Supabase anon key" "$(read_env_value VITE_SUPABASE_ANON_KEY)")
  app_port=$(prompt_with_default "App port" "$(read_env_value APP_PORT)")
  monitoring_choice=$(prompt_with_default "Enable monitoring profile (yes/no)" "$(read_env_value ENABLE_MONITORING)")
  mock_connectors_choice=$(prompt_with_default "Enable mock connectors (true/false)" "$(read_env_value VITE_ENABLE_MOCK_CONNECTORS)")

  update_env_value "VITE_SUPABASE_URL" "$supabase_url"
  update_env_value "VITE_SUPABASE_ANON_KEY" "$supabase_anon_key"
  update_env_value "APP_PORT" "$app_port"
  update_env_value "ENABLE_MONITORING" "$monitoring_choice"
  update_env_value "VITE_ENABLE_MOCK_CONNECTORS" "$mock_connectors_choice"

  echo "$ENV_FILE updated."
}

print_success() {
  local app_port
  app_port=$(grep '^APP_PORT=' "$ENV_FILE" | cut -d'=' -f2-)

  echo
  echo "Self-host setup complete."
  echo "App: http://localhost:${app_port}"
  echo "Health: http://localhost:${app_port}/healthz"
  echo
  echo "Useful commands:"
  echo "  docker compose --env-file .env.self-host ps"
  echo "  docker compose --env-file .env.self-host logs -f app"
  echo "  docker compose --env-file .env.self-host down"
}

main() {
  print_header
  require_command docker
  require_command npm

  if ! docker compose version >/dev/null 2>&1; then
    echo "error: docker compose v2 is required." >&2
    exit 1
  fi

  create_env_file_if_missing
  ensure_env_defaults
  first_run_wizard
  harden_env_permissions
  validate_deploy_inputs
  validate_compose
  start_stack
  wait_for_health
  print_success
}

main "$@"
