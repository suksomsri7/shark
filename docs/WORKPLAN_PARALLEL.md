# SHARK — แผนพัฒนาแบบขนาน (1 Session = 1 โมดูล)

> เป้าหมาย: เจ้าของโปรเจกต์เปิดหลาย session พร้อมกัน สั่งงาน/ตรวจ/อัปเดตแต่ละระบบได้อิสระ
> เงื่อนไข: **แกนกลาง (CORE) ต้องเสร็จและ freeze ก่อน** จึงจะแตกขนานได้ปลอดภัย

---

> ⚠️ **UPDATE หลัง QC (2026-07-11):** Stage A ฉบับจริง = **checklist 47 รายการใน `qc/QC4-core-platform.md` §ข** แบ่ง A1 → A2a (block Stage B) → A2b (block Stage C+BO, ทำขนานกับ B ได้) → A3 · ปล่อย Stage B หลัง A1+A2a+A3 · Gate ใช้ v2 12 ข้อใน QC4 · Backoffice(15) = Stage D · การตัดสินข้อขัดทั้งหมดอยู่ `qc/RESOLUTIONS.md` — โครงด้านล่างคงไว้เป็นภาพรวม

## 1. ลำดับใหญ่: CORE ก่อน → แล้วขนาน

```
STAGE A — CORE (ทำใน session เดียว ห้ามขนาน)
  A1 Foundation: schema แกน (Tenant/User/Membership/BusinessUnit),
     auth email, RBAC can() 4 มิติ, Prisma tenant+unit guard,
     i18n TH/EN, design system B&W, dashboard shell + Unit Switcher,
     onboarding สร้างกิจการแรก, settings/units, เชิญพนักงาน
  A2 Platform services: AuditLog, notify() (2.5), SSE hub, cron runner,
     object storage (รูป), Tenant.limits
  A3 Contract stubs: อินเทอร์เฟซ + mock ของ createSale / point.earn /
     coupon.validate+redeem / account.post → โมดูลธุรกิจ dev ได้โดยไม่รอของจริง
  ✔ Definition of Done: มี CORE_API.md สรุปทุก service ที่เรียกได้จริง + ตัวอย่างเรียก

STAGE B — CORE MODULES (ขนานกันเองได้ 4 session — เพราะเป็นเจ้าของ contract)
  B1 POS (14)      → implement createSale จริงแทน stub
  B2 Member (06)   → CustomerProfile + service findOrCreate
  B3 Point (09)    → ledger + point.earn/burn จริง
  B4 Account (12)  → account.post จริง
  (Coupon (08) ต่อท้าย B1 ได้เลย)

STAGE C — โมดูลธุรกิจ (ขนานเต็มที่ 1 session/โมดูล)
  Hotel · Restaurant · Booking · Q · Ticket · Reward · Chat · Meeting · Kanban
  ทุกตัวเรียก contract ผ่าน interface เดิม — สลับจาก stub เป็นของจริงอัตโนมัติ
```

## 2. โครงโค้ดที่ทำให้ขนานแล้วไม่ชนกัน (สำคัญที่สุด)

**หลัก: 1 โมดูล = 1 โฟลเดอร์ ทุกชั้น** — session ของโมดูลไหนแตะได้เฉพาะโฟลเดอร์ตัวเอง

```
prisma/schema/
  core.prisma            ← CORE เท่านั้นแก้ได้
  hotel.prisma           ← session Hotel แก้ได้ไฟล์นี้ไฟล์เดียว
  restaurant.prisma      (ใช้ prismaSchemaFolder — Prisma multi-file)
  ...ต่อโมดูล
lib/core/                ← FREEZE หลัง Stage A (auth/rbac/tenant/notify/audit/sse)
lib/contracts/           ← interface + stub กลาง — แก้ผ่าน "คำขอเปลี่ยน contract" เท่านั้น
lib/modules/<module>/    ← business logic ของโมดูล
app/(app)/u/[unitSlug]/<module>/   ← UI unit-scoped
app/(app)/<module>/                ← UI tenant-scoped (member/point/chat/...)
app/api/u/[unitId]/<module>/       ← API unit-scoped
app/api/<module>/                  ← API tenant-scoped
app/(store)/s/[tenantSlug]/[unitSlug]/<module>/  ← storefront
messages/<locale>/<module>.json    ← i18n แยกไฟล์ต่อโมดูล (กันชนกัน)
docs/modules/NN-<module>.md        ← สเปค (source of truth ของ session นั้น)
```

