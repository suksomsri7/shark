#!/usr/bin/env bash
# dbg3 (c42b it4 phase A · after dbg2 — separator ';' because page regexes contain '|' (dbg2 n-settings never ran)): PROMOTED runner+registry (scripts/) — short targeted runs that verify S3/S5/S6/S7/S8/S9 + N1–N10
# and re-cover manager /companies (run2 manager chunk 1 died at 04:53) + (A4) C5.4-E lifecycle rows · N11 manager deal page · manager e-mail tab. One step at a time, each under the gate lock;
# separate shots dir (/tmp/c42b-logs/dbg3) so nothing of run2/run3 is touched. Counts before/after = restore proof.
# usage: systemd-run --unit=crm-c42b-dbg3 --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash scripts/pending/c42b/dbg3.sh [step…]
set -uo pipefail
cd /root/projects/shark-crm-c42b
LD=/tmp/c42b-logs; L=$LD/dbg3.log; S=$LD/dbg3.status; mkdir -p "$LD/dbg3"; : > "$S"
grep -qE '^DATABASE_URL=.*ep-plain-art' .env.qc && grep -qE '^DIRECT_URL=.*ep-plain-art' .env.qc || { echo "not QC1" | tee -a "$L"; exit 1; }
grep -q "^READY" /root/projects/shark-crm/.qc-shots/crm/BUILD-STATE || { echo "3215 build not READY — $(cat /root/projects/shark-crm/.qc-shots/crm/BUILD-STATE)" | tee -a "$L" "$S"; exit 1; }
export QC_BTN_SHOTS=$LD/dbg3 QC_FAIL_DIR=/root/projects/shark-crm-c42b/.qc-shots/c42b/dbg3-fail QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all CRM_EXPECTED_PATH=/root/projects/shark-crm-c42b/scripts/crm-expected.json
md5sum scripts/qc-crm-buttons.mts scripts/crm-ui-inventory.json > $LD/dbg3.md5
pnpm exec tsx scripts/pending/c42b/counts.mts $LD/counts-before-dbg3.json >/dev/null 2>&1
# name | page filter | user | device ("" = both)
STEPS=(
  "s9-board;re:^/deals\$;owner;mobile"
  "s6-email-owner;re:^/emails/;owner;"
  "n-settings;re:^/settings(\$|/(pipelines|quotas|sequences|stages));owner;"
  "n-teams;re:^/app/settings/teams;owner;"
  "n-home-chat-owner;re:^/app/sys/\[id\]\$;owner;desktop"
  "n-home-chat-nok;re:^/app/sys/\[id\]\$;nok;desktop"
  "mgr-emails;re:^/emails;manager;desktop"
)
ONLY=" $* "
for st in "${STEPS[@]}"; do
  IFS=';' read -r name pg user dev <<< "$st"
  [ "$#" -gt 0 ] && [[ "$ONLY" != *" $name "* ]] && continue
  md5sum -c $LD/dbg3.md5 >/dev/null 2>&1 || { echo "runner/registry changed — stop before $name" >> "$S"; exit 1; }
  echo "== $name $pg $user ${dev:-both} $(date -u +%H:%M:%S) ==" >> "$L"
  args=(--page "$pg" --user "$user"); [ -n "$dev" ] && args+=(--device "$dev")
  rm -f $LD/dbg3/summary.json
  bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-buttons.mts "${args[@]}" 2>&1 | grep -vE 'SSL modes|libpq|pg-connection-string|sslmode=|postgresql.org/docs|trace-warnings|To prepare for this change|If you want' >> "$L"
  cp $LD/dbg3/summary.json "$LD/dbg3-summary-$name.json" 2>/dev/null
  echo "$name $(python3 -c "import json,sys;s=json.load(open(sys.argv[1]));print(f\"{s['passed']}/{s['total']} fatal={bool(s.get('fatal'))} restoreFail={sum(len(r.get('failed',[])) for r in s.get('restores',[]))}\")" "$LD/dbg3-summary-$name.json" 2>/dev/null || echo no-summary) $(date -u +%H:%M:%S)" >> "$S"
done
pnpm exec tsx scripts/pending/c42b/counts.mts $LD/counts-after-dbg3.json >/dev/null 2>&1
echo DBG2-DONE >> "$S"
