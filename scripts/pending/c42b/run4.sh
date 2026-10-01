#!/usr/bin/env bash
# run4 = PARTIAL RE-RUN after run3 (c42b it4 phase B · NOT launched by the lane — controller GO after :3215 is rebuilt from the
# session/crm tip that carries C5.5-fix1/2/3a/3b/4). Re-presses only the surfaces whose product code changed since the run3 build
# (09de6435) + the surfaces whose runner/registry rows changed in it4-B. Reasons per chunk: ledger/wo-notes/crm-C4.2.md
# "it4 PHASE B — run3 triage". Runner + registry frozen (MD5 before every role) · counts before/after = restore proof.
# usage: systemd-run --unit=crm-c42b-run4 --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /tmp/c42b-logs/run4.sh
#   (copy first: cp scripts/pending/c42b/run4.sh /tmp/c42b-logs/run4.sh && bash -n /tmp/c42b-logs/run4.sh)
set -uo pipefail
S=/tmp/c42b-logs/run4.status; : > "$S"
R=/root/projects/shark-crm-c42b
echo "build at start: $(cat /root/projects/shark-crm/.qc-shots/crm/BUILD-STATE) (run-chunks waits per chunk for READY + server up)" >> "$S"
grep -q '^READY.* 09de6435 ' /root/projects/shark-crm/.qc-shots/crm/BUILD-STATE && { echo "3215 is still the run3 build 09de6435 — rebuild from the tip first" >> "$S"; exit 1; }
mkdir -p /tmp/c42b-logs; cp $R/scripts/pending/c42b/run-chunks.sh /tmp/c42b-logs/run-chunks.run4.sh
grep -q "IFS=';'" /tmp/c42b-logs/run-chunks.run4.sh || { echo "run-chunks.sh still splits CHUNKS_OVERRIDE on '|' — stop" >> "$S"; exit 1; }
md5sum $R/scripts/qc-crm-buttons.mts $R/scripts/crm-ui-inventory.json > /tmp/c42b-logs/run4.md5
cd $R && pnpm exec tsx scripts/pending/c42b/counts.mts /tmp/c42b-logs/counts-before-run4.json >/dev/null 2>&1
# ';'-separated (page regexes contain '|'). Chunk N ⇒ /tmp/c42b-logs/run4-<role>-summary-N.json
#  1 /companies* ............ fix2 F1 gate (list + 360 crmCan · nav) · ciEquals industry filter · fix3b timeline badge
#  2 /activities ............ C5.5 L55-3 reschedule = crm.activity.complete only · delete = crm.activity.delete · it4-B nok fixture
#  3 /emails* ............... fix2 attribution + unverified badge · listThreads/getThread/assertUnmatchedGate · fix4 sanitizer
#  4 /settings/api|automation|email  fix1 webhook choke point + L55-4 wider-than-creator gate · H55-2 automation rule verdict
#                             (branch-limited manager, RV-7) · fix2 reply-to/copy-to must be outside SHARK
#  5 /settings/sequences* · /settings/portal   H55-2 sequence editor step keys · fix2 portal invite lock
#  6 /contacts (list) ....... it4-B registry B1 (export dialog rows hidden for nok/thana)
#  7 /contacts/new .......... it4-B registry B2 (company picker hidden for nok/thana ⇒ hiddenLeak = PRODUCT F3 until fixed)
#  9 /deals/new · 10 /contacts/[contactId]*  C5.5-fix6: company picker / move-deals hidden without crm.company read+update (controller, after triage)
#  8 CRM home ............... fix3a/3b at-risk Thai-day (crm-ai-home-at-risk · crm-ai-at-risk-deal-*)
STAFF_CHUNKS='re:^/companies;re:^/activities$;re:^/emails;re:^/settings/(api|automation|email)$;re:^/settings/(sequences|portal);re:^/contacts$;re:^/contacts/new$;re:^/app/sys/\[id\]$;re:^/deals/new$;re:^/contacts/\['
for r in owner manager nok thana customer; do
  md5sum -c /tmp/c42b-logs/run4.md5 >/dev/null 2>&1 || { echo "runner/registry changed before $r — stop" >> "$S"; exit 1; }
  if [ "$r" = customer ]; then
    # run3 never pressed the portal (CHUNKS_OVERRIDE split on '|' ⇒ FATAL bad regex) + portal.ts changed (fix2 lock · fix3b DATETIME)
    # same page set run3 planned for the customer (portal pages + hidden checks on /app pages)
    CHUNKS_OVERRIDE='re:^/(app|p|b|u)/' bash /tmp/c42b-logs/run-chunks.run4.sh "run4-$r" --user "$r"; rc=$?
  else
    CHUNKS_OVERRIDE="$STAFF_CHUNKS" bash /tmp/c42b-logs/run-chunks.run4.sh "run4-$r" --user "$r"; rc=$?
  fi
  echo "$r rc=$rc $(date -u +%H:%M:%S)" >> "$S"
done
cd $R && pnpm exec tsx scripts/pending/c42b/counts.mts /tmp/c42b-logs/counts-after-run4.json >/dev/null 2>&1
echo RUN4-ALLDONE >> "$S"
