# ใบสั่ง D.5 — ผู้เช่า · สัญญา · เงินประกัน · ตรวจ **เข้ม** (กฎหมาย สคบ. · เงิน · ข้อมูลข้ามร้าน)

> แหล่งความจริง: `ledger/SVC-MASTER-PLAN.md` แถว D.5 · `ledger/DESIGN-DORM-HOTEL.md` §3 (ประกัน+ล่วงหน้า ≤ 3 เดือน/≤ 1 ปี) · A2 · ภาคผนวก ก หอ #6 #40–52 · ภาพ `ledger/design-dorm/02-tenants.png` (+ README "ห้อง 204 ณัฐชา" · "อาคาร 36 ห้อง ณ 3 พ.ย." · ประกันถือ ฿296,400) · CC §5.3 (`claimRoom`) §6.2 §7 (`dorm.lease.signed`) §8 (`dorm.lease.manage`) + ภาคต่อ 28 ต.ค. (override กฎหมายต้องมีขั้น OWNER) · ใบสั่ง D.1 (ตัวตรวจกฎหมาย · `SNAPSHOT_KEYS.lease`) · ใบสั่ง D.2 §3.4 + §3.6 F1–F9 (`postSecurityDeposit` บังคับ `partyId` · คีย์กันซ้ำระดับร้าน) · หนี้ `/root/svc-runs/fix/d2.md` (เรียกเงินหอทีละรายการ ห้าม `Promise.all`) · `ledger/wo-notes/svc-r0.8-carry.md` (D.5: สัญญาไม่มีวันจบ · ค่าที่ล็อกอ่านจาก snapshot · สคริปต์ล้างลบแถวหอก่อน `hotelRoom`)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-d.5.mts» (110 ข้อ หลัง ORACLE-EDIT 29 ต.ค. §3.10 · positive control PC-1…PC-8 + Z-1 — **ต้องคงเขียว**) — รับใบ = **ผ่านทุกข้อ** · SKIP ที่ยอมได้ระหว่างทำ = V-1 (ไม่มี QC_BASE) · Q-* (ร้าน svcqc ยังไม่ seed) · G-* เมื่อต่อท้าย `--no-regression` (iso.sh ทิ้ง env) — ผู้คุมรันครบก่อนรับ
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.5.mts [--no-regression]` (ห้ามครอบ timeout · ห้าม kill กลางคัน — ล้างข้อมูลอยู่ใน finally · ข้อพร้อมกันยิงจาก **4 โพรเซสแยก × 3 คำขอ** ผ่าน `--child`)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/แตะ `prisma/schema`** · ทำในเลน l2 · temp ขึ้นต้น `svc-d5-` · รายงานต่อข้อ (id → ผล)
> คอลัมน์ที่ใช้มีครบใน D.0 แล้ว (`DormLease.*` ทุกคอลัมน์ · `DormMeterReading.kind MOVE_IN` + `leaseId`) — **ขาดอะไร = หยุดถามผู้คุม ห้ามเพิ่มคอลัมน์** · รูปทรง JSON ที่ใบนี้เคาะ §2.4

## 1. ไฟล์ของใบ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| «src/lib/modules/dorm/lease.ts» | ใหม่ | service ผู้เช่า/สัญญา/ประกัน §3 — เขียน/อ่านผ่าน `tenantDb({tenantId, unitId})` + `$transaction` ของมัน (**ห้าม** `import { prisma } from "@/lib/core/db"` — F5.1) |
| «src/lib/modules/dorm/lease-access.ts» | ใหม่ | `leaseAccess(m, unitId)` §5 (pure · import ได้แค่ `@/lib/core/rbac`) |
| «src/lib/modules/dorm/index.ts» | ใหม่ถ้ายังไม่มี / มีแล้ว = **เพิ่มบรรทัด export ต่อท้าย** | export ชื่อ §3 §5 + type `LeaseCtx` `LeaseDetail` `LeaseRow` `LeaseTab` `LeaseList` · (D.6 อยู่เลน l3 สร้างไฟล์นี้เหมือนกัน — **ห้ามลบ/แก้บรรทัดของใบอื่น** ผู้คุมรวมตอน merge) |
| «src/components/dorm/TenantsScreen.tsx» | ใหม่ | จอ หอ 02 §7 (render ได้ด้วย `renderToStaticMarkup` · ไม่ import โมดูล server) |
| «src/app/app/u/[unitSlug]/dorm/tenants/page.tsx» | ใหม่ | หน้า 02 (server) §7 |
| «src/app/app/u/[unitSlug]/dorm/tenants/new/page.tsx» | ใหม่ | ฟอร์มทำสัญญาใหม่ (หาผู้เช่าซ้ำ → สัญญา → รับเงินจอง → รูป/บัตร → ลงชื่อ → เข้าอยู่) — ไม่มีภาพแบบ ตรวจแค่ด่าน/ใช้ facade |
| «src/app/app/u/[unitSlug]/dorm/tenants/[leaseId]/print/page.tsx» | ใหม่ | หน้าพิมพ์สัญญา (HTML + `window.print` = "พิมพ์ PDF" · ไม่มีไลบรารี PDF ในโปรเจกต์) จาก `leaseContract` |
| «src/app/app/u/[unitSlug]/dorm/tenants/actions.ts» | ใหม่ | `"use server"` §7 |
| `src/lib/modules/account/index.ts` | แก้ (additive · อ่านอย่างเดียว) | `securityDepositReceipts` §3.9 — ห้ามแตะฟังก์ชันเดิม (regression `qc-svc-d.2`) |
| `src/lib/core/settings/defs/rooms.ts` | แก้ 1 จุด | **เพิ่ม** คีย์ใน `SNAPSHOTS.lease` 4 ตัว: `rooms.lease.contractTemplate` · `rooms.lease.extraClauses` · `rooms.lease.moveInPhotosMin` · `rooms.lease.reservationAppliesTo` (+ คอมเมนต์ `// SVC D.5`) — ห้ามลบ/ย้ายคีย์เดิม (D.1 ตรวจ "includes") |
| `src/lib/core/permissions.ts` | แก้ | โมดูล `dorm` (ป้าย "หอพัก" · group เดียวกับ hotel) + คีย์ `dorm.lease.manage` "จัดการผู้เช่าและสัญญา" — ถ้าเลนมีบล็อก `dorm` ของ D.6 แล้ว = เพิ่มบรรทัดเดียว · ยังไม่มี = สร้างบล็อกที่มีแค่คีย์นี้ (ผู้คุมรวมตอน merge) · ห้ามเพิ่มคีย์หออื่น |
| `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` | แก้ | event `dorm.lease.signed` (consumer `withAutomation(async () => {})` แบบ `rooms.occupancy.changed` · ป้ายไทย) — `webhooks/labels.ts` ได้จาก spread (ห้ามซ้ำ) |
| `src/lib/modules/approval/labels.ts` · `src/lib/modules/approval/actions.ts` | แก้ 1 บรรทัดต่อไฟล์ | entityType `dorm.lease.legal_override` (ป้าย "ข้ามคำเตือนกฎหมายในสัญญาเช่า" · allowlist สร้างสายอนุมัติ) — **ไม่ต้องมีกิ่งใน approval-effects** (สัญญาอ่านสถานะคำขอเองตอนลงชื่อ/เข้าอยู่) |
| `scripts/fitness.mts` | แก้ | `ALLOWED_EDGES` ที่ใช้จริง (คาด `"dorm→rooms"` · `"dorm→party"` · `"dorm→approval"` — `dorm→account` มีแล้ว) + คอมเมนต์ขึ้นต้น `// SVC D.5` ภายใน 3 บรรทัดเหนือ · ห้ามแตะอย่างอื่น |
| «scripts/svc-qc-lease-scene.mts» | ใหม่ | ฉากภาพ §8 |

