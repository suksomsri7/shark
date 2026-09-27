#!/usr/bin/env bash
# C3.3 money bug hunt probe runner — QC1 only (env exactly like run-c33-verify.sh) · one probe at a time
set -uo pipefail
cd /root/projects/shark-crm
PROBE="${1:-scripts/pending/probe-hunt33.mts}"
L=".qc-shots/hunt33/$(basename "$PROBE" .mts).log"
mkdir -p .qc-shots/hunt33
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
bash scripts/iso.sh env DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all \
  bash scripts/with-gate-lock.sh pnpm exec tsx "$PROBE" > "$L" 2>&1
echo "exit=$?" >> "$L"
grep -E "RESULT|SUMMARY|clean|FATAL|exit=" "$L"
