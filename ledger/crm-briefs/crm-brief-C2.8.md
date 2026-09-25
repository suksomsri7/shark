# C2.8 — Lead scoring
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C2.8". Spec: blueprint §5.7, §11.5, mockup 05 (score).

## Deliverables
`scoring.ts`: 8 seeded system rules + CRUD · `onEvent` consumer for every event a rule references (conditions; `maxPerDay` per rule per contact enforced with ONE conditional statement — not count-then-insert; `CrmScoreLog`; `score` via `increment`; band recalculation; `crm.score.changed` / `crm.score.threshold` when a band boundary is crossed — emitted once per crossing) · `decay` daily (expire logs in claimed batches, score never < 0) · `explain` (last 3 reasons) · `recompute(contactId | all, {dryRun})` (all = danger) · wire ADJUST_SCORE action (C2.1) and form `scoreOnSubmit` (C2.6) · UI rules page + reasons on card/360.

## Acceptance (oracle `qc-crm-c2.8`)
CRM-RUN S1–S7 (20).
X3 50 parallel "email opened" events with `maxPerDay=3` → exactly 3 logs and +3×points; score equals Σ non-expired logs · X4 same event twice/parallel → one log (key: ruleId+eventKey) · X5 decay overlapping runs → each log expired once · X9 recompute-all requires confirm + reason, audited · X1 logs of a contact the actor cannot see are not readable.

## Addendum (oracle author) — 24 ก.ย. 2569 · `scripts/qc-crm-c2.8.mts` (54 ข้อ)

Everything below is a **naming/shape decision the oracle had to invent** because no document fixed it. Each is written into the
CONTRACT block at the head of `scripts/qc-crm-c2.8.mts` and is what the checks assert. **oracle-proposed — controller to confirm**
(change the decision ⇒ ORACLE-EDIT the named checks before the builder starts).

1. **Files owned by C2.8** (R-D default + what the checks open): `src/lib/modules/crm/scoring.ts` (new) · `scoring-shared.ts` (new) ·
   `src/lib/platform/crm-bridges/scoring.ts` (new, R-D) · blocks `// CRM C2.8 ▸ … ◂` inside `crm/index.ts`, `crm/settings.ts`,
   `crm/nav.ts`, `crm/automation.ts` (the ADJUST_SCORE case only), `src/lib/automation/labels.ts`, `src/lib/outbox-consumers.ts`,
   `src/lib/platform/minute-jobs.ts`, `src/lib/platform/crm-bridges/index.ts`, `src/lib/platform/crm-bridges/forms.ts` (scoreOnSubmit) ·
   page `src/app/app/sys/[id]/crm/settings/scoring/**` · `src/components/crm/scoring/**` · the score block of
   `src/app/app/sys/[id]/crm/contacts/[contactId]/page.tsx` · `scripts/crm-ui-inventory.json` rows with `wo: "C2.8"`.
   *oracle-proposed — controller to confirm.*
2. **Function names and signatures** (S0.1): `seedSystemRules(ctx, actor)` · `listRules` · `createRule` · `updateRule` · `toggleRule` ·
   `deleteRule(ctx, actor, id, { confirm, reason })` · `reorderRules` · `onEvent(ctx, eventType, payload, opts?: { now?, eventKey? })` ·
   `adjust(ctx, actor|null, { contactId, points, reason, refType?, refId?, eventKey?, expiresDays?, now? })` ·
   `decay(opts?: { now?, tenantIds?, systemIds?, batchSize?, deadline?, signal? })` · `applyInactivity(opts?)` ·
   `explain(ctx, actor, contactId, opts?: { limit? })` · `recompute(ctx, actor, target, opts)` · `getScoringSettings` ·
   `setScoringSettings`. `ctx = { tenantId, systemId, actorUserId }`. *oracle-proposed — controller to confirm.*
