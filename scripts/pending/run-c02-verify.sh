#!/usr/bin/env bash
# C0.2 controller verification — reseed → drain → oracle + regressions → gates → BUILD (facade changes the server graph)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c02-verify.log
: > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
r "reseed member"    bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "seed crm"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "DRAIN"            bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
r "oracle c0.2"      bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c0.2.mts
r "oracle c1.1"      bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.1.mts
r "qc-crm"           bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm.mts
r "qc-crm-activity"  bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-activity.mts
r "qc-form"          bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-form.mts
r "qc-forms-notify"  bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-forms-notify.mts
r "qc-acc-v2-party"  bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-party.mts
r "qc-acc-v2-contacts" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-contacts.mts
r "qc-ai-tools"      bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-ai-tools.mts
r "qc-member-fix-s2" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-fix-s2.mts
r "typecheck"        bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"          pnpm fitness
r "fitness-noenv"    env -u DATABASE_URL pnpm fitness
r "BUILD+serve"      bash scripts/acc-v2-serve.sh
r "visual owner"     pnpm exec tsx scripts/visual-crm.mts 0.1 --user owner
r "serve stop"       bash scripts/acc-v2-serve.sh stop
r "m1.9 FINAL"       bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.9.mts
echo "ALLDONE" | tee -a "$L"