## 3. กติกาเหล็กของทุก session โมดูล

1. **ห้ามแก้** `lib/core/`, `lib/contracts/`, `core.prisma`, ไฟล์ของโมดูลอื่น
2. อยากเปลี่ยน contract กลาง → เขียนคำขอที่ `docs/contract-changes/NNN-<เรื่อง>.md` แล้ว**หยุดรอ** ให้ session CORE อนุมัติ+แก้ (กัน 2 โมดูลแก้ contract ขัดกัน)
3. Migration: additive-only + แตะเฉพาะตารางโมดูลตัวเอง ตั้งชื่อ `NN_<module>_<desc>`
4. เริ่ม session ให้อ่านตามลำดับ: `_CONVENTIONS.md` → `CORE_API.md` → สเปคโมดูลตัวเอง (`NN-<module>.md`) → `PROGRESS.md` ของโมดูล
5. จบ session ให้อัปเดต `docs/progress/<module>.md` (ทำอะไรไป/ค้างอะไร/blocked อะไร) — ให้ session ถัดไปของโมดูลนั้นต่อได้ทันที
6. เทสก่อนบอกเสร็จ: `pnpm check <module>` (typecheck + lint + test เฉพาะ scope โมดูล) + เทส 2-tenant/2-unit isolation

## 4. Git & DB ตอนขนาน

- **Branch ต่อโมดูล:** `module/hotel`, `module/pos`, … merge เข้า `main` เมื่อผ่าน checklist (สเปคข้อ 12 ของโมดูลนั้น)
- ชนกันแทบเป็นศูนย์เพราะโฟลเดอร์แยก — จุดชนเดียวคือ migration ordering → rebase แล้ว `prisma migrate dev` ใหม่
- **Dev DB เดียว** (Postgres local) ทุก branch ใช้ร่วม — migration additive จึงอยู่ร่วมกันได้
- ทางเลือกเสริม: `git worktree` ต่อโมดูล (แต่ละ session อยู่คนละโฟลเดอร์จริง ไม่แย่ง working tree)

## 5. วิธีทำงานของเจ้าของ (ผู้ใช้)

- เปิด Claude Code หลายหน้าต่าง/หลาย tmux — สั่งแต่ละอันว่า *"ทำโมดูล <ชื่อ> ตามสเปค + WORKPLAN_PARALLEL"*
- memory จะมี tracker ต่อโมดูล (`project_shark_in_th_<module>`) เมื่อเริ่มโมดูลนั้นจริง — ตรวจ/สั่ง/อัปเดตอิสระต่อกัน
- อยากรู้ภาพรวม → ถามที่ session ไหนก็ได้ว่า "สถานะ SHARK ทุกโมดูล" (อ่านจาก `docs/progress/*.md`)

## 6. เกณฑ์ "CORE เสร็จ" ก่อนอนุญาตแตกขนาน (gate)

- [ ] สมัคร→ยืนยันอีเมล→สร้างองค์กร→สร้างกิจการแรก→เข้า dashboard ครบ loop บนเครื่องจริง
- [ ] Unit Switcher + URL scheme `/app/u/[unitSlug]/` ทำงาน
- [ ] `can()` 4 มิติ + Prisma guard มีเทส isolation ผ่าน (2 tenants × 2 units)
- [ ] เชิญพนักงาน + จำกัด unitAccess ทำงาน
- [ ] contract stubs ครบ 6 ตัว + `CORE_API.md` เผยแพร่
- [ ] i18n TH/EN + design tokens B&W ใช้ได้ทุกหน้า shell
