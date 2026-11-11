# Prompt — P1.18U fix round 2 (controller visual findings V1–V4 from real screenshots vis52 @e082e83f). Controller (account A, 9 Oct 20:59Z): head = `wip/pos-p1.18u` **82bf9b9f** (fix round 1 done) · tree **c** (tree d is still held by the controller's visual run — never touch it or port 3228).

---

You are the BUILDER for the **P1.18U fix round 2** — visual parity only. Same rulings as `pos-prompt-accountB-P1.18U.md`. English reports, Thai code comments. Screenshots to look at (read-only, do not delete): `/root/projects/shark-pos-d/.qc-shots/pos/p118u/settings-staff-owner-1440x900.png`, `…-1024x768.png`, `settings-shark-owner-1440x900.png`, `/root/projects/shark-pos-d/.qc-shots/pos/p118u-en/settings-shark-owner-1440x900-en.png`; mockups `ledger/design-pos/17-settings-3.png` (third frame) and `10-settings-integrations.png`.

## Findings → fix
1. **V1 (17C role table clipped)**: at 1440 and 1024 the "พนักงาน" column is cut off at the card's right edge (header "พนัก", cells half visible) — the table is wider than the card and the card clips. Fix: the table must fit the card at 1440 and 1024 (first column `min-w` smaller + `truncate`/wrap for sub-labels, role columns fixed ~96 px, cells centred), and the table wrapper gets `overflow-x-auto` as a safety net at 390 only. Verify from the dry-run DOM if you can (element widths), otherwise by reasoning about the classes — state which.
2. **V2 (ใบเสร็จและภาษี card rows overflow)**: the key/value rows wrap badly — the VAT value wraps to 3 lines with the check icon on the middle line, "POS001 · หัว/ท้ายใบเสร็จ ตั้งแล้ว" wraps, the e-Tax chip "รอผู้ให้บริการ" wraps to 3 lines and the "สมัคร" button overflows the card edge (th and en). Fix to the mockup: each row = label left (muted, `shrink-0`) + value right-aligned on one line (`truncate`, icon inline before the text); e-Tax row = label + chip + small button that stay on one line at 1440/1024 and wrap as a whole row (chip + button under the label) at 390. Values must never be clipped mid-word; if a value cannot fit, it goes under the label on its own line, not in a narrow column.
3. **V3/V4 (PLANNED card header)**: in the AI and ออฟไลน์ cards the "เร็ว ๆ นี้ · P3.x" chip plus the switch crowd the header so the title wraps ("ออฟ / ไลน์") and in EN the chip **overlaps** the title ("Offline"). Fix: header = icon + title (`min-w-0`, may wrap to 2 lines but never overlapped) + switch; the "เร็ว ๆ นี้ · P…" chip moves to its own line under the title (left-aligned, same look), for every PLANNED card (AI, ออฟไลน์, and any other). Same treatment in the ช่องทางขายภายนอก / วิธีรับเงิน rows if a chip can collide with the name at 1024.
4. While there: "Coupons and vouchers" (EN) wraps to two lines — acceptable; just make sure the switch stays top-right aligned with the first line.
Nothing else changes. No new keys expected (if one is needed, th+en).

## Tree / commands
`/root/projects/shark-pos-c` on `wip/pos-p1.18u` (82bf9b9f; `git -C /root/projects/shark-pos-c status --short` must be clean; `git -C … fetch origin wip/pos-p1.18u && git -C … reset --hard origin/wip/pos-p1.18u`). Always `git -C …` / absolute paths; pnpm/tsx inside the tree. No build/server/deploy/.env/Telegram/seeds/wipes/DB writes. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. DB (dry visual only): `bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/visual-pos.mts p118u --states --user owner --tenant coffee --page settings --dry`. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p118u-fix2/`.

## Gates before "done"
typecheck 0 · `qc-pos-p1.18` with `QC_P118_PHASE=U` unforced (81/81, ST7 = 0) · `pnpm fitness` without env · `scripts/fitness-pos.mts` · visual `--page settings --states --dry` rc 0 (owner, th + `LOCALE=en`). Logs with `tree=/root/projects/shark-pos-c head=<sha>` headers under `scratchpad/p118u-fix2/runs/`.

## Done =
"## Fix round 2 (visual)" in `ledger/wo-notes/pos-P1.18U.md` (per-finding change with file:line and the layout rule used) · push `wip/pos-p1.18u` · report ≤10 lines with the head SHA. Do not merge, do not touch `session/pos`/`main`/other trees (especially tree d).
Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
