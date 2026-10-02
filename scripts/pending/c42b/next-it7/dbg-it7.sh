#!/usr/bin/env bash
# dbg-it7 (c42b it7 · re-review after run5): targeted runs of the PROPOSED it7 runner+registry (scripts/pending/c42b/next-it7/) against the
# CURRENT :3215 — scripts/ + next/ stay frozen. One step at a time, each under the gate lock; own shots dir; counts (incl. the it7 tables)
# before/after; server-log offset + DB-clock window → the pass tripwire at the end.
# step = name ; page filter ; user ; device ("" = both) ; extra env (k=v,k=v — e.g. QC_BTN_FORCE_NOOP=crm-api-key-form)
# usage: cp …/dbg-it7.sh /tmp/c42b-logs/dbg-it7-<label>.sh && systemd-run --unit=crm-c42b-<label> --collect -p MemoryMax=6G \
#          --setenv=PATH="$PATH" --setenv=HOME=/root --setenv=DBG=<label> --setenv=STEPS_FILE=<file> bash /tmp/c42b-logs/dbg-it7-<label>.sh
set -uo pipefail
cd /root/projects/shark-crm-c42b
N=${DBG:?DBG label}; H=scripts/pending/c42b/next-it7
LD=/tmp/c42b-logs; L=$LD/$N.log; S=$LD/$N.status; mkdir -p "$LD/$N"; : > "$S"
grep -qE '^DATABASE_URL=.*ep-plain-art' .env.qc && grep -qE '^DIRECT_URL=.*ep-plain-art' .env.qc || { echo "not QC1" | tee -a "$L"; exit 1; }
grep -q "^READY" /root/projects/shark-crm/.qc-shots/crm/BUILD-STATE || { echo "3215 build not READY — $(cat /root/projects/shark-crm/.qc-shots/crm/BUILD-STATE)" | tee -a "$L" "$S"; exit 1; }
echo "build: $(head -c 200 /root/projects/shark-crm/.qc-shots/crm/BUILD-STATE)" >> "$S"
export QC_BTN_REGISTRY=$H/crm-ui-inventory.json QC_BTN_SHOTS=$LD/$N QC_FAIL_DIR=/root/projects/shark-crm-c42b/.qc-shots/c42b/$N-fail QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all CRM_EXPECTED_PATH=/root/projects/shark-crm-c42b/scripts/crm-expected.json
md5sum $H/qc-crm-buttons.mts $H/crm-ui-inventory.json > $LD/$N.md5
LOG=/root/projects/shark-crm/.qc-shots/acc-v2/server.log; LOG_OFF=$(stat -c %s "$LOG" 2>/dev/null || echo 0)
pnpm exec tsx $H/counts.mts $LD/counts-before-$N.json >/dev/null 2>&1
START=$(date -u +%Y-%m-%dT%H:%M:%SZ); echo "window start $START · server log offset $LOG_OFF" >> "$S"
mapfile -t STEPS < "${STEPS_FILE:?STEPS_FILE}"
for st in "${STEPS[@]}"; do
  [ -z "$st" ] && continue; [[ "$st" == \#* ]] && continue
  IFS=';' read -r name pg user dev envs <<< "$st"
  md5sum -c $LD/$N.md5 >/dev/null 2>&1 || { echo "runner/registry changed — stop before $name" >> "$S"; exit 1; }
  echo "== $name $pg $user ${dev:-both} ${envs:-} $(date -u +%H:%M:%S) ==" >> "$L"
  args=(--page "$pg" --user "$user"); [ -n "$dev" ] && args+=(--device "$dev")
  rm -f $LD/$N/summary.json
  envarr=(); [ -n "${envs:-}" ] && IFS=',' read -r -a envarr <<< "$envs"
  env "${envarr[@]}" bash scripts/with-gate-lock.sh pnpm exec tsx $H/qc-crm-buttons.mts "${args[@]}" 2>&1 | grep -vE 'SSL modes|libpq|pg-connection-string|sslmode=|postgresql.org/docs|trace-warnings|To prepare for this change|If you want' >> "$L"
  cp $LD/$N/summary.json "$LD/$N-summary-$name.json" 2>/dev/null
  echo "$name $(python3 -c "import json,sys;s=json.load(open(sys.argv[1]));print(f\"{s['passed']}/{s['total']} fatal={bool(s.get('fatal'))} restoreFail={sum(len(r.get('failed',[])) for r in s.get('restores',[]))} pageErrors={len(s.get('pageErrors') or [])} tripwire={len(s.get('tripwire') or [])} hiddenWait={s.get('hiddenWait')}\")" "$LD/$N-summary-$name.json" 2>/dev/null || echo no-summary) $(date -u +%H:%M:%S)" >> "$S"
done
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
pnpm exec tsx $H/counts.mts $LD/counts-after-$N.json >/dev/null 2>&1
bash scripts/with-gate-lock.sh pnpm exec tsx $H/tripwire.mts "$START" "$LOG_OFF" "$END" > $LD/$N-tripwire.txt 2>&1; echo "tripwire rc=$? $(tail -1 $LD/$N-tripwire.txt)" >> "$S"
echo "${N^^}-DONE" >> "$S"