ห้าม: migration · แตะ `rooms/*` `party/*` `approval/service.ts` `account/service.ts|gl.ts` (ใช้ facade) · `any` · `getDay()/getDate()/getMonth()` ดิบ (ใช้ `bkkYmd` / เลขข้อความ `YYYY-MM-DD`) · คิดบิล/ค่าน้ำไฟ (D.8) · ต่อสัญญา/ย้ายห้อง/ย้ายออก/คืนประกัน (D.12 — ปุ่มในจอเป็นลิงก์/ปิดไว้) · ผูก LINE (D.9) · เรียกฟังก์ชันเงินหอแบบ `Promise.all` (หนี้ D.2 N2: ล็อกระดับร้าน — เรียกทีละรายการ)

## 2. ศัพท์ · กติกา
### 2.1 สถานะสัญญา (CHECK ของ D.0)
`DRAFT` (ทำสัญญาแล้ว ห้องถูกกันแล้ว · ยังไม่เข้าอยู่ = แท็บ "จอง/รอเข้า") → `ACTIVE` (เข้าอยู่ · รับประกันครบ) → `NOTICE` / `ENDED` (D.12) · `CANCELLED` (ยกเลิกก่อนเข้าอยู่เท่านั้น)
### 2.2 ระยะ · ห้อง (ปิดหนี้ r0.8-carry "สัญญาไม่มีวันจบ")
- **ใบนี้รองรับเฉพาะสัญญามีกำหนด** (`termType "FIXED"` · `months` จำนวนเต็ม 1–360) — สัญญาไม่มีวันจบ = หนี้ D.12 (`endDate` null ใช้ไม่ได้กับ `RoomOccupancy`)
- `endDate` (คอลัมน์) = **วันสุดท้ายที่อยู่ได้ (รวมวันนั้น)** = (`startDate` + `months` เดือน · วันเดียวกันของเดือน · เกินสิ้นเดือน ⇒ วันสุดท้ายของเดือน) − 1 วัน — เช่น 1 พ.ค. +12 ⇒ 30 เม.ย. · 15 ส.ค. +6 ⇒ 14 ก.พ. · 31 ม.ค. +1 ⇒ 27/28 ก.พ.
- occupancy: `claimRoom(tx, { kind: "LEASE", refType: "DormLease", refId: leaseId, start: startDate, end: endDate + 1 วัน (exclusive), requireRentMode: "MONTHLY" })` **ตอน `createLease` ใน tx เดียวกับแถวสัญญา** (สัญญาร่างกันห้องแล้ว — ห้องว่าง/ถูกจองตัดสินที่ฐานด้วย EXCLUDE ของ R0.8) · `DormLease.occupancyId` = แถวนั้น · ยกเลิกร่าง ⇒ `releaseOccupancy`
- ประเภท `leaseKind(months)` ของ D.1 (≤ 36 = SHORT · ≤ 360 = LONG)
### 2.3 ค่าตั้ง · snapshot
- `policySnapshot` = `snapshotPolicy({tenantId}, "lease", { unitId, roomTypeId, roomId })` **ตอน `createLease`** แล้วไม่เปลี่ยนอีก (แก้ค่าตั้งภายหลัง ⇒ สัญญาเดิมเหมือนเดิมทุกไบต์) · ทุกค่าที่ "ล็อกในสัญญา" อ่านจาก snapshot (`fromSnapshot`) ไม่ใช่ resolver — รวม `rooms.lease.moveInPhotosMin` ตอน `moveIn` · แม่แบบ/ข้อเพิ่มตอน render สัญญา
- ค่าเริ่มเมื่อไม่ส่ง: `rentSatang` = `rooms.rent.monthly` (refs unit/roomType/room) ?? `HotelRoomType.monthlyRateSatang` ?? ⇒ `RENT_REQUIRED` · `depositSatang` = `rooms.deposit.months` × ค่าห้อง · `advanceRentSatang` = `rooms.lease.advanceMonths` × ค่าห้อง · `bookingFeeSatang` = min(`rooms.lease.reservationMonths` × ค่าห้อง, ประกัน) · `commonFeeSatang` = 0 (ส่วนกลาง = บรรทัดของ D.8 · catalog อยู่ใน snapshot)
- โหมดกฎหมาย = `rooms.legal.mode` + `rooms.legal.outOfScopeReason` ของหน่วย อ่าน **สดทุกคำขอ** (ไม่แคช)
### 2.4 รูปทรง JSON ที่ใบนี้เคาะ (ไม่มี migration)
- `coTenants` = `{ occupants: { name: string; phone: string | null }[]; vehicles: { plate: string; kind: "CAR" | "MOTORBIKE" | "OTHER"; note: string | null }[] }` · เพดาน 10 + 10 · ผู้พักร่วม **ไม่เก็บเลขบัตร** (ลดข้อมูล PDPA)
- `moveInPhotos` = `{ fileId: string; kind: "ROOM_PHOTO" | "ID_CARD" | "DOCUMENT"; at: string /* ISO */ }[]` (เอกสารวันเข้าทั้งหมด · นับ ≥ N เฉพาะ `ROOM_PHOTO`) · ลายเซ็น/สแกนสัญญาลงชื่อ = `signatureFileId`
- `policySnapshot` = ผลของ `snapshotPolicy` **+ คีย์บนสุดเพิ่ม** (ไม่ทับคีย์เดิม): `contract: { textTh: string; clauses: { id: string; titleTh: string | null; textTh: string; mandatory: boolean }[] }` (ข้อความสัญญาที่ render ตอนทำ — แม่แบบ/ถ้อยคำข้อบังคับในโค้ดเปลี่ยนภายหลัง สัญญาเดิมไม่เปลี่ยน) · `legal: { mode; level: "OK" | "WARN"; code: string | null; reason: string | null; approvalId: string | null }`
- เลขที่สัญญา (`{leaseNo}`) = `L` + 8 ตัวท้ายของ id ตัวใหญ่ (ไม่มีคอลัมน์ · พอสำหรับพิมพ์)
### 2.5 ผู้เช่า = Party
- รับ `{ partyId }` (ต้องเป็น Party ของร้าน · ถูกรวมแล้ว ⇒ ใช้ปลายทาง `resolveCanonical`) หรือ `{ name, phone?, idCardNo?, email? }` ⇒ `party.findOrCreate(tenantId, { name, phone, email, taxId: idCardNo }, tx)` (ลำดับจับคู่ของเดิม: เลขบัตร → เบอร์ → ชื่อ+อีเมล) **ใต้ `pg_advisory_xact_lock` ต่อ (ร้าน, เลขบัตร/เบอร์)** — `findOrCreate` ไม่มี unique ⇒ 12 คำขอพร้อมกันเบอร์ใหม่เดียวกัน ต้องได้ Party 1 ราย
- ต้องมี `phone` หรือ `idCardNo` อย่างน้อย 1 (หาซ้ำได้) ไม่งั้น `INVALID_INPUT` · `idCardNo` = 13 หลัก + เลขตรวจ (Σ dᵢ×(13−i) i=0..11 · ตรวจ = (11 − Σ mod 11) mod 10) ผิด ⇒ `INVALID_ID_CARD`
- DTO ทุกตัว **ไม่มีเบอร์เต็ม/เลขบัตรเต็ม** (เบอร์ปิดเหลือ 4 ตัวท้าย `phoneMasked` · เลขบัตรไม่ออกเลย) — X8

