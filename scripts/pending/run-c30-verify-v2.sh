#!/usr/bin/env bash
# C3.0 verify round 2 (Fable · 26 ก.ย.) — reruns the suites that died in round 1 because a sibling worktree regenerated the SHARED
# prisma client without the C3 models (scope.ts registry ≠ client ⇒ db.ts refuses to boot). Client regenerated from the main tree.
# QC1 · no reseed (round 1 seeded) · launch with the ABSOLUTE path.
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c30-verify-v2.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "client has C3 models" grep -c CrmQuota node_modules/.pnpm/@prisma+client@7.8.0_prisma@7.8.0_@types+react-dom@19.2.3_@types+react@19.2.17__@types+_12a6afd4e8168cdd815b06207f03ccf9/node_modules/.prisma/client/index.d.ts
r "DRAIN" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
for s in qc-crm-c3.0 qc-crm-c3.1 qc-crm-c1.3 qc-crm-c1.4 qc-crm-c1.5 qc-crm-c1.6 qc-crm-c1.7 qc-crm-c1.8 qc-crm-c1.9 qc-crm-c1.10 qc-crm-c1.11 qc-crm-c2.1 qc-crm-c2.2 qc-crm-c2.3 qc-crm-c2.4 qc-crm-c2.5 qc-crm-c2.6 qc-crm-c2.7 qc-crm-c2.8 qc-crm-c2.9 qc-crm-c2.10 qc-crm-c2.11 qc-crm-c0.2 qc-crm-c0.5 qc-crm-v1 qc-pages qc-cron; do q "$s"; done
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL -u DIRECT_URL pnpm fitness
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
