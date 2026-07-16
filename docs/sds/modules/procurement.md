# Procurement / จัดซื้อเข้าคลัง (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
จัดซื้อ: Supplier → PO → สั่ง → รับของ → movement เข้าสต็อก. เป็นส่วนหนึ่งของโมดูล INVENTORY (feature no.18), scope=system (ระบบ INVENTORY). WO-0028. **Layer 4/2**.
โค้ด: `src/lib/modules/inventory/procurement.ts` · `procurement-actions.ts` · schema `prisma/schema/procurement.prisma`.
(หมายเหตุ: มี "PO ฝั่งบัญชี" แยกใน account/expense.ts — PURCHASE_ORDER/approval flow — คนละตัวกับ PO จัดซื้อสต็อกนี้.)

## Data model (prisma/schema/procurement.prisma) — tenantId+systemId
- **Supplier** — `name` `phone/email/note?`. index `[tenantId,systemId]`.
- **PurchaseOrder** — `supplierId` `code`(PO-0001 running ต่อ system) `status`(DRAFT/ORDERED/RECEIVED/CANCELLED) `orderedAt/receivedAt?`. unique `[systemId,code]`. index `[tenantId,systemId,status]`.
- **PoLine** — `itemId`(InvItem.id) `qty` `costSatang` (onDelete Cascade po).

## Service API (src/lib/modules/inventory/procurement.ts) — ctx {tenantId,systemId}
- `createSupplier(ctx, {name, phone?, email?, note?})` · `listSuppliers(ctx)`.
- `createPo(ctx, {supplierId, note?, lines:[{itemId,qty,costSatang}]})` — DRAFT, code รัน PO-0001 ต่อ system. lines ว่าง → **throw ไทย**.
- `markOrdered(ctx, poId)` — DRAFT→ORDERED + orderedAt · อื่น false.
- `receivePo(ctx, poId)` — ORDERED→RECEIVED + receivedAt: ทุก line → `invSvc.receive` (idempotencyKey `po-<lineId>` — receive ซ้ำไม่เบิ้ล). สถานะไม่ใช่ ORDERED → `{ok:false, note:ไทย}`.
- `cancelPo(ctx, poId)` — DRAFT/ORDERED→CANCELLED · RECEIVED → false.
- `poDetail(ctx, poId)` (+lines+item name) · `listPos(ctx, take=100)`.

## การเชื่อมต่อ
- **ออก → Inventory**: `receivePo` เรียก inventory `receive` (IN movement, idempotencyKey `po-<lineId>`) — สต็อกเพิ่ม + moving-avg cost.
- ไม่มี outbox event · ยังไม่ post บัญชีอัตโนมัติ (บัญชีเจ้าหนี้ทำผ่าน account/expense PO แยก).

## Permissions (assertCan ใน procurement-actions.ts)
`inventory.supplier.create` · `inventory.po.create` · `inventory.po.order` · `inventory.po.receive` · `inventory.po.cancel`.

## UI
- ส่วนจัดซื้อในหน้าระบบ INVENTORY: `/app/sys/[id]` (type=INVENTORY, InventoryContent).

## การทดสอบ
- `scripts/qc-procurement.mts` (Fable oracle, WO-0028) — supplier · createPo(code รัน/lines ว่าง throw) · markOrdered · receivePo(idempotent `po-<lineId>` ไม่เบิ้ล/สถานะผิด ok:false) · cancelPo(RECEIVED→false) · poDetail.

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- รับของเข้าคลังเดียว — WO-0037 Multi-warehouse (PO รับเข้าเลือกคลัง).
- ยังไม่ผูกเจ้าหนี้/จ่ายเงินเข้าเส้นบัญชีอัตโนมัติ (แยกกับ account PO).
- WO-0059 Vendor Portal (supplier login เห็น PO/สถานะจ่าย).
