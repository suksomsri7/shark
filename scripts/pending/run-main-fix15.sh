#!/usr/bin/env bash
# controller: main gate for C5.5-fix15 (patch c54d bd435157..bb7a5a5f minus ledger RESUME/register onto session/crm after fix14) — static + QC3 (+ QC2 where pinned)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-fix15.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r fitness-qc3 bash scripts/qc3.sh pnpm fitness
q() { n=$1; shift; r "QC3 $n" env CF9_OWNER_OUT=/tmp/main-fix15-owner.json CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q2() { n=$1; shift; r "QC2 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q probe-cf20-drain scripts/pending/cf20/probe-cf20-drain.mts
q probe-cf20 scripts/pending/cf20/probe-cf20.mts
q probe-cf20-rv-drain scripts/pending/cf20/review/probe-cf20-rv-drain.mts
q probe-cf20-rv scripts/pending/cf20/review/probe-cf20-rv.mts
q probe-c54d-r2 scripts/pending/c54d/probe-c54d-r2.mts
q probe-c54d-r3 scripts/pending/c54d/probe-c54d-r3.mts
q probe-cf18-outbox scripts/pending/cf18/probe-cf18-outbox.mts
q probe-cf18 scripts/pending/cf18/probe-cf18.mts
q probe-cf18-r2 scripts/pending/cf18/probe-cf18-r2.mts
q probe-cf18-review scripts/pending/cf18/review/probe-cf18-review.mts
q probe-cf19 scripts/pending/cf19/probe-cf19.mts
q c2.5 scripts/qc-crm-c2.5.mts
q c2.6 scripts/qc-crm-c2.6.mts
q c1.4 scripts/qc-crm-c1.4.mts
q c1.5 scripts/qc-crm-c1.5.mts
q c3.4 scripts/qc-crm-c3.4.mts
q c3.9 scripts/qc-crm-c3.9.mts
q ai-automation scripts/qc-ai-automation.mts
q probe-cf14-g2 scripts/pending/cf14/probe-cf14-g2.mts
q probe-cf17-g3 scripts/pending/cf17/probe-cf17-g3.mts
q probe-cf9-g1 scripts/pending/cf9/probe-cf9-g1.mts
q chat-notify-v2 scripts/qc-chat-notify-v2.mts
q forms-notify scripts/qc-forms-notify.mts
q kanban-k1.7 scripts/qc-kanban-k1.7.mts
q2 c2.2 scripts/qc-crm-c2.2.mts
q2 "c5.3 L1,L3" scripts/qc-crm-c5.3.mts --only=L1,L3
echo ALLDONE >> "$L"
