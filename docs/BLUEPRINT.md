# SHARK — พิมพ์เขียวระบบ (Blueprint)

> ⚠️ อ่านคู่กับ `BLUEPRINT_BUSINESS_UNITS.md` — ชั้น **BusinessUnit** (1 ร้านมีหลายกิจการ: โรงแรม 2 แห่ง + ร้านอาหาร 3 ร้าน, dashboard เดียว) ถูกออกแบบเพิ่มทีหลังและ **override** โครงข้อมูล/RBAC/URL ในเอกสารนี้: ตารางโมดูลธุรกิจต้องมี `unitId` เพิ่มจาก `tenantId`, RBAC เป็น 4 มิติ (tenant → unit → module → action)

> Business Management Platform แบบ multi-tenant คล้าย Zoho / Odoo
> โดเมนหลัก: **shark.in.th** · Backoffice: **backoffice.shark.in.th**
> Stack: Next.js · PostgreSQL · Prisma · i18n (ไทย/อังกฤษ) · Minimal Clean B&W · ช่วงแรกใช้ฟรี

---

## 1. ภาพรวมสถาปัตยกรรม (High-level Architecture)

```
                         ┌─────────────────────────────┐
   ลูกค้าร้าน (public)     │   shark.in.th (Marketing)   │  landing / สมัคร / ราคา
   ─────────────────►    │   + App (Dashboard ร้าน)     │
   custom domain ─────►  │   + Storefront ต่อร้าน       │
                         └──────────────┬──────────────┘
                                        │  (Next.js App Router, 1 codebase)
                         ┌──────────────┴──────────────┐
                         │   backoffice.shark.in.th    │  Platform Admin
                         └──────────────┬──────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    │        API Layer (Route Handlers)      │
                    │  Auth · Tenant Resolver · RBAC · Modules│
                    └───────────────────┬───────────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    │   PostgreSQL (Prisma) — Row-level      │
                    │   Multi-tenancy (tenantId ทุกตาราง)    │
                    └────────────────────────────────────────┘
```

**หลักการ:** 1 codebase Next.js เดียว แยกพื้นที่การทำงานด้วย route group + subdomain:
- `(marketing)` → shark.in.th (หน้าขาย, สมัคร)
- `(app)` → dashboard ของร้าน (owner + staff)
- `(storefront)` → หน้าลูกค้า (จองคิว/สั่งอาหาร/ดูแต้ม) เสิร์ฟผ่าน custom domain หรือ `shark.in.th/s/{slug}`
- `(backoffice)` → backoffice.shark.in.th (admin แพลตฟอร์ม)

---

## 2. Multi-Tenancy (แกนที่สำคัญที่สุด)

**เลือกแบบ: Shared Database + Shared Schema + `tenantId` (Row-Level Isolation)**
เหมาะกับ SaaS จำนวนร้านเยอะ ต้นทุนต่ำ ดูแลง่าย (เหมือน BlueHouse hub)

กติกาเหล็ก:
1. **ทุกตารางธุรกิจต้องมี `tenantId`** (ยกเว้นตาราง platform-level เช่น Tenant, PlatformUser)
2. ทุก query ผ่าน **Prisma middleware/extension** ที่ inject `where: { tenantId }` อัตโนมัติ — กัน data leak ข้ามร้าน
3. Tenant resolver: อ่านจาก (ก) custom domain → map เป็น tenant, (ข) subdomain/slug, (ค) session ของ user ที่ login
4. Unique constraint เป็น `@@unique([tenantId, ...])` เสมอ (เช่น เลขที่ใบเสร็จ, slug สินค้า ไม่ชนกันข้ามร้าน)

```prisma
model Tenant {
  id           String   @id @default(cuid())
  name         String
  slug         String   @unique          // shark.in.th/s/{slug}
  plan         Plan     @default(FREE)
  status       TenantStatus @default(ACTIVE)
  enabledModules Json    // ["HOTEL","POS","BOOKING",...] เปิด/ปิดรายโมดูล
  customDomain  String? @unique           // เชื่อมโดเมนเอง (1,500฿/ปี)
  domainStatus  DomainStatus @default(NONE)
  createdAt    DateTime @default(now())
}
```

