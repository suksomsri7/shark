#!/usr/bin/env bash
# C5.5-authz-sweep verification — QC3 · one heavy job at a time (iso.sh + gate lock) · run a /tmp copy of this file
#   usage: bash /tmp/cf8-run-verify.sh <label>      (summary → /tmp/cf8-logs/<label>.summary)
set -uo pipefail
cd /root/projects/shark-crm-cf2
LBL="${1:-v1}"
D=/tmp/cf8-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
echo "tree $(git rev-parse --short HEAD) + worktree diff: $(git status --short -- src | tr '\n' ' ')" >> "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; local t0; t0=$(date +%s); "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s) - t0 ))s $(grep -E 'JSON_SUMMARY|🟢|🔴|ผ่าน [0-9]|found [0-9]+ error|error TS' "$log" | tail -1 | cut -c1-260)" >> "$SUM"; }
q() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts" "${@:2}"; }
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
q pending/cf8/probe-cf8-mobile
q pending/cf8/probe-cf8-actions
q qc-mobile-authz-hotfix
q qc-automation-authz-hotfix
q qc-payment-authz-hotfix
r qc-security-hotfix bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-security-hotfix.mts
q pending/c55/probe-fix1
for s in qc-crm-v1 qc-crm-c0.2 qc-crm-c1.11 qc-crm-c1.6; do q "$s"; done
for g in crm member kanban account; do r "docs-$g" bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/gen-$g-api-docs.mts" --check; done
echo "tracked diff after docs: $(git status --short | grep -v '^??' | grep -v expected.json | tr '\n' ' ')" >> "$SUM"
r fitness bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
echo ALLDONE >> "$SUM"
