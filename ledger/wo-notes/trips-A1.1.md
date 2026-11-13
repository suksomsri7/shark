# trips-A1.1 — migration เอเจนซี่ + ตัวตนเอเจนซี่ระดับแพลตฟอร์ม + ทะเบียนค่าตั้ง agency (✅ 13 พ.ย. 2569 · merge b29da121a)

- ของที่ได้: `prisma/migrations/20270201000200_agency` (276 คำสั่ง · 31 ตาราง: 5 global · 22 ร้าน · 4 หน่วย · 88 ดัชนี · 149 CHECK · ตัวกันแก้สมุด `agent_ledger_entry_guard`) · `prisma/schema/{agency,supplier}.prisma` · คอลัมน์เพิ่มใน TripPickupZone / SellBasket / TripMoneyEvent / TripBooking + ดัชนี TripHold · `core/settings/defs/agency.ts` (40 คีย์) · `modules/agency/{entry,identity-core,index}.ts` · fitness F17.1 (ตาราง global แตะได้เฉพาะ `agency/entry.ts` + `platform/agent-auth.ts`) · F5 baseline 52
- รอบ: ร่างใบ → **ผู้ตรวจการออกแบบ REVISE FIRST** (4 เรื่องใหญ่: ลบร้านไม่ได้เพราะตัวกันสมุด · ใบแจ้งยอด VOID ออกใหม่ไม่ได้ · CHECK ของใบแจ้งยอดขัดสัญญา · ขาดตารางของ A1.5–A1.7/A2.4) → ร่างรอบ 2 (มติ R1–R11) → สร้าง 122/125 → ผู้ตรวจ build (เทียบฐานจริงกับ schema: ต่าง 0) FIX เล็ก → r1 (F1–F8) → **รีเซ็ตฐานเลน l2 จากฐานหลัก + deploy ฉบับแก้ใหม่ทั้งหมด**
- **ด่านผู้คุม @f84495d97 (เลน l2)**: seed ×2 · a1.1 122/125 (3 = ข้อตรวจขอบเขตเห็นไฟล์ที่ผู้คุมแก้) · t0.1 96/96 · t0.5 130/130 · p0.1 56/56 · SVC r0.3 94/94 · smoke 6/6 · fitness 54/54 ×2 · typecheck 0
- **ฐานหลัก**: preflight สะอาด · สำรองสาขา `wo-trips-qc-pre-a11` (br-wandering-sky-aoat0zbr — **ลบได้เมื่อจบ M1**) · `migrate deploy` ผ่าน · postdeploy: 31 ตาราง · 88/88 · 149/149 · trigger เปิด · FK 0 → seed ×2 · **a1.1 125/125** · t1.2 97/97 · t1.1 100/100 · t0.6 126/126 · t0.5 130/130 · t0.4 110/110 · t0.3 116/116 · t0.2 84/84 · t0.1 96/96 · fitness 54/54 · typecheck 0
- ORACLE-EDIT: a1.1 M-3 L-4 L-8 L-10 G-1 S-6 X1-4 · t0.1 M-1 M-6 RS-5 S-8 · t1.1 S-14 รอบ 3 · fitness F5 51→52
- รายงาน: `trips-A1.1-design-review.md` `trips-A1.1-review.md` · SQL ตรวจก่อน/หลัง deploy: `trips-A1.1-preflight.sql` `trips-A1.1-postdeploy.sql` · มติ: ใบสั่ง §9 (R1–R11)

