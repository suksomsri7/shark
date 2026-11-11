# POS P6.1 prep — runbook + verify-prod-pos + oracle (prep writer · account B · 22 Oct 2026)

Branch `wip/pos-p6.1-prep` · base `session/pos` 23c85130 · tree `/root/projects/shark-pos-b` · started 07:33Z (`date -u`).
Prompt: `ledger/pos-briefs/pos-prompt-accountB-P6.1-PREP.md` · brief: `ledger/pos-briefs/pos-brief-P6.md` (§2 §4 §8 §10 + addendum).
Scope kept: only docs/ scripts/ ledger/ · no src/ or prisma/ edits · no prod connection (the prod host is only allowlist data in the verify script) · no build, server, QC5, .env, pnpm install or prisma generate.

## Commits
| sha | what |
|---|---|
| 1f4a7b94 | `scripts/verify-prod-pos.mts` (read-only prod verify, 22 checks) |
| a1c8a525 | `docs/pos/DEPLOY-RUNBOOK.md` + the 3 Oct DRAFT frozen (one pointer line at the top, the rest byte-equal) |
| 7a2c15ed | `scripts/qc-pos-p6.1.mts` (19 static checks) + `scripts/pos-gates.json` row (unforced) |
| (this file) | notes |

## 1. Migration inventory (36 POS V2 files not on main · full table = runbook §2 · rollback SQL = runbook appendix A)
| count | value |
|---|---|
| POS migrations not on `origin/main` (a84bca2b) | **36** (`20261120000000_pos_v2_a` … `20261219100100_pos_p36_credit`), all after main's last `20261104000003_account_journal_no_alloc_lock_v2` |
| additive / destructive | **36 / 0** (no DROP TABLE/COLUMN, RENAME, data UPDATE/DELETE/INSERT, SET NOT NULL on existing tables) |
| relaxing change | 1: `pos_p27_qr_orders` DROP NOT NULL ×2 on `PosPaymentIntent` (a table new in this RUN) |
| one-transaction files (`DO $$`) | 8: v2_a · p24_tables · p28_orders · p26_kds · p29_tenders · p25_split · p29b_deposits · p210_customer_display |
| `ALTER TYPE … ADD VALUE` (cannot be undone) | **5**: p16_payment · p21_sales_channel · p29_tenders · p27_qr_orders · p36_credit_enum. The brief's 6 also counts p18_refund, which only has the phrase in a comment |
| files without `lock_timeout` | 9, of which 4 touch existing tables: p111_online_receipt · p113_tax_invoice · p112_member_snapshot · p34_offline |
| lock class L0 / L1 / L1-TX / L2 / L2-TX | 18 / 13 / 1 (p24) / 2 (p111, p34) / 2 (p26_kds, p29_tenders) — legend in runbook §2 |
| existing prod tables altered | **12** = 9 from other modules (AccountDocument · GiftCard · MenuItem · RestaurantOrder · RestaurantOrderItem · RestaurantSetting · RestaurantTable · ShopOrderLine · ShopProduct) + 3 `Pos*` tables from before the RUN (PosSale · PosSaleLine · PosPayment). The brief's "RecipeLine (v2_a)" is a CREATE: main has no RecipeLine table |
| in-migration indexes on existing tables (not CONCURRENTLY) | 5: `PosSale_publicToken_key` (p111) · `PosSale_unit_offlineRef_key` (p34) · `RestaurantOrder_posSaleId_key` + `_posOrderId_key` (p26_kds, DO tx) · `GiftCard_storeCredit_owner_key` (p29_tenders, DO tx) |
| NOT NULL columns added to tables with prod rows | PosSale `serviceChargeSatang` `tipSatang` `docType` `refundedSatang` `channelCommissionSatang` `channelCommissionVatSatang` · GiftCard `kind`. All have a constant DEFAULT, so they are metadata-only on PG ≥ 11 (QC4 = 18.6; verify P0 reports the prod version) |
| hand `CREATE INDEX CONCURRENTLY` list | 15 (runbook §5 = `HAND_INDEXES` in the verify script) + "P5.3 outputs" pending |

