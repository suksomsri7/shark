# ใบสั่ง D.16 — แจ้งซ่อม → บอร์ดงาน → LINE (ผู้เช่าแจ้งในพอร์ทัล/เมนู ⇒ การ์ด `dorm.repair#<id>` ผ่านสะพาน ⇒ การ์ดเสร็จ ⇒ สถานะ ⇒ LINE ⇒ ให้คะแนน · มือถือช่าง) · ตรวจ: **เบา (รอบเดียว)** — แต่ X1 ขอบเขตร้าน/หน่วย/อาคาร · X3/X4 ครั้งเดียว · X7 ลิงก์สาธารณะ · X10 รูปส่วนตัว **ห้ามตัด**

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` D.16 (พึ่ง D.9 · ภาพ หอ 13 ส่วนช่าง) · แบบ: `ledger/DESIGN-DORM-HOTEL.md` §6 A10 ("แจ้งซ่อม (หมวด · ข้อความ · รูป/คลิป · อนุญาตเข้าห้อง · เวลาสะดวก) → การ์ดในบอร์ดงานของช่าง · สถานะกลับ LINE · ให้คะแนน") + §8 แถวบอร์ดงาน (`createCardFromExternal` sourceKey `dorm.repair#id` ผ่าน `platform/kanban-bridges.ts` · การ์ดเสร็จ → สถานะ → LINE) · ภาคผนวก ก หอ **#59** (หมวด → บอร์ด/ผู้รับผิดชอบ · ค่าตั้ง `rooms.repair.categories`) **#60** (ใครจ่ายต่อหมวด · `rooms.repair.payer`) **#61** (เข้าห้องต้องได้รับอนุญาต · `rooms.access.roomEntry`) **#64** (ผู้ดูแลเห็นเฉพาะอาคาร) · ภาพ: **หอ 13ค** «ledger/design-dorm/13-housekeeping-repair.png» (มือถือช่าง 390 — PARITY) · ฟอร์มผู้เช่า = หอ 05ค «05-line-tenant.png» (อ้างอิง DOM · ไม่ใช่ PARITY ของใบนี้)
> สัญญากลาง: `ledger/SVC-CORE-CONTRACT.md` §4.4 (`notifyCustomer` + `precheck` ของ D.9) §4.5 (`signLink`/`verifyLink`) §7 (`dorm.repair.created` · `dorm.repair.done` — repairId · roomId · category) §8 (`dorm.repair.manage`) + ภาคต่อ 28 ต.ค.
> ใบก่อนที่ต้องอ่าน (โค้ดชนะเอกสาร): `svc-brief-d.18.md` (แบบอย่างล่าสุด: id แถวคำนวณจากคีย์ · รูปส่วนตัว · งานตามเวลา keyset · ปิดแถวที่ส่งไม่ได้เป็นสถานะจบ) · `svc-brief-d.17.md` §1 (ด่าน token พอร์ทัลเขียนใหม่ในไฟล์ตัวเองแทนการแตะ `dorm-portal.ts`) · `svc-brief-d.9.md` §3.0 (สัญญา live) §3.1 (ลำดับด่าน token · ไม่พบเดียวกัน) · `svc-brief-d.13.md` §3 (`dormVisibleRoomsFor` fail closed · ชื่อแรกเท่านั้น) · โค้ดสะพาน `src/lib/platform/kanban-bridges.ts` (กติกาหัวไฟล์ 1–7) + `src/lib/modules/kanban/links.ts#createCardFromExternal` + `kanban/moves.ts#moveCard` (ยิง `kanban.card.moved` / `kanban.card.completed`) + `outbox-consumers.ts#compose` (ของแถมล้ม = WARN ไม่ retry ⇒ ต้องมีงานกวาด)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-d.16.mts» — รับใบ = **ผ่านทุกข้อ** (นับจาก `JSON_SUMMARY`) · SKIP ที่ยอมได้ระหว่างทำ: `G-*` (`--no-regression`) · `Q-*` (ฐานเลนยังไม่มีฉาก D.13) · `V-1` (ไม่มี `QC_BASE`) · `S-1` (หลัง merge)
> รัน: `cd /root/projects/shark-svc-l3 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.16.mts [--no-regression]` (ห้ามครอบ `timeout` · ห้าม kill กลางคัน — ล้างข้อมูลใน `finally`) · ข้อสอบเปิดตัวจำลอง LINE เอง (127.0.0.1 + `LINE_API_BASE`) · `APP_URL=https://qc-d16.invalid` · บล็อกคำขอนอกเครื่อง
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม `prisma generate`/migration/แตะ `prisma/**` · ห้ามแก้ข้อสอบ/`scripts/**` ยกเว้นสร้าง «scripts/svc-qc-repair-scene.mts»** (+ `scripts/fitness.mts` `ALLOWED_EDGES` ถ้าแดงจริง) · เลน l3 · temp ขึ้นต้น `svc-d16-` · รายงานต่อข้อ (id → ผล)
> ผู้เขียนข้อสอบแก้ให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` บล็อก `SVC D.16` (`SQC_DORM_REPAIR_SCENE` · `SQC_VISUAL_SPECS["d.16"]`)
> **ไม่มี migration** — ตาราง `DormRepair` มีแล้วจาก D.0 (`prisma/schema/dorm.prisma`: category · text · files Json? · preferredTime · allowEntry · status OPEN/IN_PROGRESS/DONE/CANCELLED (CHECK) · kanbanCardId · doneAt · rating 1–5 (CHECK) · ratingNote · leaseId/partyId) · ขาด 4 เรื่อง ⇒ ใช้ทางที่ไม่ต้อง migration (§2) + ขอผู้คุมเคาะ §11 R1–R4
> ใบที่วิ่งขนานอยู่ (ไม่อยู่บน tip นี้): **D.10 (สลิป) · D.12 (ย้ายออก)** — ไฟล์ร่วม (`outbox-consumers.ts` · `automation/labels.ts` · `minute-jobs.ts` · `permissions.ts` · `dorm/index.ts` · `dorm-line.ts` · หน้าแรกหน่วย) แก้เป็น **บล็อกของตัวเองที่มีคอมเมนต์ `// SVC D.16`** ไม่แก้บรรทัดของใบอื่น · **ห้ามแตะ `dorm-portal.ts`** (D.10 แก้อยู่ — ด่าน token เขียนใหม่ใน `repair.ts` แบบ D.17/D.18)

---

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ S-1/S-2 ไล่ `git status` ของ `src/` `prisma/` `public/` ตอนรับใบ)

