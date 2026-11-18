#!/usr/bin/env bash
# rewalk.sh <tag> <walk args…> — controller tree: wait for RAM, rebuild current checkout, restart :3226, walk selected states.
set -uo pipefail
TAG="$1"; shift; T=/root/projects/shark-hr-c; L=/tmp/hr-ctl/walk/$TAG; mkdir -p "$L"; cd "$T" || exit 9
echo "start $(date -u +%FT%TZ) head $(git rev-parse --short HEAD) branch $(git branch --show-current)" > "$L/status"
bash scripts/qc4.sh env ACC_V2_PORT=3226 bash scripts/acc-v2-serve.sh stop > "$L/stop.log" 2>&1
for i in $(seq 1 120); do a=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo); [ "$a" -ge 17000 ] && break; sleep 60; done
echo "mem ok $a MB $(date -u +%TZ)" >> "$L/status"
ISO_MEM=16G bash scripts/iso.sh bash scripts/qc4.sh env NODE_OPTIONS=--max-old-space-size=14336 ACC_V2_BUILD_FLAGS=--webpack ACC_V2_PORT=3226 bash scripts/acc-v2-serve.sh build > "$L/build.log" 2>&1
echo "build rc=$? $(date -u +%TZ)" >> "$L/status"
# the server started inside the iso scope dies with it → start it again outside iso (unit keeps it alive)
bash scripts/qc4.sh env NODE_OPTIONS=--max-old-space-size=4096 ACC_V2_PORT=3226 bash scripts/acc-v2-serve.sh start > "$L/serve.log" 2>&1
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:3226/ && break; sleep 3; done
for W in "$@"; do
  ISO_MEM=6G bash scripts/iso.sh bash scripts/qc4.sh env QC_FORCE=1 pnpm exec tsx scripts/walk-hr.mts --base http://127.0.0.1:3226 --only "$W" > "$L/walk-$W.log" 2>&1
  echo "walk $W rc=$? $(grep -ac '✅' "$L/walk-$W.log") ok / $(grep -ac '❌' "$L/walk-$W.log") fail $(date -u +%TZ)" >> "$L/status"
done
echo "DONE $(date -u +%FT%TZ)" >> "$L/status"
