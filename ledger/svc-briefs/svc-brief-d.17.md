# ใบสั่ง D.17 — ประกาศ + อ่านแล้ว (ทั้งตึก/อาคาร/ชั้น/ห้อง · LINE + พอร์ทัล · นับอ่านไม่ซ้ำ) · ตรวจ: **เบา** (รอบเดียว — แต่ X1 แยกร้าน/หน่วย/อาคาร + สคบ. ห้ามตัด)

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` D.17 (พึ่ง D.9) · แบบ: `ledger/DESIGN-DORM-HOTEL.md` §6 A10 ("ประกาศ: ทั้งตึก/ชั้น/ห้อง · อ่านแล้วกี่คน") + A6 (เมนูล่าง "ประกาศ") + ภาคผนวก ก หอ #38 (แม่แบบ "ประกาศ" + ตัวตรวจคำ) #39 (เวลาเงียบ) #64 (ผู้ดูแลเห็นเฉพาะอาคาร) · **ไม่มีภาพแบบ** (README `ledger/design-dorm/` ไม่มีจอประกาศ — MASTER-PLAN คอลัมน์ภาพ "—") ⇒ สัญญา DOM §4 กำหนดจากข้อความแบบ · ไม่มี PARITY
> สัญญากลาง: `ledger/SVC-CORE-CONTRACT.md` §4.4 (`notifyCustomer` ประตูเดียว · `ServiceMessageLog` unique (tenantId, dedupeKey) · ข้อความบริการห้ามมีเนื้อหาการตลาด) §4.5 (`signLink`) §7 (`dorm.announcement.published`) §8 (`dorm.announce`) + ภาคต่อ 28 ต.ค.
> ต่อจาก: **D.9** `svc-brief-d.9.md` §3.0 (นิยาม "สัญญา live") §3.1 (ลำดับด่าน token X7) §3.3 (postback `dorm.announce` ตอนนี้ตอบข้อความคงที่) + มติ 30 ต.ค. (`precheck` ของ `notifyCustomer`) · **D.11** `svc-brief-d.11.md` มติ 11 (ตรวจคำต้องห้ามบนข้อความก่อนส่งทุกครั้ง · แม่แบบที่หลุดเข้าฐาน = ไม่ส่ง) · **D.13** `svc-brief-d.13.md` §3 (ขอบเขตอาคาร #64 · fail closed) §5 (`dorm.announce` อยู่ใน planned + แถว "ประกาศ · พัสดุ" ของตาราง 17) · `ledger/wo-notes/svc-legal-questions.md`
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-d.17.mts» — รับใบ = **ผ่านทุกข้อ** (นับจาก `JSON_SUMMARY`) · SKIP ที่ยอมได้ระหว่างทำ: `G-*` (`--no-regression`) · `V-1` (ไม่มี `QC_BASE`) · `S-1`/`S-2` (หลัง merge เท่านั้น)
> รัน: `cd /root/projects/shark-svc-l3 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.17.mts [--no-regression]` (ห้าม `timeout` ครอบ · ห้าม kill กลางคัน — ล้างข้อมูลใน finally · gate lock ใช้ร่วม รอได้) · ข้อสอบเปิดตัวจำลอง LINE เอง (127.0.0.1 + `LINE_API_BASE`) · `APP_URL=https://qc-d17.invalid` · บล็อกคำขอนอกเครื่อง — **ไม่ยิง LINE จริง**
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม `prisma generate`/migration/แตะ `prisma/**` · ห้ามแก้ข้อสอบ/`scripts/**`** · เลน l3 · temp ขึ้นต้น `svc-d17-` · รายงานต่อข้อ (id → ผล)
> ผู้เขียนข้อสอบแก้ให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` บล็อก `SVC D.17` (`SQC_DORM_ANNOUNCE` · `SQC_VISUAL_SPECS["d.17"]`)
> **ไม่มี migration** — ตาราง `DormAnnouncement` + `DormAnnouncementRead` (unique `[announcementId, partyId]`) มีแล้วจาก D.0 · ขาดคอลัมน์ = หยุดถามผู้คุม

---

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ S-1/S-2 ไล่ `git status`)

| ไฟล์ | | ทำอะไร |
|---|---|---|
| «src/lib/modules/dorm/announce.ts» | ใหม่ (server) | §3.2 ฝั่งพนักงาน (ร่าง · แก้ร่าง · ดูผู้รับ · เผยแพร่ · สถิติ · โมเดลหน้า) + ตัวอ่านไม่มีผู้กระทำที่ platform ใช้ (ผู้รับ · ประกาศที่สัญญาเห็น · บันทึกอ่าน) — `tenantDb` เท่านั้น (ห้าม `import { prisma }`) · ชื่อฟังก์ชันภายในเลือกเอง |
| `src/lib/modules/dorm/index.ts` | แก้ (เพิ่มบล็อกท้ายไฟล์เท่านั้น) | export ของ §3.2 + ตัวอ่านภายในที่ platform ใช้ · ห้ามแตะบรรทัดของใบอื่น (D.10/D.12 เพิ่มบล็อกของตัวเองพร้อมกัน — ผู้คุมรวม) |
| «src/lib/platform/dorm-announce.ts» | ใหม่ (server) | §3.3 ส่ง LINE (`notifyCustomer` + `precheck`) · consumer · งานส่งซ้ำ · พอร์ทัล (ลิงก์เซ็นของ D.9) · คำตอบเมนู "ประกาศ" · ส่งซ้ำจากจอพนักงาน — ห้าม `import { prisma }` ดิบ (ใช้ facade `@/lib/modules/dorm` · `@/lib/core/signed-link` · `@/lib/core/settings` · `@/lib/platform/notify-customer`) |
| «src/app/app/u/[unitSlug]/dorm/announce/page.tsx» · «actions.ts» | ใหม่ | §5 จอพนักงาน (server) · actions `"use server"` export async function เท่านั้น |
| «src/components/dorm/DormAnnounce.tsx» | ใหม่ `'use client'` | §4.1 |
| «src/app/(store)/d/[token]/news/page.tsx» · «actions.ts» | ใหม่ | §5 หน้าประกาศของผู้เช่า (สาธารณะ · ลิงก์เซ็นเดียวกับพอร์ทัล D.9) |
| «src/components/dorm/portal/DormPortalNews.tsx» | ใหม่ `'use client'` | §4.2 |
| `src/lib/core/settings/defs/rooms.ts` | แก้ (เพิ่ม 2 def ในบล็อก `// SVC D.17 ▸ … ◂`) | §2 |
| `src/lib/core/permissions.ts` | แก้ **บรรทัดเดียว** | เอา `"dorm.announce"` ออกจาก `planned` ของโมดูล dorm (ป้ายไทยเดิมคงไว้) |
| `src/lib/outbox-consumers.ts` | แก้ (เพิ่มบรรทัด) | `"dorm.announcement.published": withAutomation(async (evt) => (await import("@/lib/platform/dorm-announce")).onDormAnnouncementPublished(evt))` + คอมเมนต์ payload |
| `src/lib/automation/labels.ts` | แก้ (เพิ่มบรรทัด) | `{ value: "dorm.announcement.published", label: "<ไทย>" }` + คอมเมนต์ payload · **ห้ามแตะ `src/lib/webhooks/labels.ts`** (ได้จาก spread — ประกาศซ้ำ = ช่องติ๊ก 2 แถว) |
| `src/lib/platform/minute-jobs.ts` | แก้ (เพิ่มบล็อกเดียว) | งาน `dorm.announce` ทุก 5 นาที · lazy import `runDormAnnounceJobs` |
| `src/lib/platform/dorm-line.ts` | แก้ (เฉพาะ `case "announce"` ใน `onDormPostback`) | ตอบด้วย `dormAnnounceMenuReply` (dynamic import `./dorm-announce` หรือ `@/lib/platform/dorm-announce`) · ลบบรรทัดเดิมได้ ≤ 2 (คอมเมนต์ `default:`) · ส่วนอื่นห้ามแตะ (S-15) |

