# P6.2 build — builder S (account A) · docs V2 · SDS AS-BUILT V2 · in-app manual · skill · registry rows · 24 Oct 2026 (`date -u` 02:1xZ–03:0xZ)

Brief: `ledger/pos-briefs/pos-prompt-accountA-P6.2-BUILD.md` · spec `ledger/wo-notes/pos-P6.2-oracle.md` + `scripts/qc-pos-p6.2.mts` (CD-P62-O1…O14).
Tree `/root/projects/shark-pos-f` · branch `wip/pos-p6.2-build` · base `e6d41659` (= tip + oracle merge, verified clean) · static only (no build/serve/QC5 · no DB writes).

## Commits
| commit | group |
|---|---|
| `3c3df460` | M1 — `src/app/app/sys/[id]/pos/help/page.tsx` + settings entry link + `pos.help.*`/`settings.helpLink` (th/en) + `scripts/pos-ui-inventory.json` (18 rows) + `scripts/pos-visual-sweep.json` (pages.help · refusals · run p6.2-help) + `scripts/pos-qc-env.mts` POS_PAGES + `scripts/visual-pos.mts` (PAGE_EXPECT · en `--page help` = 3 sizes) + `scripts/pos-authz-matrix-gen.mts` override + `scripts/pos-authz-matrix.json` (`--write`) |
| `18d54cd5` | D1 + D2 — `docs/modules/14-pos.md` V2 · `docs/sds/modules/pos.md` AS-BUILT V2 |
| `a1ab4241` | S1 — `skills/shark-pos-api/SKILL.md` (/reports · /sync) + `bash scripts/sync-skills.sh` (both homes) |

## Per check (qc-pos-p6.2 gate = 14/16 · red = H1 H2 only · `--self-test` 8/8)
| check | result | artefact · evidence | deviations |
|---|---|---|---|
| H1 | ❌ (expected) | `ledger/HANDOVER-2026-10-POS.md` = the controller's file (not created here) | — |
| H2 | ❌ (expected) | same file §8 | — |
| D1 | ✅ "V2 · 13 หมวด · สิทธิ์ 24 คีย์ตรง · 13 การ์ด" | line 1 `# … V2 …` · line 3 names the final HANDOVER + `6c2352f7` · line 4 `> **P3 as-built: see HANDOVER-P3**` (p3.12 K3 22/22) · 13 `##` sections each with ≥ 5 lines + existing repo paths · REST cites `docs/api/POS-API.md` · Integrations names all 13 codes · Permissions table = exactly the 24 keys (key · what it unlocks · default roles) · appendix `## ภาคผนวก — v1 design notes` keeps v1 §1–§3 §7 §8 §10–§12 (headings demoted one level, numbers kept for older suite comments) and turns §4 Data Model · §5 API · §6 UI · §9 Permissions into pointers (full v1 text = `git show 6c2352f7:docs/modules/14-pos.md`) | the HANDOVER path is written without backticks: fitness F7.1 flags backticked refs to files that do not exist yet (the controller creates it) |
| D2 | ✅ "model 48 · outbox 17 · export 79 · สิทธิ์ 24" | head `# SDS — POS / จุดตัดเงินกลาง · AS-BUILT V2` + `6c2352f7` · §2 one row per model (schema file · role · owner file) · §3 17 keys producer → consumers (+ note that v1 `pos.sale.expired` became `pos.order.cancelled`) · §4 the 79 facade names + `order-shared` grouped by area · §5 24 keys · §6 13 cards · §7 offline/sync/device binding (`POS_DEVICE_KEY`)/print relay · §8 REST · §9 oracle pointers | — |
| M1 | ✅ "อ่านอย่างเดียว · ลิงก์ครบแท็บ · th/en · ทะเบียน · แผนภาพ · สิทธิ์ · ทางเข้า" | page: imports only from the allowlist (next/link · next/navigation · next-intl/server · core/context · core/db · systems · pos/tabs · pos/access · ui/PageHeader · module-tabs) · one prisma call = the POS guard + notFound · no actions/forms/handlers/fetch · no Thai in code (comments only) · 108 keys `pos.help.*` identical in th/en · links: 8 tabs (`href: "register"` … `"settings"`) + tables/orders/kds/products/price-rules · same shell as the other POS pages (PageHeader with the system name + ModuleTabs + 18px cards) · sections: 5 first-day steps (owner) · the 8 tabs (what · who · 3 how-to points · "Go to …" + secondary links) · a cashier's day (6 steps) · FAQ ×8 (offline · void vs refund · full tax invoice · permissions · PromptPay confirmation · held bills · branches · delivery orders) | **access rule**: OWNER/MANAGER, or STAFF holding at least one `pos.*` key (pattern of `canReadInventory`); otherwise refusal card `pos-help-refusal` (page 200) — V4 is met through sweep `refusals` (not a pin in `qc-hf-pos-page-authz.mts`, which this lane may not edit) · matrix override: CASHIER allow · STAFF_NOPERM deny · OTHER_UNIT n/a · unitScoped false (no shop/branch data on the page) |
| M1 (entry) | ✅ | settings header link `pos-settings-help` → `/app/sys/${id}/pos/help` (9 changed lines · 1 removed) + inventory row | testid = `pos-settings-help` (the oracle fixture uses that literal; any other name makes p4.1 R8 report a ghost testid) · the link is built as a const `helpLink` and passed to `PageHeader actions` — an inline `<Link href>` inside the PageHeader props makes fitness F15.3a count `<PageHeader>` as an untestid control |
| S1 | ✅ | SKILL.md names `/channels /devices /orders /products /reports /sales /shifts /sync /units` · `sync-skills.sh --check` 0 · `gen-pos-api-docs --check` 0 (49 op) · qc-pos-api-skill `--no-db` 8/8 | the two home copies now carry the new SKILL.md: on other trees (session/pos before this merge) `sync-skills --check` / api-skill K6 compare their older repo copy → red until merge (skill suites of gates130 on tree c had already run) |
| Z1 | ✅ | 15 files, all in scope | — |
| G1 | ✅ | manifest row from the oracle merge | — |

