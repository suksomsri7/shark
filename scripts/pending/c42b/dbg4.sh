#!/usr/bin/env bash
# dbg4 (c42b it4 phase B · run3 triage): targeted runs on the it4-B runner+registry (scripts/) against the CURRENT :3215 (whatever
# build is READY — logged) — verifies the it4-B fixes and reproduces the run3 non-passes in isolation. One step at a time, each
# under the gate lock; separate shots dir (/tmp/c42b-logs/dbg4) so nothing of run3 is touched. Counts before/after = restore proof.
# usage: systemd-run --unit=crm-c42b-dbg4 --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash scripts/pending/c42b/dbg4.sh [step…]
set -uo pipefail
cd /root/projects/shark-crm-c42b
N=${DBG:-dbg4} # DBG=dbg5 … = a later pass of the same steps under its own label (logs/status/summaries never overwrite an earlier pass)
LD=/tmp/c42b-logs; L=$LD/$N.log; S=$LD/$N.status; mkdir -p "$LD/$N"; : > "$S"
grep -qE '^DATABASE_URL=.*ep-plain-art' .env.qc && grep -qE '^DIRECT_URL=.*ep-plain-art' .env.qc || { echo "not QC1" | tee -a "$L"; exit 1; }
grep -q "^READY" /root/projects/shark-crm/.qc-shots/crm/BUILD-STATE || { echo "3215 build not READY — $(cat /root/projects/shark-crm/.qc-shots/crm/BUILD-STATE)" | tee -a "$L" "$S"; exit 1; }
echo "build: $(head -c 200 /root/projects/shark-crm/.qc-shots/crm/BUILD-STATE)" >> "$S"
export QC_BTN_SHOTS=$LD/$N QC_FAIL_DIR=/root/projects/shark-crm-c42b/.qc-shots/c42b/$N-fail QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all CRM_EXPECTED_PATH=/root/projects/shark-crm-c42b/scripts/crm-expected.json
md5sum scripts/qc-crm-buttons.mts scripts/crm-ui-inventory.json > $LD/$N.md5
pnpm exec tsx scripts/pending/c42b/counts.mts $LD/counts-before-$N.json >/dev/null 2>&1
# name ; page filter ; user ; device ("" = both)   (separator ';' — page regexes contain '|')
STEPS=(
  "act-nok;re:^/activities\$;nok;"
  "contacts-nok;re:^/contacts\$;nok;desktop"
  "contacts-thana;re:^/contacts\$;thana;mobile"
  "contacts-owner;re:^/contacts\$;owner;"
  "contacts-new-nok;re:^/contacts/new\$;nok;desktop"
  "optout-mgr;re:^/contacts/\[;manager;mobile"
  "portal-customer;re:^/(b|u|p)/;customer;"
  "auto-mgr;re:^/settings/automation\$;manager;"
  "auto-owner;re:^/settings/automation\$;owner;desktop"
  "contact360-mgr;re:^/contacts/\[;manager;"
)
ONLY=" $* "
for st in "${STEPS[@]}"; do
  IFS=';' read -r name pg user dev <<< "$st"
  [ "$#" -gt 0 ] && [[ "$ONLY" != *" $name "* ]] && continue
  md5sum -c $LD/$N.md5 >/dev/null 2>&1 || { echo "runner/registry changed — stop before $name" >> "$S"; exit 1; }
  echo "== $name $pg $user ${dev:-both} $(date -u +%H:%M:%S) ==" >> "$L"
  args=(--page "$pg" --user "$user"); [ -n "$dev" ] && args+=(--device "$dev")
  rm -f $LD/$N/summary.json
  bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-buttons.mts "${args[@]}" 2>&1 | grep -vE 'SSL modes|libpq|pg-connection-string|sslmode=|postgresql.org/docs|trace-warnings|To prepare for this change|If you want' >> "$L"
  cp $LD/$N/summary.json "$LD/$N-summary-$name.json" 2>/dev/null
  echo "$name $(python3 -c "import json,sys;s=json.load(open(sys.argv[1]));print(f\"{s['passed']}/{s['total']} fatal={bool(s.get('fatal'))} restoreFail={sum(len(r.get('failed',[])) for r in s.get('restores',[]))}\")" "$LD/$N-summary-$name.json" 2>/dev/null || echo no-summary) $(date -u +%H:%M:%S)" >> "$S"
done
pnpm exec tsx scripts/pending/c42b/counts.mts $LD/counts-after-$N.json >/dev/null 2>&1
echo "${N^^}-DONE" >> "$S"
