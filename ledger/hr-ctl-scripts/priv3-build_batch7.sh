#!/usr/bin/env bash
R=/tmp/hr-ctl/priv3-build/run.sh
for i in 1 2 3; do $R f-priv3-f$i qc-hr-priv-3.mts; $R f-priv3b-f$i qc-hr-priv-3b.mts; done
$R f-priv3-u qc-hr-priv-3.mts 0; $R f-priv3b-u qc-hr-priv-3b.mts 0
for s in qc-hr-h0.6 qc-hr-h1.3 qc-hr-h3.3 qc-hr-h3.4 qc-hr-h3.7 qc-payroll qc-payroll-reverse qc-hr-priv-2 qc-hr-h4.3 fitness-hr fitness; do $R f-$s $s.mts; done
cd /root/projects/shark-hr-l5 && for s in fitness-hr fitness; do timeout 900 bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/$s.mts > /tmp/hr-ctl/priv3-build/logs/f-nodb-$s.log 2>&1; echo "f-nodb-$s rc=$? $(grep JSON_SUMMARY /tmp/hr-ctl/priv3-build/logs/f-nodb-$s.log | cut -c1-120)" >> /tmp/hr-ctl/priv3-build/summary.txt; done
echo BATCH7-DONE >> /tmp/hr-ctl/priv3-build/summary.txt
