#!/usr/bin/env bash
# C5.5-fix7 verification round 2 (after moving the DATETIME helper to lib/ui/date for fitness F2.3) — QC2 · one job at a time (gate lock) in its own systemd unit · logs /tmp/cf10-logs/regress/ (SUMMARY)
#   the cf7 / cf5 runners and the reviewers' runners are left untouched
set -uo pipefail
cd /root/projects/shark-crm-cd2
D=/tmp/cf10-logs/regress2; mkdir -p "$D"; S="$D/SUMMARY"; : > "$S"
r() { local n="$1"; shift; local t0=$(date +%s); "$@" > "$D/$n.log" 2>&1; local rc=$?; echo "$n exit=$rc $(( $(date +%s) - t0 ))s · $(grep -aE '🟢|🔴|JSON_SUMMARY|ผ่าน [0-9]+/[0-9]+|error TS|Found [0-9]+ error|fitness|passed|failed|CHECK |ตรงกับทะเบียน|ไม่ตรง' "$D/$n.log" | tail -2 | tr '\n' ' ' | cut -c1-300)" >> "$S"; }
q2() { local n="$1"; local f="$2"; shift 2; r "$n" bash scripts/iso.sh env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$f.mts" "$@"; }
echo "start $(date -u +%FT%TZ)" >> "$S"
q2 probe-cf10 pending/cf10/probe-cf10
q2 probe-cf5 pending/cf5/probe-cf5
q2 qc-crm-c1.4 qc-crm-c1.4
q2 qc-crm-c1.9 qc-crm-c1.9
q2 qc-crm-c3.5 qc-crm-c3.5
for g in crm member kanban account; do r "docs-$g" bash scripts/iso.sh bash scripts/qc2.sh pnpm exec tsx "scripts/gen-$g-api-docs.mts" --check; done
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
echo "ALLDONE $(date -u +%FT%TZ)" >> "$S"
