#!/usr/bin/env bash
# C5.5-fix1 independent review — regression reruns (QC3 · gate lock · one heavy job at a time) · logs /tmp/c55-logs/review/
set -uo pipefail
cd /root/projects/shark-crm-c54e
D=/tmp/c55-logs/review; mkdir -p "$D"; S="$D/SUMMARY"; : > "$S"
r() { local n="$1"; shift; "$@" > "$D/$n.log" 2>&1; local rc=$?; echo "$n exit=$rc · $(grep -aE '🟢|🔴|JSON_SUMMARY|error TS' "$D/$n.log" | tail -2 | tr '\n' ' ' | cut -c1-260)" >> "$S"; }
q3() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$2.mts"; }
for p in probe-fix1 probe-auto probe-idem; do q3 "$p" "pending/c55/$p"; done
for s in qc-crm-c2.1 qc-crm-c2.9 qc-crm-c1.10 qc-member-m2.2 qc-member-m2.5 qc-webhook; do q3 "$s" "$s"; done
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 ISO_MEM=6G bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck
echo ALLDONE >> "$S"
