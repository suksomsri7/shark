#!/usr/bin/env bash
# C3.3-fix runner — QC1 only (env exactly like run-hunt33.sh) · one suite at a time · usage: run-c33fix.sh <script.mts> <label>
set -uo pipefail
cd /root/projects/shark-crm-c12a
S="$1"; L=".qc-shots/c33fix/$2.log"
mkdir -p .qc-shots/c33fix
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
bash scripts/iso.sh env DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all \
  bash scripts/with-gate-lock.sh pnpm exec tsx "$S" > "$L" 2>&1
echo "exit=$?" >> "$L"
grep -E "JSON_SUMMARY|🟢|🔴|FATAL|exit=" "$L" | tail -5