---

## 3. ผู้ใช้งาน 4 ระดับ + RBAC

| ระดับ | ขอบเขต | ตัวอย่างสิทธิ์ |
|---|---|---|
| **1. Admin (Platform)** | ทั้งแพลตฟอร์ม | ดูทุกร้าน, จัดการ tenant, เคสปัญหา, เปิด/ปิดโมดูล, billing |
| **2. ร้านค้า (Owner)** | ร้านตัวเอง (1 tenant) | ตั้งค่าร้าน, เชิญพนักงาน, เปิดใช้โมดูล, ดูรายงานทั้งหมด |
| **3. พนักงาน (Staff)** | ร้านตัวเอง ตาม role ที่ได้รับ | ทำงานเฉพาะโมดูล/สาขาที่ได้สิทธิ์ (เช่น แคชเชียร์ POS, แม่บ้าน Hotel) |
| **4. ลูกค้า (Customer)** | ข้ามร้านได้ (1 identity หลายร้าน) | จองคิว, สะสมแต้ม, ดูบัตรคิว, แชทกับร้าน |

**โมเดล Auth (Login ด้วยอีเมล — magic link / OTP, ไม่ต้องจำรหัส):**

```prisma
model User {            // identity เดียว ใช้ได้ทุกบทบาท
  id     String @id @default(cuid())
  email  String @unique
  name   String?
}

model Membership {      // ผูก user เข้ากับ tenant + role (many-to-many)
  id       String @id @default(cuid())
  userId   String
  tenantId String
  role     Role   // OWNER | STAFF
  permissions Json // สิทธิ์ละเอียดรายโมดูล/สาขา
  @@unique([userId, tenantId])
}

model PlatformUser {    // Admin แพลตฟอร์ม แยกจากร้านโดยสิ้นเชิง
  id String @id @default(cuid())
  email String @unique
  role  PlatformRole // SUPER_ADMIN | SUPPORT
}
```

- **Customer** = `User` ที่มี `CustomerProfile` ต่อร้าน (สะสมแต้ม/สมาชิกแยกต่อร้าน แต่ตัวตนเดียว)
- Login แบบ **passwordless email** (magic link + OTP fallback) ทั้ง 4 ระดับ — สอดคล้องโจทย์ "Login ด้วยอีเมล"
- RBAC layer เดียว ตรวจ 3 มิติ: `tenantId` (ร้านไหน) → `module` (โมดูลไหน) → `action` (ทำอะไรได้)

---

## 4. โครงสร้างโมดูล (Modular Monolith)

แต่ละโมดูลเป็น "แพ็ก" เปิด/ปิดได้ต่อร้าน (`Tenant.enabledModules`). โครงร่วมที่ทุกโมดูลใช้:
**Member · Point · Reward · Coupon · Chat · Account** เป็น **cross-cutting** (โมดูลอื่นเรียกใช้ได้) — ไม่ใช่ silo

```
โมดูลธุรกิจ (ขายของ/บริการ)      โมดูลแกนกลาง (ใช้ร่วม)
├─ Hotel                        ├─ Member  (CRM ลูกค้า)
├─ Restaurant / POS             ├─ Point   (แต้ม)
├─ Booking (นัดหมาย)            ├─ Reward  (แลกรางวัล)
├─ Q (บัตรคิว)                  ├─ Coupon & Voucher
└─ Ticket (อีเวนต์/ตั๋ว)         ├─ Account (บัญชี)
                                ├─ Chat    (แชทรวม)
เครื่องมือภายใน                  └─ Meeting (แชทองค์กร)
├─ Kanban
```

---

## 5. รายละเอียด 14 โมดูล

