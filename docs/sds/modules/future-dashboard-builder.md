# Dashboard Builder v1 (DESIGN — สำหรับ WO-0056)

> ต่อยอด Dashboard เดิม (WO-0030, `src/lib/dashboard/*`) + Report builder (0055) · path อนาคตเขียนธรรมดา

## เป้าหมาย · ผู้ใช้ · เหตุผลเชิงธุรกิจ
- **เป้าหมาย:** ให้ผู้ใช้เลือก widget/KPI มาจัดหน้า dashboard ของตัวเอง (ลาก/เพิ่ม/ลบ/จัดลำดับ) แทนหน้าแดชบอร์ดตายตัว
- **ผู้ใช้:** OWNER/MANAGER — เห็นตัวเลขที่ตัวเองสนใจตั้งแต่เปิดแอป
- **เหตุผล:** อ้าง `docs/sds/01_VISION.md` Layer 4 · ต่อยอด dashboard ที่มี (WO-0030) ให้ config ได้ · dashboard เกิดจาก DNA + ระบบที่เปิด (หลักการข้อ 4 ของ 01) → builder ให้ปรับต่อได้เอง

## Data model เสนอ
โมดูลใหม่ `dashboardbuilder` — axis = **tenant** (แต่ layout อาจ per-user). เสนอเก็บ layout ต่อ user ต่อ tenant.

- `DashboardLayout` (axis: tenant) — การจัดวาง 1 หน้า
  - `id` · `tenantId` · `ownerUserId` (layout ส่วนตัว) หรือ null = layout ร้าน (OWNER ตั้งให้ทุกคน)
  - `name` · `isDefault` Boolean · `widgetsJson` Json (`[{widgetKey, order, size, configJson}]`)
  - `createdAt` · `updatedAt` · `@@index([tenantId, ownerUserId])`

**Widget registry** (ในโค้ด) — แต่ละ widget: `widgetKey`, ชนิด (`stat | trend | list | reportRef`), data source (metric เดิมของ dashboard หรือ ReportDefinition), permission ที่ต้องมี. Widget ชนิด `reportRef` ผูก `ReportDefinition.id` (สะพานไป Report builder 0055).

## Service API เสนอ (ไฟล์อนาคต src/lib/modules/dashboardbuilder/service.ts)
- `listWidgets(m)` — widget ที่ user มีสิทธิ์ (ตาม permission ของ data source)
- `getLayout(m, ctx, userId)` — layout ของ user (fallback default ร้าน → fallback auto จากระบบที่เปิด)
- `saveLayout(ctx, userId, widgetsJson)` — บันทึกการจัดวาง
- `renderWidget(m, ctx, widgetKey, config)` — คืนข้อมูล widget (เรียก metric เดิม `src/lib/dashboard/*` หรือ report service) · assertCan
- **Edge cases:** widget ผูกระบบที่ปิดไปแล้ว → ซ่อน/แสดง empty · reportRef ที่ report ถูกลบ → widget แจ้ง "รายงานถูกลบ" · user ไม่มีสิทธิ์ widget → ไม่ render (ไม่ leak)

## การเชื่อมต่อ
- **ไม่มีเงิน** — read-only บน metric ที่มี
- **composition root:** dashboardbuilder อยู่ในกลุ่ม `src/lib/dashboard/*` ที่ถูกยกเว้นกฎ module→module (อ้าง `docs/sds/02_ARCHITECTURE.md` ข้อ 3) → อ่าน metric ข้ามโมดูลได้
- **ต่อ Report builder (0055):** widget reportRef เรียก `reportbuilder.runReport` ผ่าน composition root — dataset registry แชร์กัน
- ต่อ dashboard เดิม (WO-0030) — reuse metric functions ที่มี ไม่เขียนซ้ำ

## AI actions
- **action:** `dashboard_add_widget` → ProposalKind `dashboard_add_widget` → dispatch `dashSvc.saveLayout` (AI: "เพิ่มการ์ดยอดขาย 7 วันบนหน้าแรก" → เสนอ → ยืนยัน)
- **read:** ใช้ metric tools เดิม (`sales_summary` ฯลฯ) ไม่ต้องเพิ่ม
- KIND_ACCESS `{ module: "dashboardbuilder", action: "dashboardbuilder.layout.manage" }`

## Permissions เสนอ
- `dashboardbuilder.layout.manage` (จัดหน้าตัวเอง — ทุก role ที่ login) · `dashboardbuilder.layout.manage_shared` (ตั้ง layout ร้านให้ทุกคน — OWNER) · การเห็น widget = ยืมสิทธิ์ data source

## UI หน้าจอหลัก (`docs/UI_STANDARD.md`)
- **หน้า dashboard** — grid การ์ด widget (สถิติ `p-3`, ตัวเลขเด่น ไม่ใช้สีสด · ผ่าน token) · ปุ่ม "ปรับหน้า" เข้าโหมดจัดวาง (เพิ่ม/ลบ/เรียง)
- **panel เลือก widget** — รายการ widget ที่มีสิทธิ์ + preview
- mobile: การ์ดยุบเป็นคอลัมน์เดียว (ห้าม grid-cols-4 เปล่า)
- ตัวเลข/เงินผ่าน `MoneyText` · trend ถ้าใช้กราฟ = โทน ink/line (ตามมาตรฐานสี — ดู dataviz ในภายหลัง)

## ข้อสอบ oracle ที่ต้องมี
1. saveLayout/getLayout ต่อ user — คืน layout เดิม, tenant/user อื่นไม่เห็น
2. user ไม่มี layout → fallback default ร้าน → fallback auto (ระบบที่เปิด)
3. widget ผูกระบบที่ปิด → ไม่ render/empty ไม่ error ทั้งหน้า
4. user ไม่มีสิทธิ์ data source ของ widget → widget ไม่ render (ไม่ leak ข้อมูล)
5. reportRef widget → เรียก report service, ผลตรงกับรายงานนั้น
6. cross-tenant: layout ไม่รั่ว
7. renderWidget ตัวเลขตรงกับ metric เดิม (เช่น sales_summary)
8. AI dashboard_add_widget เดินเส้น proposal, assertCan manage

## ความเสี่ยง / คำถามเปิด
- 🔑 layout ต่อ user vs ต่อร้าน — เสนอรองรับทั้งคู่ (default ร้าน + override ส่วนตัว). ยืนยันความซับซ้อนที่ยอมรับใน v1
- 🔑 กราฟ/ชาร์ต: v1 เป็นตัวเลข+trend เส้นเรียบ หรือรวมชาร์ตเต็ม (ต้องคุมสีตามมาตรฐาน UI — ไม่มีสีสด)
- drag-and-drop บนมือถือ: v1 อาจใช้ปุ่มเลื่อนขึ้น/ลง แทน DnD (touch friendlier)
