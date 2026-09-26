#!/usr/bin/env bash
# C3.0 controller verification (Fable · 26 ก.ย.) — main tree = C2 accepted + crm_v2_c files copied from c20 · QC1
# launch: systemd-run --unit=crm-c30-verify --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /root/projects/shark-crm/scripts/pending/run-c30-verify.sh
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c30-verify.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "prisma generate" pnpm db:generate
r "migrate status (before)" bash scripts/qc-prisma.sh migrate status
r "migrate deploy QC1" bash scripts/qc-prisma.sh migrate deploy
r "migrate diff (must be empty)" bash scripts/qc-prisma.sh migrate diff --from-config-datasource --to-schema prisma/schema --script
q qc-crm-c3.0
q qc-crm-c3.0
r "gen-crm-api-docs (early · before m1.1)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/gen-crm-api-docs.mts
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "qc-member-m1.1" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.1.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
for s in qc-member-m2.9 qc-member-m3.11 qc-member-fix-s1 qc-payroll qc-payroll-reverse qc-hr-payadjust qc-hr qc-crm-c2.0 qc-crm-c1.1 qc-crm-c1.2a qc-crm-c1.2b qc-crm-c1.3 qc-crm-c1.4 qc-crm-c1.5 qc-crm-c1.6 qc-crm-c1.7 qc-crm-c1.8 qc-crm-c1.9 qc-crm-c1.10 qc-crm-c1.11 qc-crm-c2.1 qc-crm-c2.2 qc-crm-c2.3 qc-crm-c2.4 qc-crm-c2.5 qc-crm-c2.6 qc-crm-c2.7 qc-crm-c2.8 qc-crm-c2.9 qc-crm-c2.10 qc-crm-c2.11 qc-crm-c0.2 qc-crm-c0.5 qc-crm-v1 qc-pages qc-cron; do q "$s"; done
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL -u DIRECT_URL pnpm fitness
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