## กติกาสำหรับทุกใบถัดไป
- **ทุกต้นไม้ที่รับ A1.1 ต้อง `migrate deploy` แล้ว `prisma generate` ก่อน commit/ด่าน** (ไม่งั้น fitness F10.1 แดง: scope ลงทะเบียน model ที่ client ยังไม่มี)
- `prisma migrate diff` ยอมรับ DROP INDEX 5 รายการ (NULLS NOT DISTINCT): TripDeparture_productId_optionId_startsAt_key · TripPrice_dims_key · TripLinkStat_unitId_day_channel_linkId_key · AgentRate_dims_key · TripSupplierCost_dims_key
- ยอดรวมหลายการจอง (ใบแจ้งยอด · รอบจ่าย · ยอดคงเหลือ · วงเงิน) = BIGINT · โค้ดต้องใช้ bigint · ยอดต่อรายการ = int4
- ห้ามให้ร้านเห็น: LINE providerId ของเอเจนซี่ · activeAgentAccountId · lastLoginAt · เลขผู้เสียภาษีเก็บเป็น `v1:` + HMAC (กุญแจจาก INTEGRATIONS_CREDENTIALS_KEY) · รับเฉพาะนิติบุคคล (ขึ้นต้น 0)
- ค่าตั้งชั้น AGENT / AGENT_TIER เขียนได้เฉพาะเจ้าของ/ผู้ดูแลทุกสาขา
- A1.2 ต้องทำ: ยืนยันความเป็นเจ้าของเลขผู้เสียภาษี (ไม่มี unique ทั้งแพลตฟอร์ม) · `agentUserByLogin` คืนเฉพาะ ACTIVE · ตัวกันช่วงวันซ้อนของสัญญา/โควตา (A1.3/A1.4) · `TripPassengerLink` (T0.8 ยังเก็บใน AuditLog — ย้ายเมื่อแตะ) · คอลัมน์จริงของโซนรับส่ง (`kind` = ตัวบอกว่าย้ายแล้ว)

## หนี้
- ย้ายไป L1.1: `TripSupplierPeerLink` `TripGroupQuoteRequest` · ค่า OVERDUE ใน CHECK ของคำขอคืนเงิน · ดัชนี AuditLog (tenantId, targetId) (ตารางแพลตฟอร์ม)
- ตัวกันสมุดอนุญาต DELETE ตลอด 30 วันที่ร้านอยู่สถานะ PENDING_DELETE (ร้านยังยกเลิกการลบได้) · TRUNCATE ไม่ถูกกัน
- **บั๊กแพลตฟอร์ม (ผู้ตรวจพบ · ผู้คุมยังไม่ยืนยัน)**: ส่งออกข้อมูลร้านตาม PDPA ล้มเพราะ BigInt แปลง JSON ไม่ได้ (มีอยู่ก่อนจาก `Member.spent12mSatang`) — A1.1 เพิ่มตาราง BigInt เข้าเส้นทางเดียวกัน → OQ24
- ป้ายไทยของค่าตั้ง agency เป็นถ้อยคำของผู้สร้าง · จอค่าตั้ง agency ยังไม่เคยเรนเดอร์ · diff "โฟลเดอร์ migration → schema" ไม่ได้รัน (ไม่มีฐานเงา — ชดเชยด้วยการเทียบ catalog จริง)

---
(ด้านล่าง = บันทึกของผู้สร้าง)

# trips-A1.1 — migration agency · AgentIdentity · ค่าตั้ง agency (รายงานผู้สร้าง · 13 พ.ย. 2569 · เลน l2 · ยังไม่ commit)

- ของที่ได้: `prisma/migrations/20270201000200_agency/migration.sql` (276 คำสั่ง: SET 1 · ADD COLUMN 4 · CREATE TABLE 31 · CREATE INDEX 57 · CREATE UNIQUE INDEX 31 · ADD CONSTRAINT 149 · FUNCTION 1 · TRIGGER 1 · RESET 1) · `agency.prisma` (26) · `supplier.prisma` (4) · trips/sellable เพิ่มอย่างเดียว · scope 31 · สิทธิ์ `agency.settings.edit/.money` · `defs/agency.ts` 40 คีย์ · `service.ts` AGENT_TIER/AGENT · `modules/agency/{identity-core,entry,index}.ts` · fitness F17.1 · TRIPS-DEFAULTS + สัญญา ตาม §4.3
- ลงฐานเลน l2 (ep-calm-sun) แล้ว: dry-run ใน tx ที่ ROLLBACK ก่อน → `migrate deploy` สำเร็จ · `generate`
- ดัชนี O4 (มติ R9): `TripHold_agentAccountId_active_idx` (partial · ตารางเดิม) · `AgentStopSell_tenantId_productKind_productId_open_idx` · `AgentStatement_dueAt_open_idx` · `TripSupplierPayable_dueAt_open_idx` (partial · SQL มือ) · `AgentCommission_tenantId_status_earnedAt_idx` · `AgentLoginCode_expiresAt_idx` · `TripPassengerLink_expiresAt_idx` · `TripMoneyEvent_tenantId_unitId_receivedAt_idx` (@@index)
- ผล: a1.1 122/125 (M-3 L-10 G-1 = แย้งข้อสอบ) · t0.1 93/96 (M-1 M-6 RS-5 ตามคาด) · t1.1 99/100 (S-14) · t0.6 125/126 (S-14) · t0.4 109/110 (S-14) · t1.2 96/97 (S-13) — สี่ข้อหลังเป็นตัวตรวจขอบเขตที่ยกเว้นไฟล์ที่ตรง session/trips ⇒ เขียวหลัง merge · t0.5 130/130 · seed ×2 ไม่เขียน · fitness 53/54 ×2 (F17.1 ✅ · F5.1 52 รอ ORACLE-EDIT) · typecheck 0

