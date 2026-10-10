#!/usr/bin/env bash
# run7 = C4.2-fix-linkhosts targeted run (7 Oct): /settings/tracking only (crm-link-create + the 3 C6.1-LINKPOLICY rows live
#   there), roles owner manager nok thana (the page has no customer rows), both viewports. QC1 only. The runner under test is
#   the lane's scripts/qc-crm-buttons.mts (linkHosts fixture + linkhosts-input fill rule). Server :3215 = lane rebuild
#   (BUILD-STATE in the lane worktree, server log in the lane worktree).
# usage: bash -n /tmp/c42b-logs/run7.sh && systemd-run --unit=crm-c42b-run7 --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /tmp/c42b-logs/run7.sh <SEED>
set -uo pipefail
SEED="${1:-}"; [ -n "$SEED" ] || { echo "usage: run7.sh <seed>"; exit 2; }
S=/tmp/c42b-logs/run7.status; : > "$S"
R=/root/projects/shark-crm-c42b
H="$R/scripts/pending/c42b/next-it7"
BS=$R/.qc-shots/crm/BUILD-STATE
export QC_SERVER_LOG=$R/.qc-shots/acc-v2/server.log
echo "seed $SEED (no random draw in run7 — recorded for the ledger) · build at start: $(cat "$BS")" >> "$S"
grep -q '^READY' "$BS" || { echo "3215 not READY — $(cat "$BS")" >> "$S"; exit 1; }
grep -q 'ai=mock' "$BS" || { echo "3215 not ai=mock — stop" >> "$S"; exit 1; }
grep -q 'cwd=shark-crm-c42b' "$BS" || { echo "3215 not the lane rebuild — stop" >> "$S"; exit 1; }
grep -q "FIX_LINK_HOSTS" $R/scripts/qc-crm-buttons.mts || { echo "runner lacks the linkHosts fixture — stop" >> "$S"; exit 1; }
md5sum $R/scripts/qc-crm-buttons.mts $R/scripts/crm-ui-inventory.json /tmp/c42b-logs/run-chunks.run7.sh > /tmp/c42b-logs/run7.md5
cat /tmp/c42b-logs/run7.md5 >> "$S"
CH='re:^/settings/tracking$'
echo "chunks staff: $CH" >> "$S"
cd $R && pnpm exec tsx $H/counts.mts /tmp/c42b-logs/counts-before-run7.json >/dev/null 2>&1
LOG_OFF=$(stat -c %s "$QC_SERVER_LOG" 2>/dev/null || echo 0); START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "window start $START · server log offset $LOG_OFF" >> "$S"
for r in owner manager nok thana; do
  md5sum -c /tmp/c42b-logs/run7.md5 >/dev/null 2>&1 || { echo "runner/registry/chunk runner changed before $r — stop" >> "$S"; exit 1; }
  CHUNKS_OVERRIDE="$CH" bash /tmp/c42b-logs/run-chunks.run7.sh "run7-$r" --user "$r"; rc=$?
  echo "$r rc=$rc $(date -u +%H:%M:%S)" >> "$S"
done
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cd $R && pnpm exec tsx $H/counts.mts /tmp/c42b-logs/counts-after-run7.json >/dev/null 2>&1
python3 - /tmp/c42b-logs/counts-before-run7.json /tmp/c42b-logs/counts-after-run7.json >> "$S" <<'PY'
import json, sys
a, b = (json.load(open(x)) for x in sys.argv[1:3])
diff = sorted(k for k in set(a) | set(b) if k not in ('_at',) and a.get(k) != b.get(k) and not k.startswith(('OutboxEvent', 'AuditLog')))
print('counts before=after (excl. OutboxEvent/AuditLog counts):', 'YES' if not diff else 'NO — ' + ', '.join(diff))
PY
bash scripts/with-gate-lock.sh pnpm exec tsx $H/tripwire.mts "$START" "$LOG_OFF" "$END" > /tmp/c42b-logs/run7-tripwire.txt 2>&1; echo "tripwire rc=$? ($(tail -1 /tmp/c42b-logs/run7-tripwire.txt))" >> "$S"
bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c42b/review/window-leftovers.mts "$START" "$END" > /tmp/c42b-logs/run7-window-leftovers.txt 2>&1
echo "window-leftovers: $(grep -E '^  [A-Z]' /tmp/c42b-logs/run7-window-leftovers.txt | head -20 | tr '\n' ' ')" >> "$S"
python3 $H/verdict.py "/tmp/c42b-logs/run7-*-summary-*.json" --waivers $H/waivers-it7.json --out /tmp/c42b-logs/run7-verdict.json --list-vacuous > /tmp/c42b-logs/run7-verdict.txt 2>&1
python3 $H/verdict.py "/tmp/c42b-logs/run7-*-summary-*.json" --combine-base "/tmp/c42b-logs/run6-*-summary-*.json" --waivers $H/waivers-it7.json --out /tmp/c42b-logs/run7-combined-verdict.json --list-vacuous > /tmp/c42b-logs/run7-combined-verdict.txt 2>&1
grep -E '^(TOTAL|VERDICT)' /tmp/c42b-logs/run7-verdict.txt >> "$S"
echo "combined (run6 untouched pages + run7): $(grep -E '^VERDICT' /tmp/c42b-logs/run7-combined-verdict.txt)" >> "$S"
echo RUN7-ALLDONE >> "$S"
