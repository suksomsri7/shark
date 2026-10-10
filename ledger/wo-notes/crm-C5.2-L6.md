# C5.2 HUNTER — lens L6: UI/UX & BUSINESS CORRECTNESS (read-only hunt · 28 Sep 2026 · Opus 5.5 · main `1576edcb`)

Scope: blueprint `docs/modules/20-crm-v2.md` §11 (all sub-sections), user stories §1.4/§13, cross-surface consistency, Thai-specific handling, time zone, 390 px, copy, notifications, v1 untouched.
Method: traced code end to end. Then ran two probes: a runtime probe on QC2 with a throwaway tenant `qc-hunt-l6-bqqqcqqq` (deleted, `tenantsLeft 0 usersLeft 0`) and a read-only look at QC1 in headless chromium (GET only, 1 session row minted and deleted, `sessionsLeft 0`, 4 screenshots).
Not repeated: L1/L2/L3/L4/L5, C4.3 §8, C4.2/C4.4 notes.

**Counts: BLOCKER 0 · MAJOR 5 · MINOR 11** (MAJOR: 4 confirmed at runtime, 1 confirmed by exhaustive grep plus a screenshot)

Probes (in `scripts/pending/hunt-l6/`):
- `probe-l6.mts` + `probe-l6.log`: QC2, P1–P7
- `probe-collation.mts`: QC2, read-only
- `look-l6.mts` + `look-l6.log`: QC1, read-only. Results are in `.qc-shots/hunt-l6/look-l6.json`, plus `company360-won-390.png` · `deals-new-390.png` · `deal360-390.png` · `notif-settings-390.png`.

---

## MAJOR

### L6-M1 · The stage-requirements dialog cannot satisfy any custom field that is not plain text — CONFIRMED (probe P2)
- **Where:**
  - `src/app/app/sys/[id]/crm/deals/_components/DealMoveDialogs.tsx:152,213-224`: every missing custom key is rendered as `<input type="text">` and sent as a string.
  - `deals.ts:538-553` `splitRequireValues` passes the strings straight to the field engine.
  - `member/fields.ts:603-657` validates by type (`z.number()`, `z.boolean()`, `z.array()`, and SELECT by option **value**).
- **Scenario (QC2):** a deal field "งบประมาณ" of type NUMBER and a field "ประเภทลูกค้า" of type SELECT (the designer auto-names the values `option` / `option_2`). Stage "เสนอราคา" requires both.
  - Staff drag a deal in → the dialog opens.
  - Typing `50000` → `VALIDATION ค่าของฟิลด์ "งบประมาณ" ต้องเป็นตัวเลข`. The user typed a number and is told it is not one.
  - Typing the label `โรงงาน` → `ค่า "โรงงาน" ไม่อยู่ในตัวเลือก … — เลือกได้ option / option_2`, which leaks internal codes.
  - The control test with typed values (`50000`, `"option"`) passes.
  - The same failure applies to MONEY, BOOLEAN and MULTI_SELECT (the message says "ส่งเป็น array"). DATE and DATETIME only pass if the user types ISO text by hand.
- **Effect:** §11.3 says "UI เปิดโมดัลกรอกแล้วย้ายต่อ", but this works only for TEXT fields. For any other type the drag is always refused. The only workaround is to open the deal, fill the field in the custom-field panel, then drag again, and nothing tells the user to do that.
- **Why oracles miss it:** C1.5-S2.3 uses the TEXT field `qcBudget` only (`qc-crm-c1.5.mts:599,707`). The C4.2 button runner does not submit the dialog with typed fields.
- **Fix:** send `fieldLayout` (type + choices) to `DealMoveDialogs`. Render by type, reusing the custom-field inputs used on the deal 360 (select, number, date, checkbox). As a server-side safety net, coerce strings by field type in `splitRequireValues` (the same approach as `objects.ts coerceCsv`).

### L6-M2 · Archiving a deal field that a stage requires blocks that stage for every deal, including deals that already hold the value — CONFIRMED (probe P3)
- **Where:**
  - `objects-actions.ts:277` → `member/fields.ts:1284 archiveField`: no check for use in `CrmStage.requireFields`.
  - `deals.ts:570-573` `missingFor` reads values with `getFieldValues`, which filters `archivedAt: null` (`fields.ts:1377`, `:2075`). An archived field therefore always looks blank.
  - `fields.ts` setFieldValues refuses archived fields.
  - `pipelines.ts:118-135` `cleanRequireFields` rejects keys that are no longer in the layout.