## แย้งข้อสอบ
- **M-3**: ตรึงดัชนีบนตารางเดิมไว้ TripMoneyEvent/SellBasket — มติ R9 สั่งใส่ O4 รวม `TripHold("agentAccountId") WHERE status='ACTIVE' AND "agentAccountId" IS NOT NULL` ⇒ เสนอ `ok(idxOld.every((t) => t === "TripMoneyEvent" || t === "SellBasket" || t === "TripHold"), …)`
- **L-10**: คิวรีค่าคงที่กรองด้วย `[tA]` แต่ร้าน tA มีแถวสมุดที่ข้อสอบเอง commit ไว้ (แถว `ledgerId` ของกลุ่ม L · แถว `ple` ของ L-8) ที่ไม่มีหัวสมุด ⇒ B1 เกิน 2 แถวทุกขั้น ⇒ เสนอใช้ร้านชั่วคราวใหม่ใน tx (`const tL = rid("tL")` แทน `tA` ในแถว + คิวรีของ L-10 ทั้งหมด)
- **G-1**: เรียก t0.1 ด้วย `--no-regression` (t0.1 จึง SKIP G-1 ของตัวเอง) แล้วบังคับ skipped ว่าง ⇒ เสนอ `((s?.skipped as string[]) ?? []).filter((x) => x !== "G-1").length === 0` (ผลจริง failed = [M-1 M-6 RS-5] พอดี)
- ORACLE-EDIT ที่คาด: t0.1 M-1 (โฟลเดอร์ใหม่ 3 · `_agency` ต่อท้าย) · M-6 (+agency.prisma +supplier.prisma) · RS-5 (AGENT/AGENT_TIER ที่ id ไม่มี ⇒ `NOT_FOUND:NOT_FOUND` · VESSEL คง SCOPE_UNSUPPORTED) · fitness BASELINE f5RawPrisma 51→52

## ตัดสินเองเมื่อใบสั่งเงียบ
- `agentTaxIdHash` รับเฉพาะเลขที่ normalize แล้ว (ไม่ใช่ ⇒ โยน INVALID_TAX_ID) · `addAgentLogin` ล็อกอินที่เป็นของตัวเองอยู่แล้ว ⇒ ok (id เดิม) · ทุกบทบาทเพิ่มล็อกอินให้ตัวเองได้ · `findAgentIdentityByCode` คืนทุกสถานะ · `listAgentAccountsOfUser` ผู้ใช้/ตัวตนไม่ ACTIVE ⇒ []
- ชั้น AGENT/AGENT_TIER unitId null ⇒ ตรวจสิทธิ์แบบไม่ผูกหน่วย (STAFF ที่จำกัดสาขาแก้ค่าตั้งชั้นเอเจนซี่ได้ถ้ามีสิทธิ์ agency.*) — A1.2/A1.3 ทบทวน
- ป้ายไทยทุกคีย์/ตัวเลือก/ช่องตาราง = ข้อความของผู้สร้าง (ยังไม่ผ่านเจ้าของ)

## ยังไม่ได้ตรวจ
- `migrate diff --from-migrations` (ต้องมี shadow DB — เครื่องไม่มี Postgres server) · ฐานหลัก/เลน l1 l3 (ผู้คุม) · p0.1/SVC/smoke นอกที่ข้อสอบ a1.1 เรียก
