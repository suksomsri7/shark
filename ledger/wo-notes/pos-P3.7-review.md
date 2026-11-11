## R1 — P3.7 S @ 6b357188 (product fb014de2 · base 42b823e9)
**VERDICT: MERGEABLE-AFTER-FIXES** (1 Med (= hunter N1) + 2 Low; boundary, switches, at-most-once, pins and ORACLE-EDITs are clean)
- **F1 Med** `pos/chat-tag.ts:30–49` + `order.ts:1772`: one tag links any number of preorders for 24 h. Repro: a customer types "เมนู", gets `/q/<link>?c=<tag>` and posts it publicly. Every stranger who orders through it is bound to that customer's room. R6 status messages, R5 receipt (`/r/` link) and bot STATUS (`/q/o/` link → `qr-order.ts:740–741` customerName + masked phone + lines) then go to the tag holder. Smallest fix: make the tag single-use. Add a signed random nonce to the tag body and write it into the `received` event payload. In `ingestPreorderInTx`, a nonce that is already on a PosOrderEvent ⇒ order placed unlinked. No migration.
- **F2 Low** `order.ts:2177` replay branch checks `PENDING_PAYMENT ∧ payment_requested` but not `status`. Reject or expiry leaves paymentState PENDING_PAYMENT ⇒ a re-request on a REJECTED or CANCELLED order returns `ok:true, duplicated` with the dead intent. Also `pos-chat-bridges.ts:203` sends `sent: n.ok`, so a duplicate whose first row FAILED reports `sent:true` (staff chip "แจ้งในแชทแล้ว" is wrong). Fix: add `o.status === "NEW"` to the branch. Have the seam's duplicate result carry the earlier row's deliveryStatus, and set `sent = ok ∧ status SENT`.
- **F3 Low** `chat/pos-seam.ts:96–101`: the dedupe is unique per conversation, but member/party targets go to "the contact's latest conversation" (no unique on contactId; with >1 LINE contact, `lastSeenAt` decides). A `pos.sale.paid` retry (base fails ⇒ compose re-runs the extra) after a new room or contact appears ⇒ a second receipt. Fix: in the seam, before insert, `findFirst {tenantId, clientMessageId: key, meta.source "pos"}` across conversations ⇒ duplicated.
Verified OK per ruling:
- 1: `setPosChatSettings` actor.role === "OWNER" (`chat-link.ts:66`), FOR UPDATE + jsonb_set of `pos.chat` only, audit `pos.settings.updated` only when changed. Door A = `pos.sale.create ∧ pos.order.accept` evaluated at ctx.unit, and the order lookup is bound to that unit (`chat-order.ts:59–63`).
- 2: row first, then send outside the tx (`pos-seam.ts:114–153`). P2002 ⇒ duplicated, no send. Only a send throw leaves a FAILED row (+ DELIVERY_FAILED). NO_* / BLOCKED write no row (CD-P4). No retry.
- 3: door A block in `order.ts:2160–2198` (FOR UPDATE, touch CAS, `payment_requested`). Door B lines are inline-marked with no arrows. Channel stays QR_ORDER. HMAC is under SESSION_SECRET with namespace `pos-chat-tag:v1`.
- 4: every switch is off by default (`chat-link-shared.ts:24–31`). The consumers return before any chat read when the switch is off. Quota text is in th.
- 5: bot intents are STATUS/ORDER/HUMAN only, no LLM. `ordersForChatCustomer` and `notifyCustomer` are exported for P3.9.
- 6: fixed th/en tables, chosen by `ChatContact.lang`. th/en key sets are equal (29/29) and the en values contain no Thai (probe).
- 7, 11, 13: no points or memberId on order bills. Shape is S only.
- 8: Q8 issue-ack goes through `notifyCustomer` with key `pos:issue-ack:<id>` (`pos-receipt-bridges.ts:68–70`).
- 9 (seam): imports only `./db ./adapter ./service`, every where binds tenantId, every function try/catch, never throws. `chat/index.ts` gets one appended block.
- 9 (root/POS): root imports only module indexes + core/{audit,db,ops,rate-limit-db}. `modules/pos` has no chat import and no ChatContact/ChatMessage read (order.ts only reads ChatConversation to check it is tenant-local).
- 9 (writers): ChatMessage and ChatConversation are written only in the seam. PosOrder* is written only in `order.ts`. New POS files are `chat-*.ts` (no `receipt*`).
- 10: `:720` is a 1-for-1 outermost wrap of the 42b823e9 expression (hf-fu ST1 safe). The other hunks are compose extras on refunded / intent_paid / accepted / ready / rejected / cancelled / chat.message.received, plus a hoisted `posChat()`.
- 10 (untouched): no hunk in service.ts, payment-intent.ts, register*.ts, shift.ts or prisma/; createSale, voidSale and refundSale untouched.
- R5: PAID · SALE · POS · >0 · VOIDED skip. Order target beats member. A member is reached on LINE only (CD-P1). Consent `granted false` ⇒ skip, null passes, a read error fails closed. Audit `auto_sent` is SYSTEM and written on the first SENT only. The 5/24 h counter counts `pos.receipt.sent` only. No WARN for NO_CHAT_IDENTITY (CD-B2).
- R6: kinds come from statusKinds; rejected/cancelled/expired share key `cancelled`. The refund line is sent only with a `refund_needed` row. "paid" is sent only when a `paid` event exists for that intent. PLATFORM orders are never messaged.
- R9: gates run in the brief's order (autoReply → TEXT → LINE/WEBCHAT → no assignee → no staff OUT in 30 min → pause → 1 reply/20 s + 30/day). Reply key `pos:bot:<inboundId>`. Bot rows have senderUserId null and emit no `chat.message.sent`; the room denorm touches lastMessage* only.
- R10: bodies carry code, amount, time and link only. Ops detail = kind/code/ref id.
- CD-P3: `deps {send, notify, now}` on all 5 consumers + requestChatPayment.
- ORACLE-EDITs (47d9d3ea, 72029e1b, ad587ca7, 2292a191, fb014de2): each is its own `test(pos)` commit, minimal (1–5 lines), and the counts match what was reported.

