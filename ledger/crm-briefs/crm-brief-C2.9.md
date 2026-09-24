# C2.9 — Business-module events (decision C11) — touches six other modules' state changes
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C2.9". Spec: blueprint §7.2, §9.

## Facts (verified) — only booking and shop emit outbox events today
| module | state change | function | in a transaction today? |
|---|---|---|---|
| ticket | order PAID | `markPaid(ctx, orderId)` `src/lib/modules/ticket/service.ts:322` | NO (plain update, then `pos.createSale` outside) |
| rental | RETURNED | `returnAsset(ctx, bookingId, …)` `rental/service.ts:183` | NO (atomic `updateMany` claim) — there is NO overdue sweep; do not invent one |
| school | enrolled / PAID | `enroll` `:132` (tx) · `markPaid` `:194` (NO tx) | mixed |
| hotel | CHECKED_OUT | `checkOut(tenantId, unitId, reservationId)` `hotel/service.ts:405` | YES (:411) |
| clinic | visit BILLED | `billVisit(ctx, visitId)` `clinic/service.ts:210` | NO |
| queue | served/done | `transition()` `queue/service.ts:271` | YES (:279) |
| booking | completed/no_show | `setAppointmentStatus` `booking/service.ts:718` | YES — already emits `booking.completed/no_show {appointmentId, tenantId, unitId, customerId, serviceId}` |
| shop | PAID | `confirmOrderPaid` `shop/service.ts:200` | emits `shop.order.paid {orderId, unitId, code, customerName, customerPhone, totalSatang, posSaleId, channel}` ⚠️ payload has name+phone |

## Deliverables
- NEW events, emitted INSIDE the same transaction as the state change (where there is no transaction, wrap ONLY the claim `updateMany` + `emitOutbox` in a `$transaction`; the external `pos.createSale` stays outside exactly as today): `ticket.order.paid`, `rental.returned`, `school.enrolled`, `school.completed` (only if a completed state exists — check), `hotel.checked_out`, `clinic.visit.done`, `queue.served`. Payload: ids + `partyId?` + `unitId` + amount in satang where natural. NO names, phones, e-mails, NO clinical data (clinic = "a visit happened" only).
- 3 registries for each; consumers: a no-op base + CRM extra (activity VISIT/PURCHASE through Party, lifecycle CUSTOMER, score hook, optional RENEWAL deal via rules). Add CRM extras to the EXISTING `booking.*` and `shop.order.paid` consumers. Stop relying on `customerName/customerPhone` of `shop.order.paid` inside CRM (read by id); leave that payload as is for its current consumers and record the PII as a debt for the shop module.
- partyId must already be written at creation (C1.1); verify and fix gaps.

## Files you own
the ONE state-change function per module listed above (smallest hunk) · registries · `crm-bridges.ts` business consumers.

## Acceptance (oracle `qc-crm-c2.9`)
CRM-RUN (26): per module — emitted in tx (forced failure after the claim rolls BOTH back), 3 registries, CRM consumer effect.
X4 every consumer twice/parallel → one activity · X8 payload scan: no PII, no clinical fields · compose contract for the extended `booking.*`/`shop.order.paid` consumers · X1 tenant isolation.
Regressions (FULL per module): `qc-ticket-money` `-cancel` `-public` · `qc-rental` `-race` `-refund` `-public` · `qc-school` `-refund` `-public` · `qc-hotel-money` `-refund` `-public` · `qc-clinic` `-refund` `-public` · `qc-queue-public` · `qc-booking-*` · `qc-shop` `qc-shop-refund` · `qc-member-m2.8` · `qc-member-fix-s2` · `qc-automation` · `qc-webhook`.

## Addendum (oracle author) — 24 ก.ย. 2569 · `scripts/qc-crm-c2.9.mts` (47 ข้อ)

Everything below is a **naming/shape decision the oracle had to invent** (nothing in CRM-RUN, the blueprint or this brief fixed it).
Each one is written into the CONTRACT block at the head of `scripts/qc-crm-c2.9.mts` and is what the checks assert.
**oracle-proposed — controller to confirm** (a different ruling ⇒ ORACLE-EDIT the named checks BEFORE the builder starts).

