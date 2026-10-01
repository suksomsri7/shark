#!/usr/bin/env bash
# C5.5-fix5 independent review — heavy jobs one at a time, each in its own systemd unit (iso.sh) under the gate lock · QC3 only
# Use: bash scripts/pending/cf6/review/run-review.sh [label]  → logs /tmp/rv-cf6-logs/<label>-*.log + /tmp/rv-cf6-logs/<label>.summary
# Includes the F16 bite: two throwaway lines (shapes the builder did not try) appended to two src files, fitness run without env,
#   files restored from a byte copy and their sha256 compared.
set -uo pipefail
cd /root/projects/shark-crm-cf2
LBL="${1:-rv}"
D=/tmp/rv-cf6-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; local t0; t0=$(date +%s); "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s) - t0 ))s $(grep -E 'JSON_SUMMARY|🟢|🔴|ผ่าน [0-9]|found [0-9]+ error|error TS' "$log" | tail -1 | cut -c1-260)" >> "$SUM"; }
q() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts" "${@:2}"; }
p() { local n="$1"; shift; r "$n" bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
echo "tree $(git rev-parse --short HEAD) · src diff vs HEAD: $(git status --short -- src | wc -l) files · $(date -u +%FT%TZ)" >> "$SUM"
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
p rv-cf6-fuzz scripts/pending/cf6/review/rv-cf6-fuzz.mts 60000
q pending/cf6/review/rv-cf6-db
p probe-cf6-linear scripts/pending/cf6/probe-cf6-linear.mts "$LBL" base
q pending/cf6/probe-cf6-db "$LBL" base
p rv-cf4-sanitize scripts/pending/cf4/review/rv-cf4-sanitize.mts
q pending/cf4/review/rv-cf4-db
p qc-sanitize-hotfix scripts/qc-sanitize-hotfix.mts
for s in qc-crm-c2.5 qc-crm-c2.11 qc-crm-c2.4 qc-crm-c1.10 qc-kanban-k3.9 qc-kanban-k1.6 qc-host-routing; do q "$s"; done
r fitness bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
# F16 bite (own shapes): `new RegExp("<li[^>]*>", "gi")` in a .ts file · `/<([^>]*)>\s*$/` in a .tsx file
A=src/lib/modules/kanban/cards.ts; B="src/app/app/sys/[id]/crm/emails/[threadKey]/page.tsx"
cp "$A" "$D/bite-A.orig"; cp "$B" "$D/bite-B.orig"
SA=$(sha256sum "$A" | cut -d' ' -f1); SB=$(sha256sum "$B" | cut -d' ' -f1)
printf '\nexport const __RV_F16_A = (s: string) => s.replace(new RegExp("<li[^>]*>", "gi"), "");\n' >> "$A"
printf '\nexport const __RV_F16_B = (s: string) => s.match(/<([^>]*)>\\s*$/);\n' >> "$B"
r fitness-bite bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
cp "$D/bite-A.orig" "$A"; cp "$D/bite-B.orig" "$B"
echo "bite restored: A $([ "$(sha256sum "$A" | cut -d' ' -f1)" = "$SA" ] && echo identical || echo DIFFERENT) · B $([ "$(sha256sum "$B" | cut -d' ' -f1)" = "$SB" ] && echo identical || echo DIFFERENT) · src status: $(git status --short -- src | wc -l) files" >> "$SUM"
grep -E "F16\.[0-9]" "$D/$LBL-fitness-bite.log" | cut -c1-400 >> "$SUM"
echo "ALLDONE $(date -u +%FT%TZ)" >> "$SUM"
