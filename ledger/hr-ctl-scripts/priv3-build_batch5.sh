#!/usr/bin/env bash
R=/tmp/hr-ctl/priv3-build/run.sh
for s in qc-payroll qc-payroll-reverse qc-hr-payadjust qc-audit-trail qc-hf-hr-privacy qc-hr-priv-2 qc-hr-money-2 qc-hr-hf-sso qc-hr-h0.6 qc-hr-h0.7 qc-hr-h1.3 qc-hr-h2.3 qc-hr-h2.4 qc-hr-h2.6 qc-hr-h2.9 qc-hr-h3.3 qc-hr-h3.4 qc-hr-h3.5 qc-hr-h3.6 qc-hr-h3.7 qc-hr-h3.8 qc-hr-h4.3 qc-hr-h4.8 qc-hr qc-hr-leave-booking fitness-hr fitness; do $R d-$s $s.mts; done
echo BATCH5-DONE >> /tmp/hr-ctl/priv3-build/summary.txt
