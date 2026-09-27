#!/usr/bin/env bash
# C3.8 (REST/AI set 3 · c110) controller verification part A — main = C3.8 merged · QC1 fresh seed · suites only
# expected known reds: qc-crm-c3.9 36/48 (H1–H12 until C3.9-fix merges) · k2.3 15/17 · m2.9 S5.2 · m3.11 ×4 · c3.7 S2.x
# launch: systemd-run --unit=crm-c38-verify --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /root/projects/shark-crm/scripts/pending/run-c38-verify.sh
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c38-verify.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "gen-crm-api-docs (early)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/gen-crm-api-docs.mts
r "gen-member-api-docs (early)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/gen-member-api-docs.mts
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "qc-member-m1.1" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.1.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed acc-v2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-acc-v2-qc.mts
r "share expected.json" bash -c 'for w in c20 c12a c110 c23; do cp scripts/crm-expected.json scripts/member-expected.json scripts/acc-v2-expected.json /root/projects/shark-crm-$w/scripts/ 2>/dev/null; done'
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
q qc-crm-c3.8
q qc-crm-c3.8
q qc-crm-c3.4
q qc-crm-c3.9
q qc-account-api-core
q qc-account-api-keys
q qc-member-m1.11
q qc-member-m2.10
q qc-kanban-k1.15
for s in qc-ai-tools qc-ai-proposals qc-ai-skills qc-ai-credit qc-ai-vision qc-kb qc-kb-search qc-kb-auto qc-meeting-invite qc-crm-c1.7 qc-form qc-member-fix-s1 qc-member-m1.4 qc-member-m2.9 qc-member-m3.11 qc-crm-c1.4 qc-crm-c2.4 qc-crm-c2.5 qc-crm-c2.6 qc-crm-c2.2 qc-crm-c3.1 qc-crm-c3.2 qc-crm-c3.5 qc-crm-c3.6 qc-crm-c3.7 qc-crm-c0.4 qc-crm-c0.5 qc-crm-c0.2 qc-crm-c1.11 qc-crm-c1.5 qc-crm-c2.7 qc-crm-c3.3 qc-crm-c1.3 qc-crm-c1.8 qc-crm-c2.1 qc-crm-c2.10 qc-crm-c2.11 qc-crm-c1.10 qc-crm-c1.2a qc-crm-c1.9 qc-crm-c1.6 qc-crm-c2.9 qc-crm-c3.0 qc-pages qc-systems qc-kanban-k2.3 qc-chat-core-v2 qc-acc-v2-attachments qc-crm-v1 qc-cron; do q "$s"; done
r "qc-nav-functions" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-nav-functions.mts
r "probe-uiversion-gate (no env)" env -u CRM_V2_SWITCH bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-uiversion-gate.mts
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL -u DIRECT_URL pnpm fitness
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
