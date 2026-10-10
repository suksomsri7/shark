#!/usr/bin/env bash
# C5.5-fix13 verification round 3 (after the inbound-mail wake) — run a /tmp copy · summary /tmp/cf18-logs/<label>.summary
set -uo pipefail
cd /root/projects/shark-crm-c54d
LBL="${1:-f13v3}"
D=/tmp/cf18-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
echo "tree $(git rev-parse --short HEAD) + worktree diff: $(git status --short -- src | tr '\n' ' ') · start $(date -u +%FT%TZ)" >> "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; local t0; t0=$(date +%s); "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s) - t0 ))s $(grep -E 'JSON_SUMMARY|controls [0-9]|ผ่าน [0-9]|error TS' "$log" | tail -1 | cut -c1-500)" >> "$SUM"; }
q() { local n="$1"; shift; r "QC3 $n" bash scripts/iso.sh env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm fitness
r fitness-qc3 bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm fitness
q c2.5 scripts/qc-crm-c2.5.mts
q kanban-k3.9 scripts/qc-kanban-k3.9.mts
q probe-cf6-linear scripts/pending/cf6/probe-cf6-linear.mts
q probe-cf18-outbox scripts/pending/cf18/probe-cf18-outbox.mts
echo "end $(date -u +%FT%TZ)" >> "$SUM"
echo ALLDONE >> "$SUM"
