#!/usr/bin/env bash
# ctl.sh — ONE controller run per WO head (HR RUN token economy, 6 Nov 2026). Detached unit; heavy steps via iso.sh + qc4.sh + gate lock.
# Use: systemd-run --unit=hr-ctl-<wo>-<n> --quiet env TREE=/root/projects/shark-hr-b WO=h2.1 BASE=<merge-base> MODE=lean|full RUN=control1 \
#        /usr/bin/bash /root/projects/shark-hr-c/ledger/hr-ctl/ctl.sh
# Steps: prisma generate · WO oracle unforced + forced (×1 lean / ×2 full) · regression picked by pick-suites.sh (or all) · fitness ×2 modes
#        · typecheck ×1 (RAM gate ≥10 000 MB free + no other build/tsc unit, waits ≤90 min). Output appended to ledger/wo-notes/hr-<WO>-<RUN>.txt.
set -uo pipefail
: "${TREE:?}" "${WO:?}" "${BASE:?}"; MODE=${MODE:-lean}; RUN=${RUN:-control1}
CTL=/root/projects/shark-hr-c/ledger/hr-ctl; WOU=$(echo "$WO" | tr a-z A-Z)
OUT=$TREE/ledger/wo-notes/hr-$WOU-$RUN.txt; LOG=/tmp/hr-ctl/$WO-$RUN; mkdir -p "$LOG"; cd "$TREE" || exit 9
HEAD=$(git rev-parse --short HEAD)
echo "# controller run $RUN · $WO @$HEAD · base $BASE · mode $MODE · $(date -u +%FT%TZ) · load $(cut -d' ' -f1-3 /proc/loadavg)" >> "$OUT"
sum() { local s; s=$(grep -E "^===== |^JSON_SUMMARY" "$2" | tail -2 | tr '\n' ' ' | cut -c1-300); local r; r=$(grep -E "^RESIDUE" "$2" | tail -1 | cut -c1-120); echo "$1 exit=$3 $s ${r:+· $r} [$(date -u +%H:%MZ) load $(cut -d' ' -f1 /proc/loadavg)]" >> "$OUT"; }
EXTRA_ENV="QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7"
run() { local n=$1 f=$2 s=$3 l="$LOG/$1.log"; if [ "$f" = 1 ]; then bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 $EXTRA_ENV pnpm exec tsx "scripts/$s.mts" > "$l" 2>&1; else bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env $EXTRA_ENV pnpm exec tsx "scripts/$s.mts" > "$l" 2>&1; fi; sum "$n" "$l" $?; }
bash scripts/iso.sh pnpm exec prisma generate > "$LOG/generate.log" 2>&1; echo "prisma generate exit=$? [$(date -u +%H:%MZ)]" >> "$OUT"
run "seed-hr-qc (first)" 1 seed-hr-qc   # 11 Nov: hr-expected.json is gitignored — a fresh tree has none, and h1.2 S7.x / h1.3 S7.x read it
run "qc-hr-$WO unforced" 0 "qc-hr-$WO"
run "qc-hr-$WO forced#1" 1 "qc-hr-$WO"
[ "$MODE" = full ] && run "qc-hr-$WO forced#2" 1 "qc-hr-$WO"
mapfile -t SUITES < <(bash "$CTL/pick-suites.sh" "$TREE" "$BASE" HEAD "$MODE" 2>> "$OUT")
for s in "${SUITES[@]}"; do [ "$s" = "qc-hr-$WO" ] && continue; [ "$s" = seed-hr-qc ] && continue; run "$s" 1 "$s"; done
for f in fitness fitness-hr; do l="$LOG/$f-noenv.log"; bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx "scripts/$f.mts" > "$l" 2>&1; sum "$f noenv" "$l" $?; l="$LOG/$f-env.log"; bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx "scripts/$f.mts" > "$l" 2>&1; sum "$f env" "$l" $?; done
for i in $(seq 1 18); do avail=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo); busy=$(systemctl list-units --no-legend 'iso-*' | grep -cE 'build|typecheck|tsc'); [ "$avail" -ge 10000 ] && [ "$busy" -eq 0 ] && break; sleep 300; done
echo "typecheck start $(date -u +%H:%MZ) availMB=$avail busy=$busy" >> "$OUT"
if [ "$avail" -ge 10000 ] && [ "$busy" -eq 0 ]; then l="$LOG/typecheck.log"; rm -rf .next/types tsconfig.tsbuildinfo; env NODE_OPTIONS=--max-old-space-size=${TSC_HEAP:-12288} ISO_MEM=${TSC_MEM:-14000M} bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck > "$l" 2>&1; rc=$?; echo "typecheck exit=$rc errors=$(grep -c 'error TS' "$l") [$(date -u +%H:%MZ)]" >> "$OUT"; else echo "typecheck SKIPPED (gate never opened in 90 min) — controller must run it by hand" >> "$OUT"; fi
echo "ALLDONE $(date -u +%FT%TZ) · red: $(grep -cE 'exit=[1-9]' "$OUT")" >> "$OUT"
