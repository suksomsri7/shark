# P6.2 oracle — `scripts/qc-pos-p6.2.mts` (handover · docs · manual · skill) · oracle writer (account A) · 24 Oct 2026 (`date -u` 02:1xZ)

Brief: `ledger/pos-briefs/pos-prompt-accountA-P6.2-ORACLE.md` · `pos-brief-P6.md` §1 §4 §5 §10 rulings 6–9.
Tree `/root/projects/shark-pos-b` · branch `wip/pos-p6.2-oracle` · base = session/pos local tip **6c2352f7** (product identical to 8d0f5f37 named in the brief: `git diff 8d0f5f37 6c2352f7` = `ledger/POS-RESUME.md` only).
Static only: git + file reads. No DB, no build, no serve. Three repo tools run read-only (`sync-skills.sh --check`, `gen-pos-api-docs --check`, the matrix generator in-process).

## Commands
```
bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p6.2.mts                # gate mode: H1 H2 D1 D2 M1 S1 Z1 G1 + probes N1–N8
bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p6.2.mts --self-test    # probes N1–N8 only
bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p6.2.mts --red-before   # files of PIN through git show
bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p6.2.mts --list
```
Pins (env override; iso.sh drops env, so put `env P62_…=…` inside the command): `P62_PIN` = 6c2352f7 · `P62_LANE_PIN` = PIN (Z1) · `P62_RUN_BASE` = 71a1f363 (the start of the RUN, used for the ORACLE-EDIT range).
Manifest: `scripts/pos-gates.json` row `{ "suite": "qc-pos-p6.2", "mode": "unforced" }`. There is no SKIP gate and no seed.

## Red-before on the tip (`--red-before` = 6c2352f7 · JSON_SUMMARY passed 9/16)
| check | result on 6c2352f7 | line |
|---|---|---|
| H1 | ❌ | `ไม่มี ledger/HANDOVER-2026-10-POS.md` |
| H2 | ❌ | `ไม่มี ledger/HANDOVER-2026-10-POS.md` |
| D1 | ❌ | 19 problems: line 1 is not `# … V2` · no pointer to HANDOVER-2026-10-POS.md · no `v1 design notes` appendix · none of the 13 V2 sections … |
| D2 | ❌ | 7 problems: head is not `AS-BUILT … V2` · no as-of SHA · 44/48 models missing · 15/17 outbox keys missing · 75/79 facade exports missing · `order-shared` (export *) missing · pos.* keys missing |
| M1 | ❌ | `ไม่มี src/app/app/sys/[id]/pos/help/page.tsx` |
| S1 | ❌ | `sync-skills.sh --check exit 1` (the tree-local `.claude/skills` copy on b is stale) · `SKILL.md ไม่เอ่ย path ของกลุ่ม /reports /sync (9 กลุ่ม)` · gen-pos-api-docs --check = exit 0 already |
| Z1 | ✅ (expected) | `0 ไฟล์ในขอบเขต (เทียบ 6c2352f7)`: there is no diff against the lane pin yet. N7 proves Z1 can go red |
| G1 | ❌ at PIN | manifest row missing at PIN. Green on this branch (row added) |
| N1–N8 | ✅ 8/8 | the positive control is green and every probe is red (H1 8 probes · H2 4 · D1 5 · D2 4 · M1 10 · S1 3 · Z1 4 · G1 3) |

Gate mode on this branch (oracle + manifest row · `--no-db`): **10/16**. The red set is **H1 H2 D1 D2 M1 S1**. G1 and Z1 are green, and N1–N8 are green.

Sources read from code today (they move with the code, they are not hard-coded): pos.* permission keys **24** · POS integration cards **13** (`POS_INTEGRATION_CODES`) · models in `prisma/schema/pos*.prisma` **48** · pos.* outbox keys **17** (consumer registry ∪ POS-CONTRACTS event table) · facade exports **79** + `export type * from "./order-shared"` · OP W-items **W1–W43** (none closed) · hunter reports **7** (`ledger/wo-notes/pos-*-hunt*.md`) · REST op groups **9** · POS tab paths **8** · older POS handovers **4** · ORACLE-EDIT commits in 71a1f363..6c2352f7 = **426**.

