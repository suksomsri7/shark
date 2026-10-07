#!/usr/bin/env bash
# C5.5-fix10 independent review runs — QC2 · one job at a time (gate lock) · each in its own systemd unit (iso.sh) ·
#   logs /tmp/cf13-review-logs/ (SUMMARY) · same wrappers as scripts/pending/cf13/run-cf13.sh ·
#   probe-cf13 is re-run against the builder's RED dump (/tmp/cf13-logs/red3.dump.json = the RED dump that matches the final probe, read only) so its two
#   "identical for viewers with visibility" controls are re-checked on this tip
set -uo pipefail
cd /root/projects/shark-crm-cd2
D=/tmp/cf13-review-logs; mkdir -p "$D"; S="$D/SUMMARY"; : > "$S"
r() { local n="$1"; shift; local t0=$(date +%s); "$@" > "$D/$n.log" 2>&1; local rc=$?; echo "$n exit=$rc $(( $(date +%s) - t0 ))s · $(grep -aE '🟢|🔴|JSON_SUMMARY|error TS|Found [0-9]+ error|ผ่าน [0-9]+/[0-9]+' "$D/$n.log" | tail -2 | tr '\n' ' ' | cut -c1-300)" >> "$S"; }
q2() { local n="$1"; local f="$2"; shift 2; r "$n" bash scripts/iso.sh env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 CF13_DUMP="$D/$n.dump.json" CF13_BASELINE="${BASELINE:-}" bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$f.mts" "$@"; }
echo "start $(date -u +%FT%TZ)" >> "$S"
q2 probe-cf13-review pending/cf13/review/probe-cf13-review
BASELINE=/tmp/cf13-logs/red3.dump.json q2 probe-cf13-vs-red3 pending/cf13/probe-cf13
q2 probe-cf10 pending/cf10/probe-cf10
q2 probe-cf10-review pending/cf10/review/probe-cf10-review
q2 probe-cf7 pending/cf7/probe-cf7
q2 probe-cf7-review pending/cf7/review/probe-cf7-review
q2 probe-cf7-review-r2 pending/cf7/review/probe-cf7-review-r2
q2 qc-crm-c1.5 qc-crm-c1.5
q2 qc-crm-c1.4 qc-crm-c1.4
q2 qc-crm-c1.3 qc-crm-c1.3
q2 qc-crm-c1.10 qc-crm-c1.10
q2 qc-crm-c2.2 qc-crm-c2.2
q2 qc-crm-c2.11 qc-crm-c2.11
q2 qc-crm-c3.4 qc-crm-c3.4
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness bash scripts/iso.sh bash scripts/qc2.sh pnpm exec tsx scripts/fitness.mts
echo "ALLDONE $(date -u +%FT%TZ)" >> "$S"
