#!/usr/bin/env bash
# qc-trips.sh — run a command against a RUN TRIPS QC branch (`wo-trips-qc` + per-lane children) — TRIPS RUN only (12 Nov 2026 · P0.1)
#   Other RUNs' QC DBs (ACC/CRM/POS/SVC/SEC/HR) and production are refused. One gate lock per DB.
# Use: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-<wo>.mts
set -euo pipefail
cd "$(dirname "$0")/.."
F=.env.qc-trips
[ -f "$F" ] || { echo "🔴 qc-trips: no $F" >&2; exit 2; }
D="$(grep -m1 '^DIRECT_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
P="$(grep -m1 '^DATABASE_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
# host check on the real hostname (between '@' and '/', ':' or '?'), not a substring of the whole URL — empty ⇒ exit 4
for U in "$D" "$P"; do
  [ -n "$U" ] || { echo "🔴 qc-trips: DATABASE_URL/DIRECT_URL empty — stop" >&2; exit 4; }
  case "$U" in *://*) : ;; *) echo "🔴 qc-trips: URL has no scheme — stop" >&2; exit 4 ;; esac
  R="${U#*://}"; A="${R%%[/?#]*}"; H="${A##*@}"; H="${H%%:*}"; H="${H,,}"
  [ -n "$H" ] || { echo "🔴 qc-trips: cannot read host — stop" >&2; exit 4; }
  case "$U" in *ep-royal-night*) echo "🔴 qc-trips: URL is production — stop" >&2; exit 4 ;; esac
  # exact allowlist = scripts/trips-qc-hosts.mts (keep both in step)
  case "$H" in
    ep-wandering-butterfly-aogzkfrd*) M=ep-wandering-butterfly-aogzkfrd ;;
    ep-green-sound-aokclp5k*) M=ep-green-sound-aokclp5k ;;
    ep-calm-sun-ao0wyfu5*) M=ep-calm-sun-ao0wyfu5 ;;
    *) echo "🔴 qc-trips: host $H is not a TRIPS QC DB (production or another RUN's QC) — stop" >&2; exit 4 ;;
  esac
  [ -z "${MARK:-}" ] || [ "$MARK" = "$M" ] || { echo "🔴 qc-trips: DATABASE_URL and DIRECT_URL point at different branches — stop" >&2; exit 4; }
  MARK=$M
done
# POS_QC_ALLOW_HOST: loadPosQcEnv accepts QC4 only unless told — TRIPS QC is intentional (prod is still refused first)
exec env DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE="$F" GATE_LOCK_FILE="/tmp/shark-gate-trips-$MARK.lock" TRIPS_QC_HOST="$MARK" QC_BRANCH=qc-trips POS_QC_ALLOW_HOST="$MARK" "$@"
