# ใบสั่ง B.16 — ความชอบ/ข้อห้ามลูกค้าบนการ์ดงาน + มือถือหมอ (แรงนวด · แพ้น้ำมัน) · ตรวจ: **เบา** (รอบเดียว) · ห้ามตัด: แยกร้าน (X1 · คำตอบเหมือน "ไม่มี" ทุกไบต์) · PDPA/ข้อมูลอ่อนไหวตามนโยบายสมาชิก (X8 — ไม่ข้ามแม้ใบเบา) · ไม่มี PII ใน DTO/log/payload

> อ้างอิง: MASTER-PLAN แถว B.16 (+ กราฟ: ขึ้นกับ B.12 · ไปต่อ B.18) · `DESIGN-BOOKING-QUEUE.md` R7 ("บันทึกลูกค้า: ความชอบ/ข้อห้าม … **เก็บใน CRM/สมาชิก ไม่ใช่ในนัด**") · §4.4 แม่แบบนวด/สปา "ความชอบ/ข้อห้าม" · §6 แถว CRM v2 ("ข้อมูลลูกค้าบนการ์ดงาน") · B2.5 · ภาพ `02-calendar-resources` การ์ดคุณนิด ("ชอบแรงกลาง · แพ้น้ำมันตะไคร้" — ภาพของ B.14 · ใบนี้ไม่มีภาพของตัวเอง) · CC §1 (ทะเบียนค่าตั้ง · ชั้น · `ownerOnly`) · ใบ B.5 §3 (จอ/มือถือ) · ใบ B.11 §7 (ตารางสิทธิ์) §8.2 (privacy-shared)
> **engine เดิมที่ต้องใช้ (ห้ามทำใหม่)**: ฟิลด์สมาชิก `src/lib/modules/member/fields.ts` (`listLayout` · `getFieldValues` · ส่วน/ฟิลด์ `sensitive`) · นโยบายอ่อนไหว `src/lib/modules/member/privacy.ts` (`evaluateSensitiveAccess` — ตัวตัดสินตัวเดียวของทั้งระบบ · D8 บทบาท ∪ ตำแหน่ง HR ∪ แผนก · `logAccess` · `logAccessMany` · event `member.sensitive.viewed` เดิม) · เทมเพลตสมาชิก `salon` มีฟิลด์ `pressurePref` + `chemicalAllergy` อยู่แล้วในส่วน "สุขภาพ" (อ่อนไหว)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-b.16.mts» — รับใบ = **ผ่านทุกข้อ** (นับจาก `JSON_SUMMARY`) · SKIP ที่ยอมได้ระหว่างทำ: `G-*` (`--no-regression`) · `S-1` (หลัง merge เท่านั้น)
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.16.mts [--no-regression]` (ห้าม `timeout` ครอบ · ห้าม kill กลางคัน — ล้างข้อมูลอยู่ใน finally) · ฉากอยู่บนร้านชั่วคราว `qc-svc-b16-*` ทั้งหมด
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม prisma generate · ห้าม migration/แตะ `prisma/**` · ห้ามแก้ข้อสอบ/`scripts/**`** · temp ขึ้นต้น `svc-b16-` · รายงานต่อข้อ (id → ผล)
> ผู้คุมแก้ให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` บล็อก "SVC B.16" (`SQC_CUSTOMER_NOTES_SCENE` — ฟิลด์ · นโยบาย · ลูกค้า · ค่าที่ต้องแสดง · ใครเห็นอะไร)
> **ก่อนปล่อย builder ผู้คุมต้องทำ ORACLE-EDIT 2 ใบ** (§6 R1 R2): b.11 K-3/K-4/N-4 (แถวสิทธิ์ที่ 11) · b.0 D-KEYS (+แถว `booking.privacy.jobCardFields`) — ไม่งั้น G-4 (b.11) แดง และ b.0 แดงตอนด่าน G3

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ S-1 ไล่ `git status` ของ src/ prisma/ — ตรวจตอนรับใบเท่านั้น)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/modules/booking/customer-notes.ts» (ใหม่ · server) | §3.1 `loadJobCustomerNotes` + ชนิด `JobCustomerNotes` `JobNoteItem` `NotesViewer` `NotesPage` (export type) |
| `src/lib/modules/booking/privacy-shared.ts` | §3.2 `canSeeCustomerNotes` (pure · import ค่าได้แค่ `@/lib/core/rbac` — S-4) |
| «src/lib/modules/member/<ไฟล์ใหม่>.ts» (ใหม่ · แนะนำ `staff-notes.ts`) + `src/lib/modules/member/index.ts` (**เพิ่มบรรทัด export อย่างเดียว** — S-4) | §3.3 ฟังก์ชันฝั่งสมาชิกที่ประกอบ engine เดิม (ตัดสินอ่อนไหว + บันทึกการดู + กันซ้ำ) |
| `src/lib/core/permissions.ts` | §4 คีย์ `booking.customer.notes` + แถว `notes` ต่อท้าย `BOOKING_ROLE_ROWS` + ชุด LEAD/PROVIDER |
| `src/lib/core/settings/defs/booking.ts` | §5 def `booking.privacy.jobCardFields` **ตัวเดียว** (ห้ามแตะ key/ค่าเริ่ม/chain/schema ของ def อื่น) |
| `src/components/booking/TodayLine.tsx` · `MyQueue.tsx` (+ไฟล์ใหม่ใต้ `src/components/booking/` เช่น «JobNotes.tsx») | §3.4 prop `notes` (เพิ่มอย่างเดียว · ไม่ส่ง = DOM เดิมทุกไบต์) |
| `src/app/app/u/[unitSlug]/booking/page.tsx` · `…/booking/mine/page.tsx` | §3.5 ต่อสาย: เรียกตัวโหลดหลัง `loadTodayLine` แล้วส่ง `notes=` |
| `src/lib/modules/booking/index.ts` | re-export ได้ถ้าจำเป็น |

**ห้ามแตะ** (S-2 · `git status` ต้องว่าง): `prisma/**` · `member/fields.ts` `member/privacy.ts` `member/profile.ts` `member/access.ts` (engine/นโยบายเดิม — ต้องการความสามารถเพิ่ม = เขียนคำขอใน wo-notes) · `booking/today-line.ts` `line-access.ts` `line-ops.ts` `planner*.ts` `queue-line.ts` `service.ts` · `src/lib/actions/booking*.ts` (B.11 K-6 นับ export ทุกตัว — ใบนี้ไม่มี action ใหม่) · `core/settings/{service,registry,types}.ts` · 3 ทะเบียน event (ใบนี้ไม่มี event ใหม่ — ใช้ `member.sensitive.viewed` เดิม)

## 2. หลักการ (ข้อสอบตรวจทุกข้อ)
- **ข้อมูลอยู่ในสมาชิก ไม่ใช่ในนัด** (R7): ใบนี้ **อ่านอย่างเดียว** — ไม่เขียน Customer/MemberFieldValue/Appointment/AuditLog (X-7) · ร้านกรอก/แก้ความชอบที่หน้าสมาชิก 360 เดิม (ไม่มีฟอร์มใหม่)
- **สองด่านซ้อน**: (1) คีย์จอง `booking.customer.notes` ของสาขานั้น (ไม่ผ่าน ⇒ `{}` ทันที **ไม่อ่านค่า ไม่บันทึกการดู** — L-7) · (2) ฟิลด์อ่อนไหว (ฟิลด์ `sensitive` หรืออยู่ในส่วน `sensitive`) ⇒ `evaluateSensitiveAccess` ของสมาชิกตัดสิน **ทีละเป้าหมายตามกติกาเดิม** (ฟิลด์ในส่วนอ่อนไหว ⇒ `SECTION/<sectionId>` · ฟิลด์อ่อนไหวในส่วนปกติ ⇒ `FIELD/<fieldId>`) — คีย์ `booking.*` **ไม่ใช่ใบผ่านข้อมูลอ่อนไหว** (L-8)
- **X1**: ทุกคิวรีผูก `tenantId + unitId` ของ ctx · ระบบสมาชิก = `systemForUnit(tenantId, unitId, "MEMBER")` · ลูกค้าต้องอยู่ร้าน+ระบบสมาชิกนั้น · ของร้าน/สาขาอื่น/ไม่มีจริง/ไม่มีระบบสมาชิก ⇒ **ไม่มีคีย์ในผลลัพธ์** (เหมือน id ที่ไม่มีจริงทุกไบต์ — X-1)
- **X8**: DTO มีแค่ `{appointmentId, items[{key,label,display,sensitive}], hidden}` — ไม่มีชื่อ/เบอร์/อีเมล/รหัสสมาชิก/customerId/fieldId (X-3) · ไม่มี `console.*` ในตัวโหลด (X-6) · ไม่ยิง outbox เอง (S-3) · event เดียวที่เกิดได้ = `member.sensitive.viewed` ทางเดิมของสมาชิก (payload เป็น id ล้วน — X-5)
- เวลาไทย/วันไทย (กันบันทึกซ้ำรายวัน) ใช้ epoch+7 ชม. หรือ `bkkYmd` · ห้าม `.getDay()/.getHours()/…` ดิบ (S-3)

## 3. สัญญา (ข้อสอบเรียกตามชื่อนี้)

### 3.1 «customer-notes.ts»
```ts
import type { LineMember } from "./line-access";
export type NotesPage = "booking.today" | "booking.mine";
export type NotesViewer = { userId: string; member: LineMember };          // Membership สดจาก requireUnit (role · unitAccess · permissions)
export type JobNoteItem = { key: string; label: string; display: string; sensitive: boolean };
export type JobCustomerNotes = { appointmentId: string; items: JobNoteItem[]; hidden: number };
export async function loadJobCustomerNotes(
  ctx: { tenantId: string; unitId: string },
  viewer: NotesViewer | null,
  appointmentIds: string[],
  opts?: { page?: NotesPage; now?: Date },
): Promise<Record<string, JobCustomerNotes>>;   // คีย์ = appointmentId · ไม่ throw ในทางปกติ (ข้อมูลเข้าแปลก ⇒ {})
```
ลำดับ:
1. ctx/viewer ผิดรูป · `appointmentIds` ไม่ใช่อาร์เรย์ · `!canSeeCustomerNotes(viewer.member, ctx.unitId)` ⇒ `{}`
2. id: เอาเฉพาะสตริงไม่ว่าง · ไม่ซ้ำ · **200 ตัวแรก** (ที่เหลือทิ้ง — L-11)
3. หน่วยต้องเป็นหน่วยของ tenant · ระบบสมาชิกของหน่วย ไม่มี ⇒ `{}` (X-2)
4. นัด: `id ∈ ids AND tenantId AND unitId AND customerId IS NOT NULL` · ลูกค้า: `tenantId + memberSystemId` ของระบบนั้น · `status ∈ {ACTIVE, SUSPENDED}` (MERGED/CLOSED ไม่ขึ้น — L-9)
5. ฟิลด์ที่โชว์ = ค่าตั้ง `booking.privacy.jobCardFields` (resolve ที่ `{unitId}` — §5) **ตามลำดับในค่าตั้ง** · ข้าม (เงียบ): รหัสที่ไม่มีจริง · ฟิลด์เก็บแล้ว (`archivedAt`) · ฟิลด์ระบบ (`isSystem` เช่น phone/email/birthDate — **กันเบอร์หลุดผ่านค่าตั้ง**) · ชนิดที่ไม่รองรับ (รองรับเฉพาะ `TEXT LONG_TEXT NUMBER SELECT MULTI_SELECT BOOLEAN` — R7 ในมติ §6)
6. ต่อฟิลด์อ่อนไหว: ตัดสินด้วย `evaluateSensitiveAccess` (actor = `toMemberActor(viewer.userId, viewer.member)`) — คำตัดสินไม่ขึ้นกับลูกค้า ยกเว้น `sameUnitOnly` (ตรวจสาขาหลักของลูกค้า) ⇒ แคชต่อ (เป้าหมาย, ลูกค้า) ภายในคำขอเดียวได้ · ห้ามแคชข้ามคำขอ
7. `hidden` = จำนวนฟิลด์อ่อนไหว **ที่ตั้งไว้และรองรับ** ที่ผู้ดูคนนี้ดูไม่ได้ (ไม่ขึ้นกับว่าลูกค้ามีค่าหรือไม่ — ตัวเลขนี้ไม่บอกอะไรเกี่ยวกับลูกค้า)
8. รายการ = ฟิลด์ที่ดูได้และ **มีค่า** (ว่าง/`[]`/null ⇒ ไม่ขึ้น · BOOLEAN false = มีค่า "ไม่ใช่") · ผลลัพธ์มีคีย์ของนัดเมื่อ `items.length > 0 || hidden > 0` (L-6: c3 ไม่มีค่า ⇒ OWNER ไม่มีคีย์ · หมอ 2 = `{items: [], hidden: 3}`)
9. `display`: SELECT = ป้ายตัวเลือก · MULTI_SELECT = ป้ายคั่น `" · "` (ค่าที่ไม่มีในตัวเลือกแล้วทิ้ง · เหลือ 0 = ไม่ขึ้น) · BOOLEAN = `ใช่`/`ไม่ใช่` · NUMBER = `String(ตัวเลข)` · TEXT/LONG_TEXT = ยุบช่องว่าง/ขึ้นบรรทัดเป็นช่องเดียว + trim · ยาวเกิน 120 ตัวอักษร (นับ code point) ⇒ 120 ตัวแรก + `"…"` (L-2) · `label` = ป้ายของฟิลด์ใน engine
10. **บันทึกการดู (D17)**: ค่าอ่อนไหวที่ **ใส่ลง DTO จริง** และนโยบาย `logAccess = true` ⇒ แถว `MemberAccessLog` ต่อ (ผู้ดู, ลูกค้า, เป้าหมาย, page) · `page` = `opts.page ?? "booking.today"` · **กันซ้ำ**: มีแถวเดียวกัน (userId, customerId, targetType, targetId, page) ที่ `createdAt` อยู่ **วันไทยเดียวกับ now** แล้ว ⇒ ไม่เขียนเพิ่ม (จอรีเฟรชทุก 5 วิ — ไม่กันซ้ำ = 720 แถว/ชม./คน) · แถวใหม่ทั้งก้อนเขียนแบบ `logAccessMany` (event สรุปใบเดียว) · ตำแหน่ง/พนักงาน HR ณ ตอนดูลงแถว (X-4) · `logAccess = false` ⇒ เห็นแต่ไม่บันทึก
11. ไม่มี `console.*` · ไม่แตะตารางสมาชิกตรง (ทุกอย่างผ่าน facade `@/lib/modules/member` — S-3)

### 3.2 `privacy-shared.ts`
```ts
export function canSeeCustomerNotes(m: MembershipCtx | null, unitId: string): boolean;   // evaluate(m, { module: "booking", action: "booking.customer.notes", unitId })
```
(OWNER ✓ · MANAGER สาขาที่คุม ✓ · STAFF ต้องมีคีย์หรือ `booking.*` ในสาขาที่คุม · null ✗ — P-3)

### 3.3 ฝั่งสมาชิก (ไฟล์ใหม่ใน `src/lib/modules/member/` + export ผ่าน `index.ts`)
ชื่อ/รูปเลือกเองได้ (ข้อสอบตรวจผ่านตัวโหลดของจอง) — แนะนำ:
```ts
export async function staffNotesFor(ctx: MemberCtx, actor: MemberActor,
  input: { customerIds: string[]; fieldKeys: string[]; page: string; now?: Date }): Promise<Record<string, { items: JobNoteItem-รูปเดียวกัน[]; hidden: number }>>;
```
ทำ §3.1 ข้อ 4–10 ด้วย `listLayout` + `getFieldValues` + `evaluateSensitiveAccess` + `logAccessMany` (+คิวรีกันซ้ำของ `MemberAccessLog`) — **เหตุผลที่ต้องอยู่ฝั่งสมาชิก**: ตารางบันทึกการดู/นโยบายเป็นของโมดูลสมาชิก · booking ห้ามอ่านตาราง member* ตรง (S-3) · `evaluateSensitiveAccess`/`logAccessMany` ยังไม่ export จาก facade ⇒ ฟังก์ชันใหม่นี้เรียกภายในโมดูลได้เลย (ไม่ต้อง export ตัวเดิมเพิ่ม)

### 3.4 สัญญา DOM — `TodayLine` / `MyQueue` (prop ใหม่ `notes?: Record<string, JobCustomerNotes>` · `import type` เท่านั้น — S-6)
- ทุกงานที่มี `notes[appointmentId]`: กล่อง `[data-job-notes=<appointmentId>]` อยู่ **ในกล่องแถวของงานนั้น**: TodayLine = `[data-line-wait]` + `[data-line-inservice]` · MyQueue = `[data-my-job]` (กำลังทำ) + **ทุก** `[data-line-wait]` (คิวถัดไป + แถวรวม)
- รายการ: `[data-job-note=<key>][data-sensitive="true|false"]` ข้อความมี `label` และ `display` (เช่น "แรงกดที่ชอบ: ปานกลาง") · ฟิลด์อ่อนไหวทำเครื่องหมายให้เห็น (ไอคอน/สี — ไม่ตรวจ)
- `hidden > 0` ⇒ `[data-job-notes-hidden=<N>]` ข้อความไทยมีคำว่า "ซ่อน" (เช่น "ซ่อน 3 รายการ — ไม่มีสิทธิ์ดูข้อมูลอ่อนไหว") · `hidden = 0` ⇒ ไม่มีกล่องนี้
- **ไม่ส่ง `notes` หรือส่ง `{}` ⇒ HTML เท่าเดิมทุกไบต์** (R-3 — ร้านตัดผม/ผู้ไม่มีสิทธิ์เห็นจอ B.5 เดิม · ข้อสอบ B.5 ไม่สะเทือน)
- ห้ามฮาร์ดโค้ดรหัสฟิลด์/คีย์ค่าตั้งในคอมโพเนนต์/หน้า (S-6) · 390 px ไม่ล้น (ตัดบรรทัดได้ · `break-words`)

### 3.5 หน้า
- `/booking` (แถวเดียว) และ `/booking/mine`: หลัง `loadTodayLine` (ได้ view) ⇒ `loadJobCustomerNotes({tenantId, unitId}, { userId: auth.user.id, member: <LineMember จาก auth.active> }, [...waiting, ...inService, ...skipped].map(j => j.appointmentId), { page: "booking.today" | "booking.mine", now: qc.now })` ⇒ `<TodayLine … notes={notes} />` / `<MyQueue … notes={notes} />` (S-5) · จอเดิม (ร้านไม่เปิดแถวเดียว) ไม่ต้องทำ (หนี้ §7)
- ไม่มี server action ใหม่ · ไม่มีหน้าใหม่

## 4. สิทธิ์ (`permissions.ts`)
- คีย์ `booking.customer.notes` ป้าย "เห็นความชอบ/ข้อห้ามของลูกค้าบนการ์ดงาน (ข้อมูลอ่อนไหวตามนโยบายสมาชิก)" · ไม่ planned (มีโค้ดเรียก — P-1)
- `BOOKING_ROLE_ROWS` **ต่อท้าย** `{ id: "notes", labelTh: "เห็นความชอบ/ข้อห้ามลูกค้าบนการ์ดงาน", keys: ["booking.customer.notes"] }` (แถวเดิม 10 แถวไม่เลื่อน — P-2)
- `SHOP_PRESET` (ทุกแม่แบบ): LEAD + PROVIDER ได้ `notes` · CASHIER ไม่ได้ · CLINIC ASSISTANT ไม่ได้ (คลินิกไม่มีเวชระเบียนในจอง · DESIGN §11)

## 5. ค่าตั้ง (`defs/booking.ts` · `row()` เดิม — กลุ่ม privacy ได้ `sensitivity: "PRIVACY"` + `ownerOnly` อัตโนมัติ)
```ts
row({ key: "booking.privacy.jobCardFields", type: "table", chain: T,
      labelTh: "ข้อมูลลูกค้าที่โชว์บนการ์ดงาน (รหัสฟิลด์สมาชิก ตามลำดับ)",
      helpTh: "ใส่รหัสฟิลด์จากตัวออกแบบฟิลด์สมาชิก เช่น pressurePref · ฟิลด์อ่อนไหวเห็นเฉพาะคนที่นโยบายสมาชิกอนุญาต · ฟิลด์ระบบ (เบอร์/อีเมล) ไม่โชว์",
      schema: <อาร์เรย์สตริง 0–20 ตัว ไม่ซ้ำ · แต่ละตัว /^[a-z][a-zA-Z0-9_]{0,63}$/>,
      v: [[], ["pressurePref", "chemicalAllergy"], []] })   // BARBER · SPA · CLINIC · _fallback = [] (BARBER)
```
- **ชั้น TENANT** (ไม่ใช่ UNIT): รหัสฟิลด์เป็นของระบบสมาชิกระดับร้าน + กล่อง "ความเป็นส่วนตัว (ทั้งร้าน)" หน้า 14 โหลดที่ชั้น TENANT อยู่แล้ว ⇒ แถวโผล่เองจากทะเบียน (D-4 · ไม่วาดหน้าเอง) · ไม่ชน b.11 M-9 (ไล่เฉพาะคีย์ชั้น UNIT) · ร้านที่ยังไม่ตั้ง ⇒ ค่าแม่แบบของสาขา (SPA = ฟิลด์ของเทมเพลตสมาชิก salon — D-3)
- ต้อง ORACLE-EDIT b.0 D-KEYS (มติ R2) — แบบเดียวกับ `booking.late.lateCancelMode` ของ B.8

## 6. จุดที่แบบไม่ชัด — ผู้เขียนข้อสอบเลือกแล้ว (ผู้คุมเคาะได้ · เปลี่ยน = ORACLE-EDIT)
| # | เรื่อง | เลือก | เหตุผล |
|---|---|---|---|
| R1 | ใครเห็นโดยปริยาย | คีย์ใหม่ `booking.customer.notes` + แถวที่ 11 ในตารางสิทธิ์ · LEAD/PROVIDER ได้ · แคชเชียร์ไม่ได้ | หมอนวดต้องรู้แรงกด/อาการแพ้ก่อนลงมือ · แคชเชียร์ไม่จำเป็น · **ต้อง ORACLE-EDIT b.11 K-3 (ROLE_ROWS +แถว notes) · K-4/N-4 (PRESET_ROWS LEAD/PROVIDER + "notes")** — ทางเลือก: ไม่เพิ่มแถว (คีย์ในทะเบียนอย่างเดียว · ร้านติ๊กรายคนที่หน้าผู้ใช้) ⇒ แก้ข้อสอบนี้ P-2 แทน |
| R2 | ที่อยู่ค่าตั้ง | `booking.privacy.jobCardFields` ชั้น TENANT · เจ้าของเท่านั้น | การเลือกโชว์ข้อมูลลูกค้าให้พนักงานเห็น = เรื่องความเป็นส่วนตัว · **ต้อง ORACLE-EDIT b.0 D-KEYS** (`CAT` +1 แถว `{ key, type: "table", chain: ["TENANT"], v: [[], ["pressurePref","chemicalAllergy"], []] }`) |
| R3 | ฝั่งสมาชิกแตะได้แค่ไหน | ไฟล์ใหม่ 1 ไฟล์ + export เพิ่มใน `member/index.ts` · **ไม่แตะ** fields/privacy/profile/access | แผนสั่ง "ใช้ engine เดิม" · บันทึกการดู/กันซ้ำเป็นตารางของสมาชิก |
| R4 | ตัวแก้ค่าตั้ง | ใช้ตัวแก้ชนิด table เดิมของ SettingsForm (JSON) | ทะเบียนไม่รู้รายชื่อฟิลด์ของร้าน · ตัวเลือกจากฟิลด์จริง = หนี้ UX (§7) |
| R5 | ความยินยอม | ใบนี้ **ไม่เก็บข้อมูล** (อ่านอย่างเดียว) ⇒ ไม่มีด่านยินยอมใหม่ · ระบบสมาชิกไม่มีชนิดยินยอมข้อมูลอ่อนไหว (ม.26) — ส่งคำถาม J5 | ค่าปลอดภัย: ฟิลด์อ่อนไหวเห็นตามนโยบายสมาชิก + บันทึกการดูทุกวัน |
| R6 | ฉาก svcqc | ไม่มี (ไม่มีภาพแบบ · ฉากอยู่ร้านชั่วคราว) · Q-1 ตรวจว่า svcqc ไม่ถูกแตะ | ห้ามเปลี่ยนค่าตั้งระดับร้านของ svcqc · ร้านนวด svcqc ยังไม่ผูกระบบสมาชิก — ผูกเพิ่มกระทบฉากใบอื่น |
| R7 | ชนิดฟิลด์ | TEXT LONG_TEXT NUMBER SELECT MULTI_SELECT BOOLEAN · ข้าม DATE/DATETIME/MONEY/FILE/LOOKUP | การ์ดงานต้องอ่านเร็ว · LOOKUP ต้อง resolve ชื่อข้ามโมดูล · FILE เปิดไฟล์ = X10 |
| R8 | บันทึกการดู | ต่อ (ผู้ดู, ลูกค้า, เป้าหมาย, หน้า) วันละ 1 แถว | จอรีเฟรช 5 วิ · หลักฐาน D17 ยังครบ ("ใครเห็นของใคร วันไหน จากจอไหน") |
| R9 | ลูกค้า MERGED/CLOSED | ไม่ขึ้น | MERGED มีแถวผู้ชนะแล้ว · CLOSED = ปิดบัญชี |
| R10 | regression สมาชิก | `qc-member-m1.3` (ตัวออกแบบฟิลด์ · ค้างได้เฉพาะ S3.1–S3.3 = ภาพ/เบราว์เซอร์) | m1.4/m1.7 ผูก `member-expected.json` ของฐาน member QC — บนฐาน qc-svc ล้มที่ข้อเริ่ม (วัด 31 ต.ค.: `Cannot read properties of null (reading 'role')`) ⇒ ข้อสอบนี้ทดสอบนโยบายอ่อนไหวเองใน PC-2/L-3–L-8/X-4 แทน |

## 7. ไม่ใช่เรื่องของใบนี้ / หนี้ส่งต่อ
- ปฏิทินร้านนวด (ภาพ 02 การ์ดคุณนิด) = **B.14** เรียก `loadJobCustomerNotes` ตัวเดียวกัน (page ใหม่ `booking.calendar` — เพิ่มใน `NotesPage` ตอนนั้น)
- จอรายการนัดเดิม (ร้านไม่เปิดแถวเดียว) ไม่แสดงโน้ต
- ตัวเลือกฟิลด์จากรายชื่อฟิลด์จริงบนหน้า 14 (แทน JSON) · แสดง DATE/LOOKUP บนการ์ด
- ⚠️ ข้อสังเกต (ไม่แก้ในใบนี้ — ส่งเจ้าของโมดูลสมาชิก): `member/chat-bridge.ts#cardFieldsFor` โชว์ฟิลด์ `showOnCard` ในแผงแชทโดยไม่ผ่าน `evaluateSensitiveAccess` — ถ้าร้านติ๊ก showOnCard ให้ฟิลด์อ่อนไหว ค่าจะหลุดในแผงแชท
- คำถาม J5 (ลง `ledger/wo-notes/svc-legal-questions.md` โดยผู้คุม): อาการแพ้/ตั้งครรภ์ = ข้อมูลสุขภาพ (ม.26) — ร้านต้องขอความยินยอมชัดแจ้งตอนกรอกในหน้าสมาชิกไหม · หมอนวดเห็นได้ภายใต้ "จำเป็นต่อการให้บริการ" ไหม

## 8. เกณฑ์รับ
- ข้อสอบ B.16 ผ่านทุกข้อ (G ครบ: b.4 · b.5 · b.6 · b.11 · member m1.3 · smoke) · typecheck + fitness 2 โหมด (ผู้คุม) · ไม่มีภาพ (ไม่มีแบบ) — ผู้คุมเปิด /booking/mine ที่ 390 ดูด้วยตาหนึ่งครั้งพอ
- รายงาน builder: ต่อข้อ id → ผล + ไฟล์ที่แตะ + ข้อที่แย้ง (ถ้ามี)

## มติผู้คุม (31 ต.ค. 2569)
- R1 ✅ คีย์ `booking.customer.notes` + แถวที่ 11 `notes` ในตารางสิทธิ์ (หัวหน้าร้าน/หมอนวดได้ · แคชเชียร์ไม่ได้) · ⚖️ อนุมัติให้ builder ทำ ORACLE-EDIT b.11 K-3/K-4/N-4 และ b.0 D-KEYS **เฉพาะการเพิ่มแถว/คีย์นี้** ติดป้าย `// ORACLE-EDIT (ผู้คุม 31 ต.ค. · b16-R1/R2)` · ห้ามลดความเข้มข้ออื่น
- R2 ✅ `booking.privacy.jobCardFields` TENANT · ownerOnly · ค่าเริ่ม SPA = pressurePref + chemicalAllergy
- R3 ✅ ฝั่งสมาชิก: ไฟล์ใหม่ 1 + export ใน member/index.ts เท่านั้น · R4 ✅ (ตัวเลือกฟิลด์จริง = หนี้ UX) · R5 ✅ อ่านอย่างเดียว + คำถาม J5 (ยินยอมข้อมูลสุขภาพ ม.26)
- R6–R10 ✅ ตามที่เสนอ
- ⚠️ นอกใบ (แจ้งเจ้าของแล้ว): member/chat-bridge.ts#cardFieldsFor แสดงฟิลด์ showOnCard ในแชทโดยไม่ผ่าน evaluateSensitiveAccess — ใบนี้ห้ามแก้ (นอกขอบเขต)

## มติผู้คุม รอบแก้ (31 ต.ค.)
- N1 ✅ (LG-1b 2 รอบ) · N2 ✅ · N3: ⚖️ NQ-2 รับเกณฑ์ "คงที่ต่อจำนวนสาขาหลักของลูกค้าในคำขอ" แทน ≤12 (16 คิวรีกับ 2 สาขาหลัก · ไม่โตตามจำนวนลูกค้า) — คงหลัก evaluateSensitiveAccess ตัวตัดสินเดียว · ไม่ตัดสินเอง
