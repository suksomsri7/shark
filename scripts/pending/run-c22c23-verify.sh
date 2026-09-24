#!/usr/bin/env bash
# C2.2 + C2.3 controller verification (Fable · 24 ก.ย.) — main tree = C2.1 accepted + C2.2 r2 + C2.3 r2 applied · QC1
# NO extra flock around build: with-gate-lock already holds gate→qc2→qc3 for heavy work (24 Sep deadlock lesson)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c22c23-verify.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "migrate diff (must be empty)" bash scripts/qc-prisma.sh migrate diff --from-config-datasource --to-schema prisma/schema --script
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
# 🔴 m1.1 reruns seed-member-qc itself (wipes CRM rows) — only legal slot: after member reseed, before CRM seed
r "qc-member-m1.1" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.1.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
q qc-crm-c2.2
q qc-crm-c2.3
for s in qc-crm-c2.1 qc-crm-c0.5 qc-member-fix-s3 qc-automation qc-crm-c1.4 qc-crm-c1.6 qc-crm-c1.7 qc-crm-c1.8 qc-crm-c1.11 qc-crm-c2.0 qc-crm-v1 qc-crm-c0.2 qc-hr-leave-booking qc-form qc-forms-notify; do q "$s"; done
r "qc-nav-functions" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-nav-functions.mts
r "probe-uiversion-gate (no env)" env -u CRM_V2_SWITCH bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-uiversion-gate.mts
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=4096 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
r "shots 2.2"     bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 2.2
r "shots 2.3"     bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 2.3
r "serve stop"    bash scripts/acc-v2-serve.sh stop
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
