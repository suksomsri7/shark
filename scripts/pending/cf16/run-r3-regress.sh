#!/usr/bin/env bash
# C5.5-fix12 round 3 verification (builder) — QC2 · one job at a time (gate lock) in its own systemd unit · logs /tmp/cf16-r2-logs/regress3/ (SUMMARY)
#   probe-cf16 is compared with the round-1 RED dump (/tmp/cf16-logs/red3.dump.json, read only) · reviewers' probes run unedited ·
#   doc generators in --check mode only
set -uo pipefail
cd /root/projects/shark-crm-cd2
D=/tmp/cf16-r2-logs/regress3; mkdir -p "$D"; S="$D/SUMMARY"; : > "$S"
r() { local n="$1"; shift; local t0=$(date +%s); "$@" > "$D/$n.log" 2>&1; local rc=$?; echo "$n exit=$rc $(( $(date +%s) - t0 ))s · $(grep -aE '🟢|🔴|JSON_SUMMARY|ผ่าน [0-9]+/[0-9]+|error TS|Found [0-9]+ error|fitness|passed|failed|CHECK |ตรงกับทะเบียน|ไม่ตรง' "$D/$n.log" | tail -2 | tr '\n' ' ' | cut -c1-300)" >> "$S"; }
q2() { local n="$1"; local f="$2"; shift 2; r "$n" bash scripts/iso.sh env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 CF16_DUMP="$D/$n.dump.json" CF16_BASELINE="${BASELINE:-}" bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$f.mts" "$@"; }
echo "start $(date -u +%FT%TZ) src-md5 $(git diff -- src | md5sum | cut -c1-32)" >> "$S"
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
q2 probe-cf16-r3 pending/cf16/probe-cf16-r3
q2 probe-cf16-r2 pending/cf16/probe-cf16-r2
BASELINE=/tmp/cf16-logs/red3.dump.json q2 probe-cf16-vs-red3 pending/cf16/probe-cf16
q2 probe-cf16-review pending/cf16/review/probe-cf16-review
q2 probe-cf16-review-r2 pending/cf16/review/probe-cf16-review-r2
q2 qc-crm-c2.4 qc-crm-c2.4
for g in crm account; do r "docs-$g" bash scripts/iso.sh bash scripts/qc2.sh pnpm exec tsx "scripts/gen-$g-api-docs.mts" --check; done
r fitness bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
echo "ALLDONE $(date -u +%FT%TZ) src-md5 $(git diff -- src | md5sum | cut -c1-32)" >> "$S"
