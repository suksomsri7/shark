#!/usr/bin/env bash
# C1.10 controller verification — main tree = HEAD (C1.9 b01b3b72) + C1.10 · QC1
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c110-verify.log
: > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
q qc-crm-c1.10
q qc-member-m1.9
for s in qc-crm-c1.9 qc-crm-c1.8 qc-crm-c1.7 qc-crm-c1.6 qc-crm-c1.5 qc-crm-c1.4 qc-crm-c1.3 qc-crm-c1.2b qc-crm-c1.2a qc-crm-c1.1 qc-crm-c0.2 qc-crm-c0.3 qc-crm-c0.4 qc-crm qc-crm-activity qc-ai-tools qc-account-api-keys qc-account-api-core qc-account-api-webhooks qc-account-api-write-docs qc-form qc-forms-notify qc-member-m1.4 qc-member-fix-s1 qc-member-fix-s2 qc-member-public qc-acc-v2-permissions qc-chat-member-autolink qc-kanban-k3.1 qc-approval qc-automation qc-webhook; do q "$s"; done
for p in probe-c110-review probe-c19-review probe-c18-review probe-c17-review probe-uiversion-gate; do r "$p" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/$p.mts; done
q qc-member-m1.9
r "gen-crm-api-docs --check" pnpm exec tsx scripts/gen-crm-api-docs.mts --check
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=4096 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
for u in owner manager; do r "shots $u" pnpm exec tsx scripts/visual-crm.mts 1.10 --user $u; done
r "shots 1.9 owner" pnpm exec tsx scripts/visual-crm.mts 1.9 --user owner
r "serve stop"    bash scripts/acc-v2-serve.sh stop
echo ALLDONE | tee -a "$L"