- **Scenario (QC2):** a deal already had `qcAmt = 50000` stored (the stored row is still there after archiving). Owner archives the field "งบประมาณ". Then:
  - Moving into "เสนอราคา" → `STAGE_REQUIREMENTS … ต้องมีข้อมูลนี้ก่อน: qcAmt`. This shows the raw key, because the label comes from the layout, which no longer has the field.
  - Supplying a value → `ฟิลด์ "งบประมาณ" ถูกเก็บเข้าคลังไว้ … กู้คืนฟิลด์ก่อน`.
  - Saving the stage with its current requirement list → `ไม่พบฟิลด์ของดีลชื่ออ้างอิง "qcAmt"`.
- **Effect:** if the stage is a WON stage or the "ตกลง" stage used by quote acceptance, deals silently stop flowing. Auto-moves from bridges only log a WARN (`deals.ts:2112`).
- **Why oracles miss it:** no oracle archives a field that a stage references.
- **Fix:**
  - On `archiveField` for objectKey `deal`, either refuse with the list of stages, or strip the key from `requireFields` inside the same transaction and audit it.
  - In `missingFor`, ignore keys whose field is archived or missing.

### L6-M3 · Merging contacts or companies leaves their dependents on the merged-away row — CONFIRMED (probes P4, P5)
- **Contact merge** (`contacts.ts:1793-1945`) moves deals, activities, files, company links, custom values and records. It does **not** move:
  - `CrmSequenceEnrollment`
  - `CrmEmailMessage`
  - `CrmScoreLog` (and the score is not recomputed)
  - `CrmWebSession` and `CrmTrackedClick`
  - `CrmPortalRequest`

  The `crm.contact.merged` consumer is a no-op (`outbox-consumers.ts:1105`).
- **Probe P4:** after the merge, all four dependent kinds were still on DROP and KEEP's score was 0 (DROP had +30). On the next engine tick, the ACTIVE follow-up sequence was stopped as `CONTACT_GONE` (`sequences.ts:1366-1383`).
  - This is a real flow: a web form creates a duplicate of an enrolled lead, and staff merge them.
  - Result: the follow-up dies silently, the email history drops off the kept contact's 360 (the thread is split across two records), and the lead's score falls.
- **Company merge** (`companies.ts:1402-1560`) does not move:
  - `CrmFileLink` (COMPANY)
  - `CrmPortalAccess` / `CrmPortalRequest`
  - `CrmEmailMessage.companyId`
- **Probe P5:** the file link and the accepted portal access both stayed on DROP. The portal only lists access whose company is live and not merged (`portal.ts:537,552`), so the customer's portal login loses the company with no warning to staff. The merge returned `warnings: []`.
- **Blueprint:** this contradicts §11.1 ("ย้าย ดีล/กิจกรรม/อีเมล/บทบาทบริษัท/portal/score log/sequence (คง 1 ACTIVE)"; company: "วัตถุ · portal access") and the §5.2 table (line 417).
- **Why oracles miss it:** merge oracles seed deals, activities and roles only.
- **Fix:**
  - In the contact-merge transaction: re-point emails, score logs (then recompute the score), web sessions, clicks and portal requests. For enrollments, keep one ACTIVE (keep's if it has one, otherwise move drop's) and stop the other with `MERGED`.
  - In the company merge: re-point file links, emails and requests. Move portal access, or at least revoke it and add a warning: "ต้องเชิญ N คนเข้าพอร์ทัลใหม่".

