#!/usr/bin/env bash
# C5.5-fix5 ROUND 2 verification (review RV5-1..4) — QC3 · one heavy job at a time (iso.sh + gate lock) · run a /tmp copy of this file
# (a) RED: probe-cf6-r2 with the tree detached at 335597dc (round-1 tip) · (b) tip: typecheck (5 GB heap), probes, reviewer probes,
#     suites, docs --check ×4, fitness ×2, F16 bite with a reviewer shape (restored, sha compared)
set -uo pipefail
cd /root/projects/shark-crm-cf2
LBL="${1:-r3}"
D=/tmp/cf6-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; local t0; t0=$(date +%s); "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s) - t0 ))s $(grep -E 'JSON_SUMMARY|🟢|🔴|ผ่าน [0-9]|found [0-9]+ error|error TS' "$log" | tail -1 | cut -c1-260)" >> "$SUM"; }
q() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts" "${@:2}"; }
p() { local n="$1"; shift; r "$n" bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
TIP=$(git rev-parse HEAD)
# (a) RED at 335597dc — the r2 probe is not in that tree: copy it out and back as an untracked file
cp scripts/pending/cf6/probe-cf6-r2.mts "$D/probe-cf6-r2.mts.copy"
git checkout -q --detach 335597dc || { echo "checkout 335597dc failed" >> "$SUM"; exit 1; }
cp "$D/probe-cf6-r2.mts.copy" scripts/pending/cf6/probe-cf6-r2.mts
echo "tree at $(git rev-parse --short HEAD)" >> "$SUM"
q pending/cf6/probe-cf6-r2; sed -i '$s/^pending\/cf6\/probe-cf6-r2 /RED@335597dc probe-cf6-r2 /' "$SUM"; mv "$D/$LBL-pending_cf6_probe-cf6-r2.log" "$D/$LBL-red-probe-cf6-r2.log"
rm -f scripts/pending/cf6/probe-cf6-r2.mts
git checkout -q wip/crm-cf6; echo "tree back at $(git rev-parse --short HEAD) (tip ${TIP:0:8})" >> "$SUM"
# (b) tip
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
q pending/cf6/probe-cf6-r2
q pending/cf6/review/rv-cf6-db
p rv-cf6-fuzz scripts/pending/cf6/review/rv-cf6-fuzz.mts 60000
p probe-cf6-linear scripts/pending/cf6/probe-cf6-linear.mts "$LBL" base
q pending/cf6/probe-cf6-db "$LBL" base
for s in qc-crm-c2.5 qc-crm-c2.11 qc-crm-c2.4 qc-crm-c2.0 qc-kanban-k1.6; do q "$s"; done
for g in crm member kanban account; do r "docs-$g" bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/gen-$g-api-docs.mts" --check; done
echo "tracked diff after docs: $(git status --short | grep -v '^??' | grep -v expected.json | tr '\n' ' ')" >> "$SUM"
r fitness bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
# F16 bite with two reviewer shapes (closing-tag strip in a .ts · RegExp() without new in a .tsx)
A=src/lib/modules/kanban/cards.ts; B=src/components/crm/emails/MySendingCard.tsx
SA=$(sha256sum "$A" | cut -d' ' -f1); SB=$(sha256sum "$B" | cut -d' ' -f1)
printf '\nexport const __R2_F16_A = (s: string) => s.replace(/<\\/?[a-z][^>]*>/gi, "");\n' >> "$A"
printf '\nexport const __R2_F16_B = (s: string) => s.replace(RegExp("<![^>]*>", "g"), "");\n' >> "$B"
r fitness-bite bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
git checkout -q -- "$A" "$B"
echo "bite restored: A $([ "$(sha256sum "$A" | cut -d' ' -f1)" = "$SA" ] && echo identical || echo DIFFERENT) · B $([ "$(sha256sum "$B" | cut -d' ' -f1)" = "$SB" ] && echo identical || echo DIFFERENT) · src diff: $(git status --short -- src | wc -l)" >> "$SUM"
grep -E "F16\.1" "$D/$LBL-fitness-bite.log" | head -1 | cut -c1-400 >> "$SUM"
echo ALLDONE >> "$SUM"
