#!/usr/bin/env bash
cd /root/projects/shark-hr-c || exit 9
env WO=h4.4 /usr/bin/bash /root/projects/shark-hr-c/ledger/hr-ctl/postmerge.sh
for s in qc-hr-h0.5 qc-hr-h1.2 qc-hr-h1.3 qc-hr-h2.1 qc-hr-h2.2 qc-hr-h2.4 qc-hr-h2.7 qc-hf-hr-privacy; do bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$s.mts > /tmp/hr-ctl/pm-h4.4/$s.log 2>&1; echo "$s exit=$? $(grep -a -E 'JSON_SUMMARY' /tmp/hr-ctl/pm-h4.4/$s.log | tail -1 | cut -c1-200)" >> ledger/wo-notes/hr-H4.4-postmerge.txt; done
echo "EXTRADONE" >> ledger/wo-notes/hr-H4.4-postmerge.txt