3. **The "8 seeded system rules" = `CENTRAL_SCORE_RULES`** in `src/lib/modules/crm/templates/business/central.ts` (the data C1.11
   already shipped: form_submitted +15 · chat_in +5/1 · email_opened +2/3 · email_clicked +5/3 · email_replied +10 · meeting_done +10 ·
   quotation_sent +8 · inactive_30d −10/expires 90). The oracle reads that module, so the numbers are never re-typed. Seeded rows:
   `isSystem true`, `active true`, `sortOrder` = the data order, name = the Thai label. *oracle-proposed — controller to confirm
   (especially `active: true` for `inactive_30d`: it subtracts points on day 31 of silence without anybody switching it on).*
4. **Identity of a seeded rule = `conditions.seedKey`** (`CrmScoreRule` has no `key` column and C2.8 has no migration) — the same
   trick C2.1 uses with `trigger.starter`. Idempotency = advisory lock `crm:score-rules-seed:<systemId>` + a seedKey check inside the
   tx (S1.1 fires 1 + 1 + 5 parallel calls). *oracle-proposed — controller to confirm.*
5. **`SCORE_RULE_EVENTS`** (scoring-shared) = every `AUTOMATION_EVENTS` value + the **virtual** `crm.contact.inactive`;
   `crm.contact.inactive` deliberately stays OUT of the 3 registries (no emitter, no consumer — it is decided by the daily job, R-B
   style). S0.4 asserts both halves. *oracle-proposed — controller to confirm.*
6. **Bands + settings key**: `settings.crm.scoring = { hot: 50, warm: 20, decayDays: 30 }` (blueprint §4.5 minus `bandRecalcCron`,
   which the job schedule already answers) · `bandOf(score, { hot, warm })`: `≥ hot` HOT · `≥ warm` WARM · else COLD (so 0 ⇒ COLD, and
   `scoreBand` is non-null from the first scoring event) · cached on `CrmContact.scoreBand` with `scoreUpdatedAt`. *oracle-proposed.*
7. **`decayDays` = the default expiry of a log** whose rule leaves `expiresDays` null; `null`/`0` on both ⇒ `expiresAt` null = never
   expires (S3.1). Without this the seeded rules would never decay at all (only `inactive_30d` carries `expiresDays`). *oracle-proposed.*
8. **Score arithmetic**: on the way up ONE statement `SET "score" = GREATEST(0, "score" + $points) … RETURNING`; `decay`/`recompute`
   reconcile with ONE statement `SET "score" = GREATEST(0, COALESCE(Σ points WHERE expired = false, 0))`. The invariant the oracle
   asserts is **`score = GREATEST(0, Σ non-expired)`** (exact equality whenever no clamp happened) — X3.1/X3.3 check the exact sum,
   S3.2 checks the clamp at 0 with a negative live sum. *oracle-proposed — controller to confirm.*
9. **`maxPerDay` = per (rule, contact, THAI day)**, enforced by ONE conditional `INSERT … SELECT … WHERE (SELECT count(*) …) < maxPerDay`
   (S2.1/S2.2, X3.2 with 50 parallel events, X3.4 static). The Thai day is why `onEvent` must take `now` as THE clock. *oracle-proposed.*
10. **`eventKey`**: for rule logs it is the source event's idempotency key (the partial UNIQUE `(ruleId, eventKey)` of
    `*_crm_v2_b` is the whole X4 guard). For `adjust` (ruleId null ⇒ the partial UNIQUE does not apply) the same field is stored and an
    explicit `eventKey` makes the call idempotent through `WHERE NOT EXISTS (contactId, eventKey)` (S8.7, X4.1–X4.3). *oracle-proposed.*
