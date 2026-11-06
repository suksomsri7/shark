#!/usr/bin/env bash
# postmerge.sh — LEAN post-merge sanity of session/hr (controller tree) after a fast-forward merge of a head that ctl.sh already
# passed: prisma generate · seed-hr-qc · WO oracle forced ×1 · fitness-hr ×2 modes. No typecheck (same bytes as the controlled head).
# If the merge had conflicts or was not a fast-forward of the controlled head → use ctl.sh MODE=full on session/hr instead.
# Use: systemd-run --unit=hr-pm-<wo> --quiet env WO=h2.1 /usr/bin/bash /root/projects/shark-hr-c/ledger/hr-ctl/postmerge.sh
set -uo pipefail
: "${WO:?}"; T=/root/projects/shark-hr-c; WOU=$(echo "$WO" | tr a-z A-Z)
OUT=$T/ledger/wo-notes/hr-$WOU-postmerge.txt; LOG=/tmp/hr-ctl/pm-$WO; mkdir -p "$LOG"; cd "$T" || exit 9
echo "# post-merge sanity (lean) session/hr @$(git rev-parse --short HEAD) · $(date -u +%FT%TZ) · load $(cut -d' ' -f1-3 /proc/loadavg)" >> "$OUT"
sum() { local s; s=$(grep -E "^===== |^JSON_SUMMARY" "$2" | tail -2 | tr '\n' ' ' | cut -c1-300); local r; r=$(grep -E "^RESIDUE" "$2" | tail -1 | cut -c1-120); echo "$1 exit=$3 $s ${r:+· $r} [$(date -u +%H:%MZ)]" >> "$OUT"; }
bash scripts/iso.sh pnpm exec prisma generate > "$LOG/generate.log" 2>&1; echo "prisma generate exit=$? [$(date -u +%H:%MZ)]" >> "$OUT"
for s in seed-hr-qc "qc-hr-$WO"; do l="$LOG/$s.log"; bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx "scripts/$s.mts" > "$l" 2>&1; sum "$s" "$l" $?; done
f=fitness-hr; l="$LOG/$f-noenv.log"; bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx "scripts/$f.mts" > "$l" 2>&1; sum "$f noenv" "$l" $?; l="$LOG/$f-env.log"; bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx "scripts/$f.mts" > "$l" 2>&1; sum "$f env" "$l" $?
echo "ALLDONE $(date -u +%FT%TZ) · red: $(grep -cE 'exit=[1-9]' "$OUT")" >> "$OUT"
