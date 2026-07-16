# Inventory / คลังสินค้า-สต็อก (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
สต็อกกลาง + movement ledger (contract C-1). InvItem = "ของจริงมีเท่าไหร่" · movement append-only ทุกแถวอ้าง refType/refId. นโยบาย: ตัดสต็อกยอมติดลบ + ธง needsReview. ผู้ใช้: staff (รับเข้า/ตัดออก/ปรับ). **Layer 2: Core** (feature no.18) — scope=system (AppSystem type INVENTORY). (Procurement/PO อยู่ในโมดูลนี้ — ดู `procurement.md`.)
โค้ด: `src/lib/modules/inventory/{service,actions,rules,procurement,procurement-actions,ui}.ts` · schema `prisma/schema/inventory.prisma`.

## Data model (prisma/schema/inventory.prisma) — tenantId+systemId
- **InvItem** — `sku`(unique `[systemId,sku]`) `barcode?` `name` `unitLabel` `category?` `costSatang`(ต้นทุนถัวเฉลี่ย) `onHand`(cache — source of truth = ledger) `reorderPoint` `accountProductId?`(sync AccountProduct) `archivedAt?`. index `[systemId,onHand]`.
- **InvMovement** (append-only) — `itemId` `type`(IN/OUT/ADJUST/TRANSFER) `qtyDelta` `balanceAfter`(audit) `costSatang` `sourceModule?`(POS/RESTAURANT/ACCOUNT/manual) `refType/refId` `idempotencyKey` `needsReview`(ตัดจนติดลบ=ตั้งธง). unique `[tenantId,idempotencyKey]`. index `[systemId,itemId,createdAt]`.

## Service API (src/lib/modules/inventory/service.ts) — ctx {tenantId,systemId}
- `createItem(ctx, input)` — สร้างสินค้า (sku unique).
- `receive(ctx, input)` — รับเข้า (type IN): movement + อัปเดต onHand + moving-average cost (rules.movingAvgCost), idempotencyKey กันซ้ำ.
- `consume(ctx, input)` — ตัดออก (type OUT): ยอมติดลบ → needsReview=true (rules.isNegative).
- `onHand(ctx, itemIds)` · `lowStock(ctx)` (needsReorder) · `listItems` · `recentMovements`.
- **rules.ts** (Fable): `movingAvgCost(oldQty,oldCost,inQty,inCost)` · `needsReorder(onHand,reorderPoint)` · `isNegative(balanceAfter)` — pure.

## การเชื่อมต่อ
- **ขาเข้า จาก POS/Restaurant**: ตัดสต็อกตอนขาย (sourceModule + refType/refId + idempotencyKey).
- **Account**: InvItem.accountProductId sync กับ AccountProduct (มูลค่า/เอกสาร).
- **Procurement**: receivePo → invSvc.receive (idempotencyKey `po-<lineId>`).
- ไม่มี outbox event (เขียนตรง).

## Permissions (assertCan)
`inventory.item.create` · `inventory.movement.receive` · `inventory.movement.consume` · (procurement) `inventory.supplier.create` · `inventory.po.create` · `inventory.po.order` · `inventory.po.receive` · `inventory.po.cancel`.

## UI
- `/app/sys/[id]` (type=INVENTORY, InventoryContent) — สินค้า/รับเข้า-ตัดออก/แจ้งใกล้หมด + จัดซื้อ (PO).

## การทดสอบ
- `scripts/qc-inventory.mts` (Fable oracle, contract C-1) — สต็อกกลาง + movement ledger + moving-avg + ตัดติดลบ needsReview; severity CRITICAL/MAJOR/MINOR.
- `scripts/qc-procurement.mts` — PO flow (ดู procurement.md).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- Single warehouse — **WO-0037** Multi-warehouse (Location/onHand ต่อ location/transfer/PO เลือกคลัง) ⚠️ แตะ schema (ระวัง regression 12 ข้อ).
- **WO-0038** Lot/Expiry/Barcode + event `inventory.lot.expiring`.
- WO-0045: AI ปรับสต็อก (ADJUST) + รับเข้า (inventory_receive เป็น ProposalKind แล้ว).
