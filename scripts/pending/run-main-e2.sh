#!/usr/bin/env bash
# controller: E gate part 2 — c0.2 after facade block marker fix · c51fix-equiv NEW capture on the gate tree (QC3 temp copy, host guard only) vs builder's OLD capture
set -uo pipefail
cd /root/projects/shark-crm-c54e
L=.qc-shots/crm/main-e2.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r c0.2 env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c0.2.mts
cp scripts/qc-crm-c51fix-equiv.mts scripts/qc-crm-c51fix-equiv-qc3.mts
sed -i 's#if (!u.includes("ep-cool-shadow") || process.env.QC_BRANCH !== "qc2") {#if (!u.includes("ep-weathered-river") || process.env.QC_BRANCH !== "qc3") { // TEMP COPY: QC3 host guard#' scripts/qc-crm-c51fix-equiv-qc3.mts
r equiv-new env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c51fix-equiv-qc3.mts --tenant qc --out .qc-shots/c51fix/equiv-main-e.json
r equiv-compare pnpm exec tsx scripts/qc-crm-c51fix-equiv-qc3.mts --compare .qc-shots/c51fix/equiv-c54e-old.json .qc-shots/c51fix/equiv-main-e.json
rm -f scripts/qc-crm-c51fix-equiv-qc3.mts
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
echo ALLDONE >> "$L"
