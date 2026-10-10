#!/usr/bin/env bash
# C5.5-fix4 round 2: (a) re-run probe-cf2 after the R2-6 ORACLE-EDIT + contains evidence on the tip;
# (b) BASELINE: the suites red on the tip re-run with the tree at 5c87acc3 (same DB, same scripts state for gitignored
#     files) — identical JSON_SUMMARY ⇒ not caused by this card; tree restored to wip/crm-cf4 at the end;
# (c) the two pure hsan harnesses with findings, run read-only in the hotfix worktree (929c39ce = prod main) for comparison.
set -uo pipefail
cd /root/projects/shark-crm-cf2
LBL="${1:-r2}"
D=/tmp/cf4-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(grep -E 'JSON_SUMMARY|🟢|🔴|passed|PASS|FAIL|ผ่าน|VERDICT|SUMMARY|rows .* builder' "$log" | tail -1 | cut -c1-260)" >> "$SUM"; }
q() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
TIP=$(git rev-parse HEAD)
q pending/cf2/probe-cf2
q pending/cf4/probe-cf4-contains
# (b) baseline — the run scripts live in /tmp so nothing under the worktree is executed while the tree switches
git checkout -q --detach 5c87acc3 || { echo "checkout base failed" >> "$SUM"; exit 1; }
echo "tree at $(git rev-parse --short HEAD)" >> "$SUM"
for s in qc-acc-v2-policy qc-kanban-k3.7 qc-kanban-k3.9 qc-member-m1.7 qc-member-m3.11; do q "$s"; done
for g in member kanban account; do r "docs-$g" bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/gen-$g-api-docs.mts" --check; done
git checkout -q wip/crm-cf4; echo "tree back at $(git rev-parse --short HEAD) (tip $TIP)" >> "$SUM"
# (c) hotfix worktree, read-only, pure
r hsan-main-attack bash /root/projects/shark-crm-hsan/scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash /root/projects/shark-crm-hsan/scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hsan-review/attack.mts vectors fuzz
r hsan-main-pgtest bash /root/projects/shark-crm-hsan/scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash /root/projects/shark-crm-hsan/scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hsan-review/pgtest.mts
echo ALLDONE >> "$SUM"