**ห้ามแตะ**: `prisma/**` · `src/lib/core/**` นอก `defs/rooms.ts` + `permissions.ts` · `src/lib/platform/notify-customer.ts` · `src/lib/platform/dorm-portal.ts` (D.9/D.10) · `src/lib/platform/postback-routes.ts` · `src/lib/modules/chat/**` · `src/lib/payment/**` · `src/lib/modules/account/**` · `src/lib/modules/dorm/*` นอก `announce.ts` + `index.ts` (โดยเฉพาะ `portal.ts` `scope.ts` `access.ts` `lease.ts` `billing.ts` `dunning.ts`) · `src/components/dorm/{dorm-home-shared,dorm-policy-shared}.ts` · `DormPortal.tsx` · `src/app/(store)/d/[token]/{page,actions}.tsx|ts` · `src/lib/webhooks/labels.ts` · ไฟล์ของ D.10/D.12 ที่ยังไม่ merge
> ทำไมด่าน token เขียนใหม่ใน `dorm-announce.ts` (ไม่ export `gateLease` ของ D.9): `dorm-portal.ts` เป็นไฟล์ที่ D.10 กำลังแก้ (เลข RC/ยอดค้าง) — ใช้ชิ้นเดียวกันแทน: `checkRateLimitDb` (ถัง `dorm:portal:view:<clientKey>` ร่วมกับ D.9) → `verifyLink(token, "dorm.portal")` → `portalLiveLease` (facade dorm) ตามลำดับ §3.1 ของ D.9 ทุกตัว

## 2. ค่าตั้งใหม่ (ทะเบียน · ป้ายไทย · ชั้น UNIT · **กลุ่ม `notify` เดิม** ⇒ การ์ด 4 ของหน้า 17 แสดงเอง · d.13 R-7 ไม่แดง)
| คีย์ | ชนิด · schema | ค่าเริ่ม | ป้ายไทย (ตัวอย่าง) |
|---|---|---|---|
| `rooms.notify.announceLine` | bool | **true** | ส่งประกาศทาง LINE ของหอ (ปิด = แสดงในหน้าผู้เช่าอย่างเดียว) |
| `rooms.notify.announcePortalDays` | days · int 1–365 | **30** | แสดงประกาศในหน้าผู้เช่าย้อนหลัง (วัน) |

ค่าที่มีอยู่แล้วที่ใบนี้ใช้ (อ่านต่อคำขอ · ไม่แคชข้ามคำขอ): `rooms.msg.announcement` (แม่แบบ `{unitName}{title}{body}` — **ไม่เพิ่มตัวแปร** · ลิงก์ไปเป็นปุ่ม) · `rooms.notify.portalLinkDays` (อายุลิงก์ = ของ D.9) · `messaging.lineConnectionId` · `messaging.quietHours` · `messaging.channelOrder` · `rooms.access.managerScope` + `rooms.access.buildingAssignments` (ผ่าน `dormScopeFor`/`dormVisibleRoomIds` เดิม) · ห้ามฝังเลขนโยบาย (S-9: ไม่มีเลขวัน/นาทีของอายุในไฟล์)
ค่าคงที่ความปลอดภัย (ไม่ใช่นโยบายร้าน · ฝังได้): หัวเรื่อง ≤ 120 ตัวอักษร (ไม่มีขึ้นบรรทัด) · เนื้อหา ≤ 2,000 · เป้าหมาย ≤ 500 รายการ · เมนู LINE แสดง ≤ 3 ประกาศ · หน้าผู้เช่าแสดง ≤ 50 รายการ

## 3. สัญญา (ข้อสอบมีสำเนาชนิด — ชื่อ/ฟิลด์ต้องตรง)

