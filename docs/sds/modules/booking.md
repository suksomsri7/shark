# SDS — จองคิว/นัดหมาย (BOOKING) · AS-BUILT V2

> as of `b3de0dce` (`session/svc` · 1 พ.ย. 2569 · SVC B.18 ส่วนเอกสาร) — สร้างจากโค้ด: model · event · facade · สิทธิ์ · ค่าตั้ง · งานรายนาที · เงิน · ข้อสอบ · แทนที่ฉบับ AS-BUILT 2026-07-16 (จองคิวรุ่นแรก = บริการ + ช่าง + ตารางรายสัปดาห์ + นัด)
> คู่กับสเปกฟังก์ชัน `docs/modules/03-booking.md` (V2) · บัตรคิว `docs/sds/modules/queue.md` · แผน `ledger/SVC-MASTER-PLAN.md` (B.0–B.18) · แบบ `ledger/DESIGN-BOOKING-QUEUE.md` · สัญญากลาง `ledger/SVC-CORE-CONTRACT.md` · ใบสั่ง `ledger/svc-briefs/svc-brief-b.*.md` · UAT `ledger/wo-notes/svc-uat-u1-barber.md` (U1) · `ledger/wo-notes/svc-uat-u3-massage.md` (U3) · ข้อควรระวัง deploy `ledger/wo-notes/svc-deploy-checklist.md`
> ตัวเลขนับจากโค้ดวันนี้: model 10 (`prisma/schema/booking.prisma`) + enum 1 · คีย์ outbox `booking.*` ที่มีตัวรับ 12 · export ของ facade 116 ชื่อ (ค่า 65 + type 51) · คีย์สิทธิ์ `booking.*` 26 (planned 1) · ค่าตั้ง `booking.*` 84 คีย์ · แม่แบบ 3 (CLINIC ซ่อน) · งานรายนาที 5 · server action ที่ผูกคีย์ (`BOOKING_ACTIONS`) 26 · migration ของ RUN 3 (`svc_b` · `svc_b13` · `svc_b17`)
> 🔴 ยังไม่ deploy — รอเจ้าของสั่ง (J6 `INTEGRATIONS_CREDENTIALS_KEY` บน prod ก่อน) · ด่านเต็ม G1 ✅ (B.12) · G3 ⬜ (B.18 คู่ D.20)

## 1. หน้าที่ · ชั้น · ไฟล์
- **จองคิว/นัดหมายของธุรกิจบริการ** (ร้านตัดผม · ร้านนวด/สปา · คลินิก (ซ่อน)): นัดล่วงหน้า + walk-in ใน **แถวเดียว** (โหมด `booking.queue.singleLine`) → ตัววางคิววางทั้งวัน → เช็กอิน/บัตร P·A → เรียก/เริ่ม/เสร็จ → **บิลจากคิว** (บิลพัก POS) → จ่าย ⇒ งานปิด + แต้ม/ค่าคอมฯ · มัดจำพร้อมเพย์ · แจ้งเตือน LINE · ตู้/ทีวี · ทรัพยากร (ห้อง/เตียง) · ปฏิทินลากย้าย · คู่รัก/กลุ่ม · waitlist
- Layer 3 · scope = unit (BusinessUnit ชนิด `BOOKING`) · ทุกแถวผูก `tenantId` + `unitId` · อ่าน/เขียนผ่าน `tenantDb` (ไฟล์ใหม่ของ RUN ห้าม import prisma ดิบ — F5) · id ข้ามโมดูลเป็นสตริงหลวม ไม่มี FK (`resourceId` `queueTicketId` `heldCartId` `groupId` `partyId`)
- **ร้านเดิม** (ยังไม่เลือกแม่แบบ = ค่าตั้ง `_fallback`) ทำงานแบบรุ่นแรกทุกอย่าง: ไม่มีแถวเดียว · ไม่มีบิลพัก (บิล CASH เดิมใน `setStatusAction`) · ไม่ส่งข้อความ · ไม่ปล่อยช่อง (`FALLBACK_LEGACY` ใน `src/lib/core/settings/defs/booking.ts` · `isLegacyBookingUnit` ใน `finish.ts`)
- **โค้ดโมดูล** `src/lib/modules/booking/` (30 ไฟล์):

