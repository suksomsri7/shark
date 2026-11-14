# H4.5 review — LINE notices for employees (commit e7023d07c vs bfd151421)

Reviewer: independent, read-only (git show/diff by object; working tree untouched). 14 Nov 2026.
Verdict: **FIX FIRST** (3 MAJORs, each small: schema drift, chat-table raw read, ORACLE-EDIT ratification). Privacy core (codes, bodies, links, admin views) is sound.

## Findings

### MAJOR
**MJ-1 Schema/SQL drift: FK without a Prisma relation will turn CI `pnpm drift` red.** `prisma/schema/hr.prisma` (H4.5 hunk, model HrLineLink) has no `employee` relation, but the migration adds `HrLineLink_employeeId_fkey ... ON DELETE RESTRICT` (migration.sql:75). CI runs `pnpm drift` = `prisma migrate diff --from-config-datasource --to-schema --exit-code` (package.json:23, .github/workflows/ci.yml:129; also qc-acc-v2-schema S6). The diff from DB to schema will include a DropForeignKey, so it exits non-zero. A later `prisma migrate dev` would also generate a migration that drops the FK without anyone noticing. **No precedent:** every other HR FK to HrEmployee, including the RESTRICT ones (HrStockCharge, HrFilingPerson, HrTaxCertificate, HrSalaryCertificate, HrReviewNote), has a Prisma relation plus a back-relation on HrEmployee (hr.prisma:88-91, payroll.prisma:342/512/561/590). HrEmployeeRegister has "no relation", but it also has no FK, so it does not count as precedent. Fix: add `employee HrEmployee @relation(fields:[employeeId], references:[id], onDelete: Restrict)` and `lineLinks HrLineLink[]` in the HrEmployee block (marked hunk). The default onUpdate (Cascade) matches the SQL. Then add a controller-authorised ORACLE-EDIT to S1.2 (qc-hr-h4.5-lib.mts:301-303, `LINK_COLS` + `employee`). Debt D9 should not be deferred.

**MJ-2 HR reads the chat module's table through raw SQL** (line-link.ts:243 `SELECT "displayName" FROM "ChatContact"`). F2.1 only checks imports, so this passes the static check by changing the form of what it forbids. That is exactly what Controller Ruling 2 bans: "never satisfy a static check by changing the syntactic form". Privacy-wise it is safe: `chatContactId` comes from the caller's own ACTIVE link (employeeId from resolveSelf, tenantDb scoped to the system, tenant equality in SQL), and the partial unique (tenantId, chatContactId) WHERE ACTIVE stops another employee's contact from being returned. Admins never get the name. Fix: the glue should provide the name. For example, `platform/hr-line.ts#myHrLineStatus(actor)` = hr `myLineStatus` (without name) plus a chat-facade/glue read of the display name, and the profile page imports that (it already imports platform/hr-line-actions). Do not return `chatContactId` to the page.

**MJ-3 ORACLE-EDITs in qc-hr-h2.10 are outside Ruling 1.** Ruling 1 only pre-authorises edits to AppNotification count/filter expectations ("Anything else: ask"). The content of both edits is legitimate and minimal:
- S1.5 is a forced consequence of R10/R11 (pages pass actions as props).
- S8.2 only excludes rows with wo=H4.5, which S1.13 of the H4.5 oracle pins.

There is no server→client leak. `@/lib/platform/hr-line-actions` is a `"use server"` module, so the client component only receives an action reference. Its import chain (hr-line → prisma) stays on the server, and the action reads only the session (no form fields). Minor nit: the S1.5 allow-list applies to every /app/me/hr page, not only profile. The controller should ratify the edits explicitly, or narrow them to profile/page.tsx and then ratify.

