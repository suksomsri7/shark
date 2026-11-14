# cal-review-b — independent review of CAL1.3 / CAL1.7 / CAL1.8 (server)

Tree `/root/projects/shark-sec-ui` · branch `wip/sec-calendar` · tip `53d1942ce` · reviewer: independent (read-only, nothing committed)
Commits: CAL1.3 `89e8b4925` · CAL1.7 `3e0f2f8f2` · CAL1.8 `53d1942ce`
Ran: `qc-cal-1.3` on the QC DB through iso.sh → 58/58 pass (none of the findings below are covered by it). No live model or Google calls.

Severity: **BLOCKER** = breaks an owner rule (M3/M4) or loses data by design · **MAJOR** = real defect likely in production · **MINOR** = edge case, hardening or policy question. `(uncertain)` = needs a check against real Google or the owner.

---

## BLOCKER

### B1. Personal calendar data reaches the shop owner through secretary-room messages (breaks M4) — CAL1.7
- Where: `src/lib/ai/tools-calendar.ts` `agenda()` (around l.330–370) and `list()`. Visibility comes from `src/lib/ai/conversations.ts:26` (`tenantRooms: role === "OWNER"`) and `conversation-owner.ts:96-99`.
- Scenario: STAFF Nui asks her secretary room "what do I have tomorrow?". `calendar_agenda` returns her Google event titles ("นัดหมอ — ตรวจครรภ์"), personal reminders, her own leave rows ("ลาป่วย · รออนุมัติ" — health data, R-CAL-7), and, if she holds `hr.payroll.read`, the payroll day. The model writes these into its answer, which is stored as an `AiMessage` in her room. Every secretary room in the shop is readable by the OWNER (`tenantRooms`) and by any room member. So the owner reads Nui's private calendar, which is exactly what M4 forbids ("personal data incl. Google events invisible to the shop"). `calendar_list` and the `calendar_add` reply (`title`/`when` in the JSON, which the model often repeats) leak the same way.
- D-B20 says "M4 is not broken (single user)". That is wrong: the conversation has more than one reader.
- The persona line "ไม่ทวนรายละเอียดส่วนตัวในห้องที่มีหลายคน" only asks the model to hold back. It is not enforced, and it cannot work for an agenda question, whose whole answer is the private detail.
- Fix (choose one):
  - (a) Don't put personal or Google content into model text at all. Have `calendar_agenda`/`calendar_list` return counts or opaque ids only, and let the app draw a viewer-filtered card (like `roomReminders`, R-CAL-20).
  - (b) Store calendar-tool turns as messages only their creator can see (exclude them from `tenantRooms`/member sight and from the history fed to other speakers).
  - (c) Offer `calendar_agenda`/`calendar_list` only in a private 1:1 room that has no members, and never in a room the owner can open.
  - Whichever you pick, add a QC check: OWNER sight over a staff room must contain no Google/personal titles.

---

## MAJOR

### M1. Recurring items exported to Google come back as single instances → endless re-export, or the series anchor gets overwritten — CAL1.8
- Where: `google.ts:561` (`singleEvents: "true"`) together with `:574` (`priv.sharkItemId` → `applyRemoteToItem`) and `:507-545`.
- Scenario: a DAILY reminder is exported as one recurring event with `extendedProperties.private.sharkItemId`. On the next incremental sync, `singleEvents=true` returns its *instances*. Each instance inherits the private property but has its own id and etag. For each instance, `e.etag !== r.externalEtag`:
  - (i) If `updated` ≤ `r.updatedAt` (the usual case, because our post-export write bumps `updatedAt`), the code sets `syncDirty: true`. `exportItems` then PATCHes the master again, which creates new changes, which come back as instances on the next run. This repeats every 15 minutes for every exported recurring item, and each round also hits the DB and API once per instance.
  - (ii) If `updated` > `r.updatedAt` (for example, the user moved one instance in Google), `startAt` is overwritten with that *instance's* time. The whole series' anchor moves to an arbitrary occurrence; with several instances, the last one processed wins.
