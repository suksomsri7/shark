# ใบสั่ง D.18 — พัสดุ (รับ+ถ่ายรูป ⇒ LINE แจ้งผู้เช่า ⇒ สแกน/เซ็นรับ ⇒ เตือนค้างตามค่าตั้ง #62) · ตรวจ: **เบา (รอบเดียว)** — แต่ X1 ขอบเขตร้าน/หน่วย/อาคาร · X7 ลิงก์สาธารณะ · X10 รูปส่วนตัว **ห้ามตัด**

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` D.18 (มติรอบ 2 ข้อ 6 "เอาด้วย") · แบบ: `ledger/DESIGN-DORM-HOTEL.md` A10 ("พัสดุ (ทางเลือก): บันทึกรับ+รูป → แจ้ง LINE → ผู้เช่ากดรับ") · ภาคผนวก ก หอ **#62** (เปิด/เก็บได้กี่วัน · ค่าเริ่ม ปิด · 14 วัน) · **#64** (ผู้ดูแลเห็นเฉพาะอาคาร) · ภาพ: **ไม่มีภาพอนุมัติ** (คอลัมน์ "ภาพ" = —) ⇒ ไม่มี PARITY · ช่อง "พัสดุ" ในเมนูล่าง `ledger/design-dorm/05-line-tenant.png` / `richmenu-dorm.html` มีแล้ว (D.9)
> สัญญากลาง: `ledger/SVC-CORE-CONTRACT.md` §1 (ค่าตั้งจากทะเบียน) §4.4 (`notifyCustomer` + `precheck` ของ D.9) §4.5 (`signLink`/`verifyLink`) §6.2 §7 (`dorm.parcel.received` · `dorm.parcel.picked_up`) §8 (`dorm.parcel.manage`) + ภาคต่อ 28 ต.ค.
> ใบก่อนที่ต้องอ่าน (โค้ดชนะเอกสาร): `svc-brief-d.9.md` §3.0 (สัญญา live) §3.1 (ลำดับตายตัวของฟังก์ชันที่รับ token · 404 เดียวกัน) §3.3 (postback · ข้อความกลาง) §3.5 (ส่งต้องอ่านสด · `precheck`) · `svc-brief-d.13.md` §2 ข้อ 4 + §3 (ขอบเขตอาคาร `dormVisibleRoomsFor` · fail closed · Membership สด) §2 ข้อ 9 (ชื่อแรกเท่านั้น) · `svc-brief-d.6.md` (`<input type="file" accept="image/*" capture="environment">` · รูปเป็นไฟล์ส่วนตัว `uploadFile(... visibility:"private")` · idempotent ต่อคีย์) · `svc-brief-d.5.md` F-4 (`privateFileUrl` ผูกผู้ดู ≤ 900 วิ)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-d.18.mts» — รับใบ = **ผ่านทุกข้อ** (นับจาก `JSON_SUMMARY`) · SKIP ที่ยอมได้ระหว่างทำ: `G-*` (`--no-regression`) · `Q-*` (svcqc ยังไม่มีฉาก D.13) · `S-1` (หลัง merge)
> รัน: `cd /root/projects/shark-svc-l4 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.18.mts [--no-regression]` (ห้ามครอบ `timeout` · ห้าม kill กลางคัน — ล้างข้อมูลใน `finally`) · ข้อสอบเปิดตัวจำลอง LINE เอง (127.0.0.1 + `LINE_API_BASE`) · `APP_URL=https://qc-d18.invalid` ในโพรเซสตัวเอง · บล็อกคำขอออกนอกเครื่อง
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม `prisma generate`/migration/แตะ `prisma/**` · ห้ามแก้ข้อสอบ/`scripts/**` ยกเว้นสร้าง «scripts/svc-qc-parcel-scene.mts»** · temp ขึ้นต้น `svc-d18-` · รายงานต่อข้อ (id → ผล)
> ผู้เขียนข้อสอบแก้ให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` บล็อก `SVC D.18` (`SQC_DORM_PARCEL_SCENE`)
> **ไม่มี migration** — ตาราง `DormParcel` มีแล้วจาก D.0 (`prisma/schema/dorm.prisma`: status WAITING/PICKED_UP/RETURNED · photoFileId · signatureFileId · lastRemindedAt · remindCount) · ขาดคอลัมน์ 2 เรื่อง ⇒ ใช้ทางที่ไม่ต้อง migration (§2 ข้อ 1–2) + ขอผู้คุมเคาะใน §10
> ใบที่วิ่งขนานอยู่ (ไม่อยู่บน tip นี้): **D.10 · D.12 · D.17** — ไฟล์ร่วม (`outbox-consumers.ts` · `automation/labels.ts` · `minute-jobs.ts` · `permissions.ts` · `dorm/index.ts` · `dorm-line.ts` · `defs/rooms.ts` · `dorm-policy-shared.ts` · หน้าแรกหน่วย) แก้เป็น **บล็อกของตัวเองที่มีคอมเมนต์ `// SVC D.18`** ไม่แก้บรรทัดของใบอื่น ⇒ ผู้คุมรวมไฟล์ได้ทีละบล็อก

---

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ S-1 ไล่ `git status` ของ `src/` `prisma/` `public/` ตอนรับใบ)

