#!/usr/bin/env bash
# Nutriplan installer / updater (production). Idempotent: safe to run any number of times.
#
# Usage, from the folder where install.zip was unpacked:
#     ./install.sh
#
# First run : creates .env (asks for the domain and an e-mail, generates the
#             database and admin passwords), downloads the Docker images and
#             starts the application with HTTPS (Traefik + Let's Encrypt).
# Later runs: never touch an existing .env value or the data folder; they only
#             apply what changed (new release in release.conf, edited .env).
#
# Non-interactive use: NP_DOMAIN=nutriplan.example.org NP_ACME_EMAIL=me@example.org ./install.sh
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m  %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- one run at a time
if command -v flock >/dev/null 2>&1; then
  exec 9>.install.lock
  flock -n 9 || die "Another ./install.sh is already running in this folder."
fi

# ---------------------------------------------------------------- requirements
command -v docker >/dev/null 2>&1 || die "Docker is not installed. Install it first: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing (the 'docker compose' command). See https://docs.docker.com/compose/install/"
docker info >/dev/null 2>&1 || die "Cannot talk to the Docker daemon. Is it running? Does your user belong to the 'docker' group (or use sudo)?"

[ -f docker-compose.yml ] || die "docker-compose.yml not found: run this script from the unpacked install folder."
[ -f .env.example ] || die ".env.example not found: the install folder is incomplete."
COMPOSE=(docker compose --env-file .env -f docker-compose.yml)
# shellcheck disable=SC1091
[ -f release.conf ] && . ./release.conf   # defines NUTRIPLAN_IMAGE

# ---------------------------------------------------------------- helpers
rand() {  # rand <bytes> -> hex string
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "$1"
  else head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}
getvar() { grep -E "^$1=" "${2:-.env}" 2>/dev/null | tail -n1 | cut -d= -f2- || true; }
setvar() {  # setvar KEY VALUE [file]: replace the value or append the line
  local k="$1" v="$2" f="${3:-.env}" tmp
  if grep -qE "^$k=" "$f"; then
    tmp="$(mktemp)"
    awk -v k="$k" -v v="$v" 'BEGIN{FS=OFS="="} $1==k {print k "=" v; next} {print}' "$f" > "$tmp" && cat "$tmp" > "$f"
    rm -f "$tmp"
  else
    printf '%s=%s\n' "$k" "$v" >> "$f"
  fi
}
is_placeholder() { case "$1" in ""|nutriplan.example.com|admin@example.com) return 0;; *) return 1;; esac; }

GENERATED_ADMIN_PW=""
NEW_ENV=0

# ---------------------------------------------------------------- .env (created atomically)
if [ ! -f .env ]; then
  # Without .env but with an existing database folder a new random password would not match it.
  DATA_DIR_GUESS="${NP_DATA_DIR:-./data}"
  if [ -e "$DATA_DIR_GUESS/postgres" ]; then
    die "$DATA_DIR_GUESS/postgres already exists but .env is missing. Restore your original .env (it holds the database password), or move/remove the data folder to start from scratch."
  fi
  say "First installation: creating .env"
  NEW_ENV=1
  TMP_ENV="$(mktemp .env.XXXXXX)"
  trap 'rm -f "$TMP_ENV"' EXIT
  cp .env.example "$TMP_ENV"
  setvar POSTGRES_PASSWORD "$(rand 24)" "$TMP_ENV"
  GENERATED_ADMIN_PW="$(rand 12)"
  setvar ADMIN_PASSWORD "$GENERATED_ADMIN_PW" "$TMP_ENV"
  setvar SEED_DEMO false "$TMP_ENV"
  setvar PROD_SEED_DEMO false "$TMP_ENV"
  [ -z "${NP_DATA_DIR:-}" ] || setvar PROD_DATA_DIR "$NP_DATA_DIR" "$TMP_ENV"
  chmod 600 "$TMP_ENV"
  mv "$TMP_ENV" .env      # .env appears only when complete: an interrupted run leaves no half state
  trap - EXIT