## What the builder (and the controller) must produce
**H1 + H2 — `ledger/HANDOVER-2026-10-POS.md`** (brief §5: the controller fills it; the builder may draft it). Headings must be exactly `## §0` … `## §8`; the title after the number is free.
- `## §0`: at most 15 non-empty lines. It names the 4 superseded files (`HANDOVER-2026-10-10-POS-P1.md` `…-16-POS-P2.md` `…-22-POS-P3.md` `…-23-POS-P5.md`) and uses the word "supersedes" (or แทนที่).
- `## §1`: card table. The first cell holds the card id(s) of the 55 cards: P0.1–P0.3 · P1.1a · P1.1b · P1.2–P1.18 · P2.1–P2.14 · P3.1–P3.12 · P4.1–P4.3 · P5.1–P5.3 · P6.1–P6.2. One row may carry several ids, for example `P3.1 · P3.2 · P3.3 · P3.10 · P3.11 (P3-SKEL)`. Every id needs at least one row with a SHA in backticks. **Every** SHA in those rows must be an ancestor of HEAD. All-digit tokens such as migration timestamps are ignored.
- `## §2`: real bugs (hunter/reviewer High/Med). Columns are `| id | severity | card | source | fix |`:
  - id: something like F1, N2, MA3, L1-F4, R2-1 or F-P3-16;
  - severity: High or Med/Medium;
  - card: P#.#[U], HF-* or P3-SKEL;
  - source: a `ledger/wo-notes/…md` path that exists;
  - fix: an ancestor SHA, or `debt`/`OP`/`W#`.

  Every `ledger/wo-notes/pos-*-hunt*.md` (7 today) must be cited in §2, and §2 needs at least that many rows.
- `## §3`: ORACLE-EDIT. One line in this form: ``ORACLE-EDIT total: <N> commits · range `71a1f363..<end-sha>` ``. N must equal `git log --grep ORACLE-EDIT --oneline 71a1f363..<end> | wc -l` exactly. The list holds every ORACLE-EDIT commit of that range as backticked SHAs. It may sit inline, or in a ledger `.md` file linked from §3, for example `ledger/HANDOVER-2026-10-POS-oracle-edits.md` generated by `git log --grep ORACLE-EDIT --format='| \`%h\` | %ad | %s |' --date=short 71a1f363..<end>`.
- `## §4`: debt table with at least 3 data rows. Each row cites W#, OP/POS-OWNER-PENDING, or an existing `ledger/wo-notes/…md`.
- `## §5`: owner items. One table row per W-item of `POS-OWNER-PENDING.md` (W1…W-last = W43 today). The first cell is `W<n>` and one cell holds the state `open`, `default` or `closed`. `closed` is allowed only when OP marks that W closed (row head struck `~~W…` or `[closed]`). W ids that are not in OP are red.
- `## §6`: rollback. It must cite `docs/pos/DEPLOY-RUNBOOK.md` and `§9` (the runbook keeps `## 9.`).
- `## §7`: how to run. It must contain `scripts/iso.sh`, `scripts/pos-gates-all.sh`, `qc:all` (or `scripts/qc-all.mts`), `scripts/qc-pos-buttons.mts` (walker) and `scripts/qc-pos-p5.3.mts` (perf). Every `scripts/…` path cited must exist. No `export CI`.
- `## §8`: evidence index (H2). Table rows whose first cell is one of:
  - `EV-C1`…`EV-C8` = CRM-MASTER-PLAN §10 items 1–8, in the same order: status+SHA/ORACLE-EDIT/HANDOVER · wo-notes · oracle diff ↔ ORACLE-EDIT · qc:all · screenshots/buttons · hunter reports · prod migration rehearsal + backfill · .env/EAS/no-suite-on-prod;
  - `EV-P1`…`EV-P6` = POS-MASTER-PLAN §10: real prod sale at a trial shop · Z report · MANUAL order to account · qc:all · parity 3 sizes · HANDOVER.

  Rules for these rows:
  - EV-P1, EV-P2 and EV-P3 must say `owner`, and EV-P1 must cite `W5`.
  - EV-C7 may say owner (W31/W32).
  - Every other row needs a location: an existing repo path, or `/root/pos-runs/…`.
  - EV-P4 needs a passed/total figure.
  - EV-P5 needs 1440, 1024 and 390.
  - EV-P6 cites `ledger/HANDOVER-2026-10-POS.md`.
  - EV-C6 cites a `wo-notes/pos-*hunt*` file.
  - EV-C8 mentions `.env` and `EAS`.

