# SHARK — พิมพ์เขียวชั้น Business Unit (หลายกิจการใน 1 ร้าน, Dashboard เดียว)

> เอกสาร handoff: ออกแบบโดย Fable 5 → ให้ Opus 4.8 พัฒนาต่อ
> อ่านคู่กับ `BLUEPRINT.md` (พิมพ์เขียวหลัก) — เอกสารนี้ **ขยายชั้นข้อมูลใหม่ระหว่าง Tenant กับโมดูล**
> สถานะ: DESIGN FINAL — พร้อมลงมือ Phase 0

---

## 0. โจทย์

ร้านสมัคร 1 บัญชี ต้องสร้าง "ระบบ" ได้มากกว่า 1 ชุด เช่น
- ระบบโรงแรม 2 โรงแรม (โรงแรม A หัวหิน, โรงแรม B เขาใหญ่)
- ร้านอาหาร 3 สาขา/แบรนด์
- ร้านนวด 1 ร้าน (ใช้ Booking)

ทั้งหมดบริหารจาก **dashboard เดียว** ไม่ต้อง logout/login สลับบัญชี

## 1. แนวคิดหลัก: เพิ่มชั้น `BusinessUnit`

ลำดับชั้นข้อมูลเปลี่ยนจาก 2 ชั้น → 3 ชั้น:

```
เดิม:   Tenant ──► ข้อมูลโมดูล (tenantId)

ใหม่:   Tenant (บัญชีร้าน/เจ้าของ 1 บัญชี = 1 องค์กร)
          └─► BusinessUnit (หน่วยธุรกิจ: โรงแรม A, โรงแรม B, ร้านอาหาร 1..3)
                └─► ข้อมูลโมดูลธุรกิจ (tenantId + unitId)
```

**นิยาม:** `BusinessUnit` = 1 กิจการ/สถานที่/แบรนด์ ที่ผูกกับโมดูลธุรกิจ 1 ประเภท
- 1 Tenant มีได้หลาย Unit, หลายประเภทปนกัน
- Unit ประเภท HOTEL → เปิดหน้าจอโมดูล Hotel · ประเภท RESTAURANT → โมดูล Restaurant + POS ฯลฯ

### กติกาแบ่ง scope ข้อมูล (สำคัญที่สุดของเอกสารนี้)

| ชั้น | อะไรอยู่ชั้นนี้ | เหตุผล |
|---|---|---|
| **Tenant-level (แชร์ทุก unit)** | User/Membership, **Member(ลูกค้า)**, **Point ledger**, Reward, Coupon, Chat inbox, Meeting, Kanban, การตั้งค่าองค์กร, billing, custom domain | ลูกค้า 1 คนสะสมแต้มข้ามทุกกิจการของร้าน (จุดขายของ SHARK) · ทีมงาน/แชท/บอร์ดงานเป็นเรื่ององค์กร |
| **Unit-level (แยกต่อ unit)** | Hotel(ห้อง/จอง/housekeeping), Restaurant(เมนู/โต๊ะ/ครัว), Booking(บริการ/ช่าง/ตาราง), Q(เคาน์เตอร์/คิว), Ticket(อีเวนต์), POS(สินค้า/สต็อก/กะ/เครื่อง), Account ledger รายหน่วย | แต่ละโรงแรม/ร้านมีห้อง เมนู ราคา สต็อก บัญชีของตัวเอง |
| **มุมมองรวม (aggregate)** | Dashboard overview, รายงาน Account รวมองค์กร (consolidated) | เจ้าของเห็นภาพรวมทุกกิจการในจอเดียว + เจาะรายหน่วยได้ |

> ⚠️ ห้ามเอา Member/Point ไปผูก unit — ถ้าผูก จะกลายเป็นลูกค้าแต้มแยกร้าน แลกข้ามไม่ได้ = เสียจุดขาย
> ธุรกรรมที่ "เกิดแต้ม" (POS/Booking/Hotel) บันทึก `unitId` ไว้ใน ledger เพื่อรายงานได้ว่าแต้มมาจากหน่วยไหน