### 3.0 นิยามกลาง
- **สัญญา live** = นิยาม D.9 §3.0 ทุกตัวอักษร (`ACTIVE|NOTICE` · `endedAt` ว่าง · `endDate` ว่างหรือ ≥ วันนี้ไทยของ `now` · หน่วย DORM ของร้าน) — ใช้ `portalLiveLease`/คิวรีเดียวกัน · DRAFT (ยังไม่เข้า) · ENDED · CANCELLED · เลยวันจบยังไม่ปิด = **ไม่ใช่ผู้รับ ไม่เห็นในพอร์ทัล**
- **กลุ่มเป้าหมาย** (`AnnounceAudience`) — ห้องที่นับ = `HotelRoom.active` ของหน่วย:
  - `{ kind: "ALL" }` ทั้งหน่วย · `{ kind: "BUILDING"; buildingIds }` · `{ kind: "FLOOR"; floors: { buildingId; floorNo }[] }` (ห้อง `buildingId` + `floorNo` ตรง) · `{ kind: "ROOM"; roomIds }`
  - เก็บใน `DormAnnouncement.audience` = kind · `audienceIds` = ALL ⇒ `null` · BUILDING/ROOM ⇒ `string[]` (ไม่ซ้ำ เรียง) · FLOOR ⇒ `{ buildingId, floorNo }[]` (ไม่ซ้ำ เรียง)
  - ห้องที่ปิดแล้ว (`active = false`) ของหน่วยเลือกเป็นเป้าหมายได้ แต่ไม่มีผู้รับ (ไม่นับ)
  - ทุก id ต้องเป็นของหน่วยนี้ **และ** อยู่ในขอบเขตอาคารของผู้กระทำ — ไม่ใช่ (ร้านอื่น · หน่วยอื่นของร้านเดียวกัน · อาคารที่ไม่ได้ดูแล · ขยะ) ⇒ `NOT_FOUND` **ผลเดียวกันทุกไบต์** กับหน่วย/ประกาศที่ไม่มี (X1)
- **ผู้รับ** (คิดสด ณ `now` ทุกครั้ง · ไม่เก็บรายชื่อ) = สัญญา live ที่ห้องอยู่ในกลุ่ม ⇒ จัดกลุ่มด้วย **Party ตัวจริง (canonical — `portalCanonicalParty`)** ⇒ 1 คน = 1 ข้อความ = 1 การอ่าน แม้เช่า 2 ห้องในกลุ่ม · สัญญาตัวแทนของคน = ห้องเลขน้อยสุด (ใช้ทำลิงก์)
- **ประกาศที่สัญญา L เห็น** (พอร์ทัล · เมนู · บันทึกอ่าน) = เผยแพร่แล้ว (`publishedAt ≤ now`) · ห้องของ L อยู่ในกลุ่ม (นิยามบน ณ ปัจจุบัน) · `publishedAt ≥ 00:00 ไทยของ L.startDate` (**ผู้เช่าใหม่ห้องเดิมไม่เห็นประกาศรายห้องของคนเก่า** — บทเรียน B.6) · `publishedAt ≥ now − rooms.notify.announcePortalDays` · หัวเรื่อง+เนื้อหาไม่มีคำต้องห้าม (แถวที่หลุดเข้าฐานไม่ถูกแสดง)
- **ตัวตรวจคำ** = `findForbiddenTerms` (`@/lib/core/settings/legal/th-rental-2568` — normalize แล้ว จับ "ตัด ไฟ"/"ตัด-ไฟ"/ข้ามบรรทัด) บน (1) หัวเรื่องดิบ (2) เนื้อหาดิบ (3) ข้อความที่ render แล้วด้วยแม่แบบ `rooms.msg.announcement` ปัจจุบันของหน่วย ทั้ง th/en (จับคำคร่อมรอยต่อหัวเรื่อง/เนื้อหา) · ตอนส่งตรวจซ้ำ + ตรวจตัวแม่แบบเอง (render ด้วยตัวแปรว่าง — แบบ D.11 `templateBlocked`)
- เวลาไทยผ่าน `bkkYmd`/`bkkParts` · ห้าม `.getDay/.getDate/.getMonth/.getHours/.getFullYear()` ดิบ · ป้ายวัน "3 พ.ย. 2569"

### 3.1 ชนิดร่วม (export จาก `announce.ts` + facade)
```ts
export type AnnounceAudience =
  | { kind: "ALL" } | { kind: "BUILDING"; buildingIds: string[] }
  | { kind: "FLOOR"; floors: { buildingId: string; floorNo: number }[] } | { kind: "ROOM"; roomIds: string[] };
export type AnnounceCtx = { tenantId: string; actorUserId: string };
export type AnnounceFail = { ok: false; code: "NOT_FOUND" | "BAD_INPUT" | "LEGAL_BLOCK" | "BAD_STATE"; reason: string; terms?: string[] };
export type AnnounceStats = { recipients: number; sent: number; waiting: number; noLine: number; reads: number };
```
- `reason` ภาษาไทยไม่โทษผู้ใช้ · `NOT_FOUND` = ข้อความเดียวทั้งไฟล์ · `LEGAL_BLOCK` มี `terms` = ผลของ `findForbiddenTerms` (ไม่เขียนคำต้องห้ามเป็นตัวอักษรในซอร์ส — S-11)
- **สถิติ**: `recipients` = ผู้รับ (§3.0) ณ `now` · `sent` = แถว `ServiceMessageLog` ของประกาศสถานะ `SENT` · `waiting` = `SKIPPED_QUIET|FAILED|SENDING` · `noLine` = `NO_CHANNEL|SKIPPED_CONSENT|QUOTA|SKIPPED_PRECHECK_*` · `reads` = แถว `DormAnnouncementRead` ของประกาศ · ร่าง ⇒ sent/waiting/noLine/reads = 0

