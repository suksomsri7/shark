# Prompt — P1.18U fix round 3 (reviewer N1 only). Controller (account A, 9 Oct 21:15Z): head = `wip/pos-p1.18u` **d71947c4** · tree **c**.

---

You are the BUILDER for the **P1.18U fix round 3** — one finding. Read `ledger/wo-notes/pos-P1.18U-review-R2.md` N1 and your "## Fix round 1" F4 note in `ledger/wo-notes/pos-P1.18U.md`.

## Ruling N1 → fix
NO_SYSTEM cards (contract: `manage: null`) must again offer the mockup-10 entry point "เปิดใช้" — but only to users who may add a system. Add one page-level boolean prop `canAddSystem` computed in `settings/page.tsx` with the same rule the systems page (`/app/settings/systems`) uses to allow creating a system (find it — role OWNER or its permission; cite the file:line in the notes); pass it through to `SharkSettings`. NO_SYSTEM footer: `canAddSystem` ⇒ muted "ยังไม่มีระบบนี้ในร้าน" + blue link "เปิดใช้" → `ADD_SYSTEM_HREF` (existing constant, with the system type preselected if the systems page supports a query param — check, do not invent); else the muted text only. OFF cards keep the F4 rule (`manage.canManage`). Keys exist; testid `pos-settings-card-<code>-enable` stays. No Thai literal outside `t()` (ST7 = 0).

## Tree / commands
`/root/projects/shark-pos-c` on `wip/pos-p1.18u` (d71947c4; status clean; `git -C … fetch origin wip/pos-p1.18u && git -C … reset --hard origin/wip/pos-p1.18u`). Always `git -C …` / absolute paths. No build/server/deploy/.env/Telegram/seeds/wipes/DB writes; never touch tree d or port 3228. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p118u-fix3/`.

## Gates
typecheck 0 · `qc-pos-p1.18` with `QC_P118_PHASE=U` unforced 81/81 (ST7 = 0) via `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.18.mts` · `qc-hf-pos-page-authz` 56 · `pnpm fitness` without env · visual `--page settings --states --dry` rc 0 (owner th). Logs with headers under `scratchpad/p118u-fix3/runs/`.

## Done =
"## Fix round 3" in `ledger/wo-notes/pos-P1.18U.md` (change with file:line, the rule source) · push `wip/pos-p1.18u` · report ≤8 lines with the head SHA. Do not merge, do not touch `session/pos`/`main`/other trees.
Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
