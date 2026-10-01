#!/usr/bin/env bash
# C5.5-fix3a ROUND 2 verification (builder) — shark-crm-cd2 worktree · QC2 only · one job at a time (gate lock) in its own systemd unit
#   logs /tmp/cf3-logs/r2/regress/ (SUMMARY) · same wrappers as run-cf3-regress.sh (that file is left untouched)
set -uo pipefail
cd /root/projects/shark-crm-cd2
D=/tmp/cf3-logs/r2/regress; mkdir -p "$D"; S="$D/SUMMARY"; : > "$S"
r() { local n="$1"; shift; local t0=$(date +%s); "$@" > "$D/$n.log" 2>&1; local rc=$?; echo "$n exit=$rc $(( $(date +%s) - t0 ))s · $(grep -aE '🟢|🔴|JSON_SUMMARY|ผ่าน [0-9]+/[0-9]+|error TS|Found [0-9]+ error|fitness|passed|failed|CHECK ' "$D/$n.log" | tail -2 | tr '\n' ' ' | cut -c1-300)" >> "$S"; }
q2() { local n="$1"; local f="$2"; shift 2; r "$n" bash scripts/iso.sh env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$f.mts" "$@"; }
echo "start $(date -u +%FT%TZ)" >> "$S"
q2 probe-cf3 pending/cf3/probe-cf3
q2 probe-cf3-r2 pending/cf3/probe-cf3-r2
q2 rv3-jno pending/cf3/review/rv3-jno
q2 rv4-review pending/cf3/review/rv4-review
q2 n-probe-m1 pending/c54n/probe-m1
q2 n-qc-numbering pending/c54n/qc-numbering
q2 n-r2-money pending/c54n/review/r2-money
q2 n-r3-adversarial pending/c54n/review/r3-m1-adversarial
q2 n-check-jno-fns-r2 pending/c54n/check-jno-fns-r2
q2 qc-acc-v2-payments qc-acc-v2-payments
q2 qc-acc-v2-wht-cheque qc-acc-v2-wht-cheque
r docs-account bash scripts/iso.sh bash scripts/qc2.sh pnpm exec tsx scripts/gen-account-api-docs.mts --check
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness bash scripts/iso.sh bash scripts/qc2.sh pnpm exec tsx scripts/fitness.mts
echo "ALLDONE $(date -u +%FT%TZ)" >> "$S"
