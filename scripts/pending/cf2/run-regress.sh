#!/usr/bin/env bash
# C5.5-fix2 regression (QC3 · CRM_V2_SWITCH=all) — one heavy job at a time, each in its own systemd unit (iso.sh) under the gate lock
# Use: bash scripts/pending/cf2/run-regress.sh [label]   → logs /tmp/cf2-logs/<label>-*.log + summary /tmp/cf2-logs/<label>.summary
set -uo pipefail
cd /root/projects/shark-crm-cf2
LBL="${1:-reg1}"
D=/tmp/cf2-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(grep -E 'JSON_SUMMARY|🟢|🔴|passed|PASS|FAIL' "$log" | tail -1 | cut -c1-220)" >> "$SUM"; }
q() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
q pending/cf2/probe-cf2
q pending/cd2/probe-cd2
q pending/cd2/review/probe-cd2-review
q pending/c54e/probe-c54e
q pending/c54e/probe-c54e-r2
for s in qc-crm-c1.3 qc-crm-c1.4 qc-crm-c1.5 qc-crm-c1.7 qc-crm-c1.11 qc-crm-c2.2 qc-crm-c2.5 qc-crm-c2.6 qc-crm-c3.5 qc-crm-c3.9 qc-crm-c0.2 qc-kanban-k3.3 qc-kanban-k3.9 qc-acc-v2-contact-modal qc-forms-notify; do q "$s"; done
for g in crm member kanban account; do r "docs-$g" bash scripts/iso.sh bash scripts/qc3.sh pnpm exec tsx "scripts/gen-$g-api-docs.mts" --check; done
r fitness bash scripts/iso.sh bash scripts/qc3.sh pnpm fitness
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness
echo ALLDONE >> "$SUM"
