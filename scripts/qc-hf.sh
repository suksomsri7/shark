#!/usr/bin/env bash
# qc-hf.sh — run a command against the HF-TENANT hotfix test database (17 Nov 2026)
#   host = HR lane-5 QC branch (ep-orange-dust-aotwbyc7, child of wo-pos-qc4) · database = hf_tenant (empty, main's schema only)
#   ฐานนี้แยกจาก neondb ของเลน — ห้ามชี้ไป neondb ของเลน, QC4 หรือ production · gate lock ของตัวเอง
# Use: bash scripts/iso.sh bash scripts/qc-hf.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-hf-tenant.mts
#      bash scripts/iso.sh bash scripts/qc-hf.sh pnpm exec prisma migrate deploy
set -euo pipefail
cd "$(dirname "$0")/.."
F=.env.qc-hf
[ -f "$F" ] || { echo "🔴 qc-hf: no $F in this tree (controller creates it)" >&2; exit 2; }
D="$(grep -m1 '^DIRECT_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
P="$(grep -m1 '^DATABASE_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
for U in "$D" "$P"; do
  [ -n "$U" ] || { echo "🔴 qc-hf: DATABASE_URL/DIRECT_URL empty — stop" >&2; exit 4; }
  case "$U" in *ep-royal-night*|*ep-plain-art*|*ep-cool-shadow*|*ep-weathered-river*|*ep-frosty-lab*) echo "🔴 qc-hf: URL is production/QC1/QC4 — stop" >&2; exit 4 ;; esac
  case "$U" in *://*) : ;; *) echo "🔴 qc-hf: URL has no scheme — stop" >&2; exit 4 ;; esac
  R="${U#*://}"; A="${R%%[/?#]*}"; H="${A##*@}"; H="${H%%:*}"; H="${H,,}"
  case "$H" in
    ep-orange-dust-aotwbyc7.*|ep-orange-dust-aotwbyc7-pooler.*) : ;;
    *) echo "🔴 qc-hf: host $H is not ep-orange-dust-aotwbyc7 — stop" >&2; exit 4 ;;
  esac
  DB="${R#*/}"; DB="${DB%%[?#]*}"
  [ "$DB" = "hf_tenant" ] || { echo "🔴 qc-hf: database '$DB' is not hf_tenant — stop" >&2; exit 4; }
done
exec env DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE="$F" GATE_LOCK_FILE=/tmp/shark-gate-hf-tenant.lock \
  QC_BRANCH=qc-hf HF_QC_HOST_MARK=ep-orange-dust-aotwbyc7 HF_QC_DB=hf_tenant POS_QC_ALLOW_HOST=ep-orange-dust-aotwbyc7 "$@"