| ไฟล์ | | ทำอะไร |
|---|---|---|
| «src/lib/modules/dorm/repair.ts» | ใหม่ (server) | §3 ทั้งหมด (พอร์ทัล · พนักงาน · สถานะจากการ์ด · ข้อความ · consumer · งานส่งซ้ำ) — ผ่าน `tenantDb` (**ห้าม `import { prisma }`**) · ข้อความผ่าน `notifyCustomer` (dynamic import `@/lib/platform/notify-customer` แบบ `dunning.ts`) เท่านั้น · **ห้าม import บอร์ดงาน** (`@/lib/modules/kanban*` · `@/lib/platform/kanban*`) และ platform อื่น — การ์ดทั้งหมดผ่านสะพาน (S-11) |
| `src/lib/modules/dorm/index.ts` | แก้ (บล็อกต่อท้าย `// SVC D.16`) | export ชื่อใน §3 |
| `src/lib/platform/kanban-bridges.ts` | แก้ (**บล็อกท้ายไฟล์** `// SVC D.16 ▸ … // ◂ SVC D.16` · ไม่ลบบรรทัดเดิม) | §4 สะพาน 5 ฟังก์ชัน |
| «src/app/(store)/d/[token]/repair/page.tsx» · «actions.ts» | ใหม่ (สาธารณะ) | §6.1 หน้าแจ้งซ่อมของผู้เช่า (ลิงก์เซ็นเดียวกับพอร์ทัล D.9) |
| «src/components/dorm/portal/DormPortalRepair.tsx» | ใหม่ `'use client'` | §5.1 (หอ 05ค) |
| «src/app/app/u/[unitSlug]/dorm/repairs/page.tsx» · «[repairId]/page.tsx» · «actions.ts» | ใหม่ | §6.2 รายการ + มือถือช่าง |
| «src/components/dorm/DormRepairs.tsx» · «src/components/dorm/DormRepairJob.tsx» | ใหม่ `'use client'` | §5.2 · §5.3 (หอ 13ค) |
| `src/lib/platform/dorm-line.ts` | แก้ **ลบได้ 1 บรรทัด** (`return { text: T.REPAIR };`) | `case "repair"` ⇒ ลิงก์ `/repair` ของสัญญาผู้กด (`leaseLinksText(ctx, leases, now, "/repair")` + หัวข้อความไทย) · บรรทัด `case "repair": // W3…` คงไว้ได้ · ส่วนอื่นห้ามแตะ (d.18 S-13 นับบรรทัดที่ลบ ≤ 1) |
| `src/lib/core/permissions.ts` | แก้ 1 บรรทัด | เอา `"dorm.repair.manage"` ออกจาก `planned` (ป้ายไทยเดิม "รับและจัดการงานแจ้งซ่อม") |
| `src/lib/outbox-consumers.ts` | แก้ (ลบ ≤ 4 บรรทัด) | `kanbanBridge` union + `"onDormRepairCreated" \| "onDormRepairDone" \| "onDormRepairCardMoved" \| "onDormRepairCardCompleted"` · `"dorm.repair.created": withAutomation(kanbanBridge("onDormRepairCreated"))` · `"dorm.repair.done": withAutomation(compose(async (evt) => (await import("@/lib/modules/dorm")).onRepairDone(evt), kanbanBridge("onDormRepairDone")))` · `kanban.card.moved` ⇒ `withAutomation(compose(async () => {}, kanbanBridge("onDormRepairCardMoved")))` · `kanban.card.completed` ⇒ ต่อท้าย compose เดิมด้วย `kanbanBridge("onDormRepairCardCompleted")` (**ขาออกเดิม kanbanOutbound/memberBridge/crmKanbanCardCompleted ต้องอยู่ครบ** — K3.4-S5.1) |
| `src/lib/automation/labels.ts` | แก้ (2 รายการ) | ป้ายไทย 2 event (เว็บฮุคได้จาก spread — **ห้ามประกาศซ้ำใน `webhooks/labels.ts`**) |
| `src/lib/platform/minute-jobs.ts` | แก้ (2 บล็อก) | `dorm.repair` ทุก 5 นาที → `(await import("@/lib/modules/dorm")).runDormRepairJobs(now, { budgetMs, signal })` · `dorm.repair.cards` ทุก 5 นาที → `(await import("@/lib/platform/kanban-bridges")).sweepDormRepairCards(now, { budgetMs, signal })` (รูปเดียวกับ `dorm.parcel`) |
| `src/app/app/u/[unitSlug]/page.tsx` | แก้ 1 บรรทัด (เพิ่ม) | `UNIT_NAV.DORM` เพิ่ม `{ href: "/dorm/repairs", label: "แจ้งซ่อม" }` (แท็บหอล็อกโดย d.13 K-6) |
| `scripts/fitness.mts` | แก้เฉพาะ `ALLOWED_EDGES` **ถ้า fitness แดงจริง** | คอมเมนต์ `// SVC D.16` |
| «scripts/svc-qc-repair-scene.mts» | ใหม่ (builder) | ฉาก svcqc §8 |

