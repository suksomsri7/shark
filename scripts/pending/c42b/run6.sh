#!/usr/bin/env bash
# run6 = the TARGETED RE-RUN of C4.1 + C4.2 exactly as the re-review after run5 defines it (crm-C4.2-review.md R7). NOT launched by the
# lane — the controller launches it after: fix15 is merged and :3215 is rebuilt from that tip (BUILD-STATE READY … ai=mock); next-it7 is
# promoted to scripts/ AND the next dir (md5-frozen); the RVR-2 orphan cleanup is applied or ruled. Same safety as run5.sh.
#   A run5 failures + fixtures: /settings/scoring · /deals · /objects/[key] · /emails/[threadKey] · /settings/api · /contacts/new ·
#     /settings/objects · /settings/pipelines · /activities
#   B fix15 surfaces: /contacts/[contactId] · /companies/[companyId] · /deals/[dealId] · /objects/[key]/[recordId] · /emails
#   C shared after-drain + it6 fixture interplay: CRM home /app/sys/[id] (+ chat CRM panel, POS register) · /calendar · /app/settings/teams
#   D customer: lock-out of every staff page of A–C (+E) and the portal /b/[slug]/* + /u/[token]
#   E five more registry pages drawn at random from the rest with the controller's SEED — the draw is written to the status file
#     BEFORE anything runs. All four staff roles × both viewports on A, B, C, E.
# PASS (R7 evidence): verdict.py over run6 (waiver list = next-it7/waivers-it7.json) PASS · tripwire CLEAN (0 crm.email.sent, 0
#   "[email"/"⨯" server-log lines, no delivery/LINE/push/payroll) · counts content checksums equal before/after · window-leftovers shows
#   only OutboxEvent / AuditLog (+ whatever the RVR-2 ruling allows) · the combined table run5(untouched pages) + run6 is written too.
# usage: cp scripts/pending/c42b/run6.sh /tmp/c42b-logs/run6.sh && bash -n /tmp/c42b-logs/run6.sh &&
#        systemd-run --unit=crm-c42b-run6 --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /tmp/c42b-logs/run6.sh <SEED>
set -uo pipefail
SEED="${1:-}"; [ -n "$SEED" ] || { echo "usage: run6.sh <seed>"; exit 2; }
S=/tmp/c42b-logs/run6.status; : > "$S"
R=/root/projects/shark-crm-c42b
NEXT="${NEXT_DIR:-$R/scripts/pending/c42b/next}"   # the promoted merge candidate (controller copies next-it7 here and into scripts/)
H="$R/scripts/pending/c42b/next-it7"                # helpers (verdict / counts / tripwire / waivers) — read-only tools, not the frozen pair
BS=/root/projects/shark-crm/.qc-shots/crm/BUILD-STATE
LOG="${QC_SERVER_LOG:-/root/projects/shark-crm/.qc-shots/acc-v2/server.log}"
echo "build at start: $(cat "$BS")" >> "$S"
# refuses the run3/run4/run5 builds (09de6435 · ca78a54d · e1caec03) — R7 needs the fix15 tip
grep -qE '^READY.* (09de6435|ca78a54d|e1caec03) ' "$BS" && { echo "3215 is still a run3/run4/run5 build — rebuild from the fix15 tip first" >> "$S"; exit 1; }
grep -q '^READY' "$BS" || { echo "3215 not READY — $(cat "$BS")" >> "$S"; exit 1; }
grep -q 'ai=mock' "$BS" || { echo "3215 not ai=mock — stop" >> "$S"; exit 1; }
mkdir -p /tmp/c42b-logs; cp $R/scripts/pending/c42b/next-it7/run-chunks.sh /tmp/c42b-logs/run-chunks.run6.sh
grep -q "IFS=';'" /tmp/c42b-logs/run-chunks.run6.sh || { echo "run-chunks.sh splits CHUNKS_OVERRIDE on '|' — stop" >> "$S"; exit 1; }
cmp -s $R/scripts/qc-crm-buttons.mts "$NEXT/qc-crm-buttons.mts" && cmp -s $R/scripts/crm-ui-inventory.json "$NEXT/crm-ui-inventory.json" \
  || { echo "scripts/ and $NEXT differ — the pass must run the promoted merge candidate · stop" >> "$S"; exit 1; }
grep -q 'it7 (RVR-1a)' $R/scripts/qc-crm-buttons.mts || { echo "scripts/qc-crm-buttons.mts is not the it7 runner (no structural guard) — promote next-it7 first · stop" >> "$S"; exit 1; }
md5sum $R/scripts/qc-crm-buttons.mts $R/scripts/crm-ui-inventory.json /tmp/c42b-logs/run-chunks.run6.sh > /tmp/c42b-logs/run6.md5
cat /tmp/c42b-logs/run6.md5 >> "$S"