## 3. สัญญา (ชื่อ/ชนิดตรงตัว — ข้อสอบผูก) — ออกทาง `@/lib/modules/dorm`
```ts
export type LeaseCtx = { tenantId: string; actorUserId: string };
export type LeaseTab = "CURRENT" | "BOOKED" | "EXPIRING" | "NOTICE" | "ENDED";
type Fail = { ok: false; code: string; reason: string; legal?: { code: string; messageTh: string; citation: string } };
```
**ทุกฟังก์ชัน** (ด่านเดียวกัน · ลำดับนี้): หน่วยต้องเป็น `BusinessUnit` ของ `ctx.tenantId` และ `type = "DORM"` · ผู้กระทำ = **Membership สด** (อ่านจากฐานทุกครั้ง · `acceptedAt` ไม่ null) ของ `ctx.actorUserId` ในร้านนี้ · สิทธิ์: เขียน + `leaseFileLinks` ต้อง `dorm.lease.manage` · อ่าน (`getLease` `listLeases` `leaseContract` `findTenantCandidates`) ต้อง `dorm.lease.manage` หรือ `dorm.view` (ผ่าน `evaluate` · OWNER/MANAGER ที่คุมหน่วยผ่าน) · สัญญา/ห้องต้องเป็นของหน่วยนั้น — **ข้อใดไม่ผ่าน ⇒ `NOT_FOUND` (เขียน) / `null` หรือว่าง (อ่าน) ด้วย `reason` เดียวกันทุกกรณี** (ไม่บอกว่ามีอยู่ · X1) · ห้าม throw (ยกเว้นบั๊กจริง) · `reason` ไทยไม่ว่าง ไม่โทษผู้ใช้ ไม่มีข้อความ Prisma · เงินสตางค์จำนวนเต็ม · วันที่ `"YYYY-MM-DD"` (วันไทย)

### 3.1 `createLease`
```ts
createLease(ctx, {
  unitId: string; roomId: string; startDate: string; months: number;
  tenant: { partyId: string } | { name: string; phone?: string | null; idCardNo?: string | null; email?: string | null };
  rentSatang?: number; commonFeeSatang?: number; depositSatang?: number; advanceRentSatang?: number; bookingFeeSatang?: number;
  occupants?: { name: string; phone?: string | null }[]; vehicles?: { plate: string; kind: "CAR" | "MOTORBIKE" | "OTHER"; note?: string | null }[];
  legalAck?: { reason: string } | null; note?: string | null;
}) → Promise<{ ok: true; leaseId: string; partyId: string; partyCreated: boolean; occupancyId: string; startDate: string; endDate: string;
               legal: { level: "OK" | "WARN"; code: string | null; approvalId: string | null } } | Fail>
```
ลำดับ (tx เดียว — ปฏิเสธข้อใด = **ไม่มีแถวใดเกิด** ทั้ง DormLease · RoomOccupancy · Party · ApprovalRequest · AuditLog · outbox):
1. ด่าน §3 · ห้องไม่ใช่ของหน่วย/ร้าน ⇒ `NOT_FOUND` · `partyId` ไม่ใช่ของร้าน ⇒ `NOT_FOUND`
2. รูปแบบ ⇒ `INVALID_INPUT` (วันที่ผิด · months นอก 1–360/ไม่ใช่จำนวนเต็ม · เงินไม่ใช่จำนวนเต็ม ≥ 0 หรือ > ฿10,000,000 · ชื่อว่าง · ผู้พักร่วม/รถเกิน 10 · ไม่มีทั้งเบอร์และเลขบัตร) · `INVALID_ID_CARD` · ไม่มีค่าห้อง ⇒ `RENT_REQUIRED`
3. เงินจอง: `bookingFeeSatang > depositSatang` ⇒ `INVALID_AMOUNT` · `rooms.lease.reservationAppliesTo = FIRST_RENT` และเงินจอง > 0 ⇒ `NOT_SUPPORTED` (หนี้ D.8 — ใบนี้รองรับ "หักเข้าประกัน" เท่านั้น)
4. **ตัวกั้นประกัน + ล่วงหน้า**: `evaluateLegal("DEPOSIT_ADVANCE_LIMIT", { leaseKind, monthlyRentSatang: ค่าห้อง, depositSatang, advanceRentSatang }, { mode, outOfScopeReason })` (ค่าห้องอย่างเดียว ไม่รวมส่วนกลาง)
   - `level BLOCK` ⇒ `LEGAL_BLOCK` + `legal` (STRICT · หรือ OUT_OF_SCOPE ที่ไม่มีเหตุผล ⇒ `legal.code OUT_OF_SCOPE_REASON_REQUIRED`) — ack/เจ้าของก็ไม่ผ่าน
   - `level WARN` (โหมด WARN): ไม่มี `legalAck` ⇒ `NEEDS_APPROVAL` (ไม่สร้างคำขอ) · เหตุผลไม่ผ่าน `isValidOutOfScopeReason` (≥ 10 ตัวอักษร) ⇒ `REASON_REQUIRED` · ผู้กระทำ **OWNER** ⇒ สร้างได้ `legal.level WARN` `approvalId null` · ไม่ใช่ OWNER ⇒ `resolvePolicy({tenantId}, { entityType: "dorm.lease.legal_override", unitId }, tx)` ต้องมีขั้น `approverRole OWNER` ไม่งั้น `NEEDS_APPROVAL` (ไม่สร้างอะไร — เหมือน R0.3 L-9) · มี ⇒ สร้างสัญญา DRAFT + `submitForApproval({tenantId}, { entityType: "dorm.lease.legal_override", entityId: leaseId, unitId, requestedById: actorUserId }, { tx })` ⇒ `legal.approvalId = requestId`
   - ทุกกรณีที่สร้างได้ด้วย WARN ⇒ `AuditLog { action: "dorm.lease.legal_override", targetType: "DormLease", targetId: leaseId, after ⊇ { code, reason, approvalId } }` (X9)
   - OUT_OF_SCOPE + เหตุผลถูก ⇒ OK (`legal.level "OK"`)
