#!/usr/bin/env bash
# dbg2 (c42b it4 phase A): PROMOTED runner+registry (scripts/) — short targeted runs that verify S3/S5/S6/S7/S8/S9 + N1–N10
# and re-cover manager /companies (run2 manager chunk 1 died at 04:53) + (A4) C5.4-E lifecycle rows · N11 manager deal page · manager e-mail tab. One step at a time, each under the gate lock;
# separate shots dir (/tmp/c42b-logs/dbg2) so nothing of run2/run3 is touched. Counts before/after = restore proof.
# usage: systemd-run --unit=crm-c42b-dbg2 --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash scripts/pending/c42b/dbg2.sh [step…]
set -uo pipefail
cd /root/projects/shark-crm-c42b
LD=/tmp/c42b-logs; L=$LD/dbg2.log; S=$LD/dbg2.status; mkdir -p "$LD/dbg2"; : > "$S"
grep -qE '^DATABASE_URL=.*ep-plain-art' .env.qc && grep -qE '^DIRECT_URL=.*ep-plain-art' .env.qc || { echo "not QC1" | tee -a "$L"; exit 1; }
grep -q "^READY" /root/projects/shark-crm/.qc-shots/crm/BUILD-STATE || { echo "3215 build not READY — $(cat /root/projects/shark-crm/.qc-shots/crm/BUILD-STATE)" | tee -a "$L" "$S"; exit 1; }
export QC_BTN_SHOTS=$LD/dbg2 QC_FAIL_DIR=/root/projects/shark-crm-c42b/.qc-shots/c42b/dbg2-fail QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all CRM_EXPECTED_PATH=/root/projects/shark-crm-c42b/scripts/crm-expected.json
md5sum scripts/qc-crm-buttons.mts scripts/crm-ui-inventory.json > $LD/dbg2.md5
pnpm exec tsx scripts/pending/c42b/counts.mts $LD/counts-before-dbg2.json >/dev/null 2>&1
# name | page filter | user | device ("" = both)
STEPS=(
  "s3-title|re:^/deals/\[|owner|mobile"
  "s5-consent|re:^/contacts/\[|owner|mobile"
  "s9-board|re:^/deals\$|owner|mobile"
  "s4-activities|re:^/activities|owner|"
  "s6-email-owner|re:^/emails/|owner|"
  "s6-email-nok|re:^/emails/|nok|desktop"
  "s7-objects|re:^/objects/|owner|desktop"
  "s8-commissions|re:^/settings/commissions|owner|"
  "n-settings|re:^/settings(\$|/(pipelines|quotas|sequences|stages))|owner|"
  "n-teams|re:^/app/settings/teams|owner|"
  "n-home-chat-owner|re:^/app/sys/\[id\]\$|owner|"
  "n-home-chat-nok|re:^/app/sys/\[id\]\$|nok|desktop"
  "mgr-companies|re:^/companies|manager|"
  "e-lifecycle-owner|re:^/companies/\[|owner|"
  "n11-mgr-deal|re:^/deals/\[|manager|"
  "mgr-emails|re:^/emails|manager|desktop"
)
ONLY=" $* "
for st in "${STEPS[@]}"; do
  IFS='|' read -r name pg user dev <<< "$st"
  [ "$#" -gt 0 ] && [[ "$ONLY" != *" $name "* ]] && continue
  md5sum -c $LD/dbg2.md5 >/dev/null 2>&1 || { echo "runner/registry changed — stop before $name" >> "$S"; exit 1; }
  echo "== $name $pg $user ${dev:-both} $(date -u +%H:%M:%S) ==" >> "$L"
  args=(--page "$pg" --user "$user"); [ -n "$dev" ] && args+=(--device "$dev")
  rm -f $LD/dbg2/summary.json
  bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-buttons.mts "${args[@]}" 2>&1 | grep -vE 'SSL modes|libpq|pg-connection-string|sslmode=|postgresql.org/docs|trace-warnings|To prepare for this change|If you want' >> "$L"
  cp $LD/dbg2/summary.json "$LD/dbg2-summary-$name.json" 2>/dev/null
  echo "$name $(python3 -c "import json,sys;s=json.load(open(sys.argv[1]));print(f\"{s['passed']}/{s['total']} fatal={bool(s.get('fatal'))} restoreFail={sum(len(r.get('failed',[])) for r in s.get('restores',[]))}\")" "$LD/dbg2-summary-$name.json" 2>/dev/null || echo no-summary) $(date -u +%H:%M:%S)" >> "$S"
done
pnpm exec tsx scripts/pending/c42b/counts.mts $LD/counts-after-dbg2.json >/dev/null 2>&1
echo DBG2-DONE >> "$S"
