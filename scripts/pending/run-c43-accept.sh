#!/usr/bin/env bash
# controller: C4.3 ACCEPTANCE — full forms oracle on MAIN (committed c6fe26d2) · QC1 · server :3215 (build c6fe26d2) · all parts + locked merge · 28 Sep
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c43-accept.log; : > "$L"
KEY=/root/projects/shark-crm/scripts/crm-expected.json
mkdir -p .qc-shots/crm/forms/parts-prev-accept; mv .qc-shots/crm/forms/parts/*.json .qc-shots/crm/forms/parts-prev-accept/ 2>/dev/null
run() { local p=$1; shift; local s=$(date +%s)
  env QC_ENV_FILE=.env.qc CRM_EXPECTED_PATH=$KEY QC_BASE=http://127.0.0.1:3215 bash scripts/with-gate-lock.sh \
    pnpm exec tsx scripts/qc-crm-forms.mts --part "$p" "$@" > .qc-shots/crm/c43-accept-$p.log 2>&1
  echo "PART $p exit=$? $(( $(date +%s)-s ))s $(grep -o 'JSON_SUMMARY.*' .qc-shots/crm/c43-accept-$p.log | cut -c1-240)" >> "$L"
}
run oc1 --only-custom --form 're:^(company-new|contact-new)-form$'
run i1 --inproc
run q01 --browser-only --form 're:^(company-new|contact-new|deal-new)-form$'
run q02 --browser-only --form 're:^(pl-new|st-new|lr-new)-form$'
run q03 --browser-only --form 're:^(activity-log|teams-create|team-member-add)-form$'
run q04 --browser-only --form 're:^(visibility-override|object-edit)-form$'
run q05 --browser-only --form 're:^(object-archive|object-add|object-view-save)-form$'
run q06 --browser-only --form 're:^(object-import|object-record)-form$'
run q07 --browser-only --form 're:^(crm-api-key-form|crm-api-hook-form)$'
run q08 --browser-only --form 're:^(crm-seq-new-form|crm-seq-holiday-form)$'
run q09 --browser-only --form 're:^(crm-seq-enroll-form|crm-seq-bulk-form)$'
run q10 --browser-only --form 're:^(crm-email-composer|crm-settings-team-room)$'
env QC_ENV_FILE=.env.qc CRM_EXPECTED_PATH=$KEY QC_BASE=http://127.0.0.1:3215 bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-forms.mts --merge > .qc-shots/crm/c43-accept-merge.log 2>&1
echo "MERGE exit=$? $(grep -o 'JSON_SUMMARY.*' .qc-shots/crm/c43-accept-merge.log | cut -c1-300)" >> "$L"
echo ALLDONE >> "$L"