### L6-M4 · 7 of the 11 staff-notification templates are never sent — CONFIRMED (exhaustive grep + screenshot)
- **What the settings page offers:** 11 templates with per-channel toggles, a recipient description and per-user overrides (`notifications-shared.ts:22-35`; screenshot `notif-settings-390.png` shows "lead ใหม่ถูกมอบหมายให้ฉัน · ผู้รับ: ผู้ดูแล", with in-app and push ticked).
- **What actually calls `notifyStaff`:** only `deal.stale.digest` (`deals.ts:2409`), `commission.status` (`crm-bridges/commissions.ts:40`), `commission.pending` (`commissions.ts:1829`) and `quota.progress` (`quotas.ts:595`).
- **Dead templates:** `lead.assigned` · `customer.replied` · `tasks.today` · `activity.reminder` · `lead.hot` · `deal.closed` · `invoice.paid`. No code sends these keys. The `crm.activity.reminder` consumer is `async () => {}` (`outbox-consumers.ts:1140`).
- **Side paths that bypass the templates:**
  - Reminders write an `appNotification` and push to `ownerUserId` directly (`reminders.ts:163,173+`). They ignore the template, the channel toggles, quiet hours and per-user opt-outs, and never reach the "ผู้เข้าร่วม" the template promises.
  - Lead assignment notifies nobody unless the optional starter automation rule `NOTIFY_STAFF` is enabled (C4.4 US1 had to switch it on).
  - A quote answered in the portal notifies the owner only when the deal auto-moves (`deals.ts:2098-2108`).
- **Effect:** US1 ("พนักงานได้แจ้งเตือน") and §7.4 do not hold. The owner configures channels that do nothing.
- **Why oracles miss it:** C2.10-S0.2 checks that the templates *exist* (`qc-crm-c2.10.mts:254`), not that anything sends them.
- **Fix:**
  - Call `notifyStaff` at the event sources: assignment (`lead.assigned`), inbound reply and portal response (`customer.replied`), the `crm.score.threshold` consumer (`lead.hot`), won/lost (`deal.closed`), `account.invoice.paid` (`invoice.paid`), and an hourly digest (`tasks.today`).
  - Route reminders through `notifyStaff`.
  - Until then, hide the dead rows from the settings page.

### L6-M5 · Company lifecycle and score are never written, so every real company shows "ผู้สนใจ · คะแนน 0" forever — CONFIRMED (probe P1 + QC1 DB)
- **Where:** `CrmCompany.lifecycleStage` and `score` have no writer anywhere in `src/`. The only `crmCompany.update*` calls are at `companies.ts:643-2167`, and `DIFF_KEYS` (`:736`) excludes both columns.
- **Where they are displayed:** the company list (`companies/page.tsx:248`), the 360 header badge with "คะแนน" (`companies/[companyId]/page.tsx:165-167`), and the automation condition fields "ขั้นของบริษัท" and "คะแนนบริษัท" (`automation-shared.ts:149-150`).
- **Probe P1:** the deal was WON for ฿50,000 and the company cache updated (`openDealCount 0`, `wonValueSatang 5,000,000`), yet the company stayed `lifecycleStage LEAD, score 0`. The contact became CUSTOMER (positive control).
  - As a result, automation rules conditioned on company lifecycle or score never match.
- **Why oracles and screens miss it:** the QC seed hand-writes company lifecycle and score. On QC1, 10 CUSTOMER / 10 PROSPECT / 3 LEAD companies, and "บริษัท คิวซี 10" shows "ลูกค้า · คะแนน 70" (`look-l6.json` `db`). So every screenshot looks right.
- **Fix:**
  - Lifecycle: in `recomputeDealCachesInTx`, derive it from the company's deals (any WON → CUSTOMER, any OPEN → PROSPECT), moving forward only, or make it editable in `DIFF_KEYS`.
  - Score: define it (for example, the max score of linked contacts, recomputed in the scoring consumer), or hide the badge and the automation field until it is defined.

---

## MINOR

