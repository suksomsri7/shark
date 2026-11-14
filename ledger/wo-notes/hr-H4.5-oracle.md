# H4.5 — oracle notes (LINE notices for employees)

Oracle `scripts/qc-hr-h4.5.mts` + `scripts/qc-hr-h4.5-lib.mts` (fake LINE · pinned bodies · check table · statics · pure). Branch `wip/hr-h4.5`, base 1725eb106.
Run: `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env [QC_FORCE=1] QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-h4.5.mts` · `--list` prints the table.
Unforced on base = SKIPPED (line-rules.ts absent). Forced on base = 65 RED by design + 4 GREEN controls (BASE-EXPECTATION 69/69). Output: `hr-H4.5-red.txt`.

## LINE fake
`startFake()` (lib): node:http on `127.0.0.1:<port 0>`, `LINE_API_BASE` set to it, `globalThis.fetch` wrapped (any non-local host → 503 + recorded; `.neon.tech` passes for the DB driver).
Before the first send the oracle asserts `chat/line.ts lineApiBase() === fake.base`, else it throws (no send attempted). Closed + fetch restored in the final block.
Behaviour by LINE user id prefix: `Udown` 503 · `Ufail` 500 · `Uquota` 429 · `Uslow` 200 after 12 s (> LINE_TIMEOUT_MS 10 s) · default 200, and a retry key already accepted ⇒ 409 (real LINE semantics).
Per-user scripted statuses (`fake.script`) win over the prefix (200 = accept now). Records `to`, messages, `X-Line-Retry-Key`, status. Profile GET returns the contact's fixture name.
Webhook = the real route `POST` with a body HMAC-signed by the fixture OA secret (qc-svc-r0.7 pattern). `SESSION_SECRET` is set in-process to a random 64-hex value only when the lane env has none (link codes need a key; no file touched).

## Check list (69)
Statics S1.1–S1.13 (S1.4 frozen = GREEN control) · pure S2.1–S2.9 · DB S3.0 (GREEN control: fake = lineApiBase, a signed webhook reaches the route and gets LINK_FAILED_TEXT, a facade push reaches the fake with its retry key) ·
link S3.1–S3.12 · notices S4.1–S4.7 · engine S5.1–S5.11 · end S6.1–S6.3 · races S7.1–S7.4 · matrix S8.1–S8.5 · privacy S9.1–S9.2 · X1 fitness (GREEN) · Z1 residue (GREEN). Titles: `--list`.
Acceptance map: §6.1→S1.3/S1.4/S1.7 · §6.2→S2.* · §6.3→S3.2/S3.3 · §6.4→S3.4–S3.7 · §6.5→S3.9 · §6.6→S3.10 · §6.7→S4.1–S4.5/S4.7 · §6.8→S4.6 · §6.9→S5.1–S5.5 · §6.10→S5.6 · §6.11→S5.8–S5.10 · §6.12→S6.* · §6.13→S3.12/S3.11 · §6.14→S7.* · §6.15→S8.* · §6.16→S9.* · §6.17→Z1/X1.

## RED on base (forced) — reason per group
| group | checks | reason on base |
|---|---|---|
| migration/schema | S1.1 S1.2 S9.1 | no migration folder, no models, tables absent |
| boundaries/glue | S1.3 S1.5 S1.10 S1.11 | `platform/hr-line.ts`, line-link/actions absent; LINK_PURPOSES has no HR_EMPLOYEE |
| hunks/wiring | S1.6 S1.7 S1.8 S1.9 S1.12 S1.13 | no `HR H4.5` hunks; no `onHrEventForLine`; no `hr.line` job; no lineNotify writer; no audit names; no UI/testids/messages |
| pure | S2.1–S2.9 | `hr/line-rules.ts` absent (exports undefined) |
| link | S3.1–S3.12 | `issueHrLineCode`/`myLineStatus`/… absent ⇒ no code, no link, no reply other than the chat default; `hr.*` postbacks unrouted |
| notices | S4.1–S4.7 | consumers are the base no-ops ⇒ no HrNotice, no push (S4.3 shows only the base OT in-app note) |
| engine | S5.1–S5.11 | `planHrNotices`/`sendHrLineNotices`/`runHrLineJobs` absent |
| end/races | S6.* S7.* | no links to end; holders fail on the missing tables (S7.2) or nothing waits on the keys |
| matrix | S8.1–S8.5 | status reader / adminUnlinkLine / save fn absent |
| privacy | S9.2 | no hr.line.* audits (keys check needs ≥1 `hr.line.link`) |
GREEN on base (justified): S1.4 (control — nothing frozen changed yet) · S3.0 (control — harness proves fake + signed webhook + facade push work on base code) · X1 (fitness both modes) · Z1 (no residue).

