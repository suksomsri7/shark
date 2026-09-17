#!/usr/bin/env bash
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c03-final.log
: > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "seed crm"      bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed acc-v2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-acc-v2-qc.mts
for e in acc-v2-expected-contacts acc-v2-expected-dashboard acc-v2-expected-contact-profile; do q "$e"; done
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
q qc-crm-c0.3
for s in qc-acc-v2-contacts qc-acc-v2-contact-merge qc-acc-v2-contact-profile qc-acc-v2-editor qc-acc-v2-list qc-acc-v2-journal qc-acc-v2-gl-inclvat qc-acc-v2-payments qc-account-deep qc-pos-account qc-approval qc-approval-edit qc-approval-wiring qc-chat-core-v2 qc-chat-member-autolink qc-chat-security-scope qc-payroll qc-hr-payadjust qc-hr qc-inventory qc-inventory-item qc-inventory-account qc-form qc-forms-notify qc-ai-tools qc-member-fix-s2 qc-crm qc-crm-activity; do q "$s"; done
r "typecheck"     bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL pnpm fitness
r "BUILD"         bash scripts/acc-v2-serve.sh
r "serve stop"    bash scripts/acc-v2-serve.sh stop
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