| ไฟล์ | | ทำอะไร |
|---|---|---|
| «src/lib/modules/dorm/parcel.ts» | ใหม่ (server) | §3 ทั้งหมด: รับ · รายการ · รับของ (สแกน/เซ็น) · ตีกลับ · ลิงก์รับพัสดุ · ส่งข้อความ · consumer · งานตามเวลา · ตัวโหลดหน้าสาธารณะ · ตัวช่วย postback — ผ่าน `tenantDb` (**ห้าม `import { prisma }`** · F5.1) · ข้อความผ่าน `notifyCustomer` (dynamic import `@/lib/platform/notify-customer` แบบ `dunning.ts`) เท่านั้น |
| `src/lib/modules/dorm/index.ts` | แก้ (บล็อกต่อท้าย `// SVC D.18`) | export ชื่อใน §3 (บล็อกของใบอื่นห้ามแตะ) |
| «src/app/app/u/[unitSlug]/dorm/parcels/page.tsx» | ใหม่ (server) | จอพนักงาน §5.1 |
| «src/app/app/u/[unitSlug]/dorm/parcels/actions.ts» | ใหม่ `"use server"` | §5.2 |
| «src/components/dorm/DormParcels.tsx» | ใหม่ `'use client'` (default export) | §4.1 |
| «src/app/(store)/dp/[token]/page.tsx» | ใหม่ (server · สาธารณะ) | หน้าแสดง QR รับพัสดุของผู้เช่า §5.3 |
| «src/components/dorm/DormParcelPickup.tsx» | ใหม่ (default export · ไม่ import โมดูล server) | §4.2 |
| `src/lib/platform/dorm-line.ts` | แก้ (เพิ่ม `case "parcel":` 1 บล็อก) | §3.9 · ห้ามแตะ `case` อื่น/ข้อความกลาง · บรรทัด `default:` แก้คอมเมนต์ได้บรรทัดเดียว (ลบ ≤ 1 บรรทัด — S-13) |
| `src/lib/core/permissions.ts` | แก้ 1 บรรทัด | เอา `"dorm.parcel.manage"` ออกจาก `planned` (ป้ายไทยเดิม "รับและแจ้งพัสดุผู้เช่า") |
| `src/lib/core/settings/defs/rooms.ts` | แก้ (เพิ่มอย่างเดียว · บล็อก `// SVC D.18`) | แม่แบบข้อความ 2 ตัว §2.1 · เติม `helpTh` ให้ `rooms.parcel.enabled`/`rooms.parcel.holdDays` เดิมได้ (ห้ามเปลี่ยนคีย์/ชนิด/ค่าเริ่ม/ชั้น) |
| `src/components/dorm/dorm-policy-shared.ts` | แก้ (เพิ่มอย่างเดียว) | ป้ายไทยตัวแปรใหม่ใน `DORM_MSG_VAR_LABEL_TH` (d.13 R-8 บังคับ "ทุก templateVars ของ rooms.msg.* มีป้ายไทย") |
| `src/lib/outbox-consumers.ts` | แก้ (2 บรรทัด + คอมเมนต์) | `"dorm.parcel.received": withAutomation(async (evt) => (await import("@/lib/modules/dorm")).onParcelReceived(evt))` · `"dorm.parcel.picked_up": withAutomation(async () => {})` |
| `src/lib/automation/labels.ts` | แก้ (2 รายการ + คอมเมนต์) | ป้ายไทยของ 2 event (เว็บฮุคได้จาก spread ใน `webhooks/labels.ts` — **ห้ามประกาศซ้ำที่นั่น**) |
| `src/lib/platform/minute-jobs.ts` | แก้ (บล็อกเดียว) | งาน `dorm.parcel` ทุก 5 นาที · lazy import facade → `runDormParcelJobs(now, { budgetMs, signal })` §3.8 |
| `src/app/app/u/[unitSlug]/page.tsx` | แก้ 1 บรรทัด | `UNIT_NAV.DORM` เพิ่ม `{ href: "/dorm/parcels", label: "พัสดุ" }` (ทางเข้าจอ — §10 R8) |
| `scripts/fitness.mts` | แก้เฉพาะ `ALLOWED_EDGES` **ถ้า fitness แดงจริง** | คอมเมนต์ `// SVC D.18` (ส่วนใหญ่ไม่ต้อง — dorm→notify-customer/storage/signed-link มีแล้วจาก D.5/D.11) |
| «scripts/svc-qc-parcel-scene.mts» | ใหม่ (builder) | ฉาก svcqc §7 |

**ห้ามแตะ**: `prisma/**` · `src/lib/core/**` นอก `permissions.ts` + `settings/defs/rooms.ts` · `src/lib/platform/notify-customer.ts` · `src/lib/platform/postback-routes.ts` · `src/lib/platform/dorm-portal.ts` · `src/app/(store)/d/**` (พอร์ทัล D.9 + จอลูกค้า POS) · `src/lib/storage/**` · `src/app/api/files/**` · `src/lib/modules/chat/**` · `src/lib/payment/**` · `src/lib/modules/account/**` · โมดูลหอเดิม `dorm/{lease,billing,dunning,latefee,meter,utility,law,home,policy,access,scope,portal,import*,tax-invoice,account-bridge,calc}.ts` (เรียกได้ ห้ามแก้) · `src/components/dorm/dorm-home-shared.ts` (**แท็บล็อกโดย d.13 K-6** — ห้ามเพิ่มแท็บ) · `src/app/app/u/[unitSlug]/dorm/layout.tsx` · `src/lib/webhooks/labels.ts` · ไฟล์ของ D.10/D.12/D.17 · `any` · `getDay()/getDate()/getMonth()/getHours()/getFullYear()` ดิบ (ใช้ `bkkYmd`/`bkkParts`) · คำต้องห้าม สคบ. (ตัดน้ำ/ตัดไฟ/ล็อกห้อง/ยึดของ …)

## 2. มติของใบนี้ (ผู้เขียนข้อสอบเลือก · ผู้คุมเคาะได้ใน §10 · เปลี่ยน = ORACLE-EDIT)

