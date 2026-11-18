#!/usr/bin/env bash
R=/tmp/hr-ctl/priv3-build/run.sh
for s in qc-hr-h3.8 qc-hr-priv-3 qc-hr-priv-2 qc-hr-h4.3 qc-hr-h3.9 fitness-hr; do $R b3-$s $s.mts; done
echo BATCH3-DONE >> /tmp/hr-ctl/priv3-build/summary.txt
