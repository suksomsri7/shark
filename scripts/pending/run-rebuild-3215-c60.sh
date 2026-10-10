#!/usr/bin/env bash
# C4.2-fix-linkhosts lane (7 Oct): rebuild QC1 server 3215 from the lane worktree (wip/crm-c42b = session/crm tip incl.
#   C6.1-LINKPOLICY merged) for run7 · AI mock. Copied from run-rebuild-3215-fix15.sh (never edit a running script).
# The old server (2f5e411b) was started from /root/projects/shark-crm ⇒ its pid file lives there, not here. Adopt that pid
#   into this worktree's pid file (read only — nothing written in the controller's checkout) so acc-v2-serve.sh stop
#   stops it; refuse to go on if 3215 is still listening afterwards (a new `next start` would fail and the curl
#   readiness probe would answer from the OLD build).
set -uo pipefail
cd /root/projects/shark-crm-c42b
R=.qc-shots/crm/rebuild-c60; mkdir -p "$R" .qc-shots/acc-v2; S=.qc-shots/crm/BUILD-STATE; L="$R/run.log"; : > "$L"
echo "BUILDING $(date -u +%H:%M) $(git rev-parse --short HEAD)" > "$S"
export SHARK_AI_MOCK=1 WEBHOOK_ALLOW_PRIVATE=1
OLDPF=/root/projects/shark-crm/.qc-shots/acc-v2/server.pid
if [ ! -f .qc-shots/acc-v2/server.pid ] && [ -f "$OLDPF" ]; then
  OP="$(cat "$OLDPF")"
  if ps -o args= -p "$OP" 2>/dev/null | grep -q 'next start -p 3215'; then
    echo "adopt old server pid $OP from $OLDPF" >>"$L"; echo "$OP" > .qc-shots/acc-v2/server.pid
  fi
fi
NODE_OPTIONS=--max-old-space-size=5120 bash scripts/acc-v2-serve.sh stop >>"$L" 2>&1
sleep 2
if ss -ltn 'sport = :3215' | grep -q LISTEN; then echo "FAILED $(date -u +%H:%M) port 3215 still busy after stop" > "$S"; ss -ltnp 'sport = :3215' >>"$L" 2>&1; exit 1; fi
NODE_OPTIONS=--max-old-space-size=5120 bash scripts/acc-v2-serve.sh >>"$L" 2>&1; rc=$?
if [ $rc -ne 0 ]; then echo "FAILED $(date -u +%H:%M) rc=$rc" > "$S"; exit 1; fi
NEWPID="$(cat .qc-shots/acc-v2/server.pid)"; LP="$(ss -ltnp 'sport = :3215' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
if [ -z "$LP" ] || [ "$(ps -o pgid= -p "$LP" | tr -d ' ')" != "$(ps -o pgid= -p "$NEWPID" | tr -d ' ')" ]; then
  echo "FAILED $(date -u +%H:%M) listener on 3215 (pid ${LP:-none}) is not the new server (pid $NEWPID)" > "$S"; exit 1
fi
echo "READY $(date -u +%H:%M) $(git rev-parse --short HEAD) port=3215 ai=mock webhook-private=on cwd=shark-crm-c42b" > "$S"
