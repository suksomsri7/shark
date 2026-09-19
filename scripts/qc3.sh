#!/usr/bin/env bash
# qc2.sh — run a command against QC branch #2 (`wo-crm-qc2`, parent = QC branch) instead of QC #1 (CRM RUN · 19 Sep)
#   Exported DATABASE_URL/DIRECT_URL win over `.env.qc` in every QC loader (acc-v2-env · member/crm-qc-env · qc-env-guard).
#   Own gate lock (/tmp/shark-gate-qc3.lock) — QC1 and QC3 suites run in parallel; each worktree stays on ONE branch
#   (its *-expected.json come from seeding THAT branch).
# Use: bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.10.mts
set -euo pipefail
cd "$(dirname "$0")/.."
F=.env.qc3
[ -f "$F" ] || { echo "🔴 qc2: no $F" >&2; exit 2; }
D="$(grep -m1 '^DIRECT_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
P="$(grep -m1 '^DATABASE_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
for U in "$D" "$P"; do
  case "$U" in *ep-royal-night*|*ep-plain-art*|"") echo "🔴 qc2: URL is production, QC1 or empty — stop" >&2; exit 4 ;; esac
  case "$U" in *ep-weathered-river*) : ;; *) echo "🔴 qc2: URL is not QC3 (ep-weathered-river)" >&2; exit 4 ;; esac
done
exec env DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE="$F" GATE_LOCK_FILE=/tmp/shark-gate-qc3.lock QC_BRANCH=qc3 "$@"