| ไฟล์ | หน้าที่ (ใบ) |
|---|---|
| `service.ts` | แกนเดิม + ทางจองเดียว `bookAppointment` · หาเวลา `findSlots` · เวลาร้าน/วันหยุด · บริการ/ช่าง · สถานะนัด · ปล่อยช่องมัดจำ `expireDepositHolds` · ตัวช่วยเงินมัดจำใต้ล็อก · ตัวในของกลุ่ม (รุ่นแรก · B.1 · B.3 · B.7 · B.8 · B.15) |
| `slots.ts` · `staff-hours.ts` | ช่องเวลา pure (`computeStaffSlots` · `computeDepositSatang`) · หน้าต่างเวลาต่อช่าง + ช่าง↔บริการ pure (B.1) |
| `planner.ts` · `planner-resources.ts` · `planner-group.ts` · `plan-settings.ts` | ตัววางคิว `planDay`/`quoteWalkIn` pure (B.2) · ด่านทรัพยากรสูตรเดียว (B.13) · ห้องเดียวของกลุ่ม (B.15) · ค่าตั้ง → PlanSettings (B.3) |
| `planner-run.ts` | ตัวห่อ: ล็อกสาขา + เขียนแคช `plannedStaffId/plannedStartAt` + `QueueTicket.etaAt` · งานรายนาที `runLineTick` (สาย → ไม่มา → สิ้นวัน) (B.4) |
| `queue-line.ts` · `line-ops.ts` · `line-access.ts` · `today-line.ts` | เช็กอิน · walk-in · บัตร P/A · เรียก/เริ่ม/เสร็จ/ยกเลิก/เลื่อนฝั่งร้าน (B.4) · ข้าม/เรียกซ้ำ/ย้ายช่าง (B.5) · ด่านสิทธิ์จอแถวเดียว · ตัวโหลดจอคิววันนี้/ของฉัน/ปฏิทินรายวัน (B.5) |
| `devices.ts` · `public-line.ts` | อุปกรณ์ทีวี/ตู้ = แถว `QueueDisplay` (token sha256) · หน้าสาธารณะ ทีวี/ตู้/หน้าบัตร (B.6) |
| `online.ts` · `manage-token.ts` | จองออนไลน์ 3 ขั้น + ลิงก์จัดการนัด (ดู/เลื่อน/ยกเลิก/.ics) · token ≥128 บิต เก็บ hash (B.7) |
| `deposit.ts` | มัดจำ: สถานะ 12 แบบ · หน้าจ่าย QR · แนบสลิป · consumer สลิปอนุมัติ · คิวมัดจำจอร้าน · ยืนยัน/คืน/ริบ · ใช้มัดจำในบิล (B.8 · B.15) |
| `finish.ts` | จบงาน → บิลจากคิว (บิลพัก POS) + ค่าคอมฯ ตามผู้ให้บริการ · จ่ายแล้ว ⇒ `booking.paid` (B.10) |
| `settings-model.ts` · `access.ts` · `privacy.ts` · `privacy-shared.ts` | จอตั้งค่า (แม่แบบ/บริการ/คน/ทรัพยากร) · ด่านสิทธิ์ต่อ action · ลบข้อมูล walk-in ตามอายุ · ซ่อนเบอร์ (B.11) |
| `resources.ts` · `resource-kinds.ts` | ทรัพยากร CRUD + ปิดซ่อม · ล็อก/อ่านทรัพยากรใน tx · กล่อง "รับ walk-in ตอนนี้ได้ไหม" (B.13) |
| `calendar.ts` | ปฏิทินวัน/สัปดาห์ ตามคน/ห้อง · ลากย้าย (= `rescheduleByShop`) · คลิกช่องว่างจอง (= `bookAppointment`) (B.14) |
| `group.ts` | คู่รัก/กลุ่ม: `bookGroup` · `findGroupSlots` · `groupOf` · `cancelGroup` · `rescheduleGroup` (B.15) |
| `customer-notes.ts` | ความชอบ/ข้อห้ามลูกค้าบนการ์ดงาน (อ่านผ่าน `member/staff-notes.ts`) (B.16) |
| `waitlist.ts` · `no-show-rule.ts` | waitlist เข้า/ออก/กล่องหน้าจอง · ไม่มาซ้ำ (บังคับมัดจำ/ต้องโทรจอง) + ร้านยกเว้นรายนัด (B.17) |
| `index.ts` | facade (§4) |

