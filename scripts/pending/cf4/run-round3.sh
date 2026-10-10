#!/usr/bin/env bash
# C5.5-fix4 round 3: (a) docs gates made meaningful — generate the gitignored `.claude/skills/shark-*-api/references/endpoints.md`
#   (absent in this worktree ⇒ every --check red on "0 bytes"), then `git diff` of tracked docs must be empty and --check green;
# (b) qc-member-m3.11 baseline at 5c87acc3 after the OTP rate window has passed (r2's base run hit the limiter left by the
#   tip run minutes earlier), then the tip again after another cooldown — so both runs start from the same limiter state.
set -uo pipefail
cd /root/projects/shark-crm-cf2
LBL="${1:-r3}"
D=/tmp/cf4-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(grep -E 'JSON_SUMMARY|🟢|🔴|passed|ผ่าน|✅|❌' "$log" | tail -1 | cut -c1-240)" >> "$SUM"; }
q() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
for g in member kanban account; do r "gen-$g" bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/gen-$g-api-docs.mts"; done
echo "tracked diff after generators: $(git status --short | grep -v '^??' | grep -v 'expected.json' | tr '\n' ' ')" >> "$SUM"
for g in crm member kanban account; do r "docs-$g" bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/gen-$g-api-docs.mts" --check; done
sleep 660
git checkout -q --detach 5c87acc3 || { echo "checkout base failed" >> "$SUM"; exit 1; }
echo "tree at $(git rev-parse --short HEAD)" >> "$SUM"
q qc-member-m3.11
git checkout -q wip/crm-cf4; echo "tree back at $(git rev-parse --short HEAD)" >> "$SUM"
sleep 660
q qc-member-m3.11
echo ALLDONE >> "$SUM"