## 2. Data Model (Prisma)

```prisma
enum UnitType { HOTEL RESTAURANT BOOKING QUEUE TICKET SHOP }
// SHOP = ร้านค้าทั่วไปที่ใช้ POS เดี่ยวๆ

model BusinessUnit {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  type      UnitType
  name      String                    // "โรงแรมบ้านทะเล หัวหิน"
  slug      String                    // หัวหิน → storefront path
  status    UnitStatus @default(ACTIVE) // ACTIVE | PAUSED | ARCHIVED
  settings  Json       @default("{}")   // โลโก้, ที่อยู่, เวลาเปิด, ภาษี ต่อหน่วย
  sortOrder Int        @default(0)
  createdAt DateTime   @default(now())

  @@unique([tenantId, slug])
  @@index([tenantId, type])
}
```

**กติกาเหล็กเพิ่มจากเดิม:**
1. ตารางโมดูลธุรกิจทุกตาราง มี **ทั้ง `tenantId` และ `unitId`** (tenantId คงไว้เพื่อ isolation-guard ชั้นเดียวจบ + query รวมองค์กรเร็ว)
2. unique ภายในหน่วย = `@@unique([unitId, ...])` เช่น เลขห้อง, ชื่อโต๊ะ · unique ระดับองค์กร = `@@unique([tenantId, ...])`
3. Prisma extension เดิม (inject tenantId) เพิ่ม guard: ถ้า model อยู่ในกลุ่ม unit-scoped และ query ไม่ระบุ `unitId` → throw ใน dev (กันลืม)

ตัวอย่างตารางโมดูล:

```prisma
model HotelRoom {
  id       String @id @default(cuid())
  tenantId String
  unitId   String   // ← โรงแรมไหน
  number   String
  // ...
  @@unique([unitId, number])
  @@index([tenantId])
}

model PointLedger {          // tenant-level แต่ tag ที่มาของแต้ม
  id       String @id @default(cuid())
  tenantId String
  memberId String
  unitId   String?  // ธุรกรรมนี้เกิดที่หน่วยไหน (nullable: adjust โดย admin)
  delta    Int      // + earn / - burn
  reason   String
  // ...
}
```

### โมดูลไหนใช้ตารางแบบไหน (mapping สำหรับ Opus 4.8)

| โมดูล | scope | หมายเหตุ |
|---|---|---|
| Hotel, Restaurant, Booking, Q, Ticket, POS | **unit** | ทุกตารางมี unitId |
| Account | **unit ledger + tenant view** | สมุดบัญชีแยกหน่วย, รายงาน consolidated รวมที่ชั้น query ไม่ใช่ชั้นข้อมูล |
| Member, Point, Reward, Coupon | **tenant** | Coupon ตั้งเงื่อนไข "ใช้ได้เฉพาะบางหน่วย" ผ่าน `applicableUnitIds Json?` |
| Chat | **tenant** inbox เดียว | ข้อความ tag `unitId?` ตามช่องทางที่ลูกค้าทักเข้ามา (เช่น ทักจากหน้าโรงแรม A) |
| Meeting, Kanban | **tenant** | เครื่องมือองค์กร — บอร์ด/ห้องอาจ link ไป unit ได้ (`unitId?` optional) |

## 3. สิทธิ์พนักงานรายหน่วย (RBAC 4 มิติ)

จากเดิม 3 มิติ (tenant → module → action) เพิ่ม **unit**:

```
ตรวจสิทธิ์: tenantId → unitId → module → action
```

```prisma
model Membership {
  // ...เดิม
  role        Role  // OWNER | MANAGER | STAFF
  unitAccess  Json  // ["*"] = ทุกหน่วย  |  ["unit_a","unit_b"] = เฉพาะหน่วย
  permissions Json  // สิทธิ์รายโมดูล/action (เดิม)
}
```

