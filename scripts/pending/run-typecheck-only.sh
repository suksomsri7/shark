#!/usr/bin/env bash
cd /root/projects/shark-crm
L=.qc-shots/crm/typecheck-oracles.log; : > "$L"
echo "== typecheck ==" | tee -a "$L"
env NODE_OPTIONS=--max-old-space-size=4096 bash scripts/with-gate-lock.sh pnpm typecheck >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"
