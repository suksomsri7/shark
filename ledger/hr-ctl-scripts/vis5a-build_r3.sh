#!/usr/bin/env bash
cd /root/projects/shark-hr-l3; L=/tmp/hr-ctl/vis5a-build/logs; S=/tmp/hr-ctl/vis5a-build/r3.log; : > $S
R="bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7"
for i in 2 3; do timeout 2400 $R QC_FORCE=1 pnpm exec tsx scripts/qc-hr-vis-5a.mts > $L/r3-f$i.log 2>&1; echo "vis5a-f$i $(grep -E '^=====|RESIDUE' $L/r3-f$i.log | tr '\n' ' ')" >> $S; done
timeout 2400 $R pnpm exec tsx scripts/qc-hr-vis-5a.mts > $L/r3-u.log 2>&1; echo "vis5a-unforced $(grep -E '^=====|RESIDUE' $L/r3-u.log | tr '\n' ' ')" >> $S
for n in qc-hr-h3.4 qc-hr-h3.4-ytd qc-hr-h3.6 qc-hr-h3.8 qc-hr-priv-2; do timeout 2400 $R QC_FORCE=1 pnpm exec tsx scripts/$n.mts > $L/r3-$n.log 2>&1; echo "$n $(grep -E '^=====' $L/r3-$n.log) $(grep '❌' $L/r3-$n.log | cut -c1-200 | tr '\n' ' ')" >> $S; done
timeout 1200 bash scripts/iso.sh bash scripts/qc-hr.sh pnpm exec tsx scripts/fitness.mts > $L/r3-fit.log 2>&1; echo "fitness-env $(grep JSON_SUMMARY $L/r3-fit.log)" >> $S
timeout 1200 bash scripts/iso.sh bash scripts/qc-hr.sh pnpm exec tsx scripts/fitness-hr.mts > $L/r3-fithr.log 2>&1; echo "fitness-hr-env $(grep JSON_SUMMARY $L/r3-fithr.log)" >> $S
timeout 1200 bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness.mts > $L/r3-fit0.log 2>&1; echo "fitness-noenv $(grep JSON_SUMMARY $L/r3-fit0.log)" >> $S
timeout 1200 bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness-hr.mts > $L/r3-fithr0.log 2>&1; echo "fitness-hr-noenv $(grep JSON_SUMMARY $L/r3-fithr0.log)" >> $S
echo R3DONE >> $S
