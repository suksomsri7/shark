#!/usr/bin/env bash
# pos-vps-run-suites.sh — controller re-run of oracles and suites on the VPS, with no Claude involved.
# Called by pos-vps-autorun.sh with one request file: ledger/runs/REQUEST-suites-<id>
#
# Request file format:
#   line 1:  <id> <tree> <branch> <head-sha-prefix>
#   then one step per line:
#     typecheck | fitness | fitness-pos | build | forced:<suite> | unforced:<suite> | <suite>
#     (<suite> = script name without .mts; "<suite>" alone = unforced)
#   Lines starting with # are ignored.
# Allowed trees: /root/projects/shark-pos-b and /root/projects/shark-pos-p11 only.
# The tree must be clean. It may change branch only if clean.
# Results go to a new branch wip/pos-runs-<id>-<stamp> under ledger/runs/<id>-<stamp>/.
# 🔴 Never touches main, prod .env, QC1–QC3, or prisma migrate. QC4 (ep-frosty-lab) only.
set -uo pipefail
exec 9>/tmp/pos-vps-run-p1.3.lock   # same lock as the P1.3 runner: one DB-heavy run at a time
flock -n 9 || { echo "🔴 another run holds /tmp/pos-vps-run-p1.3.lock"; exit 5; }

REQF="$(realpath "${1:?request file}")"
CTRL="$(pwd)"
read -r RID TREE BRANCH EXPECT_HEAD < "$REQF" || true
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/root/pos-runs/$RID-$STAMP"
RUNS_BRANCH="wip/pos-runs-$RID-$STAMP"
SUMMARY="$OUT/SUMMARY.md"
N=0
say() { echo "[$(date -u +%H:%M:%S)] $*"; }
die() { say "🔴 STOP: $*"; echo "- 🔴 STOP: $*" >> "$SUMMARY" 2>/dev/null; publish; exit 3; }
mkdir -p "$OUT"
{ echo "# suites run $RID — $STAMP"; echo; echo "| # | step | exit | seconds | summary |"; echo "|---|---|---|---|---|"; } > "$SUMMARY"

case "$RID" in ""|*[!A-Za-z0-9._-]*) echo "bad id"; exit 2 ;; esac
case "$TREE" in /root/projects/shark-pos-b|/root/projects/shark-pos-p11) : ;; *) echo "tree not allowed: $TREE"; exit 2 ;; esac
case "$BRANCH" in wip/pos-*) : ;; *) echo "branch not allowed: $BRANCH"; exit 2 ;; esac
case "$EXPECT_HEAD" in ""|*[!0-9a-f]*) echo "bad head"; exit 2 ;; esac

run() {
  local name="$1"; shift
  N=$((N + 1))
  local log; log="$OUT/$(printf %02d "$N")-$name.log"
  local t0; t0=$(date +%s)
  say "▶ $N $name"
  ( cd "$TREE" && "$@" ) < /dev/null > "$log" 2>&1
  local ec=$?
  local dt=$(( $(date +%s) - t0 ))
  local js; js="$(grep -m1 -o '"total":[0-9]*,"passed":[0-9]*,"failed":\[[^]]*\]' "$log" | cut -c1-160)"
  echo "| $N | $name | $ec | $dt | ${js:-} |" >> "$SUMMARY"
  say "  $name → exit $ec (${dt}s)"
}

