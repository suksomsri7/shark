#!/usr/bin/env bash
# C1.1 controller verification — D11 probe measured right after the WO's own oracle (lesson from C0.5)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c11-verify.log
: > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "migrate status (QC)" bash scripts/qc-prisma.sh migrate status
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
q qc-crm-c1.1
q qc-member-m1.9
for s in qc-crm-c0.2 qc-crm-c0.3 qc-crm-c0.4 qc-crm-c0.5 qc-crm qc-crm-activity; do q "$s"; done
q qc-member-m1.9
for s in qc-member-m1.2 qc-member-m1.3 qc-member-m1.4 qc-member-m1.5 qc-member-m3.9 qc-member-fix-s1; do q "$s"; done
for s in $(ls scripts/qc-booking*.mts scripts/qc-shop*.mts scripts/qc-rental*.mts scripts/qc-queue*.mts scripts/qc-clinic*.mts scripts/qc-ticket*.mts scripts/qc-school*.mts scripts/qc-hotel*.mts | xargs -n1 basename | sed 's/\.mts$//'); do q "$s"; done
for s in qc-kanban-k1.9 qc-kanban-k1.15 qc-kanban-k3.1 qc-kanban-k3.2 qc-kanban-k3.3 qc-kanban-k3.4 qc-kanban-k3.5; do q "$s"; done
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=4096 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL pnpm fitness
r "BUILD"         bash scripts/acc-v2-serve.sh
r "serve stop"    bash scripts/acc-v2-serve.sh stop
echo ALLDONE | tee -a "$L"
