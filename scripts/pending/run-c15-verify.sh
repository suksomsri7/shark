#!/usr/bin/env bash
# C1.5 controller verification — main tree = HEAD (C1.4) + C1.5
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c15-verify.log
: > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
q qc-crm-c1.5
q qc-member-m1.9
for s in qc-crm-c1.4 qc-crm-c1.3 qc-crm-c1.2b qc-crm-c1.2a qc-crm-c1.1 qc-crm-c0.2 qc-crm-c0.3 qc-crm qc-crm-activity qc-acc-v2-party qc-acc-v2-contacts qc-acc-v2-contact-merge qc-nav-functions qc-form qc-forms-notify qc-ai-tools qc-member-m1.2 qc-member-m1.4 qc-member-m1.5 qc-member-m1.6 qc-member-m1.7 qc-member-m1.8 qc-member-m1.12 qc-member-m3.9 qc-member-m3.6 qc-member-m3.2 qc-member-fix-s1 qc-member-fix-s2 qc-member-public qc-member-m2.8 qc-member-m3.7 qc-kanban-k1.5 qc-kanban-k1.9 qc-kanban-k1.15 qc-kanban-k2.1 qc-kanban-k2.2 qc-kanban-k2.3 qc-kanban-k2.4 qc-kanban-k2.5 qc-kanban-k2.6 qc-kanban-k2.7 qc-kanban-k2.8 qc-kanban-k2.9 qc-kanban-k2.10 qc-kanban-k2.11 qc-kanban-k2.12 qc-kanban-k3.3 qc-acc-v2-editor qc-account-api-write-docs qc-approval qc-approval-edit qc-approval-wiring qc-automation qc-webhook; do q "$s"; done
q qc-member-m1.9
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=4096 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL pnpm fitness
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
for u in owner thana nok manager; do r "shots $u" pnpm exec tsx scripts/visual-crm.mts 1.5 --user $u; done
r "shots 1.3 owner" pnpm exec tsx scripts/visual-crm.mts 1.3 --user owner
r "serve stop"    bash scripts/acc-v2-serve.sh stop
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
