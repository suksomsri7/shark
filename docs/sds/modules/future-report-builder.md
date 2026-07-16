# Report Builder v1 (DESIGN — สำหรับ WO-0055)

> เลือก dataset + filter + group → ตาราง/export บน metric ที่มีอยู่ · path อนาคตเขียนธรรมดา

## เป้าหมาย · ผู้ใช้ · เหตุผลเชิงธุรกิจ
- **เป้าหมาย:** ให้ผู้ใช้สร้างรายงานเองจาก dataset ที่ระบบเปิดให้ (ยอดขาย/สมาชิก/สต็อก/บัญชี) เลือก filter+group+คอลัมน์ → ตาราง + export (csv/xlsx) โดยไม่เขียน SQL
- **ผู้ใช้:** OWNER/MANAGER ที่ต้องการมุมมองข้อมูลเฉพาะกิจ (เช่น ยอดขายต่อพนักงาน/ต่อสินค้า/ต่อเดือน)
- **เหตุผล:** อ้าง `docs/sds/01_VISION.md` Layer 4 BI · แทนการต้องสั่ง dev ทำรายงานทีละใบ

## Data model เสนอ
โมดูลใหม่ `reportbuilder` — axis = **tenant**. **ห้าม raw SQL ในโมดูล** (อ้าง `docs/sds/06_DATABASE.md`) → ใช้ dataset registry ที่ map เป็น query ผ่าน tenantDb เท่านั้น (whitelist ปลอดภัย ป้องกัน injection + คุม scope).

- `ReportDefinition` (axis: tenant) — รายงานที่ผู้ใช้บันทึกไว้
  - `id` · `tenantId` · `createdAt` · `updatedAt` · `createdById`
  - `name` · `datasetKey` (enum key จาก registry: `sales | customers | inventory_stock | account_documents | appointments`)
  - `filtersJson` Json (`[{field, op, value}]` op: eq/gte/lte/between/in) · `groupBy` String? · `aggregations` Json (`[{field, fn: sum|count|avg}]`)
  - `columnsJson` Json (คอลัมน์+ลำดับ) · `dateRangeJson` Json (relative: last7/last30/thisMonth หรือ absolute)
  - `@@index([tenantId])`

**ไม่เก็บผลลัพธ์** (คำนวณสด · avoid stale) — เก็บแค่ definition. ผลลัพธ์ run-time.

**Dataset registry** (ในโค้ด ไม่ใช่ DB) — แต่ละ dataset นิยาม: model, ฟิลด์ที่ filter/group/aggregate ได้, scope axis, permission ที่ต้องมี. กัน user query ฟิลด์ต้องห้าม/ข้าม scope.

## Service API เสนอ (ไฟล์อนาคต src/lib/modules/reportbuilder/service.ts)
- `listDatasets(m)` — dataset ที่ user มีสิทธิ์ (ตาม permission ของแต่ละ dataset · เช่น sales ต้อง pos.*)
- `runReport(m, ctx, definition)` — แปล definition → query ผ่าน tenantDb (+ systemId ถ้า dataset เป็น system-scoped) → คืน rows/aggregates. assertCan permission ของ dataset ก่อน run
- `saveReport(ctx, {...})` · `listReports(ctx)` · `deleteReport(ctx, id)`
- `exportReport(m, ctx, definition, format)` — csv/xlsx จากผล runReport
- **Edge cases:** filter ฟิลด์ที่ไม่อยู่ใน whitelist → ปฏิเสธ · dataset system-scoped แต่ยังไม่เปิดระบบ → error ชัด · ช่วงวันกว้างมาก → จำกัด/paginate (query budget — อ้าง WO-0044) · ตัวเลขเงินสตางค์ → แปลงบาทตอน export

## การเชื่อมต่อ
- **ไม่มีเงิน** — read-only บน metric ที่มี (ไม่แตะเส้นเงิน · ไม่ mutate)
- **อ่านข้ามโมดูลผ่าน composition root** (ช่องทาง 2 ใน `docs/sds/02_ARCHITECTURE.md`) — reportbuilder อยู่ใน composition-root class เหมือน `src/lib/dashboard/*` (ถูกยกเว้นกฎ module→module) หรือเรียก service read ของแต่ละโมดูล ไม่ import model ตรง
- reuse metric ที่ dashboard (WO-0030) มี — dataset registry แชร์กับ Dashboard builder (0056)

## AI actions
- **read:** `run_adhoc_report` — user ถามภาษาไทย ("ยอดขายต่อพนักงานเดือนนี้") → AI แปลงเป็น definition → runReport → สรุป (read-only, ไม่ต้อง proposal)
- **action:** `save_report` → ProposalKind `report_save` (บันทึกรายงานที่ AI ร่าง) — optional
- ต่อ `src/lib/ai/tools.ts`

## Permissions เสนอ
- `reportbuilder.report.manage` (บันทึก/ลบ) · `reportbuilder.report.view` · การเข้าถึง dataset = ยืมสิทธิ์โมดูลต้นทาง (sales→`pos.*`, inventory→`inventory.*`) — **ไม่สร้าง bypass**

## UI หน้าจอหลัก (`docs/UI_STANDARD.md`)
- **หน้าสร้างรายงาน** — เลือก dataset → ตัวกรอง (`FormField`) → group/aggregate → preview `DataTable` (มี `overflow-x-auto`, ตัวเลขชิดขวา, เงินผ่าน `MoneyText`)
- **หน้ารายการรายงานที่บันทึก** — `DataList` → เปิดดู/แก้/export
- แถบเครื่องมือ export ใช้ `.btn` variant (ไม่ประกอบปุ่มเอง — บทเรียน ReportToolbar ในมาตรฐาน)

## ข้อสอบ oracle ที่ต้องมี
1. runReport dataset=sales group by วัน → ตัวเลขตรงกับ PosSale ที่ PAID (เทียบ sales_by_day)
2. filter ฟิลด์นอก whitelist → ถูกปฏิเสธ (ไม่ leak/inject)
3. dataset system-scoped: query ผ่าน tenantDb ใส่ systemId ถูก, tenant/system อื่นไม่เห็น
4. user ไม่มี pos.* → listDatasets ไม่คืน sales, runReport sales → ForbiddenError
5. saveReport/loadReport definition ตรง, tenant อื่นไม่เห็น
6. export csv: เงินแปลงบาทถูก, จำนวนแถวตรงกับ preview
7. ช่วงวัน relative (thisMonth) คำนวณตามเวลาไทย (dayKeyBangkok)
8. ไม่มี raw SQL (fitness ratchet) — query ผ่าน tenantDb ล้วน
9. AI run_adhoc_report แปล intent → definition ที่ valid เท่านั้น

## ความเสี่ยง / คำถามเปิด
- 🔑 dataset ชุดแรก (5 ตัว: sales/customers/inventory/account/appointments พอไหม)
- 🔑 export xlsx ต้อง lib เพิ่ม (SheetJS ฯลฯ) — ยืนยันได้ · csv ทำได้ทันที
- query budget: รายงานหนักอาจชน WO-0044 (query budget ratchet) → ต้อง paginate/limit ตั้งแต่ v1
