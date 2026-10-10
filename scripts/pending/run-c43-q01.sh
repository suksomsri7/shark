#!/usr/bin/env bash
# controller: re-run C4.3 part q01 (select-wait edit) + merge on main/QC1 · 28 Sep
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c43-accept2.log; : > "$L"
KEY=/root/projects/shark-crm/scripts/crm-expected.json
E="env QC_ENV_FILE=.env.qc CRM_EXPECTED_PATH=$KEY QC_BASE=http://127.0.0.1:3215"
echo "NOTE runner changed ⇒ merge refuses mixed runner versions; re-run ALL parts" >> "$L"
for spec in "oc1|--only-custom --form re:^(company-new|contact-new)-form$" "i1|--inproc" "q01|--browser-only --form re:^(company-new|contact-new|deal-new)-form$" "q02|--browser-only --form re:^(pl-new|st-new|lr-new)-form$" "q03|--browser-only --form re:^(activity-log|teams-create|team-member-add)-form$" "q04|--browser-only --form re:^(visibility-override|object-edit)-form$" "q05|--browser-only --form re:^(object-archive|object-add|object-view-save)-form$" "q06|--browser-only --form re:^(object-import|object-record)-form$" "q07|--browser-only --form re:^(crm-api-key-form|crm-api-hook-form)$" "q08|--browser-only --form re:^(crm-seq-new-form|crm-seq-holiday-form)$" "q09|--browser-only --form re:^(crm-seq-enroll-form|crm-seq-bulk-form)$" "q10|--browser-only --form re:^(crm-email-composer|crm-settings-team-room)$"; do
  p=${spec%%|*}; a=${spec#*|}; s=$(date +%s)
  $E bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-forms.mts --part "$p" $a > .qc-shots/crm/c43-accept2-$p.log 2>&1
  echo "PART $p exit=$? $(( $(date +%s)-s ))s $(grep -o 'JSON_SUMMARY.*' .qc-shots/crm/c43-accept2-$p.log | cut -c1-200)" >> "$L"
done
$E bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-forms.mts --merge > .qc-shots/crm/c43-accept2-merge.log 2>&1
echo "MERGE exit=$? $(grep -o 'JSON_SUMMARY.*' .qc-shots/crm/c43-accept2-merge.log | cut -c1-300)" >> "$L"; echo ALLDONE >> "$L"
