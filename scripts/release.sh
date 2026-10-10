#!/usr/bin/env bash
# Builds the Nutriplan Docker image, publishes it on Docker Hub and creates
# dist/install.zip: the bundle to copy to the production server.
#
# Idempotent: running it again with the same sources and version produces the
# same image tags and a byte-identical install.zip (files are staged in a
# temporary folder and moved into dist/ only when complete).
#
#   DOCKERHUB_USER=myuser ./scripts/release.sh                 # build + push + install.zip
#   DOCKERHUB_USER=myuser ./scripts/release.sh --version 1.2.0 # explicit version (default: git tag, else commit)
#   DOCKERHUB_USER=myuser ./scripts/release.sh --no-push       # build locally, only create install.zip
#   PLATFORMS=linux/amd64,linux/arm64 DOCKERHUB_USER=myuser ./scripts/release.sh   # multi-arch (needs buildx)
#
# Requires: docker (logged in with "docker login" when pushing), and zip or python3.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

PUSH=1
VERSION=""
PLATFORMS="${PLATFORMS:-linux/amd64}"
while [ $# -gt 0 ]; do
  case "$1" in
    --no-push) PUSH=0 ;;
    --version) VERSION="${2:?--version needs a value}"; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

command -v docker >/dev/null 2>&1 || die "docker not found."
DOCKERHUB_USER="${DOCKERHUB_USER:-}"
[ -n "$DOCKERHUB_USER" ] || die "Set DOCKERHUB_USER (your Docker Hub account/organisation name)."
# Version = git tag of this exact commit; otherwise the commit hash (suffix "-dirty" if there are uncommitted
# changes); outside a git checkout, the version of app/__init__.py. --version overrides everything.
COMMIT=""
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
  COMMIT="$(git rev-parse --short HEAD 2>/dev/null || true)"
  if [ -z "$VERSION" ]; then
    VERSION="$(git describe --tags --exact-match 2>/dev/null || true)"
    if [ -z "$VERSION" ] && [ -n "$COMMIT" ]; then VERSION="$COMMIT"; fi
    if [ -n "$VERSION" ] && [ -n "$(git status --porcelain 2>/dev/null)" ]; then VERSION="${VERSION}-dirty"; fi
  fi
fi
VERSION="${VERSION:-$(sed -n 's/^__version__ = "\(.*\)"/\1/p' app/__init__.py)}"
[ -n "$VERSION" ] || die "Could not determine the version."
# Docker image tags allow only [A-Za-z0-9_.-]
TAG="$(printf '%s' "$VERSION" | sed 's/[^A-Za-z0-9_.-]/-/g')"

IMAGE="${DOCKERHUB_USER}/nutriplan-backend"
say "Version ${VERSION}${COMMIT:+ (commit ${COMMIT})} - building ${IMAGE}:${TAG} (the image contains the compiled React frontend)"
if [ "$PUSH" = 1 ] && [[ "$PLATFORMS" == *,* ]]; then
  docker buildx build --platform "$PLATFORMS" --build-arg "APP_VERSION=${VERSION}" --build-arg "APP_COMMIT=${COMMIT}" \
    -t "${IMAGE}:${TAG}" -t "${IMAGE}:latest" --push .
else
  docker build --build-arg "APP_VERSION=${VERSION}" --build-arg "APP_COMMIT=${COMMIT}" \
    -t "${IMAGE}:${TAG}" -t "${IMAGE}:latest" .
  if [ "$PUSH" = 1 ]; then
    say "Pushing to Docker Hub"
    docker push "${IMAGE}:${TAG}"
    docker push "${IMAGE}:latest"
  else
    say "--no-push: image kept locally only"
  fi
fi

say "Creating dist/install.zip"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
STAGE="$WORK/install"
mkdir -p "$STAGE"
cp deploy/install.sh "$STAGE/install.sh"
cp deploy/README.md "$STAGE/README.md"
cp .env.example "$STAGE/.env.example"
# production compose: use the published image only (no "build:" in the bundle)
grep -v '^    build: \.$' docker-compose-prod.yml > "$STAGE/docker-compose.yml"
grep -q 'image: ' "$STAGE/docker-compose.yml" || die "docker-compose-prod.yml has no image: line."
printf 'NUTRIPLAN_IMAGE=%s:%s\n' "$IMAGE" "$TAG" > "$STAGE/release.conf"
chmod 755 "$STAGE/install.sh"
chmod 644 "$STAGE/README.md" "$STAGE/.env.example" "$STAGE/docker-compose.yml" "$STAGE/release.conf"
# fixed timestamps + sorted entries => reproducible archive
find "$STAGE" -exec touch -d '2020-01-01 00:00:00' {} +

ZIP="$WORK/install.zip"
if command -v zip >/dev/null 2>&1; then
  (cd "$WORK" && find install -type f | LC_ALL=C sort | zip -qX@ install.zip)
else
  (cd "$WORK" && python3 - <<'PY'
import os, zipfile
files = sorted(os.path.join(r, f) for r, _, fs in os.walk("install") for f in fs)
with zipfile.ZipFile("install.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for p in files:
        info = zipfile.ZipInfo(p, date_time=(2020, 1, 1, 0, 0, 0))
        info.external_attr = (0o755 if p.endswith(".sh") else 0o644) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        with open(p, "rb") as fh:
            z.writestr(info, fh.read())
PY
  )
fi

mkdir -p dist
mv -f "$ZIP" dist/install.zip.tmp && mv -f dist/install.zip.tmp dist/install.zip
say "Done: dist/install.zip  (image ${IMAGE}:${TAG}, version shown in the app: ${VERSION})"
echo "Copy it to the server, then:  unzip install.zip && cd install && ./install.sh"