**D1 — `docs/modules/14-pos.md` rewritten as V2:**
- Line 1: `# … V2 …`.
- Within the first 10 lines: a line that names `ledger/HANDOVER-2026-10-POS.md` with a backticked ancestor SHA (the as-of commit).
- Keep a `>` line in the **first 6 lines** that points at HANDOVER-P3. If it goes, `qc-pos-p3.12` K3 turns red.
- The old spec moves under a heading `## … v1 design notes` (ruling 7). Sections are counted only above it.
- Required `##` headings (keyword match, case-insensitive). Each needs at least 5 non-empty lines and at least 1 existing repo path:
  - `Register · pay · tenders`
  - `Bills · refund`
  - `Shifts`
  - `Products · prices · channels`
  - `Tables · KDS · orders · QR`
  - `Customer display`
  - `Multi-branch`
  - `Reports`
  - `REST` (must cite `docs/api/POS-API.md`)
  - `Integrations` (must name all 13 codes: MEMBER POINT COUPON REWARD ACCOUNT INVENTORY HR CRM CHAT KANBAN MARKETING BOOKING AI)
  - `Offline`
  - `AI`
  - `Permissions`: a markdown table whose pos.* keys equal the 24 keys of `src/lib/core/permissions.ts` exactly, nothing missing and nothing extra.

**D2 — `docs/sds/modules/pos.md` AS-BUILT V2:**
- Line 1: `# … AS-BUILT … V2`.
- An ancestor SHA in the first 6 lines.
- It must name: every model of `prisma/schema/pos*.prisma` (48) · every pos.* outbox key (17: `src/lib/outbox-consumers.ts` ∪ POS-CONTRACTS `## Event` table, `a/b` short forms expanded) · every export name of `src/lib/modules/pos/index.ts` (79, including types and `export const` namespaces) + `order-shared` · every pos.* permission key (ruling 7). These are names only; free prose around them is fine.

