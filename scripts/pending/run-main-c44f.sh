#!/usr/bin/env bash
# controller: MAIN gate for C4.4-fix r3 (patched onto 2c22dc80) · probes + suites on QC3 · typecheck · fitness ×2 · 28 Sep
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-c44f.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; echo "exit=$?" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
OUT=.qc-shots/crm/main-c44f-suites r suites bash scripts/pending/c44f/run-suites.sh probe-1-convert probe-2-pipeline-quote-stages probe-3-company-doc-party probe-4-automation-company-deal probe-5-webhook-url probe-5b-webhook-loopback-e2e probe-7-convert-visibility probe-r1 c1.3 c1.4 c1.5 c1.8 c2.7 c2.9 c3.2 c3.5 c0.3 qc-acc-v2-party qc-account-deep qc-account-qc7 qc-account-cpa
r probe-r2 env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c44f-review/probe-r2.mts
r fitness pnpm fitness
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
echo ALLDONE >> "$L"
