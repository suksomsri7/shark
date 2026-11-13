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