**M1 — `src/app/app/sys/[id]/pos/help/page.tsx`** (one read-only server page · ruling 6):
- Page guard: `requireTenant()` + exactly one `prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } })` + `notFound()`. No other prisma call.
- Imports only from this list: `next/link` · `next/navigation` · `next-intl/server` · `@/lib/core/context` · `@/lib/core/db` · `@/lib/systems` · `@/lib/modules/pos/tabs` · `@/lib/modules/pos/access` · `@/components/ui/*` · `@/components/module-tabs` · `@/components/icon(s)` · `lucide-react`. No co-located `./` files.
- No `"use client"`/`"use server"`, `fetch(`, `<form`, `action=`, `onX=` or raw SQL.
- No Thai characters in code (comments are fine). Every string goes through `getTranslations("pos.help")` (or another pos/common namespace) with keys present in **both** `src/messages/th/pos.json` and `src/messages/en/pos.json`. Template keys `` t(`links.${k}`) `` need the `links` subtree in both locales with identical key sets, and the whole namespace subtree must have the same key set in th and en.
- Links: `href: "register"` entries in a const list (rendered as `` href={`${base}/${l.href}`} ``), or `` href={`${base}/x`} ``, or `/app/sys/${id}/pos/x`. Each must resolve to an existing `src/app/app/sys/[id]/pos/<x>/page.tsx` (or the overview `/app/sys/[id]`). It must link **all 8 POS tabs** (register products stock sales shifts close reports settings). No external links.
- Registry (`scripts/pos-ui-inventory.json`): one row per link target, with `page "/app/sys/[id]/pos/help"`, `kind "link"`, `expect.type "navigate"` and `expect.target "/app/sys/[id]/pos/<x>"`. Every help-page row's testid must exist in the page; template testids `` data-testid={`pos-help-link-${k}`} `` count.
- Page map: `scripts/pos-visual-sweep.json` `pages.<name>` = the page file. `<name>` is added to `POS_PAGES` in `scripts/pos-qc-env.mts`, and the sweep has `runs` for that page in **th and en**. Because of this, `scripts/visual-pos.mts` must be able to shoot it (this is the P6.2 visual round: th/en · 3 sizes).
- Authz: either a pin in `scripts/qc-hf-pos-page-authz.mts` that contains the file path, or a refusal testid in sweep `refusals` (p2.14 V4).
- Matrix: `scripts/pos-authz-matrix.json` has a `page` row for the file, and `pos-authz-matrix-gen --check` matches (run `--write`, then check the row).
- Entry link: `src/app/app/sys/[id]/pos/settings/page.tsx` links to `/pos/help`, and the inventory has a settings-page row with `expect.target "/app/sys/[id]/pos/help"`.

**S1:**
- `skills/shark-pos-api/SKILL.md` mentions every REST op group as a path token: `/channels /devices /orders /products /reports /sales /shifts /sync /units`. Missing today: **/reports and /sync** (offline `POST /sync/sales`).
- Then run `bash scripts/sync-skills.sh`, which writes both homes and the tree `.claude/skills`, so that `--check` = 0.
- `gen-pos-api-docs --check` must stay 0. Regenerate if the registry changes.

**Z1:** the builder may touch only `docs/` `ledger/` `skills/` `scripts/` `src/messages/` + `src/app/app/sys/[id]/pos/help/page.tsx` + `src/app/app/sys/[id]/pos/settings/page.tsx`. The settings page is limited to the entry link: ≤ 20 changed lines, ≤ 3 removed, and an added line containing `/pos/help`. Any other path is red, including `prisma/`, `package.json` and `src/lib/**`.

Suites the builder must also keep green, because they touch the same files: `qc-pos-p2.14 --no-db` (V1 V3 V4 G1) · `qc-pos-p3.12` K3 (14-pos.md pointer) · `qc-pos-p4.1` (new testids in the registry) · `qc-pos-p5.2` M1/M5 (matrix) · `qc-pos-api-skill` / `qc-pos-p2.13` (skill) · `gen-check` · fitness ±env · strict tsc of any changed script.

## CD-P62-O decisions
- **O1 cards:**
  - "55 cards" = the plan heading counts (3+18+14+12+3+3+2).
  - P1.1 = P1.1a + P1.1b. Both ids are required, and they may share a row.
  - The P0–P2 rows of the plan table are cross-checked against the oracle list; a new plan row means red, then ORACLE-EDIT `CARDS`.
  - P2.9b and the U/HF ids are optional extras.
  - §0 has a 15-line limit (brief §6 "keep §0 to 10 lines" + table/heading slack).
- **O2 ORACLE-EDIT count:**
  - The stated count must equal git exactly for the range the document states. The range starts at RUN_BASE 71a1f363 and ends at an ancestor.
  - Tolerance = **20** ORACLE-EDIT commits between that end and HEAD (re-pins at the P6.2 merge).
  - The listed SHA set must equal the range set; it may live in a linked ledger appendix.
  - The count uses the `--grep ORACLE-EDIT` (case-sensitive) git semantics, merges included.