## 2. What changed vs the DRAFT (3 Oct)
- Migrations: 2 → 36, each with tx mode, lock_timeout, lock class and reverse SQL. The DRAFT §1 knew only v2_a/_links.
- Pre-flight tables: 5 → 12, plus the 5 in-migration indexes on existing tables and the 4 files with no lock_timeout.
- §0 preconditions re-checked against code with file:line: RC hotfixes are ancestors of main (not a blocker any more) · SYSTEM_MARKER_ALLOWLIST and the registerCatalog rule are done · `checkCatalogWrite` ≡ `posCanSetTenantPrice` still needs a reviewer equivalence line · `qc-prisma.sh` still has no QC4 entry (does not block deploy) · `--update-pos-contract` and the `@zxing` lockfile rule still apply.
- Hand indexes: "InvItem barcode + 5" → 15 (+ PosSale shiftId/refSaleId/channelId/customerPartyId/crmDealId · PosSaleLine.refLineId · PosOrderLine/PosOrderEvent.orderId · `one_open_session_per_table` after a duplicate count).
- New sections: env (`POS_CREDENTIALS_KEY` W4 · device key pending P5.2) · 8 cron jobs and what fires them · flag/switch table with rollback · P1.9 (a) data step · m2 priceOverride review · owner GO list (14 ⛔) · evidence index.
- `verify-prod-pos.mts` replaces `prodmig.cjs` for POS. Note: `prodmig.cjs` has no host in it (it takes the URL as argv). The prod host mark comes from `PROD_HOST_MARK` in `scripts/qc-env-guard.mts` (the same host `qc4.sh` and `qc-prisma.sh` refuse).

