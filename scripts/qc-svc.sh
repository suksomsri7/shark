#!/usr/bin/env bash
# qc-svc.sh — run a command against the SVC RUN QC branch (`wo-svc-qc`, parent = wo-pos-qc4) — SVC RUN only (27 Oct 2026)
#   POS holds QC4/QC5, CRM holds QC1–QC3; SVC never touches those. Own gate lock /tmp/shark-gate-svc.lock.
# Use: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-<wo>.mts
set -euo pipefail
cd "$(dirname "$0")/.."
F=.env.qc-svc
[ -f "$F" ] || { echo "🔴 qc-svc: no $F" >&2; exit 2; }
D="$(grep -m1 '^DIRECT_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
P="$(grep -m1 '^DATABASE_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
# host check on the real hostname (between '@' and '/', ':' or '?'), not a substring of the whole URL — empty ⇒ exit 4
for U in "$D" "$P"; do
  [ -n "$U" ] || { echo "🔴 qc-svc: DATABASE_URL/DIRECT_URL empty — stop" >&2; exit 4; }
  case "$U" in *://*) : ;; *) echo "🔴 qc-svc: URL has no scheme — stop" >&2; exit 4 ;; esac
  R="${U#*://}"; A="${R%%[/?#]*}"; H="${A##*@}"; H="${H%%:*}"; H="${H,,}"
  [ -n "$H" ] || { echo "🔴 qc-svc: cannot read host — stop" >&2; exit 4; }
  case "$U" in *ep-royal-night*) echo "🔴 qc-svc: URL is production — stop" >&2; exit 4 ;; esac
  case "$H" in *ep-royal-night*|*ep-plain-art*|*ep-cool-shadow*|*ep-weathered-river*|*ep-frosty-lab*|*ep-fragrant-thunder*) echo "🔴 qc-svc: host $H is production or another RUN's QC — stop" >&2; exit 4 ;; esac
  case "$H" in ep-mute-scene*) : ;; *) echo "🔴 qc-svc: host $H is not SVC QC (ep-mute-scene) — stop" >&2; exit 4 ;; esac
done
# POS_QC_ALLOW_HOST: loadPosQcEnv accepts QC4 only unless told — SVC QC is intentional (prod/QC1–3 still refused first)
exec env DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE="$F" GATE_LOCK_FILE=/tmp/shark-gate-svc.lock QC_BRANCH=qc-svc POS_QC_ALLOW_HOST=ep-mute-scene "$@"
