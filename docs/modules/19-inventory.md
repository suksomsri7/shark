# ระบบที่ 18: คลังสินค้า / สต็อก (Inventory)

> ออกแบบโดย Fable 5 (2026-07-12) — ระบบที่ 18 · AppSystem type `INVENTORY` (feature)
> เหตุผลที่ต้องเป็นระบบแยก: ตอนนี้สต็อกกระจัดกระจาย (POS มีสต็อกตัวเอง 🔜, Restaurant มี stockQty/86, Account มีสินค้า+ใบเบิก) — ร้านจริงต้องการ**สต็อกกลางชุดเดียว** ที่ทุกระบบตัดจากที่เดียวกัน ตามหลัก "ทุกระบบเชื่อมถึงกัน"

## 1. ขอบเขต v1
- **สินค้า/วัตถุดิบกลาง**: SKU/barcode/หน่วย/หมวด/ต้นทุน/จุดสั่งซื้อ (reorder point) — sync กับ AccountProduct (ไม่ซ้ำซ้อน: Inventory ถือ "ของจริงมีเท่าไหร่", Account ถือ "มูลค่า/เอกสาร")
- **Movement ledger append-only**: รับเข้า (จากบันทึกซื้อ) / ตัดออก (ขาย POS/Restaurant, ใบเบิก) / ปรับยอด (ตรวจนับ) / โอนระหว่างระบบ business — ทุกแถวอ้าง refType/refId
- **ตรวจนับ (stock count)**: นับจริง→ผลต่าง→ปรับยอด+ลงบัญชี (ผ่าน Account)
- **แจ้งใกล้หมด**: ต่ำกว่า reorder point → แจ้งเตือน (Daily Brief/Meeting channel)
- **รายงาน**: คงเหลือ+มูลค่า (ต้นทุนถัวเฉลี่ย), เคลื่อนไหวต่อสินค้า, ขายดี/ค้างสต็อก

## 2. การเชื่อม
- **POS**: ขายแล้วตัดสต็อกอัตโนมัติ (เชื่อมระบบ) · **Restaurant**: recipe/BOM ตัดวัตถุดิบ (P2 ตามสเปคร้านอาหาร) · **Account**: บันทึกซื้อ→รับเข้า, ใบเบิก/ส่งคืน→ตัด/คืน, มูลค่าคงเหลือ→งบ (1300) · **AI**: "เหลือแชมพูกี่ขวด" / เสนอสั่งซื้อเมื่อใกล้หมด

## 3. Data model
`InvItem` (sku, barcode?, name, unitId, categoryId, costSatang avg, reorderPoint, accountProductId?) · `InvMovement` (itemId, qtyDelta, type IN|OUT|ADJUST|TRANSFER, refType/refId, costSatang, note) · `InvCount` + lines · scope systemId เหมือนโมดูลอื่น

## 4. Phasing
**P1**: item + movement + ตัดจาก POS/รับจากบันทึกซื้อ + คงเหลือ+แจ้งใกล้หมด · **P2**: ตรวจนับ+ปรับยอดลงบัญชี, Restaurant BOM, โอนข้ามระบบ, ต้นทุนถัวเฉลี่ย→งบ
