# Customer Portal + Vendor Portal (DESIGN — สำหรับ WO-0058 + WO-0059)

> Customer Portal (0058): ลูกค้า login เห็น order/booking/แต้ม/ใบเสร็จ/แชท · Vendor Portal (0059): supplier เห็น PO/สถานะจ่าย · path อนาคตเขียนธรรมดา

## เป้าหมาย · ผู้ใช้ · เหตุผลเชิงธุรกิจ
- **Customer Portal:** ลูกค้าปลายทาง login (OTP — reuse auth เดิม) ดูประวัติของตัวเอง: คำสั่งซื้อ (E-commerce), การจอง (Booking), แต้ม (Point), ใบเสร็จ (Account), แชท (Chat)
- **Vendor Portal:** ผู้ขาย/ซัพพลายเออร์ login เห็นใบสั่งซื้อ (PurchaseOrder) ที่ร้านออกให้ + สถานะการจ่าย — ขึ้นกับ WO-0049 (Approval) เพราะ PO ผ่านอนุมัติก่อนส่ง vendor
- **เหตุผล:** อ้าง `docs/sds/01_VISION.md` — self-service ลด workload ร้าน · ปิด loop กับผู้มีส่วนได้เสียภายนอกบนข้อมูลชุดเดียว

## Data model เสนอ
axis = **tenant** (portal identity ผูกร้าน). **ไม่ทำ user ปนกับ PlatformUser หรือ User พนักงาน** — เป็น identity แยกชั้น (เหมือน backoffice แยกขาด ใน `docs/sds/04_CORE_PLATFORM.md`).

- `PortalIdentity` (axis: tenant) — บัญชี login ของ external actor
  - `id` · `tenantId` · `kind` enum (`CUSTOMER | VENDOR`)
  - `customerId` String? (kind=CUSTOMER → ผูก Customer กลาง) · `supplierId` String? (kind=VENDOR → ผูก Supplier)
  - `email` String? · `phone` String? · `lastLoginAt` DateTime?
  - `@@unique([tenantId, kind, customerId])` · `@@unique([tenantId, kind, supplierId])` · `@@index([tenantId, phone])`
- `PortalSession` (axis: tenant) — session แยกจาก session พนักงาน
  - `id` · `tenantId` · `identityId` · `tokenHash` (sha256 — เก็บ hash เท่านั้น ตามมาตรฐาน) · `expiresAt` · `createdAt`
  - `@@index([tenantId, identityId])`
- `PortalOtpToken` (axis: tenant หรือ global แบบ AuthToken) — OTP login (reuse pattern `AuthToken`)
  - เก็บ hash, enumeration-safe (อ้าง `docs/sds/04_CORE_PLATFORM.md` — OTP enumeration-safe)

**ไม่มีตารางธุรกิจใหม่** — portal อ่านจาก order/booking/point/PO ที่มีอยู่ (filter ด้วย customerId/supplierId).

## Service API เสนอ (ไฟล์อนาคต src/lib/modules/portal/service.ts)
- `requestPortalOtp(tenantSlug, { phone|email }, kind)` — enumeration-safe (ตอบเหมือนกันไม่ว่ามี identity ไหม)
- `verifyPortalOtp(...)` → สร้าง PortalSession
- **Customer:** `getMyOrders(portalCtx)` · `getMyBookings` · `getMyPoints` · `getMyReceipts` · `getMyChat` — ทุกตัว filter `customerId = identity.customerId` เท่านั้น (isolation ชั้นสำคัญ)
- **Vendor:** `getMyPurchaseOrders(portalCtx)` · `getMyPaymentStatus` — filter `supplierId = identity.supplierId`
- **Edge cases:** identity ไม่ผูก customer/supplier → ไม่เห็นอะไร · ลูกค้าคนละคนเบอร์เดียวกัน → 1 Customer ต่อ memberSystem (dedup) · vendor เห็นเฉพาะ PO ที่ approved+ส่งแล้ว (ไม่เห็น draft/ราคาต่อรองภายใน) · session หมดอายุ → re-OTP

