#!/usr/bin/env bash
R=/tmp/hr-ctl/priv3-build/run.sh
for s in qc-hr-h3.9 qc-hr-leave-3 qc-hr-preprod-1 qc-hr-priv-2 qc-hr-h4.3 qc-hr-priv-3; do $R h-$s $s.mts; done
for i in 2 3; do $R h-priv3-f$i qc-hr-priv-3.mts; $R h-priv3b-f$i qc-hr-priv-3b.mts; done
$R h-priv3b-f1 qc-hr-priv-3b.mts
$R h-priv3-u qc-hr-priv-3.mts 0; $R h-priv3b-u qc-hr-priv-3b.mts 0
echo BATCH9-DONE >> /tmp/hr-ctl/priv3-build/summary.txt
