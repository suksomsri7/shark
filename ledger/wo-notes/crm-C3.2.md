# WO C3.2 — โควตา · หน้าแรก KPI 6 · leaderboard · ที่มา lead · "ไม่มีเจ้าของ" · มุมมองที่บันทึก (contact/company/deal)

> RUN "CRM v2" · worktree `/root/projects/shark-crm-c110` (detached HEAD `e98314d4`) · QC2 (`ep-cool-shadow`) · 26 ก.ย. 2569 · ผู้คุมงาน: Fable 5.1 · builder: Opus (DRAFT ของ builder — ผู้คุมงานเติม D2/D6/D7/D9/D12)
> สัญญา: `ledger/CRM-RUN.md` §2 C3.2 · ใบสั่ง `ledger/crm-briefs/crm-brief-C3.2.md` (addendum 1–15 + ruling ผู้คุมงาน) + COMMON + RESOLUTIONS (R-A · R-C.8 · R-E.8 · R-E.14)
> พิมพ์เขียว `docs/modules/20-crm-v2.md` §3.1 · §5.9 · §7.1 · §7.4 · §11.6 · ภาพ `ledger/design-crm/01-crm-home.png` · `10-teams-quota-commission.png` (ขวา)
> ข้อสอบ: `scripts/qc-crm-c3.2.mts` (46 ข้อ · commit test `e98314d4` · **แก้หลัง commit: ไม่**)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/crm/quotas-shared.ts` | ใหม่ | บริสุทธิ์: `QUOTA_THRESHOLDS [80,100]` · `periodKeyOf/periodRange/isPeriodKey/prevPeriodKey/periodKeysAt/periodLabel/periodEnded` (ค.ศ. · ครึ่งเปิดเที่ยงคืนไทยผ่าน `core/quiet-hours.bkkParts/bkkAt`) · `quotaBasisOf` · `quotaPct` (BigInt floor) · `winRatePct` (ปัดครึ่งขึ้น) · `QuotaError` · DTO ของโควตา/หน้าแรก · `LEAD_SOURCE_LABEL` |
| `src/lib/modules/crm/quotas.ts` | ใหม่ | `setQuota` (advisory lock + upsert + audit `crm.quota.set` ก่อน/หลังใน tx · งวดจบแล้ว = MANAGER+) · `listQuotas` · `progress` (สมุดบัญชี SQL: WON ล่าสุดจากประวัติขั้น · COUNTED ตาม countedAt · กิจกรรมไม่รวม NOTE/WEB/PORTAL) · `checkReached` (`createMany skipDuplicates` = INSERT … ON CONFLICT DO NOTHING) · `quotaBoard` (หน้าโควตา) · `reportScopeOf` (ระดับรายงาน) · `reachedAfterCommit` · `onReached` (consumer) |
| `src/lib/modules/crm/home-data.ts` | ใหม่ | `kpis · leaderboard · leadSources · unowned · homeData` — Prisma aggregate/groupBy/count บน where = visibleWhere ∩ ระดับรายงาน ∩ ตัวกรอง |
| `src/lib/modules/crm/views.ts` | ใหม่ | `listViews/createView/updateView/deleteView` + `viewVisibleWhere/resolveViewFilters/viewOptions/viewTeamOptions/whitelistViewFilters` |
| `src/lib/modules/crm/views-actions.ts` | ใหม่ | server actions `createCrmViewAction/deleteCrmViewAction` (assertCrmV2 → assertCanCrm) |
| `src/lib/modules/crm/index.ts` | แก้ (บล็อก C3.2) | `export * as quotas/home(home-data)/views` |
| `src/lib/modules/crm/payments.ts` | แก้ 4 บรรทัด (C3.2) | `afterCounted` → `quotas.reachedAfterCommit` หลัง tx ของเงิน commit |
| `src/lib/modules/crm/deals.ts` | แก้ (C3.2) | `moveCore` เข้า WON → `reachedAfterCommit` หลัง commit · `listWhere({savedViewId})` + `savedViewOptions` ใช้ `views.ts` (ทีมจริง · whitelist · อ่าน `contactId/kind` ของมุมมอง) |
| `src/lib/modules/crm/contacts.ts` | แก้ (C3.2) | `listWhere({savedViewId})` + `savedViewOptions` ใช้ `views.ts` |
| `src/lib/modules/crm/companies.ts` · `companies-shared.ts` | แก้ (C3.2) | `listCompanies({savedViewId})` (ใหม่) + `savedViewOptions` (ใหม่) |
| `src/lib/modules/crm/home.tsx` | แก้ (C3.2) | โหลด `homeData` ด้วย actor ของ session → ช่อง actions/kpis/filters/leaderboard/unowned/aside · ส่วนเดิม (ดีลของฉัน · งานวันนี้ · ดีลที่ต้องดู C2.10) คงครบ |
| `src/components/crm/home/{HomeKpis,HomeFilters,HomeLeaderboard,HomeAside,HomeUnowned}.tsx` | ใหม่ | ภาพ 01 · HomeUnowned = client (action ผ่าน props) |
| `src/components/crm/home/CrmHomeView.tsx` | แก้ | ผังภาพ 01: เนื้อหาหลัก + แถบขวา 300 px (xl) · งานวันนี้เป็นการ์ดคู่ "ดีลที่ต้องดู" |
| `src/app/app/sys/[id]/crm/settings/quotas/{page,actions}.tsx/.ts` | ใหม่ | หน้าโควตา (guard CRM → requireCrmV2Page → crm.quota.manage → notFound) |
| `src/components/crm/quotas/QuotaManager.tsx` | ใหม่ | ตารางโควตารายเดือน (client) |
| `src/components/crm/views/SavedViewControls.tsx` | ใหม่ | บันทึก/ลบมุมมองบนหน้ารายการ (client) |
| `src/app/app/sys/[id]/crm/{contacts,deals,companies}/page.tsx` | แก้ (บล็อก C3.2) | ปุ่มบันทึก/ลบมุมมอง · บริษัท: ตัวเลือกมุมมอง `?view=` · ดีล: เปิดมุมมองโดยไม่ระบุ pipeline = pipeline ของมุมมอง |
| `src/app/app/sys/[id]/page.tsx` | แก้ (บล็อก C3.2) ⚠️ ไม่อยู่ในรายการเจ้าของ | ส่ง `?pipeline/owner/period` ให้ CrmHomeV2 · CRM v2 กว้าง `max-w-7xl` |
| `src/app/app/layout.tsx` | แก้ (บล็อก C3.2) ⚠️ | drawer "โควตา" (crm.quota.manage) — qc-nav-functions S5 ต้องการ |
| `src/lib/modules/crm/nav.ts` | แก้ | CRM_DEEP_NAV `settings-quotas` ready C3.2 |
| `src/lib/automation/labels.ts` · `src/lib/outbox-consumers.ts` · `src/lib/webhooks/labels.ts` | แก้ (บล็อก C3.2) | ป้าย · consumer → `crm.quotas.onReached` · หมายเหตุ spread |
| `scripts/gen-crm-api-docs.mts` ⚠️ + `docs/api/CRM-API.md` | แก้ | สาขา payload ของ `crm.quota.reached` (ไม่งั้นตก `teamId, change`) + regen |
| `scripts/crm-ui-inventory.json` | แก้ | +49 แถว wo C3.2 (หน้า "/" 33 · "/settings/quotas" 7 · มุมมอง 9) |

## 2. migration / seed / backfill
- ไม่มี (CrmQuota มากับ `crm_v2_c` · ข้อ S0.4 ตรวจแล้ว) · seed ไม่เปลี่ยน (`*-expected.json` ถูกเขียนใหม่ตอน reseed QC2 ตามคำสั่ง)

## 3. ด่าน 12 ข้อ (builder เติมเท่าที่ทำได้)
| # | ผ่าน? | หลักฐาน |
|---|---|---|
| D1 | ✅ | `e98314d4` (ข้อสอบ SKIPPED ก่อนมี quotas.ts) |
| D2 | ⏳ ผู้คุมงาน | builder บน QC2: `JSON_SUMMARY {"total":46,"passed":46,"findings":[]}` (`.qc-shots/c32/qc-crm-c3.2.log`) |
| D3 | ✅ | §4 |
| D4 | ✅ (ดู §5 · c2.7 แดงชั่วคราวภายใต้โหลด = race เดิมของ C2.7 ดู §7) | |
| D5 | ✅ | typecheck exit 0 · fitness 32/32 ทั้งมี env และ `env -u DATABASE_URL -u DIRECT_URL` |
| D6/D7 | ⏳ ผู้คุมงาน | builder ห้าม `next build` ⇒ ยังไม่มีภาพ |
| D8 | ✅ | F14.1/F14.2 เขียว (+49 แถว) |
| D10 | ✅ | F13.10/F13.11 เขียว (docs regen) · event ใหม่ครบ 3 ทะเบียน |
| D11 | ✅ | m1.9 26/26 |

## 4. กลุ่ม X
| กลุ่ม | ใช้? | check ids / เหตุผล |
|---|---|---|
| X1 | ใช้ | X1.1–X1.6 (OWN/TEAM/FORBIDDEN/ข้ามร้าน-ระบบ/uiVersion 1/มุมมองทีมจริง) |
| X2 | N-A | ไม่มี REST op / AI tool ใหม่ (`crm_quota_progress` = C3.4/C3.8) — หน้าแรกใช้คีย์ `crm.report.view` (คีย์ API ต้องมีใน scope) |
| X3 | ใช้ | X3.1 (12 ทาง × 3 รอบ checkReached) · X3.2 (สองการจ่ายขนานข้าม 100 %) · setQuota ใต้ advisory lock |
| X4 | ใช้ | X4.1 (ส่งซ้ำ event ของ money race) · X4.2 (แจ้งเตือนไม่ซ้ำ) |
| X5 | N-A | ไม่มีงานตามเวลา (reached ยิงตามเหตุการณ์) |
| X6 | N-A | ตัวกรองมุมมอง whitelist (S4.1) · โน้ตโควตาข้อความล้วน ≤ 500 |
| X7 | N-A | ไม่มี endpoint สาธารณะ |
| X8 | ใช้ | X8.1 payload id ล้วน · DTO หน้าแรกไม่มีเบอร์/อีเมล (S5.4) |
| X9 | ใช้ | X9.1 audit ก่อน/หลัง · X9.2 งวดที่จบแล้ว = MANAGER+ · โอนกลุ่ม = bulkReassign เดิม (confirm + เหตุผล ≥ 5) · audit `crm.view.*` |
| X10 | N-A | ไม่มีไฟล์/ความลับ |

## 5. ผลข้อสอบ (QC2 · log ที่ `.qc-shots/c32/`)
- **หลังรอบแก้ผู้ตรวจรอบ 2 (SF-1–SF-4 · NOTE-1/3–10)** — QC2 · log `.qc-shots/c32/*-r3.log`: `qc-crm-c3.2` 41/46 (แดง 5 = S3.3 · S6.4 · X1.1 · X1.2 · S5.3 ทั้งหมดจากมติ SF-4 ฐาน % — ขอ ORACLE-EDIT) ·
  `qc-crm-c2.10` 41/41 · `qc-crm-c1.4` 110/110 · `qc-crm-c1.5` 103/103 · `qc-crm-c1.3` 89/89 · `qc-crm-c0.2` 27/27 · `qc-nav-functions` 11/11 · `qc-member-m1.5` 18/20 (ภาพ ENV) ·
  typecheck exit 0 (`typecheck-r3.log`) · fitness 32/32 ทั้งสองโหมด (`fitness-*-r3.log`) · probe `.qc-shots/c32/probe-r3-sf1-sf3-sf4.log`
- **หลังรอบแก้ตามผู้ตรวจ (B1 · S1–S8 · N1/N4–N7/N9/N10/N14)** — QC2 · log `.qc-shots/c32/*-review.log`:
  `qc-crm-c3.2` 46/46 · `qc-crm-c2.10` 41/41 · `qc-crm-c2.7` 62/63 (S0.4 = migration ของ C3.0 แดงอยู่ก่อน) · `qc-crm-c1.5` 103/103 · `qc-crm-c1.3` 89/89 ·
  `qc-crm-c1.4` 110/110 · `qc-crm-c0.2` 27/27 · `qc-crm-c1.11` 66/66 (`CRM_V2_SWITCH=all`) · `qc-nav-functions` 11/11 · `qc-member-m1.5` 18/20 (S4.3/S4.4 = ภาพ ENV) ·
  typecheck exit 0 (`typecheck-review.log`) · fitness 32/32 ทั้งสองโหมด (`fitness-{env,noenv}-review.log`)
- probe B1/N1: `.qc-shots/c32/probe-review-b1-n1.log` (แก้แล้ว: ชนะอัตโนมัติโยน STAGE_REQUIREMENTS แต่ reached 80+100 อยู่ครบ · ส่งซ้ำ = DUPLICATE ไม่เพิ่ม ·
  เงินเวลา 31 ส.ค. 23:59:59 ไทย ตรวจตอน 26 ก.ย. → ถึงโควตา 2026-08 ทั้ง 80/100 เท่านั้น) · control ก่อนแก้ `probe-review-b1-control-without-finally.log` (reached = [] และหายถาวร)
- หลังมติข้อ 6: `qc-crm-c3.2` 46/46 (`qc-crm-c3.2-r6.log`) · `qc-crm-c2.10` 41/41 (`qc-crm-c2.10-r6.log`)
- `qc-crm-c3.2` 46/46 · `qc-member-m1.5` 18/20 (S4.3/S4.4 = ข้อภาพ ENV ไม่มีภาพในเครื่องนี้ · S2.3/S1.8 มุมมองสมาชิกเขียว · diff โค้ดสมาชิก 0 บรรทัด) · `qc-crm-c2.10` 41/41 · `qc-crm-c2.7` 62/63 (S0.4 แดงอยู่ก่อนแล้ว = migration ของ C3.0) · `qc-crm-c1.5` 103/103 · `qc-crm-c1.4` 110/110 · `qc-crm-c1.3` 89/89 · `qc-crm-c1.7` 57/57 · `qc-crm-c1.8` 81/81 · `qc-crm-c0.2` 27/27 · `qc-crm-c1.11` 66/66 (ต้องรันด้วย `CRM_V2_SWITCH=all`) · `qc-nav-functions` 11/11 · `qc-crm-v1` 17/17 · `qc-member-m1.9` 26/26
- หลักฐาน probe: `.qc-shots/c32/probe-kpi-sql-and-race.log` (SQL ของ KPI 6 ตัวแบบ OWN ที่ Prisma ส่งจริง · race สองการจ่าย 3 รอบ = 80 หนึ่งแถว + 100 หนึ่งแถว · replay ไม่เพิ่ม)

## 7. มติทางเทคนิค / ข้อแย้ง
- ระดับรายงาน = `widest(resolve(REPORT), crm.report.team ⇒ TEAM, crm.report.all ⇒ ALL)` (แนวเดียวกับ C3.1) · OWN ของดีลรวม collaborator (ความหมายเดียวกับ visibility.ts — fixture ไม่มี collaborator)
- เป้า KPI 3 ของผู้ดูระดับ TEAM = Σ โควตา USER ของสมาชิก (ตาม addendum ข้อ 8.3) · เครดิตโควตา = ผู้ดูแลปัจจุบัน (ข้อ 4)
- อัตราชนะ "งวดก่อน" = งวดก่อนหน้าชนิดเดียวกัน (ไตรมาส → ไตรมาสก่อน) — เฉลยทดสอบเฉพาะเดือน
- ตัวกรองผู้ดูแลแคบ leaderboard เหลือคนนั้น · ปุ่ม AI 3 ปุ่มแสดงแบบปิด (C3.4 ต่อสาย)
- ✅ มติผู้คุมงานข้อ 6 (26 ก.ย.): `onReached` แจ้งด้วย refId = `${quotaId}#${threshold}` (`quotas.ts:539-542` · คีย์ event ไม่เปลี่ยน) · `{{count}}` = เกณฑ์ของ event ⇒ 80 % เช้า + 100 % บ่ายวันเดียวกันได้ 2 ใบ · ลิงก์ของใบตัด `#` ตาม `refIdParam` ⇒ `r=<quotaId><threshold>` ต่างกันต่อเกณฑ์ · probe `.qc-shots/c32/probe-ruling6-same-day.log`: หลัง 80 = 1 · หลัง 100 วันเดียวกัน = 2 · ส่งซ้ำอีก 4 รอบต่อ event = 2 (ชื่อ "ความคืบหน้าโควตา 80%" / "…100%") · ข้อสอบไม่ได้ตรึง refId ⇒ ไม่มี ORACLE-EDIT
- มติผู้คุมงานข้อ 7: `crm.quota.reached` คงเป็น trigger ของกฎ CRM · กลุ่มของ trigger ใน `automation-shared.ts:23-24` (`groupOf`) ตัดสินจาก **คำนำหน้าล้วน** (ไม่มีตารางกลุ่ม) ⇒ ตกกลุ่ม "contact" · ไม่แก้ในใบนี้ — ส่งต่อ C3.6–C3.9 (เพิ่มสาขา `crm.quota.` → กลุ่ม deal/quota)
- 🔴 CRITICAL (มติผู้คุมงานข้อ 8 · ไม่ใช่ของใบนี้ · ผู้คุมงานเปิดเลนแก้ C2.7 แยก): race ลำดับ event ที่ทำให้เงินนับซ้ำ —
  `src/lib/modules/account/service.ts:2607` เขียน `account.payment.recorded` กับ `account.invoice.paid` ใน `emitOutboxMany` คำสั่งเดียว
  ⇒ `createdAt` (default now() ของ tx เดียวกัน) **เท่ากันทุกตัวอักษร** · ตัวระบายทั้งสองจุดเรียงด้วย `createdAt` อย่างเดียว:
  (1) `src/lib/core/outbox.ts:220-224` `drainOnce` → `findMany({ where: { status: "PENDING", availableAt: { lte: now } }, orderBy: { createdAt: "asc" } })`
  (2) ตัวส่งมือของข้อสอบ `scripts/qc-crm-c2.7.mts:561` `pump` → `orderBy: { createdAt: "asc" }` (เหมือนกัน) ⇒ ลำดับของสองแถวที่เวลาเท่ากันไม่แน่นอน
  ⇒ ถ้า `account.invoice.paid` ถูกประมวลก่อน: `payments.onInvoiceFullyPaid` คิด diff = ยอดเอกสาร − Σ COUNTED (ยังไม่มีแถวของงวดนี้) ⇒ แถว `DOC_SETTLE` = **ยอดเต็ม**
  แล้ว `account.payment.recorded` มานับเงินงวดเดิมซ้ำอีก ⇒ `paidSatang` เกินจริง (เห็นใน c2.7 รอบแรกภายใต้โหลด: S3.2 paid 604682 แทน 377926 · S9.4 settle 535000 แทน 16050 · S9.3/S9.6 ด้วย)
  control: ปิด hook ของ C3.2 = 62/63 · เปิด hook รันซ้ำ = 62/63 (S0.4 = migration ของ C3.0 แดงอยู่ก่อน) ⇒ ไม่เกี่ยวกับโค้ด C3.2 แต่หน้าต่างเวลากว้างขึ้นเมื่อเครื่องโหลดหนัก

### รอบแก้ตามผู้ตรวจอิสระ (มติผู้คุมงาน)
- **B1** `payments.ts:637-651` `afterCounted`: ชนะอัตโนมัติอยู่ใน `try` · `reachedAfterCommit` อยู่ใน `finally` — ครอบทุกทางนับเงิน (`recordDocPayment:381` · `onInvoiceFullyPaid:439` · `countPosSale:620` · `linkSaleToDeal:712` เรียกตัวนี้ตัวเดียว)
- **N1** `quotas.ts` `reachedAfterCommit`: `at` = countedAt ของแถวเงิน (`recordDocPayment` ส่ง `now` ที่เขียนลงแถว · ทางอื่น = countedAt ล่าสุดของเงินที่นับแล้วของดีล · ไม่มีแถว = ไม่ตรวจ) · ย้ายเข้า WON ส่ง `stageEnteredAt` (= enteredAt ของแถวประวัติ) `deals.ts:882-885` — ไม่ใช้ `new Date()`
- **S1** `home-data.ts` `restrictedHolders` + `Loaded.allUsers`: ระดับ ALL ที่ถูกจำกัด (ผู้จัดการบางสาขา · คีย์ API มีตัวกรอง team/owner) = ผู้ดูแลดีลที่มองเห็น ∪ สมาชิกทีมที่อนุญาต — เป้า KPI 3 และแถว leaderboard ใช้ชุดเดียวกัน
- **S2** `quotas.ts` setQuota: ตอนแก้ เขียนเฉพาะคีย์ที่ส่งมา (`undefined` = คงเดิม · `null` = ล้าง) · action ของหน้าโควตาส่ง `targetDeals` เฉพาะเมื่อแก้
- **S3** audit actor = `ctx.actorUserId ?? actor.userId`
- **S4** `views.ts` `assertUsableFilters`: ชนิดดีล/วันที่/ขนาดบริษัทผิด = VALIDATION + ลองรันตัวกรองกับ list* 1 แถวก่อนบันทึก (สร้าง/แก้) · หน้าบริษัทจับ VALIDATION แสดงในหน้า
- **S5** `home-data.ts` unowned: `NOT EXISTS (SELECT 1 FROM "Membership" …) … LIMIT 51` แล้วโหลดผ่าน visibleWhere — หมายเหตุ: ผู้จัดการที่ถูกจำกัดสาขาอาจเห็นน้อยกว่า 50 เมื่อบางแถวใน 51 แรกมองไม่เห็น (ธง more อิงชุดที่มองเห็น)
- **S6 (มติ)** ตัวตั้งของ "ชนะ" และ "อัตราชนะ" บนหน้าแรก = ดีลที่ **ผู้ดูแล** อยู่ในขอบเขต (ไม่นับดีลที่ผู้ดูเป็นแค่ผู้ร่วม) — `Loaded.dealOwnW` ⇒ % หน้าแรก = `progress()` = leaderboard · pipeline เปิด/ถ่วงน้ำหนัก/ดีลนิ่งยังรวมดีลที่เป็นผู้ร่วม (ความหมายเดียวกับ visibility OWN)
- **S8** `createView` เพดาน `CRM_VIEW_PER_USER_MAX = 50` ต่อคนต่อวัตถุ (VALIDATION ไทย · เท่าของวัตถุกำหนดเอง)
- **N4** `prevPeriodKey` คืน null ต่ำกว่า ค.ศ. 2000 ทุกชนิดงวด · `load()` รับ null อยู่แล้ว
- **N5** `notifications-shared.ts`: `CrmQuota` → หน้าแรก — `crmNotifPath` = "" และ `crmNotifLink` สร้าง `/app/sys/<id>?n=…` (ไม่มีหน้า `/crm` เปล่า) · ปรับ `parseCrmNotifLink` ให้ `/crm…` ไม่บังคับ และตัวคัดแรกของรอบกวาด `CRM_NOTIF_LINK_MARK` = `?n=` (เดิม "/crm/" — ลิงก์หน้าแรกไม่มี "/crm/" ⇒ ไม่งั้นใบที่เลื่อนเพราะช่วงห้ามรบกวนจะไม่ถูกส่งต่อ) — parse ยังตัดสินจริงด้วยทะเบียนคีย์ · c2.10 41/41
- **N6** `views.ts`: OWNER เห็น/แก้/ลบมุมมองแบบทีมทุกอัน · มุมมองแบบทีมของคนที่ออกจากร้านแล้ว หัวหน้าทีมนั้นลบได้ (ปุ่มลบโผล่ให้ด้วย)
- **N7** `QuotaManager.tsx`: ช่องเป้ามูลค่าที่ไม่ได้แก้ส่งสตางค์เดิม (ไม่ปัดเศษ) · เป้าดีลที่ไม่ได้แก้ไม่ส่ง
- **N9** KPI "lead ร้อน" → `/crm/contacts?minScore=<เกณฑ์>` (+ `owner` = ตัวกรอง หรือ "ของฉัน" เมื่อระดับรายงาน OWN) · เพิ่มตัวกรอง `minScore` ใน `contacts.listContacts` + หน้าผู้ติดต่อ (ชุดเดียวกับที่นับ: คะแนน ไม่ใช่ scoreBand)
- **N9 (ปิดครบ)** ฟอร์มตัวกรองของหน้าผู้ติดต่อมีช่องซ่อน `minScore` ⇒ กด "กรอง" ซ้ำไม่ทิ้งตัวกรองคะแนน (ช่องซ่อนไม่ใช่ปุ่ม ⇒ ไม่มีแถวทะเบียน) · c3.2 46/46 · c1.4 110/110 (`*-n9.log`)
- **N5** แนวทางลิงก์หน้าแรก + ตัวคัด `?n=` — ผู้คุมงานรับแล้ว
- **N10** หน้าแรก: บล็อก "ไม่มีเจ้าของ" ขึ้นกับ `crm.deal.reassign` อย่างเดียว (ไม่มีคีย์รายงานก็เห็น) · `homeData` ยัง FORBIDDEN สำหรับคนไม่มีคีย์รายงาน (X1.3)
- **N14** `setQuota`/`quotaBoard` รับเฉพาะ Membership ที่ `acceptedAt` ไม่ว่าง · ตารางโควตาเกิน 500 คน = หมายเหตุ "แสดง 500 คนแรก"

### รอบแก้ตามผู้ตรวจรอบ 2 (มติผู้คุมงาน)
- **SF-1** `notifications.ts` `parseLinkOf`: `/crm…` ไม่บังคับ + ใช้ลิงก์ตัวสุดท้าย ⇒ push ของใบ `quota.progress` ที่เลื่อนเพราะช่วงห้ามรบกวนมีลิงก์หน้าแรกครบ (probe: 22:30 ไทย deferred=1 pushes=0 → รอบกวาด 09:00 วันถัดไป sent=1 `data.link=/app/sys/<id>?n=quota.progress&nd=…&r=…&period=2026-09`)
- **SF-2** `home-data.ts` "ไม่มีเจ้าของ": SQL หาเฉพาะ id ผู้ดูแลที่ออกแล้ว (`SELECT DISTINCT ownerUserId … NOT EXISTS (Membership acceptedAt) LIMIT 500`) แล้ว Prisma `AND[visibleWhere, OPEN+ไม่เก็บถาวร, OR[owner null, owner ∈ ชุดนั้น]] take 51` ⇒ เพดานใช้หลังการมองเห็น
- **SF-3** `home-data.ts` `boardUsers` + `allowedAmong`: ผู้สมัคร (ALL) หาด้วยกติกาเดียวกับทั้งร้าน (ผู้ดูแลดีลที่มองเห็นตามตัวกรอง ∪ ผู้ถือโควตา USER) แล้วกรองด้วยชุดที่อนุญาต = ผู้ดูแลดีลที่มองเห็น ∪ สมาชิกทีมที่อนุญาต ∪ คนไม่มีทีม (เว้นเมื่อคีย์กรองทีม) ∩ เจ้าของตามคีย์ · probe: OWNER กับ MANAGER ที่ระบุทุกสาขา = ตัวเลขเหมือนกันทุกตัว (`identical: true`) · MANAGER สาขา u1 = B (ทีม u2) หลุด · C (ไม่มีทีม) อยู่
- **SF-4 (มติ "ความจริงเดียว")** KPI 3 + leaderboard คิด % บนฐานเดียวกับ `progress()`/`checkReached` (`quotaBasisOf` · PAID = `quotas.paidByOwner` สูตรเดียวกับ ledger · WON = ยอดชนะ) · DTO เพิ่ม `won.basis/achievedSatang` · `leaderboard.basis` · แถว `achievedSatang` · ป้าย "ตามยอดรับชำระ"/"ตามยอดชนะ" บนการ์ดและหัวคอลัมน์ · probe: PAID หน้าแรก 85 = leaderboard 85 = progress 85 = reached(80 @ pct 85) · WON 100 = 100 = 100 = reached(100 @ pct 100)
  ⇒ ข้อสอบ S3.3 · S6.4 · X1.1 · X1.2 · S5.3 ตรึง % แบบ "ยอดชนะ" ตาม addendum ข้อ 8.3/9 เดิม ⇒ ORACLE-EDIT (ดูรายงาน)
- **NOTE-1** `payments.ts`: `onInvoiceFullyPaid` (countedAt ของแถวปิดยอด) · `countLinkedRowInTx` คืน `{satang, at}` · `countPosSale`/`linkSaleToDeal` ส่ง countedAt จริงถึง `afterCounted` · `reachedAfterCommit` ไม่มี `at` = ไม่ตรวจ (เลิกเดา "แถวล่าสุด")
- **NOTE-3** ตัวตั้ง KPI 3 = Σ แถว leaderboard (ผู้ดูแลอยู่ในชุด — ไม่รวมดีลไม่มีเจ้าของ/ดีลที่ติดทีมแต่ผู้ดูแลไม่ใช่เพื่อนร่วมทีม) · อัตราชนะยังใช้ `dealOwnW`
- **NOTE-4** `views.ts` `ownThenShared`: มุมมองของตัวเอง (เพดาน 100) + มุมมองที่แชร์ (เพดาน 100 แยก)
- **NOTE-5c** `myTeamIds` = TeamMember ∪ ทีมที่ `leadUserId` = ฉัน
- **NOTE-6** `probeContactFilters/probeCompanyFilters/probeDealFilters` (where + id 1 แถว · ไม่โหลดการ์ด) · `updateView` ตรวจซ้ำเมื่อแก้ตัวกรองหรือขอบเขต
- **NOTE-7** เพดาน 50 มุมมองนับใน tx ใต้ advisory lock ต่อ (ระบบ · คน · วัตถุ)
- **NOTE-8** `minScore` อยู่ใน whitelist ของมุมมองผู้ติดต่อ + ส่งจาก `SavedViewControls` หน้าผู้ติดต่อ · ลิงก์ lead ร้อนระดับ TEAM: หน้าผู้ติดต่อ **ไม่อ่าน** พารามิเตอร์ `team` (ตรวจแล้ว) และการมองเห็นผู้ติดต่อของ STAFF ปริยาย = TEAM = นิยามเดียวกับระดับรายงาน TEAM ⇒ รายการ = ที่นับโดยไม่ต้องส่ง team · ข้อยกเว้นที่เหลือ: ผู้ที่ถูกตั้ง policy รายงาน TEAM แต่เห็นผู้ติดต่อ ALL (ผู้จัดการ) — ไม่มีตัวกรองทีมแบบหลายทีมในหน้ารายการ
- **NOTE-9** leaderboard + SQL "ไม่มีเจ้าของ" ใช้ `Membership.acceptedAt IS NOT NULL`
- **NOTE-10** `parseCrmNotifLink`/`parseLinkOf` ใช้ลิงก์ตัวสุดท้าย · ลิงก์ของโควตามี `&period=<periodKey>` (`crmNotifLink(…, query)` + `CrmNotifyInput.linkQuery`) · หน้าแรกอ่าน `?period=` อยู่แล้ว

## 8. หนี้
| เรื่อง | เหตุผล | ใบ |
|---|---|---|
| ภาพ D7 (owner/thana/nok/manager × 1440/390) | builder ห้าม build | ผู้คุมงาน |
| `crm.quota.reached` อยู่กลุ่ม "contact" ในตัวเลือก trigger (คงเป็น trigger ตามมติข้อ 7) | `groupOf` ตัดสินด้วยคำนำหน้าล้วน · ไฟล์ C2.1 | C3.6–C3.9 |
| N2 การข้ามเกณฑ์จากการโอนดีล (reassign) · เปลี่ยนสมาชิกทีม · `setQuota` ลดเป้า — ไม่ถูกตรวจ reached (ตรวจเฉพาะหลังรับเงิน COUNTED / เข้า WON) | ออกแบบตามสัญญา · **ต้องแจ้งเจ้าของ** | ตัดสินภายหลัง |
| N3 โควตาทีมที่ไม่มีแถวของตัวเอง (เป้า = Σ สมาชิก) ไม่มีวันยิง reached — ตั้งใจ: ต้องมีแถวของทีม (มี quotaId ให้ event อ้าง) | ออกแบบ | — |
| N8 เป้ารายไตรมาส/ปีไม่ได้รวมจากโควตารายเดือน (ต้องตั้งแถวของงวดนั้นเอง) | ออกแบบ | C3.3+ |
| N11 ประสิทธิภาพ: `kpis()` ยิง ~23 คำสั่ง (snapshot การมองเห็นถูกอ่านซ้ำ 3 รอบ) | ยอมรับบน QC · ปรับได้ด้วยการส่ง snapshot ร่วม | C5.1 |
| N12/N13 (ข้อสังเกตผู้ตรวจ) บันทึกไว้ตามรายงานผู้ตรวจ | — | — |
| 🔴 race เดิมของ C2.7 (§7 ข้อ CRITICAL) — เงินนับซ้ำเมื่อ invoice.paid มาก่อน payment.recorded | ไม่ใช่ของใบนี้ | เลนแก้ C2.7 ของผู้คุมงาน |

## 9. คืนสภาพ QC
- ข้อสอบ C3.2 ลบผู้เช่า/ผู้ใช้ `qc-c32-*` ทั้งหมด (CLEAN เขียว) · probe ลบ `qc-c32probe-*` (rowsLeft=0) · สคริปต์ probe ลบแล้ว · m1.9 26/26

## ผู้คุมงาน (Fable 5.1 · 26 ก.ย. 2569) — รับงาน
| # | ผล | หลักฐาน |
|---|---|---|
| D1 | ✅ | ข้อสอบ 46 ข้อเขียนก่อน (c110) · SKIPPED/RED ก่อนโค้ด · ruling 15 |
| D2 | ✅ | `qc-crm-c3.2` **47/47 ×2** QC1 seed ใหม่ (`c32-verify.log`) · 47/47 QC2 |
| D3 | ✅ | ORACLE-EDIT SF-4 (ฐาน achievement = ฐาน progress) โดยผู้เขียนข้อสอบคนเดิม + ข้อ S6.6 ใหม่ (ตัวเลขอิสระตรง builder ทุกข้อ) |
| D4 | ✅ | ถอยหลัง QC1 38 ขั้น exit 0: c3.1 · c1.4 · c1.5 · c1.3 · c0.2 · c0.5 · c1.7 · c1.8 · c1.11 · c2.1 · c2.5 · c2.7 · c2.9 · c3.0 · v1 · pages · cron · nav 11/11 · uiversion probe · m3.10 · m1.9 26/26 — แดง: c2.10 39/41 = ลำดับ ORACLE-EDIT ของผู้คุมงาน (revert แล้ว รันซ้ำ 41/41 `c210-after-revert-r2.log`) · m1.5 S4.3 = ภาพสมาชิก ENV |
| D5/D6 | ✅ | typecheck 5120 · fitness 32/32 ×2 · build+serve ผ่าน |
| D7 | ✅ | ภาพ 11 ใบ `.qc-shots/crm/3.2/` (owner 5 · manager 3 · thana 3) ดูเองเทียบ mockup 01/10: KPI 6 · ตัวกรอง+มุมมอง · งานวันนี้/ดีลที่ต้องดู · leaderboard โควตา/ความคืบหน้า (ป้าย "ตามยอดรับชำระ") · AI 3 ปุ่ม (ปิดจน C3.4) · ที่มา lead · ไม่มีเจ้าของ · หน้าโควตา งวด/ตาราง/เป้า/ทำได้ · thana (STAFF ไม่มี report.view) ไม่เห็น KPI/leaderboard = ถูกตาม X1.3 (สเปคภาพของผู้คุมงานคาดผิด แก้แล้ว) · บล็อกเลือกเทมเพลตของ C1.11 อยู่บนสุดเพราะ seed ยังไม่เลือก (ข้อมูล) · มือถือไม่ล้น |
| D8–D11 | ✅ | ผู้ตรวจ 2 รอบ: BLOCKER 1 (auto-win โยน ⇒ event หาย) + SHOULD-FIX 12 + NOTE แก้ครบ · หลักฐาน probe (control ไม่มี finally = 0 แถว) · race 3 รอบ = 80/100 อย่างละ 1 · same-day 80→100 = 2 แจ้งเตือน · OWNER = ผู้จัดการทุกสาขา identical · % เดียวกัน 4 ที่ |
| D12 | ⏳ | รอ push |
หนี้ (§8 ของ builder + ผู้คุมงาน): trigger group ของ `crm.quota.reached` (prefix) · N2 ข้ามจุดข้ามเมื่อ reassign/สมาชิกทีม/ลด target (แจ้งเจ้าของ) · N3 ทีมไม่มีแถวไม่ยิง reached · N8 quarter/year ไม่ roll-up · N11 perf 23 statements · S5 cap 51 ก่อน visibility แก้แล้ว (SF-2) · **C2.7 money race → เลน C2.7-fix**
