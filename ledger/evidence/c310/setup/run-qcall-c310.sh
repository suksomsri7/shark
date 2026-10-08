#!/usr/bin/env bash
# C3.10 closing regression (7 Oct): pnpm qc:all on QC1 from the main tree (session/crm 02bfa7cb) under the gate lock,
#   against the :3215 server rebuilt from the same HEAD. Pattern: scripts/pending/run-c2-qcall.sh (+ gate lock, AI mock).
set -uo pipefail
cd /root/projects/shark-crm
L=/tmp/c310-logs/qc-all.log; : > "$L"; ST=/tmp/c310-logs/status.txt
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P" in *ep-plain-art*) ;; *) echo "DATABASE_URL not QC1 — stop" | tee -a "$L"; exit 1;; esac
case "$D" in *ep-plain-art*) ;; *) echo "DIRECT_URL not QC1 — stop" | tee -a "$L"; exit 1;; esac
echo "host ok: QC1 · HEAD $(git rev-parse --short HEAD) · $(cat .qc-shots/crm/BUILD-STATE) · start $(date -u +%FT%TZ)" | tee -a "$L"
echo "$(date -u +%FT%TZ) step4 qc:all started" >> "$ST"
touch /tmp/c310-logs/qcall.start-marker
env DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:3215 SHARK_AI_MOCK=1 \
  bash scripts/with-gate-lock.sh pnpm qc:all >>"$L" 2>&1
rc=$?
echo "exit=$rc end $(date -u +%FT%TZ)" | tee -a "$L"
echo "$(date -u +%FT%TZ) step4 qc:all finished rc=$rc" >> "$ST"
mkdir -p /tmp/c310-logs/suites && find /tmp/claude-0/qc-all -name '*.log' -newer /tmp/c310-logs/qcall.start-marker -exec cp {} /tmp/c310-logs/suites/ \;
echo ALLDONE | tee -a "$L"
