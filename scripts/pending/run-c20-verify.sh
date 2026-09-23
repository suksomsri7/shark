#!/usr/bin/env bash
# C2.0 controller verification — main tree = HEAD (C1.11 02ba30bc) + C2.0 · QC1 (crm_v2_b + ai_credit_crm_assist deployed)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c20-verify.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "migrate diff (must be empty)" bash scripts/qc-prisma.sh migrate diff --from-config-datasource --to-schema prisma/schema --script
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed acc-v2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-acc-v2-qc.mts
for g in dashboard contacts contact-profile; do r "exp $g" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/acc-v2-expected-$g.mts; done
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
q qc-crm-c2.0
for s in qc-form qc-forms-notify qc-marketing qc-member-m1.2 qc-crm-c1.1 qc-crm-c1.2a qc-crm-c1.2b qc-crm-c1.3 qc-crm-c1.4 qc-crm-c1.5 qc-crm-c1.6 qc-crm-c1.7 qc-crm-c1.8 qc-crm-c1.9 qc-crm-c1.10 qc-crm-c1.11 qc-crm-v1 qc-acc-v2-inbox qc-chat-ai-suggest qc-chat-translate qc-automation qc-account-api-keys qc-crm-c0.2; do q "$s"; done
r "probe-uiversion-gate (no env)" env -u CRM_V2_SWITCH bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-uiversion-gate.mts
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=4096 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
q qc-member-m3.10
r "serve stop"    bash scripts/acc-v2-serve.sh stop
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
