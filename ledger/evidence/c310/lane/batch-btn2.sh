#!/usr/bin/env bash
# C3.10 lane resume 3: 5b/5c/5d + 5a-all (each its own iso unit + gate lock; never nested)
set -u
R=/tmp/c310-logs/lane/run-iso.sh
S=/root/projects/shark-crm-c310/.qc-shots/crm/buttons-c310
X=CRM_EXPECTED_PATH=/root/projects/shark-crm-c310/scripts/crm-expected.json
EXTRA_ENV="$X QC_BTN_SHOTS=$S/5b QC_FAIL_DIR=$S/5b/fail" bash $R btn-5b-owner-automation pnpm exec tsx scripts/qc-crm-buttons.mts --page /settings/automation --user owner
EXTRA_ENV="$X QC_BTN_SHOTS=$S/5c QC_FAIL_DIR=$S/5c/fail" bash $R btn-5c-manager-commissions pnpm exec tsx scripts/qc-crm-buttons.mts --page /settings/commissions --user manager
EXTRA_ENV="$X QC_BTN_SHOTS=$S/5d QC_FAIL_DIR=$S/5d/fail" bash $R btn-5d-manager-automation pnpm exec tsx scripts/qc-crm-buttons.mts --page /settings/automation --user manager
EXTRA_ENV="$X QC_BTN_SHOTS=$S/5a-all QC_FAIL_DIR=$S/5a-all/fail" bash $R btn-5a-all-deals pnpm exec tsx scripts/qc-crm-buttons.mts --page /deals
echo BATCH2-DONE $(date -u +%FT%TZ) >> /tmp/c310-logs/lane/batch-btn2.status