- (uncertain: confirm with a test account how Google reports instance extendedProperties and etags. The QC fake transport does not model instances.)
- Fix: for `sharkItemId` events, use only `recurringEventId == r.externalId` / `e.id == r.externalId`, and ignore instances, or handle them as exceptions. Alternatively, import the export calendar with `singleEvents=false`.

### M2. Deleting in Google never cancels the SHARK item (cancelled events have only `id`) — CAL1.8
- Where: `google.ts:572-588`.
- Google's Events API guarantees only `id` (and `status`) on deleted events. `extendedProperties` is normally missing. So a deleted exported item lands in the generic `status === "cancelled"` branch, which matches only `CalExternalEvent` by `externalId` and finds nothing. The `CalItem` stays OPEN and keeps firing push reminders, even though the user deleted it in Google. The QC fake sends `extendedProperties` on cancelled events, so this is untested. The same applies to booking copies (`sharkRef`).
- Fix: for cancelled events, also look up `CalItem.externalId = e.id` across the user's tenants, and `CalExternalEvent.externalId` where `sharkRef` is not null. Do not depend on `extendedProperties`.

### M3. "Newer wins" compares with `CalItem.updatedAt`, which background jobs also bump → Google-side edits are silently lost — CAL1.8
- Where: `google.ts:523` (`updated <= +r.updatedAt`).
- `updatedAt` is Prisma `@updatedAt`, so *every* write changes it: `calendar.fire` (`lastFiredAt`/`nextFireAt`/`firedOccAt`/`nagAt`/`fireAttempts`/lease), snooze, and `exportItems`' own `syncDirty:false` write.
- Scenario: the user changes a reminder's time in Google at 09:00. At 09:05 the fire job touches the row (lease or nag). At 09:15 the sync sees Google `updated` (09:00) ≤ `updatedAt` (09:05). Our copy "wins" and the next export overwrites the user's edit in Google.
- Fix: add a user-edit timestamp (for example `userEditedAt`, set wherever `version` is incremented) and compare against that.

### M4. Personal adapter: `take: 1000` sorted by oldest first, with no lower bound → new items disappear — CAL1.3
- Where: `agenda.ts:651-655`. The query is `status in [OPEN, DONE]`, `startAt < toEx`, `orderBy startAt asc`, `take 1000`.
- Every finished one-shot reminder stays in the result set forever. Once a user has about 1,000 historical DONE/OPEN items, the 1,000 oldest fill the page and every current or future one-shot reminder and event is missing from the agenda, the month dots and the morning brief. The query also grows with history.
- Fix: `OR: [{ repeat: "NONE", startAt: { gte: from - maxEventSpan } }, { repeat: { not: "NONE" }, status: "OPEN" }]`, or order by `occursAt` within the range.
- Same shape, smaller risk: `accountAdapter` `agenda.ts:241-253` loads *all* overdue docs (no lower bound, oldest first, `take 2000`). A shop with more than 2,000 overdue invoices loses the in-range "due" rows and gets a wrong overdue count. Use a separate `aggregate`/`groupBy` for the overdue total.

### M5. A full sync that never finishes + unbounded per-user work — CAL1.8
- Where: `google.ts:556-604`, `jobs.ts` (`ownBudgetMs: 8000`), `LEASE_MS = 5 min`.
- `singleEvents=true` with no `timeMax` expands open-ended recurring series. More than 20 pages × 250 (`MAX_PAGES`) means `nextSyncToken` never arrives, so `syncToken` is saved as `null` and the next run starts the full sync again, every 15 minutes, forever. Events after the first 5,000 are never imported, and ghosts are never removed (a full sync does not report deletions).
- Each new event costs `updateMany` + `count` (EVENT_CAP check, `:594`) + `create`: about 15k queries per user sync.
- `runGoogleSync` checks the deadline only *between* users. A single sync has no deadline: the dispatcher cuts it off, but it keeps running in the background. If it runs past `LEASE_MS` (5 min), a second sync of the same link can start, which can produce unique-constraint errors or double exports.
- Fix:
  - Put a `timeMax` (for example now + 1 year) on the initial full sync.
  - Keep the page token across runs so a full sync can resume.
  - Check the EVENT_CAP count once per page.
  - Pass the deadline into `syncGoogle` and stop between pages.
  - Make `LEASE_MS` longer than the longest possible run, or renew the lease per page.