### 3.2 ฝั่งพนักงาน — «modules/dorm/announce.ts» (ออกทาง `@/lib/modules/dorm`)
```ts
export async function createDormAnnouncement(ctx: AnnounceCtx, i: { unitId: string; title: string; body: string; audience: AnnounceAudience })
  : Promise<{ ok: true; announcementId: string } | AnnounceFail>;
export async function updateDormAnnouncement(ctx: AnnounceCtx, i: { unitId: string; announcementId: string; title: string; body: string; audience: AnnounceAudience })
  : Promise<{ ok: true } | AnnounceFail>;
export async function previewDormAnnouncement(ctx: AnnounceCtx, i: { unitId: string; announcementId: string }, opts?: { now?: Date })
  : Promise<{ ok: true; recipients: number; rooms: string[] /* เลขห้องของสัญญา live ที่ตรงกลุ่ม · เรียง · ไม่มีชื่อ */ } | AnnounceFail>;
export async function publishDormAnnouncement(ctx: AnnounceCtx, i: { unitId: string; announcementId: string }, opts?: { now?: Date })
  : Promise<{ ok: true; published: boolean /* false = มีคนเผยแพร่ไปแล้ว */; publishedAt: string /* ISO */ } | AnnounceFail>;
export async function dormAnnouncementStats(ctx: AnnounceCtx, i: { unitId: string; announcementId: string }, opts?: { now?: Date })
  : Promise<{ ok: true; stats: AnnounceStats } | AnnounceFail>;
export type DormAnnouncementRow = { id: string; title: string; status: "DRAFT" | "PUBLISHED"; audience: AnnounceAudience; audienceLabelTh: string; publishedAt: string | null; stats: AnnounceStats };
export type DormAnnounceModel = {
  unitId: string; unitName: string; basePath: string /* /app/u/<slug>/dorm */; canAll: boolean;
  options: { buildings: { id: string; name: string }[]; floors: { buildingId: string; buildingName: string; floorNo: number }[]; rooms: { id: string; number: string; buildingId: string | null; floorNo: number | null }[] };
  items: DormAnnouncementRow[];   // ใหม่ → เก่า (createdAt) · ≤ 100
};
// options: buildings = อาคารของหน่วย (ที่เห็น) · rooms = ห้อง active ที่เห็น · floors = คู่ (อาคาร, ชั้น) ที่ไม่ซ้ำของ rooms (ห้องไม่มีอาคาร/ชั้น ไม่ออกเป็นชั้น)
export async function dormAnnounceModel(ctx: AnnounceCtx, i: { unitId: string }, opts?: { now?: Date }): Promise<DormAnnounceModel | null>;
```
**ด่าน (ทุกฟังก์ชัน · ลำดับตายตัว)**: หน่วย `DORM` ของ `ctx.tenantId` → Membership **สด** (`acceptedAt` ไม่ว่าง) → `evaluate(m, { module: "dorm", action: "dorm.announce", unitId })` → ขอบเขตอาคาร (`dormScopeFor` + `dormVisibleRoomIds`) — ไม่ผ่านข้อใด ⇒ `NOT_FOUND` (model ⇒ `null`) ไม่เขียนอะไร
- **ผู้ถูกจำกัดอาคาร** (`visibleRooms ≠ null`): `canAll = false` · สร้าง/แก้เป็น `ALL` ⇒ `BAD_INPUT` ("เลือกอาคาร ชั้น หรือห้องที่คุณดูแล") · ประกาศที่ห้องเป้าหมาย **ไม่อยู่ในขอบเขตทั้งหมด** (รวม ALL ทุกฉบับ) ⇒ มองไม่เห็น: model ไม่มีแถว · stats/preview/publish/update ⇒ `NOT_FOUND` · `options` = เฉพาะอาคาร/ชั้น/ห้องที่เห็น
- `create`/`update`: ตรวจรูป (หัวเรื่อง trim 1–120 ไม่มี `\n` · เนื้อหา trim 1–2,000 · รายการเป้าหมาย 1–500 · `floorNo` int 0–200 — ผิด ⇒ `BAD_INPUT`) → id เป้าหมาย (§3.0 ⇒ `NOT_FOUND`) → ตัวตรวจคำ (⇒ `LEGAL_BLOCK` + `terms`) → เขียน (`publishedAt = null` · `createdById = actor`) · `update` เฉพาะร่าง (เผยแพร่แล้ว ⇒ `BAD_STATE` · แถวไม่เปลี่ยน)
- `publish`: ตรวจคำซ้ำ (แถวอาจถูกเขียนตรง) → tx เดียว: `updateMany({ where: { id, tenantId, unitId, publishedAt: null }, data: { publishedAt: now } })` (CAS) — count 1 ⇒ `emitOutbox(tx, { type: "dorm.announcement.published", idempotencyKey: "dorm.announcement.published:<id>", unitId, payload: { unitId, announcementId, audience: <kind> } })` + audit `dorm.announcement.published` (ids + kind เท่านั้น) · count 0 ⇒ `{ ok: true, published: false, publishedAt: <ของเดิม> }` · **ยิงพร้อมกัน N ทาง/หลายโพรเซส = เผยแพร่ 1 · event 1** (X3) · ไม่ส่ง LINE ในฟังก์ชันนี้ (consumer ส่ง)
- ไม่มีการลบ/ถอนประกาศในใบนี้ (หนี้ — §7)