### ✅ 1. Hotel — ระบบโรงแรม
- ห้องพัก (RoomType, Room, สถานะ dirty/clean/OOO), ราคาแบบ rate plan/ฤดูกาล
- Booking engine: ปฏิทินห้องว่าง, จอง/เช็คอิน/เช็คเอาต์, walk-in
- Housekeeping board, folio/บิลห้อง → ผูก **Account** + **POS** (สั่งของขึ้นห้อง)
- Channel: หน้าจองสาธารณะบน storefront/custom domain
- เชื่อม **Member/Point**: ลูกค้าพักสะสมแต้ม

### ✅ 2. Restaurant / ร้านค้า
- เมนู/หมวด/ตัวเลือก (options, add-on), โต๊ะ (table map), floor plan
- รับออเดอร์: dine-in (QR โต๊ะ) / takeaway / delivery
- KDS (Kitchen Display) → ครัวเห็นออเดอร์ realtime
- ชำระเงินผ่าน **POS**, ตัดสต็อกวัตถุดิบ (inventory), ผูก **Account**

### ✅ 3. Booking — ระบบจองคิว (นัดหมาย)
สำหรับร้านตัดผม/ทำเล็บ/ทำผม/นวด/สปา/คลินิก
- Service catalog (บริการ + ระยะเวลา + ราคา), Staff/หมอ + ตารางเวลา (working hours, วันหยุด)
- Slot engine: ลูกค้าเลือกบริการ → ช่าง → เวลาว่าง → ยืนยัน (กันจองซ้ำด้วย transaction lock)
- แจ้งเตือน (email/LINE) ก่อนถึงคิว, no-show tracking
- หน้าจองบน custom domain, ผูก **Member/Point** (มาใช้บริการสะสมแต้ม)

### ✅ 4. Q — ระบบบัตรคิว
- ออกบัตรคิวจากหน้าร้าน/QR/ออนไลน์, จอแสดงคิว (call display TV)
- หลายจุดบริการ/เคาน์เตอร์ (counter), เรียกคิว/ข้าม/เลื่อน
- ลูกค้าดูสถานะคิวบนมือถือ (realtime), แจ้งเตือนใกล้ถึงคิว
- ต่างจาก Booking: Q = มาก่อนได้ก่อน (walk-in) · Booking = นัดล่วงหน้าตามเวลา

### ✅ 5. Ticket — ระบบตั๋ว/อีเวนต์
- สร้างอีเวนต์/รอบ, ประเภทตั๋ว + ราคา + โควตา
- ขายตั๋วออนไลน์ → QR ตั๋ว → สแกนเข้างาน (check-in scanner)
- ที่นั่ง (seatmap) แบบ optional, ผูก **Coupon** (ส่วนลดตั๋ว) + **Account**

### ✅ 6. Member — ระบบสมาชิก (CRM แกนกลาง)
- โปรไฟล์ลูกค้าต่อร้าน, tier (Silver/Gold/Platinum), ประวัติการใช้จ่าย/มาใช้บริการ
- บัตรสมาชิกดิจิทัล (QR/wallet pass), กลุ่ม/แท็ก สำหรับทำการตลาด
- เป็น "ฐาน" ให้ Point/Reward/Coupon ทำงาน

### ✅ 7. Reward — ระบบแลกรางวัล
- แคตตาล็อกของรางวัล (ใช้ Point แลก), เงื่อนไข tier, สต็อกรางวัล
- ประวัติการแลก, redeem ผ่าน QR ที่ร้าน

### ✅ 8. Coupon & Voucher
- สร้างคูปอง (%/บาท/แถม), voucher มูลค่าเงิน, โค้ด/QR, วันหมดอายุ, จำกัดจำนวน/ต่อคน
- ใช้ได้ข้ามโมดูล (POS/Booking/Hotel/Ticket), ติดตามการใช้งาน (attribution)

### ✅ 9. Point — ระบบแต้ม
- กติกาสะสม (ทุก x บาท = y แต้ม), แต้มหมดอายุ, ledger (earn/burn/adjust) ตรวจสอบได้
- Engine กลาง: ทุกโมดูลที่มีธุรกรรมยิง event เข้ามาบวกแต้มอัตโนมัติ

