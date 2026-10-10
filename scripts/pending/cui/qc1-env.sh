#!/usr/bin/env bash
# CRM C4.2-fix r3 ▸ run a command with QC1 (`.env.qc`, host ep-plain-art) exported — for probes that do not load the QC env
#   themselves (scripts/pending/c54d/probe-c54d.mts expects scripts/qc3.sh). Modelled on scripts/qc3.sh · values never printed ◂
set -euo pipefail
cd "$(dirname "$0")/../../.."
F=.env.qc
[ -f "$F" ] || { echo "🔴 qc1-env: no $F" >&2; exit 2; }
D="$(grep -m1 '^DIRECT_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
P="$(grep -m1 '^DATABASE_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
for U in "$D" "$P"; do
  case "$U" in *ep-royal-night*|"") echo "🔴 qc1-env: URL is production or empty — stop" >&2; exit 4 ;; esac
  case "$U" in *ep-plain-art*) : ;; *) echo "🔴 qc1-env: URL is not QC1 (ep-plain-art)" >&2; exit 4 ;; esac
done
exec env DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE="$F" "$@"
