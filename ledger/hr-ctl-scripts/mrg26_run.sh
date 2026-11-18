#!/usr/bin/env bash
cd /root/projects/shark-hr-b || exit 9
O=/tmp/hr-ctl/mrg26/out.txt; : > $O
bash scripts/iso.sh pnpm exec prisma generate > /tmp/hr-ctl/mrg26/gen.log 2>&1; echo "generate exit=$?" >> $O
bash scripts/iso.sh bash scripts/qc-hr.sh pnpm exec prisma migrate deploy > /tmp/hr-ctl/mrg26/mig.log 2>&1; echo "migrate exit=$? $(tail -1 /tmp/hr-ctl/mrg26/mig.log)" >> $O
i=0; for s in seed-hr-qc seed-hr-qc qc-hr-h2.5 qc-hr-h4.4 qc-hr-h1.2 qc-hr-h1.3 qc-hr-h2.7; do i=$((i+1)); l=/tmp/hr-ctl/mrg26/$i-$s.log; bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$s.mts > $l 2>&1; echo "$s exit=$? $(grep -a JSON_SUMMARY $l | tail -1 | cut -c1-150)" >> $O; done
for m in noenv env; do l=/tmp/hr-ctl/mrg26/fit-$m.log; if [ $m = noenv ]; then bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness-hr.mts > $l 2>&1; else bash scripts/iso.sh bash scripts/qc-hr.sh pnpm exec tsx scripts/fitness-hr.mts > $l 2>&1; fi; echo "fitness-hr $m exit=$? $(grep -a JSON_SUMMARY $l | tail -1 | cut -c1-100)" >> $O; done
rm -rf .next/types; env NODE_OPTIONS=--max-old-space-size=12288 ISO_MEM=14000M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck > /tmp/hr-ctl/mrg26/tsc.log 2>&1; echo "typecheck exit=$? errors=$(grep -c 'error TS' /tmp/hr-ctl/mrg26/tsc.log)" >> $O
echo MRGDONE >> $O