## การเชื่อมต่อ
- **ไม่มีเงินใหม่** — portal อ่าน (read) เอกสารเงินที่มีอยู่ · ถ้า customer จ่ายผ่าน portal (v2) → เดินเส้น POS/PromptPay เดิม (ไม่เปิดเส้นใหม่)
- **Customer กลาง (ช่องทาง 4):** Customer Portal identity ผูก `Customer.id` — เห็นทุกอย่างที่ผูก customerId ข้ามโมดูล (order/booking/point/receipt) ครบใน view เดียว
- **Vendor:** ผูก `Supplier` (procurement, `src/lib/core/scope.ts` มี Supplier/PurchaseOrder)
- **Chat:** Customer Portal ต่อ Chat webchat เดิม (ChatConversation ผูก ChatContact→customer)
- **Approval (0059 ขึ้นกับ 0049):** PO ที่ vendor เห็น = approved แล้วเท่านั้น
- **ไม่ emit outbox ใหม่** (read-heavy) · login events อาจ log audit

## AI actions
- **ฝั่งร้าน (ไม่ใช่ portal):** read `portal_active_customers` (ลูกค้าที่ login portal ล่าสุด) — optional
- **ฝั่ง portal เอง:** ผู้ช่วย AI สำหรับลูกค้า = out of scope v1 (portal คือ view · AI ผู้ช่วยธุรกิจเป็นของฝั่งร้าน)

## Permissions เสนอ
- **Portal ไม่ใช้ RBAC พนักงาน** — ใช้ ownership check (identity.customerId/supplierId == row เจ้าของ) เป็นปราการ (คล้าย SiamDive My Plan ownership)
- ฝั่งร้าน: `portal.identity.manage` (เชิญ/ปิด access ลูกค้า/vendor)

## UI หน้าจอหลัก (`docs/UI_STANDARD.md`)
- **Portal ลูกค้า** (`max-w-md mx-auto` mobile-first) — หน้า login OTP → หน้ารวม: การ์ดคำสั่งซื้อ/การจอง/แต้ม/ใบเสร็จ (`DataList` + `StatusChip` + `MoneyText`) · แชทกับร้าน
- **Portal vendor** — รายการ PO + สถานะจ่าย (`DataTable`) · ดาวน์โหลดเอกสาร
- แยกธีม/โดเมน (ต่อ White label 0064) · ภาษาไทย-first

## ข้อสอบ oracle ที่ต้องมี
1. OTP login enumeration-safe (ตอบเหมือนกันไม่ว่ามี identity หรือไม่)
2. Customer เห็นเฉพาะ order/booking/receipt ที่ customerId ตรงตัวเอง — **ลูกค้า A เรียก resource ของ B → ปฏิเสธ** (ownership isolation)
3. Vendor เห็นเฉพาะ PO ที่ supplierId ตัวเอง + approved เท่านั้น (ไม่เห็น draft/ราคาภายใน)
4. PortalSession แยกจาก session พนักงาน — token พนักงานใช้กับ portal ไม่ได้และกลับกัน
5. tokenHash เก็บ hash เท่านั้น (ไม่มี plaintext ใน DB)
6. cross-tenant: portal identity ร้าน A เข้าถึงข้อมูลร้าน B ไม่ได้
7. session หมดอายุ → บังคับ re-OTP
8. identity ไม่ผูก customer → getMyOrders คืนว่าง (ไม่ leak)
9. vendor PO ที่ยังไม่ approved → ไม่โผล่ใน getMyPurchaseOrders

## ความเสี่ยง / คำถามเปิด
- 🔑 **identity แยกชั้น (เสนอ) — ยืนยันไม่ปนกับ User/Membership** เพื่อความปลอดภัย (external actor ไม่ควรมี tenant membership)
- 🔑 Vendor Portal ต้อง WO-0049 (Approval) ก่อน (dependency) — ยืนยันลำดับ
- v2: customer จ่ายบิลค้าง/จองผ่าน portal → ต้องออกแบบ write path เดินเส้น POS (ยังไม่ทำ v1)
- rate limit OTP (ต่อ WO-0043) — สำคัญเพราะ portal เปิดสาธารณะ
