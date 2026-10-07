#!/usr/bin/env bash
# C5.5-fix4 regression (QC3 · CRM_V2_SWITCH=all) — one heavy job at a time, each in its own systemd unit (iso.sh) under the gate lock
# Use: bash scripts/pending/cf4/run-regress.sh [label]   → logs /tmp/cf4-logs/<label>-*.log + summary /tmp/cf4-logs/<label>.summary
set -uo pipefail
cd /root/projects/shark-crm-cf2
LBL="${1:-reg1}"
D=/tmp/cf4-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(grep -E 'JSON_SUMMARY|🟢|🔴|passed|PASS|FAIL|ผ่าน' "$log" | tail -1 | cut -c1-240)" >> "$SUM"; }
q() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
p() { local n="$1"; shift; r "$n" bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
# pure oracles (no DB)
p qc-sanitize-hotfix scripts/qc-sanitize-hotfix.mts
p hsan-judge-selftest scripts/pending/hsan-review/judge-selftest.mts
p hsan-attack scripts/pending/hsan-review/attack.mts vectors fuzz
p hsan-truncation scripts/pending/hsan-review/truncation.mts
p hsan-sqlcheck scripts/pending/hsan-review/sqlcheck.mts
p hsan-pgtest scripts/pending/hsan-review/pgtest.mts
# QC3
for s in pending/cf4/probe-cf4-ci qc-automation-authz-hotfix qc-payment-authz-hotfix qc-mobile-authz-hotfix \
         qc-crm-c2.5 qc-crm-c3.5 qc-crm-c1.7 pending/c54e/probe-c54e pending/c54e/probe-c54e-r2 pending/cf2/probe-cf2 \
         qc-acc-v2-policy qc-acc-v2-contact-modal qc-acc-v2-import \
         qc-kanban-k1.6 qc-kanban-k3.7 qc-kanban-k3.9 qc-member-m1.7 qc-member-m3.11; do q "$s"; done
for g in crm member kanban account; do r "docs-$g" bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/gen-$g-api-docs.mts" --check; done
r fitness bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
echo ALLDONE >> "$SUM"
