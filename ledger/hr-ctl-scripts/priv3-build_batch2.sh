#!/usr/bin/env bash
R=/tmp/hr-ctl/priv3-build/run.sh
for s in qc-hr-priv-2 qc-hr-h3.8 qc-hr-h3.9 qc-hr-h4.3 qc-hr-h2.10 qc-hr-h2.11 qc-hr-h4.8 qc-hr-h1.1 qc-hr-h2.5 qc-hr-h4.5 fitness-hr fitness; do $R b2-$s $s.mts; done
$R b2-priv3-f2 qc-hr-priv-3.mts
$R b2-priv3-f3 qc-hr-priv-3.mts
$R b2-priv3-f4 qc-hr-priv-3.mts
$R b2-priv3-unforced qc-hr-priv-3.mts 0
echo BATCH2-DONE >> /tmp/hr-ctl/priv3-build/summary.txt