5. **สัญญา** (ตัวแปรแม่แบบ: `{rent}` = เลขคั่นหลักพัน เช่น `4,500 บาท` · `{roomNo}` = เลขห้อง · `{tenantName}` = ชื่อ Party · วันที่ไทย): ข้อบังคับ = `MANDATORY_CLAUSES` ของ D.1 **ทั้ง 7 ข้อ ถ้อยคำตรงตัว** (ระบบใส่เอง — แม่แบบไม่มี `{mandatoryClauses}` ⇒ ต่อท้ายข้อความ) + ข้อเพิ่ม `rooms.lease.extraClauses` (mandatory false) · ข้อเพิ่มที่ `id` ซ้ำข้อบังคับ ⇒ `INVALID_CLAUSE` (ทุกโหมด · แก้ถ้อยคำข้อบังคับไม่ได้) · ตรวจ `evaluateLegal("CONTRACT_MANDATORY_CLAUSES", { clauses: ทุกข้อ }, …)` + `TEMPLATE_NO_THREAT` กับแม่แบบ ⇒ BLOCK ⇒ `LEGAL_BLOCK` (คำต้องห้ามเป็น `always` = **ทุกโหมดรวม OUT_OF_SCOPE · ack ไม่ช่วย**) — ค่าตั้งที่หลุดเข้าฐานโดยไม่ผ่านตัวตรวจต้องถูกจับที่นี่
6. Party (§2.5) → `claimRoom` (§2.2): `ROOM_TAKEN` (ไม่บอก refId คนอื่น) · ห้องปิดซ่อม/ไม่ active ⇒ `ROOM_UNAVAILABLE` · ห้องรายคืน ⇒ `RENT_MODE_MISMATCH` → แถว `DormLease` (status DRAFT · termType FIXED · คอลัมน์เงินตามที่คิด · `templateKey/templateVersion` ของ snapshot · `createdById`) → snapshot §2.4
- `occupancyId` คืน = แถว RoomOccupancy · `endDate` = §2.2

### 3.2 `findTenantCandidates`
```ts
findTenantCandidates(ctx, { unitId: string; phone?: string | null; idCardNo?: string | null })
  → Promise<{ partyId: string; name: string; phoneMasked: string | null; matchedBy: "ID_CARD" | "PHONE"; activeLeases: number }[]>
```
- เทียบ `Party.taxId` (เลขบัตร normalize) / `phoneNorm` (`normalizePartyPhone` — +66 = 0) · เฉพาะร้านนี้ · ไม่รวมที่ถูกรวมแล้ว · ไม่มีเงื่อนไข ⇒ `[]` · `phoneMasked` = เหลือ 4 ตัวท้าย (เช่น `xxx-xxx-5678`) · ไม่มีเลขบัตรใน DTO

### 3.3 `receiveBookingFee` (เงินจองก่อนเข้า · หักเข้าประกันวันเข้า)
```ts
receiveBookingFee(ctx, { unitId: string; leaseId: string; paidAt?: Date; channel?: "CASH" | "TRANSFER" | "PROMPTPAY"; financeAccountId?: string | null })
  → Promise<{ ok: true; duplicate: boolean; entryId: string; entryNo: string; heldSatang: number } | Fail>
```
- เฉพาะ DRAFT (อื่น ⇒ `NOT_EDITABLE`) · `bookingFeeSatang = 0` ⇒ `NO_BOOKING_FEE` · ยอด = **`DormLease.bookingFeeSatang` เสมอ** (ไม่รับยอดจากผู้เรียก)
- `postSecurityDeposit({ tenantId, unitId, leaseId, amountSatang: bookingFeeSatang, idempotencyKey: "dorm.lease:<leaseId>:booking", partyId: lease.partyId, … })` — โค้ด/เหตุผลของบัญชี (`NOT_LINKED` `AMBIGUOUS_LINK` `IDEMPOTENCY_CONFLICT` …) ส่งต่อตามเดิม

### 3.4 `moveIn` (เข้าอยู่ · รับประกันครบ)
```ts
moveIn(ctx, { unitId: string; leaseId: string; paidAt?: Date; channel?: "CASH" | "TRANSFER" | "PROMPTPAY"; financeAccountId?: string | null;
              meterReadings?: { meterId: string; value: number }[] })
  → Promise<{ ok: true; duplicate: boolean; status: "ACTIVE"; heldSatang: number; receipts: { entryId: string; entryNo: string; amountSatang: number; kind: "BOOKING" | "DEPOSIT" }[] } | Fail>
```
ลำดับ (ห้ามสลับ — เงินก่อนสถานะ เพราะห้องกันไว้แล้วตั้งแต่ร่าง):
1. ด่าน §3 · ACTIVE แล้ว ⇒ **ok `duplicate: true`** (ไม่มี JV/แถวใหม่ · คืนยอดถือปัจจุบัน) · CANCELLED/ENDED/NOTICE ⇒ `NOT_EDITABLE`
2. ยังไม่ลงชื่อ ⇒ `NOT_SIGNED` · อนุมัติกฎหมายค้าง ⇒ `NEEDS_APPROVAL` · ถูกปฏิเสธ ⇒ `LEGAL_REJECTED` (อ่านสถานะคำขอสดผ่าน `requestStatuses` ของ facade approval) · รูป `ROOM_PHOTO` < `moveInPhotosMin` **ของ snapshot** ⇒ `PHOTOS_REQUIRED` (reason บอกจำนวนที่ขาด) · `meterReadings`: มิเตอร์ต้อง active (`removedAt` null) ของห้องนี้ ไม่ใช่ ⇒ `NOT_FOUND` · ค่าไม่ใช่จำนวนเต็ม ≥ 0 ⇒ `INVALID_INPUT` — ข้อ 2 ไม่ผ่าน = ไม่มีเงิน/แถวใดเกิด
3. เงิน (ลำดับ · ทีละคำขอ): ถ้า `bookingFeeSatang > 0` ⇒ `postSecurityDeposit` คีย์ `dorm.lease:<leaseId>:booking` ยอด `bookingFeeSatang` (รับไปแล้ว = duplicate) · ถ้า `depositSatang − bookingFeeSatang > 0` ⇒ คีย์ `dorm.lease:<leaseId>:deposit` ยอดส่วนที่เหลือ — **ยอดคงที่จากคอลัมน์** ⇒ ยิงพร้อมกัน/ซ้ำ/สลับกับ `receiveBookingFee` กี่ครั้ง ยอดถือ = `depositSatang` พอดี · ล้ม (เช่น `NOT_LINKED`) ⇒ คืนโค้ดนั้น สัญญายัง DRAFT (เรียกซ้ำได้)
4. tx: `status ACTIVE` (ใต้เงื่อนไข status = DRAFT · แพ้ = duplicate) · `depositDocumentId` = entryId ของ JV `:deposit` (ไม่มี ⇒ `:booking` · ไม่มีเงิน ⇒ null) · `DormMeterReading { kind: "MOVE_IN", leaseId, periodKey: startDate.slice(0,7), source: "MANUAL", readById }` ต่อมิเตอร์ (ซ้ำ ⇒ ไม่เพิ่ม)
- ค่าเช่าล่วงหน้า **ไม่ลงเงินในใบนี้** (ไม่มี facade รับเงินล่วงหน้าไม่ผูกเอกสาร — หนี้ D.8: บิลแรกรวมเดือนล่วงหน้า) · ประกัน 0 + จอง 0 ⇒ เข้าอยู่ได้โดยไม่มี JV