1. **The 8 systems of "8 × 3 = 24"** = the 8 rows of this brief's verified table: ticket · rental · school · hotel · clinic · queue ·
   booking · shop (6 new events + the two that already exist). The kickoff note that named "pos, booking, clinic, school, account,
   member, kanban, chat" does not match the brief, the MASTER-PLAN §6 row or blueprint §7.2 — the brief wins and `pos`/`account`/
   `member`/`kanban`/`chat` are NOT business-event sources in this work order (account/chat/member/kanban bridges are C1.8 · C2.4 · C2.7).
   *oracle-proposed — controller to confirm.*
2. **Event names · keys · payloads** (S1.1–S8.1 · X8.1): `ticket.order.paid` { orderId, unitId, partyId?, eventId, totalSatang } ·
   `rental.returned` { bookingId, unitId, partyId?, assetId, totalSatang } · `school.enrolled` { enrollmentId, unitId, partyId?,
   classId, priceSatang } · `hotel.checked_out` { reservationId, unitId, partyId?, nights, totalSatang } · `clinic.visit.done`
   { visitId, unitId, partyId?, patientId } · `queue.served` { ticketId, unitId, partyId?, typeId, counterId? }. Key = `<type>#<rowId>`
   (R-C.8). The oracle asserts the row id field, `unitId`, the key shape and "no PII value of the run". *oracle-proposed.*
3. **Which state change each event hangs on**: ticket = `markPaid` PENDING→PAID · rental = `returnAsset` PICKED_UP→RETURNED ·
   school = `markPaid` ENROLLED→PAID (R-B: `school.completed` is NOT built; the school event is the PAID one) · hotel = `checkOut`
   CHECKED_IN→CHECKED_OUT · clinic = `billVisit` OPEN→BILLED · queue = **`markDone` CALLED|SERVING→DONE** (not `serve`/SERVING — the
   visit really happened when it is DONE) · booking = `setAppointmentStatus("DONE")` (note: `createAppointment` writes **CONFIRMED**,
   so the pre-state of that check is CONFIRMED, not BOOKED) · shop = `confirmOrderPaid` PENDING_PAYMENT→PAID. *oracle-proposed.*
4. 🔴 **How "emitted inside the same transaction" is PROVEN** — the oracle installs a Postgres trigger on `"OutboxEvent"` that raises
   only for its own throwaway tenant and one event type, runs the state change on a SECOND row, and requires the state change to roll
   back with the failed insert (then drops trigger + function, also in `finally`). No product hook, no injected clock, deterministic;
   it already works against the two existing emitters (`booking.completed` rolls back CONFIRMED→CONFIRMED in the live run).
   *oracle-proposed — controller to confirm that a temporary trigger on a shared QC table is acceptable (it fires for our tenant only
   and the suites are serialised by `with-gate-lock`).*
