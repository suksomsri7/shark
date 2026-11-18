#!/usr/bin/env bash
cd /root/projects/shark-hr-c || exit 9
env WO=h2.9 /usr/bin/bash /root/projects/shark-hr-c/ledger/hr-ctl/postmerge.sh
for s in qc-hr-h2.6 qc-hr-h2.5 qc-hr-h1.3 qc-hr-h0.1 qc-hr-h0.2 qc-hr-h0.6 qc-hr-h3.3 qc-hr-h4.4 qc-hr-h2.7 qc-payroll qc-payroll-reverse qc-hr-payadjust qc-crm-c3.3 qc-hf-hr-privacy; do bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$s.mts > /tmp/hr-ctl/pm-h2.9/$s.log 2>&1; echo "$s exit=$? $(grep -a -E 'JSON_SUMMARY' /tmp/hr-ctl/pm-h2.9/$s.log | tail -1 | cut -c1-140)" >> ledger/wo-notes/hr-H2.9-postmerge.txt; done
echo EXTRADONE >> ledger/wo-notes/hr-H2.9-postmerge.txt
