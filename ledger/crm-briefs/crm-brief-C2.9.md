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
