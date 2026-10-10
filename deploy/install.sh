#!/usr/bin/env bash
# Nutriplan installer (production): CLEAN installation.
#
# Usage, from the folder where install.zip was unpacked:
#     ./install.sh
#
# It always performs a clean install: if a previous installation is found
# (.env, data folder or Nutriplan containers) it is REMOVED - database, uploaded
# documents, certificates and settings - after an explicit confirmation.
# On a clean folder it just installs, without asking anything.
#
# Then it asks for the domain and an e-mail, generates the database and administrator
# passwords, downloads the Docker images and starts the application with HTTPS
# (Traefik + Let's Encrypt).
#
# Non-interactive use:
#     NP_CONFIRM_RESET=yes NP_DOMAIN=nutriplan.example.org NP_ACME_EMAIL=me@example.org ./install.sh
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
wipe_dir() {  # remove a folder whose files belong to the database user (needs no sudo: done inside Docker)
  local d="$1" abs
  [ -e "$d" ] || return 0
  abs="$(cd "$d" && pwd)"
  docker run --rm -v "$abs":/wipe --entrypoint sh "${WIPE_IMAGE:-postgres:16-alpine}" -c 'rm -rf /wipe/* /wipe/.[!.]* 2>/dev/null; true'
  rmdir "$abs" 2>/dev/null || rm -rf "$abs" 2>/dev/null || true
}

# ---------------------------------------------------------------- previous installation?
OLD_DATA="$(getvar PROD_DATA_DIR)"; OLD_DATA="${OLD_DATA:-./data}"
CONTAINERS="$(docker ps -a --format '{{.Names}}' | grep -E '^nutriplan-(traefik|db|backend-and-frontend)$' || true)"
FOUND=()
[ -f .env ] && FOUND+=("settings (.env)")
[ -e "$OLD_DATA/postgres" ] && FOUND+=("database and data folder ($OLD_DATA)")
[ -e "$OLD_DATA/letsencrypt" ] && FOUND+=("TLS certificates ($OLD_DATA/letsencrypt)")
[ -z "$CONTAINERS" ] || FOUND+=("Nutriplan containers: $(echo $CONTAINERS | tr '\n' ' ')")

if [ "${#FOUND[@]}" -gt 0 ]; then
  echo
  warn "A previous Nutriplan installation was found:"
  for f in "${FOUND[@]}"; do echo "      - $f"; done
  echo
  warn "A CLEAN INSTALL DELETES ALL OF IT: users, patients, diets, diaries, documents, certificates."
  warn "This cannot be undone. If you need the data, abort now and make a backup first"
  warn "(in the app: Backup, or: docker compose exec db pg_dump -U nutriplan nutriplan > backup.sql)."
  echo
  if [ "${NP_CONFIRM_RESET:-}" != "yes" ]; then
    [ -t 0 ] || die "Confirmation required: run from a terminal, or set NP_CONFIRM_RESET=yes."
    read -r -p "Type 'yes' to delete everything and install from scratch: " ANSWER
    [ "$ANSWER" = "yes" ] || die "Aborted. Nothing was changed."
  fi

  say "Removing the previous installation"
  if [ -f .env ]; then "${COMPOSE[@]}" down --remove-orphans >/dev/null 2>&1 || true; fi
  for c in $CONTAINERS; do docker rm -f "$c" >/dev/null 2>&1 || true; done
  wipe_dir "$OLD_DATA"
  rm -f .env
fi

# ---------------------------------------------------------------- new .env (created atomically)
say "Creating the configuration (.env)"
TMP_ENV="$(mktemp .env.XXXXXX)"
trap 'rm -f "$TMP_ENV"' EXIT
cp .env.example "$TMP_ENV"
setvar POSTGRES_PASSWORD "$(rand 24)" "$TMP_ENV"
ADMIN_PW="$(rand 12)"
setvar ADMIN_PASSWORD "$ADMIN_PW" "$TMP_ENV"
setvar SEED_DEMO false "$TMP_ENV"
setvar PROD_SEED_DEMO false "$TMP_ENV"
[ -z "${NP_DATA_DIR:-}" ] || setvar PROD_DATA_DIR "$NP_DATA_DIR" "$TMP_ENV"
[ -z "${NUTRIPLAN_IMAGE:-}" ] || setvar NUTRIPLAN_IMAGE "$NUTRIPLAN_IMAGE" "$TMP_ENV"

