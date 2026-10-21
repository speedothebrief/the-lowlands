#!/bin/sh
# The Lowlands — build and (re)start the game server container on a Synology NAS
# (old "Docker" package or Container Manager) or any Linux box with Docker.
#
#   git clone https://github.com/speedothebrief/the-lowlands.git && cd the-lowlands && sh deploy-synology.sh
#
# Rerun it any time to update: it pulls the latest code, rebuilds the image and replaces
# the container. Players then open http://<nas-ip>:8090/ and click Join LAN.
#
# Usage: sh deploy-synology.sh [PORT] [--no-pull] [--no-prune]
#   PORT        host port to publish (default 8090, or the PORT environment variable).
#               Not 8080: on Synology, DSM's nginx (Web Station) already owns 8080.
#   --no-pull   don't run "git pull" first
#   --no-prune  keep old, untagged images (by default "docker image prune -f" runs at the end)
set -eu

NAME=the-lowlands
LEGACY_NAMES="the-lowlands1"
IMAGE=the-lowlands
CONTAINER_PORT=8080

PULL=1
PRUNE=1
PORT_ARG=""
for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    --no-prune) PRUNE=0 ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "Unknown option: $arg (try --help)" >&2; exit 2 ;;
    *) PORT_ARG=$arg ;;
  esac
done
PORT=${PORT_ARG:-${PORT:-8090}}
case "$PORT" in
  ''|*[!0-9]*) echo "ERROR: port must be a number, got '$PORT'" >&2; exit 2 ;;
esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
  echo "ERROR: port must be between 1 and 65535, got $PORT" >&2; exit 2
fi

say()  { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# Always work from the repo root (the folder this script lives in).
cd "$(dirname "$0")" || die "cannot cd to the script's folder"
[ -f Dockerfile ] || die "no Dockerfile in $(pwd) — run this script from the cloned the-lowlands folder"

# ---- 1. update the code
if [ "$PULL" = 1 ]; then
  if ! command -v git >/dev/null 2>&1; then
    warn "git not found — skipping 'git pull', building the files as they are"
  elif ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    warn "$(pwd) is not a git clone — skipping 'git pull', building the files as they are"
  else
    say "Updating the code (git pull --ff-only)"
    if ! git pull --ff-only; then
      die "git pull failed. If you changed files here, undo that with
       git stash      (or: git reset --hard origin/main  — discards local changes)
and run the script again. To deploy without pulling: sh $0 --no-pull"
    fi
  fi
fi

VERSION=$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' package.json 2>/dev/null | head -n 1)

# ---- 2. find docker (Synology keeps it outside sudo's PATH) and use sudo unless root
DOCKER=""
for d in "$(command -v docker 2>/dev/null || true)" /usr/local/bin/docker /usr/bin/docker \
         /var/packages/ContainerManager/target/usr/bin/docker /var/packages/Docker/target/usr/bin/docker; do
  if [ -n "$d" ] && [ -x "$d" ]; then DOCKER=$d; break; fi
done
[ -n "$DOCKER" ] || die "docker not found. Install the Docker (or Container Manager) package from the Package Center first."

SUDO=""
if [ "$(id -u)" != 0 ]; then
  command -v sudo >/dev/null 2>&1 || die "not root and sudo not found — run as root or log in as an administrator"
  SUDO=sudo
  echo "Docker needs administrator rights here; sudo may ask for your password."
fi
dk() { $SUDO "$DOCKER" "$@"; }

dk info >/dev/null 2>&1 || die "cannot talk to Docker ($SUDO $DOCKER info failed). Is the Docker package running, and is your user an administrator?"

# Is something (e.g. DSM's nginx on 8080) already listening on that port?
port_busy() {
  if command -v netstat >/dev/null 2>&1; then
    netstat -tln 2>/dev/null | awk '{print $4}' | grep -q "[:.]$PORT\$"
  elif command -v ss >/dev/null 2>&1; then
    ss -tln 2>/dev/null | awk '{print $4}' | grep -q "[:.]$PORT\$"
  else
    return 1
  fi
}
ours=0
for c in $NAME $LEGACY_NAMES; do dk inspect "$c" >/dev/null 2>&1 && ours=1; done
if [ "$ours" = 0 ] && port_busy; then   # nothing of ours to replace, so someone else owns it: fail before the long build
  die "port $PORT is already in use on this machine (on Synology, DSM's nginx owns 80/443/5000/5001/8080).
Pick a free one, e.g.:  sh $0 8091"
fi

# ---- 3. build
say "Building image $IMAGE:latest${VERSION:+ (v$VERSION)} — the first build downloads node:20-alpine and takes a few minutes"
if [ -n "$VERSION" ]; then
  dk build -t "$IMAGE:latest" -t "$IMAGE:$VERSION" . || die "docker build failed (see above)"
else
  dk build -t "$IMAGE:latest" . || die "docker build failed (see above)"
fi

# ---- 4. replace the old container(s)
for c in $NAME $LEGACY_NAMES; do
  if dk inspect "$c" >/dev/null 2>&1; then
    say "Removing old container $c"
    dk stop "$c" >/dev/null 2>&1 || true
    dk rm -f "$c" >/dev/null || die "could not remove container $c"
  fi
done

if port_busy; then   # still busy after removing our old containers
  die "port $PORT is already in use on this machine (on Synology, DSM's nginx owns 80/443/5000/5001/8080).
Pick a free one, e.g.:  sh $0 8091"
fi

# ---- 5. run
say "Starting container $NAME on port $PORT"
dk run -d --name "$NAME" --restart unless-stopped -p "$PORT:$CONTAINER_PORT" "$IMAGE:latest" >/dev/null \
  || die "docker run failed (see above)"

# ---- 6. wait until it answers
fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsS -m 3 -o /dev/null "$1"
  elif command -v wget >/dev/null 2>&1; then wget -q -T 3 -O /dev/null "$1"
  else return 2; fi
}
say "Waiting for the server to answer on http://localhost:$PORT/"
ok=0; i=0
while [ $i -lt 30 ]; do
  rc=0; fetch "http://localhost:$PORT/" 2>/dev/null || rc=$?
  if [ $rc -eq 0 ]; then ok=1; break; fi
  if [ $rc -eq 2 ] && ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    warn "neither curl nor wget found — can't check, assuming it started"; ok=1; break
  fi
  running=$(dk inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null || echo false)
  [ "$running" = true ] || break
  i=$((i + 1)); sleep 1
