#!/usr/bin/env bash
cd /root/projects/shark-hr-c || exit 9
env WO=h4.1 /usr/bin/bash /root/projects/shark-hr-c/ledger/hr-ctl/postmerge.sh
for s in qc-hr-h4.4 qc-hr-h2.7 qc-hr-leave-booking qc-booking-hours-hr qc-hf-hr-privacy qc-hr-h2.3; do bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$s.mts > /tmp/hr-ctl/pm-h4.1/$s.log 2>&1; echo "$s exit=$? $(grep -a -E 'JSON_SUMMARY' /tmp/hr-ctl/pm-h4.1/$s.log | tail -1 | cut -c1-160)" >> ledger/wo-notes/hr-H4.1-postmerge.txt; done
rm -rf .next/types; env NODE_OPTIONS=--max-old-space-size=12288 ISO_MEM=14000M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck > /tmp/hr-ctl/pm-h4.1/tsc.log 2>&1; echo "typecheck exit=$? errors=$(grep -c 'error TS' /tmp/hr-ctl/pm-h4.1/tsc.log)" >> ledger/wo-notes/hr-H4.1-postmerge.txt
echo "EXTRADONE" >> ledger/wo-notes/hr-H4.1-postmerge.txt