5. **Where the transaction goes when the function has none** (the brief's rule, made mechanical): wrap ONLY the atomic claim +
   `emitOutbox(tx, …)`; `pos.createSale`, the POS/INVENTORY lookups and the stock cut stay outside exactly as today. S*.2 also checks
   statically that the module writes `emitOutbox(tx, …)` and never `emitOutboxOutsideTx` for these types. *oracle-proposed.*
6. 🔴 **`shop.order.paid` is the one exception and stays a debt**: its emit sits in a tx with the `posSaleId` link, which is a LATER
   statement than the PENDING_PAYMENT→PAID claim ⇒ a crash in between = money taken, no event. The brief says to leave the payload and
   the flow alone, so `C2.9-S8.1` asserts only "the link + the event roll back together" and the gap is recorded here as a **debt of the
   shop module** (owner: the shop module, not C2.9). Its PII payload (customerName/customerPhone) also stays, per R-E.17.
   *oracle-proposed — controller to confirm the debt instead of a fix.*
7. **ONE bridge handler, not eight**: `src/lib/platform/crm-bridges/business.ts` exports `onBusinessEvent(evt)` (R-D owns the file),
   re-exported from `crm-bridges/index.ts`, wired as the CRM extra of all 8 consumers. A per-type table inside it supplies the id field,
   the Thai title and the refType. *oracle-proposed — controller to confirm (the alternative is 8 named handlers like core.ts).*
8. **The CRM writers the bridge calls** (folder rule 6 forbids raw prisma on CRM tables):
   `crm.activities.recordBusinessActivityOnce(ctx, { sourceRef, title, contactId, at, refType?, refId? })` → `{ id, created }`
   (advisory lock on the sourceRef + prior-row check in the same tx — the `createSequenceTaskOnce` pattern) and
   `crm.contacts.markCustomerFromBridge(ctx, { contactId, at })` → number (one conditional `updateMany`). Both audited with
   actorType SYSTEM, both PII-free. *oracle-proposed.*
9. 🔴 **The activity type is `VISIT` and the source is `AUTO` for all 8 events** — `CrmActivityType` has **no PURCHASE** value and
   `CrmActivitySource` has no BUSINESS value, and C2.9 has **no migration** (R-C.1). `C2.9-S0.2` reads `pg_enum` and fails if anybody
   adds one. The blueprint's "activity VISIT/PURCHASE" therefore collapses to VISIT + a Thai title per module.
   *oracle-proposed — controller to confirm (the alternative is a 4th migration, which R-C.1 forbids).*
10. **The dedupe key of the CRM effect is (system, contact, sourceRef) with `sourceRef` = the source row id** — not "have I seen this
    OutboxEvent". That is what makes X4.2 pass: an event delivered before the contact existed writes nothing, and the redelivery after
    the contact appears writes exactly one activity. *oracle-proposed.*
11. **Lifecycle promotion**: LEAD | PROSPECT | CHURNED ⇒ CUSTOMER; CUSTOMER stays CUSTOMER; **LOST is left alone** (a lost contact who
    buys is a judgement call for the shop, and a silent promotion would hide it) — S10.2. *oracle-proposed — controller to confirm.*
12. **No contact ⇒ nothing written** (S10.3): a walk-in whose Party has no CRM contact produces no lead and no orphan activity; the
    event still resolves. Turning transactions into leads stays with C2.4 (chat) / C2.6 (forms) behind their own switches.
    *oracle-proposed — controller to confirm (the alternative is a new `settings.crm.businessToContact` switch, which would be new
    surface in a work order that has no settings page).*
13. **Fan-out rule**: the bridge writes only where the Party really has a contact — it does NOT copy the activity into every CRM system
    of the shop (X1.2). *oracle-proposed.*
14. **`crm.activity.logged` is NOT emitted** for these activities (S10.1) — the source module already announced the business event, and
    C1.8 made the same choice for its own system-written rows (two announcements = two timeline rows). *oracle-proposed.*
15. **Clinic minimalism** (X8.2): the payload carries visitId + patientId + unitId + partyId only — no symptom / diagnosis / allergy /
    drug / dispense / fee field, and the CRM activity carries neither the symptom nor any body text. (CRM-RUN §4's note that clinic rows
    linked to the central Party need a clinic-permission gate is satisfied by carrying no clinical content at all.) *oracle-proposed.*
16. **No UI, no image gate**: mockup 17 is `/settings/integrations`, which RESOLUTIONS R-A gives to **C3.6** — so C2.9 ships no page and
    gate D7 does not apply to it (CRM-RUN's "ภาพ 17" column is the downstream consumer of these events, not a C2.9 deliverable).
    *oracle-proposed — controller to confirm.*
17. **partyId is verified, not fixed** (S9.1–S9.3): the oracle creates all 8 transactions through the modules' own creation functions and
    asserts the Party landed on TicketOrder · RentalBooking · SchoolEnrollment · HotelReservation · ClinicVisit · QueueTicket ·
    Appointment · ShopOrder (+ PatientRecord = the 9th site of R-C.2), that every module goes through `party.safeFindOrCreate` in a
    helper that swallows its own failure, and that the same phone in two modules yields the SAME Party (one CRM contact, two activities).
    In the live run all 9 sites already pass ⇒ **no gap to fix today**; if a later change breaks one, S9.1/S9.2 catch it.
18. **Oracle-side conventions the builder must know**: one `BusinessUnit` (type SHOP) carries all 8 modules — the services scope by
    (tenantId, unitId) and never by `UnitType` · ticket/hotel/clinic fixtures use amount 0 so the POS money line is skipped, while
    rental/school/shop need a POS AppSystem and therefore run `pos.createSale`, **which drains the outbox globally by design** ⇒ every
    effect assertion is "exactly one" after that auto-drain plus the manual redeliveries · the queue ticket is moved to CALLED with a raw
    update (the function under test is `markDone`, not `callNext`) · `--force-run` is the only way to see the fixtures while the bridge
    is absent.
19. **Check ids**: `C2.9-S<1..8>.<1..3>` = the 8 modules × 3 (CRM-RUN's 24) · `C2.9-S9.1–S9.3` = partyId (CRM-RUN's 2, plus the
    cross-module Party proof) · `C2.9-S10.*`, `C2.9-X1.*`, `C2.9-X4.*`, `C2.9-COMPOSE.1`, `C2.9-X8.*`, `C2.9-U.*`, `C2.9-CLEAN`.
    X2/X3/X5/X6/X7/X9/X10 are declared n/a with one line each in the file header.

### Regressions the controller runs with this file (the brief asks for the FULL suite of every module that is opened)
`qc-ticket-money` · `qc-ticket-cancel` · `qc-ticket-public` · `qc-rental` · `qc-rental-race` · `qc-rental-refund` · `qc-rental-public` ·
`qc-school` · `qc-school-refund` · `qc-school-public` · `qc-hotel-money` · `qc-hotel-refund` · `qc-hotel-public` · `qc-clinic` ·
`qc-clinic-refund` · `qc-clinic-public` · `qc-queue-public` · `qc-booking-*` · `qc-shop` · `qc-shop-refund` · `qc-member-m2.8` ·
`qc-member-fix-s2` · `qc-automation` · `qc-webhook` · `qc-cron` · `qc-crm-c1.8` (events · 3 registries · compose) · **`qc-crm-c1.11`**
(the S6.10 gate-first static rule now covers one more bridge file) · `qc-crm-c1.4` · `qc-crm-c1.6` (CrmActivity shape) · `qc-crm-v1` ·
every earlier `qc-crm-c2.*` · `pnpm fitness` in both modes (F13.x event registries · F7.1 doc refs) · `qc-member-m1.9` (30/15/10/5 —
this oracle touches no seeded tenant).

## Controller ruling (24 ก.ย. 2569 · Fable 5.1 · binding — เคาะ addendum 1–19 ก่อน spawn builder)
- **CONFIRMED ทั้ง 19 ข้อ** โดยเฉพาะ: 8 ระบบตาม brief (ticket · rental · school · hotel · clinic · queue · booking · shop — รายชื่อในคำสั่งเริ่มงานของผู้คุมงานผิด ผู้เขียนข้อสอบยึด brief ถูกแล้ว) · กิจกรรมชนิด `VISIT` + source `AUTO` ทั้ง 8 (ไม่มี migration · `S0.2` อ่าน `pg_enum` กันคนเพิ่มค่า) · queue ยิงตอน DONE · booking pre-state CONFIRMED · ไม่มีผู้ติดต่อ = ไม่เขียนอะไร · LOST ไม่ถูกเลื่อนขั้น · ไม่มี UI (mockup 17 = C3.6) · handler เดียว `onBusinessEvent` (ประตูก่อนในตัว handler) + facade writers `recordBusinessActivityOnce` / `markCustomerFromBridge`
- **วิธีพิสูจน์ "emit ใน tx เดียวกัน" ด้วย trigger ชั่วคราวบน `OutboxEvent` (เฉพาะ tenant ของข้อสอบ · ลบใน finally · CLEAN ตรวจ pg_trigger) — ยอมรับ** เฉพาะฐาน QC (ข้อสอบโหลด env QC เท่านั้นอยู่แล้ว) · ห้ามใครยกไปใช้กับ prod
- **หนี้ที่บันทึก (ไม่ใช่ของ C2.9)**: `shop.order.paid` emit หลังคำสั่ง claim PENDING→PAID ⇒ ตายระหว่างนั้น = เงินเข้าแต่ไม่มี event · payload ยังมี PII (R-E.17) → โมดูล shop (C5 audit / handover)
- ถอยหลังบังคับ: ชุดของทั้ง 8 โมดูลตามรายการท้าย addendum + `qc-crm-c1.8` · `qc-crm-c1.4` · `qc-crm-c2.4` (กิจกรรม) · **`qc-crm-c1.11`**
