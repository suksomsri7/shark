#!/bin/bash
# usage: run.sh <outdir> suite...
cd /root/projects/shark-hr
out=$1; shift
mkdir -p "$out"
for s in "$@"; do
  f="$out/$s.txt"
  timeout 1500 bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$s.mts > "$f" 2>&1
  code=$?
  line=$(grep -E "^=====|passed [0-9]+/[0-9]+" "$f" | tail -1)
  echo "$s exit=$code $line" >> "$out/SUMMARY.txt"
done
echo DONE >> "$out/SUMMARY.txt"