### ✅ 10. Chat — แชทรวม (ลูกค้า ↔ ร้าน)
- Inbox รวมทุกช่องทาง (webchat บน storefront + เชื่อม LINE/FB/IG ภายหลัง)
- มอบหมายพนักงาน, canned response, ผูกลูกค้ากับ Member profile
- realtime (WebSocket/SSE)

### ✅ 11. Meeting — แชทภายในองค์กร
- แชท/ห้อง/ช่องทีมงานภายในร้าน (แยกจาก Chat ลูกค้า)
- ประกาศ, แชร์ไฟล์, mention, (ต่อยอด: video/นัดประชุม + ปฏิทิน)

### ✅ 12. Account — ระบบบัญชี
- รับ-จ่าย, ใบเสร็จ/ใบกำกับภาษี, chart of accounts (basic), หมวดรายรับรายจ่าย
- รายงาน: ยอดขาย/กำไรขั้นต้น/ภาษี, รับข้อมูลอัตโนมัติจาก POS/Hotel/Ticket/Booking
- Export CSV/PDF, (ต่อยอด: เชื่อมโปรแกรมบัญชีไทย)

### ✅ 13. Kanban — บอร์ดงาน
- บอร์ด/คอลัมน์/การ์ด, มอบหมาย, due date, checklist, ป้ายสี
- ใช้จัดการงานภายในร้าน/โปรเจกต์ (คล้าย Trello) เชื่อมกับ Meeting/พนักงาน

### ✅ 14. POS — ระบบขายหน้าร้าน
- ตะกร้า/ชำระเงิน (เงินสด/โอน/QR PromptPay/บัตร), พิมพ์/ส่งใบเสร็จ
- สินค้า + สต็อก (inventory), หลายสาขา, กะ/เปิด-ปิดรอบ (shift, cash drawer)
- เป็น "จุดตัดเงิน" กลาง: Restaurant/Hotel/Ticket มาชำระผ่าน POS → ยิงเข้า Account + Point

---

## 6. Backoffice Admin (backoffice.shark.in.th)

- **จัดการร้าน (Tenants):** อนุมัติ/ระงับ, เปิด-ปิดโมดูลรายร้าน, ดู usage
- **ระบบเคส/ปัญหา (Support Desk):** ร้านแจ้งปัญหา/สอบถามการใช้งาน → ticketing ภายใน (สถานะ open/pending/resolved), มอบหมาย support, SLA
- **Custom domain:** ตรวจ/อนุมัติการเชื่อมโดเมน, สถานะ SSL
- **Billing (เตรียมไว้):** ตอนนี้ฟรี แต่วางโครง plan/invoice ไว้ (custom domain 1,500฿/ปี เก็บได้ก่อน)
- **Content/Announcement:** ประกาศระบบ, release note
- **Metrics:** จำนวนร้าน/โมดูลยอดนิยม/active

---

## 7. Custom Domain (บริการเสริม 1,500฿/ปี)

ขั้นตอนร้านนำโดเมนมาเชื่อม:
1. ร้านกรอกโดเมน (เช่น `shop.example.com`) ในตั้งค่า
2. ระบบให้ค่า DNS (CNAME → `cname.shark.in.th` หรือ A record)
3. ร้านตั้ง DNS → ระบบ verify + ออก SSL อัตโนมัติ (ผ่าน reverse proxy / Vercel domains / Caddy on-demand TLS)
4. Tenant resolver map `customDomain → tenantId` → เสิร์ฟ storefront ของร้านนั้น
5. Backoffice เห็นสถานะ, ตั้ง billing 1,500฿/ปี (ต่ออายุ)

รองรับได้ทั้ง: หน้าจอง (Booking/Hotel), หน้าเมนู/สั่งอาหาร, หน้าสมาชิก/แต้ม, ขายตั๋ว

---

## 8. Tech Stack ที่แนะนำ