done
if [ "$ok" != 1 ]; then
  echo "--- last lines of the container log ---" >&2
  dk logs --tail 30 "$NAME" >&2 || true
  die "the server did not answer on port $PORT within 30 s (log above)."
fi

# ---- 7. tidy up old image layers
if [ "$PRUNE" = 1 ]; then
  dk image prune -f >/dev/null 2>&1 || true
fi

# ---- 8. tell the user where to go
lan_ips() {
  if command -v ip >/dev/null 2>&1; then
    ip -4 -o addr show 2>/dev/null | awk '$2 !~ /^(lo|docker|br-|veth)/ {split($4, a, "/"); print a[1]}'
  elif command -v ifconfig >/dev/null 2>&1; then
    ifconfig 2>/dev/null | awk '/^[a-zA-Z]/ {ifc=$1} /inet / && ifc !~ /^(lo|docker|br-|veth)/ {
      for (i = 1; i <= NF; i++) if ($i ~ /^(addr:)?[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) { sub("addr:", "", $i); print $i; break } }'
  fi | grep -v '^127\.' || true
}
IPS=$(lan_ips)

echo
echo "================================================================"
echo "  The Lowlands${VERSION:+ v$VERSION} is running (container $NAME, port $PORT)."
echo
echo "  Everyone on your network opens one of these and clicks Join LAN:"
if [ -n "$IPS" ]; then
  for ip in $IPS; do echo "      http://$ip:$PORT/"; done
else
  echo "      http://<nas-ip>:$PORT/"
fi
echo
echo "  Can't connect?"
echo "   - Mac: System Settings > Privacy & Security > Local Network ->"
echo "     turn it ON for your browser (Safari/Chrome/Firefox), then reload."
echo "   - DSM firewall on? Control Panel > Security > Firewall > Edit Rules ->"
echo "     allow TCP port $PORT from your LAN."
echo
echo "  Update later: run this script again (sh deploy-synology.sh)."
echo "================================================================"
