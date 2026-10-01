#!/usr/bin/env bash
# controller: main gate for C5.4-N (patch c54c 63ea9f45..544d4cf6) — main account src byte-identical to c54c (QC2 regression there: builder 36/36 + reviewer reruns) · here: typecheck · docs ×4 · fitness ×2 · migrate deploy on QC1 (additive) · QC1 cheque suites
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-n.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1" >> "$L"; exit 1;; esac
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness env DATABASE_URL="$P" DIRECT_URL="$D" pnpm fitness
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r "QC1 migrate status (before)" bash scripts/qc-prisma.sh migrate status
r "QC1 migrate deploy" bash scripts/qc-prisma.sh migrate deploy
r "QC1 migrate status (after)" bash scripts/qc-prisma.sh migrate status
for s in qc-acc-v2-wht-cheque qc-account-api-ai-skill qc-cheque-audit qc-acc-v2-payments; do r "QC1 $s" env DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$s.mts"; done
echo ALLDONE >> "$L"