### M6. Reconnect / refresh error handling can lock users out — CAL1.8 (partly uncertain)
- `google.ts:255`: reconnecting revokes the *old* refresh token after storing the new one. Google's `/revoke` removes the app's grant for that user, not just one token (uncertain, verify), so the new token may die too → the next sync gets `invalid_grant` → NEEDS_RECONNECT again, in a loop. Safer: do not revoke on reconnect when both tokens belong to the same Google account (same `sub`); revoke only when the account changed.
- `google.ts:245`: Google returns `refresh_token` only on first consent. If the grant still exists (for example, NEEDS_RECONNECT caused by a secret-box key change or the misclassified 400 below), the new code has no refresh token → `bad_code` every time. Either keep the previous refresh token when it is absent and still works, or have the app always request `forceCodeForRefreshToken`/`prompt=consent` (not visible in this tree).
- `google.ts:171-174`: *any* HTTP 400 or 401 on refresh marks the link NEEDS_RECONNECT, including `invalid_client`/`unauthorized_client` caused by a server misconfiguration or a rotated client secret. One bad deploy would push every linked user into "connect again". Fix: trigger NEEDS_RECONNECT only on `invalid_grant`; treat other errors as transient and alert ops.

### M7. Google user data can enter the AI training dataset (Limited Use) — CAL1.7 + CAL1.8
- Where: `src/lib/ai/service.ts:535` `recordSample` (enabled when `SHARK_AI_COLLECT=1`) stores `userText`/`replyText` in `AiTrainingSample` "for self-host training". Once `calendar_agenda` puts Google event titles into the reply, they go into a dataset meant for model training. Google's Limited Use rules forbid using Workspace API data to train generalized AI/ML models. `anonymize()` targets phones and emails, not event titles.
- D-B20 / the verification draft §4.1 discuss sending data *to* the model but not this dataset path.
- Fix: skip `recordSample` for any turn that called `calendar_agenda` (or any tool that touches Google data), or drop google-source items from the tool output entirely, which also helps B1. Write the decision into `google-verification-draft.md`.

---

## MINOR

