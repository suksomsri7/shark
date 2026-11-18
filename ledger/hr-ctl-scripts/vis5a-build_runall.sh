#!/usr/bin/env bash
# scratch: run the VIS-5a run list sequentially (lane 3) — summary lines into /tmp/hr-ctl/vis5a-build/runall.log
cd /root/projects/shark-hr-l3
L=/tmp/hr-ctl/vis5a-build/logs; mkdir -p $L; S=/tmp/hr-ctl/vis5a-build/runall.log; : > $S
for n in "$@"; do
  timeout 2400 bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$n.mts > $L/$n.log 2>&1
  echo "$n exit=$? $(grep -E '=====|BASE-EXP' $L/$n.log | tail -2 | tr '\n' ' ' | cut -c1-300)" >> $S
done
echo ALLDONE >> $S
