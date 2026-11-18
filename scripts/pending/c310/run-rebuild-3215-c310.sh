#!/usr/bin/env bash
# C3.10 closing regression (7 Oct): rebuild QC1 server 3215 from the MAIN TREE HEAD (session/crm 02bfa7cb) · AI mock.
#   Copied from scripts/pending/run-rebuild-3215-c60.sh (never edit a running script). The previous server (pgid 886900,
#   cwd shark-crm-c42b) was stopped by the C3.10 lane before the reseed; this script refuses to go on if 3215 is busy.
set -uo pipefail
cd /root/projects/shark-crm
R=.qc-shots/crm/rebuild-c310; mkdir -p "$R" .qc-shots/acc-v2; S=.qc-shots/crm/BUILD-STATE; L="$R/run.log"; : > "$L"
echo "BUILDING $(date -u +%H:%M) $(git rev-parse --short HEAD)" > "$S"
export SHARK_AI_MOCK=1 WEBHOOK_ALLOW_PRIVATE=1
NODE_OPTIONS=--max-old-space-size=5120 bash scripts/acc-v2-serve.sh stop >>"$L" 2>&1
sleep 2
if ss -ltn 'sport = :3215' | grep -q LISTEN; then echo "FAILED $(date -u +%H:%M) port 3215 still busy after stop" > "$S"; ss -ltnp 'sport = :3215' >>"$L" 2>&1; exit 1; fi
NODE_OPTIONS=--max-old-space-size=5120 bash scripts/acc-v2-serve.sh >>"$L" 2>&1; rc=$?
if [ $rc -ne 0 ]; then echo "FAILED $(date -u +%H:%M) rc=$rc" > "$S"; exit 1; fi
NEWPID="$(cat .qc-shots/acc-v2/server.pid)"; LP="$(ss -ltnp 'sport = :3215' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
if [ -z "$LP" ] || [ "$(ps -o pgid= -p "$LP" | tr -d ' ')" != "$(ps -o pgid= -p "$NEWPID" | tr -d ' ')" ]; then
  echo "FAILED $(date -u +%H:%M) listener on 3215 (pid ${LP:-none}) is not the new server (pid $NEWPID)" > "$S"; exit 1
fi
echo "READY $(date -u +%H:%M) $(git rev-parse --short HEAD) port=3215 ai=mock webhook-private=on cwd=shark-crm" > "$S"