- **m1** `skills.ts:51-52` + `HAND_TOOL_CORE`: `calendar_add`/`calendar_agenda` are in `CORE_TOOLS`, so they are offered in *every* AI conversation, including legacy non-secretary rooms. `calendarRules` (today's date, the 7-day map, the explicit M3 refusal rule) is added only when `secRoom` (D-B18). In legacy rooms the model has no date anchor; the server still rejects past times, but wrong future dates can slip through. Fix: offer the calendar tools only when `secRoom`, or always inject `calendarRules` when they are offered.
- **m2** `tool-access.ts:107-108`: `calendar_list`/`calendar_agenda` are `OPEN`. `apiKeyHandOk` lets *general API keys* see them, `/api/v1/ai/skills` lists them as usable, and they always fail at run time (`calActorOf` → member only). This breaks the "offered = usable" rule from G1. Fix: mark them `writesNow`, or add a member-only rule.
- **m3** `tools-calendar.ts update()`: `calendar_update` can turn a one-shot reminder into DAILY/WEEKLY/MONTHLY right away. This skips the R-CAL-28 rule that repeating reminders created from chat become a DRAFT the user confirms. Fix: if the chat changes `repeat` from NONE to repeating, move the item to DRAFT or require `confirm`.
- **m4** Prompt injection: anyone can put text into the user's Google calendar by sending an invite, and in S1.22 rooms customer text is in the prompt. `calendar_agenda` passes Google titles to the model as plain strings, in turns where write-now tools (`kb_auto_save`, which writes the shop's knowledge base used by customer-facing AI, and `calendar_cancel`) are available. Only `DATA_NOT_COMMAND_RULE` protects this. Fix: tag google items as untrusted in the tool JSON (for example `"untrusted": true`, and quote the titles), or leave Google titles out of AI output (see B1/M7).
- **m5** `google.ts:618-639`: `syncGoogle` reads `link.calendars` before the lease and writes that snapshot back at the end. An `updateGoogle` that turns import off during a sync is reverted: the cache is already deleted, but `import: true` and the old syncToken are restored, so incremental sync continues on an empty cache. Fix: re-read and merge only `syncToken`/`lastSyncAt` per calendar id.
- **m6** PDPA / policy: `exportBookings` puts `<service> · <customerName>` of the shop's customers into the staff member's *personal* Google (R-CAL-37). The shop, which is the data controller, cannot turn this off. Copies stay behind after account deletion (`revokeGoogleForDeletion` only revokes, it does not delete copies) or when the link is NEEDS_RECONNECT while the membership is removed. `myAppointments` also ignores unit-access loss and booking module OFF (`google.ts:~400`). Suggest a shop-level switch, plus deleting copies before revoking on account deletion. (Owner decision.)
- **m7** `disconnectGoogle`/`updateGoogle` → `deleteCopies` makes up to 1000 × tenants sequential Google DELETE calls (15 s timeout each) inside the HTTP request, with no deadline. Move this to a background step (`after()`), with a cap.
- **m8** (uncertain) Tax rows:
  - PND3/53: the existence check counts `WHT_CERT IN` with `voidedAt null` but does not filter `status`, so DRAFT certificates would make the row appear.
  - PND1/SSO: matched on payroll `periodKey`. If `payDate` falls in the following month, the legal filing month follows the payment month, so the deadline is a month later than shown.
  - The tax dates themselves are correct: 15/23 for PP30 and 7/15 for PND3/53/PND1 inside the extension window that runs to 31 Jan 2570 (2027), SSO on the 15th, and Thai-midnight day boundaries.
- **m9** `google.ts:594`: one `count` per new event (N+1) — see M5.
- **m10** `taxAdapter` and `agendaFor` run `accountSettings.findFirst`/`count`/`findFirst` per deadline per system, and `isOff` once per module. Fine at today's sizes. The morning brief runs `agendaFor` once per user, roughly 15–25 queries each, so watch the job budget once shops have more than about 100 users.

---

## Checked and found clean
- **M3 structure (CAL1.3 + CAL1.7):**
  - Every `CalItem/CalPref/CalLink/CalExternalEvent` query has `userId: actor.userId`.
  - No exported agenda or tool function takes a userId.
  - The tool schemas have no recipient or user parameter and use `additionalProperties:false`.
  - `calActorOf` accepts members only and requires `actor.tenantId === ctx.tenantId`.
  - The update/cancel/confirm paths go through `items.*`, which scopes by actor.
  - The persona refusal rule for reminding others is present.
- **Tenant isolation:** shop adapters use `tenantDb` with tenant + system/unit filters. Google tables are global per user by design (§2.4).
- **Permission filters per adapter, compared with each web module:**
  - booking: `canAccessUnit` + the same keys as `lineAccess.view`; otherwise only my `BookingStaff`; Q1 note added.
  - account: `account.doc.view` through `membershipCanAccount` (the same gate as the documents page; account is tenant-level).
  - kanban: `visibleBoardsWhere`, plus assignee is me, plus `boardRole` for `checkable`.
  - CRM: `activityWhere`, plus `ownerUserId = me`, plus `crmCan(complete)`; v1 systems skipped.
  - HR: payroll only with `canViewPayroll` (MANAGER excluded); leave = own employee only.
  - dorm: `dorm.view` per unit, the same gate as the billing page.
  - ticket: unit access, plus OWNER/MANAGER or any `ticket.event.*` key.
  - tax: `account.tax.view` / `account.wht.manage` / `canViewPayroll`.
