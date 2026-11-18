#!/usr/bin/env bash
cd /root/projects/shark-hr-l3; L=/tmp/hr-ctl/vis5a-build/logs; S=/tmp/hr-ctl/vis5a-build/f.log; : > $S
R="bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7"
for i in 2 3 4; do timeout 2400 $R QC_FORCE=1 pnpm exec tsx scripts/qc-hr-vis-5a.mts > $L/f-$i.log 2>&1; echo "vis5a-forced-$i $(grep -E '^=====|RESIDUE' $L/f-$i.log | tr '\n' ' ') $(grep '❌' $L/f-$i.log | cut -c1-200 | tr '\n' ' ')" >> $S; done
timeout 2400 $R pnpm exec tsx scripts/qc-hr-vis-5a.mts > $L/f-u.log 2>&1; echo "vis5a-unforced $(grep -E '^=====|RESIDUE' $L/f-u.log | tr '\n' ' ')" >> $S
for n in qc-hr-h3.4 qc-hr-h3.4-ytd qc-hr-h3.6 qc-hr-h3.7 qc-hr-h3.8 qc-hr-priv-2 qc-hf-hr-privacy; do timeout 2400 $R QC_FORCE=1 pnpm exec tsx scripts/$n.mts > $L/f-$n.log 2>&1; echo "$n $(grep -E '^=====|^ผ่าน' $L/f-$n.log | tr '\n' ' ') $(grep '❌' $L/f-$n.log | cut -c1-250 | tr '\n' ' ')" >> $S; done
timeout 1200 bash scripts/iso.sh bash scripts/qc-hr.sh pnpm exec tsx scripts/fitness.mts > $L/f-fit.log 2>&1; echo "fitness-env $(grep JSON_SUMMARY $L/f-fit.log)" >> $S
timeout 1200 bash scripts/iso.sh bash scripts/qc-hr.sh pnpm exec tsx scripts/fitness-hr.mts > $L/f-fithr.log 2>&1; echo "fitness-hr-env $(grep JSON_SUMMARY $L/f-fithr.log)" >> $S
timeout 1200 bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness.mts > $L/f-fit0.log 2>&1; echo "fitness-noenv $(grep JSON_SUMMARY $L/f-fit0.log)" >> $S
timeout 1200 bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness-hr.mts > $L/f-fithr0.log 2>&1; echo "fitness-hr-noenv $(grep JSON_SUMMARY $L/f-fithr0.log)" >> $S
echo FDONE >> $S
