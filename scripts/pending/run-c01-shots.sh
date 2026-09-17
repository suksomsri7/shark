#!/usr/bin/env bash
# C0.1 — build QC server + prove visual-crm.mts on the three CRM v1 pages (controller step 10)
set -uo pipefail
cd /root/projects/shark-crm
LOG=.qc-shots/crm/c01-run.log
: > "$LOG"
echo "== $(date -u +%H:%M:%S) build+start QC server ==" | tee -a "$LOG"
bash scripts/acc-v2-serve.sh >>"$LOG" 2>&1
echo "serve exit=$?" | tee -a "$LOG"
for u in owner manager thana nok; do
  echo "== $(date -u +%H:%M:%S) visual-crm 0.1 --user $u ==" | tee -a "$LOG"
  pnpm exec tsx scripts/visual-crm.mts 0.1 --user "$u" >>"$LOG" 2>&1
  echo "visual($u) exit=$?" | tee -a "$LOG"
done
echo "== $(date -u +%H:%M:%S) stop ==" | tee -a "$LOG"
bash scripts/acc-v2-serve.sh stop >>"$LOG" 2>&1
echo "DONE" | tee -a "$LOG"
