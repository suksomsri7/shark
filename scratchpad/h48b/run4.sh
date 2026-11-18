#!/usr/bin/env bash
# H4.8 builder regression runner — sequential, lane DB wrapper only
cd /root/projects/shark-hr-l4
OUT=scratchpad/h48b/r4
mkdir -p $OUT
run() { # name forced(1/0) script
  local name=$1 forced=$2 script=$3
  local f=$OUT/$name.txt
  if [ "$forced" = 1 ]; then
    timeout 3600 bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$script > $f 2>&1
  else
    timeout 3600 bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$script > $f 2>&1
  fi
  local ec=$?
  echo "$name exit=$ec $(grep -aE '===== .* =====|SKIPPED|passed [0-9]+/' $f | tail -1)" >> $OUT/SUMMARY.txt
}
for s in "$@"; do
  IFS=: read -r name forced script <<< "$s"
  run "$name" "$forced" "$script"
done
echo DONE >> $OUT/SUMMARY.txt