### 3.3 ส่ง · พอร์ทัล · เมนู — «platform/dorm-announce.ts»
```ts
export type AnnounceSendResult = { status: "DONE" | "NOT_FOUND" | "NOT_PUBLISHED" | "DISABLED" | "TEMPLATE_BLOCKED";
  recipients: number; sent: number; quiet: number; duplicate: number; noLine: number; failed: number };
export async function sendDormAnnouncement(ctx: { tenantId: string }, i: { announcementId: string }, opts?: { now?: Date }): Promise<AnnounceSendResult>;
export async function resendDormAnnouncement(ctx: { tenantId: string; actorUserId: string }, i: { unitId: string; announcementId: string }, opts?: { now?: Date })
  : Promise<({ ok: true } & AnnounceSendResult) | { ok: false; code: "NOT_FOUND"; reason: string }>;
export async function onDormAnnouncementPublished(evt: { id: string; tenantId: string; type: string; payload: unknown; unitId: string | null }): Promise<void>;   // ไม่ throw
export async function runDormAnnounceJobs(now: Date, opts?: { tenantId?: string; budgetMs?: number; signal?: AbortSignal }): Promise<{ resent: number }>;
export async function announcementPortalUrl(ctx: { tenantId: string }, i: { leaseId: string; announcementId: string }, opts?: { now?: Date }): Promise<string>;
export type PortalNewsView = {
  unitName: string; roomNumber: string;
  items: { id: string; title: string; publishedAt: string; publishedLabel: string; current: boolean }[];   // ใหม่ → เก่า · ≤ 50
  detail: null | { id: string; title: string; body: string; publishedLabel: string };
  links: { self: string /* /d/<token>/news */; portal: string /* /d/<token> */ };
};
export async function loadPortalAnnouncements(token: string, q: { a?: string | null }, opts: PortalOpts): Promise<PortalNewsView | null>;
export async function markPortalAnnouncementRead(token: string, i: { announcementId: string }, opts: PortalOpts)
  : Promise<{ ok: true; counted: boolean } | { ok: false; code: "NOT_FOUND" | "RATE_LIMITED" }>;
export async function dormAnnounceMenuReply(ctx: { tenantId: string }, leases: { id: string; unitId: string; roomId: string; roomNumber: string; unitName: string; partyId: string }[], opts?: { now?: Date }): Promise<{ text: string }>;
```
**`sendDormAnnouncement` อ่านสดทุกครั้ง** (ห้ามเชื่อ payload ของ event · บทเรียน D.8 F1 / D.11 L1) — คืนข้อแรกที่เข้า (ก่อนถึง `notifyCustomer` = ไม่เขียน log):
1. ไม่พบในร้าน ⇒ `NOT_FOUND` · `publishedAt = null` ⇒ `NOT_PUBLISHED`
2. `rooms.notify.announceLine = false` (หน่วย) ⇒ `DISABLED`
3. ตัวตรวจคำ (หัวเรื่อง/เนื้อหาดิบ · แม่แบบดิบ · ข้อความ render th/en) พบ ⇒ `TEMPLATE_BLOCKED` + audit `dorm.announcement.blocked` (ids เท่านั้น) — **ไม่มีข้อความออก · ไม่มีแถว log**
4. ผู้รับ (§3.0 ณ `now`) ⇒ ต่อคน: `notifyCustomer({tenantId}, { unitId, domain: "rooms", messageKey: "announcement", partyId: <lease.partyId ของสัญญาตัวแทน>, vars: { unitName, title, body }, buttons: url ขึ้นต้น https ? [{ label: "อ่านประกาศ", kind: "uri", data: url }] : undefined, dedupeKey: "rooms:announcement:<announcementId>:<canonicalPartyId>", at: now, precheck })`
   - `url` = `announcementPortalUrl(ctx, { leaseId: <สัญญาตัวแทน>, announcementId })` = `<portalUrl ของ D.9>/news?a=<announcementId>` (อายุ = `rooms.notify.portalLinkDays` · ไม่ live ⇒ `""`)
   - `precheck` = สัญญาตัวแทนยัง live **และ** ประกาศยังเผยแพร่ ณ ตอนส่ง ⇒ ไม่ใช่ `{ ok: false, reason: "LEASE_ENDED" }` (แถว log = สถานะจบ `SKIPPED_PRECHECK_LEASE_ENDED`)
   - **ข้อความ/ปุ่มไม่มี**: ชื่อผู้เช่า · เบอร์ · ยอดเงิน · คำต้องห้าม · เนื้อหาการตลาด (CC §4.4 — ข้อความบริการ)
5. นับผล: `sent` (SENT) · `quiet` (SKIPPED_QUIET) · `duplicate` (`duplicate: true`) · `noLine` (NO_CHANNEL/SKIPPED_CONSENT/QUOTA/precheck) · `failed` · `status: "DONE"`
- ส่งซ้ำ/พร้อมกัน/หลายโพรเซส/consumer ซ้ำ = **ข้อความเดียวต่อคน** (dedupe ของ `notifyCustomer` · X4) · ผู้เช่าที่เข้าใหม่หลังเผยแพร่และห้องอยู่ในกลุ่ม ⇒ รอบส่งถัดไปได้ 1 ข้อความ (ผู้รับคิดสด)
- `resendDormAnnouncement` = ด่าน §3.2 (`dorm.announce` + ขอบเขตอาคาร · ไม่ผ่าน ⇒ `NOT_FOUND` **วัตถุเดียวกันทุกไบต์กับของ `announce.ts`** — `{ ok:false, code:"NOT_FOUND", reason }` reason เดียว ไม่มีฟิลด์อื่น) → `sendDormAnnouncement` · คนที่ได้แล้วไม่ได้ซ้ำ
- `onDormAnnouncementPublished`: `type === "dorm.announcement.published"` · ctx = `evt.tenantId` · `announcementId` จาก payload ⇒ `sendDormAnnouncement(…, { now: new Date() })` · ไม่ throw
- `runDormAnnounceJobs` (minute-job `dorm.announce` ทุก 5 นาที): ประกาศที่ `publishedAt ∈ [now − 3 วัน, now]` (จำกัดร้านด้วย `opts.tenantId`) **และ** (มีแถว log สถานะ `SKIPPED_QUIET`/`FAILED` หรือยังไม่มีแถว log เลย) ⇒ `sendDormAnnouncement(…, { now })` · งานซ้อน 2 รอบ = ส่งครั้งเดียว (X5) · คืนจำนวน SENT · เคารพ `budgetMs`/`signal` · ⚠️ หน้าต่างเวลาตัดสินจาก `publishedAt` (ไม่ใช่ `ServiceMessageLog.at` ซึ่งเป็นเวลาเครื่องจริง)
- **ด่าน token** (`loadPortalAnnouncements` · `markPortalAnnouncementRead`) = ลำดับ D.9 §3.1 ข้อ 1–3 ทุกตัว: `checkRateLimitDb("dorm:portal:view:" + clientKey, PORTAL_RATE.view, now)` (เกิน ⇒ `null` / `RATE_LIMITED`) → `verifyLink(token, "dorm.portal")` → สัญญา live ในร้านของ token → ข้อ 4' ประกาศที่ระบุต้อง "สัญญานี้เห็น" (§3.0) — ล้มข้อ 2–4' ⇒ `null` / `{ ok: false, code: "NOT_FOUND" }` **เหมือนกันทุกไบต์** (ไม่ตกไปประกาศอื่น)
- `loadPortalAnnouncements`: `items` = ประกาศที่สัญญาเห็น · `a` ระบุ ⇒ `detail` (+ แถวนั้น `current: true`) · **ไม่เขียนอะไร** (GET ถูก LINE ดึงตัวอย่างลิงก์ได้ — การอ่านนับจาก action ฝั่งเบราว์เซอร์เท่านั้น)
- `markPortalAnnouncementRead`: ⇒ `INSERT … ON CONFLICT ("announcementId","partyId") DO NOTHING` (หรือ `createMany skipDuplicates`) ด้วย `partyId = canonical party ของสัญญา` · `tenantId/unitId` ของประกาศ · `counted` = แถวใหม่จริง · **พร้อมกัน N ทาง / หลายโพรเซส / คนเดียวจาก 2 สัญญา = แถวเดียว** · ไม่ throw/P2002
- `dormAnnounceMenuReply` (เรียกจาก `dorm-line.ts` `case "announce"` ด้วย `leases` = สัญญาของผู้กดที่ D.9 หาแล้ว + `{ now }` จาก `opts` ของ `onDormPostback`): ประกาศที่สัญญาใดสัญญาหนึ่งเห็น ≤ 3 ฉบับล่าสุด (ไม่ซ้ำ) · แต่ละฉบับ: หัวเรื่อง + ป้ายวัน + ลิงก์ `announcementPortalUrl` · ไม่มีเลย ⇒ ข้อความไทยคงที่ "ยังไม่มีประกาศจากหอ…" (≠ `DORM_POSTBACK_NOT_FOUND` · d.9 K-5) · ไม่มีชื่อ/เบอร์ · ไม่เขียนอะไร