# ── page groups ──
A='re:^/(settings/(scoring|api|objects|pipelines)|deals|contacts/new|activities)$;re:^/objects/\[key\]$;re:^/emails/\[threadKey\]$'
B='re:^/contacts/\[contactId\]$;re:^/companies/\[companyId\]$;re:^/deals/\[dealId\]$;re:^/(objects/\[key\]/\[recordId\]|emails)$'
C='re:^/(app/sys/\[id\](/pos/register)?|calendar|app/settings/teams)$'
DONE='^/(settings/(scoring|api|objects|pipelines)|deals|contacts/new|activities|objects/\[key\]|emails/\[threadKey\]|contacts/\[contactId\]|companies/\[companyId\]|deals/\[dealId\]|objects/\[key\]/\[recordId\]|emails|app/sys/\[id\]|app/sys/\[id\]/pos/register|calendar|app/settings/teams)$'
# E — the draw (seeded, recorded before the run): registry pages outside A–C and outside the portal/public pages (customer side = D)
E_PAGES=$(python3 - "$SEED" "$R/scripts/crm-ui-inventory.json" "$DONE" <<'PY'
import json, random, re, sys
seed, reg, done = sys.argv[1], sys.argv[2], re.compile(sys.argv[3])
pages = sorted({r['page'] for r in json.load(open(reg))['rows']})
rest = [p for p in pages if not done.match(p) and not re.match(r'^/(b|u|p)/', p) and not p.startswith('/app/sys/[id]/account/')]
print('\n'.join(random.Random(seed).sample(rest, 5)))
PY
)
echo "E draw (seed $SEED, before the run): $(echo "$E_PAGES" | tr '\n' ' ')" >> "$S"
E=$(echo "$E_PAGES" | python3 -c "import re,sys; print(';'.join('re:^' + re.escape(l.strip()) + '\$' for l in sys.stdin if l.strip()))")
STAFF_CHUNKS="$A;$B;$C;$E"
CUST_CHUNKS="$STAFF_CHUNKS;re:^/(b|u)/"
echo "chunks staff: $STAFF_CHUNKS" >> "$S"

# ── window start: counts (incl. the it7 tables) + server-log offset + DB-clock start for the tripwire ──
cd $R && pnpm exec tsx $H/counts.mts /tmp/c42b-logs/counts-before-run6.json >/dev/null 2>&1
LOG_OFF=$(stat -c %s "$LOG" 2>/dev/null || echo 0); START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "window start $START · server log offset $LOG_OFF" >> "$S"

for r in owner manager nok thana customer; do
  md5sum -c /tmp/c42b-logs/run6.md5 >/dev/null 2>&1 || { echo "runner/registry/chunk runner changed before $r — stop" >> "$S"; exit 1; }
  if [ "$r" = customer ]; then CH="$CUST_CHUNKS"; else CH="$STAFF_CHUNKS"; fi
  CHUNKS_OVERRIDE="$CH" bash /tmp/c42b-logs/run-chunks.run6.sh "run6-$r" --user "$r"; rc=$?
  echo "$r rc=$rc $(date -u +%H:%M:%S)" >> "$S"
done
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cd $R && pnpm exec tsx $H/counts.mts /tmp/c42b-logs/counts-after-run6.json >/dev/null 2>&1
python3 - /tmp/c42b-logs/counts-before-run6.json /tmp/c42b-logs/counts-after-run6.json >> "$S" <<'PY'
import json, sys
a, b = (json.load(open(x)) for x in sys.argv[1:3])
diff = sorted(k for k in set(a) | set(b) if k not in ('_at',) and a.get(k) != b.get(k) and not k.startswith(('OutboxEvent', 'AuditLog')))
print('counts before=after (excl. OutboxEvent/AuditLog counts):', 'YES' if not diff else 'NO — ' + ', '.join(diff))
PY
bash scripts/with-gate-lock.sh pnpm exec tsx $H/tripwire.mts "$START" "$LOG_OFF" "$END" > /tmp/c42b-logs/run6-tripwire.txt 2>&1; echo "tripwire rc=$? ($(tail -1 /tmp/c42b-logs/run6-tripwire.txt))" >> "$S"
bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c42b/review/window-leftovers.mts "$START" "$END" > /tmp/c42b-logs/run6-window-leftovers.txt 2>&1
echo "window-leftovers: $(grep -E '^  [A-Z]' /tmp/c42b-logs/run6-window-leftovers.txt | head -20 | tr '\n' ' ')" >> "$S"
python3 $H/verdict.py "/tmp/c42b-logs/run6-*-summary-*.json" --waivers $H/waivers-it7.json --out /tmp/c42b-logs/run6-verdict.json --list-vacuous > /tmp/c42b-logs/run6-verdict.txt 2>&1
python3 $H/verdict.py "/tmp/c42b-logs/run6-*-summary-*.json" --combine-base "/tmp/c42b-logs/run5-*-summary-*.json" --waivers $H/waivers-it7.json --out /tmp/c42b-logs/run6-combined-verdict.json --list-vacuous > /tmp/c42b-logs/run6-combined-verdict.txt 2>&1
grep -E '^(TOTAL|VERDICT)' /tmp/c42b-logs/run6-verdict.txt >> "$S"
echo "combined (run5 untouched pages + run6): $(grep -E '^VERDICT' /tmp/c42b-logs/run6-combined-verdict.txt)" >> "$S"
echo RUN6-ALLDONE >> "$S"
