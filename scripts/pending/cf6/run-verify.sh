#!/usr/bin/env bash
# C5.5-fix5 verification (QC3 · CRM_V2_SWITCH=all) — one heavy job at a time, each in its own systemd unit (iso.sh) under the gate lock
# Use: bash scripts/pending/cf6/run-verify.sh [label]  → logs /tmp/cf6-logs/<label>-*.log + summary /tmp/cf6-logs/<label>.summary
# (copy to a new name before editing while a run is in flight)
set -uo pipefail
cd /root/projects/shark-crm-cf2
LBL="${1:-v1}"
D=/tmp/cf6-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; local t0; t0=$(date +%s); "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s) - t0 ))s $(grep -E 'JSON_SUMMARY|🟢|🔴|ผ่าน [0-9]|found [0-9]+ error|error TS' "$log" | tail -1 | cut -c1-260)" >> "$SUM"; }
q() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts" "${@:2}"; }
p() { local n="$1"; shift; r "$n" bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
echo "tree $(git rev-parse --short HEAD) + worktree diff ($(git diff --stat -- src scripts/qc-crm-c2.5.mts scripts/fitness.mts | tail -1))" >> "$SUM"
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
p probe-cf6-linear scripts/pending/cf6/probe-cf6-linear.mts "$LBL" base
q pending/cf6/probe-cf6-db "$LBL" base
p rv-cf4-sanitize scripts/pending/cf4/review/rv-cf4-sanitize.mts
q pending/cf4/review/rv-cf4-db
p qc-sanitize-hotfix scripts/qc-sanitize-hotfix.mts
p qc-branding-b2 scripts/qc-branding-b2.mts
for s in qc-crm-c2.5 qc-crm-c3.5 qc-crm-c1.7 qc-crm-c2.0 qc-crm-c2.11 qc-crm-c2.4 qc-crm-c2.6 qc-crm-c1.10 qc-crm-c5.3 \
         pending/cf2/probe-cf2 pending/c54e/probe-c54e pending/c54e/probe-c54e-r2 \
         qc-kanban-k1.6 qc-kanban-k3.5 qc-kanban-k3.9; do q "$s"; done
for g in crm member kanban account; do r "docs-$g" bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/gen-$g-api-docs.mts" --check; done
r fitness bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
echo ALLDONE >> "$SUM"