- **`completeSourceItem`:** another user's card or activity is NOT_FOUND (assignee/owner filter plus visibility). Kanban `completeCard` → `assertCardRole(EDITOR)`. CRM requires `crm.activity.complete`, and `completeActivity` checks again. Secretary level OFF → NOT_FOUND. The route maps BLOCKED/NO_DONE_COLUMN.
- **Secretary level OFF:** shop sources are cut with a SECTION_OFF note; personal and Google items are never cut (Q2). The tax row is cut by its source module's OFF.
- **Date boundaries:** Thai-day boundaries for `@db.Date` and timestamp columns (account `dueDate`, dorm, leave, payroll `payDate`) work for both storage kinds. Tax deadline table and extension window are correct.
- **Badge:** count queries only, tenant+user cache, pref/OFF respected, cleared on source-done.
- **Server-side time validation in tools:** strict ISO with only +07:00 or Z, impossible dates rejected, `inMinutes` bounded, past times rejected by `createItem`, MONTHLY 29–31 handled, link ids re-checked by the source filters (R-CAL-23).
- **Customer-facing AI:** calendar tools run only for `kind:"member"` actors; system/apiKey actors get an error string and no data. The `writesNow` rule blocks API keys from add/update/cancel.
- **OAuth:**
  - The code is exchanged server-side with the server's own client secret, so a code issued to another client cannot be used.
  - The route uses `userGate` with a bearer token: no cookie CSRF surface, and the code is bound to the authenticated user.
  - `id_token` is used only for the display email.
  - Scopes are checked and a partial grant is revoked.
  - Tokens are sealed with AAD `cal:<userId>:<linkId>` and are never in the DTO or logs.
  - Disconnect deletes copies, revokes, cascades the cache and clears `externalId`. Account deletion revokes first and then deletes the rows.
  - Rate limits: connect 5/min, put 30/min, sync once per 120 s.
- **Sync:** a 410 clears the calendar cache and runs a full resync (bounded to 2 attempts). All-day dates use Thai midnight with an exclusive end. Export uses Asia/Bangkok and BYSETPOS=-1 for month-end. Booking copies are written over from the shop side. `sharkRef` copies are hidden from the agenda.

---

## Review response (lane b · 15 Nov 2569 · commit `694d49e49` on `wip/cal-b`)

All findings are fixed in `694d49e49`. Contract §15.2 has the details (D-B28…D-B39). Migration `20261228000400_calendar_b` is applied to the secretary QC DB only.