## Regression (static)
- qc-pos-p2.14 `--no-db` **15/15** (V1 th+en run of `help` · V3 page map · V4 refusal) · qc-pos-p4.1 `--no-db` **16/16** (R5/R7 untestid scan · R8 ghost testids · R10 refusal row) · qc-pos-p3.12 `--no-db` **22/22** (K3) · qc-pos-p5.2 `--no-db` **23/23** (M1–M5, 404 rows) · qc-hf-pos-page-authz `HF_STATIC_ONLY=1` **17/17** · `pos-authz-matrix-gen --check` ✅
- fitness no-env **53/53** (also pre-commit on all 3 commits) · fitness QC4 env (qc4.sh + with-gate-lock POS lock) **53/53** · fitness-pos **8/8** · gen-check ✅ · visual `--list` ✅ · `all --states --dry` th 221 / en 141 shots (15 pages) · `p6.2 --page help --dry` = 3 sizes in th (owner) and en (cashier)
- qc-pos-p2.13 `--no-db` 5/6: ST5 red = `prisma/` diff vs merge-base (P6.1 `20261220100000_pos_p61_hand_indexes` · ecommerce/inventory.prisma) — pre-existing on the tip, not this lane
- **qc-nav-functions S5 ❌ (CRITICAL · in pos-gates.json)**: "POS: ขาด /pos/help" — every route under `sys/[id]/pos` must be in the sidebar accordion `childrenFor("POS")` in `src/app/app/layout.tsx`, which Z1 does not allow this lane to touch → controller decision below
- strict tsc (scratch tsconfig extending the repo · `typeRoots` absolute · ISO_MEM 3G): help page **exit 0** (positive control in-tree TS2322 → exit 2) · `pos-qc-env.mts` + `pos-authz-matrix-gen.mts` **exit 0** (control TS2322 → exit 2) · settings page and `visual-pos.mts` **OOM at 3G** → full `pnpm typecheck` = controller
- render sanity: the help page is a server component; the only client module it renders is `ModuleTabs` (plain-object props); no hooks/`"use client"` imported into it; `helpLink` on the settings page is server JSX passed to the server `PageHeader`

## ORACLE-EDIT / controller decisions needed
1. **qc-nav-functions S5** — choose one: (a) ORACLE-EDIT `qc-pos-p6.2` Z1 to allow `src/app/app/layout.tsx` with a 1-line budget that adds `/pos/help`, then add `{ href: \`${s}/pos/help\`, label: posNav("settings.helpLink") }` to `childrenFor("POS")` (the label key exists in th/en); or (b) ORACLE-EDIT `qc-nav-functions.mts` to exempt `src/app/app/sys/[id]/pos/help/page.tsx`. (a) keeps the S5 intent ("no orphan content pages") and gives the manual a sidebar entry.
2. Optional: a pin for the help page in `qc-hf-pos-page-authz.mts` (this lane used the sweep refusal path instead).

## Round 2 — ruling CD-P62-O1 = option (a) (controller ORACLE-EDIT `944ac31a` · 24 Oct `date -u` 03:0xZ–03:1xZ)
- `src/app/app/layout.tsx` POS case: one added line after the `/pos/settings` row — `{ href: \`${s}/pos/help\`, label: posNav("settings.helpLink") }` (1 added · 0 removed · no other change)
- Decision 2 (authz pin) = no: V4 stays via sweep `refusals`

| check | result |
|---|---|
| qc-pos-p6.2 gate | **14/16** — red H1 H2 only (Z1 green with the layout line) |
| qc-pos-p6.2 `--self-test` | **8/8** |
| qc-nav-functions (static) | **11/11** — S5 green · POS 15/15 routes |
| qc-pos-p4.1 `--no-db` | **16/16** |
| qc-pos-p1.18 `--no-db` | 15/16 — ST7 red = Thai literal in `src/app/app/sys/[id]/pos/reports/print/html/route.ts` (P4.3 file, not touched by this lane · pre-existing on the tip); nav-related checks green |
| fitness no-env | **53/53** (+ pre-commit) |
| strict tsc `src/app/app/layout.tsx` (scratch tsconfig · ISO_MEM 4G · heap 3700) | **exit 0** · positive control (in-tree copy + TS2322) exit 2 |
| registry ordering | the 18 new rows (17 help page + `pos-settings-help`) are appended in a fixed order, fields `page testid kind roles hiddenFor expect wo oracle system [needs]`, no timestamps / random ids / hashes → registryHash is a pure function of the file; the hash changes once vs the old tip, so qc-pos-p4.2 W3 must be summarised at the final tip that contains these rows |