## 3. `verify-prod-pos.mts --self-test` on QC4 (lane command: iso.sh → qc4.sh → /tmp/shark-gate-pos.lock → with-gate-lock)
```
head=7a2c15ed dirty=0 start=2026-10-22T07:55:22Z
verify-prod-pos · โหมด self-test · host ep-frosty-lab…
ID  สถานะ  ข้อ / ผล
🟢 G1  OK   ด่านเป้าหมาย: host ใน allowlist · prod ต้อง ALLOW_PROD_AUDIT=1 · QC4 เฉพาะ --self-test
         → host ep-frosty-lab… (qc4)
🟢 G2  OK   --self-test: ชุดทดสอบปลอมของ decideTarget ปฏิเสธ/อนุญาตตรงทุกกรณี (ไม่แตะ DB)
         → 12/12 กรณีตรง
🟢 RO  OK   ธุรกรรมอ่านอย่างเดียวมีผล (SHOW transaction_read_only = on · --self-test: ลองเขียนแล้วโดน 25006)
         → transaction_read_only = on · probe เขียน → 25006
🟢 P0  OK   รุ่น Postgres ≥ 11 (ADD COLUMN … NOT NULL DEFAULT ค่าคงที่ = metadata-only) — แสดงรุ่น
         → server_version_num 180006
🟢 M1  OK   POS migration ทุกไฟล์ในทรี apply แล้ว (finished_at มีค่า · rolled_back_at ว่าง)
         → 37/37 apply แล้ว
🟢 M2  OK   ไม่มีแถว _prisma_migrations ที่ค้าง/ล้ม (finished_at ว่าง และไม่ได้ rolled back) ทั้งฐาน
         → 0 แถวค้าง
🟢 M3  OK   ฐานไม่มี migration POS ที่ทรีนี้ไม่รู้จัก (มี = เตือน: โค้ดเก่ากว่าฐาน)
         → ไม่มี
🟢 T1  OK   ตารางที่ POS migration สร้างมีครบ (และมี model ใน prisma/schema)
         → 45/45 ตาราง
🟢 C1  OK   คอลัมน์ครบ: ตารางใหม่ = ทุกฟิลด์ scalar ของ model · ตารางเดิม = คอลัมน์ที่ POS migration เพิ่ม
         → 717/717 คอลัมน์
🟢 E1  OK   ค่า enum ของ type ที่ POS migration สร้าง/เพิ่มค่า มีครบตาม schema
         → 31 type · 107 ค่า
🟢 I1  OK   index ที่ POS migration สร้างมีครบและ indisvalid
         → 121/121
🟡 X1  WARN index มือ CONCURRENTLY (runbook §5): ยังไม่สร้าง = เตือน · สร้างแล้วต้อง valid · นับแถว TableSession OPEN ซ้ำโต๊ะ
         → 1/15 สร้างแล้ว · ยังไม่สร้าง: ShopProduct_posProductId_idx, ShopOrderLine_posProductId_idx, PosSaleLine_productId_idx, MenuItem_posProductId_idx, RestaurantOrderItem_productId_idx, InvItem_tenantId_barcode_idx, PosSale_shiftId_idx, PosSale_refSaleId_idx, PosSale_channelId_idx, PosSaleLine_refLineId_idx, PosSale_customerPartyId_idx, PosSale_crmDealId_idx, PosOrderLine_orderId_idx, PosOrderEvent_orderId_idx · โต๊ะที่มี session OPEN ซ้ำ = 0
🟡 S1  WARN สต็อกติดลบ (InvItem.onHand < 0 · InvLocationStock.onHand < 0) — นับ (เตือนเมื่อ > 0: ร้านที่ยอมขายเกินได้)
         → InvItem 1 · InvLocationStock 108
🟢 S2  OK   บรรทัดกำพร้า: PosSaleLine/PosPayment ไม่มี PosSale · PosSaleLineOption ไม่มีบรรทัด = 0
         → PosSaleLine 0 · PosPayment 0 · PosSaleLineOption 0
⚪ S3  INFO การกระจายธง settings.pos.registerV2 ของระบบ POS (true / ไม่ใช่ true)
         → active·registerV2=true: 2 · active·registerV2=ไม่ใช่ true: 21
⚪ S4  INFO คีย์ค่าตั้ง POS ที่มีอยู่: credit · offline · shift.required · board · ai · chat · deposit
         → pos 23 · credit 0 · offline 0 · shift_required 0 · board 0 · ai 0 · chat 0 · deposit 1 · offline_on 0 · credit_on 0
⚪ S5  INFO ลิงก์แคตตาล็อก: PosProduct · MenuItem/ShopProduct ที่ posProductId ว่าง/มีค่า · InvItem PRODUCT ที่ยังไม่มี PosProduct
         → pos_product 2249 · menu_unlinked 0 · menu_linked 4 · shop_unlinked 2 · shop_linked 6 · inv_product_unlinked 8 (ก่อน backfill = linked 0 · หลัง = pos-backfill-catalog --verify ต้อง 0)
🟡 S6  WARN คิว outbox pos.* (PENDING · FAILED) — FAILED > 0 = เตือน
         → FAILED 2
🟡 S7  WARN OpsEvent ERROR 24 ชม.ล่าสุด — > 0 = เตือน (C6.1: ต้อง 0 ตลอด 24 ชม. หลัง deploy)
         → ERROR 55 · outbox 54 · outbox-health 1
⚪ S8  INFO แถว creds (PosIntegrationCredential) · print agent · ช่องทางขาย — นับ (creds > 0 ต้องมี POS_CREDENTIALS_KEY บน Vercel)
         → creds 0 · print_agents 0 · channels 12025
🟢 N1  OK   --self-test: canary — ตาราง/คอลัมน์/index/migration ปลอมต้องถูกรายงานว่าไม่มี และของจริง (PosSale.publicToken · PosSale_publicToken_key) ต้องเจอ
         → ของปลอม 4/4 = ไม่มี · ของจริง 3/3 = มี (ตาราง 358 · คอลัมน์ 967 · index 1289)
⚪ V1  INFO env ที่ POS อ่าน: ตั้ง/ไม่ตั้งในโปรเซสนี้ (ชื่อเท่านั้น · ไม่พิมพ์ค่า)
         → POS_CREDENTIALS_KEY=ไม่ตั้ง · APP_URL=ไม่ตั้ง · SESSION_SECRET=ไม่ตั้ง · CRON_SECRET=ไม่ตั้ง (env ของโปรเซสนี้ ≠ env ของ Vercel)

===== verify-prod-pos ===== FAIL 0 · WARN 4 · ทั้งหมด 22
JSON_SUMMARY {"suite":"verify-prod-pos","mode":"self-test","role":"qc4","host":"ep-frosty-lab…","total":22,"passed":22,"fail":0,"warn":4,"failed":[],"warned":["X1","S1","S6","S7"],"posMigrations":37}
EXIT verify 0
```
Self-test record: head=7a2c15ed (committed tree, dirty=0) · 2026-10-22T07:55Z–08:00Z · FAIL 0 · WARN 4 (X1 S1 S6 S7).

