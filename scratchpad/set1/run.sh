#!/bin/bash
# usage: run.sh <logname> <suite> [unforced]
cd /root/projects/shark-hr-b
L=scratchpad/set1/$1.log; S=$2
if [ "$3" = unforced ]; then F=""; else F="QC_FORCE=1"; fi
bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env $F QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$S.mts > $L 2>&1
e=$?; echo "exit $e" >> $L
echo "$1: $(grep -E '^===== ' $L | tail -1) exit $e"
