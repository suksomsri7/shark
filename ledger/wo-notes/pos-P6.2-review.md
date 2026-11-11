# P6.2 R1 review: docs, manual, skill, nav · `wip/pos-p6.2-build` @ `10fb0cdc`

Reviewer: R1 (account A). Started 2026-10-24T03:17:44Z, written 2026-10-24T03:26:49Z (`date -u`).
Tree: `/root/projects/shark-pos-p11`, detached at `10fb0cdc`, clean. I only read it: no checkout, edit, build or serve. Every tsx run went through `systemd-run … MemoryMax=3G` and was static or `--no-db`.
Diff reviewed: `git diff session/pos...wip/pos-p6.2-build`. The merge base is `51992ce3`. It touches 18 files, +2665/−715.
Brief: `ledger/pos-briefs/pos-prompt-accountA-P6.2-R.md`.

## VERDICT: **MERGEABLE**

There are no BLOCKER or MAJOR findings. F1 is a step the controller does when merging (re-pin the lane pin). It does not need a change on the branch. F2–F6 are minor, follow-up or nit.
`git merge-tree session/pos(ae244c58) wip/pos-p6.2-build` exits 0. The two sides share no changed files.

## Runs (evidence)
| command (static / --no-db, systemd-run MemoryMax=3G) | result |
|---|---|
| `qc-pos-p6.2` gate mode | **14/16**. Red = `P6.2-H1`, `P6.2-H2` only, both "ไม่มี ledger/HANDOVER-2026-10-POS.md". Z1 = "20 ไฟล์ในขอบเขต (เทียบ 6c2352f7)". oracleEdits 428 |
| `qc-pos-p6.2 --self-test` | **8/8**. N7 = "positive control เขียว · 7 probe แดงทุกตัว" |
| `qc-pos-p6.2 --red-before` (rev 6c2352f7) | **9/16**. Failed = H1 H2 D1 D2 M1 S1 G1 (7 red). Z1 is green by construction. This matches the oracle note. S1 red-before now gives only "SKILL.md ไม่เอ่ย path ของกลุ่ม /reports /sync": the tools check the files on disk (CD-P62-O9), and the homes are already synced |
| `bash scripts/sync-skills.sh --check` | `✅ skills/shark-pos-api ตรงไบต์กับ 2 ปลายทาง`, exit 0. `diff -rq` repo copy against `/root/.claude/skills/shark-pos-api` and `/root/.claude-b/skills/shark-pos-api` shows them identical |
| `pos-authz-matrix-gen --check` | `✅ scripts/pos-authz-matrix.json ตรงกับตัวสร้าง` |
| `qc-pos-p2.14 --no-db` | 15/15 |
| `qc-pos-p4.1 --no-db` | 16/16 |
| `qc-nav-functions` | `✅ ผ่านทั้งหมด — 11 เช็ก` (S5: /pos/help now in `childrenFor("POS")`) |

## A. Manual page `src/app/app/sys/[id]/pos/help/page.tsx`: OK
- **Read-only.** There is no `"use client"` or `"use server"`. The imports (L6–15) are next/link, next/navigation, next-intl/server, core/context, core/db, systems, pos/tabs, pos/access, ui/PageHeader and module-tabs, which is the allowlist. There is exactly one prisma call, L43 `prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } })` followed by L44 `notFound()`. The page has no fetch, form, `action=`, `onX=` or raw SQL. The only interactive elements are `<Link>` (L98, L102) and `<details>/<summary>` (L132–133).
- **Access rule (traced in code, not taken from the note).**
  - L41 `requireTenant()`. L45 `posMembership(auth.active)`.
  - L46 `canRead = m.role !== "STAFF" || Object.entries(m.permissions).some(([k, v]) => v === true && k.startsWith("pos."))`.
  - `Role` has exactly OWNER, MANAGER and STAFF (`prisma/schema/core.prisma:120-124`). So the rule is: owner or manager, or a STAFF member holding at least one `pos.*` key. The wildcard `pos.*` also starts with `pos.`, so it counts. This is the same shape as `canReadInventory` (`src/lib/core/rbac.ts`).
  - When `!canRead`, the page shows only L57 `data-testid="pos-help-refusal"` (role=alert) with HTTP 200, and no manual content.
