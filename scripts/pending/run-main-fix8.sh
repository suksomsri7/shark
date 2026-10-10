#!/usr/bin/env bash
# controller: main gate for C5.5-fix8 (patch c54e 53d88b71..9ec0e019 onto session/crm after G2) — static + QC3 (+ QC2 for the QC2-pinned cf5 probes / account REST suites)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-fix8.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r fitness-qc3 bash scripts/qc3.sh pnpm fitness
q() { n=$1; shift; r "QC3 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q2() { n=$1; shift; r "QC2 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q probe-cf11-keys scripts/pending/cf11/probe-cf11-keys.mts
q probe-cf11-contains scripts/pending/cf11/probe-cf11-contains.mts
q probe-cf11-mail scripts/pending/cf11/probe-cf11-mail.mts
q probe-cf11-r2 scripts/pending/cf11/probe-cf11-r2.mts --skip=R2
q probe-cf11-r3 scripts/pending/cf11/probe-cf11-r3.mts
q probe-cf11-r4 scripts/pending/cf11/probe-cf11-r4.mts
q probe-cf11-review-r3 scripts/pending/cf11/review/probe-cf11-review-r3.mts
q probe-cf11-review-r4 scripts/pending/cf11/review/probe-cf11-review-r4.mts
q probe-cf11-review-mail scripts/pending/cf11/review/probe-cf11-review-mail.mts
q probe-cf11-review-keys scripts/pending/cf11/review/probe-cf11-review-keys.mts
q probe-cf2 scripts/pending/cf2/probe-cf2.mts
q probe-cf8-mobile scripts/pending/cf8/probe-cf8-mobile.mts
q probe-cf8-actions scripts/pending/cf8/probe-cf8-actions.mts
q probe-cf4-ci scripts/pending/cf4/probe-cf4-ci.mts
q2 probe-cf5 scripts/pending/cf5/probe-cf5.mts
q2 probe-cf5-r2 scripts/pending/cf5/probe-cf5-r2.mts
q2 rv-cf5 scripts/pending/cf5/review/rv-cf5.mts
q2 rv-cf5-r2 scripts/pending/cf5/review/rv-cf5-r2.mts
q c2.5 scripts/qc-crm-c2.5.mts
q c2.6 scripts/qc-crm-c2.6.mts
q c1.6 scripts/qc-crm-c1.6.mts
q webhook scripts/qc-webhook.mts
q acc-v2-contact-modal scripts/qc-acc-v2-contact-modal.mts
q acc-v2-import scripts/qc-acc-v2-import.mts
q2 account-api-webhooks scripts/qc-account-api-webhooks.mts
q2 account-api-write-settings scripts/qc-account-api-write-settings.mts
q probe-cf14-g2 scripts/pending/cf14/probe-cf14-g2.mts
echo ALLDONE >> "$L"