### 3.4 event + งาน
- `dorm.announcement.published` ลง `outbox-consumers.ts` + `automation/labels.ts` (ป้ายไทย) — webhooks ได้จาก spread · payload `{ unitId, announcementId, audience }` (kind เท่านั้น — **ไม่มีหัวเรื่อง/เนื้อหา/ชื่อ/เบอร์** X8)
- minute-job `{ name: "dorm.announce", everyMinutes: 5, run: async (now, budgetMs, ctrl) => (await import("@/lib/platform/dorm-announce")).runDormAnnounceJobs(now, { budgetMs: …, signal: ctrl.signal }) }`
- `ServiceMessageLog` (ของ R0.7) = รายชื่อผู้รับที่ส่งแล้วโดยปริยาย · dedupeKey มีแต่ id

## 4. สัญญา DOM (ไม่มีภาพแบบ · `renderToStaticMarkup` ได้ · ปุ่ม ≥ 44px · 390px ไม่ล้น · `<a>` · ไม่มีเบอร์/ชื่อเต็มผู้เช่า/คำต้องห้าม)
### 4.1 «DormAnnounce.tsx» — `'use client'` บรรทัดแรก · default export · props `{ model: DormAnnounceModel; createAction; publishAction; resendAction }` (แต่ละตัว `(prev: unknown, fd: FormData) => Promise<unknown>`) · `import type` เท่านั้นจาก lib · ห้าม import `@/lib/modules/**` `@/lib/platform/**` `@/lib/core/db` `@prisma/client` `next/*` · ไฟล์ `actions`
- ราก `[data-dorm-announce]` `data-unit="<unitId>"` · หัว "ประกาศถึงผู้เช่า"
- ฟอร์ม `form[data-announce-form]`: `input[name=title]` (`maxlength=120`) · `textarea[name=body]` (`maxlength=2000`) · `input[type=radio][name=audienceKind]` ค่า `ALL` (**ไม่มีเมื่อ `canAll=false`**) `BUILDING` `FLOOR` `ROOM` · ตัวเลือก `input[type=checkbox][name=target]` + `data-audience-option="BUILDING|FLOOR|ROOM"` · value = id (FLOOR = `<buildingId>:<floorNo>`) — **เฉพาะของ `model.options`** · ปุ่ม "บันทึกร่าง"
- รายการ `[data-announce-list]` · แถว `[data-announce-row="<id>"]` `data-status="DRAFT|PUBLISHED"` + หัวเรื่อง + `audienceLabelTh`
  - ร่าง: `form[data-announce-publish]` (`input[type=hidden][name=announcementId]`) ปุ่ม "ส่งประกาศ" + จำนวนผู้รับ `[data-announce-recipients]` = `stats.recipients`
  - เผยแพร่แล้ว: `[data-announce-reads]` `data-reads` `data-recipients` ข้อความ "อ่านแล้ว <reads> จาก <recipients> คน" · `form[data-announce-resend]` ปุ่ม "ส่งซ้ำให้คนที่ยังไม่ได้รับ"
- ไม่มี `model.items` ⇒ `[data-announce-empty]` "ยังไม่มีประกาศ"
### 4.2 «DormPortalNews.tsx» — `'use client'` · default export · props `{ view: PortalNewsView; token: string; markRead: (announcementId: string) => Promise<unknown> }` · ข้อห้าม import เดียวกับ 4.1
- ราก `[data-dorm-news]` · หัว "ประกาศจากหอ · ห้อง <roomNumber>" + ชื่อหน่วย
- แถว `a[data-news-row="<id>"]` `href="?a=<id>"` หัวเรื่อง + `publishedLabel` · ไม่มีรายการ ⇒ `[data-news-empty]` "ยังไม่มีประกาศ"
- `view.detail` ⇒ `[data-news-detail="<id>"]` มี `[data-news-title]` `[data-news-body]` (คงขึ้นบรรทัด) · เรียก `markRead(detail.id)` **ครั้งเดียวใน `useEffect`** (ไม่เรียกตอน render ฝั่งเซิร์ฟเวอร์)
- `a[data-news-portal]` → `links.portal` ("ดูบิลและการชำระ")

