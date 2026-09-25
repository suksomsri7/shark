# C2.11 — REST + AI, second set (~30 ops · 10 tools)
Read `crm-brief-COMMON.md` and `crm-brief-C1.10.md` first. Contract: CRM-RUN §2 "C2.11".

Ops for emails (threads, send, schedule, templates, user settings, routing, rotate key), sequences (CRUD, enroll, stop, stats), assignment (rules, simulate), scoring (rules, explain, recompute), tracking (links, stats, web settings), notifications prefs, automation rules (CRUD, dry-run). Tools: `crm_email_thread`, `crm_draft_email` (draft only), `crm_send_email` (proposal), `crm_enroll_sequence` (proposal), `crm_assign` (proposal), `crm_score_explain`, `crm_stale_deals`, `crm_activities_due`, `crm_records_query`, `crm_set_next_step` (proposal). Webhook events of phase C2. Regenerate docs.
Danger ops: send e-mail to >1 recipient / bulk enroll / recompute-all / rotate inbound key / delete template in use.

## Acceptance (oracle `qc-crm-c2.11`)
CRM-RUN (22) + X2 (key without `crm.email.*` cannot read threads; readonly cannot send; assistant as thana cannot read krabi threads) · X8 API-readonly bundle never returns e-mail BODY (headers/snippet only) unless the key holds `crm.email.read` explicitly · X9 danger list enforced · X3 idempotent send (same key twice → one e-mail).
Regressions: C1.10 oracle, `qc-member-m3.10`.

## Addendum (oracle author) — 24 ก.ย. 2569 · `scripts/qc-crm-c2.11.mts` (47 ข้อ)

C2.11 adds rows to the machine C1.10 built, so most of the contract is inherited. Everything below is a decision the oracle had to
invent to make the checks concrete. **oracle-proposed — controller to confirm** (a different ruling ⇒ ORACLE-EDIT the named checks
before the builder starts).

1. 🔴 **THE 30 MUST OPS are listed in the file itself** (`const MUST` at the head of `scripts/qc-crm-c2.11.mts`: id · METHOD path ·
   action · kind · group) — emails 10 · sequences 7 · assignment 3 · scoring 4 · tracking 3 · notifications 2 · automation 2. The brief
   said "~30 ops for emails/sequences/assignment/scoring/tracking/notifications prefs/automation"; the exact ids, paths and permission
   keys are invented here. Everything else the builder wants to add is RECOMMENDED and must obey the same rules (listed in the contract
   block). *oracle-proposed — controller to confirm the id/path spelling; it is the one thing that is expensive to change later
   (clients bookmark paths).*
2. **`test:` ids**: every C2.11 op must carry a `test` value from the `TEST_IDS` array of this oracle (all 46 check ids are literals in
   the file, so fitness **F13.10** — "every op has a test id that appears in a `qc-crm-*.mts`" — passes by construction). `C2.11-S1.1`
   fails if an op carries a `test` outside that list. *oracle-proposed.*
3. **Paths that hang off an existing group**: `scoring.explain` is `GET /contacts/{id}/score` (the reasons belong to the contact and are
   readable with plain `crm.contact.read`, not with `crm.score.manage`) and `sequences.stop` is
   `POST /sequences/enrollments/{id}/stop` (an enrollment id is not a sequence id). *oracle-proposed.*
4. **Action keys reused, none added**: `crm.email.read` · `crm.email.send` · `crm.email.settings` · `crm.sequence.manage` ·
   `crm.sequence.enroll` · `crm.assignment.manage` · `crm.score.manage` · `crm.tracking.manage` · `crm.automation.manage` ·
   `crm.contact.read` (score explain + notification prefs). No new permission key, no migration, no new page. *oracle-proposed.*
5. **The danger list of the brief, mapped to ops** (X9.1/X9.2): `emails.inbound.rotate` · `sequences.bulkEnroll` ·
   `scoring.recompute {all}` are declared `kind: "danger"`; `emails.send` is a plain `write` for ONE recipient and takes the danger path
   (confirm + reason ≥ 5 chars) when the body names more than one; "delete a template in use" belongs to the RECOMMENDED
   `emails.templates.delete`. *oracle-proposed — controller to confirm the multi-recipient rule (the alternative is a separate
   `emails.sendBulk` op, which would be cleaner but is not what the brief describes).*
6. **`assignment.simulate` and `automation.dryRun` are declared `kind: "read"`** although they are POSTs (they take a body) — and the
   oracle asserts they really write nothing (no contact, no `AutomationRun`). A dry run that counted as a write would also consume the
   write rate bucket and demand a write scope. *oracle-proposed.*
