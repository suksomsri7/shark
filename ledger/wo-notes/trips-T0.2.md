# trips-T0.2 — สินค้า · ตัวเลือก · ประเภทคน · รายการเสริม · เนื้อหาสองภาษา (✅ 12 พ.ย. 2569 · merge 171b9ebc8)

- ของที่ได้: `src/lib/modules/trips/{products,products-core,product-actions}.ts` (20 ฟังก์ชัน + 20 action) · สิทธิ์ `trips.product.view/.edit/.publish` · event `trips.product.published/.unpublished/.archived` · seed: หน่วย TRIPS `andaman-dive-trips` + สินค้า 4 ตัวของจอ 16 ผ่าน facade · `trips-expected.json` มี id ตัวเลือก/ประเภทคน/รายการเสริม
- รอบ: สร้าง 83/84 → ORACLE-EDIT P-11 · p0.1 C-2 (3 หน่วย) · t0.1 S-12 · t0.5 BigInt → ผู้ตรวจ FIX FIRST (1 MAJOR สกุลเงินร่าง Liveaboard) → r2 (10 ข้อ) → ผู้ตรวจ MERGE
- **ด่านผู้คุม @08764070a (เลน l2)**: seed ×2 (รอบสองไม่เขียน) · t0.2 83/84 (S-10 = ORACLE-EDIT ของผู้คุม หายเมื่อ merge) · t0.1 96/96 · p0.1 56/56 · SVC r0.3 94/94 · smoke 6/6 · fitness 53/53 ×2 · typecheck 0 → **หลัง merge บนฐานหลัก: seed ×2 · t0.2 84/84 · t0.1 96/96**
- X: X1 (5) · X3 (4) · X9 (5) · X8 payload ไม่มี PII · ตัวช่วยสำหรับใบถัดไป: `assertProductSellableInTx(tx, {tenantId, unitId, productId, optionId?})` (FOR SHARE · โยน `TripProductNotSellableError` NOT_FOUND / PRODUCT_ARCHIVED / OPTION_INACTIVE)

## กติกาที่ใบถัดไปต้องถือ (จากผู้ตรวจ r2)
- เรียกตัวช่วย **ก่อน** ล็อกรอบ/กฎรอบ/แถวราคา · หลังเรียกแล้ว **ห้าม** UPDATE หรือ FOR UPDATE แถวสินค้าใน tx เดียวกัน (สองฝั่งถือ share แล้วยกระดับ = deadlock)
- `stockItemId` / `photoFileIds` ตรวจแค่รูปแบบ — ใบ X.2 และ T1.1 ต้องอ่านผ่าน `tenantDb` เสมอ ห้ามเชื่อค่าที่เก็บ

## หนี้
- ร่างที่ไม่เคยเผยแพร่แต่มีราคาแล้ว เปลี่ยนสกุลเงิน → ราคาค้างสกุลเดิม ⇒ **ใบสั่ง T0.5: ปฏิเสธ `CURRENCY_LOCKED` เมื่อมีแถวราคาอ้างถึง**
- ตัวช่วยข้ามการตรวจเมื่อ `optionId` เป็นค่าว่าง (ควรใช้ `!= null`) → แก้ในรอบแก้ T0.3
- `updateExtra` ของรายการเสริมระดับร้าน (ไม่ผูกสินค้า) ไม่ล็อก → แก้พร้อมกันอาจได้ error ดิบ 23514 · audit เปลี่ยนสกุลเงินเก็บแค่จำนวน · `disclosure`/`meetingPoint` ยังแทนทั้งก้อน (บอก T1.1) · "ถูกอ้างถึง" ยังไม่รวม `AgentRate` (A1.3) · seed เขียนทับการแก้มือของสินค้าตัวอย่าง
