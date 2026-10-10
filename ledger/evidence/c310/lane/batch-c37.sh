#!/usr/bin/env bash
# C3.10 lane resume 3: item 7 — visual-crm 3.7 (owner, thana) then the c3.7 oracle; each its own iso unit
set -u
R=/tmp/c310-logs/lane/run-iso.sh
X=CRM_EXPECTED_PATH=/root/projects/shark-crm-c310/scripts/crm-expected.json
EXTRA_ENV="$X" bash $R visual-c37-owner pnpm exec tsx scripts/visual-crm.mts 3.7 --user owner
EXTRA_ENV="$X" bash $R visual-c37-thana pnpm exec tsx scripts/visual-crm.mts 3.7 --user thana
EXTRA_ENV="$X" bash $R c3.7-r3 pnpm exec tsx scripts/qc-crm-c3.7.mts
echo BATCHC37-DONE $(date -u +%FT%TZ) >> /tmp/c310-logs/lane/batch-c37.status
