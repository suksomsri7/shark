#!/usr/bin/env bash
# controller: MAIN gate for batch C5.4-B (merged on c6fe26d2+) · QC1 suites + C5.3 on QC2 · 28 Sep
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-b.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; echo "exit=$?" >> "$L"; }
r "c5.3 L1,L5 (QC2)" bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c5.3.mts --only=L1,L5
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
for s in qc-crm-c3.9 qc-crm-c3.5 qc-crm-c3.4 qc-crm-c0.2 qc-crm-c1.4 qc-crm-c1.10 qc-crm-c1.11 qc-crm-v1 qc-crm-c2.5 qc-crm-c2.6 qc-crm-c3.8 qc-acc-v2-contact-modal qc-account-api-core qc-kanban-k1.8; do r "$s" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$s.mts"; done
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness pnpm fitness
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
echo ALLDONE >> "$L"