11. **Events** (blueprint §7.1 payloads kept): `crm.score.changed { contactId, from, to, band, ruleId }` key
    `crm.score.changed#<contactId>#<logId>` · `crm.score.threshold { contactId, band }` key
    `crm.score.threshold#<contactId>#<band>#<logId>` (`…#decay#<ymd>` when no log id applies). **`threshold` fires on ANY band change,
    up or down, once per crossing** (the C2.1 trigger label offers ร้อน/อุ่น/เย็น, so "went cold" must be reachable); a step inside the
    same band and a re-processed source event emit nothing (S4.2). *oracle-proposed — controller to confirm.*
12. 🔴 **The band must be matched somewhere — today nobody matches it.** `automation.runForCrmEvent` selects rules by `event` only
    (`automation.ts:1301`), so a live `crm.score.threshold` event would also run a rule whose trigger params say `band: "COLD"`.
    `C2.8-S4.3` requires: band HOT crossing ⇒ the HOT rule runs once, the COLD rule does not. Two ways to get there — (a) the C2.8
    consumer/bridge filters the rules by `trigger.params.band` before calling the engine, or (b) a params check inside
    `runForCrmEvent` (C2.1's file — C2.8 already opens `automation.ts` for the ADJUST_SCORE case, decision 18).
    **Controller decision needed before the builder starts**; if the ruling is "the band is not matched on the live path", ORACLE-EDIT
    `C2.8-S4.3`.
13. **No duplicate trigger**: adding the two labels to `AUTOMATION_EVENTS` would list `crm.score.threshold` twice in
    `CRM_RULE_TRIGGERS` (once from the spread, once from `CRM_CRON_TRIGGERS`). Decision: the spread filters out values already in
    `CRM_CRON_TRIGGER_VALUES`, so the cron definition keeps winning (`cron: true`, `params: ["band"]`) and **`qc-crm-c2.1` S9.1 stays
    green** while the C2.1 daily poller survives as the catch-up path (S0.4). *oracle-proposed — controller to confirm.*
14. **`applyInactivity`** = the `crm.contact.inactive` half: contacts whose `lastActivityAt` (or `createdAt`) is older than
    `conditions.days ?? 30` get the rule's points ONCE per spell, `eventKey = crm.contact.inactive#<contactId>#<anchor ISO>` (S8.5).
    *oracle-proposed — controller to confirm (alternative: a real event + emitter + consumer, which needs a 3-registry entry).*
15. **The daily job is `crm.scoring.decay`** — `registerMinuteJob({ name: "crm.scoring.decay", everyMinutes: 1440, cadence: "daily" })`
    in `src/lib/platform/minute-jobs.ts` (block `// CRM C2.8 ▸`), not `vpsOnly`, body = `decay` + `applyInactivity` through the facade,
    honouring `ctrl.deadline`/`ctrl.signal`; `scripts/crm-cron.mts` imports it (a `scoring-job.ts` mirror like `sequences-job.ts` is
    optional) — S3.3. **Knowing deviation**: blueprint §7.5 says "03:00 ไทย"; the C0.5 dispatcher only knows aligned windows from Thai
    midnight, so the hour cannot be expressed today. Recorded as a debt, not implemented.
16. **`explain`** = `{ score, band, items: [{ logId, points, reason, ruleId, refType, refId, at, expiresAt }] }`, NON-EXPIRED only,
    newest first, `limit` default `SCORE_EXPLAIN_LIMIT = 3` (mockup 05 shows exactly three chips) · needs only `crm.contact.read` ·
    invisible/foreign contact ⇒ NOT_FOUND · the reason of a DELETED rule is kept as history (S5.1/S5.2, X1.3). *oracle-proposed.*
17. **`recompute`** target = `{ contactId }` | `{ all: true }`; `{ all: true }` is the danger op (confirm + reason ≥ 5 chars, audit
    `crm.score.recompute`, only ctx.systemId touched); `dryRun` writes nothing at all and reports `items[{ contactId, from, to, band }]`
    (S6.1/S6.2). *oracle-proposed.*
18. **ADJUST_SCORE wiring**: the `case "ADJUST_SCORE":` skip of `automation.ts:1011` becomes `scoring.adjust` with
    `refType "AUTOMATION_RULE"`, `refId` = the rule id, an `eventKey` tied to the run (so a re-run never scores twice), reason mentioning
    the rule name; `ruleId` on the log stays null because the row is not a score-rule row (S8.3). *oracle-proposed.*
19. **`FormDef.scoreOnSubmit`** (the C2.6 column already exists) is applied through `adjust` with `refType "FORM_SUBMISSION"`,
    `refId = submissionId`, `eventKey = form#<submissionId>` — additional to whatever the `forms.submission.received` score rule gives
    (S8.7). *oracle-proposed.*
20. **Bridge shape**: `crm-bridges/scoring.ts` exports `onScoringEvent(evt)`, asks `crmGate` + `bridgeOpen` FIRST (a uiVersion-1 or
    bridges-off system is never scored — S8.6, U.1) and is composed as an EXTRA under `compose` into the consumers of every event a rule
    references: `forms.submission.received` · `chat.message.received` · `crm.activity.completed` · `crm.email.opened` ·
    `crm.email.clicked` · `crm.email.received` · `crm.deal.quotation.issued` (X4.3 drives `crm.activity.completed`). If a parallel
    builder also touches `outbox-consumers.ts`, the controller applies the second block (COMMON). *oracle-proposed.*
21. **Settings placement**: the typed reader + the single-`jsonb_set` writer for `settings.crm.scoring` live in `crm/settings.ts`
    (R-A: every later work order adds its section through that service); validation = `hot > warm ≥ 0`, `decayDays ≥ 0`, integers;
    audited; sibling keys survive (S8.4). *oracle-proposed.*
22. **Permissions**: `crm.score.manage` (already in `access.ts`) for seed/CRUD/settings/recompute and for a HUMAN `adjust`;
    `crm.contact.read` only for `explain`; engine calls pass `actorUserId: null` (S8.2). *oracle-proposed.*
23. **UI names**: nav `{ key: "settings-scoring", label: "คะแนนผู้ติดต่อ", path: "/crm/settings/scoring", status: "ready", wo: "C2.8" }` ·
    page testids `crm-score-rule-list` · `crm-score-rule-new` · `crm-score-rule-row-*` · `crm-score-rule-toggle-*` ·
    `crm-score-rule-delete-*` · `crm-score-band-hot` · `crm-score-band-warm` · `crm-score-decay-days` · `crm-score-seed-btn` ·
    `crm-score-recompute-btn` (≥ 8 inventory rows) · contact 360: `contact-score-badge` (the existing C1.4 badge gets the id),
    the three newest reasons as `contact-score-reason-*` chips and `contact-score-explain-btn` for the full list (S7.1/S7.2).
    *oracle-proposed — controller to confirm the testid spelling before the builder writes the inventory rows.*
24. **Errors**: class `ScoringError` with `.code ∈ VALIDATION | NOT_FOUND | FORBIDDEN | CRM_V2_DISABLED`; `CrmForbiddenError` /
    `CrmV2DisabledError` are accepted by the checks. Thai messages, never blaming the user, never echoing another tenant's data.
25. **Oracle-side conventions the builder must know**: the oracle drives `onEvent`/`adjust`/`decay`/`applyInactivity` DIRECTLY (plus the
    real consumer chain in X4.3), always passes `tenantIds` + `systemIds` to the sweeps (a sweep that ignores them would eat other
    suites' rows on the shared QC DB — S3.1 has a control row for exactly that), uses a synthetic clock in the past (2026-09-10) and
    therefore requires `now` to be THE clock for maxPerDay/expiry/decay, and falls back to raw `CrmScoreRule` inserts when `createRule`
    is still absent (so the `onEvent` checks stay meaningful while the CRUD is being written).
26. **X3.4 is static and strict**: `scoring.ts` must contain an atomic bump (`score: { increment … }` or
    `SET "score" = GREATEST(0, "score" ± …)`), an `INSERT INTO "CrmScoreLog"` carrying its own `count(` subquery (the cap), no
    read-in-JS-then-write of the score, and the markers `// AUDIT-CLASS X3`, `X4`, `X5`.

### Regressions the controller runs with this file
`qc-crm-c2.1` (the `crm.score.threshold` trigger + S9.1 catalogue + S4.6 — **S4.6 asserts ADJUST_SCORE is still a no-op stub and WILL
go red once C2.8 wires it: the controller must ORACLE-EDIT `C2.1-S4.6` when accepting C2.8**) · `qc-crm-c1.4` (contacts / 360 /
score columns) · `qc-crm-c1.8` (events + 3 registries + the compose contract) · `qc-crm-c1.11` (permanent uiVersion cases · business
templates) · `qc-crm-c0.5` (the dispatcher with one more daily job) · `qc-crm-c2.2` + `qc-crm-c2.3` (they share `minute-jobs.ts`,
`labels.ts`, `outbox-consumers.ts`) · `qc-crm-c2.4`–`qc-crm-c2.7` once they exist (the e-mail/quotation events the rules reference) ·
`qc-crm-v1` · `qc-cron` · `qc-webhook` · `qc-form` + `qc-forms-notify` (scoreOnSubmit) · `qc-nav-functions` (the new page) ·
`pnpm fitness` in both modes (F7.1 doc refs · F13.x event registries · F14.1/F14.2 testid inventory) · `qc-member-m1.9` (30/15/10/5 —
this oracle touches no seeded tenant).

## Controller ruling (24 ก.ย. 2569 · Fable 5.1 · binding — เคาะ addendum 1–26 ก่อน spawn builder)
- ข้อ 1–11, 13–26: **CONFIRMED ตามที่เสนอ** (identity ของกฎ seed ใน `conditions.seedKey` · `settings.crm.scoring {hot 50, warm 20, decayDays 30}` · `score = GREATEST(0, Σ ที่ยังไม่หมดอายุ)` bump ขึ้นคำสั่งเดียว + reconcile ตอน decay · `maxPerDay` ต่อ (กฎ, คน, วันไทย) INSERT เงื่อนไขเดียว · decay = `FOR UPDATE SKIP LOCKED … RETURNING` วนจนเงียบ · `crm.score.changed/threshold` payload ตาม §7.1 · `crm.contact.inactive` เป็น event เสมือน (นอก 3 ทะเบียน) · งานรายวัน `crm.scoring.decay` everyMinutes 1440 — **เบี่ยงจาก "03:00 ไทย" ยอมรับ** เพราะตัวกระจายงาน C0.5 ระบุชั่วโมงไม่ได้ (C6.1 ตั้ง crontab รายวันตอน 03:00 ได้ถ้าต้องการ) · `explain` 3 รายการล่าสุด · `recompute {all:true}` = danger op · ADJUST_SCORE ต่อ `scoring.adjust` · `FormDef.scoreOnSubmit` ผ่าน `adjust` · สะพาน `crm-bridges/scoring.ts` ประตูก่อนในตัว handler · settings reader/writer ใน `crm/settings.ts` บล็อก C2.8 · สิทธิ์ `crm.score.manage` · nav `settings-scoring` "คะแนนผู้ติดต่อ" · `ScoringError`)
- ข้อ 12 🔴 **CONFIRMED: ต้องแมตช์ band** — ทำใน `src/lib/modules/crm/automation.ts` บล็อก `// CRM C2.8 ▸ … ◂` แบบทั่วไป: ถ้ากฎมี `trigger.params.band` และ event payload มี `band` ไม่ตรง ⇒ ข้ามกฎนั้น (ใช้กับ `crm.score.threshold` · ไม่แตะกฎที่ไม่มี params) · `qc-crm-c2.1` ต้องยังเขียว
- ข้อ 13 CONFIRMED: `CRM_RULE_TRIGGERS` ต้องไม่ list `crm.score.threshold` ซ้ำ (ข้าม value ที่อยู่ใน `CRM_CRON_TRIGGER_VALUES` แล้ว) · `C2.1-S9.1` ต้องยังเขียว
- **ORACLE-EDIT ที่ผู้คุมงานจะทำตอนรับ C2.8**: `C2.1-S4.6` (ADJUST_SCORE เลิกเป็น stub) — builder ห้ามแก้เอง แค่รายงานว่าข้อนี้แดงเพราะเหตุนี้
- ถอยหลังบังคับ: `qc-crm-c2.1` · `qc-crm-c1.4` · `qc-crm-c1.8` · `qc-crm-c2.2` · `qc-crm-c2.3` · `qc-form` · `qc-crm-v1` · **`qc-crm-c1.11`**

## มติผู้คุมงานรอบแก้ (Fable · 25 ก.ย. 03:40 · หลัง reviewer อิสระ)
1. **B1 decay atomic** — claim (`FOR UPDATE SKIP LOCKED … RETURNING`) และ reconcile ของทุก contact ในชุดนั้นอยู่ใน `prisma.$transaction` เดียว · ตายกลางทาง = rollback ทั้ง claim ⇒ รอบถัดไปเก็บต่อได้เอง · X5.2 (แถวถูก flag แล้ว + แถวที่ยังค้าง) ยังต้องผ่าน
2. **B2 ทางเดียว** — ลบ `case "crm.score.threshold"` ออกจาก cron poller ของ C2.1 (`automation.ts` ~1546) · ทะเบียน trigger/params `band` คงเดิม · กติกาทำงานผ่าน `runForCrmEvent` จาก event สดของ C2.8 เท่านั้น · ถ้าข้อสอบ c2.1 แดง → รายงาน id + บรรทัด ห้ามแก้เอง
3. **B3 quotation** — ยิง `crm.deal.quotation.issued` ใน `deals.ts` ที่จุดผูก `quotationDocId` (tx เดียวกับ update · คีย์ `crm.deal.quotation.issued#<dealId>#<docId>` · payload `{ dealId, contactId, docId }` ids ล้วน · ยิงครั้งเดียวต่อ doc) + consumer `withAutomation(compose(async()=>{}, crmBridge("onScoringEvent")))` + เพิ่มเข้า `SCORE_BRIDGE_EVENTS` + ป้ายใน `automation/labels.ts` (เว็บฮุคได้จาก spread) · bridge หา contactId จาก payload/ดีล
4. MAJOR — `adjust`: audit ใน tx เดียวกับ `applyPoints` · `recompute` (จริง): ยิง `crm.score.changed` เมื่อคะแนนเปลี่ยน และ `crm.score.threshold` เมื่อระดับเปลี่ยน (คีย์ท้าย `#recompute-<runId>`) · `emitScoreEvents`: ไม่ยิง `changed` เมื่อ from===to · `createRule/updateRule`: event ต้องอยู่ใน `SCORE_BRIDGE_EVENTS` ไม่งั้น error ไทย + ตัวเลือกใน UI แสดงเฉพาะชุดนี้
5. PARITY mockup 05 (`ledger/design-crm/05-contact-360-convert.body.html`): ป้าย `🔥 ร้อน 72` (emoji ต่อระดับ 🔥/🌤/❄ ใน `SCORE_BAND_LABELS` หรือ badge) · หัวเรื่อง "ทำไมถึงร้อน 72" เหนือชิป · ปุ่ม "ดูเหตุผลคะแนนทั้งหมด"
6. รับตามเดิม: fan-out ทุกระบบ CRM ของร้านเมื่อ event ไม่ระบุ systemId · forms eventKey ใหม่ · `scripts/expected*.json` ไม่เข้า main

