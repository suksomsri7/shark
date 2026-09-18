#!/usr/bin/env bash
# C1.3 controller verification — main tree = HEAD + C1.3 (C1.4 builder works in shark-crm-c12a)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c13-verify.log
: > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "sync expected→c12a (C1.4 builder)" cp scripts/member-expected.json scripts/crm-expected.json /root/projects/shark-crm-c12a/scripts/
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
q qc-crm-c1.3
q qc-crm-c0.2
q qc-member-m1.9
r "probe-c13-review" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c13-review.mts
for s in qc-crm-c1.2b qc-crm-c1.2a qc-crm-c1.1 qc-crm-c0.2 qc-crm-c0.3 qc-crm qc-crm-activity qc-acc-v2-party qc-acc-v2-contacts qc-acc-v2-contact-merge qc-nav-functions qc-member-m1.2 qc-member-m1.4 qc-member-fix-s1 qc-form qc-ai-tools; do q "$s"; done
q qc-member-m1.9
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=4096 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL pnpm fitness
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/acc-v2-serve.sh
for u in owner thana manager nok; do r "shots $u" pnpm exec tsx scripts/visual-crm.mts 1.3 --user $u; done
r "serve stop"    bash scripts/acc-v2-serve.sh stop
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