publish() {
  for f in "$OUT"/*.log; do
    [ -f "$f" ] || continue
    { echo; echo "### $(basename "$f") (last 15 lines)"; echo '```'; tail -n 15 "$f"; echo '```'; } >> "$SUMMARY"
  done
  local RW="/root/pos-runs/worktree-$STAMP"
  ( cd "$CTRL" && git fetch -q origin session/pos && git worktree add -q -b "$RUNS_BRANCH" "$RW" origin/session/pos ) || { say "worktree failed — results in $OUT"; return; }
  mkdir -p "$RW/ledger/runs/$RID-$STAMP" && cp -r "$OUT"/. "$RW/ledger/runs/$RID-$STAMP/"
  ( cd "$RW" && git add "ledger/runs/$RID-$STAMP" && git commit -q --no-verify -m "runs(pos): $RID $STAMP" )
  local i; for i in 1 2 3 4; do ( cd "$RW" && git push -q -u origin "$RUNS_BRANCH" ) && break; sleep $((2 ** i)); done
  ( cd "$CTRL" && git worktree remove --force "$RW" ) >/dev/null 2>&1 || true
  say "✅ results on $RUNS_BRANCH"
}

# ── preflight ──
cd "$TREE" || die "cd $TREE"
for f in .env.qc .env.qc4; do
  [ -f "$f" ] || die "no $f in $TREE"
  for k in DATABASE_URL DIRECT_URL; do
    v="$(grep -m1 "^$k=" "$f" | cut -d= -f2-)"
    case "$v" in *ep-frosty-lab*) : ;; *) die "$f $k is not QC4 (ep-frosty-lab)" ;; esac
  done
done
dirty="$(git status --porcelain --untracked-files=normal | grep -v '^?? node_modules' || true)"
[ -z "$dirty" ] || { echo "$dirty" > "$OUT/dirty.txt"; die "tree has uncommitted files (dirty.txt) — not touching them"; }
git fetch -q origin "$BRANCH" || die "fetch $BRANCH"
cur="$(git rev-parse --abbrev-ref HEAD)"
ORIG_BRANCH="$cur"
restore_branch() { ( cd "$TREE" && git checkout -q -- scripts/pos-expected.json 2>/dev/null; [ "$(git rev-parse --abbrev-ref HEAD)" = "$ORIG_BRANCH" ] || git checkout -q "$ORIG_BRANCH" ) || say "⚠️ could not restore branch $ORIG_BRANCH"; }
trap restore_branch EXIT
if [ "$cur" != "$BRANCH" ]; then
  git checkout -q "$BRANCH" 2>/dev/null || git checkout -q -b "$BRANCH" "origin/$BRANCH" || die "checkout $BRANCH"
fi
git merge -q --ff-only "origin/$BRANCH" || die "cannot ff to origin/$BRANCH"
head="$(git rev-parse --short=8 HEAD)"
case "$head" in "$EXPECT_HEAD"*) : ;; *) die "head $head ≠ expected $EXPECT_HEAD" ;; esac
echo "- tree \`$TREE\` · branch \`$BRANCH\` · head \`$head\`" >> "$SUMMARY"
if [ "$TREE" = /root/projects/shark-pos-b ]; then
  [ -d node_modules/.pnpm ] || mount --bind -o ro /root/projects/shark-pos-p11/node_modules /root/projects/shark-pos-b/node_modules || die "node_modules bind mount"
else
  run install pnpm install --frozen-lockfile
fi

QC4="bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh"
# ── steps ──
tail -n +2 "$REQF" | while read -r step _; do
  case "$step" in
    ""|\#*) continue ;;
    typecheck)   run typecheck env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck ;;
    fitness)     run fitness-env bash scripts/iso.sh bash scripts/qc4.sh pnpm fitness
                 run fitness-noenv env -u DATABASE_URL -u DIRECT_URL -u QC_ENV_FILE pnpm fitness ;;
    build)       run serve-build env ACC_V2_PORT=3226 NODE_OPTIONS=--max-old-space-size=5632 bash scripts/acc-v2-serve.sh
                 ( cd "$TREE" && ACC_V2_PORT=3226 bash scripts/acc-v2-serve.sh stop ) >/dev/null 2>&1 || true ;;
    fitness-pos) run fitness-pos env -u DATABASE_URL -u DIRECT_URL bash scripts/iso.sh pnpm exec tsx scripts/fitness-pos.mts ;;
    forced:*|unforced:*|*)
      mode=unforced; s="$step"
      case "$step" in forced:*) mode=forced; s="${step#forced:}" ;; unforced:*) s="${step#unforced:}" ;; esac
      case "$s" in *[!A-Za-z0-9._-]*) echo "| - | $step | bad name | - | |" >> "$SUMMARY"; continue ;; esac
      [ -f "scripts/$s.mts" ] || { echo "| - | $step | missing script | - | |" >> "$SUMMARY"; continue; }
      if [ "$mode" = forced ]; then run "$s-forced" $QC4 env QC_FORCE=1 pnpm exec tsx "scripts/$s.mts"
      else run "$s" $QC4 pnpm exec tsx "scripts/$s.mts"; fi ;;
  esac
done
git checkout -q -- scripts/pos-expected.json 2>/dev/null || true
( git status --porcelain --untracked-files=normal | grep -v '^?? node_modules' ) > "$OUT/residue-tree.txt" || true
[ -s "$OUT/residue-tree.txt" ] && echo "- ⚠️ tree has leftover files (residue-tree.txt)" >> "$SUMMARY"
publish