| # | Finding | Where | Status | Fix |
|---|---|---|---|---|
| m1 | **"Overdue" means two different things.** The web list, home brief, automation and sweep use `dueAt < now`; the mobile app and widget use `dueAt < start of today (Bangkok)`. Probe P6 (06:xx Bangkok), task due 60 s earlier: web **overdue tab 1 and today tab 1** (listed in both); mobile and widget `{today:1, overdue:0}`. Mobile/widget also ignore MEETINGs that have only `startAt`, which the web counts. | `activities.ts:896-899` · `brief.ts:175` vs `mobile.ts:187-190` · `widgets.ts:102-103` | CONFIRMED (probe) | Put one `statusWindows(now)` in `activities-shared` for all surfaces (and state whether today includes overdue) |
| m2 | **Custom DATE fields accept a Buddhist-era year in ISO form.** `setFieldValues({qcEnd:"2569-12-31"})` is accepted and stored as AD 2569 (probe P7). Records CSV import passes DATE through unchanged (`coerceCsv`). "31/12/2569" is refused, but the hint only shows AD. Contract-renewal (US8) date rules therefore never fire, and the screen shows year 3112. Deal close dates are guarded (2000–2200); fields are not. | `member/fields.ts:168-175,616-621` · `objects.ts:1196-1216` · compare `deals-shared.ts:316` | CONFIRMED (probe) | Reject or convert years > 2400 (−543) with a Thai hint; accept d/m/BBBB in import |
| m3 | **Thai sort and search.** The DB collation is `C.UTF-8`, so sorting by name puts เ/แ/โ/ใ/ไ-initial names after ฮ (`อรุณ, เอกชัย, แก้วตา, โชคดี, ไพโรจน์`; with `th-TH-x-icu` they sort correctly). A name stored with decomposed sara am (ํ+า) is not found by a search typed with ำ. | contact sort "name" (`contacts-shared.ts:129`), company sort (`companies-shared.ts:236`), pickers `companies.ts:1783,1822` · `probe-collation.mts` | CONFIRMED (QC2) | `ORDER BY name COLLATE "th-TH-x-icu"` (or `th-x-icu`); NFKC-normalise names and `q` on write/search |
| m4 | **Thai honorifics become the first name.** The v1 form, the public form, bridge leads and name splitting use the first space: "นาย สมชาย ใจดี" → firstName "นาย"; "นายสมชาย ใจดี" → "นายสมชาย". E-mails and sequences use `{{contact.firstName}}` → "เรียนคุณนาย" / "คุณนายสมชาย". `titleTh` exists but is never filled. | `contacts.ts:850-855` (`legacyCreateArgs`, also used by `leadFromBridge` `:2343`) · `emails.ts:1075` · `sequences.ts:1224` | CONFIRMED (trace) | Strip known prefixes (นาย/นาง/นางสาว/น.ส./คุณ/ดร./ด.ช./ด.ญ.) into `titleTh` before splitting |
| m5 | **A mistaken WON is permanent for the contact.** Win → contact CUSTOMER (plus a member via the bridge). WON→LOST or reopen does not revert it, and `setLifecycle` refuses CUSTOMER→PROSPECT/LEAD/LOST. Only CHURNED is allowed, which is wrong and pollutes "new customers". | `deals.ts:864,906-913` · `rules.ts:36-42` · `contacts.ts:1130-1139` | CONFIRMED (trace) | On leaving WON with no other WON deal and lifecycle set by this win (audit), step back to PROSPECT; or allow MANAGER+ to correct with a reason |
| m6 | **Skipping the business template leaves zero lost reasons, so no deal can be closed as lost.** The lost dialog blocks with "ให้ผู้ดูแลเพิ่ม…", and REST/automation LOST moves fail with VALIDATION. Only the one-off backfill script seeds reasons; the v1→v2 switch does not. | `templates.ts:291-306` · `deals.ts:772-778` · `DealMoveDialogs.tsx:170` · `switch-actions.ts` | CONFIRMED (trace) | Seed the 5 system reasons on skip and on the first v2 switch (same code as template step ③) |
| m7 | **v1 regression: a phone or e-mail the new validators reject disappears from the v1 screen.** v1 add-contact and the public form now go through `createContactFromLegacy`. A phone like "02-123-4567 ต่อ 12", "๐๘๑…" or "0812345678 (หลัง 5 โมง)" is moved into `note`, which the v1 UI never shows (it shows phone and source only). The lead looks like it has no phone. Thai numerals are also refused in v2 phone and tax ID fields. | `contacts.ts:856-861` · `ui.tsx:339` · `companies-shared.ts:249,264,314` | CONFIRMED (trace) | Keep the raw value in `phone` for legacy paths (skip the phone key for dedup only); map ๐–๙ → 0–9 before validation; allow "ต่อ"/"ext" |
| m8 | **Free-mail company domains capture everyone's mail.** A company whose "โดเมนอีเมล" is `gmail.com`/`hotmail.com` (common for Thai SMEs) matches every unknown inbound from that domain: the mail is filed under that company and the stranger never becomes a lead. The same domain also flags all such companies as duplicates, and every new gmail company gets candidates. | `companies.ts:2264-2269,589,1371` · `emails.ts:1880-1887` | code CONFIRMED · trigger PLAUSIBLE | Refuse or ignore a free-mail list in `emailDomainProblem` and in domain matching |
| m9 | **Archiving a team is one click with no confirmation or dependency warning.** Assignment rules on that team then yield no candidates (leads go unassigned, managers get the "ไม่มีผู้ดูแล" note). Rules with explicit `userIds` still stamp the archived `teamId` on new leads, and nobody sees them via TEAM. | `TeamsManager.tsx:345` · `core/teams.ts:189-197` · `assignment.ts:384,395-405` | CONFIRMED (trace) · stamp PLAUSIBLE | Confirm dialog listing active rules, quotas, open deals and members; skip the stamp for archived teams |
| m10 | **Tap targets below 24 px at 390 px** (QC1, measured): primary-contact star `26×16`, back links `13×28`, deal-card title link `293×19`, contact card checkboxes `13×13` (51 on /contacts), notification checkboxes `13×13` (35), "ดูทั้งหมด" `43×16`. No horizontal overflow on 15 pages (C4.2's `/deals/new` overflow suspicion was **not** reproduced: scrollWidth 390). | `look-l6.json` | CONFIRMED (measured) | min-h/w 24–44 px or padded labels |
| m11 | **Shared saved views break for everyone once a custom field they filter on is archived or made unfilterable.** The list shows "…ถูกเก็บเข้าคลัง… กู้คืนฟิลด์ก่อน" with no rows; STAFF cannot fix the view. | `member/fields.ts:2378-2380` · `contacts/page.tsx:102-108` (deals/companies the same) | CONFIRMED (trace) | Drop dead field filters when resolving a view (show a "ตัวกรองบางตัวถูกข้าม" note), or block archiving while views use the field |

---

## Design notes (not counted)
- `CrmPipeline.stageOnQuoteAcceptedId` has no setter anywhere (UI, REST or templates). C4.4 already reports it. The L6 consequence: a portal acceptance never notifies the deal owner, because `notifyQuoteResponse` runs only after an auto-move.
- A pipeline can be created or edited so that it has no WON or no LOST stage (only "≥1 OPEN" is checked, `pipelines.ts:218`). Its deals then cannot be won or lost. The settings page could warn.

## Checked and found sound
- **Pipelines and stages:** archive refuses open deals under a row lock. `deleteStage` refuses when deals exist, protects the last OPEN stage and clears the quote-stage pointers. A kind change is refused while deals exist. `/deals` has an empty state with no pipelines (owner vs staff copy).
- **Lifecycle forward-only rules and CHURNED.** Reopen needs MANAGER+, confirmation and a reason. WON→LOST needs a lost reason. WON→WON keeps the snapshot. `reopenedCount`.
- **Duplicates:** phone variants (0/66/+66/0066/dashes), e-mail lower-case, tax ID mod-11 with Thai message, branch code, tax/branch uniqueness including archived rows.
- **Time zone:** Thai-day helpers (`thaiDayRange`, `thaiDayStartMs`, `bkkYmd`) are used for today, digests and dedup. Deal close dates are stored at Thai midnight with a 2000–2200 guard.
- **Home:** the "ไม่มีผู้ดูแล" list covers removed or unaccepted owners (`home-data.ts:359-368`).
- **v1 routing:** `pickCrmPage` serves the original v1 pages. v2-only pages call `requireCrmV2Page`. `crmTabs` is unchanged for v1. `notifyStaff` and reminders are silent on v1.
- **Copy:** sequence stop reasons are mapped to Thai labels. The "CALL/NOTE/TASK" seen on the deal 360 is seed data, not product copy.
- **390 px:** no horizontal overflow on home, companies, company 360, contacts, contact 360, deals board/table/new, deal 360, activities (+overdue), calendar, notification settings, pipelines, reports.

## Suggested oracle additions
- **C1.5 stage requirements:** NUMBER/SELECT/DATE fields driven through the dialog payload shape (strings); archive a required field and then move.
- **Contact/company merge:** seed an enrollment, e-mail, score log, web session, file and portal access on the dropped row, then assert the location afterwards plus one ACTIVE enrollment after a `runDue` tick.
- **C2.10:** for each template key, assert that a code path produces an `AppNotification` carrying `?n=<key>`.
- **Company lifecycle after WON** without seed writes. Stop the seed from writing `CrmCompany.lifecycleStage/score`.
- **One "today/overdue" fixture** compared across list, mobile and widget.
