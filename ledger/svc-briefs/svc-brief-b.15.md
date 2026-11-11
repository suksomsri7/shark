# ใบสั่ง B.15 — คู่รัก/กลุ่ม (1 การจอง = หลายงาน) · ตรวจ: เข้ม 2 รอบ (กันจองซ้อน/ตัวจัดคิว + มัดจำ) + perf · ห้ามตัด: กันจองซ้อน (X3) · แยกร้าน (X1) · เงินตรงทุกสตางค์ + GL สมดุล · PDPA (X8)

> อ้างอิง: MASTER-PLAN แถว B.15 (+ กราฟ B.13 ─► {B.14 B.15}) · `DESIGN-BOOKING-QUEUE.md` R7 ("คู่รัก/กลุ่ม: 1 การจอง = หลายงาน (`groupId`) เริ่มพร้อมกัน ห้องเดียว") · §4.4 (`Appointment.groupId?`) · ภาคผนวก ก #15 (`booking.service.staffCount` "1 (คู่รัก 2)") · #33–37 (มัดจำ) · ภาพ 02 (คู่รัก 2 หมอ 1 ห้อง — จอเป็นของ B.14)
> ใบก่อน: **B.13** (ใบสั่ง §3–§5 · `/root/svc-runs/fix/b13.md` Q1–Q19 — นิยามช่วงถือ §4.6 · ยุคการมาถึง/unplacedFor · IN_SERVICE overrun · ล็อกทรัพยากรเรียงตาม id · resourceShort) · **B.8** (มัดจำ · `/root/svc-runs/fix/` ของ B.8) · B.3 (`bookAppointment`) · B.4 (checkIn/J1–J6) · B.7 (ลิงก์จัดการนัด · `rescheduleBySelf`/`cancelOnline`) · B.2 (planDay)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-b.15.mts» — รับใบ = **ผ่านทุกข้อ ไม่มี SKIP** (SKIP ที่ยอมระหว่างทำ: `G-*` เมื่อ `--no-regression` · `SF-1` หลัง merge)
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.15.mts [--no-regression]` (ห้าม `timeout` ครอบ · ลูกโพรเซส 5 ตัว · `QC_B15_FUZZ_N` เปลี่ยนจำนวน fuzz — รับใบใช้ค่าเริ่ม)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม prisma generate · ห้ามแตะ `prisma/**`/migration · ห้ามแก้ข้อสอบ/`scripts/`** · รายงานต่อข้อ (id → ผล)

## 0. ภาพรวม
ลูกค้าจอง "คู่รัก 2 คน" หรือ "กลุ่ม" = **การจองเดียว แต่เป็นงาน N แถว** (`Appointment` N แถว · `groupId` เดียวกัน) · ทุกคนเริ่มเวลาเดียวกัน · หมอคนละคน · ใช้ห้อง/เตียงชิ้นเดียวกันต่อชนิด (ห้องคู่ความจุ 2 ⇒ กลุ่มเดียวเต็มห้อง) · **ได้ครบทุกคน+ห้องพร้อมกัน หรือไม่ได้เลย** · ยกเลิก/เลื่อนทั้งกลุ่มในธุรกรรมเดียว · มัดจำรวมจ่ายครั้งเดียว (ยอด = ผลรวมต่อคน) · ตัววางคิวไม่แยกกลุ่ม (คนหนึ่งช้า ⇒ ทั้งกลุ่มเริ่มพร้อมกันที่เวลาช้าสุด) · ร้านที่ไม่ใช้กลุ่ม (ไม่มีแถว groupId · staffCount 1) = พฤติกรรม B.13 ทุกไบต์

**ไม่ต้องมี migration**: `Appointment.groupId String?` + `@@index([groupId])` มีแล้วจาก B.0 (`prisma/schema/booking.prisma:136,150`) · หัวกลุ่ม = แถวสมาชิกแรก (ถือ `manageTokenHash` · สมาชิกอื่น `null`) · มัดจำใช้คอลัมน์เดิมต่อแถว · ข้อสอบ SF-2 ตรวจว่า `prisma/` ไม่ถูกแตะ — ถ้าระหว่างทำพบว่าต้องมีคอลัมน์ = **หยุด รายงานผู้คุม** (ข้อยกเว้นกติกาข้อ 5 ต้องมีมติแบบ b13-R1)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ SF-1 ไล่ `git status` · accept-time)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/modules/booking/group.ts» (ใหม่) | §3.1 `bookGroup` · `findGroupSlots` · `groupOf` · `cancelGroup` · `rescheduleGroup` |
| `src/lib/modules/booking/service.ts` | §3.2 `bookAppointment` ของบริการ staffCount ≥ 2 ⇒ ทางกลุ่ม · `BookResult` ok + `groupId?` · `rescheduleBySelf` ของแถวในกลุ่ม ⇒ ทั้งกลุ่ม · `expireDepositHolds` ปล่อยทั้งกลุ่มใน tx เดียว · ตัวช่วยมัดจำกลุ่ม · **`busyRowsOf` `slotClear` `selfQuotaOk` `openCountForPhone` `replayOf` `holdMinutesOf` ห้ามแก้** (b.8 S-4) |
| `src/lib/modules/booking/queue-line.ts` | §3.3 `checkIn` ทางเบอร์/QR/LINE ของสมาชิกกลุ่ม ⇒ ทั้งกลุ่ม · `rescheduleByShop` ของแถวในกลุ่มที่เปลี่ยนเวลา ⇒ `GROUP` |
| `src/lib/modules/booking/online.ts` | §3.4 ลิงก์จัดการนัดของหัวกลุ่ม = ทั้งกลุ่ม (เลื่อน/ยกเลิก/ยอดยกเลิกช้า) |
| `src/lib/modules/booking/deposit.ts` | §3.5 มัดจำรวม (หน้าจ่าย · สลิป · ร้านยืนยัน · คืน · ริบ) — ทุกทางที่ได้ id ของหัวกลุ่ม ⇒ ทำกับทุกสมาชิก |
| `src/lib/modules/booking/planner.ts` + «planner-*.ts» (pure) | §3.6 `PlanJob.groupId?` · กติกาเริ่มพร้อมกัน · ด่านห้องแบบกลุ่ม (pure ใช้ร่วมกับ group.ts) |
| `src/lib/modules/booking/planner-run.ts` | §3.6 ส่ง `groupId` เข้า PlanJob (JOB_SELECT) |
| `src/lib/modules/booking/resources.ts` | เพิ่มตัวช่วยด่านกลุ่มได้ (เพิ่มเท่านั้น · `readHolds`/`loadGate` นิยามเดิมห้ามเปลี่ยน — ข้อสอบ b.13 ต้องเขียว) |
| `src/lib/modules/booking/index.ts` | re-export ได้ |

ห้ามแตะ: `prisma/**` · `src/lib/core/**` (รวม `defs/booking.ts` — ใช้คีย์เดิม `booking.service.staffCount` · **ไม่มีคีย์ใหม่**) · POS/HR/payment · `today-line.ts` `line-ops.ts` `public-line.ts` `devices.ts` `finish.ts` `settings-model.ts` · 3 ทะเบียน event (**ไม่มี event ใหม่** — ใช้ `booking.created`/`booking.cancelled`/`booking.deposit_*` เดิมต่อสมาชิก · เพิ่มคีย์ `groupId` ใน payload ได้ (id ล้วน)) · จอ (จอกลุ่มบนปฏิทิน = B.14 · หน้าจองออนไลน์ได้กลุ่มผ่านบริการ staffCount 2 โดยไม่ต้องแก้ UI)
> line-ops / public-line / today-line เรียก planner-run อยู่แล้ว ⇒ ได้กติกากลุ่มของตัววางคิวโดยไม่ต้องแตะ — ถ้าพบว่าต้องแตะ = หยุด รายงานผู้คุม

## 2. หลักการ (ข้อสอบตรวจทุกข้อ)
- **อะตอมมิก**: ตรวจ → เขียน N แถว ในธุรกรรมเดียวใต้ล็อก §5 · ล้ม ⇒ ไม่มีแถวใดถูกสร้าง/ย้าย/ยกเลิก · ตัวกันในหน่วยความจำ = แดง (ข้อสอบยิง 5 โพรเซส)
- **ด่านเดียว**: "กลุ่มลงที่ t ได้ไหม" (หมอ + ห้อง) สูตรเดียวระหว่าง `findGroupSlots` · `bookGroup` · `rescheduleGroup` · ทาง staffCount ของ `bookAppointment` · ฝั่งห้องใช้ `planner-resources.ts` (pure) ร่วมกับตัววางคิว · ช่วงถือของแต่ละสมาชิก = นิยาม B.13 §4.6 ต่อแถว (ไม่มีนิยามช่วงถือแบบกลุ่มแยก) ⇒ `readHolds`/`loadGate`/ข้อสอบ `resViolations` ใช้ได้ทันที
- **ไม่ throw ออกจาก facade** (40P01/40001/P2028 ⇒ ลองใหม่ 1 ครั้ง ⇒ `BUSY`) · เกณฑ์รับ = deadlock ของฐาน 0 (X-9)
- ไม่มี connection ที่สองขณะถือล็อก (ค่าตั้ง/โปรไฟล์หมอ/ชนิดทรัพยากร/snapshot อ่านก่อน tx — B.3 G2) · CAS ทุกการเขียนสถานะ/เวลา/ห้อง
- **_fallback**: ไม่มี groupId ⇒ ทุกทางเท่า B.13 ทุกไบต์ (FZ-G0 · G-1 b.2 · G-2 b.13) · `booking.service.staffCount` = 1 (ค่าเริ่มทุกแม่แบบ) ⇒ `bookAppointment` เดิมทุกไบต์
- เวลาไทย `localToUtc`/`bkk*` · ไม่มี `any` · zod v4 · ข้อความไทยไม่โทษผู้ใช้ · เงินเป็นสตางค์

## 3. สัญญา (ข้อสอบมีสำเนาชนิด — ชื่อ field ต้องตรง)

### 3.1 «group.ts»
```ts
export type GroupMemberInput = { serviceId: string; staffId: string | null };   // null = ใครก็ได้
export type GroupBookInput = {
  members: GroupMemberInput[];          // 2–10 คน · ลำดับ = ลำดับสมาชิก (คนแรก = หัวกลุ่ม)
  dateStr: string; startMin: number; channel: BookingChannel;   // "ONLINE" | "LINE" | "STAFF" | "PHONE"
  customerName: string; customerPhone: string; note?: string; idempotencyKey?: string; partyId?: string;
};
export type GroupFailCode = BookFailCode | "GROUP_SIZE";
export type GroupBookResult =
  | { ok: true; groupId: string; ids: string[]; staffIds: string[]; status: "PENDING" | "CONFIRMED"; holdUntil: Date | null; depositSatang: number }
  | { ok: false; code: GroupFailCode; reason: string };
export async function bookGroup(ctx: BookingCtx, i: GroupBookInput): Promise<GroupBookResult>;

export type GroupSlot = { startMin: number; hhmm: string; staffIds: string[] };
export async function findGroupSlots(ctx: BookingCtx, q: { members: GroupMemberInput[]; dateStr: string; channel: BookingChannel }, opts?: { now?: Date; excludeGroupId?: string }): Promise<GroupSlot[]>;

export type GroupMember = { appointmentId: string; staffId: string; serviceId: string; status: string; startAt: Date; resourceIds: string[]; leader: boolean; deposit: DepositInfo | null };
export type GroupDeposit = { requiredSatang: number; paidSatang: number; usedSatang: number; forfeitedSatang: number; refundedSatang: number; refundDueSatang: number }; // = ผลรวมของ DepositInfo ทุกสมาชิก
export type GroupView = { groupId: string; unitId: string; members: GroupMember[]; deposit: GroupDeposit };
export async function groupOf(ctx: { tenantId: string; unitId: string }, idOrGroupId: string): Promise<GroupView | null>; // id สมาชิกใดก็ได้ หรือ groupId · ข้ามร้าน/หน่วย ⇒ null

export type GroupOpFail = "NOT_FOUND" | "BAD_STATE" | "FULL" | "PAST" | "BAD_INPUT" | "ON_LEAVE" | "NOT_QUALIFIED" | "LOST_RACE" | "BUSY";
export type GroupOpResult = { ok: true; ids: string[] } | { ok: false; code: GroupOpFail; reason: string };
export async function cancelGroup(ctx: LineCtx, groupId: string, opts?: { now?: Date; note?: string }): Promise<GroupOpResult>;
export async function rescheduleGroup(ctx: LineCtx, groupId: string, to: { dateStr: string; startMin: number }, opts?: { now?: Date }): Promise<GroupOpResult>;
```
- `bookGroup` ลำดับตรวจ = `bookAppointment` (B.3 ①–⑥) ต่อสมาชิก + ขนาดกลุ่ม: `members` ไม่ใช่ array / < 2 / > 10 ⇒ `GROUP_SIZE` · หมอระบุตัวซ้ำในกลุ่ม ⇒ `BAD_INPUT` · บริการ/หมอไม่ใช่ของหน่วย ⇒ `NOT_FOUND` (ข้อความเดิมของ B.3) · ตรวจล่วงหน้าแบบไม่ล็อก แล้วตัดสินใต้ล็อก
- ผลสำเร็จ: N แถว `kind BOOKED` · `groupId` เดียวกัน (สตริงใหม่ไม่ซ้ำ · คืนใน `groupId`) · `startAt` เท่ากัน · หมอไม่ซ้ำกัน · `ids`/`staffIds` เรียงตาม `members` · ชื่อ/เบอร์ลูกค้า = ของผู้จอง (snapshot เดียวกันทุกแถว) · `priceSatang`/`depositSatang`/`policySnapshot.job` ต่อแถวตามกติกา B.3/B.8/B.13 ของแถวนั้น · `status` เท่ากันทุกแถว · `depositSatang` ผลคืน = Σ · `idempotencyKey` ของคำขอเก็บที่หัวกลุ่ม (แถวอื่น `<key>#2`, `#3` …) ⇒ ยิงซ้ำ ⇒ กลุ่มเดิม (`groupId`/`ids` เดิม) · ลูกค้าจองเอง (ONLINE/LINE) ⇒ `manageTokenHash` เฉพาะหัวกลุ่ม · `booking.created` ต่อสมาชิก (payload + `groupId`)
- "ใครก็ได้": เลือกหมอที่ว่างตามลำดับ `sortOrder, createdAt, id` ไม่ซ้ำกับสมาชิกคนอื่น (หมอระบุตัวของสมาชิกอื่นจองก่อน) · `assignMode` ต่อแถว
- SELF ล้มเพราะห้อง ⇒ `FULL` ข้อความ `FULL_REASON` เดิม (S-8 ของ B.13) · ร้านจองให้บอกเหตุห้องได้
- `findGroupSlots` = ช่อง t ที่ `bookGroup` ณ ตอนนั้นจะผ่าน (สูตรเดียว · ข้อสอบ S-9 เทียบ) · `excludeGroupId` = ไม่นับแถวของกลุ่มนั้น (ใช้ตอนเลื่อน)
- `cancelGroup`: ล็อกแถวทุกสมาชิก (เรียง id) → สมาชิกที่ CANCELLED/NO_SHOW แล้วข้าม · มีสมาชิก IN_SERVICE/DONE ⇒ `BAD_STATE` ไม่แตะใคร · ที่เหลือ ⇒ CANCELLED `cancelReason "SHOP"` ใน tx เดียว (+ บัตรคิว/เครื่องหมาย Q18 แบบ `cancelByShop`) · `booking.cancelled` ต่อสมาชิกครั้งเดียว (คีย์เดิม `booking.cancelled#<id>`) · ยกเลิกแล้วทั้งกลุ่ม ⇒ `{ ok:true }` ไม่ยิงซ้ำ
- `rescheduleGroup`: สมาชิกที่ยังถือช่องต้อง PENDING/CONFIRMED/LATE ทุกคน (อื่น ⇒ `BAD_STATE`) · หมอเดิมทุกคน · เวลาใหม่เดียวกัน · ไม่นับแถวของกลุ่มเอง · ด่านหมอ (กติการ้านจองให้ B.3) + ห้อง (ชิ้นเดิมว่าง ⇒ คง · ไม่งั้นเลือกชิ้นใหม่ชนิดเดียวกันที่จุพอทั้งกลุ่ม) · ล้ม ⇒ ไม่มีแถวใดขยับ · LATE ⇒ CONFIRMED แบบ `rescheduleByShop`
- X1: ctx ข้ามร้าน/หน่วย/ไม่พบ ⇒ `NOT_FOUND` ข้อความเดียวกัน ("ไม่พบการจองกลุ่มนี้") · `groupOf` ⇒ `null`

### 3.2 service.ts
- `bookAppointment` (รวม `bookOnline`): บริการที่ resolve `booking.service.staffCount` = N ≥ 2 ⇒ ทางเดียวกับ `bookGroup` ด้วย members = N × `{ serviceId, staffId }` โดยสมาชิกแรก = `i.staffId` (null = ใครก็ได้) · สมาชิกอื่น = ใครก็ได้ ⇒ ผล `{ ok:true, id: <หัวกลุ่ม>, staffId: <หมอหัวกลุ่ม>, status, holdUntil, groupId }` (`BookResult` ok **เพิ่ม** `groupId?: string` · staffCount 1 ⇒ ไม่มีคีย์นี้)
- `rescheduleBySelf` ของหัวกลุ่ม ⇒ เลื่อนทั้งกลุ่ม (`to.staffId` ต้องเป็นหมอเดิมของหัวกลุ่มหรือ null · หมอคนอื่นคงเดิม) · ของสมาชิกที่ไม่ใช่หัวกลุ่ม ⇒ `NOT_FOUND` (ลูกค้าไม่มีลิงก์ของแถวนั้น)
- `expireDepositHolds`: ปล่อยทั้งกลุ่มใน tx เดียว (ไม่มีสถานะที่สมาชิกหนึ่งถูกปล่อยอีกคนยังถือ — แม้ข้ามก้อน `HOLD_EXPIRE_BATCH`) · ข้ามกลุ่มที่หัวกลุ่มมีสลิปค้าง
- `setAppointmentStatus`/`cancelByShop` ต่อแถว = ร้านตัดสินรายคน (เช่น คนหนึ่งป่วย) — แถวอื่นในกลุ่มไม่เปลี่ยน · groupId คงอยู่

### 3.3 queue-line.ts
- `checkIn` by `{ phone }` / `{ token }` (QR/LINE) ที่เจอสมาชิกกลุ่ม ⇒ เช็กอิน **ทุกสมาชิกที่ยังไม่มา** ของกลุ่มนั้น (CONFIRMED/LATE · วันนี้) ในธุรกรรมเดียว (ล็อกแถวเรียง id · บัตรต่อคน) · ไม่ใช่ `AMBIGUOUS` เมื่อทุกนัดที่เจอเป็นกลุ่มเดียวกัน · ผลคืน = ของหัวกลุ่ม (หรือสมาชิกแรกที่เช็กอิน) + เพิ่ม `groupIds?: string[]` ไม่บังคับ · by `{ appointmentId }` (จอร้าน) = เฉพาะแถวนั้น (มาไม่พร้อมกัน)
- `rescheduleByShop` แถวที่มี groupId และ **เวลาเปลี่ยน** ⇒ `{ ok:false, code:"GROUP", reason:"นัดนี้เป็นการจองกลุ่ม — เลื่อนทั้งกลุ่ม" }` แถวไม่เปลี่ยน (`RescheduleFail` + `"GROUP"` ต่อท้าย) · เปลี่ยนหมออย่างเดียว เวลาเดิม ⇒ ได้ (B.14 ลากสมาชิกไปคอลัมน์หมออื่น)
- `startJob`/`completeJob`/`callJob` ต่อแถว (เหมือนเดิม)

### 3.4 online.ts
- ลิงก์ของหัวกลุ่ม: `loadManageView` แสดงเวลา/สถานะของกลุ่ม · `rescheduleOnline` ⇒ `rescheduleBySelf` ทั้งกลุ่ม · `cancelOnline` ⇒ ยกเลิกทุกสมาชิกที่ถือช่องใน tx เดียว (`CUSTOMER` / `CUSTOMER_LATE` + `deposit.late` ต่อแถว) · `lateForfeitSatangOf(หัวกลุ่ม)` = Σ ต่อสมาชิก · `acceptForfeitSatang` เทียบกับ Σ

### 3.5 มัดจำรวม (deposit.ts + ตัวช่วย service.ts)
- ยอดต่อแถว = กติกา B.3/B.8 ของแถวนั้น (ราคา/นาทีเฉพาะคน · snapshot ต่อแถว · ยกเว้นสมาชิก #37 ใช้กับทุกแถวเพราะเป็นลูกค้าคนเดียว) · **ยอดกลุ่ม = Σ** (ข้อสอบใช้ราคาเศษสตางค์ 90,005 / 120,003 × 20% ⇒ 18,001 + 24,001 = 42,002)
- จ่ายครั้งเดียวผ่านหัวกลุ่ม: `loadDepositPay(token หัวกลุ่ม).pay.amountSatang` = Σ (QR ยอดล็อก Σ · `holdUntilMs` ของหัวกลุ่ม) · `submitDepositSlip` `expectedSatang` = Σ (refId = หัวกลุ่ม) · `confirmDepositByShop`/`onDepositSlipApproved` ของหัวกลุ่ม ⇒ ใบรับ **ต่อสมาชิก** (`keyBase booking-deposit-<id สมาชิก>` · ยอด = depositSatang ของแถว) + `depositPaidAt`/`depositSaleId` ทุกแถว + สถานะทุกแถวพร้อมกัน · ยิงซ้ำ/พร้อมกัน/สองทาง ⇒ ใบรับเดิม (Σ ใบรับ = Σ ไม่เกิน)
- อนุมัติบางส่วน (ยอด < Σ) ⇒ แบ่งตามลำดับสมาชิก (เต็มยอดทีละคน คนสุดท้ายได้ส่วนที่เหลือ) · Σ ใบรับ = ยอดที่เข้า · ไม่มีแถวยืนยันเอง (UNDERPAID)
- คืน (`refundDepositByShop` หัวกลุ่ม) ⇒ คืนทุกสมาชิกที่ค้างคืน · ริบ (ไม่มา/ยกเลิกช้า) = **ต่อแถว** `floor(คงเหลือ_i × pct / 100)` ⇒ ยอดริบกลุ่ม = Σ floor (ข้อสอบ: 9,000 + 12,000 = 21,000 ≠ floor(42,002 / 2) = 21,001)
- `depositInfo` ต่อแถวคงสัญญา B.8 · ภาพรวมกลุ่มอยู่ที่ `groupOf().deposit` · GL = ใบรับ POS_DEPOSIT ต่อแถว (Dr เงิน / Cr 2110 + 2200) สมดุลทุกรายการ

### 3.6 ตัววางคิว (pure · ขยาย B.13 แบบ optional)
```ts
PlanJob += groupId?: string   // ไม่ส่ง / กลุ่มขนาด 1 ⇒ ผลเท่าไม่ส่งทุกไบต์ (FZ-G0)
```
- สมาชิก BOOKED ของกลุ่มเดียวกันที่ยังไม่เริ่ม (PENDING/CONFIRMED/LATE/ARRIVED ที่ไม่ถูกปล่อย/ไม่ใช่มาสายเข้าแถว) ⇒ **เริ่มเวลาเดียวกัน** = max ของเวลาเริ่มที่แต่ละคนลงได้ (B.2 ข้อ 3 + B.13 ห้อง) · คนหนึ่ง BOOKED_DELAYED ⇒ ทุกคน (PL-G1 · FZ-G1) · งานถัดไปของหมอที่ถูกดันตามกติกาเดิม
- APPOINTMENT_FIRST: ดึงขึ้นเร็ว (BOOKED_EARLY) เฉพาะเมื่อ **ทุกสมาชิกที่ยังถือช่องมาถึงแล้ว** และดึงพร้อมกัน (PL-G2)
- สมาชิกที่ RELEASED_LATE / NO_SHOW_DUE / LATE_ARRIVAL_AS_WALKIN / IN_SERVICE ไม่ร่วมกติกาเริ่มพร้อมกัน (PL-G4) · ห้องของสมาชิกเป็นข้อเท็จจริงต่อแถวแบบ B.13 (ความจุนับทีละแถว — PL-G3)
- planner-run: `JOB_SELECT` + `groupId` · เขียน plannedStartAt ตามแผน (ฐานนับช่วงถือจาก plannedStartAt อยู่แล้ว ⇒ นิยามเดียวกัน — DB-1)

## 4. กติกาด่านกลุ่ม (pure · ใช้ร่วมทุกทาง)
1. หมอ: สมาชิกแต่ละคนผ่านกติกาหมอของ B.3 (ร้านจองให้ = ไม่ซ้อน · SELF = พักขั้นต่ำ + % ออนไลน์ + งาน/วัน) ที่เวลา t เดียวกัน · หมอไม่ซ้ำกัน · ระบุตัว = คนนั้นเท่านั้น
2. ห้อง (**"ห้องเดียว"**): ต่อชนิด k ที่สมาชิกบางคนต้องใช้ ⇒ เลือก **ชิ้นเดียว** r ชนิด k (first-fit ตาม `sortOrder, createdAt, id`) ที่รับช่วงถือ `[t, t + dur_i + r.cleanupMin)` ของ **ทุกสมาชิกที่ต้องใช้ k** ได้พร้อมกันโดยไม่เกินความจุ ณ จุดใด และไม่ทับปิดซ่อม · ไม่มีชิ้นเดียวที่รับได้ทั้งหมด ⇒ `FULL` (**ห้ามแยกกลุ่มไปคนละห้อง** — S-5) · ทุกสมาชิกที่ต้องใช้ k ถือ r เดียวกัน (`resourceId` + `job.resourceIds`)
3. ทุกข้อ = ได้ทุกคนหรือไม่ได้เลย · นัดอื่น/ walk-in ที่ถือห้องอยู่ (§4.6 ของ B.13) นับตามเดิม · ไม่นับแถวของกลุ่มตัวเองเมื่อเลื่อน
4. ช่วงถือในฐานของสมาชิก = §4.6 ของ B.13 ต่อแถว (ไม่เปลี่ยน `readHolds`) ⇒ กลุ่มที่ตัววางคิวเลื่อนพร้อมกันถือห้องตาม plannedStartAt ของทุกคน

## 5. ล็อก (ลำดับคงที่ของ B.13 §5 · X-9 deadlock 0)
```
idem (advisory · คีย์ของคำขอ) → เบอร์ (advisory) → [advisory สาขา] → BookingStaff ของสาขา ORDER BY "sortOrder","createdAt",id FOR UPDATE
→ SvcResource ของสาขา ORDER BY id FOR UPDATE → แถว Appointment (เรียง id · FOR UPDATE / CAS) → QueueTicket
```
- `bookGroup`/`rescheduleGroup`/ทาง staffCount: ใช้ `lockUnitTx` (advisory สาขา → หมอทั้งสาขา → ทรัพยากรทั้งสาขา) — ห้ามล็อกหมอทีละคนแบบ B.3 สลับกับทรัพยากร (วงรอกับ bookAppointment ใครก็ได้)
- `cancelGroup` / ยืนยัน-คืน-ริบมัดจำกลุ่ม / เช็กอินกลุ่ม: ล็อกแถวนัดของสมาชิก **เรียง id** อย่างเดียว (ไม่ล็อกหมอ/ทรัพยากรหลังแถวนัด)
- `$transaction` maxWait ≤ 20 000 · timeout ≤ 30 000

## 6. เกณฑ์รับ (เข้ม + perf)
- «scripts/qc-svc-b.15.mts» เขียวทุกข้อ — หมวด **T** (สัญญา) · **PL** G0–G4 (pure) · **FZ** G0–G2 · **PERF** · **S** 1–10 (จอง · ด่านเดียว · ห้องเดียว · staffCount · X1) · **CX** 1–5 (ยกเลิก) · **RS** 1–6 (เลื่อน) · **CI** 1–3 + **DB-1** (มาไม่พร้อมกัน · ตัววางคิว/ฐานนิยามเดียว) · **D** 1–8 (มัดจำรวม · GL) · **X** 1–5 + X-9 (ยิงพร้อมกัน 5 โพรเซส ≥ 10 ทาง) · **X8-1** (PDPA payload) · **SF** 1–3 · **G** 1–8 · **Z-1**
- perf: (1) G-1 = `qc-svc-b.2` 93/93 · G-2 = `qc-svc-b.13` (รวม PERF ของ B.13) (2) PERF ของใบนี้: 12 หมอ · กลุ่มคู่ 60 กลุ่ม (นัด 120) · walk-in 40 · ห้องคู่ 6 ห้อง ⇒ **p95 < 50 ms** (200 รอบหลังอุ่น 20) — ผู้คุมจดตัวเลขใน wo-notes (3) fuzz FZ-G1/G2 ค่าเริ่ม 2 000 ชุด · ผู้ตรวจ B รันซ้ำ `QC_B15_FUZZ_N=20000`
- typecheck + fitness 2 โหมด (ผู้คุม) · ไม่มีจอใหม่ ⇒ ไม่มีภาพ (จอคู่รักบนปฏิทิน = B.14)
- ตรวจเข้ม 2 รอบ: กันจองซ้อน/ตัวจัดคิว (ผู้ตรวจ A อ่านโค้ด) + เงิน (ผู้ตรวจ B probe ข้ามโพรเซส §11)

## 7. regression (G) — ข้อ "ไฟล์ของใบ" ของชุดเก่าเป็น accept-time ⇒ แดงได้เฉพาะข้อที่ระบุ ระหว่างไฟล์ B.15 ยังไม่ commit
| G | ชุด | เกณฑ์ |
|---|---|---|
| 1 | `qc-svc-b.2` | 93/93 (findings ว่าง · รวม PERF) |
| 2 | `qc-svc-b.13 --no-regression` | FAIL ได้เฉพาะ SF-1 · SKIP เฉพาะ G-*/V-1/Q-*/SF-1 |
| 3 | `qc-svc-b.8 --no-regression` | FAIL ได้เฉพาะ S-1/S-2/S-4 · SKIP H/V/Q/G/S-1 |
| 4 | `qc-svc-b.3` (`SVC_B3_NO_REGRESSION=1`) | FAIL ได้เฉพาะ ST-1/ST-4 · SKIP G-*/ST-1 |
| 5 | `qc-svc-b.4 --no-regression` | FAIL ได้เฉพาะ ST-1/ST-3/ST-4 · SKIP G-*/ST-1 |
| 6 | `qc-svc-b.5 --no-regression` | FAIL ได้เฉพาะ S-1/S-2 · SKIP H/E/V/Q/G/S-1 |
| 7 | `qc-svc-b.7 --no-regression` | FAIL ได้เฉพาะ S-1/S-2/S-3 · SKIP H/V/Q/G/S-1 |
| 8 | `qc-svc-smoke` | exit 0 |

