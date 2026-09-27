#!/usr/bin/env bash
# run-hunt39.sh <probe-name> — env loaded exactly like run-c39-verify.sh (QC1 only · CRM_V2_SWITCH=all) · launch through iso.sh
#   bash scripts/iso.sh bash scripts/pending/run-hunt39.sh probe-hunt39
set -uo pipefail
cd /root/projects/shark-crm
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
mkdir -p .qc-shots/hunt39
bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/pending/$1.mts" 2>&1 | tee ".qc-shots/hunt39/$1.log"
