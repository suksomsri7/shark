#!/usr/bin/env bash
# controller: main gate for C5.5-fix14 (patch cd2 f5e6485b..2564c54b minus ledger RESUME/register onto session/crm after fix13) — static + QC2 + QC3 (QC1 acc-v2 oracles were run in the worktree by builder and reviewer; not re-run here: expected-file juggling on the button-runner DB)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-fix14.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r fitness-qc2 bash scripts/qc2.sh pnpm fitness
q() { n=$1; shift; r "QC3 $n" env CF9_OWNER_OUT=/tmp/main-fix14-owner.json CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q2() { n=$1; shift; r "QC2 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q2 probe-cf19 scripts/pending/cf19/probe-cf19.mts
q2 probe-cf19-review scripts/pending/cf19/review/probe-cf19-review.mts
q2 probe-cf19-review-r3 scripts/pending/cf19/review/probe-cf19-review-r3.mts
q2 probe-cf19-review-r4 scripts/pending/cf19/review/probe-cf19-review-r4.mts
q2 "c5.3 L1,L3" scripts/qc-crm-c5.3.mts --only=L1,L3
q2 probe-cf13 scripts/pending/cf13/probe-cf13.mts
q2 probe-cf13-review scripts/pending/cf13/review/probe-cf13-review.mts
q2 probe-cf16-r3 scripts/pending/cf16/probe-cf16-r3.mts
q2 probe-cf16-review scripts/pending/cf16/review/probe-cf16-review.mts
q2 c1.11 scripts/qc-crm-c1.11.mts
q c1.3 scripts/qc-crm-c1.3.mts
q c1.4 scripts/qc-crm-c1.4.mts
q c1.7 scripts/qc-crm-c1.7.mts
q c3.9 scripts/qc-crm-c3.9.mts
q c3.4 scripts/qc-crm-c3.4.mts
q member-m1.4 scripts/qc-member-m1.4.mts
q acc-v2-contact-modal scripts/qc-acc-v2-contact-modal.mts
q probe-cf2 scripts/pending/cf2/probe-cf2.mts
q probe-cf17-g3 scripts/pending/cf17/probe-cf17-g3.mts
q probe-cf14-g2 scripts/pending/cf14/probe-cf14-g2.mts
q probe-cf9-g1 scripts/pending/cf9/probe-cf9-g1.mts
q probe-cf9-g1-r2 scripts/pending/cf9/probe-cf9-g1-r2.mts
q probe-cf18 scripts/pending/cf18/probe-cf18.mts
q probe-cf18-r2 scripts/pending/cf18/probe-cf18-r2.mts
q mobile-authz scripts/qc-mobile-authz-hotfix.mts
q ai-automation scripts/qc-ai-automation.mts
echo ALLDONE >> "$L"