### 3.5 `signLease` (ลงชื่อบนจอ / แนบสแกนกระดาษ)
```ts
signLease(ctx, { unitId: string; leaseId: string; method?: "ON_SCREEN" | "PAPER"; file: { data: Uint8Array; contentType: string } },
          deps?: { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void> })
  → Promise<{ ok: true; signedAt: string; signatureFileId: string } | Fail>
```
- เฉพาะ DRAFT ที่ยังไม่ลงชื่อ (ลงแล้ว ⇒ `ALREADY_SIGNED` · ไม่อัปไฟล์ใหม่) · `method` ไม่ส่ง = `rooms.lease.signMethod` ของ snapshot · ON_SCREEN รับ png/jpeg · PAPER รับ pdf/png/jpeg · ≤ 10 MB ไม่งั้น `INVALID_FILE` · อนุมัติกฎหมายค้าง/ปฏิเสธ ⇒ `NEEDS_APPROVAL` / `LEGAL_REJECTED`
- ไฟล์ผ่าน `uploadFile({tenantId}, { kind: "ATTACHMENT", visibility: "private", … }, deps.put ? { put } : undefined)` · อัปไม่สำเร็จ ⇒ `UPLOAD_FAILED`
- tx (ใต้เงื่อนไข `signedAt IS NULL` — พร้อมกัน 12 ทาง ⇒ ok 1 · ที่เหลือ `ALREADY_SIGNED`): `signedAt` · `signatureFileId` · `emitOutbox(tx, { type: "dorm.lease.signed", idempotencyKey: "dorm.lease.signed:<leaseId>", unitId, payload })` — **payload ตรง 3 คีย์ `{ unitId, leaseId, roomId }`** (ไม่มีชื่อ/เบอร์/เงิน · X8)

### 3.6 ไฟล์วันเข้า · ลิงก์ส่วนตัว (X10)
```ts
addLeaseFiles(ctx, { unitId: string; leaseId: string; kind: "ROOM_PHOTO" | "ID_CARD" | "DOCUMENT"; files: { data: Uint8Array; contentType: string; filename?: string }[] },
              deps?: { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void> })
  → Promise<{ ok: true; added: { fileId: string; kind: string }[]; counts: { ROOM_PHOTO: number; ID_CARD: number; DOCUMENT: number } } | Fail>
leaseFileLinks(ctx, { unitId: string; leaseId: string })
  → Promise<{ ok: true; files: { fileId: string; kind: "ROOM_PHOTO" | "ID_CARD" | "DOCUMENT" | "SIGNATURE"; contentType: string; url: string; at: string }[] } | Fail>
```
- ชนิดที่รับ: ROOM_PHOTO = jpeg/png/webp/heic/heif · ID_CARD/DOCUMENT = + pdf (ไม่มี svg/gif/html) · ≤ 10 MB/ไฟล์ · 1–20 ไฟล์/ครั้ง · รวมทั้งสัญญา ≤ 60 ⇒ เกิน `TOO_MANY` · ไฟล์ใดผิด ⇒ `INVALID_FILE` **ทั้งคำขอ ไม่อัปอะไร** · สัญญา CANCELLED/ENDED ⇒ `NOT_EDITABLE`
- ทุกไฟล์ `visibility: "private"` (path `t/<tenantId>/private/…` · cdnUrl `private://…`) · ต่อท้าย `moveInPhotos` **ใต้ล็อกแถวสัญญา** (ส่งพร้อมกัน 6 ครั้ง ⇒ 6 รายการ ไม่หายสักรายการ)
- `leaseFileLinks`: ต้อง `dorm.lease.manage` (ผู้มีแค่ `dorm.view` ⇒ `NOT_FOUND`) · `url = privateFileUrl(fileId, { kind: "STAFF", id: ctx.actorUserId })` (≤ 15 นาที · ผูกผู้ดู) · DTO ไม่มี path/cdnUrl/`private://`

### 3.7 อ่าน
```ts
getLease(ctx, { unitId: string; leaseId: string }) → Promise<LeaseDetail | null>
type LeaseDetail = { leaseId: string; unitId: string; roomId: string; roomNumber: string; roomTypeName: string | null; status: string;
  partyId: string; tenantName: string; phoneMasked: string | null; startDate: string; endDate: string; months: number;
  rentSatang: number; commonFeeSatang: number; depositSatang: number; advanceRentSatang: number; bookingFeeSatang: number;
  occupants: { name: string; phoneMasked: string | null }[]; vehicles: { plate: string; kind: string; note: string | null }[];
  signedAt: string | null; files: { ROOM_PHOTO: number; ID_CARD: number; DOCUMENT: number; SIGNATURE: number }; moveInPhotosMin: number;
  heldSatang: number; receipts: { entryId: string; entryNo: string; amountSatang: number; date: string }[];
  legal: { mode: string; level: "OK" | "WARN"; code: string | null; reason: string | null; approvalId: string | null; approvalStatus: "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" };
  policySnapshot: unknown };
listLeases(ctx, { unitId: string; tab?: LeaseTab; q?: string | null })
  → Promise<{ rows: LeaseRow[]; counts: Record<LeaseTab, number>; heldTotalSatang: number }>
type LeaseRow = { leaseId: string; roomId: string; roomNumber: string; roomTypeName: string | null; status: string; tenantName: string; occupantCount: number;
  startDate: string; endDate: string; months: number; rentSatang: number; depositSatang: number; heldSatang: number; daysToEnd: number };
leaseContract(ctx, { unitId: string; leaseId: string })
  → Promise<{ ok: true; leaseNo: string; textTh: string; clauses: { id: string; titleTh: string | null; textTh: string; mandatory: boolean }[] } | Fail>
```
- `heldSatang` = `securityDepositHeld` (GL — ไม่ใช่คอลัมน์) · `receipts` = §3.9 · `occupantCount` = 1 + ผู้พักร่วม · `daysToEnd` = endDate − วันนี้ไทย
- แท็บ: `CURRENT` = ACTIVE+NOTICE · `BOOKED` = DRAFT · `EXPIRING` = ACTIVE ที่ `daysToEnd` 0–60 · `NOTICE` = NOTICE · `ENDED` = ENDED (CANCELLED ไม่แสดง) · ไม่ส่ง tab = CURRENT · `counts` ครบ 5 แท็บ (ไม่ขึ้นกับ q) · `q` ค้นเลขห้อง/ชื่อผู้เช่า/เบอร์ (ตัวเลข ≥ 4 ตัว) · เรียงเลขห้อง
- `heldTotalSatang` = Σ ยอดถือของสัญญา DRAFT/ACTIVE/NOTICE ทั้งหน่วย (ป้าย "เงินประกันที่ถือไว้ทั้งตึก")
- `leaseContract` = ข้อความจาก `policySnapshot.contract` (ไม่ render ใหม่จากค่าตั้งปัจจุบัน)

### 3.8 อื่น
```ts
cancelLease(ctx, { unitId: string; leaseId: string; reason: string }) → Promise<{ ok: true } | Fail>
updateLeaseOccupants(ctx, { unitId: string; leaseId: string; occupants: {...}[]; vehicles: {...}[] }) → Promise<{ ok: true } | Fail>
```
- `cancelLease`: DRAFT เท่านั้น (อื่น `NOT_EDITABLE`) · เหตุผล < 3 ตัวอักษร `INVALID_INPUT` · ยอดถือ > 0 ⇒ `DEPOSIT_HELD` (คืน/ริบเงินจอง = ใบ D.12) · ok ⇒ CANCELLED + `endReason` + `releaseOccupancy` (ห้องว่างให้สัญญาใหม่)
- `updateLeaseOccupants`: DRAFT/ACTIVE/NOTICE · ตรวจรูปทรง §2.4 (`INVALID_INPUT`) · ไม่แตะเงิน/สัญญา

