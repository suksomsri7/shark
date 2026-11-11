#!/usr/bin/env bash
# pick-suites.sh — choose the regression suites for a controller run from the diff (HR RUN, 6 Nov 2026 token economy).
# Use: bash ledger/hr-ctl/pick-suites.sh <tree> <base> <head> [full]   → prints suite names, one per line (order = run order).
# Rules: cheap generic suites always run · the big per-WO HR oracles (qc-hr-h*.mts, 2–10 min each) run only when the diff
# touches a src path they reference (auto-scanned from the oracle file) · FULL = everything, forced when the diff touches
# prisma/, src/lib/core/, package.json, or when the 4th arg is "full" (phase-close WOs, merges with conflicts).
set -uo pipefail
T=$1; BASE=$2; HEAD=$3; MODE=${4:-lean}
cd "$T" || exit 9
mapfile -t CHANGED < <(git diff --name-only "$BASE" "$HEAD" -- src prisma package.json | sort -u)
ALWAYS=(qc-hr-attendance qc-hr qc-bulk-ops qc-nav-functions qc-hf-hr-privacy qc-hr-leave-booking qc-payroll qc-hr-payadjust qc-payroll-reverse qc-hr-roster qc-booking-hours-hr qc-calendar qc-approval qc-approval-wiring qc-approval-edit qc-crm-c3.3 qc-crm-c0.3 qc-ai-proposals qc-ai-tools qc-chat-staff-perms qc-account-cpa)
ORACLES=$(ls scripts/qc-hr-h*.mts 2>/dev/null | sed -E 's#scripts/##; s#\.mts$##' | sort -V)
if [ "$MODE" = full ] || printf '%s\n' "${CHANGED[@]}" | grep -qE '^(prisma/|src/lib/core/|package\.json)'; then
  echo "# FULL (mode=$MODE · ${#CHANGED[@]} changed files)" >&2
  printf '%s\n' $ORACLES "${ALWAYS[@]}" seed-hr-qc; exit 0
fi
PICK=(); SKIP=()
for o in $ORACLES; do
  hit=""
  while read -r ref; do
    [ -z "$ref" ] && continue
    case "$ref" in
      */) pfx=$ref ;;                                   # explicit dir scan → prefix
      src/lib/modules/hr|src/lib/modules/approval) pfx="$ref/index.ts" ;;   # barrel import → index only
      *) if [ -d "$ref" ]; then pfx="$ref/"; else pfx=$ref; fi ;;
    esac
    for c in "${CHANGED[@]}"; do case "$c" in "$pfx"*) hit="$c"; break 2 ;; esac; done
  done < <(grep -ohE '(from "@/[^"]+"|"src/lib/[^"]+")' "scripts/$o.mts" | sed -E 's/from //; s/"//g; s#^@/#src/#' | sort -u)
  if [ -n "$hit" ]; then PICK+=("$o"); else SKIP+=("$o"); fi
done
echo "# LEAN · changed: ${CHANGED[*]:-none} · oracles picked: ${PICK[*]:-none} · skipped: ${SKIP[*]:-none}" >&2
printf '%s\n' "${PICK[@]}" "${ALWAYS[@]}" seed-hr-qc
