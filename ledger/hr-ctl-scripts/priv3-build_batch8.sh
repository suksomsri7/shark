#!/usr/bin/env bash
R=/tmp/hr-ctl/priv3-build/run.sh
for s in qc-hr-priv-3 qc-hr-priv-3b qc-hr-preprod-1 qc-hr-preprod-1b qc-hr-preprod-1c qc-hr-leave-3 qc-hr-leave-3b qc-hr-money-2 qc-hr-priv-2 qc-hr-hf-sso qc-hf-hr-privacy qc-hr-h0.6 qc-hr-h1.3 qc-hr-h2.4 qc-hr-h2.10 qc-hr-h3.8 qc-hr-h3.9 qc-hr-h4.3 qc-approval qc-payroll qc-payroll-reverse qc-hr-payadjust fitness-hr fitness; do $R g-$s $s.mts; done
cd /root/projects/shark-hr-l5 && for s in fitness-hr fitness; do timeout 900 bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/$s.mts > /tmp/hr-ctl/priv3-build/logs/g-nodb-$s.log 2>&1; echo "g-nodb-$s rc=$? $(grep JSON_SUMMARY /tmp/hr-ctl/priv3-build/logs/g-nodb-$s.log | cut -c1-120)" >> /tmp/hr-ctl/priv3-build/summary.txt; done
echo BATCH8-DONE >> /tmp/hr-ctl/priv3-build/summary.txt
