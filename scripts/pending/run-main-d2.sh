#!/usr/bin/env bash
# controller: main gate for C5.4-D2 (patch cd2 288cca97..0a8d8cd1) — no-DB steps on MAIN (QC1 busy with it4 dbg runs; DB regression = builder run12 + reviewer reruns on cd2, whose src is byte-identical to main+patch)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-d2.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness pnpm fitness
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r src-identical-to-cd2 git -C /root/projects/shark-crm-cd2 diff --stat 0a8d8cd1 -- src
echo ALLDONE >> "$L"
