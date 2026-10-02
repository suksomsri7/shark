#!/usr/bin/env bash
# C5.5-G3 verification — QC3 · one heavy job at a time (iso.sh + gate lock) · run a /tmp copy of this file
#   usage: bash /tmp/cf17-run-verify.sh <label> [only-these-names…]   (summary → /tmp/cf17-logs/<label>.summary)
set -uo pipefail
cd /root/projects/shark-crm-cf2
LBL="${1:-v1}"; shift || true
ONLY=" $* "
D=/tmp/cf17-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
echo "tree $(git rev-parse --short HEAD) + worktree diff: $(git status --short -- src | tr '\n' ' ')" >> "$SUM"
want() { [ "$ONLY" = "  " ] || [[ "$ONLY" == *" $1 "* ]]; }
r() { local name="$1"; shift; want "$name" || return 0; local log="$D/$LBL-${name//\//_}.log"; local t0; t0=$(date +%s); "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s) - t0 ))s $(grep -E 'JSON_SUMMARY|🟢|🔴|ผ่าน [0-9]|PASS [0-9]|found [0-9]+ error|error TS' "$log" | tail -1 | cut -c1-260)" >> "$SUM"; }
q() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 CF9_OWNER_OUT="$D/owner-$LBL.json" bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts" "${@:2}"; }
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
q pending/cf17/probe-cf17-g3
q pending/cf14/probe-cf14-g2
q pending/cf14/review/probe-cf14-g2-review
q pending/cf9/probe-cf9-g1
q pending/cf9/probe-cf9-g1-r2
q pending/cf9/review/probe-cf9-g1-review
q pending/cf9/review/probe-cf9-g1-review-r2
q pending/cf8/probe-cf8-mobile
q pending/cf8/probe-cf8-actions
q pending/cf8/review/probe-cf8-review
for s in qc-mobile-authz-hotfix qc-ai-automation qc-crm-c3.4 qc-automation-authz-hotfix qc-payment-authz-hotfix qc-account-api-ai-skill qc-member-m3.10 qc-member-fix-s1; do q "$s"; done
for g in crm member kanban account; do r "docs-$g" bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/gen-$g-api-docs.mts" --check; done
echo "tracked diff after docs: $(git status --short | grep -v '^??' | grep -v expected.json | tr '\n' ' ')" >> "$SUM"
r fitness bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
echo ALLDONE >> "$SUM"
