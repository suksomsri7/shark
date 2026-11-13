#!/usr/bin/env bash
# pm-full.sh — post-merge check of session/hr (controller tree, QC4) after a merge commit (not a fast-forward of a controlled head).
# prisma generate · (MIGRATE=1 → prisma migrate deploy on QC4) · seed-hr-qc · every qc-hr-h*/qc-hr-set-* oracle forced ×1 + payroll/privacy/audit
# regressions + EXTRA · fitness + fitness-hr both modes · clean typecheck (TYPECHECK=0 skips).
# Use: systemd-run --unit=hr-pm-<wo> --quiet env WO=h3.7 [MIGRATE=1] [EXTRA="qc-account-cpa"] /usr/bin/bash /root/projects/shark-hr-c/ledger/hr-ctl/pm-full.sh
set -uo pipefail
: "${WO:?}"; T=/root/projects/shark-hr-c; WOU=$(echo "$WO" | tr a-z A-Z)
OUT=$T/ledger/wo-notes/hr-$WOU-postmerge.txt; LOG=/tmp/hr-ctl/pm-$WO; mkdir -p "$LOG"; cd "$T" || exit 9
echo "# post-merge FULL session/hr @$(git rev-parse --short HEAD) · $(date -u +%FT%TZ) · load $(cut -d' ' -f1-3 /proc/loadavg)" >> "$OUT"
sum() { local s; s=$(grep -aE "^JSON_SUMMARY" "$2" | tail -1 | cut -c1-140); echo "$1 exit=$3 $s [$(date -u +%H:%MZ)]" >> "$OUT"; }
Q="bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh"
bash scripts/iso.sh pnpm exec prisma generate > "$LOG/generate.log" 2>&1; echo "prisma generate exit=$? [$(date -u +%H:%MZ)]" >> "$OUT"
if [ "${MIGRATE:-0}" = 1 ]; then $Q pnpm exec prisma migrate deploy > "$LOG/migrate.log" 2>&1; echo "migrate deploy exit=$? $(grep -aE 'migrations? (have been|found)|No pending' "$LOG/migrate.log" | tail -1) [$(date -u +%H:%MZ)]" >> "$OUT"; fi
mapfile -t ORACLES < <(ls scripts/qc-hr-h[0-9]*.mts scripts/qc-hr-set-*.mts 2>/dev/null | grep -v -- '-lib' | xargs -n1 basename | sed 's/\.mts$//' | sort -V)
declare -A SEEN
for s in seed-hr-qc "qc-hr-$WO" "${ORACLES[@]}" qc-payroll qc-payroll-reverse qc-hr-payadjust qc-audit-trail qc-bulk-ops qc-hf-hr-privacy qc-hr qc-hr-attendance qc-hr-roster ${EXTRA:-}; do
  [ -f "scripts/$s.mts" ] || { echo "$s MISSING" >> "$OUT"; continue; }
  [ -n "${SEEN[$s]:-}" ] && continue; SEEN[$s]=1
  $Q env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx "scripts/$s.mts" > "$LOG/$s.log" 2>&1; sum "$s" "$LOG/$s.log" $?
done
for f in fitness fitness-hr; do l="$LOG/$f-noenv.log"; bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx "scripts/$f.mts" > "$l" 2>&1; sum "$f noenv" "$l" $?; l="$LOG/$f-env.log"; bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx "scripts/$f.mts" > "$l" 2>&1; sum "$f env" "$l" $?; done
if [ "${TYPECHECK:-1}" = 1 ]; then
  for i in $(seq 1 18); do avail=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo); [ "$avail" -ge 10000 ] && break; sleep 300; done
  l="$LOG/typecheck.log"; t0=$(date +%s); rm -rf .next/types tsconfig.tsbuildinfo
  env NODE_OPTIONS=--max-old-space-size=12288 ISO_MEM=14000M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck > "$l" 2>&1; rc=$?
  echo "typecheck(clean) exit=$rc errors=$(grep -c 'error TS' "$l") secs=$(( $(date +%s) - t0 )) [$(date -u +%H:%MZ)]" >> "$OUT"
fi
echo "ALLDONE $(date -u +%FT%TZ) · red: $(grep -cE 'exit=[1-9]' "$OUT")" >> "$OUT"
