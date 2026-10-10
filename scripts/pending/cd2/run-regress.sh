#!/usr/bin/env bash
# cd2 regression on QC3 (CRM_V2_SWITCH=all) — each heavy job in its own systemd unit (iso.sh) under the gate lock, one at a time
# use: bash scripts/pending/cd2/run-regress.sh <run>   → /tmp/cd2-logs/<run>/<name>.log + summary.log
set -uo pipefail
cd /root/projects/shark-crm-cd2
RUN="$1"; D=/tmp/cd2-logs/$RUN; mkdir -p "$D"; S="$D/summary.log"; : > "$S"
r() { local name="$1"; shift; echo "== $name $(date -u +%H:%M:%S)" >> "$S"; "$@" > "$D/$name.log" 2>&1; local rc=$?; echo "exit=$rc" >> "$D/$name.log"; echo "   exit=$rc $(grep -aE 'JSON_SUMMARY|🟢|🔴|passed|ผ่าน' "$D/$name.log" | tail -2 | tr '\n' ' ')" >> "$S"; }
q() { r "$(basename "$1")" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
for p in pending/c54d/probe-c54d pending/c54d/probe-c54d-r2 pending/c54d/probe-c54d-r3 pending/cui/probe-j1-send pending/cui/probe-bl1-values pending/c54e/probe-c54e pending/c54e/probe-c54e-r2; do q "$p"; done
for s in c2.2 c2.1 c2.5 c2.6 c2.10 c2.11 c0.5 c1.4 c1.5 c1.8 c3.5 c3.9 c0.2; do q "qc-crm-$s"; done
q qc-forms-notify
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r docs-check bash scripts/iso.sh bash scripts/qc3.sh pnpm docs --check
r fitness bash scripts/iso.sh bash scripts/qc3.sh pnpm fitness
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness
echo ALLDONE >> "$S"