## 8. จุดที่แบบไม่ชัด — ผู้เขียนข้อสอบเลือกค่าเริ่มแล้ว (ข้อสอบเข้ารหัสค่าเริ่มนี้ · ผู้คุมเคาะต่าง = ORACLE-EDIT)
| # | เรื่อง | ค่าเริ่ม (ข้อสอบ) | ทางอื่น |
|---|---|---|---|
| G1 | migration | **ไม่มี** (groupId+index มีแล้ว · หัวกลุ่ม = แถวแรก) | ตาราง `SvcBookingGroup` (ไม่จำเป็นในรุ่นนี้) |
| G2 | ทางเข้า "คู่รัก" | `bookGroup` (กลุ่มผสมบริการ) **และ** `bookAppointment` ของบริการ `staffCount ≥ 2` (คีย์ #15 เดิม · หน้าจองออนไลน์ใช้ได้ทันที) | เฉพาะ bookGroup (ต้องมี UI เลือกหลายคน) |
| G3 | "ห้องเดียว" | ชิ้นเดียวต่อชนิดสำหรับทั้งกลุ่ม · ไม่มีชิ้นที่จุพอ ⇒ FULL (ไม่แยกห้อง) — S-5 MAJOR | ยอมแยกห้องเมื่อไม่มีห้องจุพอ (ค่าตั้งใหม่ = core-fix) |
| G4 | ขนาดกลุ่ม | 2–10 (ตามช่วง schema ของ #15) | ค่าตั้งเพดาน (core-fix) |
| G5 | มัดจำรวม | ยอดต่อแถว (snapshot ต่อแถว) · จ่ายครั้งเดียวผ่านหัวกลุ่ม · ใบรับต่อแถว · ริบ floor ต่อแถว (Σ) — D-1/D-7 ยอดต่อแถว MAJOR · ผลรวม CRITICAL | หัวกลุ่มถือยอดทั้งหมด (แถวอื่น 0) — ง่ายกว่าแต่บิล B.10 ของสมาชิกอื่นหักมัดจำไม่ได้ |
| G6 | อนุมัติสลิปบางส่วน | แบ่งตามลำดับสมาชิก · ไม่ยืนยันเอง | ใส่ทั้งก้อนที่หัวกลุ่ม |
| G7 | เช็กอินเบอร์/QR | ทั้งกลุ่ม (CI-3 MAJOR) · จอร้านกดทีละคน | AMBIGUOUS ให้เลือก (เดิม) |
| G8 | มาไม่พร้อมกัน/ช้า | ตัววางคิวเริ่มพร้อมกันที่เวลาช้าสุด (PL-G1 · DB-1) · ดึงเร็วเฉพาะเมื่อมาครบ (PL-G2) · คนที่ถูกปล่อย/ไม่มาไม่ถ่วงคนที่มา (PL-G4) | สมาชิกอิสระต่อกัน |
| G9 | เลื่อน/ยกเลิกรายคน | ร้านยกเลิกรายคนได้ (cancelByShop · CX-5) · เลื่อนเวลารายคน ⇒ `GROUP` (RS-5 MAJOR) · ลูกค้า (ลิงก์หัวกลุ่ม) = ทั้งกลุ่มเสมอ | เลื่อนรายคนได้ (กลุ่มแตกเวลา) |
| G10 | event | ไม่มี event ใหม่ · event เดิมต่อสมาชิก + `groupId` ใน payload | `booking.group_*` (ต้องลง 3 ทะเบียน) |

## 9. คำขอ ruling (ผู้คุมเคาะก่อนปล่อย builder · ค่าที่แนะนำ = ตาราง §8)
- **R1** G1 ไม่มี migration — ยืนยัน (ถ้าเปลี่ยน ⇒ SF-2 ORACLE-EDIT แบบ b13-R1)
- **R2** G2 staffCount เป็นทางเข้าคู่รักออนไลน์ (คีย์ #15 มีแล้ว ค่าเริ่ม 1 ⇒ ไม่กระทบร้านเดิม) — แนะนำ ✅
- **R3** G3 ห้ามแยกห้อง — แนะนำ ✅ ("ห้องเดียว" ตาม R7)
- **R4** G5 มัดจำต่อแถว + ริบ floor ต่อแถว — แนะนำ ✅ (บิล B.10 ต่อแถวหักมัดจำได้ · ใช้เครื่อง B.8 เดิม) — คำถามเจ้าของ/นักบัญชี: ลูกค้าเห็นยอดริบรวม 21,000 (ไม่ใช่ 21,001) โอเคไหม → `SVC-OWNER-QUESTIONS.md`
- **R5** G7/G8/G9 — แนะนำ ✅ (หน้างานร้านนวด: คู่รักมาด้วยกัน · เลื่อนรายคน = กลุ่มแตก)
- **R6** ใบนี้แตะ `deposit.ts` (เงิน) + `planner*.ts` (ตัวจัดคิว) + `queue-line.ts` พร้อมกัน — ตรวจเข้ม 2 รอบครอบทั้งสองเรื่อง (ผู้ตรวจ A = กันจองซ้อน+ตัวจัดคิว · ผู้ตรวจ B = probe เงิน+แข่ง)

## 10. รายการแข่ง (race list) ให้ผู้ตรวจ B — probe ข้ามโพรเซส ≥ 10 ทาง · `pg_stat_database.deadlocks` ก่อน/หลังทุก probe
1. `bookGroup` ×10 ห้องคู่เดียว ⇒ 1 กลุ่ม (X-1) · ซ้ำ 20 รอบ · ผสม SELF/STAFF
2. กลุ่ม ×5 ∥ เดี่ยว ×5 ที่ห้องคู่ที่เหลือ 2 ที่ ⇒ {1 กลุ่ม} หรือ {เดี่ยว ≤ 2} ไม่มีครึ่งกลุ่ม (X-2) · กลุ่ม ∥ เดี่ยว "ใครก็ได้" (ล็อกหมอทีละคน) ⇒ deadlock 0
3. `rescheduleGroup` ×5 ∥ จองเดี่ยว ×5 ไปช่องเดียว (X-3) · เลื่อนทับตัวเอง
4. `cancelGroup` ×10 ∥ `cancelOnline` หัวกลุ่ม ∥ `cancelByShop` สมาชิก ⇒ event ยกเลิกต่อสมาชิก 1 (X-4)
5. ยืนยันมัดจำหัวกลุ่ม ×5 ∥ `expireDepositHolds` ×5 ⇒ ทั้งกลุ่มจ่าย หรือทั้งกลุ่มปล่อย (X-5) · ∥ `onDepositSlipApproved` ×5 ⇒ ใบรับต่อแถว ≤ 1
6. เช็กอินเบอร์ (ทั้งกลุ่ม) ∥ `runPlanner` วน ∥ เช็กอินจอร้านรายคน ⇒ deadlock 0 · ไม่มีแถวเช็กอินซ้ำ
7. `rescheduleGroup` ∥ `cancelGroup` ⇒ อย่างใดอย่างหนึ่ง ทั้งกลุ่ม
8. `cancelOnline` ยกเลิกช้า ∥ เงินเข้า (สลิป) ⇒ ยอดริบ = Σ floor ของยอดที่จ่าย ณ ตอน CAS (V2 ของ B.8) ต่อแถว
9. walk-in ห้องคู่ ∥ `bookGroup` ห้องคู่ ⇒ ฐานไม่ล้น (resViolations 0)
10. ข้ามร้าน: groupId ร้านอื่นทุกทาง ⇒ NOT_FOUND ข้อความเดียว · ไม่มีแถวสมาชิกต่างหน่วย/ต่างร้านใน groupId เดียว

## 11. ส่งต่อใบหลัง
- **B.14** ปฏิทิน: แสดงสมาชิกกลุ่มเป็นก้อนเดียวบนคอลัมน์ห้อง (groupOf) · ลากเวลา = `rescheduleGroup` · ลากหมอ = `rescheduleByShop` เวลาเดิม
- **B.10** บิลพักต่อแถว (หักมัดจำแถวนั้น) — ไม่ต้องแก้
- **CO.x** คอร์สกับกลุ่ม · หนี้: เพดานขนาดกลุ่มเป็นค่าตั้ง · แยกห้องเมื่อจำเป็น (ถ้าเจ้าของต้องการ)

## มติผู้คุม (31 ต.ค.)
- R1 ✅ ไม่มี migration (Appointment.groupId มีแล้วตั้งแต่ B.0) · แตะ prisma/ = ตีกลับ
- R2 ✅ ทางเข้าคู่รัก = booking.service.staffCount ≥ 2 + bookGroup
- R3 ✅ ไม่มีห้องเดียวที่จุทั้งกลุ่ม ⇒ FULL · ห้ามแยกห้อง
- R4 ✅ มัดจำคิดต่อแถว · จ่ายครั้งเดียวผ่านหัวกลุ่ม · ใบรับต่อแถว · ริบ floor ต่อแถวแล้วรวม (ลูกค้าได้ประโยชน์เศษสตางค์) — ส่งคำถามเจ้าของ/นักบัญชีแล้ว · เปลี่ยนภายหลัง = ORACLE-EDIT
- R5 ✅ ทุกข้อตามที่เสนอ (เช็กอินเบอร์/QR = ทั้งกลุ่ม · เริ่มพร้อมกันที่เวลาช้าสุด · ยกเลิกรายคนได้ · เลื่อนรายคน = GROUP · ลิงก์หัวกลุ่ม = ทั้งกลุ่ม · ไม่มี event ใหม่ + groupId ใน payload)
- R6 ✅ ตรวจเข้ม 2 รอบ: A = กันจองซ้อน/ตัวจัดคิว (อ่านโค้ด) · B = probe เงิน+แข่ง · ใช้บทเรียน B.13 (นิยามช่วงถือฝั่งตัววางคิว = ฝั่งฐาน · ยุคการมาถึง · ลำดับล็อก)
