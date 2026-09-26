#!/usr/bin/env bash
# C3.6 + C3.7 controller verification (Fable · 26 ก.ย.) — main = C3.5 accepted + C3.6 (c23) + C3.7 (c110) merged · QC1 fresh seed
# order for C3.7 per oracle: oracle (writes fixture) → shoot-crm (QC_PREPARE) → build+serve → visual 3.7 owner/thana → oracle again (same Thai day)
# launch: systemd-run --unit=crm-c367-verify --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /root/projects/shark-crm/scripts/pending/run-c367-verify.sh
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c367-verify.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "gen-crm-api-docs (early)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/gen-crm-api-docs.mts
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "qc-member-m1.1" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.1.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed acc-v2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-acc-v2-qc.mts
r "share expected.json to c20/c12a" bash -c 'for w in c20 c12a; do cp scripts/crm-expected.json scripts/member-expected.json scripts/acc-v2-expected.json /root/projects/shark-crm-$w/scripts/ 2>/dev/null; done'
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
q qc-crm-c3.6
q qc-crm-c3.6
q qc-crm-c3.7
r "shoot-crm (app harness)" env QC_PREPARE=1 node apps/mobile/qc/shoot-crm.mjs
for s in qc-pages qc-member-m1.5 qc-systems qc-systems-manage qc-crm-c1.8 qc-crm-c2.9 qc-crm-c1.5 qc-crm-c1.4 qc-crm-c1.3 qc-crm-c1.6 qc-crm-c2.4 qc-crm-c2.1 qc-chat-core-v2 qc-crm-c0.2 qc-crm-c0.5 qc-crm-c3.2 qc-crm-c3.5 qc-crm-c1.10 qc-crm-c2.11 qc-crm-c1.11 qc-mobile-app qc-mobile-auth qc-mobile-chat qc-mobile-help qc-push qc-crm-v1 qc-cron; do q "$s"; done
r "qc-nav-functions" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-nav-functions.mts
r "probe-uiversion-gate (no env)" env -u CRM_V2_SWITCH bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-uiversion-gate.mts
r "gen-crm-api-docs" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/gen-crm-api-docs.mts
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
r "shots 3.6 (owner)"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.6
r "shots 3.7 (owner)"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.7
r "shots 3.7 (thana)"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.7 --user thana
q qc-crm-c3.7
r "qc-member-m3.10 (server up)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m3.10.mts
r "serve stop"    bash scripts/acc-v2-serve.sh stop
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