- **Strings.** No Thai and no literal UI text in the JSX. Every string goes through `t = getTranslations("pos.help")` (L48), and the tab labels use `tPos` = `pos` → `nav.*`.
  - `pos.help.*` has **108 keys in th and 108 in en**, with an empty symmetric difference. The page needs 108 keys (expanded from START_STEPS, DAY_STEPS, POINTS, FAQ, TABS and more), and all 108 exist in both locales. No key is unused.
  - No en value contains Thai, and no value is empty.
  - Whole `pos.json`: th 4630 / en 4630, diff 0. The only added keys are `help.*` (108) plus `settings.helpLink`, with nothing removed or changed (th and en).
- **Links.** TABS L20–27 = register, products, stock, sales, shifts, close, reports, settings. That is the 8 `POS_NAV_PATH` entries of `src/lib/modules/pos/tabs.ts:11-21` minus overview. Secondary links: tables, orders, kds, products/price-rules. All 12 `src/app/app/sys/[id]/pos/<x>/page.tsx` exist (checked one by one). There are no external links.
- **Server/client.** The page is a server component. It renders the client `ModuleTabs` (`src/components/module-tabs.tsx`, "use client", which imports only next/link, next/navigation and ./nav-perms) with plain props. No client module imports a server module.
- **Content.** I spot-checked the manual text against the code. The settings tab names (Receipt & tax, Payment methods, Devices & printers, Staff & permissions, Offline & sync) match `pos.settings.tabs`. F8 hold is in `RegisterStatusBar.tsx:35`. Held-bill expiry days is `held-cart.ts:87`. No invented feature found.

## B. Settings link + layout line: OK
- `src/app/app/sys/[id]/pos/settings/page.tsx`: **8 added, 1 removed = 9 changed lines** (limits ≤20 and ≤3 removed).
  - L2 `import Link`.
  - L218–224 `const helpLink = (<Link href={`/app/sys/${id}/pos/help`} … data-testid="pos-settings-help">{t("helpLink")}</Link>)`, where `t` = `getTranslations("pos.settings")` (L90).
  - L226 `<PageHeader … actions={helpLink} />`. The const is passed to `PageHeader` `actions` (`src/components/ui/PageHeader.tsx:6,20`).
- `src/app/app/layout.tsx:139`: exactly one added line, 0 removed, inside the POS case, after `/pos/settings`: `{ href: `${s}/pos/help`, label: posNav("settings.helpLink") }`. `posNav` = `getTranslations("pos")` (L67).
- The key `settings.helpLink` exists in th (`src/messages/th/pos.json:3288` "คู่มือการใช้งาน") and en (`en/pos.json:3288` "User guide"). There is no other change in either file.

## C. Docs: OK
- **14-pos.md permissions.** §13 has **24 table rows**. The set of `pos.*` keys in §13 equals the 24 action keys of the pos module in `src/lib/core/permissions.ts:133-156` (`diff` gives no output) and there are no duplicate rows. Defaults are consistent with `evaluate` (MANAGER passes every key). `pos.offline.sync` → bundle `pos-admin` is confirmed at `src/lib/api-keys/scopes.ts:292`.
- **Integrations.** §10 names all 13 `POS_INTEGRATION_CODES` (`src/lib/pos-integrations.ts:26`).
- **SDS recount, done from the code.**
  - Models: `^model` in `prisma/schema/pos.prisma` + `pos_order.prisma` = **48**, and all 48 appear in the SDS §2 table (48 rows). No `model Pos*` lives outside `pos*.prisma`. The `PosPayType` count of 10 in the SDS is correct.
  - Outbox: `"pos.*"` in `src/lib/outbox-consumers.ts` = **17**. SDS §3 lists all 17, plus a note on `pos.sale.expired` (replaced by `pos.order.cancelled`, as in POS-CONTRACTS L141). I checked the producer of every key by grep, and each matches the file named in the SDS (`shift.ts`, `stock-count.ts`, `deposit.ts` + `refund.ts`, `catalog.ts`, …).
  - Facade: `src/lib/modules/pos/index.ts` exports **79** names plus `export type * from "./order-shared"`. None is missing from the SDS.
