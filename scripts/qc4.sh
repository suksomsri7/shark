#!/usr/bin/env bash
# qc4.sh — run a command against QC branch #4 (`wo-pos-qc4`, parent = wo-acc-v2-qc) — POS RUN only (1 Oct 2026)
#   CRM RUN holds QC1/QC2/QC3; POS never touches those. Own gate lock /tmp/shark-gate-qc4.lock.
# Use: bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-<wo>.mts
set -euo pipefail
cd "$(dirname "$0")/.."
F=.env.qc4
[ -f "$F" ] || { echo "🔴 qc4: no $F" >&2; exit 2; }
D="$(grep -m1 '^DIRECT_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
P="$(grep -m1 '^DATABASE_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
for U in "$D" "$P"; do
  case "$U" in *ep-royal-night*|*ep-plain-art*|*ep-cool-shadow*|*ep-weathered-river*|"") echo "🔴 qc4: URL is production, QC1 or empty — stop" >&2; exit 4 ;; esac
  case "$U" in *ep-frosty-lab*) : ;; *) echo "🔴 qc4: URL is not QC4 (ep-frosty-lab)" >&2; exit 4 ;; esac
done
exec env DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE="$F" GATE_LOCK_FILE=/tmp/shark-gate-qc4.lock QC_BRANCH=qc4 "$@"