1. **รับซ้ำ (คีย์เดิม) = แถวเดียว — ไม่มีคอลัมน์คีย์** ⇒ ค่าปลอดภัย "ทาง ก" (ไม่มี migration): `id` ของแถวคำนวณจากคีย์ เช่น `"pcl" + sha256hex("dorm.parcel:v1:" + tenantId + ":" + unitId + ":" + idempotencyKey).slice(0, 25)` แล้ว `INSERT … ON CONFLICT ("id") DO NOTHING` (หรือ create + จับ P2002 แล้วอ่านแถวเดิม) ⇒ ผลซ้ำ = `replayed: true` + `parcelId` เดิม · **ห้าม** P2002/throw หลุด · ผู้แพ้ที่อัปรูปไปแล้วลบไฟล์ของตัวเอง (`deleteFileAsset` แบบ `dropFiles` ใน lease.ts) — ข้อสอบตรวจพฤติกรรมเท่านั้น (ไม่ผูกกับรูป id) ⇒ ผู้คุมเลือก "ทาง ข" (คอลัมน์ใหม่) ภายหลังได้โดยข้อสอบไม่เปลี่ยน
2. **ลิงก์รับพัสดุ (token) = `signLink({ tenantId, purpose: "dorm.parcel", subjectId: parcelId, expMin })`** (HMAC · nonce 128 บิต · **ไม่เก็บ token ในฐานเลย** = เข้มกว่า "เก็บ hash") · **ใช้ได้ครั้งเดียว** = รับสำเร็จ ⇒ สถานะ `PICKED_UP` ⇒ token เดิมตายทุกทาง (CAS `status = 'WAITING'`) · `expMin = min(SIGNED_LINK_MAX_MIN, (holdDays + 7) × 1440)` (holdDays จากค่าตั้ง ณ ตอนออก) · ข้อความเตือนแต่ละวันออก token ใหม่ได้ · ห้าม log/audit token
3. **ใครกดรับ = พนักงานเท่านั้น** (ผู้ถือ `dorm.parcel.manage`): (ก) **สแกน** QR ที่ผู้เช่าเปิดจากลิงก์ใน LINE (ข้อความที่สแกนได้ = URL เต็ม `<origin>/dp/<token>` หรือ token ล้วน — รับทั้งสองแบบ) หรือ (ข) **ลายเซ็น** ผู้รับบนจอพนักงาน (รูป PNG/JPEG/WebP → ไฟล์ส่วนตัว `signatureFileId`) · หน้าสาธารณะ `/dp/<token>` **อ่านอย่างเดียว** (แสดง QR ให้พนักงานสแกน — ไม่มีปุ่มกดรับเอง · §10 R4)
4. **รับซ้ำด้วยเลขพัสดุเดิม**: หน่วยเดียวกัน · `trackingNo` เดิม (ตัดช่องว่าง · ตัวพิมพ์ใหญ่) · มีแถว `WAITING` อยู่แล้ว ⇒ `DUPLICATE` (คนละคีย์ก็ตาม · พร้อมกันต้องได้แถวเดียว — ล็อก `pg_advisory_xact_lock(hashtext(...))` ใน tx) · ไม่มีเลขพัสดุ = ไม่ตรวจข้อนี้
5. **สัญญา live** = นิยาม D.9 §3.0 (ใช้ `portalLiveLease`/`portalLiveLeasesOfParty` ที่ export แล้ว · วันนี้ไทยจาก `now`) · ห้องที่ไม่มีสัญญา live ตอนรับ ⇒ **บันทึกได้** (`leaseId = partyId = null`) แต่ไม่มีข้อความ/ลิงก์/เตือน · สัญญาจบหลังรับ ⇒ ข้อความที่ยังไม่ออก/เตือน/สแกนรับ **ตัดทันที** (อ่านสดทุกครั้ง · `precheck`) — รับด้วยลายเซ็นยังทำได้
6. **ผู้ดูแลเห็นเฉพาะอาคาร (#64)** = `dormVisibleRoomsFor` ของ D.13 (Membership สด · fail closed) ใช้กับ **ทุกฟังก์ชันพนักงาน** · ห้อง/พัสดุนอกขอบเขต = ผลเดียวกับ "ไม่พบ" ทุกไบต์
7. **ไม่พบเดียวกัน (X1)**: หน่วยร้านอื่น · ไม่ใช่ DORM · ไม่มีสิทธิ์ · ห้อง/พัสดุไม่มี/ร้านอื่น/นอกอาคาร · token ผิดทุกแบบ (ปลอม · ตัดท้าย · purpose อื่น · ร้านอื่น · พัสดุอื่นที่ระบุ `parcelId` · สัญญาจบ · ห้องที่ไม่มีสัญญา) ⇒ `{ ok:false, code:"NOT_FOUND", reason: PARCEL_NF_REASON }` **ทุกไบต์เดียวกัน** · ยกเว้นเฉพาะพนักงานที่เห็นพัสดุนั้นอยู่แล้ว: รับแล้ว ⇒ `ALREADY_PICKED_UP` · ตีกลับแล้ว ⇒ `BAD_STATE`
8. **เตือนค้าง**: `daysWaiting = วันไทย(now) − วันไทย(receivedAt)` · ค้าง = `daysWaiting ≥ rooms.parcel.holdDays` · เตือน **วันละครั้งต่อพัสดุ** (วันไทย) จนกว่าจะรับ/ตีกลับ/สัญญาจบ/ปิดระบบ · วันที่ตกเวลาเงียบทั้งวันไม่ส่งย้อนหลัง (ไม่รัวส่ง) · ไม่มีเพดานจำนวนครั้ง (§10 R5)
9. **ปิดระบบ (`rooms.parcel.enabled = false` ค่าเริ่ม)**: รับใหม่ ⇒ `DISABLED` · ไม่ส่ง/ไม่เตือน · **รายการยังเปิดดูได้** (`enabled: false` ให้จอขึ้นป้าย) · รับของ/ตีกลับของที่ค้างอยู่ยังทำได้ (เคลียร์ของจริงในห้องเก็บ)
10. **รูปพัสดุ = ไฟล์ส่วนตัว** (`uploadFile(..., { kind:"ATTACHMENT", visibility:"private" }, deps.put ? { put } : undefined)`) · ออกทาง DTO ได้แค่ `privateFileUrl(fileId, { kind:"STAFF", id: actorUserId })` (route `/api/files/<id>?exp&sig` ตรวจลายเซ็น+ผู้ดู+อายุ ≤ 900 วิ — X10) · **หน้าสาธารณะไม่มีรูป** (ฉลากมีชื่อ/ที่อยู่/เบอร์ผู้เช่า — §10 R7) · ไม่มี `path`/`cdnUrl`/`private://` ใน DTO ใด
11. **ชื่อ**: จอพนักงานแสดงชื่อแรกของ Party เท่านั้น (มติ D.13 ข้อ 9) · หน้าสาธารณะ/postback/payload/log **ไม่มีชื่อ เบอร์** · เลขพัสดุบนหน้าสาธารณะ = 4 ตัวท้ายเท่านั้น
12. **event 2 ตัว** (CC §7): `dorm.parcel.received` (ใน tx เดียวกับแถว · key `dorm.parcel.received:<parcelId>`) · `dorm.parcel.picked_up` (ใน tx เดียวกับ CAS · key `dorm.parcel.picked_up:<parcelId>`) · payload **ตรง 3 คีย์** `{ unitId, parcelId, roomId }` · ตีกลับไม่มี event (audit อย่างเดียว)

### 2.1 แม่แบบข้อความใหม่ (`tpl(...)` ใน `defs/rooms.ts` · กลุ่ม `msg` ⇒ การ์ด 4 ของหน้า 17 แสดงเอง · ตัวตรวจ TEMPLATE_NO_THREAT ใช้อยู่แล้ว)
| คีย์ | ป้ายไทย | templateVars (ต้องมีอย่างน้อย) | ค่าเริ่ม TH (ตัวอย่าง · ห้ามคำต้องห้าม) |
|---|---|---|---|
| `rooms.msg.parcelReceived` | ข้อความแจ้งพัสดุมาถึง | `roomNo` `unitName` `carrier` `receivedDate` `pickupLink` | "มีพัสดุถึงห้อง {roomNo} ({carrier}) รับได้ที่ {unitName} — เปิดลิงก์นี้แล้วแสดง QR ให้พนักงานตอนรับ {pickupLink}" |
| `rooms.msg.parcelReminder` | ข้อความเตือนพัสดุค้างรับ | เดียวกัน + `daysWaiting` | "พัสดุของห้อง {roomNo} รอรับมา {daysWaiting} วันแล้ว รับได้ที่ {unitName} — แสดง QR ในลิงก์นี้ให้พนักงาน {pickupLink}" |
- ป้ายตัวแปรใหม่ใน `DORM_MSG_VAR_LABEL_TH`: `carrier` "ขนส่ง" · `receivedDate` "วันที่รับ" · `pickupLink` "ลิงก์รับพัสดุ" · `daysWaiting` "จำนวนวันที่รอ" (คำเลือกได้ ต้องเป็นไทย)
- `carrier` ว่าง ⇒ ส่ง "พัสดุ" · `receivedDate` = "5 พ.ย. 2569" (`portalDateLabel`) · ห้ามใส่ `tenantName` ในค่าเริ่ม (ไม่จำเป็น)
- ค่าตั้งเดิมที่ใช้ (อ่านต่อคำขอ · ไม่แคช): `rooms.parcel.enabled` · `rooms.parcel.holdDays` · `messaging.lineConnectionId` · `messaging.channelOrder` · `messaging.quietHours` — **ห้ามฝังเลข 14** หรืออายุ token เป็นตัวเลขในไฟล์ (S-7)

## 3. สัญญาโค้ด — export จาก `@/lib/modules/dorm` (ข้อสอบมีสำเนาชนิด — ชื่อ/ฟิลด์ต้องตรง)

```ts
export const PARCEL_PICKUP_PURPOSE = "dorm.parcel";
export const PARCEL_RATE = { view: { limit: 120, windowMs: 600_000 } } as const;   // ค่าคงที่ความปลอดภัย (ไม่ใช่นโยบายร้าน)
export const PARCEL_NF_REASON: string;   // ข้อความไทยเดียว เช่น "ไม่พบพัสดุหรือห้องที่ระบุในหอนี้ หรือบัญชีนี้ไม่มีสิทธิ์ทำรายการ"
export type ParcelCtx = { tenantId: string; actorUserId: string };
export type ParcelFile = { data: Uint8Array; contentType: string };
export type ParcelFileDeps = { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>; del?: (path: string) => Promise<number> };
export type ParcelFailCode = "NOT_FOUND" | "DISABLED" | "INVALID_INPUT" | "INVALID_FILE" | "DUPLICATE" | "ALREADY_PICKED_UP" | "BAD_STATE" | "UPLOAD_FAILED";
export type ParcelFail = { ok: false; code: ParcelFailCode; reason: string };
export type ParcelStatus = "WAITING" | "PICKED_UP" | "RETURNED";
export type ParcelRow = {
  parcelId: string; roomId: string; roomNumber: string; buildingId: string | null;
  carrier: string | null; trackingNo: string | null; status: ParcelStatus;
  receivedAt: string /* ISO */; daysWaiting: number; overdue: boolean;
  tenantFirstName: string | null; photoUrl: string | null; pickedUpAt: string | null; remindCount: number;
};
```
### 3.1 `receiveParcel(ctx: ParcelCtx, i: { unitId; roomId; carrier?: string|null; trackingNo?: string|null; photo: ParcelFile; idempotencyKey: string }, opts?: { now?: Date; deps?: ParcelFileDeps }) → Promise<{ ok: true; parcelId: string; replayed: boolean; leaseLinked: boolean } | ParcelFail>`
ลำดับ: (1) รูปแบบ input — `idempotencyKey` `^[A-Za-z0-9_-]{8,80}$` · `carrier` ≤ 40 · `trackingNo` ≤ 60 `[A-Za-z0-9-]` (ตัดช่องว่าง) · ผิด ⇒ `INVALID_INPUT` · (2) ด่าน `dorm.parcel.manage` (Membership สด · `dormStaffGate` ของ D.9 ได้) + หน่วย DORM ของร้าน + ห้องของหน่วย + ห้องในขอบเขตอาคาร ⇒ ไม่ผ่าน `NOT_FOUND` · (3) `rooms.parcel.enabled` (refs หน่วย) false ⇒ `DISABLED` · (4) **คีย์เดิมมีแถวแล้ว ⇒ `{ ok:true, parcelId, replayed:true }` ทันที** (ไม่อัปรูป · ไม่มี event ใหม่ — ก่อนตรวจรูป เพื่อให้กดซ้ำจากเน็ตช้าได้ผลเดิม) · (5) รูป: `image/jpeg|png|webp|heic|heif` · 1 B–10 MB · ไบต์หัวตรงชนิด ⇒ ไม่ผ่าน `INVALID_FILE` (ไม่มีรูป ⇒ `INVALID_INPUT`) · (6) อัปไฟล์ส่วนตัว (ล้ม ⇒ `UPLOAD_FAILED`) · (7) tx: ล็อกเลขพัสดุ (§2 ข้อ 4) → ซ้ำ ⇒ `DUPLICATE` (ลบรูป) · สัญญา live ของห้อง ⇒ `leaseId/partyId` · INSERT (`receivedById = actorUserId` · `receivedAt = now`) · `emitOutbox(dorm.parcel.received)` · audit `dorm.parcel.received` (`targetType: "DormParcel"` · `targetId: parcelId` · ไม่มีชื่อ/เบอร์/token — audit ทุกตัวของใบใช้รูปนี้) · แพ้ ON CONFLICT ⇒ ลบรูปตัวเอง + `replayed:true`
### 3.2 `listParcels(ctx: ParcelCtx, i: { unitId; status?: ParcelStatus | "ALL" }, opts?: { now?: Date }) → Promise<{ ok: true; enabled: boolean; holdDays: number; rows: ParcelRow[]; counts: { waiting: number; overdue: number; pickedUp: number; returned: number } } | ParcelFail>`
- ด่านเดียวกับ 3.1 (ไม่ตรวจ enabled) · `status` ค่าเริ่ม `"WAITING"` (กรองเฉพาะ `rows`) · `counts` = นับทุกสถานะในขอบเขตเสมอ (ไม่ขึ้นกับ `status`) · เฉพาะห้องในขอบเขต (ทั้ง rows และ counts) · เรียง receivedAt เก่า → ใหม่ · ≤ 500 แถว · `photoUrl` = `privateFileUrl(photoFileId, { kind:"STAFF", id: ctx.actorUserId })` · `overdue` = WAITING และค้างตาม §2 ข้อ 8
### 3.3 `pickupParcel(ctx: ParcelCtx, i: { unitId; parcelId?: string|null; proof: { kind: "SCAN"; token: string } | { kind: "SIGNATURE"; file: ParcelFile } }, opts?: { now?: Date; deps?: ParcelFileDeps }) → Promise<{ ok: true; parcelId: string; pickedUpAt: string; method: "SCAN" | "SIGNATURE" } | ParcelFail>`
- ด่านพนักงาน + ขอบเขต (§2 ข้อ 6–7) · **SCAN**: ดึง token จาก URL/ข้อความ → `verifyLink(token, "dorm.parcel")` → ร้านตรง `ctx` → พัสดุของหน่วยนี้ในขอบเขต → ถ้าระบุ `parcelId` ต้องตรง subject → พัสดุมีสัญญา live และ `leaseId` เดิม ⇒ อื่นทั้งหมด `NOT_FOUND` (ข้อความเดียว) · **SIGNATURE**: ต้องมี `parcelId` · ไฟล์ `image/png|jpeg|webp` ≤ 2 MB ไบต์หัวตรง (ผิด ⇒ `INVALID_FILE`) · อัปไฟล์ส่วนตัวก่อน tx
- tx: `UPDATE "DormParcel" SET status='PICKED_UP', "pickedUpAt"=now, "pickedUpByPartyId"=<lease.partyId หรือ null>, "signatureFileId"=? WHERE id=? AND status='WAITING'` (**CAS** · นับ 1 = ชนะ) → `emitOutbox(dorm.parcel.picked_up)` + audit (`after: { method }` ไม่มี token) · แพ้ ⇒ ลบลายเซ็นของตัวเอง ⇒ `ALREADY_PICKED_UP` (หรือ `BAD_STATE` ถ้า RETURNED) · ยิงพร้อมกัน N ทาง/หลายโพรเซส ⇒ **สำเร็จ 1 พอดี** · ไม่มี P2002/40P01/throw หลุด
### 3.4 `returnParcel(ctx: ParcelCtx, i: { unitId; parcelId; reason: string }, opts?: { now?: Date }) → Promise<{ ok: true; parcelId: string } | ParcelFail>` — เหตุผล 3–200 ตัวอักษร (ไม่ผ่าน ⇒ `INVALID_INPUT`) · CAS WAITING → RETURNED · audit `dorm.parcel.returned` (เหตุผลอยู่ใน audit) · ไม่มี event · ไม่ใช่ WAITING ⇒ `BAD_STATE`
### 3.5 `parcelPickupUrl(ctx: { tenantId }, i: { parcelId }, opts?: { now?: Date }) → Promise<string>` — WAITING + สัญญา live + มี `SESSION_SECRET` ⇒ `<origin>/dp/<token>` (origin = `APP_URL` → `NEXT_PUBLIC_APP_URL` · ไม่มี = path สัมพัทธ์) · อื่น ⇒ `""` · ไม่ throw
### 3.6 `sendParcelNotice(ctx: { tenantId }, i: { parcelId }, opts?: { now?: Date }) → Promise<{ status: string; dedupeKey: string | null; duplicate: boolean }>` + `onParcelReceived(evt: { id; tenantId; type; payload; unitId }) → Promise<void>` (ไม่ throw)
- อ่านสด (ห้ามเชื่อ payload): ไม่พบ ⇒ `NOT_FOUND` · ไม่ใช่ WAITING ⇒ `NOT_WAITING` · ไม่มีสัญญา live ⇒ `NO_LEASE` · ปิดระบบ ⇒ `DISABLED` (4 ข้อนี้ `dedupeKey: null` ไม่เขียน log) ⇒ `notifyCustomer({tenantId}, { unitId, domain:"rooms", messageKey:"parcelReceived", partyId: lease.partyId, vars, dedupeKey: "rooms:parcelReceived:<parcelId>", at: now, precheck })` — `precheck` อ่านสดอีกรอบ (ยัง WAITING + สัญญายัง live) · **ไม่ bypass เวลาเงียบ** · OA = ของหน่วยตามค่าตั้ง (notifyCustomer) · `onParcelReceived`: `type === "dorm.parcel.received"` ⇒ `sendParcelNotice(... payload.parcelId)` · ซ้ำ/พร้อมกัน/หลายโพรเซส = ข้อความเดียว (X4)
### 3.7 `loadParcelPickup(token: string, opts: { clientKey: string; now?: Date }) → Promise<null | { unitName: string; roomNumber: string; carrier: string | null; trackingLast4: string | null; receivedLabel: string; daysWaiting: number; pickupUrl: string; qrSvgDataUrl: string }>`
**ลำดับตายตัว (X7 · แบบ D.9 §3.1)**: (1) `checkRateLimitDb("dorm:parcel:view:" + clientKey, PARCEL_RATE.view, now)` เกิน ⇒ `null` · (2) `verifyLink` ล้ม ⇒ `null` · (3) พัสดุของร้านใน token · WAITING · สัญญา live · `leaseId` เดิม ⇒ ไม่ใช่ `null` · ทุกกรณีล้ม = `null` เหมือนกัน · `qrSvgDataUrl` = QR ของ `pickupUrl` (= URL ของหน้านี้เอง) · **ไม่มี**: รูป · ชื่อ · เบอร์ · id ใด ๆ · เลขพัสดุเต็ม
### 3.8 `runDormParcelJobs(now: Date, opts?: { tenantId?: string; budgetMs?: number; signal?: AbortSignal }) → Promise<{ reminded: number; resent: number }>`
- (ก) **ส่งแจ้งมาถึงซ้ำ**: แถว `ServiceMessageLog` domain `rooms` · messageKey `parcelReceived` · สถานะ `SKIPPED_QUIET`/`FAILED` · `at ≥ now − 3 วัน` ⇒ `sendParcelNotice(..., { now })` (อ่านสดอีกรอบ) · คืนจำนวน SENT เป็น `resent`
- (ข) **เตือนค้าง**: พัสดุ WAITING ของหน่วยที่เปิดระบบ · สัญญา live · `daysWaiting ≥ holdDays` (ค่าตั้งของหน่วย) ⇒ `notifyCustomer(... messageKey:"parcelReminder", vars + daysWaiting, dedupeKey: "rooms:parcelReminder:<parcelId>:<YYYYMMDD ไทยของ now>", at: now, precheck)` · SENT ⇒ `UPDATE … SET "remindCount" = "remindCount" + 1, "lastRemindedAt" = now WHERE id = ? AND ("lastRemindedAt" IS NULL OR "lastRemindedAt" < <เริ่มวันไทยของ now>)` (นับครั้งเดียวต่อวัน) · `reminded` = จำนวน SENT
- `opts.tenantId` จำกัดร้าน · งานซ้อน 2 รอบ/หลายโพรเซส = ข้อความวันละ 1 (X5 · dedupe ของ notifyCustomer) · เคารพ `budgetMs`/`signal` · ไม่ throw ออก (ร้านหนึ่งพังไม่หยุดร้านอื่น)
### 3.9 postback `dorm.parcel` (ใน `dorm-line.ts` · `case "parcel":`) — ใช้ `leases` ของผู้กด (นิยามเดิมของ D.9 — ไม่มี ⇒ ข้อความกลางเดิม) ⇒ เรียกตัวช่วยใน facade (ชื่อเลือกเอง เช่น `parcelsForLeases`) ⇒ พัสดุ WAITING ของสัญญาเหล่านั้นในหน่วยที่เปิดระบบ (≤ 5 รายการ · แต่ละรายการมี "ห้อง <เลข>" + ลิงก์ `parcelPickupUrl`) · ไม่มีพัสดุ ⇒ ข้อความไทย "ยังไม่มีพัสดุรอรับ…" · หน่วยปิดระบบทั้งหมด ⇒ ข้อความคงที่เดิม `T.STAFF_REPLY` · **ไม่เขียน ServiceMessageLog/AuditLog** (d.9 K-7) · ไม่มีชื่อ/เบอร์

## 4. สัญญา DOM
### 4.1 «DormParcels.tsx» (`'use client'` บรรทัดแรก · default export · props `{ model: <ผลสำเร็จของ listParcels>; canReceive: boolean; rooms: { roomId: string; roomNumber: string }[]; actions: { receive; pickup; returnParcel } }` · `import type` เท่านั้นจาก lib · ห้าม import `@/lib/modules/**` `@/lib/platform/**` `@/lib/core/db` `@prisma/client` `next/*` · `renderToStaticMarkup` ได้)
- ราก `data-dorm-parcels` + `data-enabled="true|false"` · ปิดระบบ ⇒ ข้อความ "ระบบพัสดุปิดอยู่" + ไม่มีฟอร์มรับ
- ฟอร์มรับ `form[data-parcel-receive]` (เมื่อ `model.enabled && canReceive`): `select[name=roomId]` (ตัวเลือก = `rooms`) · `input[name=carrier]` · `input[name=trackingNo]` · `input[type=file][name=photo][accept="image/*"][capture="environment"]` · `input[type=hidden][name=idempotencyKey]` (สร้างครั้งเดียวต่อการเปิดฟอร์ม) · ปุ่ม "บันทึกรับพัสดุ" (≥ 44px)
- แถว `[data-parcel-row="<parcelId>"]` + `data-parcel-status="<status>"` · เลขห้อง · ขนส่ง · "รอ N วัน" · ค้าง ⇒ `[data-parcel-overdue]` "เกินกำหนด" · รูป `img[data-parcel-photo]` `src` = `photoUrl` (มีเมื่อไม่ null) · ชื่อแรก
- รับของ: `form[data-parcel-scan]` (`input[name=token]` + ปุ่ม "สแกน/วางลิงก์รับพัสดุ") · ต่อแถว WAITING `[data-parcel-sign="<parcelId>"]` (ช่องลายเซ็น/ไฟล์ลายเซ็น) · `[data-parcel-return="<parcelId>"]` (ต้องใส่เหตุผล)
- **HTML ไม่มี**: เบอร์ · นามสกุล · `private://` · token
### 4.2 «DormParcelPickup.tsx» (default export · props `{ view: <ผลไม่ null ของ loadParcelPickup> }` · ไม่ import โมดูล server)
- ราก `data-parcel-pickup` · "พัสดุห้อง <roomNumber>" + ชื่อหน่วย · `img[data-parcel-qr]` `src` = `qrSvgDataUrl` · ข้อความมีคำว่า "QR" เช่น "แสดง QR นี้ให้พนักงานตอนรับพัสดุ" · วันที่รับ · ขนส่ง · `…<trackingLast4>` · **ไม่มี** รูปพัสดุ/ชื่อ/เบอร์ · มือถือ 390 ไม่ล้น

## 5. หน้า
1. `/app/u/[unitSlug]/dorm/parcels` (server · `force-dynamic`): `requireUnit` · `unit.type !== "DORM"` ⇒ `notFound()` · `listParcels(...)` ไม่ ok ⇒ `notFound()` · `rooms` = ห้องในขอบเขตเท่านั้น · ส่ง actions
2. actions.ts `"use server"` · export async function เท่านั้น: `receiveParcelAction(unitSlug, prev, formData)` · `pickupParcelAction(unitSlug, prev, formData)` · `returnParcelAction(unitSlug, prev, formData)` — ร้าน/ผู้กระทำจาก session (`requireUnit` → `auth.active`) เท่านั้น · **ไม่รับ tenantId/unitId/actorUserId จากฟอร์ม** · ไม่ส่ง `deps` · `revalidatePath`
3. `/dp/[token]` (`src/app/(store)/dp/[token]/page.tsx` · server · ไม่มี session): `loadParcelPickup(token, { clientKey })` (clientKey = IP แบบ D.9: `x-real-ip` → `x-vercel-forwarded-for` → `x-forwarded-for` ตัวแรก → "unknown") · `null` ⇒ `notFound()` · `export const dynamic = "force-dynamic"` · `metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" }` · ห้าม `requireUnit`/`getSession`/`@/lib/core/db`/`@prisma/*`

## 6. ส่วนที่ไม่ใช่ของใบนี้ / หนี้ส่งต่อ
- **D.17**: postback `announce` · ประกาศ · ไม่แตะ · **D.16**: แจ้งซ่อม · **D.19**: รายงานพัสดุค้าง (ถ้าต้องการ)
- หนี้: พิมพ์ป้ายพัสดุ/ใบรับ · ตีกลับอัตโนมัติเมื่อครบกำหนด · แจ้งเตือนพนักงานเมื่อค้างนาน · รับพัสดุทีละหลายชิ้น (bulk) · ถอด QR ด้วยกล้องในเว็บ (ใช้ `BarcodeDetector` ถ้ามี ไม่บังคับ — ไม่เพิ่ม dependency) · ผู้เช่ากดยืนยันเอง (R4) · เมนู LINE รายคนเมื่อ OA ใช้ร่วม (หนี้ D.9 เดิม)

## 7. ฉาก svcqc «scripts/svc-qc-parcel-scene.mts» (builder · ค่าจาก `SQC_DORM_PARCEL_SCENE` เท่านั้น)
- ต้องมีฉาก D.13 ก่อน (สัญญาห้อง `rooms.waiting`/`rooms.pickedUp` ACTIVE บนหน่วยหอ svcqc) · ไม่พร้อม ⇒ exit 3 + เหตุผล
- **ไม่เขียน SettingValue ใด ๆ** (ฉาก 17 ของ D.13 นับ "ปรับจากแม่แบบ 4 ข้อ" — ห้ามขยับ) · ไม่ยิง event/ข้อความ (เขียนแถว `DormParcel` ตรงด้วย prisma ได้ในสคริปต์ฉาก) · `trackingNo` ขึ้นต้น `SQC_DORM_PARCEL_SCENE.trackingPrefix` · `receivedById` = ผู้ใช้ owner ของ svcqc · ไม่มีรูป (photoFileId null)
- แถว: ห้อง 106 WAITING รับเมื่อ (วันนี้ไทย − `overdueDays`) · ห้อง 204 WAITING รับวันนี้ · ห้อง 305 PICKED_UP (pickedUpAt = วันนี้)
- idempotent: `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}` (รันซ้ำ = 0/0/0) · `--clear` ลบเฉพาะแถวที่ขึ้นต้นด้วย prefix · ไม่แตะแถวของฉากอื่น

## 8. ข้อสอบ (กลุ่ม) — «scripts/qc-svc-d.18.mts»
S โครงสร้าง/ไฟล์/ทะเบียน/ค่าตั้ง/สิทธิ์ · PC ตัวควบคุม (เขียวก่อนมีงาน) · R รับ (ซ้ำคีย์ · พร้อมกันหลายโพรเซส · เลขพัสดุซ้ำ · ไฟล์ · ปิดระบบ · ห้องไม่มีสัญญา · X1) · N แจ้งมาถึง (consumer · ซ้ำ X4 · อ่านสด · OA เดียว · เวลาเงียบ+ส่งซ้ำ) · T รับของ (หน้าสาธารณะ · 404 เดียว X7 · rate · สแกน · ใช้ครั้งเดียว · พร้อมกัน X3 · ลายเซ็น · ผู้เช่าห้องอื่น · ตีกลับ) · J เตือนค้าง (ตามค่าตั้ง · วันละครั้ง · X5 · เวลาเงียบ · หยุดเมื่อรับ/ตีกลับ/สัญญาจบ/ปิด · ค่าเริ่ม 14) · P postback · F รูปส่วนตัว X10 · U DOM · M PII/token ไม่อยู่ในฐาน/สคบ. · Z ล้าง · Q ฉาก svcqc · G regression
- regression (G · หลังล้างข้อมูล): `qc-svc-d.9 --no-regression` (S-1/S-2 ของ d.9 = "ไฟล์ของใบ D.9" ไม่นับ) · `qc-svc-d.13 --no-regression` · `qc-svc-smoke`
- ผู้คุม: typecheck + fitness 2 โหมด · ตรวจรอบเดียว (อ่าน diff เอง หรือ Sonnet 1 ตัว) — **แต่ผู้ตรวจต้องยิง probe X1/X7/X10** (token ร้านอื่น/purpose อื่น · ผู้ดูแลอาคารอื่น · ลิงก์รูปของคนอื่น)

## 9. X ที่เกี่ยว
X1 (R-8 T-7 F-2 · 404 เดียวกัน) · X3 (R-3 R-4 T-4 · พร้อมกันหลายโพรเซส) · X4 (N-2 consumer ซ้ำ) · X5 (J-2 งานซ้อน) · X6 (R-5 ไฟล์ชนิด/ขนาด/ไบต์หัว) · X7 (T-1 T-2 T-6 · rate limit ก่อนตรวจ · token ≥ 128 บิต · ผิด = คำตอบเดียว) · X8 (M-1 payload/log/DTO ไม่มี PII · M-2 token ไม่อยู่ในฐาน) · X9 (T-8 ตีกลับต้องมีเหตุผล + audit) · X10 (F-1 รูปผ่าน route ตรวจสิทธิ์+หมดอายุ · หน้าสาธารณะไม่มีรูป) · ไม่เกี่ยว: เงิน/GL (ไม่มีเงิน)

## 10. คำขอให้ผู้คุมเคาะ (ค่าปลอดภัยใช้ไปก่อน · ข้อสอบเขียนตามค่าปลอดภัย)
- **R1 (schema) คีย์รับซ้ำ**: `DormParcel` ไม่มีคอลัมน์คีย์ ⇒ ค่าปลอดภัย = ทาง ก "id คำนวณจากคีย์" (§2 ข้อ 1 · ไม่มี migration) · ทาง ข = ใบแก้ D.0 เพิ่ม `receiveKey String?` + `@@unique([unitId, receiveKey])` (migration เพิ่มอย่างเดียว · กติกา §1.1 ข้อ 5 อนุญาตเฉพาะ D.0) — ข้อสอบตรวจพฤติกรรมเท่านั้น เปลี่ยนทางไม่ต้อง ORACLE-EDIT
- **R2 (schema) token รับพัสดุ**: ไม่มีคอลัมน์ hash ⇒ ค่าปลอดภัย = `signLink` (ไม่เก็บอะไร · ใช้ครั้งเดียวด้วย CAS สถานะ · เพิกถอนรายลิงก์ไม่ได้ แต่รับ/ตีกลับ/สัญญาจบ = ตายหมด) · ทาง ข = คอลัมน์ `pickupTokenHash`/`pickupTokenExpiresAt` (migration D.0) หรือใช้ `ChatLinkCode` purpose `DORM_PARCEL` (แตะชิ้นกลาง R0.7 · รหัส 6 ตัวไม่ถึง 128 บิต ⇒ ไม่แนะนำ) — ข้อสอบ M-2 ผ่านทั้งสองทาง (ห้ามมี token ดิบในฐาน)
- **R3 เลขพัสดุซ้ำ** ขณะของเดิมยังรอรับ ⇒ `DUPLICATE` (ทางเลือก: ยอมแต่เตือน)
- **R4 ผู้รับ = พนักงานสแกน/เซ็นเท่านั้น** (หน้าสาธารณะอ่านอย่างเดียว) · ทางเลือก: ผู้เช่ากด "ยืนยันรับแล้ว" เองในหน้า `/dp` (ต้องมี rate limit + เสี่ยงลิงก์ถูกส่งต่อ)
- **R5 เตือนวันละครั้งไม่มีเพดาน** จนกว่าจะรับ · ทางเลือก: เพดาน N ครั้ง (ค่าตั้งใหม่) หรือเตือนครั้งเดียวตอนครบกำหนด (แถวแผน "ครั้งเดียวต่อรอบ" — ข้อสอบตีความ "รอบ" = วันไทย)
- **R6 ห้องไม่มีสัญญา live** ⇒ บันทึกได้ ไม่ส่งข้อความ (ทางเลือก: บล็อกการรับ)
- **R7 หน้าสาธารณะไม่มีรูปพัสดุ** (ฉลากมีชื่อ/ที่อยู่/เบอร์) — ถาม J5 ด้วย
- **R8 ทางเข้าจอ** = ลิงก์ใน `UNIT_NAV.DORM` (แท็บหอล็อกโดย d.13 K-6 = 4 แท็บ) · ทางเลือก: ORACLE-EDIT d.13 K-6 เพิ่มแท็บ "พัสดุ"
- **R9 ฉาก svcqc ไม่เขียนค่าตั้ง** (ระบบพัสดุบน svcqc คงปิด · ฉากเป็นแถวข้อมูลล้วน) — เปิดใช้ตอน UAT D.20 โดยเจ้าของกดเอง
- **R10 ตรวจเบา** ตามแผน — แต่ probe X1/X7/X10 บังคับ (§8)

## 11. คำถามกฎหมาย/PDPA (เพิ่มใน `ledger/wo-notes/svc-legal-questions.md` ตอนรับใบ)
- J5: รูปฉลากพัสดุ (ชื่อ/ที่อยู่/เบอร์ผู้เช่า) เก็บเป็นไฟล์ส่วนตัวของหอ — ระยะเก็บ · ต้องแจ้งในสัญญา/ประกาศไหม · ลบเมื่อรับแล้วกี่วัน
- J5: ข้อความแจ้งพัสดุ/เตือนค้าง = ข้อความบริการ (ไม่มีโปรโมชัน) — ยืนยันตาม CC §4.4
- J3: พัสดุค้างเกินกำหนด — หอตีกลับ/ทิ้งได้ไหม ต้องแจ้งกี่ครั้ง (ใบนี้: เตือนอย่างเดียว ตีกลับด้วยมือพร้อมเหตุผล)

## มติผู้คุม (31 ต.ค. 2569)
- รับค่าปลอดภัยทุกข้อ R1–R10 ตาม §10: R1 id แถวคำนวณจาก (ร้าน, หน่วย, คีย์) + ON CONFLICT DO NOTHING (ไม่มี migration) · R2 signLink (ไม่เก็บ token ในฐาน · ใช้ครั้งเดียวด้วย CAS สถานะ) · R3 DUPLICATE · R4 พนักงานกดรับเท่านั้น · R5 เตือนวันละครั้ง (วันไทย) · R6 ห้องไม่มีสัญญา live บันทึกได้ไม่ส่ง · R7 หน้าสาธารณะไม่มีรูป · R8 ลิงก์ใน UNIT_NAV.DORM · R9 ฉากไม่เขียนค่าตั้ง · R10 ผู้ตรวจยิง probe X1/X7/X10
- J3/J5 §11 ⇒ เพิ่มใน svc-legal-questions.md ตอนรับใบ
- เลน l4 ทดสอบบนฐานหลัก (ep-mute-scene) · ใบรับได้เมื่อผู้คุมรันซ้ำบนฐานหลักหลัง merge