- **v1 appendix.**
  - v1 §1 §2 §3 §7 §8 §10 §11 §12 are carried over **verbatim**. The heading demotion is the only change, and I checked it block by block against `git show session/pos:docs/modules/14-pos.md`, which is the same file as `6c2352f7`.
  - §4 Data Model, §5 API, §6 UI and §9 Permissions are not silently dropped. Each is replaced by a heading `### n. … — แทนที่แล้ว` that points to the SDS, `docs/api/POS-API.md` or V2 §13, and cites `git show 6c2352f7:docs/modules/14-pos.md` for the full old text. The appendix intro says this explicitly.
- **Paths, secrets, hosts.** Every backticked repo path in both docs exists. The only "missing" ones are brace shorthands (`src/app/(store)/{r,q,d}`, `src/app/api/pos/{sync,print-agent,platform}`), and each expanded path exists. A grep for keys, connection strings, neon or vercel hosts and IPs finds nothing. `POS_DEVICE_KEY` appears only as an env var name, with no value.
- **As-of SHA.** `6c2352f7` is an ancestor of `10fb0cdc` and of `session/pos`.

## D. Skill `skills/shark-pos-api/SKILL.md`: OK
- The registry (`src/lib/modules/pos/api/registry.ts:13-21`) imports 9 op files. Their op groups are channels, devices, meta→units, orders, products, reports, sales, shifts and sync. SKILL.md now names `/reports` (L76–81) and adds a section "Offline sync" for `POST /sync/sales` (L170–184).
- **Reports.** The named paths `/reports/daily`, `/summary`, `/products`, `/payments` and `/channels` all exist in `ops/reports.ts` (L80–237). The full list is delegated to `references/endpoints.md`.
- **Sync.** Every claim matches `ops/sync.ts`:
  - max 50: `z.array(item).max(50)`
  - "sold time order" is in the summary
  - scope is `POS_SCOPES.offlineSync`
  - `OFFLINE_DISABLED`→`NOT_ELIGIBLE`→ 409 `state_conflict` (`http-errors.ts:110`)
  - the fields `unitId`, `deviceId` (the device code), `items[]` (`offlineRef`, `idempotencyKey`, `soldAt`, `snapshotHash`, `sale`) exist
  - results OK / DUPLICATE / REJECTED, and the manager queue is `OfflineQueueSection.tsx` `pos-shift-offline-queue` on the Shifts page

  No invented endpoint or field.
- **Both homes identical.** `sync-skills.sh --check` exit 0 (quoted above).

## E. Oracle `qc-pos-p6.2`: OK (gaps under F3)
- 16 IDs = 8 checks (H1 H2 D1 D2 M1 S1 Z1 G1) + 8 probes (N1–N8).
- Each judge is a pure function of `Inputs` read from the real files: the handover, the docs, the page source, the messages, the inventory, the sweep, the matrix and the `git` ancestry and log.
- Proxies by design (static):
  - D1 "as-built" = each section cites ≥1 existing repo path.
  - S1 = the path token is mentioned. I checked correctness by hand in D.
  - M1 authz = refusal mapped in sweep + inventory, see F3.
  - H1 §1 = the SHA is an ancestor, not proof that it is that card's commit.
- **Z1 / CD-P62-O1.**
  - `F.layout` is in scope with `LAYOUT_ADDED_MAX = 2` (L95). `judgeZ1` L879–885: removed must be 0, added ≤2, every added line must match `/\/pos\/help\b/`, and there must be ≥1 added line.
  - Probe check: "layout ลบบรรทัด" trips removed>0. "layout 3 บรรทัด" trips added 3 > 2; all its lines contain /pos/help, so only the count rule fires. "layout ไม่มี /pos/help" trips the every-line rule. Each probe makes the judge fail for the intended reason (self-test "7 probe แดงทุกตัว").
  - The budget is ≤2 while the ruling says one line. The actual diff is 1 line, so no action.
