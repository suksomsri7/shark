#!/usr/bin/env bash
# C5.5-fix3b ROUND 2 verification (builder) — QC2 · one job at a time (gate lock) in its own systemd unit · logs /tmp/cf5-logs/r2/regress/
#   (run-cf5-regress.sh of round 1 is left untouched)
set -uo pipefail
cd /root/projects/shark-crm-cd2
D=/tmp/cf5-logs/r2/regress; mkdir -p "$D"; S="$D/SUMMARY"; : > "$S"
r() { local n="$1"; shift; local t0=$(date +%s); "$@" > "$D/$n.log" 2>&1; local rc=$?; echo "$n exit=$rc $(( $(date +%s) - t0 ))s · $(grep -aE '🟢|🔴|JSON_SUMMARY|ผ่าน [0-9]+/[0-9]+|error TS|Found [0-9]+ error|fitness|passed|failed|CHECK |ตรงกับทะเบียน|ไม่ตรง' "$D/$n.log" | tail -2 | tr '\n' ' ' | cut -c1-300)" >> "$S"; }
q2() { local n="$1"; local f="$2"; shift 2; r "$n" bash scripts/iso.sh env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$f.mts" "$@"; }
echo "start $(date -u +%FT%TZ)" >> "$S"
q2 probe-cf5 pending/cf5/probe-cf5
q2 probe-cf5-r2 pending/cf5/probe-cf5-r2
q2 rv-cf5 pending/cf5/review/rv-cf5
q2 probe-cf3 pending/cf3/probe-cf3
q2 qc-webhook qc-webhook
q2 qc-account-api-webhooks qc-account-api-webhooks
q2 qc-crm-c1.10 qc-crm-c1.10
q2 qc-crm-c1.6 qc-crm-c1.6
q2 qc-crm-c2.1 qc-crm-c2.1
q2 qc-crm-c3.4 qc-crm-c3.4
q2 qc-crm-c1.3 qc-crm-c1.3
q2 qc-crm-c1.4 qc-crm-c1.4
for g in crm member kanban account; do r "docs-$g" bash scripts/iso.sh bash scripts/qc2.sh pnpm exec tsx "scripts/gen-$g-api-docs.mts" --check; done
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness bash scripts/iso.sh bash scripts/qc2.sh pnpm exec tsx scripts/fitness.mts
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness.mts
echo "ALLDONE $(date -u +%FT%TZ)" >> "$S"
