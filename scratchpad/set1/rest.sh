#!/bin/bash
cd /root/projects/shark-hr-b
S=scratchpad/set1/run.sh
for x in qc-hr-h3.1 qc-hr-h2.9 qc-hr-h2.5 qc-hr-h1.1 qc-payroll qc-payroll-reverse qc-hr-payadjust qc-audit-trail qc-account-cpa; do $S $x $x; done
for f in fitness fitness-hr; do
  bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/$f.mts > scratchpad/set1/$f-env.log 2>&1; echo "$f env exit $? :: $(tail -2 scratchpad/set1/$f-env.log | tr '\n' ' ' | cut -c1-200)"
  bash scripts/iso.sh bash scripts/with-gate-lock.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/$f.mts > scratchpad/set1/$f-noenv.log 2>&1; echo "$f noenv exit $? :: $(tail -2 scratchpad/set1/$f-noenv.log | tr '\n' ' ' | cut -c1-200)"
done
echo REST-DONE
