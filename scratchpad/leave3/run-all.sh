#!/usr/bin/env bash
# HR-LEAVE-3 builder run list (lane 2 DB via qc-hr.sh) — results in scratchpad/leave3/out/<suite>.out + summary.txt
cd "$(dirname "$0")/../.."
OUT=scratchpad/leave3/out; mkdir -p $OUT
SUM=scratchpad/leave3/summary.txt
run() { # name forced? script
  local name=$1 force=$2 s=$3
  local envs="QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7"
  [ "$force" = 1 ] && envs="QC_FORCE=1 $envs"
  timeout 3000 bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env $envs pnpm exec tsx scripts/$s.mts > $OUT/$name.out 2>&1
  local ec=$?
  echo "$name exit=$ec | $(grep -m1 -E '^===== ' $OUT/$name.out) | $(grep -m1 '^RESIDUE' $OUT/$name.out)" >> $SUM
}
for x in "$@"; do n="${x%%:*}"; run "$n" "${x#*:}" "${n%%#*}"; done
