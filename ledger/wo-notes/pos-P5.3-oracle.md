# POS P5.3 — perf oracle + seed writer (`scripts/qc-pos-p5.3.mts` · `scripts/seed-pos-perf.mts`)

Oracle writer · account B · 22 Oct 2026 08:0x–08:4xZ (`date -u`) · tree `/root/projects/shark-pos-b` · branch `wip/pos-p5.3-oracle` from `origin/session/pos` **045ca85f**.
Brief: `ledger/pos-briefs/pos-brief-P5.md` §4 P5.3 · §7 W-next-6 · §10 rulings 7 8 9 + addendum. Prompt: `pos-prompt-accountB-P5.3-ORACLE.md`. Nothing under `src/` was touched. No build, no server, no QC5, no perf tenant anywhere (QC4 was read only).

Files:
- `scripts/seed-pos-perf.mts` (commit e44a9773): creates the temp tenant `posqc-perf-<rand>` through module writers. Flags: `--dry`, `--preflight`, `--resume <id>`, `--drop <id>`.
- `scripts/qc-pos-p5.3.mts` (commit ee88ab81): the perf oracle, 23 checks (9 static, 14 measure).
- `scripts/pos-gates.json`: adds `qc-pos-p5.3` with mode **unforced**, right after `qc-pos-p5.2`. The file has no SKIP gate, so G2 gives unforced, and it has no `requires:` header, so there is no `needs`.

## 1. Measurement method
- **Screen.** Headless Chromium, 1024×768 (iPad landscape, `hasTouch`, not mobile). The puppeteer-core launch is the same as `visual-pos.mts` / the P4.2 walker: `/usr/bin/chromium-browser`, a profile in `/tmp/chr-pos-p53-<pid>` that is always removed.
- **User.** The perf tenant's cashier (STAFF, unit A, same permissions as the QC cashier). The oracle mints a session (deleted in finally and on signals) and gets a staff token from `issueStaffToken`. The seed registers the device and sets the PIN. The owner opens a shift with `shift.openShift`, and the oracle closes it at the end with counted = expected.
- **Cold vs warm.**
  - B1 cold: a **new browser context per run**, so the HTTP cache and storage are empty. 5 runs.
  - B2 warm: one context, one warm-up load, then `page.goto` × 10.
  - The server is not restarted between cold runs, so "cold" means client-cold (CD-P53-O5).
- **TTI.** `performance.now()`, which counts from navigation start, taken at the first rAF where all of these hold:
  - `pos-reg-grid` is not `aria-busy`;
  - the first `pos-reg-product-*` card is visible and enabled;
  - the card is hydrated (`__reactProps$` is on the node);
  - `elementFromPoint` at the card's centre lands inside the card, so no lock screen, sheet or banner covers it.
- **RTT subtraction.**
  - DB RTT is `SELECT 1` × 50 (p50). Every in-process number includes it. `netP95 = p95 − queries × RTT` is printed beside each one.
  - App RTT is `GET /api/v1/pos/openapi.json` × 50: no DB and no key. It is printed beside the HTTP lookup.
  - Gated numbers are **not** reduced by RTT. They are end-to-end on the box, as the cashier would see them.