- **Manifest.** The row in `scripts/pos-gates.json` is `{ "suite": "qc-pos-p6.2", "mode": "unforced" }` with no `needs`.
- **Red-before** reproduced (see Runs).
- H1/H2 are red by design: there is no `ledger/HANDOVER-2026-10-POS.md`. They turn green only with a real file that meets the list at the end of this note.

## F. Inventory + sweep: OK
- **Rows.** 18 new rows are appended at the end of `rows` (indexes 1256–1273, `scripts/pos-ui-inventory.json` from L32767): 17 for `/app/sys/[id]/pos/help` + `pos-settings-help` (L33098).
- **Testids.** Every testid exists in the page or matches its template: `pos-help-module-tabs` L55, `pos-help-link-*` L98 + 8 concrete rows, `pos-help-more-*` L102 + tables/orders/kds/promos (→ `products/price-rules`), `pos-help-faq-*` L133 → `pos-help-faq-answer-*` L139, `pos-help-refusal` L57.
- **Kinds and safety.**
  - Links are `kind link` + `navigate` with concrete targets. The tab row follows the `posTabs` precedent (`/pos/*` plus anyOf `/app/sys/[id]`).
  - The refusal row is `kind notice` with `ui/refused`, roles [cashier], hiddenFor [owner, manager] and `needs`. Same shape as `pos-tables-refusal` and `pos-orders-refusal`.
  - No `safety` field: there is no money, external or counter element, which is correct per `$fields.safety`.
  - The `ui` row without `state` has precedent (143 such rows).
- **Determinism.** The rows have a fixed order and fixed field order, with no timestamps or random values. `registryHash` = `sha16(raw file)` (`scripts/pos-buttons-fixtures.mts:58`), so it is stable. It changes once, so the P4.2 walker and W3 must be summarised at the final tip. The controller plan already orders "merge P6.2 before gates131 → chain-p43-d".
- **Sweep.** `pages.help` = the page file (L26). `refusals["/app/sys/[id]/pos/help"] = "pos-help-refusal"` (L46). Run `p6.2-help` covers owner + cashier in th + en (L748–765). `POS_PAGES` includes `help`. `visual-pos.mts` adds `PAGE_EXPECT.help` and, for `--page help`, the en run keeps all 3 sizes.
- **Matrix.** The row is regenerated (`--check` green). The settings evidence line moved 74→75 because of the import line. I verified that.

## G. Hunter pass (money/authz): **no authz defect**
- The help page needs a session (`requireTenant`). The system lookup is scoped by tenant (`findFirst({ id, tenantId, type: "POS" })` → `notFound`), so a different tenant or a wrong type gets 404.
- The only shop data shown is `sys.name` and the system icon, both already visible on every POS page. There are no reads, actions or routes.
- The settings link and the sidebar line are plain navigation. Each target page still makes its own authz decision.
- No permission is widened. No route is callable without a session. No cross-tenant exposure. Nothing touches money.

