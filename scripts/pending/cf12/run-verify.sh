#!/usr/bin/env bash
# C5.5-fix9 verification — QC3 · one heavy job at a time (iso.sh + gate lock) · run a /tmp copy of this file
#   usage: bash /tmp/cf12-run-verify.sh <label> [skip-typecheck]     (summary → /tmp/cf12-logs/<label>.summary)
set -uo pipefail
cd /root/projects/shark-crm-c54d
LBL="${1:-v1}"
D=/tmp/cf12-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
echo "tree $(git rev-parse --short HEAD) + worktree diff: $(git status --short -- src | tr '\n' ' ')" >> "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; local t0; t0=$(date +%s); "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s) - t0 ))s $(grep -E 'JSON_SUMMARY|🟢|🔴|ผ่าน [0-9]|found [0-9]+ error|error TS' "$log" | tail -1 | cut -c1-300)" >> "$SUM"; }
q() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts" "${@:2}"; }
p() { local n="$1"; shift; r "$n" bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
[ "${2:-}" = "skip-typecheck" ] || r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
p probe-cf12 scripts/pending/cf12/probe-cf12.mts
p probe-hunt3 scripts/pending/hunt3/probe-hunt3.mts
for s in qc-crm-c3.9 qc-crm-c3.5 qc-kanban-k3.1 qc-crm-c5.3 qc-form; do q "$s"; done
for g in crm member kanban account; do r "docs-$g" bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/gen-$g-api-docs.mts" --check; done
echo "tracked diff after docs: $(git status --short | grep -v '^??' | grep -v expected.json | tr '\n' ' ')" >> "$SUM"
r fitness bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
echo ALLDONE >> "$SUM"
