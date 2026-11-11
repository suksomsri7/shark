#!/usr/bin/env bash
# qc-hr.sh — run a command against THIS lane's HR QC branch (child of wo-pos-qc4) — HR V2 RUN lanes only (11 Nov 2026)
#   Main gate stays QC4 via scripts/qc4.sh (controller run + post-merge). A WO is accepted only after its oracle re-ran on QC4.
# Use: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-<wo>.mts
set -euo pipefail
cd "$(dirname "$0")/.."
F=.env.qc-hr
[ -f "$F" ] || { echo "🔴 qc-hr: no $F in this tree (controller creates it per lane)" >&2; exit 2; }
D="$(grep -m1 '^DIRECT_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
P="$(grep -m1 '^DATABASE_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
MARK=""
for U in "$D" "$P"; do
  [ -n "$U" ] || { echo "🔴 qc-hr: DATABASE_URL/DIRECT_URL empty — stop" >&2; exit 4; }
  case "$U" in *://*) : ;; *) echo "🔴 qc-hr: URL has no scheme — stop" >&2; exit 4 ;; esac
  R="${U#*://}"; A="${R%%[/?#]*}"; H="${A##*@}"; H="${H%%:*}"; H="${H,,}"
  case "$H" in
    ep-nameless-sea-aokjm6d2.*|ep-nameless-sea-aokjm6d2-pooler.*) M=ep-nameless-sea-aokjm6d2 ;;
    ep-orange-dust-aotwbyc7.*|ep-orange-dust-aotwbyc7-pooler.*) M=ep-orange-dust-aotwbyc7 ;;
    ep-ancient-truth-ao56olit.*|ep-ancient-truth-ao56olit-pooler.*) M=ep-ancient-truth-ao56olit ;;
    *) echo "🔴 qc-hr: host $H is not an HR lane QC branch (scripts/hr-qc-hosts.mjs) — stop" >&2; exit 4 ;;
  esac
  [ -z "$MARK" ] || [ "$MARK" = "$M" ] || { echo "🔴 qc-hr: DATABASE_URL and DIRECT_URL point at different branches — stop" >&2; exit 4; }
  MARK=$M
done
exec env DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE="$F" GATE_LOCK_FILE="/tmp/shark-gate-hr-$MARK.lock" HR_QC_HOST_MARK="$MARK" POS_QC_ALLOW_HOST="$MARK" QC_BRANCH=qc-hr "$@"