- **OWNER** = `["*"]` เสมอ (ทุกหน่วย ทุกโมดูล)
- **MANAGER** (role ใหม่ — คุ้มบางหน่วย): เช่น ผู้จัดการโรงแรม A เห็นเฉพาะโรงแรม A เต็มสิทธิ์
- **STAFF**: เฉพาะหน่วย + เฉพาะโมดูล เช่น แคชเชียร์ POS ร้านอาหารสาขา 2
- ฟังก์ชันกลาง `can(user, { tenantId, unitId, module, action })` — จุดตรวจเดียว ใช้ทั้ง API และ UI (ซ่อนเมนู)
- ข้อมูล tenant-level (Member/Point/Chat): ตรวจแค่ 3 มิติเดิม (ข้าม unit) แต่ action ที่แก้แต้ม/แลกรางวัลหน้างานให้ tag unitId ปัจจุบันลง ledger
- **ข้อยกเว้น Kanban (ตัดสินใน QC — RESOLUTIONS D17):** สิทธิ์บอร์ดมาจาก **board membership เท่านั้น** — MANAGER ของ unit **ไม่ได้**สิทธิ์บอร์ดที่ link unit นั้นโดยอัตโนมัติ (unitAccess ไม่ propagate เข้าบอร์ด — ต้องถูกเชิญเข้าบอร์ดเหมือนสมาชิกคนอื่น)

## 4. Dashboard เดียว + Unit Switcher (UX)

### โครงหน้าจอ `(app)`

```
┌────────────────────────────────────────────────────────┐
│ ☰  SHARK   [🏢 ทุกกิจการ ▾]              🔔  EN/TH  👤 │ ← Topbar: Unit Switcher
├──────────────┬─────────────────────────────────────────┤
│ ภาพรวม        │                                         │
│ ─────────    │        เนื้อหาตาม context ที่เลือก         │
│ 🏨 โรงแรม A   │                                         │
│ 🏨 โรงแรม B   │   "ทุกกิจการ"  → Overview รวม (การ์ด KPI  │
│ 🍜 ร้าน 1     │     ต่อหน่วย + ยอดรวม + แจ้งเตือน)        │
│ 🍜 ร้าน 2     │   เลือกหน่วย → sidebar เปลี่ยนเป็นเมนู     │
│ 🍜 ร้าน 3     │     โมดูลของหน่วยนั้น (ห้องพัก/เมนู/คิว)   │
│ ─────────    │                                         │
│ 👥 สมาชิก/แต้ม │  ← โซน tenant-level เห็นตลอด ไม่ขึ้นกับ   │
│ 🎟 คูปอง      │     หน่วยที่เลือก                         │
│ 💬 แชท       │                                         │
│ 📋 Kanban    │                                         │
│ ⚙️ ตั้งค่า     │                                         │
│ ＋ เพิ่มกิจการ │                                         │
└──────────────┴─────────────────────────────────────────┘
```

หลักการ:
1. **Unit Switcher** ที่ topbar (ค่า: "ทุกกิจการ" หรือหน่วยใดหน่วยหนึ่ง) — สลับแล้ว **ไม่ reload ทั้งแอป** แค่เปลี่ยน route context
2. Sidebar แบ่ง 3 โซนถาวร: (ก) รายชื่อหน่วย (ข) เมนู tenant-level (สมาชิก/แต้ม/คูปอง/แชท/บัญชีรวม/Kanban) (ค) ตั้งค่า + ปุ่ม "เพิ่มกิจการ"
3. Staff ที่มีสิทธิ์หน่วยเดียว: switcher ล็อกหน่วยนั้น, ซ่อนหน่วยอื่น, ซ่อนเมนู tenant-level ที่ไม่มีสิทธิ์
4. มือถือ: switcher เป็น bottom-sheet, sidebar เป็น drawer — B&W minimal ตาม design system เดิม

