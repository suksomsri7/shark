#!/usr/bin/env bash
# C5.5-fix13 verification round 2 (after the scope addition P-it5-2/P-it5-3) — QC3 (QC2 for the QC2-pinned fix10 probes / c5.3) · one heavy job at a time (iso.sh + gate lock)
#   usage: cp scripts/pending/cf18/run-verify2.sh /tmp/cf18-run-verify-<label>.sh && bash /tmp/cf18-run-verify-<label>.sh <label>
#   summary → /tmp/cf18-logs/<label>.summary · one log per step next to it
set -uo pipefail
cd /root/projects/shark-crm-c54d
LBL="${1:-f13v1}"
D=/tmp/cf18-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
echo "tree $(git rev-parse --short HEAD) + worktree diff: $(git status --short -- src | tr '\n' ' ') · start $(date -u +%FT%TZ)" >> "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; local t0; t0=$(date +%s); "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s) - t0 ))s $(grep -E 'JSON_SUMMARY|controls [0-9]|🟢|🔴|ผ่าน [0-9]|PASS|FAIL|found [0-9]+ error|error TS|passed|failed' "$log" | tail -1 | cut -c1-500)" >> "$SUM"; }
q() { local n="$1"; shift; r "QC3 $n" bash scripts/iso.sh env CF9_OWNER_OUT="$D/owner.json" CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q2() { local n="$1"; shift; r "QC2 $n" bash scripts/iso.sh env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r docs-crm bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/gen-crm-api-docs.mts --check
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm fitness
r fitness-qc3 bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm fitness
q probe-cf18 scripts/pending/cf18/probe-cf18.mts
q probe-cf18-outbox scripts/pending/cf18/probe-cf18-outbox.mts
q probe-hunt4 scripts/pending/hunt4/probe-hunt4.mts
q probe-cf9-g1 scripts/pending/cf9/probe-cf9-g1.mts
q probe-cf14-g2 scripts/pending/cf14/probe-cf14-g2.mts
q probe-cf15 scripts/pending/cf15/probe-cf15.mts "$LBL" base
q c3.9 scripts/qc-crm-c3.9.mts
q c3.5 scripts/qc-crm-c3.5.mts
q c3.4 scripts/qc-crm-c3.4.mts
q c3.7 scripts/qc-crm-c3.7.mts
q ai-automation scripts/qc-ai-automation.mts
q c2.5 scripts/qc-crm-c2.5.mts
q c2.6 scripts/qc-crm-c2.6.mts
q2 probe-c111-review scripts/pending/probe-c111-review.mts
q c1.11 scripts/qc-crm-c1.11.mts
q2 "c5.3 L1,L3" scripts/qc-crm-c5.3.mts --only=L1,L3
echo "tracked diff after the run: $(git status --short | grep -v '^??' | tr '\n' ' ') · end $(date -u +%FT%TZ)" >> "$SUM"
echo ALLDONE >> "$SUM"
