#!/usr/bin/env bash
# usage: bash scratchpad/t0.4c/run.sh <tag> <suite...>   (each suite = scripts/<name>.mts)
cd /root/projects/shark-trips-l2
tag=$1; shift
for s in "$@"; do
  log=scratchpad/t0.4c/${tag}-${s}.log
  echo "=== $s start $(date -u +%H:%M:%S)" > "$log"
  bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/$s.mts >> "$log" 2>&1
  echo "=== $s exit $? $(date -u +%H:%M:%S)" >> "$log"
done