## Hunter — CO block
**HUNTER: N1 Med pos/chat-tag.ts:30–49 (+order.ts:1772)** — attack: the tag is multi-use for 24 h and is re-minted on demand (bot ORDER answers in any room when autoReply is on). The holder broadcasts the tagged shop link → strangers' preorders are bound to the holder's room → effect: the holder receives status, paid and receipt messages and `/q/o/` links showing the victims' names, masked phones and items, plus bot STATUS listings. Fix: single-use nonce (F1).
**N2 Low order.ts:2177** — duplicate branch ignores status: a re-request after reject or expiry returns ok/duplicated with a cancelled or expired intent. No money effect: P2002 stops any second message and the intent idempotency key `posorder-pay-<orderId>` stops a second intent. Fix F2.
Probed OK:
- (1) CAS: requestChatPaymentInTx holds FOR UPDATE and reads fresh. accept/reject read `o` stale but `transition` CASes on status+version ⇒ OrderRaced ⇒ ORDER_STATE_CHANGED.
- (1) accept on PENDING_PAYMENT ⇒ ORDER_UNPAID (`order.ts:519`). payOrder needs ACCEPTED+ and UNPAID/PAY_ON_PICKUP, which door A's states never meet ⇒ no PAID twice and no PAID + REJECTED.
- (1) Replay: same intent and token. Concurrent requests: both prepare, the loser gets duplicated ⇒ `orderIntentUnused(DUPLICATE)`, and the createIntentForOrderInTx key allows only one intent row.
- (1) Reject cancels the intent in the same tx ⇒ a late payment goes to INTENT_CANCELLED/refund_needed. Expiry: the sweeper and the lazy status read are channel-agnostic ⇒ paid after payBy ⇒ late_payment + refund_needed (`order.ts:1939–1951`).
- (2) Tag: HMAC over tenantId|linkToken|conversationId|exp. Probes: tampered body, flipped MAC tail, other tenant, other link, expired at 24 h + 1 ms, garbage, missing SESSION_SECRET ⇒ all null. ingest also re-checks the conversation is tenant-local. A bad tag ⇒ order placed unlinked, same response shape, no leak.
- (3) publicToken: 12 Crockford chars from randomBytes (60 bits), looked up by unique index only, reused if present. Not invalidated on cancel (P2.7 design: the page shows the closed state); a token-equality index lookup leaks no timing worth exploiting.
- (4) Permission: both keys evaluated at ctx.unit and the order must be in that unit. Refusals carry code + message + messageKey only, no amounts.
- (5) HUMAN ⇒ only `setBotPaused` (meta key). ORDER ⇒ reads + pure `mintChatTag`. STATUS ⇒ read-only. The only other writes are rate buckets and the reply row.

## Controller rulings (account A · 17 Oct 07:0xZ)
- F1 Med (= hunter N1) tag multi-use 24 h ⇒ strangers' preorders bound to the tag holder's room (PII via status/receipt/`/q/o/`) → **FIX**: single-use signed nonce in the tag, recorded in the `received` event payload; reused nonce ⇒ order placed unlinked.
- F2 Low replay branch ignores `status` + `sent` flag wrong on FAILED duplicate → **FIX** (`status === "NEW"` · `sent = ok ∧ SENT`).
- F3 Low seam dedupe per conversation only → **FIX** (findFirst by clientMessageId across conversations ⇒ duplicated).
- Fix round 2 sent to the builder on **tree f** (d taken by P3.8 fix round 2; node_modules ro bind — no generate; P3.7 has no schema change).
