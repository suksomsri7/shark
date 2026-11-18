#!/usr/bin/env bash
R=/tmp/hr-ctl/priv3-build/run.sh
for i in 1 2 3; do $R e-priv3-f$i qc-hr-priv-3.mts; $R e-priv3b-f$i qc-hr-priv-3b.mts; done
$R e-priv3-u qc-hr-priv-3.mts 0; $R e-priv3b-u qc-hr-priv-3b.mts 0
cd /root/projects/shark-hr-l5 && for s in fitness-hr fitness; do timeout 900 bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/$s.mts > /tmp/hr-ctl/priv3-build/logs/e-nodb-$s.log 2>&1; echo "e-nodb-$s rc=$? $(grep JSON_SUMMARY /tmp/hr-ctl/priv3-build/logs/e-nodb-$s.log | cut -c1-120)" >> /tmp/hr-ctl/priv3-build/summary.txt; done
echo BATCH6-DONE >> /tmp/hr-ctl/priv3-build/summary.txt