## 5. หน้า
- `/app/u/[unitSlug]/dorm/announce` page.tsx (server): `requireUnit` · หน่วย DORM · `dormAnnounceModel(actor, ctx, …)` → `null` ⇒ `notFound()` · actor จาก session เท่านั้น · `<DormAnnounce model createAction publishAction resendAction />` · actions.ts `"use server"` export async function เท่านั้น: `createAnnouncementAction` `publishAnnouncementAction` `resendAnnouncementAction` — อ่าน `title` `body` `audienceKind` `target[]` `announcementId` จากฟอร์ม · **ไม่รับ tenantId/unitId/actor จากฟอร์ม** (unit จาก `unitSlug` ที่ bind ไว้ + `requireUnit`)
- **ไม่เพิ่มแท็บ** ใน `DORM_TABS` (d.13 K-6 ผูกชุดแท็บตายตัว — ผู้คุมเคาะ Q4) · เข้าได้จาก URL ตรง + ลิงก์ในหน้าเดียวกัน
- `/d/[token]/news` page.tsx (server · สาธารณะ): `loadPortalAnnouncements(token, { a: searchParams.a ?? null }, { clientKey: portalClientKey(headers()) })` → `null` ⇒ `notFound()` · `export const dynamic = "force-dynamic"` · `metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" }` · **ไม่เรียก `markPortalAnnouncementRead`** · actions.ts `"use server"`: `markAnnouncementReadAction(token, announcementId)` ⇒ `markPortalAnnouncementRead(token, { announcementId }, { clientKey })` (clientKey จาก `x-real-ip` ลำดับเดียวกับ D.9 — ใช้ `portalClientKey`) · ไม่ส่ง deps/tenantId

