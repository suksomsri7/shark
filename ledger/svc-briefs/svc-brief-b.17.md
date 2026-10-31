# ใบสั่ง B.17 — waitlist "แจ้งฉันถ้ามีคนยกเลิก" + ไม่มาซ้ำ (บังคับมัดจำ / ต้องโทรจอง) · ตรวจ: **เบา** (รอบเดียว) · ห้ามตัด: แยกร้าน (X1 · NOT_FOUND คำตอบเดียว) · กันจองซ้อน (รับข้อเสนอผ่านทางจองปกติเท่านั้น) · ส่งครั้งเดียว (X3/X4/X5) · PDPA ตอนส่ง + ไม่มี PII ใน event/log/ผลคืน (X8) · ไม่มีทางเลี่ยงกติกามัดจำ

> อ้างอิง: MASTER-PLAN แถว B.17 (ขึ้นกับ B.8 · ไปต่อ B.18) · `DESIGN-BOOKING-QUEUE.md` B3.2 · ภาคผนวก ก #32 (`booking.late.repeatNoShow` มีแล้วใน B.0: ตัดผม/สปา 2 ครั้ง/90 วัน ⇒ บังคับมัดจำ · คลินิก 3/180 ⇒ ต้องโทรจอง) · §2 (Fresha: waitlist แจ้งคนแรก/ทุกคน · Booksy: แจ้งเมื่อมีคนยกเลิก) · §9 `BookingWaitlist` [B3] · CC §4.4 (`notifyCustomer` ประตูเดียว · `precheck` ของ D.9) · CC §1.6 (snapshot ชนะ)
> ใบก่อนที่ต้องอ่าน (โค้ดชนะเอกสาร): `svc-brief-b.3.md` (`findSlots` · `bookAppointment` · ถือช่อง) · `svc-brief-b.4.md` (ไม่มา · `emitNoShowTx` · `cancelByShop`/`rescheduleByShop`) · `svc-brief-b.7.md` (`bookOnline` · ลิงก์ตัวตน `booking.identity` · `cancelOnline`/`rescheduleOnline` · ช่อง ONLINE = เบอร์ไม่ยืนยัน) · `svc-brief-b.8.md` §8 ข้อ 10 (**ตัวตนมาจากทางที่ยืนยันแล้วเท่านั้น**) · `svc-brief-b.9.md` §3.1 (ผู้รับ · dedupeKey จาก id · ไม่ bypass เวลาเงียบ) · `/root/svc-runs/fix/d17.md` F1 + `d18.md` P1 (งานรายนาทีอดอยาก ⇒ keyset วนจนหมดงบ · งานจบไม่ว่าผลใดต้องไม่ถูกหยิบซ้ำไม่รู้จบ)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-b.17.mts» — รับใบ = **ผ่านทุกข้อ** (นับจาก `JSON_SUMMARY`) · SKIP ที่ยอมได้ระหว่างทำ: `G-*` (`--no-regression`) · `S-1` (หลัง merge)
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.17.mts [--no-regression]` (ห้าม `timeout` ครอบ · ห้าม kill กลางคัน — ล้างข้อมูลอยู่ใน finally) · ข้อสอบเปิดตัวจำลอง LINE เอง (127.0.0.1 + `LINE_API_BASE`) — **ไม่ยิง LINE จริง** · ฉากอยู่บนร้านชั่วคราว `qc-svc-b17-*` ทั้งหมด (ไม่แตะ svcqc — Q-1)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม prisma generate · ห้ามแก้ข้อสอบ/`scripts/**`** · temp ขึ้นต้น `svc-b17-` · รายงานต่อข้อ (id → ผล)
> ⚠️ **ก่อนปล่อย builder ผู้คุมต้องเคาะ R1 (ตาราง) และ R2 (ชนิดข้อความที่ 11)** — R1 ยังไม่เคาะ ⇒ ปล่อยได้เฉพาะส่วน "ไม่มาซ้ำ" (§3.2 · ข้อ N-*) ตามทางเลือก R1-ข
> เลนขนาน: **B.13 (l3)** กำลังแก้ `resources.ts` · `resource-kinds.ts` · `planner*.ts` (+ อาจ `service.ts` ส่วน slots) ⇒ ใบนี้ห้ามแตะสามไฟล์แรก · ใน `service.ts` แก้เป็นบล็อก `// SVC B.17` ใน `bookAppointment` เท่านั้น · ถ้า B.13 แตะ `prisma/schema` ⇒ migration ของ R1 ต้องต่อคิวหลัง B.13 (กติกาเหล็กข้อ 7)
> ผู้คุมแก้ให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` บล็อก "SVC B.17" (`SQC_WAITLIST_SCENE` — คีย์ค่าตั้ง · ค่าเริ่ม · รูป dedupeKey · ตารางที่ต้องมี · ข้อความกลาง)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ S-1 ไล่ `git status` ของ src/ prisma/ — ตรวจตอนรับใบเท่านั้น)
| ไฟล์ | ทำอะไร |
|---|---|
| `prisma/schema/booking.prisma` + «prisma/migrations/<ts>_svc_b17/migration.sql» | **เฉพาะเมื่อ R1-ก ผ่าน**: model `BookingWaitlist` (§4) · เพิ่มอย่างเดียว · migrate diff ตามกติกาเหล็กข้อ 5 · ผู้คุมรัน generate เอง |
| «src/lib/modules/booking/no-show-rule.ts» (ใหม่) | §3.2 `repeatNoShowOf` · `excuseNoShow` · `REPEAT_NO_SHOW_REASON` (tenantDb เท่านั้น — F5 ห้ามเพิ่ม) |
| «src/lib/modules/booking/waitlist.ts» (ใหม่) | §3.1 `joinWaitlistOnline` · `leaveWaitlistOnline` · `WAITLIST_RATE` · ตัวช่วยของหน่วย (tenantDb เท่านั้น) |
| «src/lib/platform/booking-waitlist.ts» (ใหม่) | §3.3 `onWaitlistEvent` · `runWaitlistTick` — คิวรีข้ามร้าน + ส่งผ่าน `notifyCustomer` เท่านั้น (ชั้น platform แบบ booking-notify.ts) |
| `src/lib/modules/booking/service.ts` | §3.2 ข้อ 4: บล็อก `// SVC B.17` ใน `bookAppointment` (อ่านกติกาก่อนธุรกรรม · บังคับมัดจำใน tx) + `BookFailCode` +`"REPEAT_NO_SHOW"` · **`busyRowsOf` `slotClear` `selfQuotaOk` `openCountForPhone` `replayOf` `holdMinutesOf` `findSlots` ห้ามแก้** (S-4 เทียบ HEAD ทุกไบต์) · บรรทัดเดิมที่ลบ/แก้ ≤ 10 |
| `src/lib/modules/booking/online.ts` | §3.1 ข้อ 9: `loadOnlineBooking` ขั้น 2 เพิ่ม `view.waitlist` · ขั้น 3 `summary.depositSatang` = ยอดบังคับเมื่อตัวตนติดกติกา — เพิ่มทางแยกเท่านั้น |
| `src/lib/modules/booking/index.ts` | re-export |
| `src/lib/core/settings/defs/booking.ts` | §5 คีย์ใหม่ 3 ตัว + `booking.msg.enabled` รับคีย์ `waitlistOpen` (ไม่บังคับ) — ห้ามแตะ key/ค่าเริ่ม/chain ของ def อื่น |
| `src/lib/core/permissions.ts` | เอา `booking.deposit.waive` ออกจาก `planned` (ใช้จริงใน `excuseNoShow`) — บรรทัดเดียว |
| `src/lib/outbox-consumers.ts` | §3.3 compose `onWaitlistEvent` ต่อท้าย `booking.cancelled` · `booking.rescheduled` · `booking.no_show` (ของเดิมวิ่งก่อน · ห้ามทำของเดิมหาย) · **ไม่มี event ใหม่** (ทะเบียนป้าย automation/webhooks ไม่ถูกแตะ — R13) |
| `src/lib/platform/minute-jobs.ts` | บล็อกเดียว: `booking.waitlist.tick` ทุก 1 นาที · lazy import |
| `src/components/public-booking.tsx` | §6 กล่อง waitlist ตรงข้อความ `bk7.noTimes` (เพิ่มอย่างเดียว · `view.waitlist` ไม่มี ⇒ DOM เดิมทุกไบต์) |
| «src/app/(store)/s/[tenantSlug]/[unitSlug]/waitlist-actions.ts» (ใหม่) | `"use server"` · `joinWaitlistAction(tenantSlug, unitSlug, fd)` · `leaveWaitlistAction(tenantSlug, unitSlug, fd)` (ip จาก `x-forwarded-for`) |
| `src/app/(store)/s/[tenantSlug]/[unitSlug]/page.tsx` | ส่ง action เข้า PublicBooking (ถ้าจำเป็น) |
| `src/lib/actions/booking.ts` (**เพิ่ม function เท่านั้น**) · `src/lib/modules/booking/access.ts` | `excuseNoShowAction(unitSlug, fd)` → คีย์ `booking.deposit.waive` |
| `src/lib/i18n/dict.ts` | เพิ่มคีย์เท่านั้น (th/en คู่กัน) |

**ห้ามแตะ** (S-2 · `git status` ต้องว่าง): `src/lib/modules/booking/{resources,resource-kinds,planner,planner-run,queue-line,today-line,line-ops,public-line,deposit}.ts` · `src/lib/platform/{notify-customer,booking-notify,booking-line-link,postback-routes}.ts` · `src/lib/modules/chat/**` · `src/lib/core/settings/{service,registry,types}.ts` · `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts` · `prisma/**` นอก §1 แถวแรก

## 2. หลักการ (ข้อสอบตรวจทุกข้อ)
- **ข้อเสนอไม่ใช่การจอง**: ข้อความ waitlist = "มีคิวว่าง · ใครจองก่อนได้ก่อน" + ลิงก์หน้าจองเดิม (ลิงก์ตัวตน LINE + เลือกบริการ/ช่าง/วัน/เวลาไว้ให้) — **ไม่ถือช่อง ไม่มีทางลัด** · ลูกค้ากดจองผ่าน `bookOnline` → `bookAppointment` ทางเดียว (กติกา B.3 · ถือช่องมัดจำ B.8 · กติกาไม่มาซ้ำ §3.2) · สองคนกดเวลาเดียวกัน = คนแรกได้ คนที่สอง `FULL` (C-7)
- **ส่งครั้งเดียว**: คีย์ `booking:waitlistOpen:<entryId>:<staffId>:<m(slotStart)>` (`m` = นาที epoch · §3.3 ข้อ 3) — ยกเลิกพร้อมกัน/consumer ซ้ำ/tick ซ้อน/หลายโพรเซส = ข้อความเดียวต่อ entry ต่อช่องว่าง (dedupe ของ `notifyCustomer` · ไม่ทำตัวกันซ้ำเอง)
- **ตรวจสดก่อนส่ง**: `precheck` ของ notifyCustomer ⇒ entry ยัง ACTIVE · ไม่หมดอายุ · ยังไม่ได้จอง · ช่องเวลานั้นยังว่างตาม `findSlots` (ช่อง LINE · นาฬิกา `now`) — ไม่ผ่าน ⇒ ไม่ส่ง (แถว `SKIPPED_PRECHECK_<เหตุ>`)
- **ตัวตนมาจากทางที่ยืนยันแล้วเท่านั้น** (บทเรียน B.8/B.9): เข้า waitlist ได้เฉพาะลิงก์ตัวตน LINE (`booking.identity`) · กติกาไม่มาซ้ำของช่อง LINE นับเฉพาะนัดที่ผูก Party ของตัวตนนั้น (เบอร์ที่คนอื่นกรอกบนหน้า ONLINE วางยาไม่ได้) · ช่อง ONLINE (เบอร์ไม่ยืนยัน) นับจากเบอร์ — **ทางนี้ใช้เพิ่มข้อจำกัดได้อย่างเดียว ไม่เคยลด**
- **นโยบายจากทะเบียนค่าตั้งทุกคำขอ** (ไม่แคชข้ามคำขอ · ไม่ฮาร์ดโค้ด 2/90/3/180) · เวลาไทยผ่าน `localToUtc`/`bkkYmd`/`bkkParts` — ห้าม `.getDay()/.getHours()/…` ดิบ (S-3) · ทุกฟังก์ชันรับ `now` ฉีดได้
- **X1**: ทุกคิวรีผูก `tenantId + unitId` · ctx สาธารณะมาจาก slug · consumer อ่านแถวจากฐานด้วย `tenantId` ของ event (ไม่เชื่อ `unitId` ใน payload ข้ามร้าน) · ของร้าน/สาขาอื่น/ไม่มีจริง ⇒ `NOT_FOUND` ข้อความเดียวกันทุกไบต์
- **X8**: ตาราง waitlist ไม่มีชื่อ/เบอร์ (อ่านจาก Party ตอนส่ง) · dedupeKey/ผลคืน/audit/console ไม่มีชื่อ/เบอร์ · ข้อความถึงลูกค้ามีชื่อของเขาเองได้ · ไม่มีเนื้อหาการตลาด (ข้อความบริการ — J5) · optOut/บล็อกของช่องทางยังบล็อก (notifyCustomer ⇒ `SKIPPED_CONSENT`)
- **ไม่ throw ในทางปกติ** · consumer ไม่ทำให้ event ล้ม (ข้อความ = ของแถม)

## 3. สัญญา (ข้อสอบมีสำเนาชนิด — ชื่อ/ฟิลด์ต้องตรง)

### 3.1 «waitlist.ts» — เข้า/ออก waitlist (สาธารณะ · ลิงก์ตัวตน = สิทธิ์)
```ts
export const WAITLIST_RATE: { joinIp: { limit: 10; windowMs: 600_000 } };   // ค่าคงที่ความปลอดภัย (ไม่ใช่นโยบายร้าน)
export type WaitlistJoinFail = "NOT_FOUND" | "RATE_LIMITED" | "DISABLED" | "IDENTITY_REQUIRED" | "BAD_INPUT" | "HAS_FREE" | "LIMIT" | "REPEAT_NO_SHOW" | "BUSY";
export async function joinWaitlistOnline(
  ref: { tenantSlug: string; unitSlug: string },
  i: { serviceId: string; staffId: string | null; dateStr: string; fromMin?: number; toMin?: number; who: string },
  opts?: { now?: Date; ip?: string },
): Promise<{ ok: true; entryId: string; duplicated: boolean; expiresAt: Date } | { ok: false; code: WaitlistJoinFail; reason: string }>;
export async function leaveWaitlistOnline(
  ref: { tenantSlug: string; unitSlug: string }, i: { entryId: string; who: string }, opts?: { now?: Date; ip?: string },
): Promise<{ ok: true; duplicated: boolean } | { ok: false; code: "NOT_FOUND" | "RATE_LIMITED"; reason: string }>;
```
ลำดับ `joinWaitlistOnline` (คืนข้อแรกที่เข้า):
1. ถัง `bq:wl:ip:<ip>` (`WAITLIST_RATE.joinIp` · `checkRateLimitDb`) **ก่อนแตะฐาน** — เกิน ⇒ `RATE_LIMITED` (RL-1: ครั้งที่ 11)
2. slug → หน่วย BOOKING (`resolvePublicUnit`) ไม่พบ ⇒ `NOT_FOUND`
3. ค่าตั้ง `booking.booking.waitlistMode` (UNIT) = `OFF` ⇒ `DISABLED`
4. `who` = ลิงก์ตัวตน `booking.identity` ของร้านนี้ + Party ของร้านไม่ถูกรวม · ไม่ผ่านทุกแบบ (ว่าง/ปลอม/หมดอายุ/ร้านอื่น) ⇒ `IDENTITY_REQUIRED` ข้อความเดียวกันทุกไบต์ (ไม่ต้องมีเบอร์ใน Party — ต่างจาก identityOf ของ B.7)
5. รูปข้อมูล: `dateStr` วันจริง · ไม่ใช่อดีต (วันไทยของ now) · ไม่เกิน `booking.booking.horizonDays` · `0 ≤ fromMin < toMin ≤ 1440` (ค่าเริ่ม = เวลาเปิด–ปิดของวันนั้น · ไม่มีเวลาทำการ = BAD_INPUT) · ผิด ⇒ `BAD_INPUT`
6. บริการ active+bookable ของหน่วย · ช่าง (ถ้าระบุ) active + `customerCanChoose` ⇒ ไม่ผ่าน `NOT_FOUND`
7. `repeatNoShowOf(ctx, { channel: "LINE", partyId })` ได้ `PHONE_ONLY` ⇒ `REPEAT_NO_SHOW` + `REPEAT_NO_SHOW_REASON` (ติด REQUIRE_DEPOSIT ยังเข้าได้ — จ่ายมัดจำตอนจองจริง)
8. มีเวลาว่างในหน้าต่างอยู่แล้ว (`findSlots` ช่อง LINE · now) ⇒ `HAS_FREE` (ให้ลูกค้าจองเลย · R8)
9. tx: `pg_advisory_xact_lock(booking:wl:<tenantId>:<unitId>:<partyId>)` → มี entry ACTIVE เดิม (Party · บริการ · ช่าง (null = ใครก็ได้) · วัน) ⇒ `{ ok: true, entryId: เดิม, duplicated: true }` → นับ ACTIVE ของ Party ในหน่วย ≥ `booking.booking.waitlistMaxActive` ⇒ `LIMIT` → INSERT (`status ACTIVE` · `expiresAt = localToUtc(dateStr, toMin)`) · ยิงพร้อมกัน 10 ทาง = 1 แถว (W-9)

`leaveWaitlistOnline`: rate limit เดียวกัน → ตัวตน → entry ของหน่วยนี้ที่ `partyId` ตรง ⇒ ไม่ตรง/ไม่มี/ร้านอื่น/ตัวตนเสีย = `NOT_FOUND` ข้อความเดียวกันทุกไบต์ · ACTIVE ⇒ `CANCELLED` (`endedAt` · `endReason "CUSTOMER"`) · จบแล้ว ⇒ `{ ok: true, duplicated: true }`

ข้อ 9 (online.ts): `loadOnlineBooking` ขั้น 2 เมื่อวันที่เลือก **ไม่มีเวลาว่างเลย** และ mode ≠ OFF ⇒ `view.waitlist = { mode, canJoin, joined }` (`canJoin` = มีตัวตน LINE และไม่ติด PHONE_ONLY · `joined` = มี entry ACTIVE ตรงบริการ/ช่าง/วันนั้น) · อื่น ⇒ ไม่มีคีย์ `waitlist` (ร้านเดิม/มีเวลาว่าง = view เดิมทุกไบต์)

### 3.2 «no-show-rule.ts» — ไม่มาซ้ำ
```ts
export type RepeatNoShowAction = "REQUIRE_DEPOSIT" | "PHONE_ONLY";
export type RepeatNoShowState = { action: RepeatNoShowAction | null; count: number; rule: { count: number; windowDays: number; action: RepeatNoShowAction } | null };
export const REPEAT_NO_SHOW_REASON: string;   // ข้อความกลางภาษาไทย "…กรุณาโทรจองกับร้าน…" — ห้ามมีคำว่า "ไม่มา" (กันสอดเบอร์คนอื่นบนหน้า ONLINE · R12)
export async function repeatNoShowOf(ctx: { tenantId: string; unitId: string },
  who: { channel: "ONLINE" | "LINE" | "STAFF" | "PHONE"; partyId?: string | null; phone?: string | null }, opts?: { now?: Date }): Promise<RepeatNoShowState>;
export async function excuseNoShow(ctx: { tenantId: string; actorUserId: string }, input: { unitId: string; appointmentId: string; reason: string })
  : Promise<{ ok: true; duplicated?: true } | { ok: false; code: "NOT_FOUND" | "BAD_STATE" | "BAD_INPUT"; reason: string }>;
```
1. กติกา = ค่าตั้ง `booking.late.repeatNoShow` ของหน่วย (`{count, windowDays, action}` · `null` ⇒ `{ action: null, count: 0, rule: null }`) · อ่านทุกคำขอ (แก้ค่าแล้วมีผลทันที — N-10)
2. นับนัด `status NO_SHOW` **ในหน่วยนั้น** (R9) ที่ `now − windowDays×24 ชม. < startAt ≤ now` (N-2 ขอบ ±1 นาที) · ไม่นับนัดที่ร้านยกเว้น (`policySnapshot.noShow.excused === true` — ข้อ 5) · CANCELLED/DONE ไม่นับ
3. ตัวตน: `LINE` ⇒ นัดที่ `partyId` = Party นั้นเท่านั้น (เบอร์บนนัดไม่เกี่ยว ⇒ เปลี่ยนเบอร์ไม่หลุด N-7 · คนอื่นกรอกเบอร์เราบน ONLINE ไม่ทำให้เราโดน N-14) · `ONLINE`/`STAFF`/`PHONE` ⇒ นัดที่ `bookingPhoneKey(customerPhone)` = คีย์ของเบอร์ที่กรอก **หรือ** `partyId` ∈ Party ของร้านที่เบอร์ตรงคีย์ (ใช้ตัดสิทธิ์ได้อย่างเดียว · N-8) · `action = rule.action` เมื่อ `count ≥ rule.count`
4. **`bookAppointment` (SELF = ONLINE/LINE เท่านั้น · STAFF/PHONE ไม่บังคับ = ทาง "โทรจอง" ของกติกา N-9)**: อ่าน `repeatNoShowOf` **ก่อนธุรกรรม** (G2) หลัง replay ของ idempotency (ส่งซ้ำได้ผลเดิม) —
   - `PHONE_ONLY` ⇒ `{ ok:false, code: "REPEAT_NO_SHOW", reason: REPEAT_NO_SHOW_REASON }` ไม่สร้างแถว
   - `REQUIRE_DEPOSIT` ⇒ มัดจำของนัด = ยอดปกติ (`computeDepositSatang`) · ถ้าได้ 0: `booking.deposit.amount` โหมด PERCENT ⇒ `round(ราคา × bp / 10000)` **ไม่ดูเกณฑ์ minDurationMin** · PER_SERVICE ⇒ `BookingService.depositSatang` · ยังได้ 0 หรือ snapshot `booking.deposit.method = NONE` ⇒ ปฏิเสธแบบ `PHONE_ONLY` (N-11) · **ยกเว้นสมาชิกระดับ (#37) ไม่มีผลกับนัดที่ติดกติกา** (N-5) · ถือช่องตาม B.8 ปกติ (PENDING + holdUntil) · snapshot เพิ่มคีย์ระดับบน `noShowRule: { action: "REQUIRE_DEPOSIT", count }` (additive · ไม่มีคีย์ `deposit.exempt`)
   - ไม่ติด ⇒ พฤติกรรมเดิมทุกไบต์ (snapshot ไม่มีคีย์ `noShowRule`)
5. `excuseNoShow` (ร้าน · **Membership สด** แบบ B.8 ShopCtx): สิทธิ์ `booking.deposit.waive` ที่หน่วยนั้น (OWNER ✓) · ไม่มีสิทธิ์/หน่วยอื่น/ร้านอื่น/ไม่มีนัด ⇒ `NOT_FOUND` คำตอบเดียว · `reason` 1–200 ตัว ⇒ ไม่งั้น `BAD_INPUT` · นัดไม่ใช่ NO_SHOW ⇒ `BAD_STATE` · CAS เพิ่ม `policySnapshot.noShow = { excused: true, at, by }` (additive) + audit `booking.no_show.excused` (`targetType "Appointment"` · `after` = id ล้วน + `reason`) ใน tx เดียว · ยกเว้นแล้ว ⇒ `{ ok: true, duplicated: true }` (audit แถวเดียว) · action `excuseNoShowAction` → `BOOKING_ACTIONS` = `["booking.deposit.waive"]`

### 3.3 «platform/booking-waitlist.ts» — จับคู่ช่องว่าง + ส่ง
```ts
export async function onWaitlistEvent(evt: { id?: string; tenantId: string; type: string; unitId?: string | null; payload: unknown }, opts?: { now?: Date }): Promise<void>;
export async function runWaitlistTick(now: Date, opts?: { tenantIds?: string[]; signal?: AbortSignal; deadline?: number; pageSize?: number })
  : Promise<{ expired: number; scanned: number; sent: number }>;
```
1. **ตัวจับคู่ (หัวใจ · ใช้ร่วมทั้ง consumer และ tick)** ต่อ (หน่วย, วัน): mode = `booking.booking.waitlistMode` ของหน่วย (`OFF` ⇒ ไม่ทำอะไร) · entry ACTIVE ของหน่วย+วัน เรียง `createdAt, id` · ต่อ entry: `findSlots(ctx, { serviceId, staffId: entry.staffId, dateStr, channel: "LINE" }, { now })` → เวลาเริ่ม `t` ที่ `fromMin ≤ t < toMin` → แบ่งเป็น **ช่วงว่าง** (เวลาเริ่มติดกันตามกริด `stepMin`) → ช่วงละ 1 ข้อเสนอ = เวลาแรกของช่วง + `staffId` ของ SlotOption นั้น
2. ปิด entry ก่อนส่ง: `expiresAt ≤ now` ⇒ `EXPIRED` · Party มีนัดในหน่วยวันนั้นบริการนั้น (สถานะไม่ใช่ CANCELLED/NO_SHOW) ที่สร้างหลัง entry ⇒ `BOOKED` (`endReason "BOOKED"`) — ทั้งสองไม่ส่ง
3. ส่ง: `notifyCustomer(ctx, { unitId, domain: "booking", messageKey: "waitlistOpen", partyId, vars, dedupeKey: "booking:waitlistOpen:<entryId>:<staffId>:<m(t)>", at: now, precheck })` · **ไม่ bypassQuiet** (R14 ⇒ `SKIPPED_QUIET` แล้ว tick รอบหลังเวลาเงียบส่งเอง) · ต่อ entry ต่อรอบส่งได้ไม่เกิน 1 ครั้ง (ช่วงแรกที่ยังไม่มีแถว log สถานะจบ)
   - vars: `ชื่อ` (Party.name) · `ร้าน` (ชื่อหน่วย) · `เวลา` (แบบ B.9 มี `HH:MM` ไทย) · `ช่าง` · `บริการ` (`booking.notify.hideServiceName` ⇒ `""`) · `ลิงก์จอง` = origin + `/s/<tenantSlug>/<unitSlug>?svc=<serviceId>&staff=<staffId>&date=<dateStr>&time=<HH:MM>&who=<bookingIdentityToken(Party)>`
   - เปิด/ปิด: `booking.msg.enabled.waitlistOpen === false` ⇒ ไม่ส่ง (ไม่มีคีย์ = ตาม mode · R2)
4. **FIRST**: ช่องว่าง (หน่วย, staffId, `m(t)`) เสนอให้ entry เดียว = entry แรกตามลำดับที่ผลไม่ใช่ "จบแบบไม่ได้ส่ง" — มีแถว log ของช่องนั้น (entry ใดก็ได้ในหน่วย) สถานะ `SENT`/`SENDING`/`SKIPPED_QUIET`/`FAILED` ⇒ entry ถัดไปไม่ได้ · แถวจบแบบไม่ได้ส่ง (`SKIPPED_CONSENT`/`NO_CHANNEL`/`SKIPPED_PRECHECK_*`) ⇒ ไปคนถัดไปได้ (C-5) · **ALL**: ทุก entry ที่ตรงได้ของตัวเอง
5. `precheck` (สด · ก่อนส่ง): entry ACTIVE · `expiresAt > now` · ยังไม่ได้จอง (ข้อ 2) · `findSlots` ยังมีเวลา `t` ของ `staffId` นั้น ⇒ ไม่ผ่าน `{ ok:false, reason: "ENDED" | "SLOT_TAKEN" }`
6. `onWaitlistEvent`: `booking.cancelled` · `booking.no_show` (วันไทยของ `startAt` ของนัดจากฐาน) · `booking.rescheduled` (วันไทยของ `payload.fromStartAt`) ⇒ ตัวจับคู่ของ (หน่วยของนัด, วันนั้น) · นัดไม่พบด้วย `{id, tenantId: evt.tenantId}` ⇒ จบเงียบ · type อื่น ⇒ ไม่ทำอะไร · ไม่ throw
7. `runWaitlistTick` (minute-job `booking.waitlist.tick` ทุก 1 นาที · ข้ามร้าน · จำกัดด้วย `tenantIds`): (ก) ACTIVE ที่ `expiresAt ≤ now` ⇒ `EXPIRED` ทีละหน้า keyset `(expiresAt, id)` วนจนหมด · (ข) (หน่วย, วัน) ที่มี entry ACTIVE วันไทย ≥ วันนี้ ⇒ ตัวจับคู่ — keyset `(unitId, dateStr)` วนจนหมดงบ (`pageSize` ค่าเริ่ม 50 · ข้อสอบส่ง 5) · เคารพ `signal`/`deadline` · ร้าน/หน่วยที่ล้มไม่บล็อกที่เหลือ (D.17 F1) · ครอบคลุมยกเลิกทางเดิมที่ไม่ยิง event (`setAppointmentStatus CANCELLED` — C-11) · คืนจำนวน

## 4. ตาราง (R1 — ยังไม่มีใน `booking.prisma` · ต้องเคาะก่อน)
```prisma
model BookingWaitlist {
  id        String    @id @default(cuid())
  tenantId  String
  unitId    String
  partyId   String              // ตัวตนที่ยืนยันแล้ว (ลิงก์ LINE) — ไม่มีชื่อ/เบอร์ในตารางนี้
  serviceId String
  staffId   String?             // null = ใครก็ได้
  dateStr   String              // YYYY-MM-DD วันไทย
  fromMin   Int                 // CHECK 0 ≤ fromMin < toMin ≤ 1440
  toMin     Int
  status    String    @default("ACTIVE")   // ACTIVE | BOOKED | CANCELLED | EXPIRED (CHECK)
  expiresAt DateTime
  endedAt   DateTime?
  endReason String?             // CUSTOMER | BOOKED | EXPIRED
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  @@index([tenantId, unitId, dateStr, status, createdAt])
  @@index([tenantId, partyId, status])
  @@index([status, expiresAt])
}
```
ข้อสอบ T-1 ตรวจชื่อคอลัมน์ตามนี้ · T-2 ไม่มีคอลัมน์ชื่อ/เบอร์/อีเมล

## 5. ค่าตั้ง (`defs/booking.ts` · `row()` เดิม · กลุ่ม `booking` ⇒ ขึ้นการ์ด "เวลาและการจอง" หน้า 08 เองโดยไม่แตะ layout — R3)
| คีย์ | type · chain | ค่าเริ่ม BARBER · SPA · CLINIC · `_fallback` |
|---|---|---|
| `booking.booking.waitlistMode` | enum `OFF`/`FIRST`/`ALL` · UNIT · ป้าย `{ OFF: "ปิด", FIRST: "แจ้งคนแรกที่รอ", ALL: "แจ้งทุกคน ใครจองก่อนได้" }` · labelTh "แจ้งเมื่อมีคิวว่าง (waitlist)" | `ALL` · `FIRST` · `OFF` · **`OFF`** (ร้านเดิมไม่เปลี่ยนพฤติกรรม) |
| `booking.booking.waitlistMaxActive` | int 1–10 · UNIT · labelTh "รอคิวว่างได้พร้อมกันสูงสุดต่อคน" | 3 · 3 · 3 · 3 |
| `booking.msg.waitlistOpen` | template · UNIT · `templateVars` = `ชื่อ ร้าน เวลา ช่าง บริการ ลิงก์จอง` · ข้อความคลินิก **ไม่มี `{บริการ}`** (#51) | ตัดผม: "คุณ{ชื่อ} มีคิวว่างที่ {ร้าน} เวลา {เวลา} ({บริการ} กับ{ช่าง}) · ใครจองก่อนได้ก่อน · จองเลย: {ลิงก์จอง}" (+en) · สปา = ตัดผม · คลินิก ไม่มี {บริการ} |
| `booking.msg.enabled` (เดิม) | schema รับคีย์ `waitlistOpen: boolean` **ไม่บังคับ** (ค่าที่ร้านเก็บไว้ 10 คีย์ต้องยัง valid — K-4) | ค่าเริ่มเพิ่ม `waitlistOpen: true` (BARBER/SPA) · `false` (CLINIC · `_fallback`) |
- หน้า 14 แสดงชนิดที่ 11 เอง (ตัวโหลดไล่ def `booking.msg.*`) ⇒ **ต้อง ORACLE-EDIT b.0 · b.9 · b.11 ตาม R2**

## 6. สัญญา DOM — PublicBooking (ขั้น 2 · เฉพาะเมื่อ `view.waitlist` มี)
- `[data-bk-waitlist]` อยู่ถัดข้อความ `bk7.noTimes` · `canJoin && !joined` ⇒ `form[data-bk-waitlist-join]` + hidden `serviceId` `staffId` (`""` = ใครก็ได้) `dateStr` `who` + ปุ่ม (ไทย "แจ้งฉันถ้ามีคิวว่าง") · `joined` ⇒ `[data-bk-waitlist-joined]` · `!canJoin` ⇒ `[data-bk-waitlist-need-line]` (ข้อความ "เปิดจาก LINE ของร้าน") · ไม่มีเบอร์/ชื่อเต็ม · ข้อความจาก dict ตามภาษา
- action ของฟอร์มเป็น prop **ไม่บังคับ** (ข้อสอบ render โดยไม่ส่ง action — ต้องไม่ throw และยังมี form)
- ไม่มี `view.waitlist` ⇒ ไม่มีกล่อง `data-bk-waitlist` ใด ๆ (U-2)

## 7. ข้อเคาะ (ผู้เขียนข้อสอบเลือกแล้ว · ผู้คุมเคาะได้ · เปลี่ยน = ORACLE-EDIT)
| # | เรื่อง | เลือก | เหตุผล |
|---|---|---|---|
| **R1** | **ตาราง waitlist ยังไม่มี** (`booking.prisma` ไม่มี `BookingWaitlist` · กติกาเหล็กข้อ 5 ให้ migration เฉพาะ R0.1/B.0/D.0) | **ก (เสนอ)**: อนุมัติ migration เพิ่มอย่างเดียว 1 ตาราง §4 ในใบนี้ (ต่อคิวหลัง B.13 ถ้า B.13 แตะ schema) · **ข**: แยกใบ — B.17a ไม่มาซ้ำ (ไม่มี schema · ปล่อย builder ได้ทันที · ข้อ N-1–N-14 + K-5 + S-4) + B.17b waitlist หลัง migration · ค: ยัดลงตารางเดิม (QueueTicket/SettingValue/ChatLinkCode) — **ไม่รับ** (ปนจอคิว/ค่าตั้ง · ผิดความหมาย) | แบบ §9 วาง `BookingWaitlist` ไว้แล้ว · ข้อมูลต้องค้นตามหน่วย/วัน/สถานะ |
| **R2** | ข้อความ waitlist | ชนิดที่ 11 `booking.msg.waitlistOpen` + คีย์ไม่บังคับใน `booking.msg.enabled` · **ต้อง ORACLE-EDIT**: b.0 D-KEYS (+3 แถว) · แถว 51 (`msgOn` มี waitlistOpen) · FALLBACK `msg.enabled` · D-MSG-1 (10 → 10 ชนิดเดิม + waitlistOpen) · b.9 ข้อที่เทียบ `booking.msg.enabled` ค่าเริ่มตรงตัว · b.11 N-1/N-2 (`MSG_KINDS` + waitlistOpen ท้ายสุด) | notifyCustomer อ่าน `booking.msg.<key>` เท่านั้น (ชิ้นกลาง ห้ามแก้) · หน้า 14 ไล่ def เองอยู่แล้ว ⇒ ร้านแก้ถ้อยคำ/ปิดได้ที่เดียวกับชนิดอื่น · `BOOKING_MSG_KINDS` ของ B.9 คง 10 |
| R3 | ที่อยู่ค่าตั้ง | กลุ่ม `booking` (การ์ด 1 หน้า 08) | ไม่ต้องแก้ layout ของ B.11 · b.11 M-9 ครอบเอง |
| R4 | ค่าเริ่ม | ตัดผม ALL · สปา FIRST · คลินิก OFF · ร้านเดิม OFF · สูงสุด 3 รายการ/คน | ตัดผมงานสั้นแข่งกันกดได้ · สปางานยาว ลูกค้าประจำรอคิว · คลินิกนัดผ่านเจ้าหน้าที่ |
| R5 | "ครั้งเดียว" นับต่ออะไร | ต่อ (entry, ช่าง, นาทีเริ่มของช่วงว่าง) · ช่วงว่างขยาย (ยกเลิกนัดติดกัน) = ข้อเสนอเดิม ไม่ส่งซ้ำ · FIRST = ช่องละ 1 คน · คนแรกส่งไม่ได้ (บล็อก/ไม่มีช่อง) ⇒ คนถัดไป | ตัวจับคู่ใช้ข้อมูลสด (ไม่ต้องจำว่านัดไหนปล่อย) ⇒ ครอบยกเลิกทางเดิมที่ไม่มี event + ส่งซ้ำหลังเวลาเงียบได้เอง |
| R6 | ถือช่องให้คนที่ได้ข้อเสนอไหม | ไม่ถือ (ใครจองก่อนได้ก่อน) · FIRST ไม่มีการส่งต่อคนถัดไปเมื่อคนแรกไม่จองภายใน X นาที (หนี้ §8) | แผนสั่ง "จองผ่านทางปกติเท่านั้น" · ถือช่อง = ทางลัดเลี่ยงกติกา B.3/B.8 |
| R7 | ใครเข้า waitlist ได้ | ลิงก์ตัวตน LINE เท่านั้น · หน้า ONLINE (เบอร์ไม่ยืนยัน) ไม่ได้ · พนักงานเพิ่มให้ = หนี้ | ต้องมีช่องทางส่งที่ลูกค้าผูกเอง (CC §10 ข้อ 5) · กดขอ = คำขอรับข้อความบริการชัดแจ้ง |
| R8 | มีเวลาว่างอยู่แล้วตอนกดเข้า | `HAS_FREE` (ไม่รับ) | กันข้อเสนอเด้งทันที · หน้าจองโชว์ waitlist เฉพาะวันที่เต็ม |
| R9 | ไม่มาซ้ำนับที่ไหน/ใคร | หน่วย (ตามชั้นค่าตั้ง UNIT) · LINE = นัดที่ผูก Party · ONLINE = เบอร์ + Party ของเบอร์ · STAFF/PHONE ไม่บังคับ (ร้านเห็นสถานะผ่าน `repeatNoShowOf` ได้) | บทเรียน B.8: ตัวตนจากทางยืนยันแล้ว · ทางไม่ยืนยันใช้ตัดสิทธิ์ได้อย่างเดียว · ONLINE เบอร์ใหม่เอี่ยมจับไม่ได้จนมี OTP (หนี้ S.1) |
| R10 | ยอดมัดจำบังคับ | ยอดปกติ → ถ้า 0 ใช้ % ไม่ดูเกณฑ์นาที / ยอดต่อบริการ → ยัง 0 หรือไม่มีวิธีรับมัดจำ ⇒ ต้องโทรจอง · ยกเว้นสมาชิกไม่มีผล | ไม่เพิ่มคีย์ยอดใหม่ · ไม่มีทางเก็บเงิน = บังคับมัดจำไม่ได้จริง ⇒ ทางที่ปลอดภัยกว่า |
| R11 | ร้าน override | "ยกเว้นไม่มาครั้งนี้" ต่อนัด (`excuseNoShow`) · คีย์ `booking.deposit.waive` (เอาออกจาก planned) · audit · ปุ่มบนจอร้าน = หนี้ (action พร้อม) · หรือร้านจองให้ทาง STAFF/PHONE ได้เสมอ | ไม่ต้องมีตาราง/คีย์สิทธิ์ใหม่ · หลักฐานครบ (ใคร · เมื่อไร · เหตุผล) |
| R12 | ข้อความปฏิเสธ | ข้อความกลางเดียว ไม่บอกว่าเพราะไม่มา | หน้า ONLINE ใครก็กรอกเบอร์คนอื่นได้ ⇒ บอกเหตุ = เปิดเผยประวัติ |
| R13 | event ใหม่ | ไม่มี (ใช้ audit ของ excuse · แถว log ข้อความ) | ไม่แตะ 3 ทะเบียน · B.18/รายงานค่อยเพิ่มถ้าต้องใช้ |
| R14 | เวลาเงียบ | ไม่ข้าม (ไม่ใช่ข้อความที่ลูกค้ายืนรอ) · tick ส่งหลังหมดเวลาเงียบถ้าช่องยังว่าง | มติ D.10 Z12 แบบเดียวกัน |
| R15 | ขอบหน้าต่างเวลา | `now − windowDays×24 ชม. < startAt ≤ now` | นัดอนาคตที่ถูกตั้ง NO_SHOW ผิด ๆ ไม่นับ |

## 8. ไม่ใช่เรื่องของใบนี้ / หนี้ส่งต่อ
- FIRST ส่งต่อคนถัดไปเมื่อคนแรกไม่จองภายใน X นาที (ต้องมีคีย์เวลา) · พนักงานเพิ่มลูกค้าเข้า waitlist / จอรายชื่อรอ · ปุ่ม "ยกเว้นไม่มาครั้งนี้" บนจอร้าน (B.14 ปฏิทิน/B.18) · นับไม่มาซ้ำข้ามสาขา · ONLINE เบอร์ใหม่ (OTP — S.1) · รายงานอัตรา waitlist→จอง (B3.1)
- คำถาม J5 (ลง `ledger/wo-notes/svc-legal-questions.md` โดยผู้คุม): ข้อความ "มีคิวว่าง" = ข้อความบริการ (ลูกค้ากดขอเอง) ไม่ต้องยินยอมการตลาด — ยืนยัน · เก็บรายการรอไว้นานเท่าไร (ค่าปลอดภัย: ลบ/ปิดเมื่อหมดวัน · ข้อมูลเหลือ id ล้วน)

## 9. เกณฑ์รับ
- ข้อสอบ 73 ข้อ (ผลรันผู้คุม 31 ต.ค. บน b15182dd: ผ่าน 12 · แดง 55 · SKIP 6 = G-* ไม่มีงาน) — เขียวก่อนทำ: PC-1–PC-8 · S-2 · X-2 · Q-1 · Z-1 · แดงทุกข้อที่เหลือด้วยเหตุ "ยังไม่มีไฟล์/def/ตาราง" หรือพฤติกรรมเดิม (N-4 มัดจำ 0 CONFIRMED · N-5 ยกเว้นสมาชิกยังมีผล · N-8 ONLINE ไม่ติด · N-11 จองผ่าน · N-12 ขั้น 3 ฿0)
- ข้อสอบ B.17 ผ่านทุกข้อ (G ครบ: b.3 · b.4 · b.7 · b.8 · b.9 · smoke) + ผู้คุมรัน b.0 / b.11 หลัง ORACLE-EDIT ตาม R2 · typecheck + fitness 2 โหมด (F5 ไม่เพิ่ม · F6 ไม่มีไฟล์ใหม่ใน src/lib/actions) · ไม่มีภาพแบบ — ผู้คุมเปิดหน้าจอง 390 วันเต็มดูกล่อง waitlist ด้วยตาหนึ่งครั้ง
- รายงาน builder: ต่อข้อ id → ผล + ไฟล์ที่แตะ + ข้อที่แย้ง

## มติผู้คุม (31 ต.ค. 2569)
- **R1 ✅ ทาง ก แบบเรียงลำดับ:** ข้อยกเว้นกติกาข้อ 5 (แบบ D.4/B.13) migration เพิ่มอย่างเดียว 1 ตาราง `BookingWaitlist` ตาม §4 (ไม่มีคอลัมน์ชื่อ/เบอร์) · **ห้ามทำจนกว่า B.13 (svc_b13) merge เข้า session/svc** (ใบที่แตะ schema ห้ามขนาน) — ผู้คุมจะแจ้ง · ระหว่างรอ: ทำส่วน "ไม่มาซ้ำ" (N-1..N-14 · K-5 · S-4) ก่อน · ตอนทำ migration: ใช้ node_modules แยกของ l1 ก่อน generate (ผู้คุมเตรียมให้) · ลงฐานเลน l1 · deploy checklist · `migrate diff` อ่าน SQL ทุกบรรทัด
- **R2 ✅** ชนิดข้อความที่ 11 `booking.msg.waitlistOpen` + `booking.msg.enabled` รับคีย์ใหม่แบบไม่บังคับ · ⚖️ อนุมัติให้ builder ทำ ORACLE-EDIT b.0 (D-KEYS +3 · แถว 51 · FALLBACK · D-MSG-1) · b.9 (ค่าเริ่ม msg.enabled) · b.11 (N-1/N-2 = 11 ชนิด) **เฉพาะการเพิ่มชนิด/คีย์นี้** ติดป้าย `// ORACLE-EDIT (ผู้คุม 31 ต.ค. · b17-R2)` · ผู้คุมรัน b.0/b.11 ตอนรับใบ
- R3–R15 ✅ ตามที่เลือก · หนี้ตาม §หนี้ · J5 ⇒ svc-legal-questions
