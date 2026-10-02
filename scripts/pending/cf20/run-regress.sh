#!/usr/bin/env bash
# C5.5-fix15 builder regression — one heavy job at a time (iso + gate lock) · QC3 default, QC2 only for QC2-pinned suites · never QC1 / :3215
# Use: bash scripts/pending/cf20/run-regress.sh <logdir> [name…]   (no names = all)
set -uo pipefail
cd "$(dirname "$0")/../../.."
L="${1:?logdir}"; shift; mkdir -p "$L"
WANT=" $* "
S="$L/summary.txt"
want() { [ "$WANT" = "  " ] || [[ "$WANT" == *" $1 "* ]]; }
r() { n=$1; shift; want "$n" || return 0; echo "== $n $(date -u +%H:%M:%S)" >> "$S"; "$@" > "$L/$n.log" 2>&1; rc=$?; echo "   exit=$rc $(date -u +%H:%M:%S) · $(grep -E '^controls|passed|PASS|ผ่าน [0-9]' "$L/$n.log" | tail -1 | cut -c1-160)" >> "$S"; }
q3() { n=$1; shift; r "$n" bash scripts/iso.sh env CF9_OWNER_OUT=/tmp/cf20-owner.json CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q2() { n=$1; shift; r "$n" bash scripts/iso.sh env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }

r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness-qc3 bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm fitness
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL GATE_LOCK_FILE=/tmp/shark-gate-qc3.lock bash scripts/with-gate-lock.sh pnpm fitness
r docs-crm bash scripts/iso.sh env GATE_LOCK_FILE=/tmp/shark-gate-qc3.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/gen-crm-api-docs.mts --check
q3 probe-cf20-drain scripts/pending/cf20/probe-cf20-drain.mts
q3 probe-cf20 scripts/pending/cf20/probe-cf20.mts
q3 probe-c54d-r2 scripts/pending/c54d/probe-c54d-r2.mts
q3 probe-c54d-r3 scripts/pending/c54d/probe-c54d-r3.mts
q3 probe-cf18-outbox scripts/pending/cf18/probe-cf18-outbox.mts
q3 probe-cf18 scripts/pending/cf18/probe-cf18.mts
q3 probe-cf18-r2 scripts/pending/cf18/probe-cf18-r2.mts
q3 probe-cf18-review scripts/pending/cf18/review/probe-cf18-review.mts
q3 probe-cf18-review-r2 scripts/pending/cf18/review/probe-cf18-review-r2.mts
q3 c2.5 scripts/qc-crm-c2.5.mts
q3 c2.6 scripts/qc-crm-c2.6.mts
q3 c1.4 scripts/qc-crm-c1.4.mts
q3 c1.5 scripts/qc-crm-c1.5.mts
q3 c3.4 scripts/qc-crm-c3.4.mts
q3 c3.9 scripts/qc-crm-c3.9.mts
q3 ai-automation scripts/qc-ai-automation.mts
q2 c2.2 scripts/qc-crm-c2.2.mts
q2 "c5.3" scripts/qc-crm-c5.3.mts --only=L1,L3
q3 probe-cf14-g2 scripts/pending/cf14/probe-cf14-g2.mts
q3 probe-cf17-g3 scripts/pending/cf17/probe-cf17-g3.mts
q3 probe-cf9-g1 scripts/pending/cf9/probe-cf9-g1.mts
q3 chat-notify-v2 scripts/qc-chat-notify-v2.mts
q3 forms-notify scripts/qc-forms-notify.mts
q3 booking-deposit scripts/qc-booking-deposit.mts
q3 pos-account scripts/qc-pos-account.mts
q3 kanban-k1.7 scripts/qc-kanban-k1.7.mts
echo "ALLDONE $(date -u +%H:%M:%S)" >> "$S"
