# แผนที่การเชื่อมต่อ "ผู้ติดต่อ" และ "สินค้า/บริการ" ของโมดูลบัญชีกับระบบอื่นใน SHARK (สภาพปัจจุบัน + ข้อเสนอ)

> สำรวจโดย Opus 5 (read-only) 2 ก.ย. 2026 · Fable ตรวจ · เป็นฐานของ WO รอบ 2 (นโยบายเจ้าของ: ผู้ติดต่อต้องเชื่อมระบบอื่น · สินค้าต้องเชื่อมคลัง+POS)

## A. โมเดล "คน/บริษัท" ที่มีอยู่ — **ไม่มี Party/Customer กลางระดับ tenant**

| โมเดล | ไฟล์ | ฟิลด์หลัก | ขอบเขต | ลิงก์ที่มีอยู่ |
|---|---|---|---|---|
| **AccountContact** | `prisma/schema/account.prisma:259-284` | kind CUSTOMER/VENDOR/BOTH · legalType · name · taxId · branchCode/Name · address · phone · email · creditTermDays · archivedAt | tenant+systemId(ACCOUNT) | **ไม่มีลิงก์ออก** (ไม่มี memberId/customerId/crmContactId) · ขาเข้า: AccountDocument.contactId · AccountJournalLine.contactId |
| **CrmContact** | `crm.prisma:34-57` | name · phone · email · company(ข้อความ) · lifecycleStage · source · ownerUserId | tenant+systemId(CRM) | memberCustomerId→Customer (มือ) · CrmDeal.quotationDocId→AccountDocument |
| **Customer** (สมาชิก = ใกล้เคียง "ลูกค้ากลาง" ที่สุด) | `member.prisma:148-173` | memberCode · name · phone · email · tier · totalSpentSatang · visitCount · tags · **ไม่มี taxId/ที่อยู่** | tenant+memberSystemId · unique(memberSystemId,phone) | ถูกอ้างเป็น scalar จาก ~10 โมดูล (POS memberId · hotel/clinic/school/ticket customerId · restaurant · queue) |
| **ChatContact** | `chat.prisma:109-138` | channel · externalUserId · displayName · phone · email · verifiedEmail | tenant+systemId(CHAT) | customerId→Customer **auto-link ด้วยเบอร์โทร** (`chat/service.ts:1202-1224` → member.findOrCreate) |
| HrEmployee | `hr.prisma:66-110` | name · phone · email · nationalId · ที่อยู่ · บัญชีธนาคาร · linkedUserId | tenant+systemId(HR) | BookingStaff.employeeId |
| Supplier (จัดซื้อ) | `procurement.prisma:9-22` | name · phone · email · portalToken · **ไม่มี taxId/ที่อยู่** | tenant+systemId(INVENTORY) | ไม่มี — เป็นคนละลิสต์กับ AccountContact(VENDOR) |
| Rental / Shop customer | `rental.prisma:34` · `ecommerce.prisma:35` | ชื่อ+เบอร์ snapshot **ไม่มี customerId เลย** | unit | ไม่มี |

**การจับคู่ผู้ติดต่อจาก CRM ตอนนี้** (`account/service.ts:1766-1779` `findOrCreateCustomerContact`): `findFirst where OR:[phone, name]` = จับด้วย **เบอร์ หรือ ชื่อตรงเป๊ะ** ในคำสั่งเดียว · ไม่ normalize เบอร์ · ไม่จับ taxId · ไม่กรอง archivedAt · ไม่เก็บ back-link — 🔴 ชื่อซ้ำกันในระบบเดียว = เอาผู้ติดต่อของคนอื่นมาใช้เงียบ ๆ · dedupe key บน AccountContact ไม่มี (index taxId/name เป็น non-unique)

## B. โมเดล "สินค้า/บริการ/สต็อก" — **ไม่มีแคตตาล็อกกลาง แต่ InvItem ใกล้เคียงที่สุด**