else
  # Variables introduced by a newer release are appended with their default value.
  while IFS= read -r line; do
    case "$line" in ""|\#*) continue;; esac
    key="${line%%=*}"
    grep -qE "^$key=" .env || { printf '%s\n' "$line" >> .env; warn "New setting added to .env: $key"; }
  done < .env.example
  chmod 600 .env
fi

# domain / e-mail: explicit NP_* variables win, otherwise keep .env, otherwise ask
DOMAIN="$(getvar DOMAIN)"; ACME="$(getvar ACME_EMAIL)"
[ -z "${NP_DOMAIN:-}" ] || DOMAIN="$NP_DOMAIN"
[ -z "${NP_ACME_EMAIL:-}" ] || ACME="$NP_ACME_EMAIL"
if is_placeholder "$DOMAIN" || is_placeholder "$ACME"; then
  [ -t 0 ] || die "DOMAIN / ACME_EMAIL are not set and there is no terminal: set NP_DOMAIN and NP_ACME_EMAIL, or edit .env and re-run."
  is_placeholder "$DOMAIN" && read -r -p "Public domain name of the application (e.g. nutriplan.example.org): " DOMAIN
  is_placeholder "$ACME" && read -r -p "E-mail for Let's Encrypt certificate notices: " ACME
fi
setvar DOMAIN "$DOMAIN"
setvar ACME_EMAIL "$ACME"

# the image of this release
if [ -n "${NUTRIPLAN_IMAGE:-}" ]; then setvar NUTRIPLAN_IMAGE "$NUTRIPLAN_IMAGE"; fi

# ---------------------------------------------------------------- validation
bad() { die "$1 Edit .env and run ./install.sh again."; }
is_placeholder "$DOMAIN" && bad "DOMAIN is not set."
is_placeholder "$ACME" && bad "ACME_EMAIL is not set."
case "$(getvar POSTGRES_PASSWORD)" in ""|nutriplan|changeme) bad "POSTGRES_PASSWORD is empty or still the default value.";; esac
case "$(getvar ADMIN_PASSWORD)" in ""|admin123) bad "ADMIN_PASSWORD is empty or still the default value.";; esac

DATA_DIR="$(getvar PROD_DATA_DIR)"; DATA_DIR="${DATA_DIR:-./data}"
mkdir -p "$DATA_DIR"

# ---------------------------------------------------------------- images + start
IMAGE="$(getvar NUTRIPLAN_IMAGE)"
say "Downloading the Docker images (${IMAGE})"
if ! "${COMPOSE[@]}" pull; then
  docker image inspect "$IMAGE" >/dev/null 2>&1 || die "Could not download the images (is the Docker Hub repository private? run 'docker login')."
  warn "Pull failed, using the image already present locally."
fi

say "Starting Nutriplan"
"${COMPOSE[@]}" up -d --remove-orphans

say "Waiting for the backend to become healthy..."
ok=""
for _ in $(seq 1 60); do
  st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' nutriplan-backend 2>/dev/null || echo missing)"
  if [ "$st" = "healthy" ] || [ "$st" = "running" ]; then ok=1; break; fi
  sleep 2
done
[ -n "$ok" ] || { "${COMPOSE[@]}" logs --tail=40 backend || true; die "The backend did not start. See the log above."; }

echo
say "Nutriplan is running:  https://${DOMAIN}"
echo "    (the TLS certificate is requested on the first visit: it can take up to a minute;"
echo "     the DNS record of ${DOMAIN} must point to this server, ports 80 and 443 open)"
echo
if [ -n "$GENERATED_ADMIN_PW" ]; then
  echo "    Administrator user : admin"
  echo "    Password           : ${GENERATED_ADMIN_PW}     <-- write it down; also stored in .env"
else
  echo "    Administrator user : admin   (initial password: ADMIN_PASSWORD in .env;"
  echo "                                  it is only used on an empty database, the app may have changed it)"
fi
echo
echo "Useful commands (run in this folder):"
echo "    docker compose --env-file .env -f docker-compose.yml logs -f backend"
echo "    docker compose --env-file .env -f docker-compose.yml down        # stop (data is kept in ${DATA_DIR})"
