#!/usr/bin/env bash
# H4.2 builder regression runner (scratch) — sequential, lane wrapper
cd /root/projects/shark-hr-b
O=scratchpad/h42/r2
W="bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh"
run() { # name forced(1/0) tag
  local n=$1 f=$2 tag=${3:-}
  local out=$O/$n${tag}.txt
  if [ "$f" = 1 ]; then timeout 1800 $W env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$n.mts > $out 2>&1
  else timeout 1800 $W env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$n.mts > $out 2>&1; fi
  local ec=$?
  echo "$n$tag exit=$ec $(grep -E '^=====|passed [0-9]+/[0-9]+|SKIPPED' $out | tail -1)" >> $O/SUMMARY.txt
}
: > $O/SUMMARY.txt
for s in "$@"; do
  case $s in
    h42x3) run qc-hr-h4.2 1 -f1; run qc-hr-h4.2 1 -f2; run qc-hr-h4.2 0 -u;;
    *) run $s 1;;
  esac
done
echo DONE >> $O/SUMMARY.txt
