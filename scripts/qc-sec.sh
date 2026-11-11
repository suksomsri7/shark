#!/usr/bin/env bash
# qc-sec.sh — run a command against the SECRETARY RUN QC branch (`wo-sec-qc`, parent = wo-svc-qc) — SECRETARY RUN only (3 Nov 2026)
#   SVC holds wo-svc-qc (+ lanes), POS holds QC4/QC5, CRM holds QC1/QC2; the secretary RUN never touches those. Own gate lock /tmp/shark-gate-sec.lock.
# Use: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-<wo>.mts
set -euo pipefail
cd "$(dirname "$0")/.."
F=.env.qc-sec
[ -f "$F" ] || { echo "🔴 qc-sec: no $F" >&2; exit 2; }
D="$(grep -m1 '^DIRECT_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
P="$(grep -m1 '^DATABASE_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
# host check on the real hostname (between '@' and '/', ':' or '?') — empty ⇒ exit 4
for U in "$D" "$P"; do
  [ -n "$U" ] || { echo "🔴 qc-sec: DATABASE_URL/DIRECT_URL empty — stop" >&2; exit 4; }
  case "$U" in *://*) : ;; *) echo "🔴 qc-sec: URL has no scheme — stop" >&2; exit 4 ;; esac
  R="${U#*://}"; A="${R%%[/?#]*}"; H="${A##*@}"; H="${H%%:*}"; H="${H,,}"
  [ -n "$H" ] || { echo "🔴 qc-sec: cannot read host — stop" >&2; exit 4; }
  case "$U" in *ep-royal-night*) echo "🔴 qc-sec: URL is production — stop" >&2; exit 4 ;; esac
  case "$H" in *ep-royal-night*|*ep-plain-art*|*ep-cool-shadow*|*ep-weathered-river*|*ep-frosty-lab*|*ep-fragrant-thunder*|*ep-mute-scene*|*ep-royal-lake*|*ep-weathered-mode*|*ep-royal-bar*) echo "🔴 qc-sec: host $H is production or another RUN's QC — stop" >&2; exit 4 ;; esac
  # exact allowlist: the secretary QC branch endpoint only
  case "$H" in
    ep-calm-flower-aosbmxhm*) M=ep-calm-flower-aosbmxhm ;;
    *) echo "🔴 qc-sec: host $H is not the secretary QC branch — stop" >&2; exit 4 ;;
  esac
  [ -z "${MARK:-}" ] || [ "$MARK" = "$M" ] || { echo "🔴 qc-sec: DATABASE_URL and DIRECT_URL point at different branches — stop" >&2; exit 4; }
  MARK=$M
done
LOCK=/tmp/shark-gate-sec.lock
# POS_QC_ALLOW_HOST / SVC_QC_HOST: the POS/SVC env loaders accept their own QC hosts only unless told — this branch descends from them
exec env DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE="$F" GATE_LOCK_FILE="$LOCK" SEC_QC_HOST="$MARK" SVC_QC_HOST="$MARK" QC_BRANCH=qc-sec POS_QC_ALLOW_HOST="$MARK" "$@"