| โมเดล | ไฟล์ | ฟิลด์หลัก | ลิงก์ |
|---|---|---|---|
| **AccountProduct** | `account_gl.prisma:130-154` | sku(unique/system) · name/nameEn · type GOODS/SERVICE · unitId · salePrice · buyPrice · vatRateBp · incomeAccountId/expenseAccountId · imageUrl · **qtyOnHand (สต็อกของตัวเอง ขยับเฉพาะใบเบิก `account/product.ts:356`)** | ← InvItem.accountProductId · → AccountDocumentLine.productId |
| AccountUnit | `account_gl.prisma:118-128` | name | (บรรทัดเอกสารเก็บ unitName เป็นข้อความ) |
| **InvItem** (คลัง) | `inventory.prisma:368-400` | sku(unique/system) · barcode · name · unitLabel · kind PRODUCT/SERVICE · priceSatang · costSatang(ถัวเฉลี่ย) · onHand · reorderPoint · duration/deposit/bookable · categoryId · **accountProductId?** | ลิงก์เดียวที่มีจริงระหว่างคลัง↔บัญชี |
| InvMovement / InvLocationStock / InvLot | `inventory.prisma:404-469` | qtyDelta · balanceAfter · costSatang · sourceModule · refType/refId · idempotencyKey · needsReview | → GL ผ่าน postInventoryGl |
| MenuItem (ร้านอาหาร) | `restaurant.prisma:133-170` | name · basePrice · sku(unique/unit) · stockQty/dailyStockQty | **ไม่มี invItemId/accountProductId** |
| ShopProduct | `ecommerce.prisma:10-27` | name · priceSatang | invItemId? |
| BookingService | `booking.prisma:17-39` | name · durationMin · priceSatang · depositSatang | itemId?→InvItem(SERVICE) |
| RentalAsset · SchoolCourse · TicketType | rental/school/ticket.prisma | ราคาแยกของตัวเอง | ไม่มี |
| PoLine (จัดซื้อ) | `procurement.prisma:42-52` | itemId=InvItem · qty · costSatang | InvItem |

**sync ที่มีวันนี้**: ทางเดียว-ราคาเดียว `pos/register.ts:165-206 setItemSalePrice` → `createAccountProductWithSalePrice` + `inventory.linkAccountProduct` — ไม่ sync ชื่อ/SKU/หน่วย/VAT · ไม่มี back-sync · `AccountProduct.qtyOnHand` ไม่เคยกระทบกับ `InvItem.onHand` (สต็อก 2 ชุดเดินคนละทาง)

## C. เงินจาก POS เข้าบัญชีวันนี้
`pos/account-bridge.ts:38-54` → `applyExternalSale` (`account/index.ts:40-95`) ส่ง **ยอดรวมเท่านั้น** (gross · serviceGross · แยกช่องทางจ่าย) — ไม่มี productId/itemId/หมวด/สมาชิก · VAT ถอยกลับจาก gross · `postExternalSale` (`gl.ts:1217-1264`) ลง JV เดียว Dr เงิน/2110/1100 · Cr 4000/4030/VAT · idempotent `PosSale#id#PAID` · **ไม่สร้าง AccountDocument/Line/Contact** ⇒ ยอดขาย POS ไม่โผล่ในลูกหนี้/สินค้า
COGS เดินคนละเส้น: `pos/service.ts:220-256` → `inventory.consume` ต่อบรรทัดที่มี itemId → InvMovement มูลค่า costSatang → `inventory/account-bridge.ts` Dr 5000/Cr 1200 (`postInventoryGl`) — ใช้ต้นทุนคลังจริง แต่เฉพาะบรรทัดที่ผูก InvItem · รายได้กับต้นทุนไม่เคย join กัน

## D. หน้า "เชื่อมต่อ" ที่มี
`/app/settings/connections` = ตาราง ระบบ×สาขา (AppSystemUnit) ซ่อนเมื่อมีสาขาเดียว — **ไม่เกี่ยวกับ AccountSystemLink** · `AccountSystemLink` (`account_gl.prisma:387-400` · kind POS|BUSINESS|CRM · unique[systemId,linkedKind,linkedId] · config Json) **ไม่มี UI เลย** — สร้างเฉพาะตอน DNA onboarding `LINK_ACCOUNT_POS` (`dna/apply.ts:121-135`) · อ่านโดย `findAccountLinkForPos` · ไม่มีตัวเขียน BUSINESS · ที่อื่นใช้ `systemForUnit(tenantId, unitId, TYPE)` แทน

## E. ตัวตนลูกค้าระดับแพลตฟอร์ม
ไม่มี Party/Person กลาง · `Customer` (สมาชิก) เป็น de-facto แต่ผูก memberSystemId ไม่ใช่ tenant และไม่มี taxId/ที่อยู่ ⇒ ออกใบกำกับภาษีไม่ได้ · กติกา dedupe ต่างกันทุกโมดูล (สมาชิก=เบอร์ · แชท=externalUserId แล้ว auto-link เบอร์ · บัญชี=เบอร์หรือชื่อ) · schema 51 ไฟล์ ~4.9k บรรทัด

