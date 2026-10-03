#!/usr/bin/env bash
# Deploys the latest commit of a branch on the machine that runs Pulse, from the repo checkout.
#
#   scripts/deploy.sh                      # origin/main with compose.yaml
#   COMPOSE_FILE=my-compose.yaml scripts/deploy.sh
#   scripts/deploy.sh --branch some-branch --force
#
# Steps: check the checkout and Docker, fetch and reset to origin/<branch>, build the image (Docker's layer cache keeps
# unchanged layers), dump Postgres, keep the running image as pulse:previous, recreate the containers, wait for the
# app's HEALTHCHECK, and roll back to pulse:previous when it never turns healthy (restore the dump by hand if a
# migration ran). Then remove the dangling images the rebuild left behind.
set -euo pipefail

BRANCH=main
FORCE=0
COMPOSE_FILE=${COMPOSE_FILE:-compose.yaml}
IMAGE=pulse:latest
CONTAINER=pulse
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-120}

while [ $# -gt 0 ]; do
  case $1 in
    --branch) BRANCH=$2; shift 2 ;;
    --force) FORCE=1; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

START=$(date +%s)
step() { printf '\n\033[1;36m[%s] %s\033[0m\n' "$(date +%H:%M:%S)" "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die() { printf '  \033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$(git rev-parse --show-toplevel)"
compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

step "Pre-flight"
[ -f "$COMPOSE_FILE" ] || die "$COMPOSE_FILE not found (set COMPOSE_FILE)"
[ -f .env ] || die ".env not found"
docker info >/dev/null 2>&1 || die "Docker is not reachable"
# Untracked files (a local compose file) are fine; edits to tracked files would be lost by the reset.
git diff --quiet HEAD || [ "$FORCE" = 1 ] || die "tracked files have local changes; commit them or pass --force"
ok "compose $COMPOSE_FILE, docker $(docker version -f '{{.Server.Version}}')"

step "Fetching origin/$BRANCH"
git fetch --quiet origin "$BRANCH"
OLD=$(git rev-parse HEAD)
NEW=$(git rev-parse "origin/$BRANCH")
RUNNING=$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo missing)
if [ "$OLD" = "$NEW" ] && [ "$RUNNING" = healthy ] && [ "$FORCE" = 0 ]; then
  ok "already on $(git log -1 --format='%h %s') and healthy; nothing to do (--force to rebuild)"
  exit 0
fi
git log --oneline "$OLD..$NEW" | sed 's/^/  + /'
git checkout --quiet -B "$BRANCH" "origin/$BRANCH"
git reset --quiet --hard "origin/$BRANCH"
ok "now at $(git log -1 --format='%h %s')"

step "Backing up Postgres"
# Migrations run at boot; a dump first means a bad migration can be undone. Kept: the last 10.
if docker inspect pulse-db >/dev/null 2>&1; then
  mkdir -p backups
  f="backups/pre-deploy-$(date +%Y%m%d-%H%M%S).dump"
  docker exec pulse-db pg_dump -U pulse -Fc pulse > "$f" && ok "saved $f ($(du -h "$f" | cut -f1))"
  ls -1t backups/pre-deploy-*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f
else
  ok "no pulse-db container yet; nothing to back up"
fi

step "Building $IMAGE"
docker image inspect "$IMAGE" >/dev/null 2>&1 && docker tag "$IMAGE" pulse:previous && ok "kept the current image as pulse:previous"
# Plain progress, cut to step lines (BuildKit "#5 [3/9] ...", the classic builder's "Step 3/9") and errors.
set +e
docker compose -f "$COMPOSE_FILE" --progress plain build 2>&1 | grep -E --line-buffered '^#[0-9]+ (\[|DONE|CACHED|ERROR)|^Step [0-9]+/|[Ee]rror' | sed 's/^/  /'
rc=${PIPESTATUS[0]}
set -e
[ "$rc" = 0 ] || die "build failed (run: docker compose -f $COMPOSE_FILE build)"
ok "built"

step "Starting $CONTAINER"
compose up -d --no-build
wait_healthy() {
  local t=0 s
  while [ "$t" -lt "$HEALTH_TIMEOUT" ]; do
    s=$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo missing)
    printf '\r  health: %-10s %3ss' "$s" "$t"
    [ "$s" = healthy ] && { echo; return 0; }
    [ "$s" = unhealthy ] && break
    sleep 3; t=$((t + 3))
  done
  echo; return 1
}
if ! wait_healthy; then
  docker logs --tail 30 "$CONTAINER" 2>&1 | sed 's/^/  | /'
  if docker image inspect pulse:previous >/dev/null 2>&1; then
    step "Rolling back to pulse:previous"
    docker tag pulse:previous "$IMAGE"
    compose up -d --no-build --force-recreate
    wait_healthy && die "new build was unhealthy; rolled back to the previous image (code is still at $(git rev-parse --short HEAD))"
  fi
  die "container is not healthy"
fi
ok "healthy"

step "Cleaning up"
docker image prune -f --filter label=app=pulse >/dev/null
ok "removed dangling Pulse images"
docker logs --since 2m "$CONTAINER" 2>&1 | grep -m1 '\[worker\]' | sed 's/^/  /' || true

step "Deployed $(git rev-parse --short HEAD) in $(( $(date +%s) - START ))s"
