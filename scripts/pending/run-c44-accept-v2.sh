#!/usr/bin/env bash
# controller: C4.4 acceptance #2 on MAIN 46f952cc (D + UI fix + J3 landed) · QC1 · build HEAD + server 3215 (AI mock, WEBHOOK_ALLOW_PRIVATE=1)
#   → --clean → --journey all → --clean → c3.7 fixture → shoot-crm → visual 3.7 owner/thana → c3.7 · 1 Oct
# launch: systemd-run --unit=crm-c44-accept2 --collect -p KillMode=process … (so the detached next-server survives the unit)
set -uo pipefail
cd /root/projects/shark-crm
R=.qc-shots/crm/c44-accept2; mkdir -p "$R"
S=.qc-shots/crm/BUILD-STATE; L="$R/run.log"; : > "$L"; : > "$R/_summary.txt"
echo "BUILDING $(date -u +%H:%M) $(git rev-parse --short HEAD)" > "$S"
export SHARK_AI_MOCK=1 WEBHOOK_ALLOW_PRIVATE=1
NODE_OPTIONS=--max-old-space-size=5120 bash scripts/acc-v2-serve.sh stop >>"$L" 2>&1
NODE_OPTIONS=--max-old-space-size=5120 bash scripts/acc-v2-serve.sh >>"$L" 2>&1; rc=$?
echo "build+serve exit=$rc" >> "$R/_summary.txt"
if [ $rc -ne 0 ]; then echo "FAILED $(date -u +%H:%M) rc=$rc" > "$S"; echo ALLDONE >> "$R/_summary.txt"; exit 1; fi
echo "READY $(date -u +%H:%M) $(git rev-parse --short HEAD) port=3215 ai=mock webhook-private=on" > "$S"
J() { NODE_OPTIONS=--max-old-space-size=3584 bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts "$@"; }
J --clean > "$R/clean-before.log" 2>&1; echo "clean-before exit=$? $(grep -a 'total rows' "$R/clean-before.log" | tail -1)" >> "$R/_summary.txt"
J --journey all > "$R/journeys.log" 2>&1; echo "journeys exit=$? $(grep -a JSON_SUMMARY "$R/journeys.log" | tail -1)" >> "$R/_summary.txt"
J --clean > "$R/clean-after.log" 2>&1; echo "clean-after exit=$? $(grep -a 'total rows' "$R/clean-after.log" | tail -1)" >> "$R/_summary.txt"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
G() { NODE_OPTIONS=--max-old-space-size=3584 bash scripts/with-gate-lock.sh "$@"; }
G pnpm exec tsx scripts/qc-crm-c3.7.mts > "$R/c37-a.log" 2>&1; echo "c3.7 (fixture) exit=$?" >> "$R/_summary.txt"
env QC_PREPARE=1 node apps/mobile/qc/shoot-crm.mjs > "$R/shoot.log" 2>&1; echo "shoot-crm exit=$?" >> "$R/_summary.txt"
G pnpm exec tsx scripts/visual-crm.mts 3.7 > "$R/visual-37-owner.log" 2>&1; echo "visual 3.7 owner exit=$?" >> "$R/_summary.txt"
G pnpm exec tsx scripts/visual-crm.mts 3.7 --user thana > "$R/visual-37-thana.log" 2>&1; echo "visual 3.7 thana exit=$?" >> "$R/_summary.txt"
G pnpm exec tsx scripts/qc-crm-c3.7.mts > "$R/c37.log" 2>&1; echo "c3.7 exit=$? $(grep -a JSON_SUMMARY "$R/c37.log" | tail -1 | cut -c1-160)" >> "$R/_summary.txt"
echo ALLDONE >> "$R/_summary.txt"
