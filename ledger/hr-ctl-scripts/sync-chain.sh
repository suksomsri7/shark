#!/usr/bin/env bash
# SYNC WO verification: ctl.sh FULL on the merged tree, then cross-module suites that exercise the conflict-resolved code.
set -uo pipefail
T=/root/projects/shark-hr-b; cd "$T" || exit 9
env TREE=$T WO=h2.1 BASE=562d06deb MODE=full RUN=sync /usr/bin/bash /root/projects/shark-hr-c/ledger/hr-ctl/ctl.sh
OUT=$T/ledger/wo-notes/hr-H2.1-sync.txt; LOG=/tmp/hr-ctl/h2.1-sync; mkdir -p "$LOG"
echo "# cross-module suites (conflict-resolved code) $(date -u +%FT%TZ)" >> "$OUT"
for s in qc-pos-p3.5 qc-pos-p3.6 qc-pos-p3.7 qc-pos-p3.9 qc-pos-p2.5 qc-pos-p2.14 qc-pos-p1.1 qc-svc-b.1 qc-sec-s1.3b qc-sec-s1.9 qc-sec-s1.17 qc-sec-s1.21 qc-push; do
  l="$LOG/x-$s.log"
  bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx "scripts/$s.mts" > "$l" 2>&1; rc=$?
  echo "X $s exit=$rc $(grep -a -E '^===== |^JSON_SUMMARY' "$l" | tail -2 | tr '\n' ' ' | cut -c1-260) [$(date -u +%H:%MZ)]" >> "$OUT"
done
echo "XDONE $(date -u +%FT%TZ) · red: $(grep -a -cE 'exit=[1-9]' "$OUT")" >> "$OUT"
