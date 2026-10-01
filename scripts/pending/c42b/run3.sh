#!/usr/bin/env bash
# run3 = FINAL FULL PASS (c42b it4 · after phase A · NOT launched by the lane — controller GO): owner → manager → nok → thana (13 chunks × 1440/390) → customer (portal chunk; other chunks
# plan 0 customer rows). Runner + registry frozen: MD5 checked before every role. Counts before/after for the restore proof.
set -uo pipefail
S=/tmp/c42b-logs/run3.status; : > "$S"
R=/root/projects/shark-crm-c42b
echo "build at start: $(cat /root/projects/shark-crm/.qc-shots/crm/BUILD-STATE) (run-chunks waits per chunk for READY + server up)" >> "$S"
mkdir -p /tmp/c42b-logs; cp $R/scripts/pending/c42b/run-chunks.sh /tmp/c42b-logs/run-chunks.run3.sh
md5sum $R/scripts/qc-crm-buttons.mts $R/scripts/crm-ui-inventory.json > /tmp/c42b-logs/run3.md5
cd $R && pnpm exec tsx scripts/pending/c42b/counts.mts /tmp/c42b-logs/counts-before-run3.json >/dev/null 2>&1
for r in owner manager nok thana customer; do
  md5sum -c /tmp/c42b-logs/run3.md5 >/dev/null 2>&1 || { echo "runner/registry changed before $r — stop" >> "$S"; exit 1; }
  if [ "$r" = customer ]; then
    CHUNKS_OVERRIDE='re:^/(app|p|b|u)/' bash /tmp/c42b-logs/run-chunks.run3.sh "run3-$r" --user "$r"; rc=$?
  else
    bash /tmp/c42b-logs/run-chunks.run3.sh "run3-$r" --user "$r"; rc=$?
  fi
  echo "$r rc=$rc $(date -u +%H:%M:%S)" >> "$S"
done
cd $R && pnpm exec tsx scripts/pending/c42b/counts.mts /tmp/c42b-logs/counts-after-run3.json >/dev/null 2>&1
echo RUN3-ALLDONE >> "$S"
