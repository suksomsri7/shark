#!/usr/bin/env bash
# run5 = RELEASE-GATE RE-RUN (c42b it4 phase B · NOT launched by the lane — controller GO once, AFTER the last C5.5 card merges and
# :3215 is rebuilt from that final tip). Re-presses the surfaces whose UI/backend changed since the run4 build (ca78a54d = src
# 1d23347e): fix7 · G1 · fix9 · fix11 merged at triage time; fix10 · fix8 · G2 · fix12 · G3 pending ⇒ RE-DERIVE the list from
# `git diff --stat 1d23347e <final> -- src/app src/components src/lib/modules/crm src/lib/ai` before launching and add chunks.
# Reasons per chunk: ledger/wo-notes/crm-C4.2.md "it4 PHASE B — run4 triage". Runner + registry frozen (MD5 before every role).
# usage: systemd-run --unit=crm-c42b-run5 --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /tmp/c42b-logs/run5.sh
#   (copy first: cp scripts/pending/c42b/run5.sh /tmp/c42b-logs/run5.sh && bash -n /tmp/c42b-logs/run5.sh)
set -uo pipefail
S=/tmp/c42b-logs/run5.status; : > "$S"
R=/root/projects/shark-crm-c42b
echo "build at start: $(cat /root/projects/shark-crm/.qc-shots/crm/BUILD-STATE) (run-chunks waits per chunk for READY + server up)" >> "$S"
grep -qE '^READY.* (09de6435|ca78a54d) ' /root/projects/shark-crm/.qc-shots/crm/BUILD-STATE && { echo "3215 is still the run3/run4 build — rebuild from the final tip first" >> "$S"; exit 1; }
mkdir -p /tmp/c42b-logs; cp $R/scripts/pending/c42b/run-chunks.sh /tmp/c42b-logs/run-chunks.run5.sh
grep -q "IFS=';'" /tmp/c42b-logs/run-chunks.run5.sh || { echo "run-chunks.sh still splits CHUNKS_OVERRIDE on '|' — stop" >> "$S"; exit 1; }
md5sum $R/scripts/qc-crm-buttons.mts $R/scripts/crm-ui-inventory.json > /tmp/c42b-logs/run5.md5
cd $R && pnpm exec tsx scripts/pending/c42b/counts.mts /tmp/c42b-logs/counts-before-run5.json >/dev/null 2>&1
# ';'-separated (page regexes contain '|'). Chunk N ⇒ /tmp/c42b-logs/run5-<role>-summary-N.json
#  1 /contacts/[contactId] .. fix7 edit sheet (hidden primary company · `contact-edit-company-locked` · archived-company clear refused)
#                             · Thai date-time · fix9/fix11 PDPA privacy block text · contacts.ts · (pending fix10 DATE display)
#  2 /contacts .............. ContactListTools (fix7/fix9 export) · contacts.ts list
#  3 /contacts/new|duplicates|import  fix7 import entry kinds (ContactImportPanel) · F3 picker re-check
#  4 /deals ................. (pending fix10: list/board/CSV company names)
#  5 /deals/[dealId] ........ deals.ts fix7 · G1 AI buttons run as the caller (crm-ai-deal-*, crm-call-ai-*) · (pending fix10)
#  6 /deals/new ............. fix7 empty company option label (NewDealForm.tsx)
#  7 /settings .............. fix9/fix11 PDPA export/erase (privacy.ts · PrivacySettings crm-export-*)
#  8 /objects* .............. components/crm/objects/types.ts date-time formatting (fix7)
#  9 CRM home ............... G1 AI tools/proposals as the caller (crm-ai-*, crm-home-ai-*)
# 10 /settings/automation ... it4-B B5 (crm-auto-save opens a NOTIFY_STAFF rule — manager H55-2) on the final build
STAFF_CHUNKS='re:^/contacts/\[;re:^/contacts$;re:^/contacts/(new|duplicates|import)$;re:^/deals$;re:^/deals/\[;re:^/deals/new$;re:^/settings$;re:^/objects;re:^/app/sys/\[id\]$;re:^/settings/automation$'
for r in owner manager nok thana customer; do
  md5sum -c /tmp/c42b-logs/run5.md5 >/dev/null 2>&1 || { echo "runner/registry changed before $r — stop" >> "$S"; exit 1; }
  if [ "$r" = customer ]; then
    # portal.ts changed after run4 (fix7 Thai date-time formatter · fix9 PDPA export paging) — same page set as run4
    CHUNKS_OVERRIDE='re:^/(app|p|b|u)/' bash /tmp/c42b-logs/run-chunks.run5.sh "run5-$r" --user "$r"; rc=$?
  else
    CHUNKS_OVERRIDE="$STAFF_CHUNKS" bash /tmp/c42b-logs/run-chunks.run5.sh "run5-$r" --user "$r"; rc=$?
  fi
  echo "$r rc=$rc $(date -u +%H:%M:%S)" >> "$S"
done
cd $R && pnpm exec tsx scripts/pending/c42b/counts.mts /tmp/c42b-logs/counts-after-run5.json >/dev/null 2>&1
echo RUN5-ALLDONE >> "$S"