### MINOR
- **mi-1 Lease vs batch.** `claimLineNotices` leases up to 200 ids at once with a single 2-minute lease (line-notify.ts:172-184). The consumer then sends them one by one inline (hr-line.ts:223, 160-167), and each push can take up to 10 s. A roster publish to 200 staff on a slow LINE takes more than 2 minutes, so later rows go stale and the `hr.line` job reclaims them in parallel. Delivery is still 1 per notice (retry key 409 ⇒ ok, finish is guarded on `line='SENDING'`), but there are duplicate API calls, the outbox handler runs long (possibly beyond the drain's budget), and a FAILED result can overwrite a parallel SENT ordering. Suggest leasing per row (re-lease before each push) or claiming ≤20 per round in the consumer and leaving the rest to the job.
- **mi-2 Extra handler failures are swallowed by `compose`** (outbox-consumers.ts:471-479, WARN only). If the `planHrNotices` transaction fails transiently, that event's in-app notices are lost for good, because the event is DONE and never replayed. This was meant to be the new in-app fallback (Q8). For `hr.employee.offboarded`, an `endLineLinks` failure leaves links ACTIVE. Sends are still blocked by the precheck (line-notify.ts:226), but see mi-3. Consider a sweep that re-plans the last N days of events, or document the gap.
- **mi-3 Lazy end of links.** Membership removal, `linkedUserId` cleared and tenant status do not end links eagerly. Links end only at the next send's precheck (line-notify.ts:226-229). That meets "0 pushes after commit", but in the meantime:
  - `hr.menu`/`hr.unlink` (hr-line.ts:262 → line-link.ts:107) check only `status='ACTIVE'`, so an ex-member's LINE still gets the staff menu (links only, login-gated, so low impact).
  - The admin chip shows ACTIVE.
  - Tenant SUSPENDED/PENDING_DELETE is checked nowhere, so sends continue until the OA connection is disabled.

  Suggest adding the employee-active, membership and tenant-status checks to `activeLinkOfContact` and the precheck.
- **mi-4 DIGEST + OFF never cleans up.** HELD rows with `nextAttemptAt NULL` in a DIGEST-mode system that is switched OFF are skipped by `buildLineDigests` (:302) and by claim branch 3 (:193-194, mode=DIGEST), so they stay HELD forever. This is not "queued ⇒ SKIPPED(OFF)" as R9 says. When the shop re-enables, the first digest counts weeks of stale notices. In IMMEDIATE mode, OFF ⇒ plan writes `NONE` (no growth), which is fine.
- **mi-5 The job is unbounded before its budget check.** `runHrLineJobs` calls `buildLineDigests` across all systems (up to 500 transactions per system) before the first `left()` check (hr-line.ts:195-196). Move the budget check inside, or cap the number of systems per run.
- **mi-6 No index for `digestOf`.** Precheck `count where digestOf` (line-notify.ts:230) and the member update in finish (:249) have no index. Add a partial index `("digestOf") WHERE "digestOf" IS NOT NULL`.
- **mi-7 Silent replacement and unlink notices.** RELINK replaces a previous link silently from the LINE side: the old LINE account gets no "unlinked" message (line-link.ts:190-191). Admin unlink and LINE-side `hr.unlink` write no in-app note to the employee. Only a new link notifies, via `appLinked` "if not you, unlink" (line-link.ts:197). This is acceptable given content-free bodies, but an in-app note on ADMIN/LINE unlink is cheap.

### NOTE
- n-1 Cross-tenant raw writes use `tenantDb({tenantId:""})` (line-link.ts:162, line-notify.ts:187, :295). There is precedent for cross-tenant reads (hr/clock.ts:475, judge.ts:608). Writes are new but guarded by status predicates.
- n-2 `adminUnlinkLineAction`'s result is ignored in the page closure (employees/[employeeId]/page.tsx `onUnlinkLine`), so a refusal shows nothing.
- n-3 Two contacts consuming codes of two different employees at the same moment both pass the `FOR UPDATE` read (line-link.ts:192). One transaction then fails on the partial unique ⇒ LINK_FAILED_TEXT, and the code is already burned. The invariant holds; the user just asks for a new code.

## Privacy and security walk-through (item 1)
- **Issue:** `issueMyLineCodeAction` builds the actor from `requireTenant` + `requireMembership` only (no form input). `beginLineLink` → `resolveSelf` → `employeeOfUser` (DB, `linkedUserId = session user`).
- **Rate limit:** `hr-line-issue:<tenant>:<employee>` is server-derived, 5/h, counted before the write and refunded if the transaction fails (line-link.ts:263-279). It is shared across sessions of the same employee. A different tenant means a different employee row, so there is no bypass.
- **Code row:** single pending row per employee (partial unique + REISSUED), 10 min TTL, bound to tenant + OA (`connectionId`) + `issuedForUserId`.
- **Consumption:** chat `consumeLinkCode` claims atomically with `updateMany usedAt:null`. The hash is keyed with tenantId, so a shop-A code typed into shop B's OA finds nothing. It also checks OA equality. `completeLineLink` re-checks everything under the `hrline:<sys>:<emp>` lock: PENDING, not expired, OA, active employee, `linkedUserId = issuedForUserId`, accepted Membership. Two webhooks with the same code ⇒ the second fails at the chat claim, and the webhook dedupe is unchanged.
- **Brute force:** 31^8 ≈ 8.5e11 codes, 10 guesses per 15 min per contact (link-code.ts:52,161). Multiplying LINE accounts does not make this practical.
- **Shoulder-surf:** someone who sees a code can, within 10 min, link their own LINE to the victim and receive content-free notices. The victim gets the in-app `appLinked` warning and the self card shows the attacker's LINE display name (Q14), and can unlink. Gap: mi-7.
- **Bodies:** exactly the MSG table (kind + outcome word, fixed footer, one URI button). Links contain no shop or system id, only `/app/me/hr/...` with the record id. The pages require login and resolveSelf.
- **Tables and audits:** ids and status only; audit `after` holds employeeId/reason/monthKey/connectionId only.
- **Admin views:** chip = state + linkedAt only, gated by the Membership row read from the DB plus branch scope.
- **Unlink paths:** offboard ⇒ ENDED + pending SKIPPED; account/membership ⇒ lazily via precheck (mi-3); tenant suspend ⇒ none (mi-3).

## Delivery engine (item 2)
- Claim: `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED)`; stale SENDING is reclaimable through a lease in `nextAttemptAt` (but see mi-1).
- Retry key = `lineRetryKeyOf(tenantId, dedupeKey)`, stable per notice.
- Attempts: 1 + 3 with 5 m / 30 m / 2 h, then FAILED with a null next attempt.
- 429 ⇒ QUOTA, final, audited once per day per OA. Blocked contact ⇒ SKIPPED + ENDED(BLOCKED).
- Cap: reservation under the `hr:linecap:<sys>` advisory lock counting SENT+SENDING by sentAt in the Bangkok month. Two senders cannot both pass.
- Digest: one per employee per Bangkok day at or after `digestAt`.
- The in-app notice is committed in the plan transaction, before any LINE call, so LINE failures cannot roll it back (but see mi-2).
- Job: at most 20×50 rows per run plus the budget (but see mi-5).
- OFF ⇒ plan writes `line=NONE`; queued rows are skipped with OFF at precheck.

## Boundaries, settings, migration, UI, §F (items 3–8)
- **Boundaries:**
  - hr/** imports no chat or platform code.
  - The glue lives only in platform/hr-line(.ts, -actions.ts).
  - Chat change = 1 marked line (`HR_EMPLOYEE`).
  - postback-routes changes are 4 marked hunks.
  - The webhook route is unchanged.
  - R5 is respected: `resolveParty` returns null, so no Party write.
- **Settings:**
  - Writes only via `lockHrSettings` + `writeHrSettingsKeys({lineNotify})`.
  - OFF by default.
  - Cap must be an integer in 0–5000.
  - unitId is validated against the tenant.
  - Gate: OWNER or `hr.employee.create` with all-branch scope, read from the DB.
- **Migration:**
  - Additive, with the 3 partial uniques. "One live link per LINE contact per tenant" is enforced by `HrLineLink_active_contact_key`.
  - The claim index (line, nextAttemptAt) exists.
  - No PII columns.
  - Missing: digestOf index (mi-6) and the relation (MJ-1).
- **UI:**
  - The label "ยังไม่ได้ทดสอบกับ LINE OA จริง" is present (`hr.line.pilot`, testid hr-line-settings-pilot).
  - Texts come from th/en messages.
  - The client receives only state/linkedAt/own displayName and the policy.
  - The code is held in client state only.
- **§F self-check:**
  - §F10 "files ⊆ brief list" is contradicted by the qc-hr-h2.10 edit (MJ-3).
  - §F7 holds: completeLineLink uses only its tx client under the lock.
  - §F8 holds.
  - §F2 holds: no tenantDb/prisma calls inside transaction bodies.

## Builder questions
1. **Lazy `await import("./self")`:** acceptable as a temporary hr→hr import (not a boundary dodge, and the type import is static). self.ts re-exports payslip UI (self.ts:35-37), and that is the real defect. Preferred follow-up (D8): move `resolveSelf`/`selfRowOf`/`SelfActor` into a light `hr/self-core.ts` that self.ts re-exports, then import it statically. Do not swap to `employeeOfUser` from service.ts: it is also heavy, and that would skip resolveSelf's `linkedUserId` re-check.
2. **FK without a relation:** there is no precedent in HR migrations. Every FK to HrEmployee has a relation. It breaks `pnpm drift` (CI ci.yml:129, qc-acc-v2-schema S6) and risks a future auto-generated DROP of the FK. **Recommend: add the relation + back-relation and ORACLE-EDIT S1.2 (controller-authorised)** (MJ-1).
3. **Raw `ChatContact.displayName` read in hr:** yes, it is a module-boundary violation in substance (Ruling 2). It cannot return another person's name: the own ACTIVE link plus the partial unique per contact prevent that. The glue should provide it (MJ-2).
