#!/usr/bin/env bash
# C3.9-fix on MAIN — confirmation suites (Fable · 27 ก.ย.) · QC1 fresh seed
# launch: systemd-run --unit=crm-c39fix-main --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /root/projects/shark-crm/scripts/pending/run-c39fix-main.sh
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c39fix-main.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "qc-member-m1.1" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.1.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed acc-v2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-acc-v2-qc.mts
r "share expected.json" bash -c 'for w in c20 c12a c110 c23; do cp scripts/crm-expected.json scripts/member-expected.json scripts/acc-v2-expected.json /root/projects/shark-crm-$w/scripts/ 2>/dev/null; done'
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
for s in qc-crm-c3.9 qc-crm-c3.9 qc-form qc-crm-c1.8 qc-crm-c2.5 qc-crm-c2.4 qc-crm-c2.2 qc-crm-c2.1 qc-crm-c2.8 qc-crm-c3.1 qc-crm-c3.5 qc-crm-c3.4 qc-crm-c3.8 qc-crm-c3.3 qc-chat-core-v2 qc-kanban-k1.8 qc-kanban-k1.10 qc-kanban-k2.3 qc-ai-proposals qc-member-fix-s1 qc-member-m1.4 qc-crm-c1.4 qc-crm-c1.3 qc-crm-c1.6 qc-crm-c1.5 qc-crm-c1.11 qc-crm-c0.2 qc-crm-c0.4 qc-crm-c0.5 qc-crm-c2.10 qc-crm-c2.11 qc-crm-c1.10 qc-pages qc-cron; do q "$s"; done
r "qc-nav-functions" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-nav-functions.mts
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL -u DIRECT_URL pnpm fitness
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