- **O3 evidence ids:** EV-C1…C8 / EV-P1…P6 are fixed first-cell keys so the check stays mechanical. The owner-only rows are P1 (W5), P2 and P3, and they do not block the counter (ruling 9). C7 may be owner.
- **O4 the "V2 head line"** is recognised as follows:
  - line 1 `# … V2`;
  - a line within the first 10 that names the final HANDOVER with an ancestor SHA;
  - the old P3 pointer stays in the first 6 lines (p3.12 K3 compatibility);
  - sections are recognised by heading keywords above the `v1 design notes` appendix;
  - as-built proof = each section cites at least 1 existing repo path.
- **O5 "read-only" for the manual:**
  - an import allowlist;
  - one prisma call, and it must be the system guard (POS has no `requirePosPage` helper; the account precedent's guard is `requireAccountPage`);
  - no mutation surfaces (actions, forms, handlers, fetch, raw SQL);
  - no Thai literals in code.
- **O6 "POS page routes"** = `src/app/app/sys/[id]/pos/**/page.tsx` that exist, plus the overview `src/app/app/sys/[id]/page.tsx`. Public pages (`/r`, `/d`, `/q`) do not count as manual links. The manual must cover every tab of `POS_NAV_PATH` in `tabs.ts` (derived, 8 today).
- **O7 entry point** (ruling 6 says "⌘K and settings"):
  - POS has no command palette; ⌘K exists only in account-v2 QuickCreate. So the entry is a link on the POS settings page.
  - Z1 lets exactly that file change, with a small budget (≤ 20 lines · ≤ 3 removed · must add `/pos/help`).
  - If the controller wants no product change outside the help page, drop M1's two entry lines and the settings branch of Z1 (ORACLE-EDIT).
- **O8 manual page map:** the page is mapped as its **own** POS_PAGES page with th+en runs, not as an exempt child. The reason is that P6.2 done requires a visual round of the manual (th/en · 3 sizes).
- **O9 tools:** `sync-skills.sh --check`, `gen-pos-api-docs --check` and the matrix generator check the **disk tree** even under `--rev`/`--red-before`; the matrix compare is skipped under `--rev`. S1 on tree b today is also red because b's gitignored `.claude/skills` copy is stale. Other trees without `.claude/` only check the two homes.
- **O10:** Z1 is green before by construction (no diff against the lane pin), and N7 proves it can go red. G1 (manifest row) was added beyond the brief list, mirroring p6.1 G1.
- **O11 PIN = 6c2352f7** (the real tip of this branch). `pos-oracle-check --base 8d0f5f37` would WARN O3. Use `--base 6c2352f7`, or set `P62_PIN` in the builder prompt.
- **O12 S1 op groups** = the first path segment of every op in the `ops/*.ts` files that `registry.ts` imports. "Mentions" = a literal `/<group>` path token, not just the word.
- **O13 D2** also requires the 24 pos.* permission keys (ruling 7: "models · events · facade · permissions").
- **O14 §5 state:** today no W-item is closed in OP, so all of W1–W43 must be `open` or `default`.

## Lint · type-check · regression
- `bash scripts/pos-oracle-check.sh /root/projects/shark-pos-b qc-pos-p6.2 --base 6c2352f7` → **VERDICT green** (red 0 · warn 0 · O3 PIN + RUN_BASE in tree · O5 lane pin · O9 in manifest · O10 21 ORACLE-EDIT mentions / 24 probe).
- Single-file strict tsc: a scratch tsconfig (`/tmp/p62-oracle-tsc-20261024T021309Z/tsconfig.json`) that extends the repo one, with `files` = this script + `next-env.d.ts` → **exit 0**. Positive control (a deliberate TS2322 file added) → exit 2. The first run caught a TS2769 on the `spawnSync` env type; it was fixed with `NodeJS.ProcessEnv`.
- `qc-pos-p2.14 --no-db` → **15/15** with the new manifest row (G1/G2/G3 pass).
- `--self-test` → 8/8.
