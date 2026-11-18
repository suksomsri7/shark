#!/usr/bin/env bash
cd /root/projects/shark-hr-c || exit 9
env WO=h4.6 /usr/bin/bash /root/projects/shark-hr-c/ledger/hr-ctl/postmerge.sh
for s in qc-hr-h2.9 qc-hr-h1.3 qc-hr-h0.1 qc-hr-h0.6 qc-hr-h4.4 qc-payroll qc-payroll-reverse qc-hr-payadjust qc-inventory qc-inventory-item qc-hf-inventory-atomic qc-pos-p2.3 qc-hf-hr-privacy; do bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$s.mts > /tmp/hr-ctl/pm-h4.6/$s.log 2>&1; echo "$s exit=$? $(grep -a -E 'JSON_SUMMARY' /tmp/hr-ctl/pm-h4.6/$s.log | tail -1 | cut -c1-140)" >> ledger/wo-notes/hr-H4.6-postmerge.txt; done
bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness.mts > /tmp/hr-ctl/pm-h4.6/fit.log 2>&1; echo "fitness noenv exit=$?" >> ledger/wo-notes/hr-H4.6-postmerge.txt
echo EXTRADONE >> ledger/wo-notes/hr-H4.6-postmerge.txt
