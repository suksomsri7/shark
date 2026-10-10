#!/usr/bin/env bash
# C5.5-fix1 regression run 1 (builder) — tree = c54e worktree · QC3 (+ C5.3 L1,L3 on QC2) · one heavy job at a time, each in its own systemd unit
# pattern: scripts/pending/run-main-e.sh (shark-crm) · logs /tmp/c55-logs/r1/
set -uo pipefail
cd /root/projects/shark-crm-c54e
D=/tmp/c55-logs/r1; mkdir -p "$D"; S="$D/SUMMARY"; : > "$S"
r() { local n="$1"; shift; "$@" > "$D/$n.log" 2>&1; local rc=$?; echo "$n exit=$rc · $(grep -aE '🟢|🔴|JSON_SUMMARY|passed|PASS|FAIL|✅ fitness|error TS' "$D/$n.log" | tail -2 | tr '\n' ' ' | cut -c1-300)" >> "$S"; }
q3() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$2.mts" "${@:3}"; }
for p in probe-idem probe-auto probe-fix1; do q3 "$p" "pending/c55/$p"; done
for s in qc-crm-c1.6 qc-crm-c1.7 qc-crm-c1.10 qc-crm-c2.1 qc-crm-c2.2 qc-crm-c2.9 qc-crm-c2.10 qc-crm-c3.9 qc-crm-c0.2 qc-crm-c0.5; do q3 "$s" "$s"; done
r qc2-c5.3-L1L3 bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c5.3.mts --only=L1,L3
for s in qc-member-m1.11 qc-kanban-k1.15 qc-account-api-core; do q3 "$s" "$s"; done
for g in crm member kanban account; do r "docs-$g" bash scripts/iso.sh bash scripts/qc3.sh pnpm exec tsx "scripts/gen-$g-api-docs.mts" --check; done
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness bash scripts/iso.sh bash scripts/qc3.sh pnpm fitness
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness
echo ALLDONE >> "$S"