7. **The 10 tools** (R-E.4's C2.11 half): read → `crm_email_thread` · `crm_score_explain` · `crm_stale_deals` · `crm_activities_due` ·
   `crm_records_query`; draft-only → `crm_draft_email` (never becomes a send proposal — S3.3); proposal → `crm_send_email` ·
   `crm_enroll_sequence` · `crm_assign` · `crm_set_next_step`. `runCrmTool` answers `{mode:"read"|"propose"|"error"}` and
   `dispatchCrmKind` executes an approved proposal (S3.4 also asserts applying the same approved payload twice is safe).
   *oracle-proposed (`crm_records_query` and `crm_stale_deals` are listed in the blueprint's read set; they are tested here because
   C2.11 is the work order that exposes them).*
8. **The C2 webhook event list the oracle requires** (S4.1): `crm.sequence.enrolled` · `crm.sequence.finished` · `crm.email.sent` ·
   `crm.email.received` · `crm.email.opened` · `crm.email.clicked` · `crm.email.bounced` · `crm.score.changed` ·
   `crm.score.threshold` · `crm.deal.stale` · `crm.activity.overdue` — 11 events, each already declared once by its own work order, each
   with a consumer (S4.3) and a Thai label (S4.2). The business events of C2.9 are covered by that work order's own oracle.
   *oracle-proposed — controller to confirm the list is complete once C2.4–C2.10 have landed.*
9. **X8 for the second set**: a key without `crm.email.read` gets headers/snippet only — **no `body`/`bodyHtml`/`bodyText` field at all** —
   and no op ever returns `transcript` / `recordingFileId` / `aiSummary` (X8.1/X8.2, the second one static over `api/ops/**`).
   *oracle-proposed.*
10. **X7 (rate)**: C2.11 adds no new limiter; it must keep using `CRM_API_CONFIG` (own `rateNs`, read/write/report buckets,
    `checkRateLimitDb`) and declare an explicit `rate` bucket on the heavy new reads (stats · simulate · dry-run). X7.2 only proves the
    limiter is wired and never 500s under a 12-call burst — the exact cap is C1.10's contract, not re-tested here. *oracle-proposed.*
11. **Docs** (S5.1): `renderDocs()` must equal `docs/api/CRM-API.md` byte for byte (F13.11) **and** the six new groups must appear in the
    rendered text. The oracle snapshots the file and restores it in `finally`, so a run can never leave the repo dirty.
12. **No new page** (S6.1): the C1.10 `/crm/settings/api` page is extended in place (bundles + the C2 webhook events) and keeps its
    inventory rows; mockup 14 (right) is the reference and pixel parity stays gate D7. *oracle-proposed.*
13. **Known weakness to read honestly**: while the ops are absent the dispatcher answers `404 not_found`, which several checks accept as
    "refused" (`X2.2`, `U.1`, `U.2`, `S7.1` were GREEN in the red run for that reason). They only start biting once `C2.11-S1.1` is green,
    so **S1.1 is the gate of the whole file** — the controller should read it first when accepting the work order. *oracle-proposed.*
14. **Zod internals**: the strict-schema probe (S1.2) accepts zod v3 (`_def.unknownKeys === "strict"`), zod v4 (`_def.catchall` =
    ZodNever) **or** a literal `.strict()` in that group's ops file, because the repo is on zod v4 and its internals are not part of any
    contract. *oracle-proposed.*
15. **Oracle-side conventions**: one throwaway tenant with a v2 and a v1 CRM system · five keys (readonly · operate · admin · a
    member-only key with no `crm.*` scope · an admin key bound to the v1 system) · the route handlers are imported and called directly
    (no server, no port) · no outbound transport is ever reached · `docs/api/CRM-API.md` is restored · the ChatRateBucket rows of the run
    are deleted with the keys.

### Regressions the controller runs with this file
**`qc-crm-c1.10`** (the same registry/dispatch/actor/tools/docs machine — it must stay green after ~30 more ops) · **`qc-member-m3.10`**
(the member API set shares the core dispatcher and the key bundles) · `qc-api-keys` · `qc-webhook` · `qc-crm-c2.1` … `qc-crm-c2.10`
(every service the second set exposes) · `qc-crm-c1.7` (visibility through the key filters) · `qc-crm-v1` ·
**`pnpm fitness` both modes** (F13.10 test ids · F13.11 docs not stale · F13.12 every tool has a home in the `crm` skill) ·
`qc-nav-functions` · `qc-member-m1.9` (30/15/10/5 — this oracle touches no seeded tenant).

## Controller ruling (24 ก.ย. 2569 · Fable 5.1 · binding — เคาะ addendum 1–15 ก่อน spawn builder)
- ตาราง MUST 30 op (id/path/action/kind) **CONFIRMED** — path ตามแบบ C1.10 (`/resource/{id}/sub`) · `scoring.explain = GET /contacts/{id}/score` ด้วย `crm.contact.read` · `sequences.stop = POST /sequences/enrollments/{id}/stop` · `assignment.simulate`/`automation.dryRun` เป็น `kind: "read"` แม้ POST (ข้อสอบยืนยันไม่เขียน) · danger = `emails.inbound.rotate` · `sequences.bulkEnroll` · `scoring.recompute{all}` · webhook event C2 11 ตัว (consumer + ป้ายไทย) · `test:` id ครบตามข้อสอบ · ไม่มีคีย์/หน้า/migration ใหม่ · `S1.1` = ประตูของทั้งไฟล์ (404 ของ dispatcher ทำให้ X2.2/U.*/S7.1 เขียวหลอกตอนยังไม่มี op — ผู้คุมงานอ่าน S1.1 ก่อนเสมอ)
- **แก้ 1 ข้อ (ORACLE-EDIT โดยผู้เขียนข้อสอบ)**: แยก `emails.sendBulk` (`POST /emails/send-bulk` · kind danger · ≤500 ผู้รับ · confirm+reason) ออกจาก `emails.send` ซึ่งรับผู้รับ **คนเดียวเท่านั้น** (>1 = VALIDATION) — op เดียวที่บางครั้งต้อง confirm ทำให้ผู้ใช้ API งง · MUST = 31
- ถอยหลังบังคับ: `qc-crm-c1.10` (REST ชุดแรก) · `qc-account-api-keys` · `qc-crm-c2.1` · `qc-crm-c2.2` · `qc-crm-c2.3` · `qc-crm-c2.5` · `qc-crm-c2.8` · `qc-crm-c2.10` · **`qc-crm-c1.11`** · fitness F13.x

### ORACLE-EDIT (ผู้คุมงาน · 24 ก.ย. 2569) — the multi-recipient send gets its own door
Applied to `scripts/qc-crm-c2.11.mts`; **MUST goes from 30 to 31 ops** (emails 11 · sequences 7 · assignment 3 · scoring 4 ·
tracking 3 · notifications 2 · automation 2 — ⚠️ แก้ 25 ก.ย.: ผลรวมจริงของตาราง = **32** แถว; ตัวเลข 31 ในข้อความเป็น off-by-one · อาร์เรย์ `MUST` ในข้อสอบคือความจริง). Decision 5 of the addendum is superseded by this ruling.
- `emails.send` — `POST /emails/send` · `crm.email.send` · **kind `write`** · **EXACTLY ONE recipient**; a body naming more than one
  answers VALIDATION (400/422). Its input schema must NOT carry `recipients[]` / `contactIds[]` and must not grow a `confirm` flag.
- `emails.sendBulk` — **`POST /emails/send-bulk`** · `crm.email.send` · **kind `danger`** · `confirm: true` + `reason` ≥ 5 chars ·
  **≤ 500 recipients** (a longer list is refused even with confirm) · audited like every danger op.
- Checks changed: `C2.11-S1.1` (31 ops · the new row in the MUST table) · `C2.11-X2.2` (readonly is now refused on five doors, send-bulk
  included) · `C2.11-X6.2` (the array cap is proven on `sequences.bulkEnroll` AND `emails.send-bulk`) · `C2.11-X9.1` (the danger list is
  now four ops and `emails.send` must stay a plain single-recipient write) · `C2.11-X9.2` (rewritten: two recipients on `/emails/send`
  ⇒ 400/422 · `/emails/send-bulk` without confirm ⇒ refused · with confirm ⇒ accepted · 501 recipients ⇒ refused · short reason on
  recompute-all ⇒ refused). The check-id list (`TEST_IDS`) and the total (47 checks) are unchanged.
- Re-run after the edit: `JSON_SUMMARY {"total":47,"passed":16,...}` — same balance, the five touched checks still red for the right
  reason (the ops do not exist yet) except `X2.2`, which stays green because the dispatcher answers 404 while they are absent.

## มติผู้คุมงานหลัง builder รอบ 1 (Fable · 25 ก.ย. 06:40)
1. รอบ 2: เติม `notifications.prefs.get/set` หลังรวม C2.10 (ห้าม stub) · 2. ตัวยิง `crm.deal.stale`/`crm.activity.overdue` = C2.10 (consumer/ป้ายของ C2.11 รวมกับของ C2.10 ตอน merge — ประกาศครั้งเดียว) · 3. `emails.routing.*` ↔ get/setEmailSettings · `SHARED` = alias `SHARK` · 4. routing GET คืน `inboundAddress` ไม่คืน `inboundKey` · 5. MUST = 32 · 6. `sendBulk` เป็น service ใน `emails.ts` · 7. ORACLE-EDIT S2.10 · S3.2 · C1.10-S0.2 · C1.10-X1.1/X1.2 (ดู CRM-RUN §4)

