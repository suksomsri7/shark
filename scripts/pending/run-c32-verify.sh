#!/usr/bin/env bash
# C3.2 controller verification (Fable · 26 ก.ย.) — main tree = C3.1 accepted + C3.2 merged from c110 (+ORACLE-EDIT SF-4) · QC1 fresh seed
# launch: systemd-run --unit=crm-c32-verify --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /root/projects/shark-crm/scripts/pending/run-c32-verify.sh
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c32-verify.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "gen-crm-api-docs (early · before m1.1)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/gen-crm-api-docs.mts
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "qc-member-m1.1" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.1.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "share expected.json to c20/c12a (QC1 lanes)" bash -c 'for w in c20 c12a; do cp scripts/crm-expected.json scripts/member-expected.json /root/projects/shark-crm-$w/scripts/; done'
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
q qc-crm-c3.2
q qc-crm-c3.2
for s in qc-crm-c3.1 qc-crm-c2.10 qc-crm-c1.4 qc-crm-c1.5 qc-crm-c1.3 qc-crm-c0.2 qc-crm-c0.5 qc-crm-c1.7 qc-crm-c1.8 qc-crm-c1.11 qc-crm-c2.1 qc-crm-c2.5 qc-crm-c2.7 qc-crm-c2.9 qc-crm-c3.0 qc-member-m1.5 qc-crm-v1 qc-pages qc-cron; do q "$s"; done
r "qc-nav-functions" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-nav-functions.mts
r "probe-uiversion-gate (no env)" env -u CRM_V2_SWITCH bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-uiversion-gate.mts
r "gen-crm-api-docs" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/gen-crm-api-docs.mts
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
r "shots 3.2 (owner)"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.2
r "shots 3.2 (thana)"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.2 --user thana
r "shots 3.2 (manager)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.2 --user manager
r "qc-member-m3.10 (server up)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m3.10.mts
r "serve stop"    bash scripts/acc-v2-serve.sh stop
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