## Findings
| id | sev | evidence | exact fix |
|---|---|---|---|
| F1 | MINOR (merge step) | Z1 diffs `git diff --name-only ${LANE_PIN}..TIP` with `LANE_PIN` = `6c2352f7` (qc-pos-p6.2.mts L38, L906). `git diff --name-only 6c2352f7 session/pos`, filtered to files outside docs/ ledger/ skills/ scripts/ src/messages/, gives `src/app/app/sys/[id]/pos/reports/print/html/route.ts` (fix3 `0bfff519`/`c39b71fd`). So after the merge, `P6.2-Z1` turns red at the session/pos tip (gates131) | At merge, re-pin the qc-pos-p6.2 `LANE_PIN` to the merge commit's first parent (the session/pos tip before the merge, currently `ae244c58`) with `pos-repin-lane.sh` (CD-RP…). Same pattern as CD-RP26 |
| F2 | MINOR (ordering) | `sync-skills.sh` already wrote the branch SKILL.md into both homes. On any tree at session/pos before the merge, `sync-skills --check` and `qc-pos-api-skill` K6 compare the older repo copy and go red | No branch fix. Keep "merge P6.2 before gates131". Do not run the skill suites on pre-merge trees |
| F3 | MINOR (test gap) | Neither a runtime check nor a static check pins the help-page access rule (page.tsx L46). Every QC persona holds a `pos.*` key, so the refusal inventory row is skipped by `needs`. Decision 2 means no pin in `qc-hf-pos-page-authz.mts`. M1 checks only that `refusals[...]` maps to an inventory testid present in the page, so inverting `canRead` would pass every gate. The current code is correct by reading (A) | Follow-up, not blocking: add a static pin for `help/page.tsx` in `qc-hf-pos-page-authz.mts` (ORACLE-EDIT): `requireTenant` + `type: "POS"` + `m.role !== "STAFF" \|\| … startsWith("pos.")` + `pos-help-refusal` in the `!canRead` branch. Or list it as debt in HANDOVER §4 |
| F4 | MINOR (close-out, not merge) | The P6.2 visual round (sweep run `p6.2-help`, th/en × 1440/1024/390, CD-P62-O8 / brief P6 §5) has not been shot. There is no `/root/pos-runs/*p6.2*` or `*p62*`, and `ledger/ctl-scripts-2026-10-23A/chain-p43-d.sh` has no `help` or `p6.2` step. The builder was static only | After the merge, add `visual-pos` run `p6.2-help` (th + en, `--page help`) to the tree-d build (chain-p43-d, or right after it on the same build). Open the shots and cite the run directory in HANDOVER §8 (EV-P5) before closing the P6.2 row |
| F5 | NIT | help/page.tsx:5 comment says the entry testid is `pos-settings-help-link`. The real testid is `pos-settings-help` (settings/page.tsx:220, inventory L33098) | Fix the comment in any later commit (optional) |
| F6 | NIT | 14-pos.md L3 and the SDS L3 cite as-of `6c2352f7` (before the build) and leave the HANDOVER path un-backticked, as a workaround for fitness F7.1 | Optional: when HANDOVER-2026-10-POS.md exists, backtick the path and bump as-of to the merge SHA |

## H1/H2: what `ledger/HANDOVER-2026-10-POS.md` must contain (from `judgeH1` L437–546 and `judgeH2` L548–600)
General: headings must be exactly `## §0` … `## §8` (regex `^##\s+§\s*k(?!\d)`, any title after). Each section runs until the next line that starts with `## `, so use `###` or deeper inside sections. Never wrap a non-commit hex token of 7–40 chars in backticks in §1/§2/§3: every backticked hex token must resolve to an ancestor of the tip, or the row fails. All-digit tokens are skipped. Use SHAs of **≥ 8 chars**: the lookup needs a unique prefix among ancestors.
- **§0:** ≤ **15** non-empty lines after the heading. The document (anywhere) must contain the 4 file names `HANDOVER-2026-10-10-POS-P1.md`, `HANDOVER-2026-10-16-POS-P2.md`, `HANDOVER-2026-10-22-POS-P3.md` and `HANDOVER-2026-10-23-POS-P5.md`. The oracle reads this list as every `ledger/HANDOVER-2026-10-DD-POS-*.md`, so do not add new files with that name pattern. It must also contain the word `supersede…` or `แทนที่`.
- **§1 card table.** The **first cell** of some row(s) must hold each of the 55 ids:
  - P0.1–P0.3
  - P1.1a, P1.1b, P1.2–P1.18
  - P2.1–P2.14
  - P3.1–P3.12
  - P4.1–P4.3
  - P5.1–P5.3
  - P6.1–P6.2

  Ids match as tokens, so P3.1 does not match P3.10. One row may carry several ids. Every id needs ≥1 backticked SHA in its row(s), and **every** backticked SHA in those rows must be an ancestor of the tip. The plan P0–P2 rows already match the list (checked: no `P2.9b` row).