### 3.9 account facade (additive · อ่านอย่างเดียว)
```ts
securityDepositReceipts(input: { tenantId: string; unitId: string; leaseId: string }) → Promise<{ entryId: string; entryNo: string; amountSatang: number; date: string; kind: "RECEIVE" }[]>
```
- JV รับประกันของสัญญา (refType `DormSecurityDeposit` · refId ของ D.2) ที่ยังไม่ถูกกลับรายการ · ทุกสมุดของร้าน · เรียงเวลา · ข้ามหน่วย/ร้าน = `[]`

### 3.10 ORACLE-EDIT 29 ต.ค. (review · `/root/svc-runs/fix/d5.md` K1–K7) — ทับ §2–§3.9 เมื่อขัดกัน
- **K1 เงินกับสถานะ commit พร้อมกัน (tx เดียว · connection เดียว)** — ผู้คุมอนุญาตแตะ account facade (additive): รุ่นรับ tx ของผู้เรียก เช่น `postSecurityDepositInTx(tx, input)` · `securityDepositHeldInTx(tx, input)` (ชื่อเทียบเท่าได้ · export จาก `account/index.ts` ใช้ในโพรเซสเท่านั้น ไม่เปิด REST) — รุ่น tx ทำวินัย D.2 ครบใน tx ที่ส่งมา (ล็อกแถว Tenant → ลิงก์หน่วย → ตรวจคีย์ → ลงเงิน) · ฟังก์ชันเดิมของ D.2 พฤติกรรมเดิมทุกไบต์ (G-1 `qc-svc-d.2` 78/78)
  - `moveIn` / `receiveBookingFee` / `cancelLease`: tx เดียว ลำดับล็อก **advisory ต่อสัญญา → (รุ่น tx บัญชี) แถว Tenant → … → อัปเดตสัญญา** · ห้ามทางใดล็อกแถว Tenant ก่อนแล้วขอ advisory ของสัญญา · **ห้ามใช้ connection ที่สองระหว่างถือล็อก/tx** (บทเรียน B.3 · ไม่เรียก facade ที่เปิด tx เองข้างใน tx) · tx `maxWait ≤ 20s` `timeout ≤ 30s`
  - §3.4 ข้อ 3–4 เดิม ("เงินก่อน แล้ว tx สถานะ") **ยกเลิก** — เงิน (คีย์ `:booking` `:deposit` ยอดคงที่เดิม) + `ACTIVE` + `depositDocumentId` + MOVE_IN อยู่ใน tx เดียวกัน · cancel กับเงินแข่งกันใต้ advisory เดียวกัน ⇒ ไม่มีเงินบนสัญญา CANCELLED และไม่มีเงินประกัน (เกินเงินจอง) บนสัญญา DRAFT
  - ผลที่ต้องได้: 30 ทางในโพรเซสเดียว (เกิน pool 10) ไม่มี `UNAVAILABLE`/P2028/throw — M-10 M-11 M-12 (+ รุ่นข้ามโพรเซส)
- **K6** โค้ด `RETRY_SAFE` (reason "รับเงินแล้ว กดอีกครั้งเพื่อทำต่อ") ใช้เมื่อยังมีทางที่เงินลงแต่สถานะไม่ขยับ — หลัง K1 ไม่ควรเกิด (ข้อสอบนับเป็นแดงใน M-10…M-12) · ห้ามเหตุผล "ยังไม่มีอะไรเปลี่ยน" เมื่อเงินลงแล้ว · หนี้: ย้ายลิงก์สมุดหลังรับเงินจอง ⇒ `moveIn` คืน **`BOOK_CHANGED`** เหตุผลชัด (ไม่ใช่ `IDEMPOTENCY_CONFLICT`)
- **K2 คำต้องห้ามตรวจบนข้อความที่ render แล้ว**: render สัญญา (ชื่อหอ/หน่วย/ผู้ให้เช่า/ข้อเพิ่ม = ค่าจริง · `{tenantName}` แทนด้วยคำกลางก่อนตรวจ กันจับผิดคน — C-9) แล้ว `findForbiddenTerms` ทั้งก้อน ⇒ เจอ ⇒ `LEGAL_BLOCK` (`legal.code` `TEMPLATE_NO_THREAT` หรือ `CONTRACT_FORBIDDEN_TERM`) **ทุกโหมด · ack ไม่ช่วย** · ตัวแปรในแม่แบบที่ไม่อยู่ใน `templateVars` ⇒ **`INVALID_TEMPLATE`** (ไม่แทนค่าว่าง) · ตรวจซ้ำที่ `createLease` · `signLease` · `leaseContract` (หน้าพิมพ์) — snapshot ที่มีคำต้องห้าม (ข้อมูลเก่า/ถูกแก้) ⇒ `leaseContract` คืน `{ok:false, code:"LEGAL_BLOCK"}` ไม่ส่งข้อความ · `signLease` ปฏิเสธ — C-7 C-8
- **K3 จับคู่ผู้เช่า** (ทับ §2.5) — ชื่อ "ตรง" = เท่ากันหลังตัดช่องว่างหัวท้ายและยุบช่องว่างซ้อน:
  1. เลขบัตรตรง Party (ไม่ถูกรวม) + ชื่อตรง ⇒ ใช้ Party นั้น
  2. เลขบัตรไม่ตรงใคร + เบอร์ตรง Party ที่ **ยังไม่มีเลขบัตร** + ชื่อตรง ⇒ ใช้ Party นั้น **และเติมเลขบัตร** (P-8)
  3. เบอร์ตรง Party ที่มี **เลขบัตรอื่น** ⇒ สร้าง Party ใหม่ + บันทึกคู่อาจซ้ำ `PartyMergeCandidate` (ผ่าน facade party `recordMergeCandidatePair`) (P-8)
  4. ชื่อไม่ตรง (ทางเบอร์หรือทางเลขบัตร) ⇒ **`TENANT_MATCH_CONFIRM`** `{ ok:false, code, reason, candidates: { partyId, name, phoneMasked, matchedBy }[] }` (ไม่มีเบอร์เต็ม/เลขบัตร · ไม่มีแถวใดเกิด) — ผู้เรียกส่งใหม่พร้อม `tenant.confirmPartyId` (ต้องเป็นหนึ่งใน candidates ⇒ ใช้ Party นั้น) หรือ `tenant.createNewParty: true` (สร้างใหม่ด้วยชื่อที่กรอก) · ห้ามทิ้งชื่อที่กรอกเงียบ ๆ (P-9)
  - อินพุตผู้เช่าใหม่: `tenant: { name; phone?; idCardNo?; email?; confirmPartyId?: string | null; createNewParty?: boolean }` · ทั้งหมดใต้ advisory lock ต่อ (ร้าน, เลขบัตร/เบอร์) เดิม
