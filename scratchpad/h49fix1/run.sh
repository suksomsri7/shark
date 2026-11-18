#!/bin/bash
cd /root/projects/shark-hr-l3
O=scratchpad/h49fix1/r2; mkdir -p $O
for s in qc-hr-h4.3 qc-hr-priv-2 qc-hr-money-2 qc-hr-hf-sso qc-hr-h1.3 qc-hr-h2.4 qc-ai-skills qc-pages qc-nav-functions fitness fitness-hr; do
  timeout 2400 bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$s.mts > $O/$s.log 2>&1
  echo "$s exit=$?" >> $O/results.txt
done
for s in fitness fitness-hr; do
  timeout 2400 bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env -u DATABASE_URL -u DIRECT_URL QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$s.mts > $O/$s-nodb.log 2>&1
  echo "$s-nodb exit=$?" >> $O/results.txt
done
echo DONE >> $O/results.txt
