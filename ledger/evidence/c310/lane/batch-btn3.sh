#!/usr/bin/env bash
# C3.10 lane resume 3: drag fix proof (same filter as btn-drag-ctl-pre) + 5c re-run with variant-level needs
set -u
R=/tmp/c310-logs/lane/run-iso.sh
S=/root/projects/shark-crm-c310/.qc-shots/crm/buttons-c310
X=CRM_EXPECTED_PATH=/root/projects/shark-crm-c310/scripts/crm-expected.json
EXTRA_ENV="$X QC_BTN_SHOTS=$S/drag-fixed QC_FAIL_DIR=$S/drag-fixed/fail" bash $R btn-drag-fixed pnpm exec tsx scripts/qc-crm-buttons.mts --page 're:^(/app/sys/.id.|/deals)(?!/)' --user owner
EXTRA_ENV="$X QC_BTN_SHOTS=$S/5c2 QC_FAIL_DIR=$S/5c2/fail" bash $R btn-5c2-manager-commissions pnpm exec tsx scripts/qc-crm-buttons.mts --page /settings/commissions --user manager
echo BATCH3-DONE $(date -u +%FT%TZ) >> /tmp/c310-logs/lane/batch-btn3.status
