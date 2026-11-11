# Prompt — P1 phase-close parity sheet drafter (R15, read-only). Controller (account A, 9 Oct 23:4xZ). Build56 = `session/pos` b694aea0 (tree d, port 3228); screenshots already taken.

---

You are the PARITY DRAFTER for the **P1 phase close** (brief `pos-brief-P1.18.md` R15). Read-only: no code edits, no DB, no builds, no servers; you write only `ledger/wo-notes/pos-P1.18-parity.md` in `/root/projects/shark-pos` (do not commit). English with Thai labels where the UI is Thai.

## Inputs
- Mockups: `ledger/design-pos/NN-*.png` (+ `NN-*.body.html` = exact text/layout) for frames **01 · 02 · 02b · 05ก/ข/ค · 07 · 08 (P1 part) · 10 · 11B · 11C · 12 · 13A/B · 14A/B · 15A · 16 · 17A/B/C · 19 (P1 states) · 20A/B · 21A/B** (sub-frames are regions of the numbered mockup — `ledger/DESIGN-POS.md` and the U briefs `pos-brief-P1.*U.md` name them; the `.body.html` files carry the frame ids).
- Screenshots: `/root/projects/shark-pos-d/.qc-shots/pos/p1close/` (th, owner + cashier: `<page>-<state>-<user>-<w>x<h>.png`) and `/root/projects/shark-pos-d/.qc-shots/pos/p1close-en/` (en, owner). Logs with the state list per page: `/root/pos-runs/vis56-all-*/<page>-<user>-<locale>.log`. Pages: register · settings · sales · shifts · reports · stock · products · close. **Owner shifts states (`shifts-current/close/z`) are not shot yet** (visual-script bug fixed, re-shoot pending) — mark those rows `OPEN (re-shoot vis58)`.
- Prior rulings on known deviations: `ledger/wo-notes/pos-P1.*U*.md` ("deviations" sections + "Controller rulings" footers), `pos-brief-P1.17U-R4-PARITY.md`, `pos-P1.18U-review*.md`. A deviation already ruled = `DEVIATION (ref <file> §/F#)`, not OPEN.

## Output = `ledger/wo-notes/pos-P1.18-parity.md`
One row per **frame × size (1440 · 1024 · 390) × locale (th · en)**: `| frame | state/shot path | size | locale | status | note |` where status ∈ `MATCH` / `DEVIATION (+ruling ref)` / `OPEN`. Rules: look at the actual PNGs (Read them; at minimum 1440 th, 390 th and 1440 en per frame, and every size when something looks off); compare layout, labels (exact Thai text vs `.body.html`), numbers format (฿, %, dates), states (empty/error/loading), buttons present/absent, cashier vs owner differences; en rows check real English (no Thai leaking, no untranslated keys like `pos.xxx`). A missing shot for a frame = OPEN with the reason. Put a summary table at the top (frames × MATCH/DEVIATION/OPEN counts) and an "OPEN items for the controller" list at the end (each with shot path, what differs, your proposed ruling: fix-now / accept / later-card).

Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/parity-p1/`. Never run `cd`; absolute paths. Final message ≤ 15 lines: counts, the OPEN list headline items, the file path.