Positive and negative controls built into `--self-test`:
- G2: 12 fake-URL gate cases. Prod without ALLOW, prod + --self-test, QC4 without --self-test, QC1, a look-alike prefix, `?host=`, PGHOST, DIRECT_URL on prod and no URL are all refused. Prod + ALLOW and QC4 + --self-test are allowed.
- RO: a `CREATE TEMP TABLE` inside a SAVEPOINT is refused with 25006.
- N1: a fake table, column, index and migration are reported missing, and real ones are found.

Refusals checked by hand (no DB): with no DATABASE_URL the script exits 2 (NO_URL). With a fake prod URL and no ALLOW_PROD_AUDIT it exits 4 (NO_ALLOW).
Expected WARNs on QC4: X1 (hand indexes not created on QC4; `one_open_session_per_table` already exists there, see RESUME:1275) · S1 negative stock from test data (InvItem 1 · InvLocationStock 108) · S6 outbox pos.* FAILED 2 · S7 OpsEvent ERROR from outbox test noise.

## 4. Oracle `qc-pos-p6.1` red-before / after
| check | base 23c85130 (P61_REV) | this branch |
|---|---|---|
| P6.1-D1 | ❌ | ✅ |
| P6.1-D2 | ❌ | ✅ |
| P6.1-P1 | ❌ | ✅ |
| P6.1-M1 | ❌ | ✅ |
| P6.1-M2 | ❌ | ✅ |
| P6.1-M3 | ❌ | ✅ |
| P6.1-M4 | ❌ | ✅ |
| P6.1-M5 | ❌ | ✅ |
| P6.1-E1 | ❌ | ✅ |
| P6.1-C1 | ❌ | ✅ |
| P6.1-F1 | ❌ | ✅ |
| P6.1-B1 | ❌ | ✅ |
| P6.1-V1 | ❌ | ✅ |
| P6.1-V2 | ❌ | ✅ |
| P6.1-R1 | ❌ | ❌ (by design: PR body waits for P3.12/P4/P5) |
| P6.1-R2 | ❌ | ✅ |
| P6.1-S1 | ❌ | ✅ |
| P6.1-Z1 | ✅ | ✅ |
| P6.1-G1 | ❌ | ✅ |

**Red-before 18/19 on the base** (only Z1 scope is green there). **After: 18/19**. The only red left is R1, by design. V2 turns green once this file holds the self-test line.

Negative probes (mutated the runbook, ran the oracle, restored it byte-equal): removing migration row #36 turns M1 red · removing `IF EXISTS` from one rollback line turns M3 red · removing one CONCURRENTLY line turns M5 red (HAND_INDEXES mismatch). V1's prisma regex first flagged `qc-prisma.sh` in a comment; it was tightened to `prisma.$`/`prisma.<model>.`.
Lint: `bash scripts/pos-oracle-check.sh /root/projects/shark-pos-b qc-pos-p6.1 --base 23c85130` → **VERDICT green** (red 0 · warn 0). The first run was red O2 because of the word "merge-base". The ancestry check now uses `git rev-list <tip>..<head>` = empty.
Type-check of the 2 new .mts files (isolated tsconfig in scratch, extends the repo one) → exit 0. A positive control (a deliberate TS2322 file) → exit 2.
Fitness at 7a2c15ed: `fitness.mts` with the QC4 env → exit 0 · without env → exit 0. The first no-env run was red F7.1 (3 dead backtick refs to files that do not exist yet). The runbook now writes those 3 paths as plain text, so F7.1 is green. `fitness-pos` → exit 0 (8/8).

