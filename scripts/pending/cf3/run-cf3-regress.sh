#!/usr/bin/env bash
# C5.5-fix3a regression (builder) — shark-crm-cd2 worktree · QC2 only · one job at a time (gate lock) in its own systemd unit · logs /tmp/cf3-logs/regress/
#   not run: probe-fix1 / probe-idem (fixture pinned to QC3) · c1.10 H (:3215) is pointed at a closed port via QC_BASE (the suite's own knob)
set -uo pipefail
cd /root/projects/shark-crm-cd2
D=/tmp/cf3-logs/regress; mkdir -p "$D"; S="$D/SUMMARY"; : > "$S"
r() { local n="$1"; shift; local t0=$(date +%s); "$@" > "$D/$n.log" 2>&1; local rc=$?; echo "$n exit=$rc $(( $(date +%s) - t0 ))s · $(grep -aE '🟢|🔴|JSON_SUMMARY|ผ่าน [0-9]+/[0-9]+|error TS|Found [0-9]+ error|fitness|passed|failed' "$D/$n.log" | tail -2 | tr '\n' ' ' | cut -c1-300)" >> "$S"; }
q2() { local n="$1"; local f="$2"; shift 2; r "$n" bash scripts/iso.sh env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$f.mts" "$@"; }
q2 probe-cf3 pending/cf3/probe-cf3
for s in qc-webhook qc-webhook-ui qc-account-api-webhooks qc-account-api-core qc-crm-c0.2 qc-crm-c1.10; do q2 "$s" "$s"; done
q2 qc-crm-c5.3-L1L3 qc-crm-c5.3 --only=L1,L3
q2 n-probe-m1 pending/c54n/probe-m1
q2 n-qc-numbering pending/c54n/qc-numbering
q2 n-r2-money pending/c54n/review/r2-money
q2 n-r3-adversarial pending/c54n/review/r3-m1-adversarial
q2 n-check-jno-fns-r2 pending/c54n/check-jno-fns-r2
q2 qc-acc-v2-wht-cheque qc-acc-v2-wht-cheque
q2 qc-acc-v2-payments qc-acc-v2-payments
for g in crm member kanban account; do r "docs-$g" bash scripts/iso.sh bash scripts/qc2.sh pnpm exec tsx "scripts/gen-$g-api-docs.mts" --check; done
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness bash scripts/iso.sh bash scripts/qc2.sh pnpm fitness
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness
echo ALLDONE >> "$S"
