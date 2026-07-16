# Member / สมาชิก (Customer กลาง) (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
แกนกลางลูกค้า — ตัวตน + tier + ยอดสะสม + timeline. ทุกโมดูลอ้าง `Customer.id` เดียวกัน (ช่องทางเชื่อม #4 ใน 02: "Customer กลาง"). ผู้ใช้: ทุกระบบธุรกิจ (เขียน/อ่านลูกค้า) + AI (member_create/customer_search). **Layer 2: Core** (Member = ระบบ feature no.6, scope=tenant — ลูกค้า 1 คนใช้ข้ามทุกกิจการของร้าน แต่เก็บใน memberSystemId scope).
โค้ด: `src/lib/modules/member/service.ts` · schema `prisma/schema/member.prisma`.

## Data model (prisma/schema/member.prisma)
- **Customer** — `memberSystemId`(scope) `memberCode?`(unique ต่อระบบ) `name/phone/email` `tier`(MEMBER/SILVER/GOLD/PLATINUM) `totalSpentSatang` `visitCount` `tags`json `marketingConsent/consentAt` `note`. unique `[memberSystemId,phone]` และ `[memberSystemId,memberCode]`.
- **MemberActivity** — timeline รวมทุกโมดูล: `customerId` `unitId?` `module`("booking"|"pos"|...) `type`("APPOINTMENT_BOOKED"|"VISIT"|...) `refType/refId` `summary`. index `[tenantId,customerId,createdAt]`.

## Service API (src/lib/modules/member/service.ts)
- `computeTier(totalSpentSatang)` — คำนวณ tier จากยอดสะสม (deterministic).
- `findOrCreate(...)` — หา/สร้างลูกค้าจากเบอร์ในระบบสมาชิก (idempotent ต่อ `[memberSystemId,phone]`), gen memberCode.
- `logActivity(...)` — เขียน MemberActivity 1 แถว.
- `recordVisit(tenantId, customerId, client)` — visitCount+1 + activity VISIT.
- `recordSpend(...)` — totalSpentSatang += , อัปเดต tier (computeTier).
- `listCustomers(tenantId, search?)` — ค้นชื่อ/เบอร์/อีเมล (AI customer_search ใช้).
- `getProfile(tenantId, id)` — โปรไฟล์ + activity.

## การเชื่อมต่อ
- **ขาเข้า จากทุกโมดูล**: Booking (`APPOINTMENT_BOOKED`), POS (memberId → recordSpend/recordVisit + point), Restaurant/Hotel/Ticket (customerId), Subscription (customerId), CRM (memberCustomerId), Chat (ChatContact.customerId). เชื่อมผ่าน Customer.id + MemberActivity (ช่องทาง #4).
- **Subscription** อยู่ในโมดูลนี้ (member/subscription.ts) — ดู `subscription.md`.
- ไม่มี outbox event.

## Permissions (assertCan)
`member.customer.create` (สร้างลูกค้า) · plus loyalty/subscription strings ในไฟล์ subscription-actions: `member.plan.create` · `member.plan.update` · `member.subscription.create` · `member.subscription.cancel`.

## UI
- `/app/members` (รายชื่อ) · `/app/members/[id]` (โปรไฟล์+timeline).
- แสดงเป็น section ในหน้าระบบ MEMBER: `/app/sys/[id]` (type=MEMBER) — รายชื่อลูกค้า + SubscriptionSection.

## การทดสอบ
- `scripts/qc-ai-tools2.mts` — `member_create` (AI ทำแทน) + `customer_search` (listCustomers) ผ่าน service จริง.
- `scripts/qc-systems.mts` — member ในชุด 7 ระบบ.
- `scripts/qc-subscription.mts` — ครอบ subscription (ในโมดูล member).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- Customer ผูก memberSystemId (ต้องมีระบบ MEMBER + เชื่อม unit) — โมดูลที่ยัง scalar (Hotel/Queue) เก็บ customerId ไว้แต่ยังไม่ auto findOrCreate.
- WO-0058 Customer Portal (ลูกค้า login เห็น order/booking/แต้ม/ใบเสร็จ/แชท).
