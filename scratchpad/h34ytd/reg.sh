#!/bin/bash
# usage: reg.sh <outdir> suite...
cd /root/projects/shark-hr-l3
out=$1; shift
mkdir -p "$out"
for s in "$@"; do
  bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$s.mts > "$out/$s.txt" 2>&1
  echo "$s exit=$? $(grep -E '^=====|passed [0-9]+/' "$out/$s.txt" | tail -1)" >> "$out/summary.txt"
done
echo DONE >> "$out/summary.txt"
