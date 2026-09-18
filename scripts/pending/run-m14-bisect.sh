#!/usr/bin/env bash
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/m14-bisect.log; : > "$L"
q() { echo "== $1 ==" >>"$L"; bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts" 2>&1 | grep -E "JSON_SUMMARY" | tail -1 >>"$L"; }
for s in qc-member-m1.9 qc-crm-c1.5 qc-crm-c1.4 qc-crm-c1.3 qc-crm-c1.2b qc-crm-c1.2a qc-crm-c1.1 qc-crm-c0.2 qc-crm-c0.3 qc-crm qc-crm-activity qc-acc-v2-party qc-acc-v2-contacts qc-acc-v2-contact-merge qc-nav-functions qc-form qc-forms-notify qc-ai-tools qc-member-m1.2; do q "$s"; q qc-member-m1.4; done
echo ALLDONE >> "$L"