### URL structure (สำคัญ — ให้ลิงก์แชร์/bookmark ได้ และกัน state หลุด)

```
/app                              → Overview ทุกกิจการ
/app/u/[unitSlug]                 → หน้าแรกของหน่วย (KPI หน่วยนั้น)
/app/u/[unitSlug]/hotel/rooms     → โมดูลของหน่วย
/app/u/[unitSlug]/pos/sale        → POS หน่วยนั้น
/app/members                      → tenant-level (ไม่มี /u/)
/app/coupons  /app/chat  /app/kanban  /app/account   → tenant-level
/app/account/u/[unitSlug]         → บัญชีเจาะรายหน่วย
/app/settings/units               → จัดการกิจการ (สร้าง/พัก/เก็บถาวร)
```

- unit ปัจจุบัน = **อยู่ใน URL เสมอ** (ไม่เก็บใน cookie อย่างเดียว) → refresh/แชร์ลิงก์ไม่หลง unit, กันบั๊กยิง API ผิดหน่วย
- ทุก API route ของ unit-scoped: `/api/u/[unitId]/...` → middleware ตรวจ `unitId ∈ tenant + สิทธิ์` ก่อนเข้า handler

### หน้า Overview "ทุกกิจการ" (ค่า default ของ OWNER)

- การ์ดต่อหน่วย: ชื่อ + ประเภท + KPI วันนี้ (โรงแรม: occupancy/เช็คอิน · ร้านอาหาร: ยอดขาย/ออเดอร์ · Booking: คิววันนี้/no-show)
- แถบรวมบน: ยอดขายรวมวันนี้ · สมาชิกใหม่ · แต้ม earn/burn · แชทค้างตอบ
- คลิกการ์ด → เข้า `/app/u/[unitSlug]`

## 5. Flow การสร้างหน่วยธุรกิจ

### ตอน onboarding (สมัครใหม่)
1. ยืนยันอีเมล → ตั้งชื่อองค์กร (Tenant) 
2. "เริ่มกิจการแรกของคุณ" → เลือกประเภท (การ์ด 6 ใบ: โรงแรม/ร้านอาหาร/จองคิว/บัตรคิว/ตั๋ว/ร้านค้า POS) → ตั้งชื่อ+slug → สร้าง `BusinessUnit` แรก
3. เข้า dashboard ที่หน่วยนั้นทันที พร้อม checklist ตั้งต้นตามประเภท (เช่น โรงแรม: "เพิ่มประเภทห้อง → เพิ่มห้อง → ตั้งราคา")

### เพิ่มหน่วยภายหลัง
- ปุ่ม "＋ เพิ่มกิจการ" ใน sidebar / หน้า `settings/units` → wizard เดียวกับข้อ 2
- จำกัดเบื้องต้น (ช่วงฟรี): **5 หน่วย/tenant** (soft limit, config ได้ที่ `Tenant.limits Json`) — กัน abuse, เผื่อเป็น upsell ภายหลัง
- พัก (PAUSED: ซ่อนจาก storefront, ข้อมูลอยู่ครบ) / เก็บถาวร (ARCHIVED: read-only) — **ไม่มี hard delete** ช่วงแรก

## 6. Storefront + Custom Domain กับหลายหน่วย

```
shark.in.th/s/[tenantSlug]                 → หน้ารวมองค์กร (list ทุกหน่วย ACTIVE)
shark.in.th/s/[tenantSlug]/[unitSlug]      → หน้าหน่วย (จองห้อง/ดูเมนู/จองคิว)

custom domain (1,500฿/ปี — ผูกระดับ tenant):
  shop.example.com          → หน้ารวมองค์กร
  shop.example.com/[unitSlug] → หน้าหน่วย
```