- **K4** หน้า new: ค้นเลขบัตร/เบอร์ด้วย server action (POST) ที่เรียก `findTenantCandidates` · ไม่มีฟอร์ม GET ที่ส่งเลขบัตร/เบอร์ · ไม่อ่านจาก `searchParams` · ไม่เติมกลับ `defaultValue` จาก query · ไม่ลง log — U-5
- **K5** อัปไฟล์ (ลายเซ็น/รูป/เอกสาร) ก่อนเปิด tx · ใน tx เขียนแค่แถว FileAsset/สัญญาผ่าน tx เดียวกัน · แพ้แข่ง ⇒ ลบไฟล์ที่อัป (best-effort)
- **K7** `findTenantCandidates` ต้อง `dorm.lease.manage` (ไม่มี ⇒ `[]` — P-10) · **`rooms.lease.signMethod` เข้า `SNAPSHOT_KEYS.lease` (คีย์ที่ 5 · additive)** และ `signLease` ใช้ค่าจาก snapshot (L-14) · HEIC/HEIF ตรวจ brand ไบต์ 8–11 ∈ {heic, heix, hevc, heim, heis, mif1, msf1} ไม่ใช่แค่ `ftyp` (F-10) · id ข้อเพิ่มเทียบข้อบังคับแบบไม่สนตัวพิมพ์/ช่องว่าง
- ข้อสอบเดิมที่แก้ (ORACLE-EDIT): P-3 ส่งชื่อเดียวกัน (ช่องว่างต่าง) แทนชื่อสะกดต่าง (K3) · `newPhone` ไม่วนซ้ำทุก 100 เบอร์ · S-13 นับ 5 คีย์
- หนี้เพิ่ม (ไม่บล็อก): `BOOK_CHANGED` · คืน/ย้ายเงินจอง → D.12 · อัปไฟล์ทีละไฟล์ฝั่ง client (bodySizeLimit · base64) → D.14 · N+1 ยอดถือในหน้าผู้เช่า → D.13 · สัญญา WARN ที่หน่วยเปลี่ยนเป็น STRICT ภายหลัง = snapshot ชนะ (คำถาม J3) · ตัวตรวจค่าตั้งแม่แบบของ D.1 ตรวจข้อความดิบ (ช่องโหว่ `ตัด{x}ไฟ` ฝั่งค่าตั้ง) → ใบแก้ D.1

## 4. ไม่มีงานตามเวลา (X5 ไม่เกี่ยว) · ไม่มี endpoint สาธารณะ (X7 ไม่เกี่ยว)

## 5. สิทธิ์
```ts
leaseAccess(m: MembershipCtx | null, unitId: string) → { view: boolean; manage: boolean }
// manage = evaluate(m, { module: "dorm", action: "dorm.lease.manage", unitId }) · view = manage || evaluate(m, { module: "dorm", action: "dorm.view", unitId })
```
- คีย์ใหม่ `dorm.lease.manage` (CC §8 "ใบที่สร้างฟังก์ชันเพิ่มคีย์ของตัวเอง") · ผู้ใช้ QC ไม่แก้ใน `svc-qc-data` (ข้อสอบสร้างผู้ใช้เอง) — ให้ fai ได้คีย์นี้ = ใบ D.13

## 6. event · อนุมัติ
- `dorm.lease.signed` (§3.5) ลง 3 ทะเบียน · `dorm.lease.renewed/ended` = D.12 (ห้ามลงล่วงหน้า)
- คำขออนุมัติ `dorm.lease.legal_override` ไม่มี effect — `signLease`/`moveIn`/`getLease` อ่านสถานะสดทุกครั้ง

## 7. จอ (ภาพ หอ 02 · เดสก์ท็อป 1440 เป็นหลัก · 390 ไม่ล้นแนวนอน)
- «tenants/page.tsx»: server · `requireUnit` · `unit.type !== "DORM"` ⇒ `notFound()` · `leaseAccess(membership, unit.id).view` ไม่ผ่าน ⇒ `notFound()` · `searchParams.tab` (5 ค่า · อื่น = CURRENT) · `q` · `room` (เลขห้อง ⇒ เลือกสัญญาสถานะไม่ใช่ CANCELLED/ENDED ของห้องนั้น) หรือ `lease` (id) ⇒ แผงขวา · ข้อมูลผ่าน facade (`listLeases` `getLease`) ไม่แตะ prisma → `<TenantsScreen … />`
- «actions.ts»: `"use server"` · export async function เท่านั้น: `createLeaseAction` · `receiveBookingFeeAction` · `addLeaseFilesAction` · `signLeaseAction` · `moveInAction` · `cancelLeaseAction` (+ ตัวอื่นได้) — ทุกตัว `requireUnit` + `leaseAccess(...).manage` · ร้าน/ผู้กระทำจาก session (`actorUserId = auth.active.userId`) ไม่รับ tenantId จาก input · ไฟล์รับ base64/dataURL ≤ 10 MB
- «TenantsScreen.tsx» (ไม่ import prisma/โมดูล server/actions/`next/navigation|headers` — ยกเว้น `import type` · render ได้ด้วย `renderToStaticMarkup`) props: `{ unitSlug: string; tab: LeaseTab; q?: string | null; list: LeaseList; selected: LeaseDetail | null }`
  - DOM สัญญา: ตัวห่อ `data-dorm-tenants` · หัว "ผู้เช่าและสัญญา" · ปุ่ม/ลิงก์ "ทำสัญญาใหม่" → `/app/u/<slug>/dorm/tenants/new` · แท็บ `data-lease-tab="<TAB>"` 5 อัน ข้อความ = ป้ายไทย (ผู้เช่าปัจจุบัน · จอง/รอเข้า · สัญญาใกล้หมด · แจ้งย้ายออก · ย้ายออกแล้ว) + ตัวเลข `counts`
  - แถว `data-lease-row="<leaseId>"` `data-room-number` `data-status` (เฉพาะ `list.rows`) แสดง ห้อง · ชื่อผู้เช่า · "พัก N คน" · ช่วงวันที่ไทย (เช่น `1 พ.ค. 69 – 30 เม.ย. 70`) + "N เดือน" · ค่าห้อง `฿4,500` · ประกัน `฿9,000` · แถวที่เลือก `data-selected="true"`
  - ท้ายตาราง: "เงินประกันที่ถือไว้ทั้งตึก" + `฿<heldTotal>` (คั่นหลักพัน · ทศนิยมเฉพาะเมื่อมีสตางค์)
  - แผง `data-lease-panel="<leaseId>"` (เมื่อ selected): "ห้อง <เลข>" · ชื่อผู้เช่า · สถานะไทย · "สัญญาเช่า" (ระยะ · ค่าห้อง/เดือน · ส่วนกลาง · ครบกำหนดจ่ายจาก snapshot `rooms.billing.dueDay` "ทุกวันที่ N") · "เงินประกัน" (ถือไว้ ฿ · เลขใบรับเงินประกัน = `receipts[].entryNo` · คำว่า **"หนี้สิน"** ในคำอธิบาย) · "เอกสาร" (สัญญาลงชื่อแล้ว/ยังไม่ลงชื่อ · "รูปห้องวันเข้า N รูป" · สำเนาบัตร) · กล่อง "สัญญาสร้างจากแม่แบบตาม **ประกาศ สคบ.** …" · ปุ่ม "ต่อสัญญา" "ย้ายห้อง" "แจ้งย้ายออก" (D.12 — ปิด/ลิงก์ได้) · WARN ⇒ ป้าย "รออนุมัติ"/"ข้ามคำเตือนกฎหมาย"
  - **ไม่มีเบอร์เต็ม/เลขบัตร · ไม่มีคำต้องห้าม สคบ.** (ตัดไฟ/ตัดน้ำ/ล็อกห้อง/ยึดทรัพย์ …) · สีตามโทเคนเดิม · หน้าตาตามภาพ 02 (รายการซ้าย + แผงขวา + แท็บบน)