- **In-process server timings.** A counting `PrismaClient` (`$on("query")`) is placed on `globalThis.prisma` before `@/lib/core/db` is imported, which is the `qc-crm-perf` pattern. Each series does 2 warm-up calls, then the runs. It reports p50/p95/max and the median queries per call.
- **Wedge scanner (B3U).** `page.keyboard.type(code)` + Enter. The gap between keys is ≤ 30 ms, which is `SCAN_MAX_GAP_MS`, so the page classifies it as a scan. The time is the `keydown.timeStamp` of the last character → the rAF after the new distinct `pos-reg-cart-line-*` appears (MutationObserver). It uses 20 products outside the first grid page.
- **200-line bill (B4)**, done 5 times:
  1. Load the page.
  2. Press "more" until there are ≥ 200 cards.
  3. DOM-click 199 cards, then wait for network idle.
  4. Click card 200. **B4A** = click → rAF after the 200th line appears.
  5. **B4Q** = request → finished of the server-action POST whose body has 200 `"productId"` (the page's own quote). The time for the total to settle (`pos-reg-total` not busy and Pay enabled) is reported beside it.
  6. Press Pay → quick-exact → confirm. **B4P** = confirm click → `pos-reg-done` visible (rAF). The submit action's round trip is reported beside it.
  7. ⚠️ Each run is a real cash bill in the perf tenant. Z3 checks that every bill of this shift is in the perf tenant and has 200 lines.
- **N+1 (B4N).** `quoteRegisterCart` in process at 1, 20 and 200 lines, 2 warm-up + 10 runs each. Slope = (q200 − q20) / 180 must be < 0.5 queries per line.
- **Red rule (ruling 8).**
  - A gated value over budget is 🟡 "OVER 1/2" on the first run, and that run still passes.
  - It is 🔴 when the previous run was also over. The previous run is the newest `/root/pos-runs/perf/p53-*.json` that is at most 24 h old.
  - A value that cannot be measured is red at once.
  - B4N is structural, so it is red on the first run.
- **Output.** A table, plus `/root/pos-runs/perf/p53-<UTC>.json` (metrics, checks, RTT, the previous file), plus `JSON_SUMMARY {total, passed, failed, rtt{dbP50, appP50}, metrics{id:{p50, p95, value, budget, gate, verdict, n}}, previous, out}`.
- **Gate mode** (no `--base`; this is what `pos-gates-all` and `qc:all` run): static checks only. It does not touch the DB or open a browser. Static checks:
  - S1: the budgets table equals the W-next-6 defaults.
  - S2: the seed's guards are present.
  - S3: there is no prod host, no `.env`, `--base` must be loopback and not :3215, and measuring is tied to QC5.
  - S4: the manifest row is present with the right mode.
  - N1–N5: inverse probes of each judge.

## 2. Budgets (`PERF_BUDGET` · W-next-6 defaults · ruling 8)
| id | metric | stat | budget | gate |
|---|---|---|---|---|
| B1 | register cold TTI (new context) | p95 | — | report (W-next-6: cold reported only) |
| B2 | register warm TTI | p95 of 10 | **1000 ms** | gate |
| B2S | `registerCatalog` in-process (page loader) | p95 of 20 | — | report + queries |
| B3 | `registerScan` in-process (server lookup) | p95 of 50 | 100 ms | report (W-next-6: server lookup reported) · + `catalog.byBarcode` × 50 |
| B3H | REST `GET /products/lookup` over HTTP | p95 of 50 | — | report + app RTT |
| B3U | wedge scan → cart line (register) | p95 of 20 | **100 ms** | gate |
| B4A | add line 200 → rendered | p95 of 5 | **100 ms** | gate |
| B4Q | quote round-trip at 200 lines | p95 of 5 | **1000 ms** | gate |
| B4P | pay confirm → done card, 200 lines | p95 of 5 | **2000 ms** | gate |
| B4N | quote queries per line, 20→200 | slope | **< 0.5 q/line** | gate (structural) |
| B5 | `listOrders` in-process (orders poll) | p95 of 20 | — | report (optional) |

Z1 checks the restore: sessions 0, the shift closed, the profile removed. Z2 checks there was no fetch outside `--base`. Z3 checks the bills: inside the perf tenant, count = B4 bills, 200 lines each.

## 3. What the controller runs on tree d (QC5 · CONTROLLER-RUN · do not overlap build/typecheck/visual/walker)
1. **Pre-flight (read only):**
   ```
   bash scripts/iso.sh bash scripts/qc5.sh pnpm exec tsx scripts/seed-pos-perf.mts --preflight
   ```
   All PF1–PF14 must be ✅. If PF2 lists an old `posqc-perf-*` tenant, `--drop` it first.
2. **Seed:**
   ```
   bash scripts/iso.sh bash scripts/qc5.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-pos-perf.mts
   ```
   - Prints `SEED_SUMMARY {tenantId…}` and the creds file `/root/pos-runs/perf/<id>.creds.json` (0600).
   - About **7 min**, measured from the QC4 RTT of 7.8 ms; QC5 is in the same region.
   - If it crashes, continue with `--resume <id>`.
3. **Build + serve tree d on QC5:** the usual visual-lane chain (`build-d-inner-10g.sh` + `qc5.sh env ACC_V2_PORT=<port> bash scripts/acc-v2-serve.sh start`). The served code must be the build under test.
4. **Oracle, run 1, then run 2** (no other heavy unit between them):
   ```
   bash scripts/iso.sh bash scripts/qc5.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p5.3.mts --base http://127.0.0.1:<port> --tenant <id>
   ```
   Run 2 compares itself with run 1's JSON, which gives the two-consecutive verdict. Each run takes about **6–9 min**, so both take about 15–18 min.
5. **Drop:**
   ```
   bash scripts/iso.sh bash scripts/qc5.sh pnpm exec tsx scripts/seed-pos-perf.mts --drop <id>
   ```
   This deletes every table row with that `tenantId`, the Tenant (id = slug), the users and their sessions, the REST key's `ChatRateBucket` rows and the creds file. D2 must report residue 0. It takes about 1–2 min.
- **Total** without the build: ≈ 30 min. With the tree-d build: + the usual 25–40 min.
- **Options:**
  - `--only B2,B3U` reruns a subset.
  - `--cold/--warm/--lookups/--scans/--bills` change the counts.
  - `PERF_N=500` gives a quick smoke seed. The oracle needs ≥ 400 products.

## 4. Evidence (this lane)
- **`seed-pos-perf.mts --dry`** (iso only, no DB): the 13-step plan. exit 0.
- **`--preflight` on QC4**, read only, through `qc4.sh` + `/tmp/shark-gate-pos.lock` + `with-gate-lock`, 08:18Z. Exit 0, 14/14:
  ```
  [env] seed-pos-perf · ไฟล์ .env.qc4 · DB ep-frosty-lab-…(QC4)
  ✅ [PF1] ตารางของ writer มีครบ (16) · ตารางที่มี tenantId 344
  ✅ [PF2] ร้าน posqc-perf-* ที่มีอยู่ 0
  ✅ [PF3] ผู้ใช้อีเมล posqc-perf-* 0
  ✅ [PF4] ร้าน QC เดิม posqc-coffee-tenant,posqc-resto-tenant ไม่เข้ารูป /^posqc-perf-[a-z0-9]{6,12}$/
  ✅ [PF5] posRegisterV2On({pos:{registerV2:true}}) = true (ธงที่ seed ตั้ง)
  ✅ [PF6] parsePriceRuleInput รับโปรทั้ง 3 (ok · ok · ok) · เพดาน 100
  ✅ [PF7] isValidPromptPayId(0899000000) = true (savePaymentProfile)
  ✅ [PF8] isPosDeviceCode(posqc-perf-000000-dev) = true · เพดานเครื่องปริยาย 3 ต่อสาขา (ใช้ 1)
  ✅ [PF9] expandBundles(pos-operate) 6 scope · มี pos.sale.create (products.lookup)
  ✅ [PF10] SESSION_SECRET มี (ไม่พิมพ์ค่า) — oracle ออกโทเคนผู้ขายด้วย issueStaffToken (ต้องตรงกับเซิร์ฟเวอร์)
  ✅ [PF11] บาร์โค้ดตัวอย่าง 8859000000006,8859000000013,8859000049999 มีในฐานแล้ว 0 แถว (ต่างระบบ = ไม่ชน)
  ✅ [PF12] RTT ฐาน p50 7.8 ms · p95 8.9 ms → ประมาณเวลาสร้าง 5000 สินค้า ≈ 7 นาที
  ✅ [PF13] ไฟล์กุญแจ /root/pos-runs/perf (นอกรีโป /root/projects/shark-pos-b)
  ✅ [PF14] host qc4: สร้างไม่ได้ — QC4 อ่านอย่างเดียว (preflight/drop)
  ```
- **Read-only probe of the in-process call shapes** on QC4, coffee tenant. It used a temporary `scripts/_p53-probe.mts` (deleted, never committed) under the POS lock. A query watcher printed nothing that was not a SELECT.
  - The counting client is the app client: `same client true`.
  - `registerCatalog` 204 ms / 13 q · `registerScan` 56.5 ms / 11 q · `byBarcode` 159.6 ms / 14 q · `quoteRegisterCart` (3 lines) 125.9 ms / 17 q · `listOrders` 66 ms / 7 q.
  - `cartToQuoteInput` lines are `{productId, qty}`, which confirms the `"productId"` count used for B4Q.
- **Gate mode** (iso only, and again through `qc4.sh` + POS lock + with-gate-lock, as `pos-gates-all` runs it): **9/9, exit 0**.
- **Red-before** (`--red-before` = the files of PIN 045ca85f through `git show`): **5/9, exit 1**.
  - Red: S1 (no oracle/budgets table), S2 (no seed), S3 (no files), S4 (no manifest row).
  - Green: N1–N5. These are the head judges against corrupted inputs, so they flip red when a guard or budget is removed.
- **Measure-mode guards** (no DB writes; each one exits before the DB):
  - `--base http://127.0.0.1:3215` refused.
  - `https://shark.in.th` refused.
  - `--tenant posqc-coffee-tenant` refused.
  - No lock marker: refused.
  - Through `qc4.sh` + lock: "รอบวัดต้องเป็น QC5", exit 4.
- **`qc-pos-p2.14 --no-db`**: G1 and G2 green (15/15) with the new manifest row.
- **Lint:** `bash scripts/pos-oracle-check.sh /root/projects/shark-pos-b qc-pos-p5.3 --base 045ca85f` → **VERDICT green** (red 0 · warn 0).
- **Single-file strict tsc** (scratch tsconfig that extends the project one, `files` = the two scripts + `next-env.d.ts`, `--listFiles` confirms both scripts are in): **exit 0**.
- **Not executed here:** the browser half and the seed's writers. That needs QC5 and a served build, and the prompt forbids both in this lane. **The controller's first run is the first execution of B1–B4 and of the create path.** Likely first-run failure points, each with its own step error:
  - the `next-action` header / `postData` capture: B4Q says "ไม่พบคำขอ quote 200 บรรทัด" and lists what it saw;
  - the lock screen or shift banner covering the grid: the TTI error prints `{lock, shift, revoked, grid, cards}`;
  - the "more" button not loading to 200 cards.

## 5. Findings (from reading code · for the controller / P5.3 fix round)
- **F1 (affects W-next-6 wording):** the register's **wedge-scanner path is not client-side**.
  - `onScannedCode` calls `registerScanAction` directly (`components/pos/register/RegisterScreen.tsx:1668–1674`).
  - The client exact match on the loaded catalogue exists only on the search-Enter path (`:1639–1650`).
  - Brief ⚠️3 (`:1603`) is out of date. B3U therefore includes a server-action round trip (registerScan ≈ 11 queries; 56 ms in process on QC4, coffee tenant). It is likely over 100 ms.
- **F2:** REST `GET /products/lookup` calls `registerScan` (`pos/api/ops/products.ts:74–77`), not `catalog.byBarcode` as brief ⚠️3 says. So B3 measures one function that serves both the scanner and the REST op. `byBarcode` (`catalog.ts:1327`, used by other readers) is reported beside it.
- **F3 (known debt, info line in gate mode):** `InvItem` has no index on `barcode`; `catalog.ts:1337–1338` (the D6 comment) records it as debt for P6.1. Both lookups use it through an `EXISTS`/UNION on `InvItem.barcode`. The perf tenant's products carry their own barcode (`PosProduct(systemId, barcode)`), so this cost appears only for shops whose barcodes live on InvItem. Ruling 9: fix it with a hand `CREATE INDEX CONCURRENTLY` step in the P6.1 runbook.

## 6. CONTROLLER-DECISIONS (CD-P53-O…)
1. **CD-P53-O1: where the barcode lookup is measured.** B3 is `registerScan` in process, the shared body of the scanner action and the REST op (F1/F2). `byBarcode` is reported beside it, and B3H is the REST route over HTTP. The **gated** barcode number is B3U, the end-to-end wedge scan → line on the register, which is what W-next-6 "register path" means. Because of F1, it includes a server round trip. If B3U is over budget on both runs, choose one:
   - (a) a product fix: exact-match the loaded catalogue on the client before calling the action, and keep the action for misses;
   - (b) have the owner re-rule W-next-6 to a server-path budget.
2. **CD-P53-O2: everything is measured on QC5.** The prompt says no perf tenant on QC4, and the 22 Oct lane rule says QC4 is the exam DB. That differs from ruling 7's "server on QC4". The seed refuses to create on QC4, and the oracle refuses to measure on QC4, unless `PERF_ALLOW_QC4=1` is given on the controller's order. `--preflight` and `--drop` work on either.
3. **CD-P53-O3: the 200-line quote and submit go through the register UI.** The page's own quote action, timed on the network, and the real pay dialog give the gated B4A/B4Q/B4P. The in-process `quoteRegisterCart` at 1/20/200 lines is used only for N+1 (B4N). Submit or createSale is **never called in process**: `afterSaleCommitted → scheduleDrain → drainAll` would drain the whole QC5 outbox, including other tenants' events, from the oracle process. Bills exist only through the served server.
4. **CD-P53-O4: the dataset follows the prompt, not the brief.** It has 5,000 products (all-branch rows, 2 units), **50** categories (the brief said 60), 3 price rules, 1 member, a static PromptPay, 1 device + PINs and a REST key. The brief's 300 option groups, 20,000 bills over 30 days and 2,000 members are **not** seeded. So reports (daily/products 30 days), bills list, shift Z and the option popover are out of this oracle. If you want them, they are a follow-up oracle and seed extension.
5. **CD-P53-O5: TTI** = the grid is not busy + the first card is visible, enabled, hydrated and not covered. Cold = client-cold (new browser context); the server is not restarted.
6. **CD-P53-O6: two-consecutive rule.** "Previous" = the newest `p53-*.json` that is at most 24 h old (any tenant, any build; its file name is printed). The first run over budget = 🟡, and it passes. Unmeasurable = red. B4N is red on the first run because it is not noise.
7. **CD-P53-O7: sample sizes.** B1 5 (prompt) · B2 10 (brief) · B3/B3H 50 (prompt) · B3U 20 · B4 5 bills, so B4's p95 is the worst of 5. B2S and B5 are 20 each, and B4N is 10 per size. All can be changed by flag.
8. **CD-P53-O8: not measured.** The brief's U3 extras, receipt print-preview < 1.0 s and no overflow at 390, are left to the visual lane and the walker. 1440 and 390 viewports are not measured; only 1024×768, the iPad target.
9. **CD-P53-O9: N+1 threshold** = slope < 0.5 queries per line between 20 and 200 lines. It does not apply at 1 line, where fixed costs dominate.
10. **CD-P53-O10: secrets.** The creds file (PINs and the raw REST key) lives only in `/root/pos-runs/perf/<id>.creds.json` (0600) and is removed by `--drop`. The key expires in 7 days anyway.
11. **CD-P53-O11: raw writes in the seed** are limited to the rows `seed-pos-qc.mts` also writes raw: Tenant, BusinessUnit, User, Membership, the `settings.pos.registerV2` flag and AccountSystemLink. Catalogue, categories, price rules, member, PromptPay, device, PIN and key go through module writers. S2 fails on a raw write of those models; N1 shows that.
12. **CD-P53-O12: product creation is batched.** `catalog.createProduct` runs 25 per caller transaction. The writer's tenant advisory lock is re-entrant in the same transaction, which gives ≈ 8 queries per product instead of a BEGIN/COMMIT each. A failed batch is retried up to 4 times. Resume skips barcodes that already exist.

## 7. Next
- The controller runs §3 on tree d / QC5. Two oracle runs give the verdicts.
- Then the P5.3 fix round, by owning file:
  - F1, if B3U is red;
  - index steps for P6.1 (ruling 9);
  - any N+1 that B4N finds.
- Re-measure after the fixes.