- ลูกค้า login ครั้งเดียว เห็นแต้ม/สมาชิกร่วมทุกหน่วยขององค์กร (ตรง scope tenant-level)
- เผื่ออนาคต: `BusinessUnit.customDomain?` ต่อโดเมนรายหน่วย (ขายเพิ่มอีก 1,500฿/ปี/หน่วย) — วาง schema รองรับแต่**ยังไม่ทำ** Phase แรก

## 7. ผลกระทบต่อ Roadmap เดิม

Phase 0 (Foundation) เพิ่มงาน:
- [ ] ตาราง `BusinessUnit` + enum + limits
- [ ] Prisma extension: guard `unitId` สำหรับ model กลุ่ม unit-scoped
- [ ] RBAC 4 มิติ (`unitAccess`) + ฟังก์ชัน `can()` กลาง
- [ ] Layout `(app)`: sidebar 3 โซน + Unit Switcher + URL scheme `/app/u/[unitSlug]/...`
- [ ] Onboarding wizard สร้างหน่วยแรก + หน้า `settings/units` + ปุ่มเพิ่มกิจการ
- [ ] หน้า Overview "ทุกกิจการ" (การ์ด KPI ต่อหน่วย — ช่วงแรก mock KPI จนกว่าโมดูลจริงมา)

Phase 1+ (โมดูล): ทุกโมดูลธุรกิจสร้างตารางแบบ `tenantId + unitId` ตาม mapping ข้อ 2 — **ไม่มีการ migrate ย้อนหลัง เพราะวางชั้นนี้ก่อนเขียนโมดูล** (นี่คือเหตุผลที่ต้องออกแบบตอนนี้)

## 8. Edge cases ที่ Opus 4.8 ต้องระวังตอน implement

1. **Query ข้ามหน่วยโดยไม่ตั้งใจ** — dev-mode guard ใน Prisma extension ต้อง throw เมื่อ unit-scoped model ถูก query โดยไม่มี unitId (ยกเว้น flag `crossUnit: true` ที่ใช้เฉพาะรายงานรวม)
2. **สลับ unit กลาง flow** — ทุก mutation ต้องอ่าน unitId จาก URL/payload ที่ตรวจแล้ว ไม่อ่านจาก client state ลอยๆ
3. **เชิญพนักงานก่อนมีหน่วย** — ได้ (unitAccess ว่าง) แต่ UI ต้องบอกชัดว่า "ยังไม่ได้รับมอบหมายกิจการ"
4. **ลบ/พักหน่วยที่มีธุรกรรมค้าง** (จองล่วงหน้า, คิววันนี้) — PAUSED ต้อง block การจองใหม่แต่ honor ของเดิม + แจ้งเตือนเจ้าของก่อนพัก
5. **slug ชนหลังเปลี่ยนชื่อ** — slug immutable หลังสร้าง (เปลี่ยนได้เฉพาะ display name) ช่วงแรก เลี่ยง redirect chain
6. **Point/Coupon ที่จำกัดหน่วย** — ตอน redeem ตรวจ `applicableUnitIds` เทียบ unitId ณ จุดใช้เสมอ

## 9. สรุปสำหรับ Opus 4.8 (TL;DR ก่อนเริ่มโค้ด)

1. เพิ่มชั้น `BusinessUnit` ระหว่าง Tenant กับโมดูลธุรกิจ — ออกแบบแล้ว ห้ามยุบ
2. scope: ธุรกิจ=unit · Member/Point/Reward/Coupon/Chat/Meeting/Kanban=tenant · Account=unit ledger+tenant view
3. RBAC 4 มิติ: tenant → unit → module → action ผ่าน `can()` เดียว
4. Dashboard เดียว: Unit Switcher + sidebar 3 โซน + unit อยู่ใน URL เสมอ (`/app/u/[unitSlug]/...`)
5. เริ่มที่ Phase 0 checklist ข้อ 7 — วางชั้นนี้ให้เสร็จก่อนเขียนโมดูลใดๆ
