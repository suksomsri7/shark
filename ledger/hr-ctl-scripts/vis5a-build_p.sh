#!/usr/bin/env bash
cd /root/projects/shark-hr-l3; L=/tmp/hr-ctl/vis5a-build/logs; S=/tmp/hr-ctl/vis5a-build/p.log; : > $S
R="bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7"
for i in 2 3; do timeout 2400 $R QC_FORCE=1 pnpm exec tsx scripts/qc-hr-vis-5a.mts > $L/p-$i.log 2>&1; echo "vis5a-forced-$i $(grep -E '^=====|RESIDUE' $L/p-$i.log | tr '\n' ' ') $(grep '❌' $L/p-$i.log | cut -c1-200 | tr '\n' ' ')" >> $S; done
timeout 2400 $R pnpm exec tsx scripts/qc-hr-vis-5a.mts > $L/p-u.log 2>&1; echo "vis5a-unforced $(grep -E '^=====|RESIDUE' $L/p-u.log | tr '\n' ' ')" >> $S
for n in qc-hr-h3.4 qc-hr-h3.6 qc-hr-h3.8 qc-hr-priv-2; do timeout 2400 $R QC_FORCE=1 pnpm exec tsx scripts/$n.mts > $L/p-$n.log 2>&1; echo "$n $(grep -E '^=====' $L/p-$n.log) $(grep '❌' $L/p-$n.log | cut -c1-250 | tr '\n' ' ')" >> $S; done
timeout 1200 bash scripts/iso.sh bash scripts/qc-hr.sh pnpm exec tsx scripts/fitness.mts > $L/p-fit.log 2>&1; echo "fitness-env $(grep JSON_SUMMARY $L/p-fit.log)" >> $S
timeout 1200 bash scripts/iso.sh bash scripts/qc-hr.sh pnpm exec tsx scripts/fitness-hr.mts > $L/p-fithr.log 2>&1; echo "fitness-hr-env $(grep JSON_SUMMARY $L/p-fithr.log)" >> $S
timeout 1200 bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness.mts > $L/p-fit0.log 2>&1; echo "fitness-noenv $(grep JSON_SUMMARY $L/p-fit0.log)" >> $S
timeout 1200 bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness-hr.mts > $L/p-fithr0.log 2>&1; echo "fitness-hr-noenv $(grep JSON_SUMMARY $L/p-fithr0.log)" >> $S
echo PDONE >> $S