## 6. จุดที่แบบไม่ชัด — ผู้เขียนข้อสอบเลือกแล้ว (ผู้คุมเคาะได้ · เปลี่ยน = ORACLE-EDIT)
1. **นับอ่านต่อคน (canonical Party)** ไม่ใช่ต่อสัญญา — ตาราง D.0 unique `[announcementId, partyId]` · คนเช่า 2 ห้องในกลุ่ม = ข้อความ 1 · อ่าน 1
2. **"อ่านแล้ว" = ผู้เช่าเปิดหน้าประกาศในเบราว์เซอร์แล้ว action ฝั่ง client ยิง** (LINE push ไม่มีใบตอบรับการอ่าน · GET ไม่นับเพราะ LINE ดึงตัวอย่างลิงก์ — ไม่งั้นทุกคน "อ่าน" ทันทีที่ส่ง)
3. **ผู้รับคิดสด ณ ตอนส่ง** (ไม่เก็บรายชื่อ — ไม่มีคอลัมน์) ⇒ สัญญาจบก่อนข้อความออก = ไม่ส่ง (precheck) · ผู้เช่าใหม่ในกลุ่มได้ในรอบส่งซ้ำ
4. **เผยแพร่แล้วแก้/ลบไม่ได้** ในใบนี้ (แก้ได้เฉพาะร่าง) · ถอนประกาศ = หนี้
5. **ผู้ดูแลอาคาร**: ไม่มีตัวเลือก "ทั้งหน่วย" · ไม่เห็นประกาศที่มีห้องนอกอาคารของตน (รวม ALL) — fail closed ตาม D.13
6. **คำต้องห้ามบล็อกทุกโหมดกฎหมาย** (เหมือนแม่แบบ #38) — รวมคำว่า "ตัดไฟ/ตัดน้ำ" แม้เป็นประกาศซ่อมบำรุงของการไฟฟ้า/ประปา ⇒ ใช้ "ไฟฟ้าดับชั่วคราว" / "น้ำไม่ไหลชั่วคราว" แทน (ข้อความ BAD ต้องบอกทางเลือกนี้เป็นภาษาไทย) — Q2
7. **ลิงก์ในข้อความ = ปุ่ม uri ของ `notifyCustomer`** (ไม่เพิ่มตัวแปร `{link}` ในแม่แบบ — กัน d.13 R-8 และค่าแม่แบบของร้านที่ปรับแล้ว)
8. **ข้อความเงียบ**: ประกาศไม่ข้ามเวลาเงียบ (`bypassQuiet` ไม่ส่ง) · งานส่งซ้ำส่งต่อหลังพ้นเวลาเงียบ
9. **ไม่มีภาพแบบ** ⇒ ไม่มี PARITY · V-1 = จอพนักงานบน svcqc (HTTP < 400 · 1440/390 ไม่ล้น) เท่านั้น · ไม่มีสคริปต์ฉาก (ไม่เขียนข้อมูล/ค่าตั้งของ svcqc)

## 7. ไม่ใช่เรื่องของใบนี้ / หนี้ส่งต่อ
- ถอน/แก้ประกาศที่เผยแพร่แล้ว · ตั้งเวลาเผยแพร่ล่วงหน้า · แนบรูป/ไฟล์ · ภาษาอังกฤษรายประกาศ (ใช้แม่แบบ en ของหน่วยได้แต่หัวเรื่อง/เนื้อหาเป็นภาษาเดียว)
- แท็บ "ประกาศ" ในเมนูหอ (Q4) · ลิงก์ "ประกาศ" ในหน้าพอร์ทัลหลัก `/d/[token]` (ไฟล์ D.9/D.10)
- SMS (S.1 — ผ่าน `notifyCustomer` ทันทีเมื่อมี) · AI ร่างประกาศ (D2.5)

## 8. ข้อสอบ (กลุ่ม) — «scripts/qc-svc-d.17.mts»
S โครงสร้าง/ไฟล์/ค่าตั้ง/สิทธิ์/event/งาน/ไม่ส่ง LINE ตรง/ไม่มี any·เวลาดิบ·prisma ดิบ/คำต้องห้ามในซอร์ส · PC ตัวควบคุม (เขียวก่อนมีงาน: ฉาก · notifyCustomer ข้อความประกาศ + dedupe · เวลาเงียบ · ตัวตรวจคำ · unique การอ่าน · ลิงก์พอร์ทัล D.9 · ขอบเขตอาคาร D.13 · ตัวจำลอง LINE) · W ถ้อยคำ/ตัวตรวจ (ดิบ · ข้ามช่อง · อังกฤษ · ร่างแก้ · แถวหลุดเข้าฐาน · แม่แบบหลุดเข้าฐาน) + รูปข้อมูล · X แยกร้าน/หน่วย/อาคาร/สิทธิ์ (NOT_FOUND เดียวกันทุกไบต์) · A กลุ่มผู้รับถูกคน (ทั้งหน่วย · อาคาร · ชั้น · ห้อง · ห้องว่าง · Party 2 ห้อง · สัญญาจบ/ร่าง/เลยวันจบ/หน่วยอื่น/ร้านอื่น · สัญญาจบระหว่างเผยแพร่กับส่ง) · N ไม่ซ้ำ (เผยแพร่พร้อมกัน 12 = 1 · ส่ง 24 ทาง 3 โพรเซส = 1 ต่อคน · consumer ซ้ำ · ส่งซ้ำ · เวลาเงียบ + งานซ้อน) · R อ่านแล้ว (GET ไม่นับ · พร้อมกัน = 1 · 2 สัญญาคนเดียว = 1 · ห้องอื่น/ร้านอื่น/สัญญาจบ ⇒ NOT_FOUND เดียวกัน · ผู้เช่าใหม่ไม่เห็นของคนเก่า · หน้าต่างวัน) · P เมนู LINE · E event/PII · U DOM · M นอกเครื่อง · Z ล้าง · V ภาพจอพนักงาน · G regression
- regression (G · รันหลังล้างข้อมูล): `qc-svc-d.9 --no-regression` · `qc-svc-d.13 --no-regression` · `qc-svc-d.11 --no-regression` · `qc-svc-smoke` — ไม่มี FAIL
- typecheck + fitness 2 โหมด (ผู้คุม) · ตรวจรอบเดียว (ผู้ตรวจ 1 ตัว — ให้ยิง probe หลายโพรเซสของ N-1/N-2/R-2 ซ้ำด้วย)

## 9. X ที่เกี่ยว
X1 (X-1…X-7 · R-5 · A-8) · X3 (N-1 N-2 R-2) · X4 (N-3) · X5 (N-5) · X7 (R-5 ด่าน token · rate limit ก่อน) · X8 (E-1 E-2 payload/log/audit ไม่มี PII · ข้อความไม่มีชื่อ/เบอร์) · ไม่เกี่ยว: X6 (ไม่มีไฟล์เข้า) · X9 (เผยแพร่ไม่ใช่การกระทำอันตรายต่อเงิน/สิทธิ์ — มี audit) · X10 (ไม่มีไฟล์ส่วนตัว)

## 10. คำถามผู้คุม (ค่าปลอดภัยใช้ไปก่อน)
- **Q1 นับอ่านต่อคน vs ต่อสัญญา**: ต่อคน (schema D.0) · ทางเลือกต่อสัญญาต้อง migration
- **Q2 "ตัดไฟ/ตัดน้ำ" ในประกาศซ่อมบำรุง**: บล็อก (ค่าปลอดภัย · ตัวตรวจเดียวกับ #38) · ทางเลือก: ยกเว้นเฉพาะประกาศ (ไม่ใช่ข้อความทวง) — ต้องที่ปรึกษา J3
- **Q3 payload event**: `{ unitId, announcementId, audience }` (CC §7 เขียนย่อ "id · roomId?") — ไม่มี roomId เพราะประกาศหลายห้อง
- **Q4 แท็บ "ประกาศ"**: ไม่เพิ่มในใบนี้ (d.13 K-6) · ทางเลือก: เพิ่มแท็บ + ORACLE-EDIT d.13 K-6 ตอนรับใบ (ผู้คุม)
- **Q5 ระดับตรวจ**: เบา 1 รอบตามแผน (ยืนยัน) — แต่ X1/สคบ. ห้ามตัด

## 11. คำถามกฎหมาย/PDPA (เพิ่มใน `ledger/wo-notes/svc-legal-questions.md` ตอนรับใบ)
- J3: ประกาศซ่อมบำรุงที่ต้องใช้คำ "งดจ่ายน้ำ/ไฟ" ชั่วคราว (ไม่ใช่การทวง) เข้าข่ายข้อห้ามไหม — ระบบบล็อกไว้ก่อน
- J5: ประกาศ = ข้อความบริการ (ไม่ต้องขอยินยอมการตลาด) — ถ้าร้านใช้ประกาศโฆษณา (ห้องว่าง · ชวนเพื่อน · โปรโมชัน) ต้องแยกเป็นการตลาดไหม · ระบบยังไม่ตรวจเนื้อหาการตลาด
- J5: บันทึก "อ่านแล้ว" ต่อคน (Party + เวลา) เป็นข้อมูลส่วนบุคคล — ต้องแจ้งในนโยบาย/เก็บนานเท่าไร

## มติผู้คุม (31 ต.ค. 2569)
- R1 (Q1) นับอ่านต่อคน (unique [announcementId, partyId] ของ D.0) — ไม่มี migration
- R2 (Q2) บล็อก "ตัดไฟ/ตัดน้ำ" ทุกโหมด · ข้อความปฏิเสธแนะนำ "ไฟฟ้าดับชั่วคราว"/"น้ำไม่ไหลชั่วคราว" · ส่งเป็นคำถาม J3
- R3 (Q3) payload `{ unitId, announcementId, audience }` (ไม่มี PII · ไม่มี roomId)
- R4 (Q4) ไม่เพิ่มแท็บในใบนี้ (d.13 K-6) · เข้าจอจากปุ่มบนหน้าแรกหอ/ลิงก์ · แท็บทำตอน D.15 พร้อม ORACLE-EDIT d.13 K-6
- R5 (Q5) ตรวจเบา 1 รอบ + ผู้ตรวจยิง probe หลายโพรเซส N-1/N-2/R-2 ซ้ำ
- มติอื่นที่ผู้เขียนข้อสอบเลือก (อ่าน = action ฝั่งเบราว์เซอร์ · ผู้รับคิดสดตอนส่ง · ผู้เช่าใหม่ไม่เห็นประกาศก่อนวันเข้า · ขอบเขตอาคาร · ปุ่ม uri) = รับ
- ฐานทดสอบของเลน l3 = wo-svc-qc-l3 (ep-royal-bar) ผ่าน qc-svc.sh เดิม · ใบรับได้เมื่อผู้คุมรันซ้ำบนฐานหลักหลัง merge