## 5. Open questions (CD-P61-P…)
- **CD-P61-P1 — lock time of the 5 in-migration indexes on existing tables** (§3.2). They need prod row counts for PosSale, RestaurantOrder and GiftCard (§3.4 read-only, owner GO). The worst cases are p26_kds and p29_tenders. Both are DO files, so the ADD COLUMN ACCESS EXCLUSIVE on RestaurantOrder / PosPayment + GiftCard is held through the unique-index scans: reads and writes are blocked for the scan time. Choices: accept it within an off-hours window, or move those indexes to hand CONCURRENTLY steps. The second choice means editing migrations that are already applied on QC4, which changes their checksums — a controller ruling and a prisma/ edit outside this prep.
- **CD-P61-P2 — 4 files with no `lock_timeout` touch PosSale/AccountDocument** (§3.3). Pick (ก) role-level `lock_timeout` for the deploy role, (ข) `options=-c lock_timeout=5s` in the direct URL (needs proof that the Neon proxy forwards it), or (ค) pre-flight only. Rehearse the choice on the branch.
- **CD-P61-P3 — rehearsal host.** The verify allowlist has prod + QC4 only. For the W31 rehearsal the controller adds that branch's endpoint mark as a third role in one commit on the day (allowlist = data) and removes it after the branch is deleted. Alternative: allow `--self-test` there too. The recommendation is the explicit commit.
- **CD-P61-P4 — Prisma drift of hand indexes.** The 15 CONCURRENTLY indexes are not declared in `prisma/schema`, so a later `migrate diff` would propose dropping them. Proposal (P6.2 or later, prisma/ lane): add the matching `@@index` with the same Prisma-default names, plus a no-op `CREATE INDEX IF NOT EXISTS` migration. The partial unique `one_open_session_per_table` stays SQL-only (already in a schema comment).
- **CD-P61-P5 — device-key env name** (P5.2 D1c, ruling 4 deferred). The runbook §6 row is a placeholder until the P5.2 fix round names it.
- **CD-P61-P6 — minute dispatcher on prod.** `pos.staffCommission.payroll` and `pos.slip.purge` run only from the minute dispatcher. It runs from the CRM crontab (`scripts/crm-cron.mts`, CRM-C6-REGISTER 1.1) or `/api/cron/outbox`, and no scheduler fires the latter (RESOLUTIONS R-C.6). The owner must confirm the CRM crontab is installed on the prod VPS. Hourly is in `vercel.json`.
- **CD-P61-P7 — merge-checklist item "add ep-frosty-lab to qc-prisma.sh".** POS uses `qc4.sh` and prod never uses `qc-prisma.sh`. Recommendation: drop the item. The alternative is a one-line case added by the controller.
- **CD-P61-P8 — two prod writers are missing as CLIs:** a `backfillWebPrices` wrapper (`catalog.ts:3561`, today called only from `qc-pos-p2.8`) and the P1.9 (a) data step `settings.pos.shift.required.register=false` on every POS with registerV2 on. Both need `--dry-run`/`--tenant`, a prod guard like `pos-backfill-catalog.mts`, and R1 review. Proposal: a small builder S card before the rehearsal.
- **CD-P61-P9 — negative stock.** On QC4, S1 = 109 rows (test data). On prod this is WARN by design because shops may oversell. Does the owner want any threshold to block rollout?
- **CD-P61-P10 — brief corrections** (so the PR body and HANDOVER cite correct numbers): 12 existing tables, not 10 (RecipeLine is new; the 3 Pos* tables count) · 5 ADD VALUE files, not 6 · `prodmig.cjs` holds no host.
- Owner items unchanged: W31 (rehearsal on a prod copy: default = same-day delete, no export) · W32 (owner runs the deploy from the runbook) · W4 (`POS_CREDENTIALS_KEY` before creds) · W5 (no trial shop yet) · W19 (slip legal hold / PDPA precedence still open before go-live) · W27 (old table QR tokens are not rotated — optional rotate script in P6).

## 6. Next (controller)
1. R1 review of the runbook + verify script (read-only, docs/scripts).
2. Rule on CD-P61-P1/P2/P3/P8 before the rehearsal (P1 and P8 may need a prisma/ or a writer card).
3. After P3.12/P4/P5 close: PR body `ledger/pos-briefs/pos-PR-main.md` (oracle R1 turns green) → rehearsal (W31) → record in ledger/wo-notes/pos-P6.1.md.

## 7. Final oracle run (on-disk tree = notes commit)
- One extra oracle fix in the notes commit: the V2 head lookup window went from 800 chars before the JSON line to −4000/+400. The record line sits just after the pasted block.
- `qc-pos-p6.1` → **18/19** · failed = [P6.1-R1] (PR body, by design) · `pos-oracle-check.sh` → VERDICT green · S1 secrets clean · Z1 = docs/ scripts/ ledger/ only.
