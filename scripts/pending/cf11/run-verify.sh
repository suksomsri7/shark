#!/usr/bin/env bash
# C5.5-fix8 verification — iso.sh + gate lock, one heavy job at a time · run a /tmp copy of this file
#   usage: bash /tmp/cf11-run-verify.sh <label> [only-step-regex]     (summary → /tmp/cf11-logs/<label>.summary)
#   QC3 for own probes + CRM suites (CRM_V2_SWITCH=all) · QC2 for the QC2-pinned cf5 probes and the account REST suites
set -uo pipefail
cd /root/projects/shark-crm-c54e
LBL="${1:-v1}"
ONLY="${2:-.}"
D=/tmp/cf11-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
echo "tree $(git rev-parse --short HEAD) + diff: $(git status --short -- src scripts/fitness.mts scripts/lib docs | tr '\n' ' ')" >> "$SUM"
r() { local name="$1"; shift; [[ "$name" =~ $ONLY ]] || return 0; local log="$D/$LBL-${name//\//_}.log"; local t0; t0=$(date +%s); "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s) - t0 ))s $(grep -E 'JSON_SUMMARY|🟢|🔴|ผ่าน [0-9]|found [0-9]+ error|error TS|✅ docs|❌ docs|❌ \.claude' "$log" | tail -1 | cut -c1-300)" >> "$SUM"; }
q3() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts" "${@:2}"; }
q2() { r "qc2:$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts" "${@:2}"; }
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
q3 pending/cf11/probe-cf11-keys
q3 pending/cf11/probe-cf11-contains
q3 pending/cf11/probe-cf11-mail
q3 pending/cf11/probe-cf11-r2 --skip=R2
q3 pending/cf11/probe-cf11-r3
q3 pending/cf11/review/probe-cf11-review-r2
q3 pending/cf11/review/probe-cf11-review-mail
q3 pending/cf11/review/probe-cf11-review-keys
[ -f scripts/pending/hunt3/probe-hunt3.mts ] && q3 pending/hunt3/probe-hunt3   # copy it from the hunt worktree (shark-crm-c54d) first — not committed here
q3 pending/cf2/probe-cf2
q3 pending/cf2/review/probe-cf2-review-r2
q3 pending/cf8/probe-cf8-mobile
q3 pending/cf8/probe-cf8-actions
q3 pending/cf8/review/probe-cf8-review
q3 pending/cf4/probe-cf4-ci
q3 pending/cf4/probe-cf4-contains
q2 pending/cf5/probe-cf5
q2 pending/cf5/probe-cf5-r2
q2 pending/cf5/review/rv-cf5
q2 pending/cf5/review/rv-cf5-r2
for s in qc-crm-c2.5 qc-crm-c2.6 qc-crm-c1.6 qc-webhook qc-acc-v2-contact-modal qc-acc-v2-import; do q3 "$s"; done
q2 qc-account-api-webhooks
q2 qc-account-api-write-settings
for g in crm member kanban account; do r "docs-$g" bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/gen-$g-api-docs.mts" --check; done
echo "tracked diff after docs: $(git status --short | grep -v '^??' | grep -v expected.json | tr '\n' ' ')" >> "$SUM"
r fitness bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
echo ALLDONE >> "$SUM"