- **ชั้น platform** (แตะจองคิว + แชท + notifyCustomer พร้อมกัน): `src/lib/platform/booking-notify.ts` (ข้อความ 9 ชนิดที่ส่งจริง + งาน `booking.notify.tick` · B.9) · `src/lib/platform/booking-line-link.ts` (รหัสผูก LINE กับนัด/บัตร · postback `booking.*` · B.9) · `src/lib/platform/booking-remote.ts` (รับบัตรคิวจากมือถือ #42 · B.9) · `src/lib/platform/booking-waitlist.ts` (จับคู่ช่องว่าง + ส่งข้อเสนอ · B.17) · postback ลงทะเบียนใน `src/lib/platform/postback-routes.ts` (prefix `booking.` · ref `APPOINTMENT` / `QUEUE_TICKET`)
- **server action**: `src/lib/actions/booking.ts` (17) · `booking-line.ts` (15 · จอแถวเดียว) · `booking-settings.ts` (7) · `booking-calendar.ts` (2) · `booking-devices.ts` (3) · สาธารณะ `src/app/(store)/bq/actions.ts` (ตู้/หน้าบัตร 4) · `src/app/(store)/bq/m/actions.ts` (ลิงก์จัดการนัด 4) · `src/app/(store)/s/[tenantSlug]/[unitSlug]/waitlist-actions.ts` (2)
- **หน้าพนักงาน** `src/app/app/u/[unitSlug]/booking/**` (แท็บใน `layout.tsx` · แถวเดียวเพิ่ม "ปฏิทินนัด" + "ของฉัน"): `/booking` (คิววันนี้แถวเดียว + คิวมัดจำ) · `/booking/calendar` (B.14) · `/booking/mine` (มือถือช่าง) · `/booking/day` (ปฏิทินรายวัน B.5 · ไม่มีแท็บ) · `/booking/staff` (คน + ทรัพยากร) · `/booking/services` · `/booking/hours` · `/booking/settings` (แม่แบบ+นโยบาย) · `/booking/settings/messages` (ข้อความ/ทีวี/ตู้/สิทธิ์) · `/booking/devices` · `/booking/setup` (redirect → services)
- **หน้าลูกค้า (สาธารณะ)**: `src/app/(store)/s/[tenantSlug]/[unitSlug]/page.tsx` (จองออนไลน์ `src/components/public-booking.tsx` + กล่อง waitlist) · `/s/<ร้าน>/<สาขา>/remote` (รับบัตรจากมือถือ) · `src/app/(store)/bq/m/[token]` (จัดการนัด + จ่ายมัดจำ + `ics/route.ts`) · `bq/t/[token]` (หน้าบัตร) · `bq/tv/[token]` (ทีวี) · `bq/kiosk/[token]` (ตู้) · API `POST /api/store/[tenantSlug]/[unitSlug]/book` · `GET .../slots`
- schema: `prisma/schema/booking.prisma` · migration `prisma/migrations/20261222000000_svc_b` (คอลัมน์ Appointment + enum + `BookingStaffService` + `SvcResource` + `QueueTicket.etaAt` + POS 2 คอลัมน์ + CHECK มือ) · `20261225000000_svc_b13` (`SvcResourceBlock`) · `20261226000000_svc_b17` (`BookingWaitlist`)

## 2. Models (10 · `prisma/schema/booking.prisma`) + คอลัมน์ข้ามโมดูล
| model | หน้าที่ | ผู้เขียน (grep) |
|---|---|---|
| `BookingService` | บริการที่สาขาเปิดรับจอง (projection ของ `InvItem` kind SERVICE ผ่าน `itemId`) · นาที/ราคา/มัดจำ/เวลาเก็บ (`bufferMin`)/`bookable` | `service.ts` (`setServiceOffered` · `importServicesToCatalog`) · `settings-model.ts#setServiceBooking` |
| `BookingStaff` | ผู้ให้บริการของสาขา · `employeeId` หลวม → HrEmployee | `service.ts` (`createStaff` · `setStaffReceiving` · `linkStaffToHr`) |
| `BookingHours` | เวลาร้านรายสัปดาห์ (ไม่มีแถว = 10:00–20:00 จาก `DEFAULT_HOURS_ROW` ใน `service.ts`) | `service.ts#setUnitHours` |
| `BookingStaffHours` | เวลาทำงานรายสัปดาห์ต่อช่าง | `service.ts` |
| `Appointment` | งาน 1 แถว = 1 คน × 1 บริการ · `kind` BOOKED/WALKIN · `assignMode` · `channel` · เวลา check-in/start/done/late · แคชแผน `plannedStaffId/plannedStartAt` · `resourceId` · `groupId` · `queueTicketId` · `manageTokenHash` (unique) · `heldCartId` · `rescheduleCount` · `policySnapshot` (ค่าตั้ง 11 คีย์ + ป้ายสถานะมัดจำ/ทรัพยากร) · มัดจำ `depositSatang/depositPaidAt/depositSaleId` | `service.ts` · `queue-line.ts` · `planner-run.ts` · `online.ts` · `deposit.ts` (ผ่านตัวช่วยใน service) · `finish.ts` · `line-ops.ts` · `privacy.ts` (ลบชื่อ/เบอร์ walk-in) |
| `BookingStaffService` | ช่าง × บริการ (ไม่มีแถวของช่าง = ทำทุกบริการเมื่อ `booking.staff.servicesMode` = ALL) · นาที/ราคาเฉพาะคน | `settings-model.ts#setStaffService` |
| `SvcResource` | ทรัพยากร (ชนิด 7: CHAIR BED SOFA ROOM COUPLE_ROOM EQUIPMENT EXAM_ROOM · `resource-kinds.ts`) · ความจุ · เวลาเก็บ · ปิดใช้แทนลบ | `resources.ts` |
| `SvcResourceBlock` | ช่วงปิดซ่อม (endAt null = จนกว่าจะปลด) · เขียนใต้ล็อกแถวทรัพยากรเดียวกับทางจอง | `resources.ts#setResourceMaintenance` |
| `BookingClosure` | วันหยุด/เวลาพิเศษรายวัน | `service.ts#setClosure/removeClosure` |
| `BookingWaitlist` | waitlist (ตัวตน = `partyId` จากลิงก์ LINE เท่านั้น · ไม่มีชื่อ/เบอร์) · ACTIVE/BOOKED/CANCELLED/EXPIRED | `waitlist.ts` · `src/lib/platform/booking-waitlist.ts` |

- enum `AppointmentStatus` 9 ค่า: เดิม 6 (PENDING CONFIRMED ARRIVED DONE NO_SHOW CANCELLED) + B.0 ต่อท้าย QUEUED · IN_SERVICE · LATE (ตั้งได้ทางเครื่องสถานะแถวเดียวเท่านั้น)
- คอลัมน์ที่ B.0 เพิ่มนอกไฟล์นี้: `QueueTicket.etaAt` (`prisma/schema/queue.prisma`) · POS 2 จุดที่เจ้าของอนุญาต `PosHeldCart.serviceJobId` (partial unique HELD ใน SQL มือ) · `PosSaleLine.performerEmployeeId` (`prisma/schema/pos.prisma`)
- ตารางที่ใช้ร่วม: `QueueTicket` / `QueueType` (ประเภทระบบ `APPOINTMENT` + `WALKIN` สร้างผ่าน `queue/service.ts#ensureSystemQueueType`) · `QueueDisplay` (อุปกรณ์ B.6) · `PaymentSlip` กลาง (refType มัดจำ) · `PosDeposit`/`PosSale` (มัดจำ · บิล) · `ChatLinkCode` (ผูก LINE) · `AuditLog`
- ไม่มี: หมวดบริการ · รูปบริการ · หลายบริการต่อ 1 นัด (`AppointmentItem`) · log สถานะแยก · blacklist · ตารางคอร์ส · ตารางกลุ่มแยก (กลุ่ม = `groupId` · หัวกลุ่ม = แถวแรก)

## 3. Outbox events (12 `booking.*` · ตัวรับใน `src/lib/outbox-consumers.ts` ห่อ `withAutomation`)
payload เป็น id/ยอด/สถานะล้วน ไม่มีชื่อ/เบอร์ (X8) · ป้ายไทยใน `src/lib/automation/labels.ts` · สมาชิกกลุ่มยิง event ของตัวเอง + `groupId` (ไม่มี event กลุ่ม)
| คีย์ | ผู้ผลิต (grep) | ตัวรับ |
|---|---|---|
| `booking.created` | `service.ts` · `queue-line.ts` | `booking-notify.ts#onBookingNotifyEvent` (ยืนยันนัด/ได้บัตร) |
| `booking.rescheduled` | `service.ts` · `queue-line.ts` · `line-ops.ts` | waitlist (ช่องเดิมว่าง) |
| `booking.cancelled` | `service.ts` · `queue-line.ts` · `online.ts` · `public-line.ts` | ริบมัดจำยกเลิกช้า (`forfeitAfterLateCancel` · ล้ม = logOps) + waitlist |
| `booking.checked_in` | `queue-line.ts` | booking-notify (เช็กอินแล้ว) |
| `booking.late` | `planner-run.ts` | no-op |
| `booking.started` | `queue-line.ts` | no-op |
| `booking.completed` | `service.ts` · `queue-line.ts` | สแตมป์จากการมา + สมาชิก (`onBookingCompleted`) + CRM VISIT |
| `booking.no_show` | `service.ts` (`emitNoShowTx`) | สมาชิก (`onBookingNoShow`) + booking-notify (ชวนนัดใหม่) + waitlist |
| `booking.paid` | `finish.ts` (บิลจากคิวจ่ายแล้ว ครั้งเดียว) | no-op |
| `booking.deposit_paid` · `booking.deposit_forfeited` | `service.ts` | no-op |
| `booking.deposit_refunded` | `deposit.ts` | no-op |

event กลางที่จองคิวรับ: `pos.sale.paid` → `booking.onPosSalePaid` (บิลจากคิวจ่าย ⇒ งาน DONE/paid · ห่อ `bothMain` คู่ค่าคอมฯ POS) · `payment.slip.approved` → `deposit.ts#onDepositSlipApproved` (คู่ `dorm-pay`) · บัตรแถวเดียวยิง `queue.ticket.called` / `queue.ticket.done` (ดู SDS queue) · **ไม่ยิง** `queue.served` (booking.completed ทำหน้าที่ VISIT แล้ว)

**งานรายนาที 5** (`src/lib/platform/minute-jobs.ts`): `booking.depositHolds.expire` (1 นาที · ปล่อยช่องที่ไม่จ่ายมัดจำ · B.3) · `booking.line.tick` (1 นาที · สาย/ไม่มา/สิ้นวัน + วางคิวใหม่ เฉพาะหน่วยแถวเดียว · B.4) · `booking.notify.tick` (1 นาที · เตือนก่อนนัด/ใกล้ถึงคิว/ล่าช้า/ชวนกลับ · B.9) · `booking.waitlist.tick` (1 นาที · B.17) · `booking.privacy.purge` (60 นาที · B.11) — ทุกตัว idempotent (เงื่อนไขสถานะ + `FOR UPDATE SKIP LOCKED` / dedupeKey ของ notifyCustomer) · ยิงซ้อนได้ (X5) · บัตรคิวทั่วไป `queue.housekeeping` (5 นาที) ข้ามบัตรของจองคิว

## 4. Facade `src/lib/modules/booking/index.ts` (ค่า 65 · type 51 — re-export ล้วน)
ผู้เรียกนอกโมดูลใช้ไฟล์นี้ · หน้า/action ของโมดูลเองยัง import ไฟล์ย่อยตรง (หัวไฟล์ index) · ด่านสิทธิ์/token อยู่ในฟังก์ชัน
- **CRM (อ่าน)**: `appointmentsByParty`
- **ตั้งค่า/สิทธิ์/ความเป็นส่วนตัว B.11**: `loadBookingSettingsPage` · `applyBookingTemplate` · `setStaffService` · `setServiceBooking` · `applyBookingRolePreset` · `purgeBookingPersonalData` · `BOOKING_ACTIONS` · `bookingActionKeys` · `canBookingAction` · `maskPhone` · `canSeeFullPhone` · `phoneForViewer`
- **แถวเดียว B.4/B.5/B.6/B.9**: `checkIn` · `createWalkIn` · `quoteWalkInWait` · `loadTodayLine` · `ticketTokenFor` · `deferTicket` · `bookingPhoneKey`
- **ออนไลน์ B.7**: `manageLinkFor` · `bookingIdentityToken`
- **บิลจากคิว B.10**: `previewServiceBill` · `finishJob` · `ensureServiceBill` · `amendServiceBill` · `cancelServiceBill` · `markPaidWithoutPos` · `authorizeServiceBillOp` · `onPosSalePaid` · `voidPaidServiceBill` · `isLegacyBookingUnit`
- **มัดจำ B.8**: `depositInfo` · `loadDepositPay` · `submitDepositSlip` · `onDepositSlipApproved` · `depositQueue` · `confirmDepositByShop` · `refundDepositByShop` · `forfeitDepositByShop` · `depositForBill`
- **ไม่มาซ้ำ B.17**: `repeatNoShowOf` · `excuseNoShow` · `REPEAT_NO_SHOW_REASON`
- **ทรัพยากร B.13**: `listResources` · `createResource` · `updateResource` · `setResourceMaintenance` · `walkInNowByService` · `bookingResourcesModel`
- **waitlist B.17**: `joinWaitlistOnline` · `leaveWaitlistOnline` · `waitlistViewOf` · `WAITLIST_RATE` · `findSlots` · `onlineRulesOf` · `localToUtc`
- **ปฏิทิน B.14**: `loadCalendar` · `moveAppointment` · `bookForCustomer`
- **กลุ่ม B.15**: `bookGroup` · `findGroupSlots` · `groupOf` · `cancelGroup` · `rescheduleGroup`
- ไม่อยู่ใน facade (ใช้ในโมดูล/หน้าของโมดูลเอง): `customer-notes.ts#loadJobCustomerNotes` (หน้า `/booking` `/booking/mine` `/booking/calendar` import ตรง) · ตัวช่วยเงินใต้ล็อกใน `service.ts`

## 5. สิทธิ์ · ขอบเขต
- **คีย์ 26** (`src/lib/core/permissions.ts` module `booking` · กลุ่ม `booking`): เดิม 10 (`booking.appointment.create` · `.appointment.setStatus` · `.service.create` · `.service.update` · `.service.setDeposit` · `.deposit.record` · `.deposit.refund` · `.staff.create` · `.staff.delete` · `.hours.set`) + B.0 2 (`booking.settings.edit` · `booking.settings.money`) + B.11 13 (`booking.queue.operate` · `.checkin` · `.walkin.create` · `.job.run` · `.job.runAny` · `.deposit.confirm` · `.devices.manage` · `.appointment.reschedule` · `.deposit.waive` · `.deposit.forfeit` · `.customer.phoneFull` · `.report.view` (planned — ไม่มีหน้ารายงานจองคิว)) + B.16 1 (`booking.customer.notes`)
- OWNER ผ่านทุกอย่าง · MANAGER ผ่านในหน่วยที่คุม · STAFF ต้องถือคีย์ (`evaluate` ของ `src/lib/core/rbac.ts`)
- **ด่านต่อ action** `access.ts`: `BOOKING_ACTIONS` 26 action → คีย์ (ผ่านเมื่อถือคีย์ใดคีย์หนึ่ง) · `setStatusAction` แยกคีย์ตามสถานะปลายทาง (`STATUS_KEYS`) · ชื่อไม่รู้จัก ⇒ fail closed (`assertBookingActionAllowed`) · จอแถวเดียวใช้ `line-access.ts#lineAccess` (เรียก/เริ่ม/เสร็จของตัวเอง = `booking.job.run` · ของทุกคน = `booking.job.runAny`/`booking.queue.operate` · เช็กอิน/walk-in)
- **ชุดสิทธิ์ตามบทบาท** (จอง 14 · `BOOKING_ROLE_ROWS` 11 แถว ใน `permissions.ts` · `applyBookingRolePreset`): LEAD · PROVIDER (งานตัวเอง + เคาน์เตอร์ + ความชอบลูกค้า) · CASHIER (เคาน์เตอร์ + รับมัดจำ + เลื่อน/ยกเลิก + เบอร์เต็ม) · คลินิกเพิ่ม ASSISTANT · ตัดผม = นวด (`BOOKING_ROLE_PRESETS`)
- **ค่าตั้งเงิน** (กลุ่ม `deposit` `money`) แก้ได้ด้วย `booking.settings.money` · กลุ่ม `privacy` = เจ้าของเท่านั้น (`row()` ใน defs)
- **ข้ามร้าน/ข้ามสาขา/id เดา/token ผิด ⇒ คำตอบเดียวกันทุกไบต์** (X1/X7) — เช่น ลิงก์จัดการนัด (`manageTokenGate`) · หน้าบัตร/ทีวี/ตู้ (`deviceByToken`) · คิวมัดจำ (`SHOP_NF`) · กลุ่ม ("ไม่พบการจองกลุ่มนี้") · ปฏิทิน (`M.NOT_FOUND`)
- ตัวตนลูกค้า: ลิงก์ LINE ที่เซ็น (`bookingIdentityToken`) / รหัสผูกที่ร้านออก (`booking-line-link.ts`) เท่านั้น · ช่อง ONLINE/KIOSK/REMOTE **ไม่ผูก Party/สมาชิกจากเบอร์ที่ไม่ยืนยัน** (มติ B.9) · ยกเว้นมัดจำสมาชิกจากตัวตนยืนยันเท่านั้น (`memberExemptTierForIdentity` · B.8)
- เบอร์โทรบนจอพนักงานซ่อนเลขกลาง (`maskPhone`) เว้นถือ `booking.customer.phoneFull` · ทีวี/หน้าบัตรไม่มีชื่อ/เบอร์ (X8)

## 6. ค่าตั้ง (`src/lib/core/settings/defs/booking.ts` · 84 คีย์ ใน 15 กลุ่ม)
- นับ: คีย์ตรง 74 (`grep -oE 'key:\s*"booking\.[a-zA-Z0-9_.]+"' | sort -u | wc -l`) + ข้อความแม่แบบ 10 (`booking.msg.<kind>` จาก `MSG_KINDS`) = 84 · กลุ่ม: general 5 · staff 6 · service 8 · planner 1 · booking 11 · late 8 · deposit 6 · queue 14 · notify 4 · msg 2+10 · display 3 · kiosk 4 · money 5 · course 3 · privacy 2
- ชั้น (`chain`): UNIT · TENANT · STAFF · SERVICE · RESOURCE (B.13) · DEVICE (B.6) · COURSE · แม่แบบ `BARBER`/`SPA`/`CLINIC` (`hiddenUntil PHASE_CLINIC`) + `_fallback` = พฤติกรรมรุ่นแรก (`FALLBACK_LEGACY`)
- **snapshot ต่อนัด** (`SNAPSHOTS.appointment` 11 คีย์ · CC §1.6): `booking.deposit.{method,amount,payWithinMin,forfeitPct}` · `booking.late.{graceMin,afterGrace,noShowAfterMin,freeChangeBeforeMin,selfRescheduleMax,lateCancelMode}` · `booking.booking.requireConfirm` — ค่าตั้งใหม่ไม่กระทบนัดที่จองแล้ว
- ตรวจข้ามค่า (`GROUP_RULES` 6 กลุ่ม · 8 รหัส): `NO_SHOW_BEFORE_GRACE` · `LEAD_BEYOND_HORIZON` · `DEPOSIT_DEADLINE_REQUIRED` · `REMOTE_WAIT_OVER_CLOSE` · `QUEUE_PREFIX_DUPLICATE` · `PRIORITY_PREFIX_REQUIRED` · `COURSE_POLICY_REQUIRED` · `COMMISSION_RATE_REQUIRED`
- จอแก้ค่า = ทะเบียน (R0.4 `loadSettingsForm` + `SettingsForm`) ที่ `/booking/settings` (UNIT) · `/booking/services?service=` (SERVICE) · `/booking/staff?staff=` (STAFF) · `/booking/devices` (DEVICE) · ค่าแบบตารางแสดงไทย (`tableTh` · รอบแก้ G1 UI)
- **คีย์ที่มีแต่ยังไม่มีโค้ดอ่าน** (grep นอกไฟล์ defs = ว่าง): `booking.course.enabled` · `booking.course.policy` · `booking.msg.courseExpiry` (ไม่ส่ง · `booking-notify.ts` "เฟสคอร์ส") · `booking.money.commissionToPayroll` · `booking.service.durationSource` — คอร์ส = ใบเลื่อน CO.x · ค่าคอมฯ→เงินเดือนตามเส้น POS P3.5 ไม่อ่านคีย์นี้

## 7. กันจองซ้อน · ลำดับล็อก
- **ทางจองเดียว** `service.ts#bookAppointment` (ออนไลน์ · พนักงาน · ปฏิทิน · ลิงก์ waitlist · กลุ่ม) · ลำดับล็อกทั้งระบบ (`resources.ts` หัวไฟล์ §5): idem (`pg_advisory_xact_lock` `booking:idem:*`) → เบอร์ (`booking:phone:*` · เฉพาะ SELF ที่มีเพดาน) → advisory สาขา (`lockUnitTx` · ทางที่ย้ายช่อง) → `BookingStaff FOR UPDATE` (ตาม sortOrder) → `SvcResource` ทั้งสาขา `ORDER BY id FOR UPDATE` → แถวนัด · ห้าม connection ที่สองใต้ล็อก (ค่าตั้งอ่านก่อน tx)
- ด่านว่างของคน + ห้อง = สูตรเดียวกับตัววางคิว (`planner-resources.ts` · `staffSlotClear`) · % ออนไลน์นับเฉพาะช่อง ONLINE · ถือช่องระหว่างรอมัดจำ (`holdUntilOf`) · ห้องเก็บ (`cleanupMin`) นับในช่วงถือ
- ไม่มี EXCLUDE constraint ในตารางนัด (การกันอยู่ที่ล็อก + CAS) — ข้อสอบแข่งข้ามโพรเซส (`qc-booking-race` · b.3 · probe-b13/b14/b15) เป็นตัวยืนยัน

## 8. เงิน · บัญชี
- **มัดจำ** (B.8 · `deposit.ts` + ตัวช่วยใน `service.ts`): วิธี (`booking.deposit.method`) NONE · PROMPTPAY_SLIP (โหมดร้านกดยืนยันทำได้จากคิวมัดจำทุกวิธี) · ยอดจากบริการ/เปอร์เซ็นต์ (`slots.ts#computeDepositSatang`) · หน้าจ่าย = QR พร้อมเพย์ยอดล็อก (`promptpayQrFor`) + แนบสลิป (`submitSlip` ตัวตรวจกลาง R0.6) บนลิงก์จัดการนัด · ไม่จ่ายใน `payWithinMin` ⇒ ปล่อยช่อง (`expireDepositHolds`) · สถานะ 12 แบบ: NONE AWAITING IN_REVIEW UNDERPAID PAID USED FORFEITED REFUND_DUE REFUNDED EXPIRED FORFEIT_PENDING RECORDING
- **ใบรับ** = `PosDeposit` ผ่านฟังก์ชันโมดูล POS (`moduleTakeDeposit` · `moduleForfeitDeposit` · `moduleRefundDeposit` · `moduleDepositForBill` ใน `src/lib/modules/pos/deposit.ts`) · **คีย์ใบรับต่อนัด `booking-deposit-<appointmentId>`** (ทุกทาง: สลิป ∥ ร้านกด ∥ consumer ซ้ำ = ใบรับเดียว) · ใบถูกคืนแล้วรับใหม่ = `booking-deposit-<id>-r<n>` (`service.ts` บรรทัด ~1278) · แถวนัด = ตัวตัดสินเดียว (CAS `depositPaidAt IS NULL` ใต้ `FOR UPDATE`) · GL ตามสัญญา POS P5.1 (ใบรับมัดจำ = หนี้สิน · ริบ = รายได้ · คืน = ใบลดหนี้ — ข้อสอบ b.8)
- **ป้ายต้นทางสลิป** `[slip:<slipId>]` ท้าย `PosDeposit.note` (`service.ts#slipTag/slipOfNote` · B.15 PB-12/13) — ใบรับพกต้นทาง ⇒ วางแผนกลุ่มใหม่ทุกครั้งจากใบจริง · ไม่มีคอลัมน์ใหม่
- **audit เงิน** (`AuditLog` targetType `Appointment`): `booking.deposit.receive` (สลิป) · `booking.deposit.confirm` (ร้าน) · `booking.deposit.recover` (ใบค้างจากทางอื่นถูกผูกตอนลงเงินกลุ่ม) · `booking.deposit.late_money` (เงินเข้าหลังนัดปิด) · **`booking.deposit.slip_after_paid`** (เงินสลิปที่ไม่มีแถวรับ — ครั้งเดียวต่อสลิป · invariant: Σ ใบรับของสลิป + slip_after_paid = เงินสลิป · `deposit.ts#slipAfterPaid`) · `booking.deposit.forfeit` · `booking.deposit.refund`
- **กลุ่ม** (B.15 · `deposit.ts#slipApprovedGroup` · `service.ts#planGroupSlip/bindGroupDeposit`): มัดจำคิดต่อแถว · จ่ายครั้งเดียวผ่านหัวกลุ่ม · ใบรับต่อแถว · จ่ายไม่ครบ ⇒ ไม่มีแถวยืนยันเอง · หมดเวลา = ทั้งกลุ่ม · ริบ = Σ floor ต่อแถว (คำถามเจ้าของ) · หน่วยไม่ผูก POS ⇒ ผูกด้วย saleId null
- **ริบ/คืน**: ไม่มา ⇒ ริบตาม `forfeitPct` snapshot (`forfeitAfterNoShow`) หรือ FORFEIT_PENDING ให้ร้านตัดสิน · ยกเลิกในเวลาฟรี ⇒ REFUND_DUE (ร้านคืนจากคิวมัดจำ) · ยกเลิกช้า = `booking.late.lateCancelMode` BLOCK (ค่าเริ่ม) / FORFEIT · ยกเว้นสมาชิกระดับ (`memberExemptTier`) · ไม่มาซ้ำ ⇒ บังคับมัดจำ (`no-show-rule.ts#forcedDepositSatang`)
- **บิลจากคิว** (B.10 · `finish.ts`): เสร็จงาน = DONE + บิลพักในธุรกรรมเดียว (`completeJobTx` → `serviceBills.openServiceBill(…, tx)` · advisory `bq-bill-<นัด>` · บิลพักผูก `PosHeldCart.serviceJobId`) · ราคาจาก server ล้วน (นัด `priceSatang` snapshot · ราคาเฉพาะคน · ราคาสินค้า POS) · หักมัดจำ `depositForBill` · ค่าคอมฯ ต่อบรรทัด snapshot ตามผู้ให้บริการ (`booking.money.commissionTo/commissionRate` ชั้น UNIT→SERVICE→STAFF → `PosSaleLine.performerEmployeeId` → `staff-commission.ts`) · จ่าย ⇒ `pos.sale.paid {sourceModule BOOKING}` ⇒ `booking.paid` ครั้งเดียว · ร้านไม่เปิด POS ⇒ "รับเงินแล้ว" (`markPaidWithoutPos`) · void บิลจ่ายแล้วฝั่งจองคิว (`voidPaidServiceBill`)

## 9. ข้อสอบที่คุม
- ต่อใบ (`scripts/qc-svc-b.<n>.mts` · 17 ไฟล์ · ผลตอนรับใบ จาก `ledger/SVC-RUN.md` §3): b.0 164/165 · b.1 60/60 · b.2 93/93 (perf p95 ~11 ms) · b.3 75/75 · b.4 86/87 · b.5 51/71 → 60/71 หลัง G1 · b.6 62/72 · b.7 96/103 · b.8 89/94 · b.9 60/62 · b.10 61/64 · b.11 84/95 → 85/95 · b.13 84/87 · b.14 65/70 · b.15 64/65 · b.16 45/46 · b.17 72/73 (ข้อที่ไม่นับ = accept-time SF/S · ภาพ V รอ build · A-* รอเจ้าของ · G regression ที่ตั้งข้าม — ไม่มี failed)
- probe ผู้ตรวจ B (ยิงหลายโพรเซสจริง · `scripts/probe-b<n>-b.mts` · 10 ไฟล์ + child 3): b6 · b7 · b8 30/0 · b9 · b10 27/0 · b13 76/76 · b14 48/48 (deadlock 0) · b15 128/0 · b16 · b17 (RT-2 หนี้)
- regression เดิม: `qc-booking-deposit` · `qc-booking-race` · `qc-booking-hours-hr` · `qc-booking-edit-schedule` · `qc-hr-leave-booking` · `qc-queue-public` · ชุด booking/queue ใน `qc-systems` · smoke `scripts/qc-svc-smoke.mts`
- ฉาก QC (ร้าน svcqc · `scripts/svc-qc-data.mts`): `svc-qc-today-line-scene` (B.5) · `svc-qc-device-scene` (B.6) · `svc-qc-online-scene` (B.7) · `svc-qc-done-pos-scene` (B.10) · `svc-qc-booking-settings-scene` (B.11) · `svc-qc-resource-scene` (B.13) · `svc-qc-calendar-scene` (B.14) · ด่านเต็ม G1 = `qc:all` + ไล่กด 336 โหลด (`ledger/wo-notes/svc-uat-u1-barber.md` §6)

## 10. หนี้ที่รู้ (`ledger/SVC-RUN.md` §3.2 + §4 แถว B.* · `ledger/SVC-OWNER-QUESTIONS.md`)
| ใบ | หนี้ | ระดับ / ปิดใน |
|---|---|---|
| B.8 | คืนส่วนเกินมัดจำยังไม่มี · หน่วยไม่ผูก POS ⇒ บันทึก audit อย่างเดียว · ทางเดี่ยว PB-12 (ใบเงินสดค้างไม่ผูก + สลิปอนุมัติชนคีย์ ⇒ เงินโอนถูกกลืน) | MAJOR หนี้ · B.18 |
| B.10 | เปิดบิลใหม่หลัง void บิลจ่ายแล้วไม่ได้ · สินค้าชุด/สูตร/ชั่งน้ำหนักในแผ่นจบงาน = BAD_INPUT | B.18 |
| B.12 | ตารางทรัพยากรบนมือถือเลื่อนแนวนอนไม่มีตัวบอก · ไม่มีนำเข้า CSV บริการ/พนักงาน/walk-in | m · B.18 |
| B.13 | walk-in ข้ามเที่ยงคืน (A9) · ปุ่ม "มาถึง" = เวลาตอนกด (คำถามเจ้าของ) | คำถามเจ้าของ |
| B.14 | `startJob` ไม่ล็อกด่านโหลด (`loadGate lock:false`) · `strictHours` ข้ามเที่ยงคืน · A-* แก้เวลามาถึงจากปฏิทิน รอเจ้าของ | B.18 / เจ้าของ |
| B.15 | m-1 ผูก/ถอด POS ระหว่างลงเงินสลิปกลุ่ม ⇒ ใบค้างไม่ผูกนัด · m-2 ชื่อบริการลงท้าย `[slip:x]` ⇒ ใบร้านค้าง · `planAndWriteTx`/`setAppointmentStatus` เขียน JSON ทับ (ไม่กระทบเงิน) · m-4 สลิปจบโดยไม่มี audit ⇒ ร้านยืนยันไม่ได้ · ริบกลุ่มปัดลงต่อคน (คำถามเจ้าของ) | m · B.18 |
| B.17 | RT-2 · FIRST ไม่ส่งต่อเมื่อคนถือข้อเสนอออก · ยังไม่มีปุ่ม "ออกจากคิวรอ" บนหน้า (มี `leaveWaitlistAction`) · RL-2 · tick ต่อ entry | MINOR · B.18 |
| B.0 | G-9 `qc-pos-p3.5` ST2 เห็น migration svc_* (ข้อสอบ POS) | หนี้ POS |
| B.11 | `booking.report.view` = planned (ไม่มีรายงานจองคิว) | เฟสเลื่อน RP.x |
| B.1 | `hr/index.ts#staffWindows()` คืน `[]` (กะ HR ยังไม่ต่อ) — เวลาจาก `BookingStaffHours` + เวลาร้าน − ลา | RUN HR |
| B.6 | ไม่มี SSE/เสียงเรียก/พิมพ์บัตรความร้อน (ทีวี/หน้าบัตรรีเฟรชแบบ `AutoRefresh`) · ค่าตั้ง `booking.display.voice`/`kiosk.paperTicket` อ่านแต่ยังไม่มีเสียง/เครื่องพิมพ์ | ใบเลื่อน KT.1 |
| B.15/B.14 | **ไม่มีหน้าจอเลือก "หลายคน" แบบผสมบริการ** — `bookGroup`/`cancelGroup`/`rescheduleGroup` ไม่มีผู้เรียกจากหน้า/action · ทางเข้าคู่รักที่ใช้ได้ = บริการที่ตั้ง `booking.service.staffCount ≥ 2` (ผ่าน `bookAppointment`) · ปฏิทินลากสมาชิกกลุ่ม ⇒ `GROUP` (ปฏิเสธ) · ร้านยกเลิกทั้งกลุ่มจากจอไม่ได้ (ยกเลิกรายคน/ลูกค้ายกเลิกผ่านลิงก์หัวกลุ่ม) | ผู้คุมตัดสิน (B.18) |
| — | คอร์ส (`booking.course.*` · `courseExpiry`) · ค่าคอมฯ→เงินเดือน คีย์ `commissionToPayroll` ไม่มีผู้อ่าน · ไม่มีรายงาน/สถิติจองคิว | ใบเลื่อน CO.x / RP.x |
| — | PDPA J5 ยังไม่ได้คำตอบที่ปรึกษา (ข้อความบริการทาง LINE · อายุข้อมูล walk-in ใช้ค่าปลอดภัย) · ช่องรั่วนอก SVC `member/chat-bridge.ts#cardFieldsFor` (OWNER-QUESTIONS B.16) | เจ้าของ |