| ชั้น | เลือกใช้ |
|---|---|
| Framework | **Next.js (App Router)** + TypeScript |
| UI | Tailwind + shadcn/ui (ปรับเป็น **B&W minimal**), Radix |
| i18n | `next-intl` (ไทย/อังกฤษ), เก็บ locale ต่อ user/tenant |
| DB | **PostgreSQL** + **Prisma** (row-level `tenantId`) |
| Auth | Passwordless email (magic link + OTP) — Auth.js/custom |
| Realtime | WebSocket/SSE (Chat, Q display, KDS) |
| ไฟล์/รูป | Object storage (S3-compatible / Bunny) |
| Payment | PromptPay QR + gateway (เตรียม Beam/Omise/Stripe) |
| Deploy | VPS (Docker) หรือ Vercel + managed Postgres |
| Proxy/SSL | Caddy/Nginx (on-demand TLS สำหรับ custom domain) |

**Design system:** Minimal Clean, Black & White — พื้นขาว, ตัวอักษรดำ, เส้น hairline, accent เดียว (เทา/ดำ), เว้นวรรคเยอะ, ไม่มี jargon, responsive mobile-first (mobile/tablet/desktop breakpoints).

---

## 9. โครงสร้างโค้ด (เสนอ)

```
app/
  (marketing)/            shark.in.th — landing, pricing, สมัคร
  (app)/                  dashboard ร้าน (owner+staff)
    hotel/ restaurant/ booking/ q/ ticket/ member/
    reward/ coupon/ point/ chat/ meeting/ account/ kanban/ pos/
    settings/ (domain, team, modules)
  (store)/                storefront ลูกค้า (custom domain / /s/[slug])
  (backoffice)/           backoffice.shark.in.th
  api/                    route handlers ต่อโมดูล
lib/
  tenant/                 resolver + prisma extension (tenantId inject)
  auth/  rbac/  i18n/
  modules/                business logic แยกโมดูล
prisma/schema.prisma
```

---

## 10. Roadmap แบ่งเฟส

**Phase 0 — Foundation (แกน)**
Auth email · Tenant + Membership + RBAC · Prisma tenant-isolation · i18n TH/EN · Design system B&W · Dashboard เปล่า + module toggle

**Phase 1 — Core Commerce**
POS (14) + Member (6) + Point (9) → เพราะเป็นแกนที่โมดูลอื่นเกาะ + Account (12) basic

**Phase 2 — Service Booking**
Booking (3) + Q (4) → กลุ่มร้านบริการ (ตัดผม/นวด/คลินิก) ได้ใช้เร็ว

**Phase 3 — Hospitality**
Hotel (1) + Restaurant (2) → เชื่อม POS/Account ที่มีแล้ว

**Phase 4 — Engagement**
Reward (7) + Coupon (8) + Ticket (5) → ต่อยอดจาก Point/Member

**Phase 5 — Communication & Ops**
Chat (10) + Meeting (11) + Kanban (13)

**Phase 6 — Platform polish**
Custom domain flow + SSL อัตโนมัติ · Backoffice support desk · Billing (เริ่มเก็บ custom domain 1,500฿/ปี)

> ลำดับยึดหลัก "แกนกลางก่อน (Member/Point/POS/Account) แล้วค่อยต่อโมดูลที่เกาะแกน" เพื่อไม่ต้องรื้อ

---

## 11. ความเสี่ยง/ข้อควรระวัง
- **Data isolation:** เทสต์ tenant leak ให้หนัก — 1 บั๊กใน middleware = ข้อมูลข้ามร้าน
- **Scope creep:** 14 โมดูลใหญ่มาก → ทำ MVP ต่อโมดูล อย่าทำครบทุกฟีเจอร์รอบเดียว
- **โมดูลแกนกลางต้องนิ่งก่อน** (Member/Point/Account/POS) เพราะโมดูลอื่นพึ่งพา
- **Custom domain + SSL** มี edge case เยอะ (DNS ผิด, cert ต่ออายุ) → ทำ Phase หลัง
- **Realtime** (Q/Chat/KDS) ต้องวางโครง connection ตั้งแต่ต้น เพื่อไม่ต้อง refactor