# domain / e-mail: explicit NP_* variables, otherwise ask
DOMAIN="${NP_DOMAIN:-}"; ACME="${NP_ACME_EMAIL:-}"
if is_placeholder "$DOMAIN"; then
  if [ -t 0 ]; then
    echo "Public domain name of the application (e.g. nutriplan.example.org)."
    read -r -p "Leave empty for a LOCAL test on this machine (localhost): " DOMAIN
    DOMAIN="${DOMAIN:-localhost}"
  else
    DOMAIN="localhost"; warn "DOMAIN not set: using localhost (set NP_DOMAIN to change)"
  fi
fi
case "$DOMAIN" in
  localhost|127.*|*.local) is_placeholder "$ACME" && ACME="local-test@example.org" ;;   # no certificate is requested for local names
  *) if is_placeholder "$ACME"; then
       [ -t 0 ] || die "ACME_EMAIL is not set and there is no terminal: set NP_ACME_EMAIL."
       read -r -p "E-mail for Let's Encrypt certificate notices: " ACME
     fi ;;
esac
case "$DOMAIN" in
  localhost|*.*|*:*) ;;
  *) warn "DOMAIN '$DOMAIN' has no dot: it only works if your machines resolve that name (e.g. /etc/hosts). Use 'localhost' for a local test." ;;
esac
setvar DOMAIN "$DOMAIN" "$TMP_ENV"
setvar ACME_EMAIL "$ACME" "$TMP_ENV"
chmod 600 "$TMP_ENV"
mv "$TMP_ENV" .env
trap - EXIT

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

say "Waiting for the application to become healthy..."
ok=""
for _ in $(seq 1 60); do
  st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' nutriplan-backend-and-frontend 2>/dev/null || echo missing)"
  if [ "$st" = "healthy" ] || [ "$st" = "running" ]; then ok=1; break; fi
  sleep 2
done
[ -n "$ok" ] || { "${COMPOSE[@]}" logs --tail=40 backend-and-frontend || true; die "The application did not start. See the log above."; }

echo
say "Nutriplan is running"
cat <<TXT

  Addresses and ports
  -------------------
  Web application   https://${DOMAIN}            port 443 (HTTPS, certificate handled by Traefik)
  HTTP              http://${DOMAIN}             port 80  (only redirects to HTTPS)
TXT
case "$DOMAIN" in
  localhost|127.*|*.local) cat <<TXT
  Local test        https://localhost on this machine (self-signed certificate: accept the browser warning)
  From other PCs    https://<IP-of-this-server>  (same warning; the firewall must allow ports 80 and 443)
TXT
  ;;
  *) cat <<TXT
  Requirements      the DNS record of ${DOMAIN} must point to this server and ports 80/443 must be open;
                    the Let's Encrypt certificate is requested on the first visit (up to a minute).
TXT
  ;;
esac
cat <<TXT

  Containers
  ----------
  nutriplan-traefik                 HTTPS reverse proxy        host ports 80 and 443 (published)
  nutriplan-backend-and-frontend    API + web interface        port 8000, internal only (not published)
  nutriplan-db                      PostgreSQL                 port 5432, internal only (not published)

  Data folder       ${DATA_DIR}   (database, documents, certificates: back it up)

  Administrator user : admin
  Password           : ${ADMIN_PW}     <-- write it down; also stored in .env

Useful commands (run in this folder):
    docker compose --env-file .env -f docker-compose.yml logs -f backend-and-frontend
    docker compose --env-file .env -f docker-compose.yml down        # stop (data is kept in ${DATA_DIR})
TXT
