# C1.8 — Events (phase-C1 set) + consumers + bridges
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C1.8". Spec: blueprint §7.1, §7.2, §9, decisions C11, C12.

## Facts
- Consumer map: `src/lib/outbox-consumers.ts` (83 keys). Wrappers `compose(base, extra)`, `withAutomation`, `withWebhooks` were reworked in the member fix-run: base and extras always run; an extra's failure is WARN only; webhooks fire on the first attempt only. Read them before adding anything.
- Exists today: `crm.deal.won` emitted in `moveDeal` tx with PII in the payload (`name, phone, email`) and consumed by `onCrmDealWon` in `src/lib/member-bridges.ts`. `forms/service.ts` calls `createContact` directly (first CRM system found) and stores `FormSubmission.crmContactId`.
- Available events to listen to: `forms.submission.received`, `chat.message.received`, `chat.conversation.status`, `account.quotation.responded`, `account.document.issued`, `account.invoice.paid`, `account.payment.recorded`, `account.document.voided`, `pos.sale.paid/voided`, `booking.completed/no_show`, `shop.order.paid`, `member.created/updated/merged/tier.changed`, `kanban.card.completed`, `approval.request.approved/rejected`. NOT existing (do not register consumers for them here): ticket/rental/school/hotel/clinic/queue events, `hr.payroll.paid`, `inventory.item.updated`.

## Deliverables
- Emit every C1-phase event of §7.1 from the services of C1.2b–C1.6 (contacts, companies, deals incl. stage.changed/won/lost/reopened/reassigned/updated, activities, custom.record.*, team.updated) — ids only, `systemId`, `unitId?`, idempotencyKey `crm.<type>#<id>#<seq>`. Clean the `crm.deal.won` payload (remove name/phone/email) and make `onCrmDealWon` load what it needs from the DB by id — `qc-member-fix-s2` and `qc-member-m2.8` must stay green.
- `src/lib/platform/crm-bridges.ts` (inbound consumers) and `crm-outbound.ts` (notifications placeholder: in-app only in this work order): forms → lead in `FormDef`'s CRM system (until C2.0 adds `crmSystemId`, resolve: form's own setting if present else first CRM system — behind one function so C2.6 swaps it) replacing the direct call; chat message → link Party → existing contact or (if `settings.crm.chatToLead`) new lead; quotation responded → move stage per pipeline setting; document issued → `invoiceDocId`; member.* → link `memberCustomerId`/tier badge; kanban completed (from C1.6); approval approved/rejected → `crm.discount`/`crm.reassign`.
- Every consumer honours `settings.crm.bridgesEnabled` (false ⇒ no-op) and writes ONE `MemberActivity` row per event (partyId + crm ids) through `member` facade `recordOnce`-style idempotency.
- All new event types in the registries (exactly one of AUTOMATION_EVENTS / WEBHOOK_EVENTS declares each).

## Files you own
`src/lib/platform/crm-bridges.ts`, `crm-outbound.ts` (new) · the crm entries in `src/lib/outbox-consumers.ts` · label registries · emit sites inside crm services · `src/lib/member-bridges.ts#onCrmDealWon` (payload change only) · `src/lib/modules/forms/service.ts` (remove the direct call; keep `crmContactId` written by the consumer).

## Acceptance (oracle `qc-crm-c1.8`)
CRM-RUN S1–S7 (28).
X4 — EVERY consumer added here: same event processed twice and twice in parallel ⇒ one lead / one activity / one stage move / one timeline row (flag-first under advisory lock, then write) · compose contract: make the CRM extra throw ⇒ base result unchanged, event not failed by the extra; make the base throw ⇒ CRM extra still ran · X8 payload scan: no phone/e-mail/name in any `crm.*` event row written during the oracle · X1 form of tenant A never creates a lead in tenant B/system B; chat contact of another tenant ignored · X3 two identical form submissions in parallel (same e-mail) → one contact + two activities.
Regressions: `qc-member-m2.8`, `qc-member-fix-s2`, `qc-form`, `qc-forms-notify`, `qc-chat-member-autolink`, `qc-chat-core-v2`, `qc-automation`, `qc-webhook`, `qc-account-api-webhooks`, `qc-kanban-k3.3`, `qc-approval-wiring`.

## Controller addendum (19 Sep · oracle `qc-crm-c1.8` 81 checks)
The CONTRACT BLOCK in the oracle header is the API. Rulings — binding:
1. **Forms at uiVersion 1 keep the v1 lead** (every production shop is v1 — form→lead must not stop at deploy). Only the v2 behaviour (dedupe by e-mail/phone, one activity per submission, UTM) is gated to uiVersion 2. All other bridges are gated (R-E.14).
2. `qc-form` FM-3.3 / `qc-forms-notify` FN-4 read the contact without draining: if they go red because the lead now comes from the consumer, REPORT them — the controller ORACLE-EDITs (add `drainAll()` before the read) with evidence.
3. Owned files also: `src/lib/approval-effects.ts` (`crm.*` branch only — move the discount effect into a compose EXTRA so it runs when the notification step throws and never fails the event) · `crm/contacts.ts` (`briefFor(ctx, actor, key)` only) · `crm/settings.ts` (`chatToLead: false` default).
4. `crm.reassign` resolves only (effect = C3.2). 5. `custom.record.created` uiVersion gate stays in C1.8.
6. Not in this WO (debts): tier badge = live read (no column) · AccountContact name/taxId sync on `crm.company.updated` → **C2.7** · `onCrmDealWon` raw CRM reads → **C5** · pre-existing: `member.created` redelivery adds duplicate WELCOME `MemberNotification` rows (eventId dedupe in `notifications.send` fails) → **C5** (member side, recorded).
Every event consumer: flag-first under an advisory lock, compose extra, ids-only payloads.