| Finding | Fix | Test |
|---|---|---|
| B1 | Calendar tools return only ids, status and counts (no titles, times, notes, leave, payroll or Google). Details are shown in viewer-only cards: `reminders` plus the new `CalRoomCard` → `calendarCards` on GET rooms/[id]. The persona says "ตั้งให้แล้ว/มี N รายการ ดูการ์ดด้านล่าง". Edit/cancel use `match`, resolved on the server (`ambiguous` never names items). **App change needed (lane c), see below.** | qc-cal-1.7 T4-1, T5-1, T5-3, T8-3, T8-7, T9-1, T9-2, T11-3 |
| B1 / owner default | Google data never reaches the model, not even as counts | T11-1 |
| M7 | `recordSample` is skipped when any `calendar_*` tool ran in the turn (`turnTouchesCalendar`). The decision is recorded in google-verification-draft.md §4.1. | T11-2, T11-4; positive control T11-5 |
| M1 | Two streams: display (`singleEvents=true`; skips everything that is ours, by extendedProperties or by id/recurringEventId) and master (`singleEvents=false`, export calendar). An instance never overwrites a series. | qc-cal-1.8 G6b-1…4 (fake now expands instances with `recurringEventId`) |
| M2 | The master stream matches by the stored `CalItem.externalId` and by `sharkRef` rows. A deleted event carrying only id/status cancels the item, or re-creates the booking copy. | G6-2, G7-2b (fake sends only `{id,status}` for deleted events) |
| M3 | `CalItem.userEditedAt` is set by every user write and by the Google write-back, and newer-wins compares against it | G6c-1, G6c-2 |
| M4 | Personal adapter: one-shot items only in the requested range (minus 14 days); repeating items only when OPEN. Account: only docs in the range, plus an overdue `aggregate`. | qc-cal-1.3 S1-14 (1,050 old DONE rows); S1-3/S1-4 still green |
| M5 | Windowed full sync (timeMin/timeMax). At most 8 pages per stream per run, with `pageToken` resume. Deadline passed into `syncGoogle`. Lease 10 min, renewed per page. One query per page plus `createMany`. | G4-1, G14-1…3 |
| M6 | NEEDS_RECONNECT only on `invalid_grant`; other refresh errors are transient + ops ERROR. Reconnecting the same account (sub/email) does not revoke. A missing refresh_token keeps the old one. A different account revokes the old grant and clears cache/state. | G9-4, G9-4b, G9-4c, G9-4d, G9-2 |
| m1 | Calendar tools sit in skill `calendar` and are offered only in secretary rooms (`CALENDAR_ROOM_CORE` on the first round). Rules are added to the prompt only when the tools are offered. | T2-3, T3-1, T11-3, T11-6 |
| m2 | `HandRule.memberOnly`: API keys and system actors are denied and the tools are not offered | T2-5 |
| m3 | A chat update from one-shot to repeating creates a new DRAFT and cancels the old item | T5-4 |
| m4 | Moot: Google content never reaches the model | T11-1 |
| m5 | Sync results are merged per calendar id into a freshly read list | G15-1 |
| m6 | Booking export is still off by default (Q9). It respects `canAccessUnit` and booking OFF. Account deletion deletes copies before revoking. PDPA note added (D-B38); a shop-level switch is still an owner decision. | G7-4, G7-5 |
| m7 | `updateGoogle` makes no Google calls: it marks items `syncDirty` and the sync moves/deletes copies (`externalCalendarId`). Disconnect/deletion copy removal is bounded (8 s, 6 in parallel). | G7-3, G16-1 |
| m8 | WHT certificates in DRAFT/VOIDED/CANCELLED are not counted. PND1/SSO follow the payment month (payDate), per shark-thai-law common-withholding-tax §8 :68/:129. | qc-cal-1.3 S1-9, S1-12, S1-13 |
| m9 | Fixed together with M5 | — |
| m10 | Not changed (noted) | — |

Also fixed: a qc-cal-1.8 G7-3 typo had a string in the condition position, so the check always passed; it is now asserted for real.

### App change needed for B1 (lane c)
`GET /api/mobile/secretary/rooms/[id]` now also returns `calendarCards: { id, kind: "AGENDA" | "LIST", fromDay: "YYYY-MM-DD", toDay: "YYYY-MM-DD", createdAt }[]`. This list contains only the caller's own cards.
1. In `RoomView`, place each card in the timeline by `createdAt`, the same way as `reminders`.
2. AGENDA: render the viewer's own `GET calendar/agenda?from=fromDay&to=toDay`, in the day-list style of screen 3, with a "เปิดในปฏิทิน ›" link to `/secretary/calendar?day=fromDay`.
3. LIST: render `GET calendar/items?tab=today` + `tab=upcoming`, in the style of the "เตือนฉัน" tab.
4. Other room members, and an OWNER viewing a staff room, get no card from the server and must see nothing.
5. The DRAFT confirmation text ("ตั้งเป็นเตือนประจำ ทุกวันจันทร์ 09:00 ใช่ไหมครับ") must come from the ReminderCard (§9.3). The model no longer says it.
6. Add `calendarCards` to the `RoomDetail` type in `apps/mobile/src/api/secretary.ts`. I have not touched `apps/mobile`.
