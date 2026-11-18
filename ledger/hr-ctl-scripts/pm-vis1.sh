#!/usr/bin/env bash
cd /root/projects/shark-hr-c || exit 9
O=ledger/wo-notes/hr-VIS-1-postmerge.txt; echo "# VIS-1 postmerge session/hr @$(git rev-parse --short HEAD) $(date -u +%FT%TZ)" >> $O
bash scripts/iso.sh pnpm exec prisma generate > /tmp/hr-ctl/pm-vis1/gen.log 2>&1
for s in seed-hr-qc qc-hr-h4.4 qc-hr-h2.4 qc-hr-h2.5 qc-hr-h1.2 qc-hr-h4.1 qc-hr-h2.7 qc-hr-h0.5 qc-hf-hr-privacy; do bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$s.mts > /tmp/hr-ctl/pm-vis1/$s.log 2>&1; echo "$s exit=$? $(grep -a -E 'JSON_SUMMARY' /tmp/hr-ctl/pm-vis1/$s.log | tail -1 | cut -c1-140)" >> $O; done
bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/fitness-hr.mts > /tmp/hr-ctl/pm-vis1/fit.log 2>&1; echo "fitness-hr env exit=$?" >> $O
echo EXTRADONE >> $O