## F. ข้อเสนอการเชื่อมต่อ (ขั้นต่ำ ไม่พังของเดิม) — ใช้เขียน WO coding

**ผู้ติดต่อ**
1. เพิ่มตาราง **`Party`** (tenant-scoped: kind PERSON/COMPANY · name · phone · phoneNorm · email · taxId · branchCode · address · mergedIntoId?) เป็น "กระดูกสันหลัง" · โมดูลเดิม**ไม่ย้าย** แค่เพิ่ม `partyId String?` (nullable) ที่ AccountContact · CrmContact · Customer · ChatContact · HrEmployee · Supplier · PatientRecord · HotelReservation · TicketOrder · SchoolEnrollment
2. แถวต่อโมดูล = "บทบาท/โปรไฟล์" ของ Party (บัญชีต้องมี taxId+เครดิตเทอม · สมาชิกมี tier/แต้ม · แชทมี handle) — ไม่ยุบรวม
3. AccountContact เพิ่มกุญแจตัวตนทันที (ไม่ต้องรอ Party): `@@unique([systemId, taxId, branchCode])` เมื่อ taxId ไม่ null + `phoneNorm` + index
4. 🔴 แก้ `findOrCreateCustomerContact` ก่อนอื่น: ลำดับจับคู่ taxId → phoneNorm → (name AND email) · ห้ามจับด้วยชื่อเปล่า · กรอง archivedAt:null เสมอ
5. `createExternalQuotation` รับ `partyId/sourceContactId` แล้วเก็บบน AccountContact ที่สร้าง → ออกซ้ำจาก CRM = lookup ไม่ใช่เดา
6. backfill Party ด้วย (tenantId,taxId) แล้ว (tenantId,phoneNorm) · แถวกำกวมไม่ auto-merge → โชว์ในหน้า **"รวมผู้ติดต่อซ้ำ"** ให้คนกด
7. facade `party.findOrCreate(tenantId,{taxId,phone,email,name})` แบบเดียวกับ `member.findOrCreate` · แชท (`maybeAutoLinkMember`) และ CRM เรียกตัวเดียวกัน

**สินค้า/บริการ**
8. ยก **InvItem เป็นแคตตาล็อกกลาง** (มี SKU unique · kind · cost · onHand · booking/shop/POS ชี้อยู่แล้ว) — ไม่สร้างตารางใหม่
9. เพิ่ม `AccountProduct.invItemId?` (ขากลับของ `InvItem.accountProductId`) + กำหนดทิศทาง canonical เดียว
10. เพิ่ม `invItemId?` ที่ MenuItem · RentalAsset · TicketType · SchoolCourse (แบบเดียวกับ BookingService.itemId) · ราคา/ชื่อต่อโมดูลเป็น override · SKU/หน่วย/ต้นทุน/VAT มาจาก item กลาง
11. `syncItemToAccountProduct(ctx,itemId)` ใน facade บัญชี: name · sku · unitName · vatRateBp · buyPrice(cost) (วันนี้ไหลแค่ salePrice ทางเดียว)
12. **เลิกใช้ `AccountProduct.qtyOnHand` เป็นสต็อกชุดที่สอง**: ถ้าผูก item แล้ว ใบเบิกต้องเรียก `inventory.consume` ไม่ใช่ลด Decimal เอง
13. ขยาย `applyExternalSale` รับ `lines:[{itemId?,accountProductId?,name,qty,unitPriceSatang,vatRateBp}]` + `memberId/partyId` (optional · ค่าเริ่มต้นเท่าเดิม) → ยอดขาย POS ระบุได้ต่อสินค้า/ต่อลูกค้า

**การเชื่อมระบบ**
14. เพิ่ม `AccountLinkedKind` MEMBER · INVENTORY · CHAT และ**สร้างหน้า "เชื่อมระบบกับบัญชี"** (ตอนนี้ไม่มี UI) แสดงว่าสมุดบัญชีเล่มนี้รับข้อมูลจาก สมาชิก/CRM/คลัง/POS/แชท ระบบไหน · ตัวเลือกต่อลิงก์ใน `config Json` (autoCreateContact · syncProductPrices)
15. ทุกลิงก์ใหม่ nullable + degrade อย่างสุภาพ ตามกติกาบ้าน "ไม่เชื่อม = ไม่ post" (`account/index.ts:51`) — ห้ามโมดูลใด throw เพราะ Party/item กลางไม่มี
