#!/usr/bin/env bash
# walkonly.sh <tag> <states…> — start :3226 from the existing .next (no rebuild) and walk the given states.
set -uo pipefail
TAG="$1"; shift; T=/root/projects/shark-hr-c; L=/tmp/hr-ctl/walk/$TAG; mkdir -p "$L"; cd "$T" || exit 9
echo "start $(date -u +%FT%TZ) head $(git rev-parse --short HEAD)" > "$L/status"
bash scripts/qc4.sh env NODE_OPTIONS=--max-old-space-size=4096 ACC_V2_PORT=3226 bash scripts/acc-v2-serve.sh start > "$L/serve.log" 2>&1
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:3226/ && break; sleep 3; done
for W in "$@"; do
  ISO_MEM=6G bash scripts/iso.sh bash scripts/qc4.sh env QC_FORCE=1 pnpm exec tsx scripts/walk-hr.mts --base http://127.0.0.1:3226 --only "$W" > "$L/walk-$W.log" 2>&1
  echo "walk $W rc=$? $(grep -ac '✅' "$L/walk-$W.log") ok / $(grep -ac '❌' "$L/walk-$W.log") fail $(date -u +%TZ)" >> "$L/status"
done
echo "DONE $(date -u +%FT%TZ)" >> "$L/status"