- «new/page.tsx» · «[leaseId]/print/page.tsx»: ด่าน `requireUnit` + DORM + `leaseAccess(...).manage` (new) / `.view` (print) ⇒ `notFound()` · ข้อมูลผ่าน facade (`leaseContract` ในหน้าพิมพ์)

## 8. ฉากภาพ «scripts/svc-qc-lease-scene.mts»
- ด่าน `loadSvcQcEnv("svc-qc-lease-scene")` · ต้องมีฉาก R0.9 (occupancy `SvcQcScene` LEASE ≥ 31) ไม่งั้น exit 3 พร้อมบอกให้รัน `scripts/svc-qc-roomboard-scene.mts`
- ร้าน svcqc หอ: สมุดบัญชี "บัญชีหอ (SVC QC)" + ลิงก์ BUSINESS ถ้ายังไม่มี · Party + `DormLease` ACTIVE 31 ห้องที่ฉากผังให้เช่า (**ชี้ `occupancyId` ไปที่ occupancy ของฉากผังเดิม · เขียนตรงได้** · `createdById = "SvcQcScene"` = เครื่องหมายฉาก) + 207 DRAFT (เบญจา คำแก้ว · เข้า +12 วัน · จองรับแล้วเต็มประกัน ฿9,000) · ประกันจริงผ่าน `postSecurityDeposit` (คีย์ `svcqc-scene:<ห้อง>`) ⇒ ยอดถือรวม **฿296,400** (25×9,000 + 6×10,400 + 207 ฿9,000) · ห้อง 204 = **ณัฐชา ใจดี** (12 เดือน · ฿4,500 · ลงชื่อแล้ว · รูปห้องวันเข้า 18 รูป = FileAsset private ที่เขียนตรง) · ชื่อ 201–211 ตามภาพ 02
- idempotent (`SCENE_SUMMARY {"created":n,"updated":n,"removed":n}` · รันซ้ำ = 0/0/0) · `--clear` ลบเฉพาะแถวฉาก: DormLease (`createdById SvcQcScene`) · Party/FileAsset ของฉาก · JV ประกันของฉาก (event คีย์ `svcqc-scene:` — สคริปต์ QC ลบตรงได้ เพราะ `reverseJournalEntry` ปฏิเสธ JV หอตาม F7) · ไม่แตะห้อง/occupancy ของฉากผัง/ข้อมูลอื่น

## 9. ข้อสอบ (กลุ่ม) — «scripts/qc-svc-d.5.mts»
S โครงสร้าง 15 · PC positive control 8 (ตัวยิง 4 โพรเซส · 30 ทางในโพรเซสเดียว) · L กฎหมายประกัน+ล่วงหน้า 14 · C สัญญา/ข้อบังคับ 9 · N snapshot 4 · R ห้อง/occupancy 7 · P ผู้เช่า=Party 10 · M เงินประกัน 12 · F ไฟล์/ลงชื่อ/event 10 · A สิทธิ์ 3 · X ข้ามร้าน 4 · U จอ 5 · Q ฉาก 3 · V ภาพ 1 · G regression 4 · Z ล้าง 1 = **110 ข้อ** (ORACLE-EDIT 29 ต.ค. เพิ่ม 13: PC-8 L-14 C-7 C-8 C-9 P-8 P-9 P-10 M-10 M-11 M-12 F-10 U-5)
- ข้อมูลทดสอบใต้ร้านชั่วคราว slug `qc-svc-d5-*` (หน่วย DS STRICT · DW WARN · DO นอกขอบเขต+เหตุผล · DQ นอกขอบเขตไม่มีเหตุผล · DN ไม่ผูกบัญชี · HA โรงแรม · ร้าน B) · ผู้ใช้ชั่วคราว `svc-d5-*@shark.local` (OWNER · MANAGER · STAFF lease/view/meter/หน่วยอื่น) · ค่าตั้งเขียนตรงลง `SettingValue` (จำลองค่าที่หลุดตัวตรวจ) · ลำดับข้อในไฟล์ต่อกัน · ฟังก์ชันใน facade ขาด = FAIL
- พร้อมกัน: ยิงจาก 4 โพรเซสลูก (`--child`) × 3 คำขอ ⇒ 12 ทาง (X3) — ห้ามแก้ให้ผ่านด้วย "ลองใหม่จนสำเร็จ" ที่ซ่อนผลซ้ำ

## 10. regression · X · ส่งต่อ
- เขียวเท่าเดิม (G): `qc-svc-d.2` (account facade + `securityDepositReceipts`) · `qc-svc-r0.8` (rooms) · `qc-svc-d.1` (`SNAPSHOT_KEYS.lease` เพิ่มคีย์) · `qc-svc-r0.3` (ค่าตั้ง/สายอนุมัติ) · + ผู้คุม: `qc-svc-smoke` · fitness 2 โหมด · typecheck · ตรวจเข้ม 2 รอบ
- X1 (X-1..4 · A-*) · X3 (R-4 P-5 M-4 F-3 F-8) · X4 (M-1 M-5 ซ้ำ = ครั้งเดียว) · X8 (F-8 payload · P-2/U-3 ไม่มีเบอร์/เลขบัตร) · X9 (L-7 audit · cancel ต้องมีเหตุผล) · X10 (F-1 F-4 F-5 ไฟล์ส่วนตัว+ลิงก์หมดอายุ) · X5 X6 X7 ไม่เกี่ยว (ไม่มีงานตามเวลา/นำเข้า/endpoint สาธารณะ — X6 ส่วนไฟล์ = F-2)
- ส่งต่อ: **D.4** นำเข้าใช้ `createLease` (ผู้กระทำ = เจ้าของ) + `moveIn` (ประกันยกมา) · **D.8** `policySnapshot` (dueDay · catalog · ค่าปรับ) + ค่าเช่าล่วงหน้าบิลแรก + MOVE_IN reading + `reservationAppliesTo FIRST_RENT` · **D.9** QR/รหัสผูกห้องในสัญญา · พอร์ทัลเห็นสัญญาตัวเอง (`leaseContract`) · **D.12** ต่อสัญญา/ย้ายห้อง/ย้ายออก/คืนหรือริบเงินจอง (`cancelLease` ที่มีเงินจอง) · สัญญาไม่มีวันจบ · `dorm.lease.renewed/ended` · **D.13** fai + `dorm.lease.manage` · ชื่อผู้เช่าในผัง · **J3** ถ้อยคำข้อบังคับ + วิธีลงชื่ออิเล็กทรอนิกส์ · **J5** ระยะเก็บรูปบัตร/รูปห้อง (PDPA)
