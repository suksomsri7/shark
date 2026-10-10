#!/usr/bin/env bash
# controller: cheque/ai-skill suites on QC1 (has acc-v2 seed) — baseline = main tree (r5) vs c54c (r6) · 28 Sep
set -uo pipefail
M=/root/projects/shark-crm; C=/root/projects/shark-crm-c54c
L=$M/.qc-shots/crm/c54c-r6-cheque.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' $M/.env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' $M/.env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1" >> "$L"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
cp $C/scripts/acc-v2-expected.json $M/.qc-shots/acc-v2-expected.c54c.bak
cp $M/scripts/acc-v2-expected.json $C/scripts/acc-v2-expected.json
for tree in $M $C; do for s in qc-acc-v2-wht-cheque qc-account-api-ai-skill qc-cheque-audit; do
  echo "== $tree $s ==" >> "$L"; (cd $tree && bash scripts/with-gate-lock.sh pnpm exec tsx scripts/$s.mts) >> "$L" 2>&1; echo "exit=$?" >> "$L"
done; done
cp $M/.qc-shots/acc-v2-expected.c54c.bak $C/scripts/acc-v2-expected.json
echo ALLDONE >> "$L"