**ห้ามแตะ**: `prisma/**` · `src/lib/core/**` นอก `permissions.ts` (**ไม่เพิ่มค่าตั้ง** — #59/#60/#61 + แม่แบบ `rooms.msg.repairDone` มีครบแล้ว) · `notify-customer.ts` · `postback-routes.ts` · `dorm-portal.ts` · `dorm-announce.ts` · `kanban-outbound.ts` · `src/lib/modules/kanban/**` · `src/app/(store)/d/**` นอก `repair/` · `src/lib/storage/**` · `src/app/api/files/**` · `src/lib/modules/chat/**` · `src/lib/payment/**` · `src/lib/modules/account/**` · โมดูลหอเดิม `dorm/*` นอก `repair.ts`+`index.ts` (เรียกได้ ห้ามแก้ — โดยเฉพาะ `home.ts` ที่นับ OPEN) · `dorm-home-shared.ts` · `dorm-policy-shared.ts` · layout หอ · `webhooks/labels.ts` · ไฟล์ของ D.10/D.12 · `any` · `getDay()/getDate()/getMonth()/getHours()/getFullYear()` ดิบ · คำต้องห้าม สคบ.

## 2. มติของใบนี้ (ผู้เขียนข้อสอบเลือก · ผู้คุมเคาะได้ใน §11 · เปลี่ยน = ORACLE-EDIT)

1. **คีย์ส่งซ้ำ = แถวเดียว — ไม่มีคอลัมน์คีย์** ⇒ ทาง ก ของ D.18: `id = "rep" + sha256hex("dorm.repair:v1:" + tenantId + ":" + leaseId + ":" + idempotencyKey).slice(0, 25)` · `INSERT … ON CONFLICT ("id") DO NOTHING` (หรือ create + จับ P2002 แล้วอ่านแถวเดิม) ⇒ ซ้ำ = `replayed: true` · ผู้แพ้ลบรูปของตัวเอง · ห้าม P2002/throw หลุด
2. **ทางเข้าผู้เช่า = หน้า `/d/<token>/repair`** (token = ลิงก์พอร์ทัล D.9: `signLink({ tenantId, purpose: "dorm.portal", subjectId: leaseId, expMin: rooms.notify.portalLinkDays × 1440 })` ไม่มี LIFF) · เมนู LINE "แจ้งซ่อม" ตอบลิงก์นี้ของทุกสัญญา live ของผู้กด · **สัญญาจบ/ไม่ live = แจ้งไม่ได้** (ไม่พบเดียวกัน)
3. **รูปเท่านั้นในใบนี้** (≤ 4 รูป · `image/jpeg|png|webp|heic|heif` · ไบต์หัวตรงชนิด · **รวม ≤ 10 MB** (action 12 MB) · ตรวจขนาดที่แจ้งก่อนอ่านไบต์) · คลิปวิดีโอ = R4 (storage ยังไม่รับ `video/*`)
4. **รูปเป็นไฟล์ส่วนตัว** (`uploadFile(..., { kind: "ATTACHMENT", visibility: "private" })`) · `DormRepair.files` = `[{ fileId: string; role: "TENANT" | "AFTER" }]` · ออกทาง DTO พนักงานได้แค่ `privateFileUrl(fileId, { kind: "STAFF", id: actorUserId })` · **พอร์ทัลผู้เช่า/การ์ด/LINE ไม่มีไฟล์เลย** · **ห้ามแนบไฟล์เข้าการ์ด** (ไฟล์แนบบอร์ดงานเป็น CDN สาธารณะ)
5. **บอร์ดปลายทาง = ชื่อบอร์ดของหมวด (#59 `board`) แบบตรงตัว** · บอร์ด ACTIVE เก่าสุดในทุกระบบ KANBAN ที่ active ของร้าน · คอลัมน์แรก (position) · **ไม่มีบอร์ดชื่อนั้น ⇒ ไม่สร้างการ์ด** (ไม่ตกไปบอร์ดอื่น — ต่างจาก D.6 `pickBoard`) งานยังอยู่ในจอพนักงาน + งานกวาดสร้างให้เมื่อมีบอร์ด · ร้านไม่มีระบบบอร์ดงาน ⇒ ไม่มีการ์ด · ผู้รับผิดชอบ = `assigneeId` ของหมวดเมื่อยังเป็นสมาชิก (Membership สด) · ไม่มี/ไม่ใช่สมาชิก ⇒ ไม่มอบหมาย (การ์ดยังเกิด) · **ไม่เพิ่มสวิตช์ใน `KanbanIntegrations`** (R5)
6. **สถานะจากการ์ด**: ย้ายเข้าคอลัมน์ที่ไม่ใช่คอลัมน์เสร็จ ⇒ `OPEN → IN_PROGRESS` (ครั้งเดียว · ถอยไม่ได้) · เข้าคอลัมน์เสร็จ (`kanban.card.completed`) ⇒ `OPEN|IN_PROGRESS → DONE` (CAS) · **DONE เป็นสถานะจบ** — เปิดการ์ดใหม่/ปิดซ้ำไม่เปลี่ยนคำแจ้ง ไม่ส่ง LINE ซ้ำ (R6) · ช่างกด "ซ่อมเสร็จ" บนมือถือ = CAS เดียวกัน แล้วสะพานย้ายการ์ดเข้าคอลัมน์เสร็จให้ (`closeCard`) · การ์ดที่ sourceKey ชี้คำแจ้งที่ไม่ใช่ของร้านนั้น = ไม่ทำอะไร
7. **LINE ซ่อมเสร็จครั้งเดียว** = `notifyCustomer(... messageKey: "repairDone", dedupeKey: "rooms:repairDone:<repairId>", precheck)` · ไม่ส่งตอนรับแจ้ง (ผู้เช่าเห็นผลบนหน้าเว็บ — R10) · ไม่ bypass เวลาเงียบ · ปุ่ม uri "ให้คะแนนงานซ่อม" = `<portal>/repair?r=<repairId>` (เมื่อขึ้นต้น https)
8. **ให้คะแนน** ในพอร์ทัลเท่านั้น · 1–5 (จำนวนเต็ม) + หมายเหตุ ≤ 300 · เฉพาะงาน DONE ของสัญญานั้น · ครั้งเดียว (CAS `rating IS NULL`) · ไม่มี event (audit อย่างเดียว)
9. **ใครจ่าย = ค่าตั้ง #60 ต่อหมวด** (`rooms.repair.payer[category] ?? _default`) แสดงบนจอช่าง (อ่านอย่างเดียว) · การเลือกรายงาน/เรียกเก็บผู้เช่า = R3
10. **เลขงาน (ticketNo)** = `"R-" + repairId.slice(-6).toUpperCase()` (ไม่มีคอลัมน์ลำดับ — R2) · ใช้ทั้งจอช่าง/รายการ/พอร์ทัล/LINE (`{ticketNo}`)
11. **ขอบเขต**: ทุกฟังก์ชันพนักงาน = `dorm.repair.manage` (Membership สด) + หน่วย DORM ของร้าน + `dormVisibleRoomsFor` (#64 fail closed) · นอกเงื่อนไข ⇒ `{ ok:false, code:"NOT_FOUND", reason: REPAIR_NF_REASON }` **ทุกไบต์เดียวกัน** (3 คีย์พอดี) · พอร์ทัล: token ผิดทุกแบบ/สัญญาจบ/งานของสัญญาอื่น/ร้านอื่น ⇒ วัตถุเดียวกันนี้ (submit/rate) หรือ `null` (load)
12. **ชื่อ**: จอช่าง/รายการ = ชื่อแรกของ Party เท่านั้น · การ์ด/payload/audit/log ไม่มีชื่อ เบอร์ **และไม่มีข้อความที่ผู้เช่าพิมพ์** (ข้อความอยู่ในแถว + รายละเอียดการ์ด (escape) เท่านั้น) · LINE ใช้ `tenantName` ตามแม่แบบเดิม (ข้อความถึงเจ้าตัว)
13. **event 2 ตัว** (CC §7): `dorm.repair.created` (ใน tx เดียวกับแถว · key `dorm.repair.created:<id>`) · `dorm.repair.done` (ใน tx เดียวกับ CAS → DONE · key `dorm.repair.done:<id>`) · payload **ตรง 4 คีย์** `{ unitId, repairId, roomId, category }` · audit: `dorm.repair.created` · `dorm.repair.started` · `dorm.repair.done` (`after: { source: "CARD" | "STAFF" | "SWEEP" }`) · `dorm.repair.rated` (`after: { rating }`) — `targetType: "DormRepair"` · ไม่มีข้อความ/ชื่อ/เบอร์/token
14. **เพดานงานค้างต่อสัญญา** OPEN+IN_PROGRESS ≤ 10 ⇒ ใบที่ 11 = `TOO_MANY` (ค่าคงที่ความปลอดภัย · ไม่ใช่นโยบายร้าน)
15. `rooms.access.roomEntry` (#61) = `STANDING_PERMISSION` ⇒ ช่องอนุญาตเข้าห้องในฟอร์มติ๊กไว้ก่อน (`entryDefault`) · ไม่ใช่ ⇒ ไม่ติ๊ก · ค่าที่บันทึก = ที่ผู้เช่าส่งจริงเสมอ

## 3. สัญญาโค้ด — export จาก `@/lib/modules/dorm` (ข้อสอบเรียกตามชื่อ/ฟิลด์นี้)

```ts
export const REPAIR_SOURCE_PREFIX = "dorm.repair#";
export const REPAIR_RATE = { submit: { limit: 10, windowMs: 600_000 } } as const; // ถังแจ้ง/ให้คะแนน · ถัง view = dorm:portal:view ของ D.9 (PORTAL_RATE.view 120/10 นาที — ค่าคงที่เดียวกัน)
export const REPAIR_NF_REASON: string;   // ข้อความไทยเดียว
export type RepairStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type RepairCtx = { tenantId: string; actorUserId: string };
export type RepairFile = { data?: Uint8Array; read?: () => Promise<Uint8Array>; size?: number; contentType: string }; // action ส่ง read+size (อ่านหลังผ่านด่าน) · ข้อสอบส่ง data
export type RepairFileDeps = { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>; del?: (path: string) => Promise<number> };
export type RepairFailCode = "NOT_FOUND" | "RATE_LIMITED" | "INVALID_INPUT" | "INVALID_FILE" | "TOO_MANY" | "UPLOAD_FAILED" | "ALREADY_DONE" | "NOT_DONE" | "ALREADY_RATED";
export type RepairFail = { ok: false; code: RepairFailCode; reason: string };   // reason ไทยไม่โทษผู้ใช้
export type RepairRow = {
  repairId: string; ticketNo: string; roomId: string; roomNumber: string; buildingId: string | null;
  category: string; categoryLabel: string; text: string /* ≤ 200 */; status: RepairStatus; allowEntry: boolean; preferredTime: string | null;
  createdAt: string; doneAt: string | null; rating: number | null; photoCount: number; cardLinked: boolean; tenantFirstName: string | null;
};
export type RepairJob = RepairRow & { text: string /* เต็ม */; photos: { url: string }[]; afterPhotos: { url: string }[]; boardName: string; payer: "DORM" | "TENANT"; payerLabelTh: string; canComplete: boolean };
export type PortalRepairView = {
  unitName: string; roomNumber: string; categories: { code: string; labelTh: string }[]; entryDefault: boolean;
  items: { repairId: string; ticketNo: string; categoryLabel: string; text: string; status: RepairStatus; statusLabel: string; createdLabel: string; doneLabel: string | null; rating: number | null; canRate: boolean; current: boolean }[]; // สัญญานี้เท่านั้น · ใหม่ → เก่า · ≤ 20
  links: { self: string /* /d/<token>/repair */; portal: string /* /d/<token> */ };
};
```
### 3.1 พอร์ทัล (ด่าน token ลำดับตายตัว · X7 — แบบ D.9 §3.1 · เขียนในไฟล์นี้ ไม่แตะ `dorm-portal.ts`)
- `submitPortalRepair(token, i: { category; text; allowEntry: boolean; preferredTime?: string | null; photos?: RepairFile[]; idempotencyKey }, opts: { clientKey: string; now?: Date; deps?: RepairFileDeps }) → { ok: true; repairId; replayed: boolean } | RepairFail`
  (1) `checkRateLimitDb("dorm:repair:submit:" + clientKey, REPAIR_RATE.submit, now)` เกิน ⇒ `RATE_LIMITED` **ก่อนตรวจ token** · (2) `verifyLink(token, "dorm.portal")` + `portalLiveLease(v.tenantId, v.subjectId, วันไทยของ now)` (ร้าน/สัญญาตรง) ⇒ ล้ม `NOT_FOUND` · (3) รูป input: คีย์ `^[A-Za-z0-9_-]{8,80}$` · หมวด ∈ รหัสของ `rooms.repair.categories` (หน่วยของสัญญา) · ข้อความ trim 1–1000 · เวลาสะดวก ≤ 120 · `allowEntry` boolean · รูป ≤ 4 ⇒ `INVALID_INPUT` · (4) แถวของคีย์มีแล้ว ⇒ `{ ok: true, replayed: true }` ทันที (ก่อนอ่านรูป) · (5) งานค้าง ≥ 10 ⇒ `TOO_MANY` · (6) รูป: ขนาดที่แจ้ง (size/data.length) 1 B–10 MB และรวม ≤ 10 MB **ก่อนเรียก `read()`** → ชนิด → ไบต์หัว ⇒ `INVALID_FILE` · (7) อัปไฟล์ส่วนตัว (ล้ม ⇒ ลบที่อัปแล้ว + `UPLOAD_FAILED`) · (8) tx: INSERT (`createdAt = now` · leaseId/partyId/roomId/unitId จากสัญญา · status OPEN · `files` role TENANT) + `emitOutbox(dorm.repair.created)` + audit · แพ้ ON CONFLICT ⇒ ลบรูปตัวเอง + `replayed: true`
- `loadPortalRepairs(token, q: { r?: string | null }, opts: { clientKey; now? }) → PortalRepairView | null` — `checkRateLimitDb("dorm:portal:view:" + clientKey, { limit: 120, windowMs: 600_000 })` → token → สัญญา live → `r` ระบุต้องเป็นงานของสัญญานี้ (ไม่ใช่ ⇒ `null`) · **ไม่เขียนอะไร** · ไม่มีไฟล์/ชื่อ/เบอร์ · งานของสัญญาเดิมในห้องเดียวกันไม่แสดง (กรอง `leaseId` — ผู้เช่าใหม่ไม่เห็นของคนเก่า)
- `ratePortalRepair(token, i: { repairId; rating: number; note?: string | null }, opts: { clientKey; now? }) → { ok: true } | RepairFail` — ถัง submit → token → งานของสัญญานี้ (ไม่ใช่ ⇒ `NOT_FOUND` **ก่อน** ตรวจสถานะ) → รูปค่า (`INVALID_INPUT`) → ไม่ DONE ⇒ `NOT_DONE` → `UPDATE … SET rating, "ratingNote" WHERE id AND "tenantId" AND "leaseId" AND status='DONE' AND rating IS NULL` (นับ 1 = ok · 0 ⇒ `ALREADY_RATED`) + audit
- `repairPortalUrl(ctx: { tenantId }, i: { leaseId; repairId?: string | null }, opts?: { now? }) → string` — **เซ็นเองด้วย `signLink` (ห้าม import `dorm-portal.ts`/platform ใด ๆ — S-11)** · สัญญา live + `SESSION_SECRET` ⇒ `<origin>/d/<token>/repair[?r=<id>]` (origin = `APP_URL` → `NEXT_PUBLIC_APP_URL` → สัมพัทธ์) · อื่น ⇒ `""` · ไม่ throw
### 3.2 พนักงาน (ด่าน §2 ข้อ 11 ทุกตัว)
- `listDormRepairs(ctx: RepairCtx, i: { unitId; status?: "ACTIVE" | "DONE" | "ALL" }, opts?: { now? }) → { ok: true; unitName; rows: RepairRow[]; counts: { open; inProgress; done; cancelled } } | RepairFail` — ACTIVE (ค่าเริ่ม) = OPEN+IN_PROGRESS · counts = ทุกสถานะ **ในขอบเขต** (ไม่ขึ้นกับ status) · ≤ 500 แถว · **ไม่มีลิงก์ไฟล์** (photoCount เท่านั้น)
- `dormRepairJob(ctx, i: { unitId; repairId }, opts?) → { ok: true; job: RepairJob } | RepairFail` — มือถือช่าง (หอ 13ค) · `boardName` = ชื่อบอร์ดของหมวด (#59) · `canComplete` = OPEN/IN_PROGRESS
- `completeDormRepair(ctx, i: { unitId; repairId; afterPhotos?: RepairFile[] }, opts?: { now?; deps? }) → { ok: true; repairId; doneAt } | RepairFail` — รูปหลังซ่อม (≤ 4 · กติกาเดียวกับ 3.1 · ผิด ⇒ `INVALID_FILE` สถานะไม่เปลี่ยน) อัปก่อน tx → CAS `status IN ('OPEN','IN_PROGRESS') → DONE` (`doneAt = now` · ต่อ `files` role AFTER) + event done + audit (`source: "STAFF"`) · แพ้ ⇒ ลบรูปตัวเอง + `ALREADY_DONE` · พร้อมกัน N ทาง/หลายโพรเซส ⇒ **ok 1 พอดี**
### 3.3 สถานะจากการ์ด (สะพานเรียก · ไม่มีด่านผู้ใช้ · ตรวจร้านเสมอ · ไม่ throw)
- `linkRepairCard(ctx: { tenantId }, i: { repairId; cardId }) → Promise<boolean>` — CAS `"kanbanCardId" IS NULL`
- `applyRepairCardState(ctx: { tenantId }, i: { repairId; cardId; state: "IN_PROGRESS" | "DONE"; actorUserId?: string | null; source?: "CARD" | "SWEEP" }, opts?: { now? }) → Promise<{ changed: boolean }>` — งานต้องเป็นของร้านนี้และ `kanbanCardId` ว่างหรือ = cardId · IN_PROGRESS: CAS จาก OPEN · DONE: CAS จาก OPEN/IN_PROGRESS + event done + audit (ใน tx เดียว)
### 3.4 ข้อความ · consumer · งานตามเวลา
- `sendRepairDoneNotice(ctx: { tenantId }, i: { repairId }, opts?: { now? }) → Promise<{ status: string; dedupeKey: string | null; duplicate: boolean }>` — อ่านสด: ไม่พบ (ร้านนี้) ⇒ `NOT_FOUND` · ไม่ DONE ⇒ `NOT_DONE` · สัญญาของงานไม่ live ⇒ `NO_LEASE` (3 ข้อนี้ `dedupeKey: null` ไม่เขียน log) ⇒ `notifyCustomer({ tenantId }, { unitId, domain: "rooms", messageKey: "repairDone", partyId: lease.partyId, vars: { tenantName, roomNo, unitName, ticketNo }, buttons: url https ? [{ label: "ให้คะแนนงานซ่อม", kind: "uri", data: repairPortalUrl(...?r=) }] : undefined, dedupeKey: "rooms:repairDone:<id>", at: now, precheck })` — `precheck` อ่านสดซ้ำ (ยัง DONE + สัญญายัง live ⇒ ไม่งั้น `{ ok: false, reason: "LEASE_ENDED" }`)
- `onRepairDone(evt) → Promise<void>` — `type === "dorm.repair.done"` ⇒ `sendRepairDoneNotice(..., { now: new Date() })` · อื่น = ไม่ทำอะไร · ไม่ throw · ซ้ำ/พร้อมกัน = ข้อความเดียว (X4)
- `runDormRepairJobs(now, opts?: { tenantId?; budgetMs?; signal? }) → Promise<{ resent: number }>` — แถว `ServiceMessageLog` rooms/`repairDone` สถานะ `SKIPPED_QUIET`/`FAILED` · `at ≥ now − 3 วัน` · **keyset `(at, id)` วนหน้าจนหมดงบ** (บทเรียน D.17/D.18 — ห้าม LIMIT N ก้อนเดียว) · `SKIPPED_QUIET` ที่ยังอยู่ในเวลาเงียบ (ตาม `now`) ข้าม · ส่งสด (`sendRepairDoneNotice(…, { now })`) · ส่งไม่ได้แล้ว (NOT_FOUND/NOT_DONE/NO_LEASE) หรือ FAILED เกินเพดานลองซ้ำ ⇒ **ปิดแถวเป็น `SKIPPED_PRECHECK_<เหตุ>`** (สถานะจบ — ไม่ยึดช่องรอบหน้า) · งานซ้อน/หลายโพรเซส = ข้อความ 1 (X5) · เคารพ `budgetMs`/`signal` · ไม่ throw · `opts.tenantId` จำกัดร้าน

## 4. สะพาน — `src/lib/platform/kanban-bridges.ts` (บล็อก `// SVC D.16 ▸ … // ◂ SVC D.16` ท้ายไฟล์ · ถือกติกาหัวไฟล์ 1–7)
```ts
export async function onDormRepairCreated(evt: BridgeEvent): Promise<void>;        // dorm.repair.created → การ์ด
export async function onDormRepairDone(evt: BridgeEvent): Promise<void>;           // dorm.repair.done → ย้ายการ์ดเข้าคอลัมน์เสร็จ (closeCard) ถ้ายังไม่เสร็จ
export async function onDormRepairCardMoved(evt: BridgeEvent): Promise<void>;      // kanban.card.moved → IN_PROGRESS (คอลัมน์ปลายทางไม่ใช่คอลัมน์เสร็จ)
export async function onDormRepairCardCompleted(evt: BridgeEvent): Promise<void>;  // kanban.card.completed → DONE
export async function sweepDormRepairCards(now: Date, opts?: { tenantId?: string; budgetMs?: number; signal?: AbortSignal }): Promise<{ created: number; reconciled: number }>;
```
- **ทุก export ใหม่ที่อ้าง `integrationsFor` ต้องเรียกก่อน `prisma.` ตัวแรก** (ข้อสอบ K3.3-S2.2 แยกฟังก์ชันด้วย `export async function` แล้วเทียบตำแหน่ง) — handler: บรรทัดแรก `if (!(await integrationsFor(evt.tenantId)).length) return;` · ตัวกวาดข้ามร้านไม่ต้องอ้างคำนี้ (ใช้ตัวช่วยของตัวเองหาร้านที่มีระบบ KANBAN)
- อ่าน `DormRepair`/`HotelRoom`/ค่าตั้งได้ (แบบสะพานอื่นอ่านตารางต้นทาง) · **เขียนคำแจ้งผ่าน facade เท่านั้น** (`linkRepairCard` · `applyRepairCardState`) · **ไม่แนบไฟล์** · ไม่ import storage
- การ์ด: `createCardFromExternal(systemCtx, { boardId, columnId: คอลัมน์แรก, title: "ห้อง <เลข> · <ป้ายหมวด> · <ข้อความ ≤ 60>", description: HTML escape (ข้อความเต็ม · "ห้ามเข้าห้องตอนผู้เช่าไม่อยู่ — นัดเวลาก่อน" หรือ "ผู้เช่าอนุญาตให้เข้าห้องตอนไม่อยู่" · เวลาสะดวก · เลขงาน · ลิงก์จอช่าง `/app/u/<slug>/dorm/repairs/<id>`), assigneeUserIds, sourceType: "AUTOMATION", sourceKey: "dorm.repair#<id>" })` → `linkRepairCard` · ไม่มีชื่อ/เบอร์ผู้เช่า
- moved/completed: อ่านการ์ดจาก `payload.cardId` **ในร้านของ evt** → `sourceKey` ขึ้นต้น `dorm.repair#` → `applyRepairCardState` (ร้านเดียวกับการ์ด) · อื่น = return
- ตัวกวาด (minute-job `dorm.repair.cards`): (ก) คำแจ้ง OPEN/IN_PROGRESS ที่ `kanbanCardId IS NULL` และ `createdAt ≥ now − 14 วัน` ⇒ สร้างการ์ด · (ข) คำแจ้งที่การ์ดอยู่คอลัมน์เสร็จ/`completedAt ≠ null` แต่ยังไม่ DONE (JOIN ใน SQL — สแกนเฉพาะแถวที่ทำได้) ⇒ `applyRepairCardState(DONE, source "SWEEP")` · **keyset `(createdAt, id)` วนหน้าจนหมดงบ + แคชผลหาบอร์ดต่อ (ร้าน, หน่วย, ชื่อบอร์ด) ในรอบ** — แถวที่ไม่มีบอร์ดถาวร 600 แถวต้องไม่บังงานปกติ (J-1) · ซ้อนกันได้ (unique sourceKey + CAS) · `opts.tenantId` จำกัดร้าน · ไม่ throw
## 5. สัญญา DOM (`renderToStaticMarkup` ได้ · ปุ่ม ≥ 44px · 390 ไม่ล้น · `import type` เท่านั้นจาก lib · ห้าม import `@/lib/modules/**` `@/lib/platform/**` `@/lib/core/db` `@prisma/client` `next/*` (ยกเว้น `next/link`) · ไม่มีเบอร์/ชื่อเต็ม/`private://`)
### 5.1 «DormPortalRepair.tsx» (หอ 05ค) — props `{ view: PortalRepairView; submitAction; rateAction }` (`(prev: unknown, fd: FormData) => Promise<unknown>`)
- ราก `[data-dorm-repair]` · หัว "แจ้งซ่อม · ห้อง <roomNumber>" · `form[data-repair-form]`: `input[type=radio][name=category]` ค่า = `categories[].code` (ป้ายไทย) · `textarea[name=text][maxlength=1000]` · `input[type=file][name=photos][accept="image/*"][multiple]` · `input[type=checkbox][name=allowEntry]` ("ให้ช่างเข้าห้องตอนฉันไม่อยู่ได้" · checked = `entryDefault`) · `input[name=preferredTime][maxlength=120]` · `input[type=hidden][name=idempotencyKey]` (สร้างครั้งเดียวต่อการเปิดฟอร์ม) · ปุ่ม "ส่งเรื่องแจ้งซ่อม"
- "เรื่องที่แจ้งไว้": `[data-repair-item="<id>"]` `data-status` + เลขงาน + หมวด + สถานะไทย · DONE และ `canRate` ⇒ `form[data-repair-rate="<id>"]` มี `input[type=radio][name=rating]` ค่า 1–5 ตามลำดับ + `input[type=hidden][name=repairId]` · ให้แล้ว ⇒ ดาว · ไม่มีลิงก์ไฟล์
### 5.2 «DormRepairs.tsx» — props `{ model: <ผลสำเร็จของ listDormRepairs>; basePath: string /* /app/u/<slug>/dorm */ }`
- ราก `[data-dorm-repairs]` · แถว `a[data-repair-row="<id>"][href="<basePath>/repairs/<id>"]` `data-status` · ห้อง · หมวด · `[data-repair-entry="DENY|ALLOW"]` · ไม่มีการ์ด ⇒ `[data-repair-nocard]` ("ยังไม่มีการ์ดในบอร์ดงาน — ตั้งบอร์ดชื่อตามหมวดแจ้งซ่อม") · ว่าง ⇒ `[data-repairs-empty]`
### 5.3 «DormRepairJob.tsx» (หอ 13ค · มือถือ 390 · PARITY) — props `{ job: RepairJob; completeAction }`
- ราก `[data-repair-job="<id>"]` `data-status` · หัว "<เลขงาน> · การ์ดบอร์ดงาน "<boardName>"" + "<ห้อง> · <ข้อความ>" · รูป `img[data-repair-photo]` src = `photos[].url` (+ `afterPhotos`)
- `[data-repair-entry="DENY"]` "ห้ามเข้าตอนไม่อยู่ — นัดก่อน" / `ALLOW` "เข้าห้องได้ตอนผู้เช่าไม่อยู่" · `[data-repair-time]` เวลาสะดวก
- "ใครจ่ายค่าซ่อม": ชิป `[data-payer="DORM"]` "หอ" · `[data-payer="TENANT"]` "ผู้เช่า" — ตัวตามค่าตั้ง `data-on="true"` อีกตัว `"false"` · หมายเหตุ "ค่าเริ่มตั้งได้ต่อหมวดซ่อม · เรียกเก็บผู้เช่าต้องแนบรูปความเสียหาย"
- `canComplete` ⇒ `form[data-repair-complete]` มี `input[type=file][name=afterPhotos][accept="image/*"][capture="environment"][multiple]` + ปุ่ม "ซ่อมเสร็จ · แจ้งผู้เช่าทาง LINE" · DONE ⇒ ไม่มีฟอร์ม + "ซ่อมเสร็จแล้ว"
## 6. หน้า
1. `/d/[token]/repair` (server · สาธารณะ): `loadPortalRepairs(token, { r: searchParams.r ?? null }, { clientKey: portalClientKey(await headers()) })` → `null` ⇒ `notFound()` · `force-dynamic` · `metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" }` · actions.ts `"use server"`: `submitRepairAction(token, prev, fd)` · `rateRepairAction(token, prev, fd)` — ไฟล์จาก `fd.getAll("photos")` เป็น `{ size, contentType, read: () => file.arrayBuffer().then(b => new Uint8Array(b)) }` · ไม่ส่ง deps/tenantId · ห้าม `requireUnit`/`getSession`/`@/lib/core/db`/`@prisma/*`
2. `/app/u/[unitSlug]/dorm/repairs` + `/[repairId]` (server · `force-dynamic`): `requireUnit` · `unit.type !== "DORM"` ⇒ `notFound()` · ผลไม่ ok ⇒ `notFound()` · actions.ts `"use server"` export async function เท่านั้น: `completeRepairAction(unitSlug, repairId, prev, fd)` — ร้าน/ผู้กระทำจาก session · ไม่รับ tenantId/unitId/actor จากฟอร์ม · ไม่ส่ง deps · `revalidatePath`
## 7. ไม่ใช่ของใบนี้ / หนี้ส่งต่อ
- คลิปวิดีโอ (R4) · เลขงานลำดับ (R2) · เลือกผู้จ่ายรายงาน + เรียกเก็บในบิล (R3 · D.8) · ค่าอะไหล่เบิกคลัง/ลงค่าใช้จ่าย (A10 🔜) · นัดเวลา + ผู้เช่ายืนยันใน LINE ("ณัฐชายืนยันใน LINE ✓" ในภาพ 13ค) · พนักงานบันทึกแจ้งซ่อมแทนผู้เช่า · ยกเลิกคำแจ้ง (ผู้เช่า/พนักงาน) · แจ้งพนักงานเมื่อมีคำแจ้งใหม่ · เปิดคำแจ้งใหม่เมื่อการ์ดถูกเปิดซ้ำ (R6) · ปุ่ม "แจ้งซ่อมใหม่" ของหน้าแรกหอชี้ `?status=REPAIR` (ไฟล์ D.13 — D.15)
## 8. ฉาก svcqc «scripts/svc-qc-repair-scene.mts» (builder · ค่าจาก `SQC_DORM_REPAIR_SCENE` เท่านั้น)
- ต้องมีฉาก D.13 ก่อน (หน่วยหอ svcqc · สัญญา ACTIVE ห้อง 204) · ไม่พร้อม ⇒ exit 3 + เหตุผล
- แถว `DormRepair` id ตายตัว `sqcd16-rep-204`: ห้อง 204 · `leaseId/partyId` = สัญญา ACTIVE ของห้อง · ประปา · ข้อความ/เวลาสะดวก/ห้ามเข้า ตามบล็อก · **IN_PROGRESS** (ไม่ขยับ "แจ้งซ่อมใหม่" ของ D.13 ที่นับ OPEN) · `files` null · `kanbanCardId` null
- **ไม่เขียน** SettingValue · AppSystem · บอร์ด/การ์ด · OutboxEvent · ServiceMessageLog (svcqc ไม่มีระบบบอร์ดงาน ⇒ จอช่างขึ้น "ยังไม่มีการ์ด" = ถูกต้อง)
- idempotent: `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}` (รันซ้ำ = 0/0/0) · `--clear` ลบเฉพาะแถวฉาก
## 9. ข้อสอบ (กลุ่ม) — «scripts/qc-svc-d.16.mts» (85 ข้อ)
S โครงสร้าง/ไฟล์/ทะเบียน/สะพาน/สิทธิ์/งาน/หน้า/สุขอนามัย (S-1/S-2/S-18 git ตอนรับใบ) · PC ตัวควบคุม 9 · R แจ้ง (แถว/รูป/event · ซ้ำ · พร้อมกัน 14 ทาง 3 โพรเซส · input/ไฟล์ · X7 ไม่พบเดียวกัน + ไม่อ่านไบต์ · rate ก่อน token · เพดานค้าง) · K การ์ด (1 ใบ · X4 · consumer+กวาดพร้อมกัน · ป้ายเข้าห้อง/ผู้รับผิดชอบ · ไม่มีบอร์ด → กวาดเติม · ร้านไม่มีบอร์ดงาน · ย้าย → กำลังซ่อม · เสร็จ → DONE+LINE ครั้งเดียว · เปิดซ้ำ/ปิดซ้ำ · การ์ดปลอมข้ามร้าน · ช่างกดเสร็จพร้อมกัน 10 ทาง · กวาดตามการ์ดเสร็จเงียบ) · N LINE (เนื้อหา/ลิงก์ · สัญญาจบ · ยังไม่เสร็จ · เวลาเงียบ+ส่งซ้ำ) · T คะแนน (ครั้งเดียว · พร้อมกัน 10 · ค่าผิด · ข้ามสัญญา) · X ขอบเขต (ไม่พบเดียวกัน 14 กรณี · รายการตามอาคาร · ผู้เช่าใหม่ห้องเดิม · ชื่อแรก/ผู้จ่าย) · P postback · F รูปส่วนตัว · U DOM 4 · J งานตามเวลา (กวาดไม่อดอยาก 600 แถว · X5 · ส่งซ้ำไม่อดอยาก 450 แถว · จำกัดร้าน/งบหมด) · M PII · Z · Q ฉาก · V ภาพ · G regression
- regression (G · หลังล้าง): `qc-svc-d.9` · `qc-svc-d.13` · `qc-svc-d.17` · `qc-svc-d.18` (ทั้งหมด `--no-regression` · ยอม FAIL เฉพาะ S-1/S-2 = "ไฟล์ของใบนั้น" + d.18 S-13 (นับบรรทัดที่ลบใน `outbox-consumers.ts` เทียบ HEAD) · d.13 ไม่ยอมเลย) · `qc-kanban-k3.3` (สะพานขาเข้า — ยอมเฉพาะ `K3.3-S9.2` ภาพ ซึ่งแดงตั้งแต่ฐาน a57e0ed4 · 14/15) · `qc-kanban-k3.4` (ขาออก `kanban.card.completed` — ฐาน 11/11) · `qc-svc-smoke`
- ผู้คุม: typecheck + fitness 2 โหมด · ตรวจรอบเดียว — **ผู้ตรวจต้องยิง probe**: X1 (ผู้ดูแลอาคารอื่น · token ร้านอื่น/สัญญาอื่น) · X3/X4 (consumer `kanban.card.completed` + ช่างกดเสร็จ หลายโพรเซสพร้อมกัน ⇒ LINE 1) · X10 (ลิงก์รูปของคนอื่น) · อดอยาก (ตัวกวาด/ส่งซ้ำ ด้วยแถวค้างถาวร > 1 หน้า)
## 10. X ที่เกี่ยว
X1 (R-5 T-4 X-1 X-3 K-10) · X3 (R-3 K-11 T-2) · X4 (K-2 K-8 N) · X5 (J-2 · K-3) · X6 (R-4 ชนิด/ขนาด/ไบต์หัว/ขนาดรวม) · X7 (R-5 R-6 · rate ก่อน token · ผิด = คำตอบเดียว) · X8 (M-1 payload/audit/log ไม่มีชื่อ/เบอร์/ข้อความผู้เช่า · M-3 การ์ด) · X9 (ปิดงาน/ให้คะแนน มี audit) · X10 (F-1 F-2 · พอร์ทัล/การ์ดไม่มีไฟล์) · ไม่เกี่ยว: เงิน/GL (ไม่มีเงิน — ค่าซ่อมเป็นหนี้ R3)
## 11. คำขอให้ผู้คุมเคาะ (ค่าปลอดภัยใช้ไปก่อน · ข้อสอบเขียนตามค่าปลอดภัย)
- **R1 (schema) คีย์ส่งซ้ำ**: ไม่มีคอลัมน์ ⇒ ทาง ก "id คำนวณจาก (ร้าน, สัญญา, คีย์)" (§2 ข้อ 1 · แบบ D.18 R1) · ทาง ข = ใบแก้ D.0 `submitKey String?` + `@@unique([leaseId, submitKey])` — ข้อสอบตรวจพฤติกรรมเท่านั้น
- **R2 (schema) เลขงาน**: ไม่มีคอลัมน์ลำดับ ⇒ `R-<6 ตัวท้ายของ id>` (ภาพ 13ค ใช้ "R-1041") · ทาง ข = `ticketNo Int` ต่อหน่วย (migration D.0 + ตัวนับ SQL คำสั่งเดียว)
- **R3 (schema) ใครจ่ายรายงาน**: ไม่มีคอลัมน์ ⇒ แสดงค่าตามหมวด (#60) อ่านอย่างเดียว · การเลือกบนมือถือ + ยอดอะไหล่ ("วาล์ว + เทปพันเกลียว ฿180") + เรียกเก็บในบิลเดือนหน้า = ใบใหม่ (migration `payer`/`partsSatang` + D.8 บรรทัดบิล + ตรวจเข้ม เพราะเป็นเงิน + J3 หลักฐานความเสียหาย)
- **R4 (storage) คลิป**: `ALLOWED_TYPES` ไม่มี `video/*` และ body action 12 MB ⇒ ใบนี้รับรูปเท่านั้น · ทาง ข = ใบแก้ storage (core) เพิ่ม `video/mp4`/`video/quicktime` + อัปโหลดตรง (presigned) — แบบ 05ค/13ค มี "คลิป 0:08"
- **R5 สวิตช์บอร์ดงาน**: ไม่เพิ่มคีย์ใน `KanbanIntegrations` (แตะโมดูลบอร์ดงาน + ข้อสอบ K3.1) ⇒ สวิตช์ = ร้านมีระบบ KANBAN + มีบอร์ดชื่อตามหมวด · ไม่ตกไปบอร์ดอื่น (ต่างจาก D.6 `pickBoard` ที่ตกไปบอร์ดเก่าสุด — เคาะว่าให้ตรงกันไหม)
- **R6 DONE เป็นสถานะจบ** (เปิดการ์ดซ้ำไม่เปิดคำแจ้ง) · ทางเลือก: เปิดซ้ำ ⇒ IN_PROGRESS + LINE "ซ่อมเสร็จ" รอบสองด้วยคีย์ใหม่
- **R7 IN_PROGRESS = ย้ายการ์ดไปคอลัมน์ไม่เสร็จใดก็ได้** (ไม่มี LINE "รับเรื่องแล้ว/กำลังซ่อม") · ทางเลือก: แม่แบบใหม่ `rooms.msg.repairStarted`
- **R8 ให้คะแนนในพอร์ทัลเท่านั้น** (ปุ่ม uri ใน LINE) · ทางเลือก: postback ดาว 1–5 ใน LINE
- **R9 ไม่มี migration · ไม่มีค่าตั้งใหม่** (ทุกนโยบายมีแล้ว #59–#61) · เพดานงานค้าง 10 = ค่าคงที่
- **R10 ไม่ส่ง LINE ตอนรับแจ้ง** · ทางเลือก: แม่แบบ `rooms.msg.repairReceived`
- **R11 ฉาก svcqc = IN_PROGRESS ไม่มีการ์ด/รูป** (svcqc ไม่มีระบบบอร์ดงาน · ภาพ PARITY จึงไม่มีรูปผู้เช่า/คลิป) · ทางเลือก: ฉากเพิ่มระบบ KANBAN บน svcqc (เสี่ยงกระทบชุดอื่นที่นับระบบของร้าน)
- **R12 ระดับตรวจ เบา 1 รอบ** ตามแผน — แต่ probe X1/X3/X4/X10/อดอยาก บังคับ (§9)
## 12. คำถามกฎหมาย/PDPA (เพิ่มใน `ledger/wo-notes/svc-legal-questions.md` ตอนรับใบ)
- J3: บันทึก "อนุญาตเข้าห้องตอนไม่อยู่" ต่อคำแจ้ง = หลักฐานพอไหม (#61) · ควรมีบันทึกเวลาเข้าจริง/ผู้เข้า · กรณีฉุกเฉิน (น้ำรั่วลงห้องล่าง) ต้องบันทึกอะไร
- J3: เรียกเก็บค่าซ่อมจากผู้เช่า (#60 "TENANT") ต้องมีหลักฐานความเสียหายแบบไหน · ห้ามคิดค่าเสื่อมปกติ (ใบนี้แสดงอย่างเดียว ไม่เรียกเก็บ)
- J5: รูปในห้องผู้เช่า (อาจมีของส่วนตัว/บุคคล) เก็บเป็นไฟล์ส่วนตัว — ระยะเก็บ · ลบเมื่อสัญญาจบกี่วัน · ต้องแจ้งในสัญญาไหม
- J5: ข้อความ "ซ่อมเสร็จ" + ลิงก์ให้คะแนน = ข้อความบริการ (ไม่มีโปรโมชัน) — ยืนยันตาม CC §4.4 · คะแนน/หมายเหตุของผู้เช่าเป็นข้อมูลส่วนบุคคลไหม

## มติผู้คุม (31 ต.ค. 2569)
- R1 ✅ id แถวคำนวณจาก (ร้าน, สัญญา, คีย์) แบบ D.18 · R2 ✅ เลขงาน `R-` + 6 ตัวท้าย id (ไม่มี migration)
- R3 ✅ ใครจ่ายแสดงตาม #60 อ่านอย่างเดียว · การเรียกเก็บค่าซ่อม/อะไหล่ในบิล = ใบใหม่ตรวจเข้ม (หนี้ → หลัง D.15)
- R4 ✅ รับรูปเท่านั้น · คลิป = ใบแก้ storage ภายหลัง (หนี้)
- R5 ✅ ไม่มีบอร์ดหมวดตาม #59 ⇒ ไม่สร้างการ์ด รองานกวาดเติม (ไม่ตกไปบอร์ดเก่าสุด) · D.6 pickBoard คงเดิม · ความต่างนี้จดเป็นหนี้ให้รวมแบบใน D.20
- R6–R12 ✅ ตามที่เสนอ · ผู้ตรวจยิง probe X1/หลายโพรเซส/ลิงก์รูป/งานอดอยาก
- J3/J5 §12 ⇒ เพิ่ม svc-legal-questions.md ตอนรับใบ
- เลน l3 ทดสอบบนฐาน wo-svc-qc-l3 · รับใบเมื่อผู้คุมรันซ้ำบนฐานหลักหลัง merge