## Shapes fixed by the oracle (brief leaves them open)
- Bodies (ruling Q6, byte for byte): table `MSG` in the lib (th + en): one sentence per kind×outcome, footer `ต้องเข้าสู่ระบบ SHARK ก่อนจึงจะเปิดดูได้` / `Log in to SHARK to view.`, button `เปิดดู` / `Open`, DIGEST `คุณมีแจ้งเตือนใหม่ {n} รายการ` / `You have {n} new notices.`
  `noticeMessage({kind, outcome, n?}, locale, href)` → `{altText, flex}`: altText = sentence; flex text nodes ⊇ {sentence, footer} ⊆ {+button}; every action `{type:"uri", uri: href}`; button label = BUTTON. In pushes: `messages = [{type:"flex", altText, contents}]`, uri = `APP_URL + hrefOf`.
- `hrefOf({kind, refId})` (relative path, F7) · `dedupeKeyOf({kind, refId, employeeId, outcome?})` · `nextAttemptAt(attempts, now)` → Date | null · `lineNotifyPolicyOf(settings.lineNotify)` (sub-object, like `otPolicyOf`) · `monthKeyBkk(date)` → "YYYY-MM".
- Self: `myLineStatus(actor)` keys exactly `ok, state, linkedAt, displayName, shopEnabled` · `issueHrLineCode(actor)` → `{ok:true, code, …}` | `{ok:false, code: NO_EMPLOYEE|INACTIVE|DISABLED|NO_OA|RATE, …}` · `unlinkMyLine(actor)` · actor = `{tenantId, userId, role, unitAccess, permissions}`.
- Admin: `adminUnlinkLine(ctx, viewer, {employeeId})` · status reader for the chip (name not in the brief): first exported of `employeeLineStatus | lineStatusForViewer | adminLineStatus` in line-link/line-notify, `(ctx, viewer, {employeeId})` → keys exactly `ok, state, linkedAt`. Admin = `hr.employee.create` (H1.1 manage key).
- Settings save (name not in the brief): first exported of `saveLineNotifyPolicy | saveLinePolicy | saveLineSettings | saveHrLinePolicy` in line-notify/line-link/hr-line, `(ctx, viewer, policy)`.
- Notices: `planHrNotices(outboxEvt)` (rows read from DB) · `sendHrLineNotices({tenantId, ids}, {now})` · `runHrLineJobs(now, {budgetMs})` · `onHrEventForLine(evt)`. Time rules use `opts.now`; `sentAt = now`; monthly cap counts SENT by `sentAt` in `monthKeyBkk(now)`.
- Stale SENDING simulated by `line='SENDING', sentAt=NULL, nextAttemptAt = now−3 min` (and createdAt older) — any lease reading of the brief sees it as stale (> 2 min).
- End reasons: linkedUserId cleared / membership removed ⇒ `ACCOUNT` (only fitting value of R1's list).
- Linked reply: exactly one text message = `LINK_OK_TEXT` or `HR_LINE_TEXT.linked` if the builder defines that key.
- In-app counts ignore the base chat-inbox notes (`/chat?c=` bodies). OT: H4.5 adds no in-app (only the existing `notifyOtDecided` note, +1).

## Ambiguities and how they were read (controller may rule)
1. Retry count: R7 says "3 tries", Q12/ruling say "retry 3×", R2 gives four backoff values (5 m/30 m/2 h/null). Only 1 try + 3 retries uses all four ⇒ S2.7/S5.2 pin 4 attempts, FAILED final after the 4th. If the controller means 3 attempts total, S2.7 vector `4→null` and S5.2 `1:5 2:36 3:160 4:null` need an ORACLE-EDIT.
2. Exact bodies: the brief rules "byte for byte" but gives no strings ⇒ the oracle's MSG table is the proposal (sentences carry kind + outcome word only). Controller to confirm the wording.
3. Names of the admin status reader and the settings save function are not in the brief ⇒ alias lists above.
4. "admins status only": admin = holder of `hr.employee.create` (canManageHrSettings key); MANAGER without it not tested.
5. JSON files (messages, inventory) cannot carry `HR H4.5` markers ⇒ exempt from S1.6; parity checked in S1.13.
6. `qc-hr-h0.1 S4.2` re-take (brief R1) pins payroll.prisma, not hr.prisma — not this oracle's concern; builder lists it if it turns red.
7. hr/attendance-job.ts already imports `platform/minute-jobs` on base (H2.5) ⇒ S1.3 flags only imports new vs base.
