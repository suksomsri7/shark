#!/usr/bin/env bash
# C4.2 it4 (c42b) chunk runner — usage: run-chunks.sh <label> <runner args…>   (copy per run: never edit while a unit runs)
# QC server 3215 is the controller's — never started/stopped/built here. Each chunk holds scripts/with-gate-lock.sh (QC1 lock).
set -uo pipefail
LABEL="$1"; shift
cd /root/projects/shark-crm-c42b
LD=/tmp/c42b-logs; L=$LD/$LABEL.log; [ -n "${APPEND:-}" ] || : > "$L"
grep -qE '^DATABASE_URL=.*ep-plain-art' .env.qc && grep -qE '^DIRECT_URL=.*ep-plain-art' .env.qc || { echo "not QC1" | tee -a "$L"; exit 1; }
export QC_FAIL_DIR="/root/projects/shark-crm-c42b/.qc-shots/c42b/$LABEL-fail" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all CRM_EXPECTED_PATH=/root/projects/shark-crm-c42b/scripts/crm-expected.json
BS=/root/projects/shark-crm/.qc-shots/crm/BUILD-STATE
if [ -z "${CHUNKS_OVERRIDE:-}" ]; then
  CHUNKS=('re:^/companies' 're:^/contacts$' 're:^/contacts/\[' 're:^/contacts/(new|duplicates|import)' 're:^/deals$' 're:^/deals/\[' 're:^/deals/new' 're:^/(activities|calendar|commissions|pipelines)' 're:^/(reports|emails|objects)' 're:^/settings/(api|assignment|automation|commissions)' 're:^/settings/(email|forms|holidays|integrations|lost-reasons|notifications|objects)' 're:^/settings($|/(pipelines|portal|quotas|scoring|sequences|stages|tracking|visibility))' 're:^/(app|p|b|u)/')
else
  # it4-B: separator ';' — page regexes contain '|' (run3 customer: 're:^/(app|p|b|u)/' was split into 4 broken regexes ⇒
  #   'Invalid regular expression: /^/(app/' FATAL + 3 empty chunks ⇒ the portal was never pressed)
  IFS=';' read -r -a CHUNKS <<< "$CHUNKS_OVERRIDE"
fi
mkdir -p .qc-shots/c42b
i=0
for c in "${CHUNKS[@]}"; do
  i=$((i+1))
  [ "$i" -lt "${START_CHUNK:-1}" ] && continue
  att=0; crash=0
  while :; do
    w=0; last=""
    while :; do
      st=$(head -c 200 "$BS" 2>/dev/null); up=1; curl -s -o /dev/null -m 10 http://127.0.0.1:3215/ || up=0
      case "$st" in READY*) [ "$up" = 1 ] && break;; esac
      [ "$st|$up" != "$last" ] && echo "== chunk $i $c WAIT $(date -u +%H:%M:%S) — BUILD-STATE: $st · server up=$up ==" >> "$L"; last="$st|$up"
      w=$((w+30)); [ "$w" -ge 14400 ] && { echo "== chunk $i $c GIVE UP after 4 h ==" >> "$L"; echo ALLDONE-INCOMPLETE >> "$L"; exit 3; }
      sleep 30
    done
    echo "== chunk $i $c $(date -u +%H:%M:%S) ==" >> "$L"
    out=$(mktemp -p "$LD" chunk-XXXX.log)
    bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-buttons.mts --page "$c" "$@" > "$out" 2>&1; rc=$?
    grep -vE 'SSL modes|libpq|pg-connection-string|sslmode=|postgresql.org/docs|trace-warnings|To prepare for this change|If you want' "$out" >> "$L"
    if ! grep -q "QC CRM v2 · C4.2" "$out" && [ "$att" -lt 6 ]; then
      att=$((att+1)); rm -f "$out"; echo "exit=$rc $(date -u +%H:%M:%S) — runner never started · retry $att/6" >> "$L"; sleep 60; continue
    fi
    # it4-A: browser died mid-chunk (run2 manager #1: ConnectionClosedError in newPage after 1 of 16 groups) ⇒ the runner's
    # CLEAN restore already ran — redo the chunk ONCE, keep the crashed summary beside it
    if [ "$crash" -lt 1 ] && grep -qE 'JSON_SUMMARY .*"fatal":"[^"]*(ConnectionClosedError|TargetCloseError|Target closed|Protocol error|Session closed)' "$out"; then
      crash=1; rm -f "$out"; echo "exit=$rc $(date -u +%H:%M:%S) — browser crashed mid-chunk · redo once" >> "$L"
      [ -f .qc-shots/crm/buttons/summary.json ] && mv .qc-shots/crm/buttons/summary.json "$LD/$LABEL-summary-$i-crash.json"
      sleep 30; continue
    fi
    rm -f "$out"; break
  done
  echo "exit=$rc $(date -u +%H:%M:%S)" >> "$L"
  [ -f .qc-shots/crm/buttons/summary.json ] && mv .qc-shots/crm/buttons/summary.json "$LD/$LABEL-summary-$i.json"
done
echo ALLDONE >> "$L"
