#!/usr/bin/env bash
# C1.5 controller verification — main tree = HEAD (C1.4) + C1.5
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c18-verify2.log
: > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
q qc-crm-c1.8
q qc-member-m1.9
for s in qc-crm-c1.7 qc-crm-c1.6 qc-crm-c1.5 qc-crm-c1.4 qc-crm-c1.3 qc-crm-c1.2b qc-crm-c1.2a qc-crm-c1.1 qc-crm-c0.2 qc-crm-c0.3 qc-crm qc-crm-activity qc-acc-v2-party qc-acc-v2-contacts qc-acc-v2-contact-merge qc-nav-functions qc-form qc-forms-notify qc-ai-tools qc-member-m1.2 qc-member-m1.4 qc-member-m1.5 qc-member-m1.6 qc-member-m1.7 qc-member-m1.8 qc-member-m1.12 qc-member-m3.9 qc-member-m3.2 qc-member-fix-s1 qc-member-fix-s2 qc-member-public qc-acc-v2-permissions qc-chat-member-autolink qc-chat-core-v2 qc-account-api-webhooks qc-member-m2.8 qc-member-m3.7 qc-crm-c0.4 qc-kanban-k1.5 qc-kanban-k1.9 qc-kanban-k1.15 qc-kanban-k3.1 qc-kanban-k3.3 qc-kanban-k3.7 qc-kanban-notify qc-acc-v2-editor qc-account-api-write-docs qc-approval qc-approval-edit qc-approval-wiring qc-automation qc-webhook; do q "$s"; done
q qc-member-m1.9
r "gen-kanban-docs" pnpm exec tsx scripts/gen-kanban-api-docs.mts
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=4096 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL pnpm fitness
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
for u in owner thana nok manager; do r "shots $u" pnpm exec tsx scripts/visual-crm.mts 1.4 --user $u; done
r "probe-c16-review" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c16-review.mts
r "probe-c15-review" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c15-review.mts
r "probe-c14-review" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c14-review.mts
r "probe-c17-review" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c17-review.mts
r "probe-c18-review" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c18-review.mts
r "probe-uiversion-gate" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-uiversion-gate.mts
r "shots 1.6 owner" pnpm exec tsx scripts/visual-crm.mts 1.6 --user owner
r "shots 1.3 owner" pnpm exec tsx scripts/visual-crm.mts 1.3 --user owner
r "serve stop"    bash scripts/acc-v2-serve.sh stop
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
