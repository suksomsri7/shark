#!/usr/bin/env bash
R=/tmp/hr-ctl/priv3-build/run.sh
$R seed seed-hr-qc.mts
for s in qc-hf-hr-privacy qc-hr-priv-2 qc-hr-money-2 qc-hr-hf-sso qc-hr-h0.2 qc-hr-h0.6 qc-hr-h0.7 qc-hr-h1.1 qc-hr-h1.2 qc-hr-h1.3 qc-hr-h2.4 qc-hr-h2.5 qc-hr-h2.6 qc-hr-h2.7 qc-hr-h2.9 qc-hr-h2.10 qc-hr-h2.11 qc-hr-h3.1 qc-hr-h3.4 qc-hr-h3.8 qc-hr-h3.9 qc-hr-h4.1 qc-hr-h4.3 qc-hr-h4.4 qc-hr-h4.5 qc-hr-h4.6 qc-hr-h4.8 qc-hr-set-1 qc-hr qc-hr-attendance qc-hr-roster qc-hr-leave-booking qc-payroll qc-pages qc-nav-functions fitness-hr fitness; do
  $R $s $s.mts
done
echo BATCH1-DONE >> /tmp/hr-ctl/priv3-build/summary.txt
