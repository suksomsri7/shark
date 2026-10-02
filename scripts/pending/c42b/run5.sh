#!/usr/bin/env bash
# run5 = THE RELEASE-GATE FULL PASS of C4.1 + C4.2 (it5 · ruling RV-10): ALL registry pages (13 chunks) × ALL 5 roles (owner · manager ·
# nok · thana · customer) × both viewports, ONE frozen runner/registry, on the FINAL build. NOT launched by the lane — the controller
# launches it once, after the last C5.5 card merges and :3215 is rebuilt from that tip. Refuses the run3/run4 builds.
#   · customer: portal rows + the it5 lock-out of every staff page (a portal session must be refused) — 13 chunks like the staff
#   · frozen md5 checked before every role (runner + registry + this lane's chunk runner)
#   · counts (row counts + per-table content checksums + chat tables) before/after · the runner itself re-reads every snapshotted
#     table after its final restore (verifyFailures) and fails on fixture leftovers (cleanupFailures) and unsettled outbox
#   · verdict = scripts/pending/c42b/verdict.py over all run5 summaries (pairing of absence passes ⇒ VACUOUS)
# PASS = passed == pressed · VACUOUS == 0 (or each ruled) · restore/cleanup/verify failures 0 · outbox settled · no fatal.
# usage: cp scripts/pending/c42b/run5.sh /tmp/c42b-logs/run5.sh && bash -n /tmp/c42b-logs/run5.sh &&
#        systemd-run --unit=crm-c42b-run5 --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /tmp/c42b-logs/run5.sh
set -uo pipefail
S=/tmp/c42b-logs/run5.status; : > "$S"
R=/root/projects/shark-crm-c42b
BS=/root/projects/shark-crm/.qc-shots/crm/BUILD-STATE
echo "build at start: $(cat "$BS") (run-chunks waits per chunk for READY + server up)" >> "$S"
grep -qE '^READY.* (09de6435|ca78a54d) ' "$BS" && { echo "3215 is still the run3/run4 build — rebuild from the final tip first" >> "$S"; exit 1; }
grep -q '^READY' "$BS" || { echo "3215 not READY — $(cat "$BS")" >> "$S"; exit 1; }
mkdir -p /tmp/c42b-logs; cp $R/scripts/pending/c42b/run-chunks.sh /tmp/c42b-logs/run-chunks.run5.sh
grep -q "IFS=';'" /tmp/c42b-logs/run-chunks.run5.sh || { echo "run-chunks.sh still splits CHUNKS_OVERRIDE on '|' — stop" >> "$S"; exit 1; }
md5sum $R/scripts/qc-crm-buttons.mts $R/scripts/crm-ui-inventory.json /tmp/c42b-logs/run-chunks.run5.sh > /tmp/c42b-logs/run5.md5
cat /tmp/c42b-logs/run5.md5 >> "$S"
cmp -s $R/scripts/qc-crm-buttons.mts $R/scripts/pending/c42b/next/qc-crm-buttons.mts && cmp -s $R/scripts/crm-ui-inventory.json $R/scripts/pending/c42b/next/crm-ui-inventory.json \
  || { echo "scripts/ and scripts/pending/c42b/next/ differ — the pass must run the merge candidate · stop" >> "$S"; exit 1; }
cd $R && pnpm exec tsx scripts/pending/c42b/counts.mts /tmp/c42b-logs/counts-before-run5.json >/dev/null 2>&1
# no CHUNKS_OVERRIDE = run-chunks' own 13 chunks (every registry page, exactly once)
for r in owner manager nok thana customer; do
  md5sum -c /tmp/c42b-logs/run5.md5 >/dev/null 2>&1 || { echo "runner/registry changed before $r — stop" >> "$S"; exit 1; }
  bash /tmp/c42b-logs/run-chunks.run5.sh "run5-$r" --user "$r"; rc=$?
  echo "$r rc=$rc $(date -u +%H:%M:%S)" >> "$S"
done
cd $R && pnpm exec tsx scripts/pending/c42b/counts.mts /tmp/c42b-logs/counts-after-run5.json >/dev/null 2>&1
python3 $R/scripts/pending/c42b/verdict.py "/tmp/c42b-logs/run5-*-summary-*.json" --out /tmp/c42b-logs/run5-verdict.json --list-vacuous > /tmp/c42b-logs/run5-verdict.txt 2>&1
grep -E '^(TOTAL|VERDICT)' /tmp/c42b-logs/run5-verdict.txt >> "$S"
echo RUN5-ALLDONE >> "$S"
