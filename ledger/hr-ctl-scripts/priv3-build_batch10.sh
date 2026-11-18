#!/usr/bin/env bash
R=/tmp/hr-ctl/priv3-build/run.sh
for i in 1 2 3; do $R j-priv3-f$i qc-hr-priv-3.mts; $R j-priv3b-f$i qc-hr-priv-3b.mts; done
$R j-priv3-u qc-hr-priv-3.mts 0; $R j-priv3b-u qc-hr-priv-3b.mts 0
for s in qc-hr-preprod-1 qc-hr-preprod-1b qc-hr-preprod-1c qc-hr-leave-3 qc-hr-leave-3b qc-hr-money-2 qc-hr-priv-2 qc-hr-hf-sso qc-hf-hr-privacy qc-hr-h0.6 qc-hr-h0.7 qc-hr-h1.3 qc-hr-h2.4 qc-hr-h2.9 qc-hr-h2.10 qc-hr-h3.3 qc-hr-h3.4 qc-hr-h3.4-ytd qc-hr-h3.5 qc-hr-h3.6 qc-hr-h3.7 qc-hr-h3.8 qc-hr-h3.9 qc-hr-h4.3 qc-hr-h4.8 qc-approval qc-payroll qc-payroll-reverse qc-hr-payadjust qc-audit-trail qc-hr qc-hr-leave-booking fitness-hr fitness; do $R j-$s $s.mts; done
cd /root/projects/shark-hr-l5 && for s in fitness-hr fitness; do timeout 900 bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/$s.mts > /tmp/hr-ctl/priv3-build/logs/j-nodb-$s.log 2>&1; echo "j-nodb-$s rc=$? $(grep JSON_SUMMARY /tmp/hr-ctl/priv3-build/logs/j-nodb-$s.log | cut -c1-120)" >> /tmp/hr-ctl/priv3-build/summary.txt; done
timeout 600 bash scripts/iso.sh bash scripts/qc-hr.sh pnpm drift > /tmp/hr-ctl/priv3-build/logs/j-drift.log 2>&1; echo "j-drift rc=$?" >> /tmp/hr-ctl/priv3-build/summary.txt
echo BATCH10-DONE >> /tmp/hr-ctl/priv3-build/summary.txt