- **§2 real bugs.** Every table row in §2 that contains `High`, `HIGH`, `Med`, `MED`, `Medium` or `MEDIUM` counts as a bug row, so keep those words out of the header row. Each bug row needs:
  - first cell = an id matching `[A-Z][A-Za-z0-9-]*\d` (F1, N2, MA3, L1-F4, R2-1, F-P3-16 …)
  - a card token `P#.#[a|b][U]`, `HF-XXX` or `P3-SKEL` somewhere in the row
  - a fix: either backticked ancestor SHA(s), or the word `debt`, `OP`, `W<n>` or `หนี้`
  - ≥1 `ledger/wo-notes/….md` path that exists

  §2 must name all 7 hunter files (`pos-P2.4-hunt.md`, `pos-P2.5-hunt.md`, `pos-P2.6-hunt.md`, `pos-P2.8-hunt.md`, `pos-P2.9-hunt.md`, `pos-P5.1-hunt-MA.md`, `pos-P5.2-hunt-L1.md`), and have ≥ 7 bug rows.
- **§3 ORACLE-EDIT.**
  - One line matching ``ORACLE-EDIT … <N> commits … `71a1f363..<end>` `` (or `คอมมิต`).
  - `<end>` must be an ancestor, and N must **exactly** equal `git log --grep ORACLE-EDIT --oneline 71a1f363..<end> | wc -l`. That is 428 at `session/pos` `ae244c58` today; recount at write time.
  - The tip may have at most **20** more ORACLE-EDIT commits than `<end>`.
  - The set of backticked SHAs in §3, plus any `ledger/….md` file linked from §3 (other than the handover itself), must cover that range's commits exactly. Suggested: `ledger/HANDOVER-2026-10-POS-oracle-edits.md` generated with `git log --grep ORACLE-EDIT --format='| \`%H\` | %ad | %s |' --date=short 71a1f363..<end>`. Use `%H` or a ≥8-char abbreviation, and commit that file.
- **§4 debt:** ≥ **3** data rows (the first table row is treated as the header). Each row cites `W<n>`, `POS-OWNER-PENDING` or `OP`, or an existing `ledger/wo-notes/….md`.
- **§5 owner items.**
  - One row per W of `ledger/POS-OWNER-PENDING.md`. Today that is **W1…W43**, with no gaps and none closed.
  - First cell exactly `W<n>`; `*`, backticks and `~` are stripped before matching.
  - One later cell starts with `open`, `default` or `closed`. `closed` is allowed only when OP marks that W closed (row starts `~~W…` or contains `[closed]`), so today use only open/default.
  - A W id that is not in OP is red.
- **§6 rollback:** must contain `docs/pos/DEPLOY-RUNBOOK.md` and `§9` (or `§ 9`, not followed by a digit). The runbook has `## 9.` at L552, so that is OK.
- **§7 how to run:** must contain `scripts/pos-gates-all.sh`, `scripts/qc-pos-buttons.mts`, `scripts/qc-pos-p5.3.mts`, `scripts/iso.sh`, and `qc:all` (or `scripts/qc-all.mts`). Every `scripts/…` path cited must exist. No `export CI`.
- **§8 evidence index (H2).** Table rows whose first cell is exactly `EV-C1` … `EV-C8`, then `EV-P1` … `EV-P6` (14 rows):
  - EV-P1, EV-P2 and EV-P3 must contain `owner` (or `เจ้าของ`), and EV-P1 must also contain `W5`. These rows are not checked for paths.
  - EV-C7 may say owner (then it is skipped).
  - Every other row needs an existing repo path (`src|scripts|prisma|docs|ledger|skills/…`) or `/root/pos-runs/…`. Run directories are not checked for existence. Any repo path cited must exist.
  - EV-P4 needs an `N/M` figure (qc:all).
  - EV-P5 must contain `1440`, `1024` and `390`. Link the p6.2-help or parity run (see F4).
  - EV-P6 must contain `ledger/HANDOVER-2026-10-POS.md`.
  - EV-C6 must match `wo-notes/pos-…hunt…`.
  - EV-C8 must mention `.env` and `EAS`.
