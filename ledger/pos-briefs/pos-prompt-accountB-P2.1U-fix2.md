# Prompt — P2.1U fix round 2 (visual regression at 1024). Controller (account A, 10 Oct 00:0xZ): head = `wip/pos-p2.1u` **83797c84** (fix round 1 accepted). Tree **b** — only after gates60 finishes (see Tree).

---

You are the BUILDER for **P2.1U fix round 2**. Same card, same rulings as `ledger/pos-briefs/pos-prompt-accountB-P2.1U-fix.md` and `pos-prompt-accountB-P2.1U-R.md` (binding). English reports, Thai code comments. One finding only.

## Finding (from the controller's screenshot read, vis57 on build57 = 83797c84)
**V1 (Medium, 1024×768, bills page with the bill drawer open)** — `register/approval-wait` at 1024 reports "ล้นแนวนอน html: table right=1088" (vis56 on b694aea0 was green for the same state). Shot: `/root/projects/shark-pos-d/.qc-shots/pos/p21u/register-approval-wait-owner-1024x768.png`. Cause: the new "ช่องทาง" column (chip "LINE MAN" / "เว็บร้าน SHARK Shop" / "หน้าร้าน") makes the bills table wider than the column left beside the open bill drawer at 1024, and the overflow escapes to `html` (page scrolls horizontally). `sales/bills-list` at 1024 without the drawer is fine.
**Fix (smallest):** the bills table must never widen the page: give the table wrapper `overflow-x-auto` (scroll inside the card) and/or let the channel chip truncate (`max-w`, `truncate`) and hide the column text under `lg` when the drawer is open — pick the one that keeps mockup 12 at 1440 byte-identical and the 1024 layout matching 20A grammar. No change to 1440/390 renders; no server change.

## Tree / commands
`/root/projects/shark-pos-b` (own node_modules). **Wait first:** do not touch tree b until `ls /root/pos-runs/p118-close-b3-*/SUMMARY.txt` exists and contains `DONE` (gates60 runs DB suites on that checkout; poll every 60 s, say how long you waited). Then `git -C /root/projects/shark-pos-b status --short` must be clean → `git -C /root/projects/shark-pos-b fetch origin wip/pos-p2.1u && git -C /root/projects/shark-pos-b checkout wip/pos-p2.1u && git -C /root/projects/shark-pos-b reset --hard origin/wip/pos-p2.1u` (= 83797c84). Always `git -C …`/absolute paths; pnpm inside the tree. No DB needed; no build/server/deploy/.env/Telegram. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. Also `pnpm exec eslint` on the touched files and `scripts/fitness-pos.mts` (ST7 Thai-literal scan stays 0). Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p21u-fix2/`.

## Done =
"## Fix round 2" in `ledger/wo-notes/pos-P2.1U.md` (file:line, which approach, why 1440 unchanged) · commit (explicit paths) + push `wip/pos-p2.1u` · report ≤10 lines with the head SHA. Do not merge, do not touch `session/pos`/`main`/other trees. The controller re-shoots `approval-wait` + the p21u set on QC5 (vis58).
Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
