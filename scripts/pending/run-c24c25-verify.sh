#!/usr/bin/env bash
# C2.4 r2 + C2.5 r2 controller verification (Fable · 24 ก.ย.) — main tree = C2.1–C2.3 accepted + C2.4 + C2.5 applied (staged) · QC1
# NO extra flock around build (with-gate-lock holds gate→qc2→qc3 for heavy work)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c24c25-verify.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "migrate diff (must be empty)" bash scripts/qc-prisma.sh migrate diff --from-config-datasource --to-schema prisma/schema --script
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "qc-member-m1.1" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.1.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
q qc-crm-c2.4
q qc-crm-c2.5
for s in qc-crm-c2.1 qc-crm-c2.2 qc-crm-c2.3 qc-crm-c0.5 qc-crm-c1.4 qc-crm-c1.6 qc-crm-c1.7 qc-crm-c1.8 qc-crm-c1.11 qc-crm-c2.0 qc-crm-v1 qc-crm-c0.2 qc-chat-core-v2 qc-chat-v2-context qc-ai-vision qc-ai-credit qc-ai-proposals qc-kanban-k3.9 qc-kanban-notify qc-member-m3.6 qc-member-fix-s1 qc-member-fix-s3 qc-marketing qc-forms-notify qc-onboarding-drip qc-form qc-hr-leave-booking; do q "$s"; done
r "qc-nav-functions" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-nav-functions.mts
r "probe-uiversion-gate (no env)" env -u CRM_V2_SWITCH bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-uiversion-gate.mts
r "gen-crm-api-docs" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/gen-crm-api-docs.mts
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=4096 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
r "shots 2.4"     bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 2.4
r "shots 2.5"     bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 2.5
r "serve stop"    bash scripts/acc-v2-serve.sh stop
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
