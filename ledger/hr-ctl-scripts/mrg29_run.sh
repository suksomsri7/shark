#!/usr/bin/env bash
cd /root/projects/shark-hr-l3 || exit 9
O=/tmp/hr-ctl/mrg29/out.txt; : > $O
bash scripts/iso.sh pnpm exec prisma generate > /tmp/hr-ctl/mrg29/gen.log 2>&1; echo "generate exit=$?" >> $O
bash scripts/iso.sh bash scripts/qc-hr.sh pnpm exec prisma migrate deploy > /tmp/hr-ctl/mrg29/mig.log 2>&1; echo "migrate exit=$? $(tail -1 /tmp/hr-ctl/mrg29/mig.log)" >> $O
i=0; for s in seed-hr-qc seed-hr-qc qc-hr-h2.9 qc-hr-h2.6 qc-hr-h2.5 qc-hr-h1.3 qc-hr-h0.1 qc-hr-h3.3 qc-hr-h4.4 qc-payroll qc-payroll-reverse qc-hr-payadjust qc-hf-hr-privacy; do i=$((i+1)); l=/tmp/hr-ctl/mrg29/$i-$s.log; bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$s.mts > $l 2>&1; echo "$s exit=$? $(grep -a JSON_SUMMARY $l | tail -1 | cut -c1-130)" >> $O; done
for m in noenv env; do l=/tmp/hr-ctl/mrg29/fit-$m.log; if [ $m = noenv ]; then bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness-hr.mts > $l 2>&1; else bash scripts/iso.sh bash scripts/qc-hr.sh pnpm exec tsx scripts/fitness-hr.mts > $l 2>&1; fi; echo "fitness-hr $m exit=$?" >> $O; done
bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness.mts > /tmp/hr-ctl/mrg29/fitall.log 2>&1; echo "fitness noenv exit=$?" >> $O
rm -rf .next/types; env NODE_OPTIONS=--max-old-space-size=12288 ISO_MEM=14000M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck > /tmp/hr-ctl/mrg29/tsc.log 2>&1; echo "typecheck exit=$? errors=$(grep -c 'error TS' /tmp/hr-ctl/mrg29/tsc.log)" >> $O
echo MRGDONE >> $O
