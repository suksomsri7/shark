#!/usr/bin/env bash
# C5.5-fix5 round 2 (tip = the fix commit): (a) typecheck with the 5 GB heap the other lanes use (3.5 GB OOMs) · probes after the
#   widget-Origin/Host additions · domain suites · fitness F16 bite (throwaway tag-strip line appended to a src file ⇒ F16.1 red;
#   file restored by checkout, sha compared) · residual regex sweep on the tip;
# (b) BASELINE: the suites red on the tip re-run with the tree at b8e8ad52 (+ the pure probe on the base tree = RED evidence for the
#   late SW.trailing check) — tree restored to wip/crm-cf6 at the end.
set -uo pipefail
cd /root/projects/shark-crm-cf2
LBL="${1:-r2}"
D=/tmp/cf6-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; local t0; t0=$(date +%s); "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s) - t0 ))s $(grep -E 'JSON_SUMMARY|🟢|🔴|ผ่าน [0-9]|found [0-9]+ error|error TS|regex literals scanned' "$log" | tail -1 | cut -c1-260)" >> "$SUM"; }
q() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts" "${@:2}"; }
p() { local n="$1"; shift; r "$n" bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
TIP=$(git rev-parse HEAD)
echo "tip $(git rev-parse --short HEAD)" >> "$SUM"
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
p probe-cf6-linear scripts/pending/cf6/probe-cf6-linear.mts "$LBL" base
q pending/cf6/probe-cf6-db "$LBL" base
q qc-domain
q qc-host-routing
# F16 bite: one throwaway line, fitness without env, restore
F=src/lib/modules/crm/emails-shared.ts
S0=$(sha256sum "$F" | cut -d' ' -f1)
printf '\nexport const __F16_BITE = (s: string) => s.replace(/<[^>]*>/g, "");\n' >> "$F"
r fitness-bite bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
git checkout -q -- "$F"
echo "bite restored: $([ "$(sha256sum "$F" | cut -d' ' -f1)" = "$S0" ] && echo identical || echo DIFFERENT) · src diff: $(git status --short -- src | wc -l) files" >> "$SUM"
grep -E "F16\.[0-9]" "$D/$LBL-fitness-bite.log" | cut -c1-300 >> "$SUM"
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
r regex-sweep-tip bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=2048 bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf6/regex-sweep.mts --json "$D/sweep-tip.json"
# (b) baseline at b8e8ad52 — probe + sweep scripts copied out first (they do not exist in the base tree)
cp scripts/pending/cf6/probe-cf6-linear.mts scripts/pending/cf6/legacy-b8e8.ts "$D/"
git checkout -q --detach b8e8ad52 || { echo "checkout base failed" >> "$SUM"; exit 1; }
mkdir -p scripts/pending/cf6 && cp "$D/probe-cf6-linear.mts" "$D/legacy-b8e8.ts" scripts/pending/cf6/
echo "tree at $(git rev-parse --short HEAD)" >> "$SUM"
p base-probe-cf6-linear scripts/pending/cf6/probe-cf6-linear.mts "$LBL-base"
for s in qc-crm-c1.10 qc-kanban-k3.5 qc-kanban-k3.9; do q "$s"; mv "$D/$LBL-$s.log" "$D/$LBL-base-$s.log"; sed -i "\$s/^$s /base-$s /" "$SUM"; done
p base-qc-branding-b2 scripts/qc-branding-b2.mts
rm -f scripts/pending/cf6/probe-cf6-linear.mts scripts/pending/cf6/legacy-b8e8.ts
git checkout -q wip/crm-cf6; echo "tree back at $(git rev-parse --short HEAD) (tip ${TIP:0:8}) · status: $(git status --short | tr '\n' ' ')" >> "$SUM"
echo ALLDONE >> "$SUM"
