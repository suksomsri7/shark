# AI TEAM — Mobile API contract (SHARK HUB v2 · ทีมพนักงาน AI)

> Work order T0.2 · written by hand from the contracts of `ledger/AI-TEAM-RUN.md` §2 (T1.10 · T2.11 · T3.4 · T3.6 · T4.x · T5.x), `ledger/ai-team-briefs/ai-brief-RESOLUTIONS.md` and the real code of `src/app/api/mobile/**` on 8 Oct 2026.
> Status: **contract** — none of the `/api/mobile/team/**` routes exists yet. T1.10 implements §4, later work orders implement §5. The app (lane B) mocks against this file until T1.10 is accepted; «scripts/qc-ai-t1.10.mts» S9 diffs this file against the real route list.
> Machine-checked by `scripts/qc-ai-t0.2.mts` (S5.1–S5.3 · X10.3): one `### METHOD /path` heading per route, six labelled lines, one zod block, one `Screen | Routes` table with 36 rows.
> Files written in «…» do not exist yet (repo convention); names in backticks are real code of today.
> Module contract (functions behind these routes): `docs/modules/30-ai-team.md` · data: `prisma/drafts/ai_team.prisma`.

## 1. Conventions

### 1.1 Transport and auth

- Base URL: the app's existing `BASE_URL` (`apps/mobile/src/api/client.ts`). JSON in, JSON out, UTF-8. Times are ISO-8601 strings (UTC); the app formats them in Asia/Bangkok with its existing helper.
- Every request carries `Authorization: Bearer <session>`; tenant routes also carry `X-Tenant-Id`. The helpers are the real ones:
  - `requireMobile(req)` — `src/lib/mobile/auth.ts` — Bearer + `X-Tenant-Id` → accepted `Membership` + tenant not suspended. Fails with `401 unauthorized`, `403 missing_tenant`, `403 forbidden`, `403 suspended`.
  - `mobileUser(req)` — same file — Bearer only (no tenant yet). Fails with `401 unauthorized`.
  - `requireMobileUser(req)` — **new in T1.10**, «src/lib/mobile/team-auth.ts» (RESOLUTIONS R-E C21) — Bearer + ALL accepted memberships of the user, no `X-Tenant-Id`. Used by the cross-tenant inbox only. Fails with `401 unauthorized`.
  - `mobileDenied(g, q)` / `mobileAiCtx(g)` — `src/lib/mobile/guard.ts` — permission gate (`evaluate`, the same function `assertCan` uses: OWNER and MANAGER pass, STAFF needs the key) and the `{ tenantId, actor }` context of the commanding user.
- Every `/api/mobile/team/**` route (except the cross-tenant inbox) calls `requireMobile` through the wrapper `requireTeamMobile(req)` — **new in T1.10**, «src/lib/mobile/team-auth.ts» — which remaps one answer: a tenant the caller is **not a member of** (today `403 forbidden` from `requireMobile`) becomes `404 not_found` on team routes (controller ruling 8 Oct, D7). `requireMobile` itself is not changed; `401 unauthorized`, `403 missing_tenant` and `403 suspended` pass through. The `Auth:` line of each team section names the underlying helper.
- Team routes follow the 404-not-403 pattern for anything addressed by id: an employee, task, schedule, room, flow, proposal or action that is not in the tenant of `X-Tenant-Id` — or that the caller may not see — answers `404 not_found`, exactly like an id that does not exist (X1). A missing permission key on a collection route answers `403 forbidden` (the shape `mobileDenied` returns today).

### 1.2 Permission keys

Module `ai` of `src/lib/core/permissions.ts`. Today it has `ai.chat.send` and `ai.schedule.create`; T1.2 registers the rest (R-E C31).

| Key | Meaning | Default |
|---|---|---|
| `ai.employee.read` | see the team, profiles, quota, report | OWNER · MANAGER · STAFF with the key |
| `ai.employee.manage` | hire, edit, pause, terminate, manual, access OFF/READ/DRAFT, knowledge | OWNER · MANAGER |
| `ai.employee.use` | start a task and send orders (still limited by the employee's commander list). **Implies `ai.employee.read`**: wherever this file says `ai.employee.read`, a member holding `ai.employee.use` passes too (implemented in T1.2) | OWNER · MANAGER · STAFF with the key |
| `ai.access.grant` | grant AUTO (OWNER-only key, pattern `CRM_OWNER_ONLY_KEYS`) + `canGrantPermission` of the kind | OWNER |
| `ai.schedule.manage` | create / edit / delete recurring tasks | OWNER · MANAGER |
| `ai.action.undo` | undo an action inside the undo window | OWNER (+ named users) |
| `ai.room.manage` | create / edit rooms and hand-off flows | OWNER · MANAGER |

Approving or rejecting a proposal needs **no** `ai.*` key (R-E C33): the gate is the proposal kind's own module permission (`KIND_ACCESS` → `membershipCan`) evaluated with the membership of the proposal's tenant.

### 1.3 Errors

Every error is `{ "error": "<code>", "message"?: "<Thai, never blames the user>", "fields"?: { "<path>": "<Thai>" }, "retryAfterSec"?: n }`. No stack, no SQL, no ids of other tenants.

| HTTP | Code | When |
|---|---|---|
| 400 | `bad_json` · `validation` | body is not JSON · zod refused it (`fields` names the paths) |
| 401 | `unauthorized` | no / expired Bearer |
| 403 | `missing_tenant` · `forbidden` · `suspended` | from `requireMobile` / `mobileDenied` (on team routes `forbidden` means "member, but lacks the permission key") |
| 403 | `not_commander` | the user is not in the employee's (or room's) commander list |
| 403 | `cannot_grant_beyond_self` | the caller tried to give an access level for a module he cannot use himself |
| 404 | `not_found` | unknown id, id of another tenant, not visible to the caller — and, on team routes, an `X-Tenant-Id` the caller is not a member of (`requireTeamMobile`) |
| 409 | (`employee_paused` covers a PAUSED and a TERMINATED employee alike — the eight-code list is closed) `employee_access_off` · `employee_access_read_only` · `employee_auto_not_granted` · `employee_auto_over_limit` · `employee_grantor_revoked` · `employee_paused` · `employee_quota_cap` · `team_quota_exhausted` | the eight stable refusal codes of the team layer (COMMON §C2) |
| 409 | `default_employee_protected` · `auto_forbidden_kind` · `undo_expired` · `not_undoable` · `schedule_limit` · `already_decided` · `needs_second_confirm` | state refusals named in the route sections |
| 429 | `rate_limited` | `checkRateLimitDb` bucket full (`retryAfterSec`) |

### 1.4 Rate limit buckets (`checkRateLimitDb(key, { limit, windowMs })`, `src/lib/core/rate-limit-db.ts`)

| Bucket key | Limit | Routes |
|---|---|---|
| `mobile-team:<userId>` | 120 / minute | default for every team route |
| `mobile-team-task:<userId>` | 30 / minute | `POST …/employees/[id]/tasks` · `POST …/rooms/[id]/tasks` |
| `mobile-team-speech:<userId>` | 30 / minute | `POST …/persona/sample-speech` |
| `mobile-team-ai:<userId>` | 10 / minute | routes that call the model: `…/team/manual/draft` · `…/employees/[id]/manual/draft` · `…/inbox/teach` · `…/flows/draft` |
| `mobile-team-search:<userId>` | 60 / minute | `GET …/team/search` |
| `mobile-team-upload:<userId>` | 10 / minute | `…/manual/attach` · `…/knowledge/items` |
| `mobile-team-notify:<userId>` | 10 / minute | `POST …/sale-notify` |

Existing routes keep what they have today (most have none; `crm/*` uses `mobile-crm:<userId>`).

### 1.5 Schema rules (X10 · X11 · owner decision 9)

- Every route file exports its request schema as `Z<Name>Request` and its response schema as `Z<Name>Response`; the handler returns `Z<Name>Response.parse(dto)` so nothing outside the whitelist can leave. `scripts/fitness-ai-team.mts` (AT-F16.1 / AT-F16.3) finds response schemas by that name.
- The app gets **percentages, counts, hours, minutes** — never micro-dollar amounts, never a prompt, never a model name, never a cost per task, never wages. The only schema in this file with a micro-dollar field is the frozen `GET /api/mobile/usage`.
- `amountSatang` in an inbox / task card is the shop's own document amount (a quotation total), not an AI cost.
- Free text is trimmed, length-capped and stored as data. Nothing a model, a manual, a KB article or a customer wrote can change a level, a grant, a limit or a quota (COMMON §C3).

### 1.6 Shared schemas

```ts
import { z } from "zod";

const ZId = z.string().min(1).max(64);
const ZIso = z.string().datetime();
const ZPct = z.number().min(0).max(100); // percent of the pack allowance of the cycle
const ZAccessLevel = z.enum(["OFF", "READ", "DRAFT", "AUTO"]);
const ZEmployeeStatus = z.enum(["ACTIVE", "PAUSED", "TERMINATED"]);
const ZPauseReason = z.enum(["MANUAL", "QUOTA_CAP", "TEAM_QUOTA"]);
const ZLiveStatus = z.enum(["WORKING", "WAITING_APPROVAL", "IDLE", "PAUSED"]);
const ZTaskState = z.enum(["WAITING", "WORKING", "DONE", "ARCHIVED"]); // WAITING = a PENDING proposal exists
const ZKindClass = z.enum(["MONEY", "CUSTOMER_FACING", "DESTRUCTIVE", "INTERNAL"]);
const ZPack = z.enum(["FREE", "STARTER", "PRO", "BUSINESS"]);
const ZQuotaState = z.enum(["OK", "WARN80", "WARN95", "EXHAUSTED", "PAUSED"]);

const ZPersona = z.object({
  gender: z.enum(["MALE", "FEMALE", "NONE"]), // MALE ⇒ ครับ · FEMALE ⇒ ค่ะ
  tone: z.enum(["POLITE", "FRIENDLY", "FORMAL"]),
  humor: z.enum(["NONE", "LIGHT", "PLAYFUL"]),
  length: z.enum(["SHORT", "MEDIUM", "DETAILED"]),
  languages: z.array(z.string().min(2).max(8)).min(1).max(5), // "th", "en", "zh", …
});

const ZWorkHours = z.union([
  z.object({ always: z.literal(true) }),
  z.object({ always: z.literal(false), days: z.array(z.number().int().min(1).max(7)).min(1), fromMinute: z.number().int().min(0).max(1439), toMinute: z.number().int().min(1).max(1440) }),
]);

const ZPerson = z.object({ userId: ZId, name: z.string(), initial: z.string().max(2) }); // humans are drawn as initials
const ZEmployeeRef = z.object({ id: ZId, name: z.string(), positionLabel: z.string(), orbColor: z.string() }); // AI is drawn as an orb

const ZEmployeeCard = ZEmployeeRef.extend({
  positionKey: z.string(),
  status: ZEmployeeStatus,
  pauseReason: ZPauseReason.nullable(),
  isDefault: z.boolean(),
  liveStatus: ZLiveStatus,
  statusLine: z.string(), // "2 งานกำลังทำ · 1 รออนุมัติ"
  openTasks: z.number().int(),
  pendingProposals: z.number().int(),
  lastActivityAt: ZIso.nullable(),
});

const MANUAL_SECTION_KEYS = ["duties", "forbidden", "askWhen", "steps", "goodExamples", "metrics"] as const;
const ZManualItems = z.array(z.string().trim().min(1).max(300)).max(20);
const ZManualSections = z.object({
  duties: ZManualItems,
  forbidden: ZManualItems,
  askWhen: ZManualItems,
  steps: ZManualItems,
  goodExamples: ZManualItems,
  metrics: ZManualItems,
  forbiddenReply: z.string().trim().max(300).optional(), // "ถ้าลูกค้าขอสิ่งที่ห้าม ให้ตอบว่า"
  notifyOnForbidden: z.boolean().optional(),
}); // each section ≤ 2,000 characters in total (checked in manual.ts)

const ZFrequentTask = z.object({ icon: z.string(), title: z.string(), hint: z.string(), orderText: z.string() }); // orderText = the order the chip puts into the input

const ZAccessRow = z.object({
  skillId: z.string(), // id of src/lib/ai/skills.ts or "core"
  label: z.string(), // "CRM · ลูกค้า & ดีล"
  icon: z.string(),
  level: ZAccessLevel,
  autoAvailable: z.boolean(), // false until T4.2 and for skills whose kinds are all DESTRUCTIVE
  autoHint: z.string().nullable(), // "เปิดได้หลังผ่าน 50 งาน"
});

const ZProposalCard = z.object({
  tenantId: ZId,
  tenantName: z.string(),
  proposalId: ZId,
  taskId: ZId.nullable(),
  conversationId: ZId,
  aiEmployee: ZEmployeeRef,
  kind: z.string(),
  class: ZKindClass,
  risk: z.enum(["NORMAL", "DESTRUCTIVE"]),
  title: z.string(), // "ใบเสนอราคา Q-0012"
  summary: z.string(), // customer shown as a short name only — no phone, no e-mail (X8)
  amountSatang: z.number().int().nullable(),
  lines: z.array(z.object({ label: z.string(), amountSatang: z.number().int().nullable() })).max(20),
  riskTags: z.array(z.object({ tone: z.enum(["OK", "WARN"]), text: z.string() })).max(5), // "แพงกว่าครั้งก่อน 12%"
  needsOwner: z.boolean(), // amount above the tenant's ApprovalPolicy threshold
  approveVerb: z.enum(["APPROVE", "APPROVE_SEND", "APPROVE_POST", "APPROVE_REPLY", "APPROVE_HANDOFF"]),
  editable: z.array(z.enum(["amount", "text"])), // what `edits` may change for this kind
  status: z.enum(["PENDING", "EXECUTED", "REJECTED", "FAILED", "EXPIRED"]),
  decidedBy: ZPerson.nullable(),
  decidedAt: ZIso.nullable(),
  createdAt: ZIso,
});

const ZOk = z.object({ ok: z.literal(true) });
```

## 2. Screens → routes (the 36 screens of `ledger/DESIGN-AI-TEAM.md` §2)

One row per screen. Every route named here has its own section below. Buttons are listed one by one in §3.

| Screen | Routes | Notes |
|---|---|---|
| A1 · ทีม | `GET /api/mobile/team/summary` `GET /api/mobile/team/employees` `GET /api/mobile/team/search` | the search box ("ค้นหาพนักงาน งาน หรือลูกค้า") calls `search` (debounced); the four tabs filter the loaded list on the device; "ชม. ที่ประหยัด" is `null` (shown as "—") until T4.5 |
| A2 · สลับกิจการ | `GET /api/mobile/me` `GET /api/mobile/team/summary` `GET /api/mobile/team/quota` `POST /api/mobile/tenants` | `summary` is called once per membership with that tenant's `X-Tenant-Id` (cached 60 s); switching uses the app's existing `switchTenant` |
| A3 · งานของพนักงาน | `GET /api/mobile/team/employees/[id]` `GET /api/mobile/team/employees/[id]/tasks` `GET /api/mobile/team/schedules` | tabs งาน / งานประจำ / เก็บแล้ว = `filter` of the tasks route + the schedules route |
| A4 · เริ่มงานใหม่ | `GET /api/mobile/team/employees/[id]` `POST /api/mobile/team/employees/[id]/tasks` `POST /api/mobile/chat/send` | greeting, "เข้าถึง …" and frequent tasks come from the employee detail; the microphone uses the device dictation |
| A5 · ห้องสั่งงาน | `GET /api/mobile/team/tasks/[id]` `GET /api/mobile/conversations/[id]/messages` `POST /api/mobile/chat/send` `POST /api/mobile/proposals/confirm` `POST /api/mobile/proposals/reject` `POST /api/mobile/plans/confirm` `POST /api/mobile/plans/reject` `POST /api/mobile/team/inbox/decide` `POST /api/mobile/team/tasks/[id]/done` `POST /api/mobile/team/tasks/[id]/archive` | step cards (✓ / ●) are the `status` events of the existing SSE stream |
| A6 · ตั้งงานประจำ | `GET /api/mobile/team/employees` `GET /api/mobile/team/schedules` `POST /api/mobile/team/schedules` `PATCH /api/mobile/team/schedules/[id]` `DELETE /api/mobile/team/schedules/[id]` | "ใช้โควตาประมาณ X%" = `quotaPctPerRun` × runs per month, computed on the device |
| A7 · รออนุมัติรวม | `GET /api/mobile/team/inbox` `POST /api/mobile/team/inbox/decide` | "ดู" opens A5 after `switchTenant` when the row is in another tenant |
| A8 · ยังไม่มีทีม | `GET /api/mobile/team/summary` `GET /api/mobile/team/positions/recommend` `GET /api/mobile/team/positions` | shown when `employees` is empty |
| B1 · จ้าง ขั้น 1 ตำแหน่ง | `GET /api/mobile/team/positions` `GET /api/mobile/team/positions/recommend` | search and category tabs filter on the device |
| B2 · จ้าง ขั้น 2 ตัวตน | `POST /api/mobile/team/persona/sample-speech` | debounced; the hire draft lives on the device until "จ้าง" |
| B3 · จ้าง ขั้น 3 คู่มือ | `GET /api/mobile/team/positions` `POST /api/mobile/team/manual/draft` `POST /api/mobile/team/employees/[id]/manual/draft` `POST /api/mobile/team/employees/[id]/manual/attach` | during a hire (no employee yet) the draft comes from `team/manual/draft`; for an existing employee from `employees/[id]/manual/draft`; attachments are uploaded after the employee exists |
| B4 · แก้หัวข้อ สิ่งที่ห้ามทำ | `GET /api/mobile/team/positions` `GET /api/mobile/team/employees/[id]/manual` `POST /api/mobile/team/employees/[id]/manual` | drag, delete and add edit the local draft; "แนะนำจากร้านแบบเดียวกัน" = `suggestions` of the position template |
| B5 · จ้าง ขั้น 4 สิทธิ์ & โควตา | `GET /api/mobile/team/positions` `POST /api/mobile/team/employees` `GET /api/mobile/team/employees/[id]/access` `PUT /api/mobile/team/employees/[id]/access` `PATCH /api/mobile/team/employees/[id]` | hire = ONE `POST employees` carrying persona, access and manual (one transaction); the access / patch routes are the edit mode opened from B7 |
| B6 · จ้างสำเร็จ | `GET /api/mobile/team/employees/[id]` `POST /api/mobile/team/employees/[id]/tasks` | the three numbers and the three first-task shortcuts come from the employee detail |
| B7 · โปรไฟล์พนักงาน | `GET /api/mobile/team/employees/[id]` `POST /api/mobile/team/employees/[id]/pause` `POST /api/mobile/team/employees/[id]/resume` `POST /api/mobile/team/employees/[id]/terminate` | the four rows navigate to B2 / B3 / B5 / C5 |
| B8 · ประวัติคู่มือ | `GET /api/mobile/team/employees/[id]/manual/versions` `POST /api/mobile/team/employees/[id]/manual/revert` | "📈 หลังแก้" is `effect` (null until T4.7 has enough tasks) |
| C1 · แพ็กและการใช้งาน | `GET /api/mobile/team/quota` | the overflow row is read-only in 2.0 (PAUSE) |
| C2 · แพ็ก | `GET /api/mobile/team/packs` `POST /api/mobile/team/sale-notify` | task counts are rendered only when `approxTasks` is not null (R-C3) |
| C3 · เติมโควตา | `GET /api/mobile/team/packs` | disabled informational screen in 2.0: no payment endpoint is ever called (R-C8) |
| C4 · เมนู | `GET /api/mobile/team/summary` `GET /api/mobile/team/quota` `POST /api/mobile/auth/logout` `POST /api/mobile/webview-session` | rows navigate; "ใบเสร็จ & ใบกำกับภาษี" is disabled (R-C12); language is read-only (Thai) |
| C5 · ความรู้ของร้าน | `GET /api/mobile/team/knowledge` `PUT /api/mobile/team/knowledge` `POST /api/mobile/team/knowledge/items` | search filters the loaded list on the device |
| C6 · บันทึกการกระทำ | `GET /api/mobile/team/actions` `POST /api/mobile/team/actions/[id]/undo` | the "ยกเลิกได้" pill is shown while `undoUntil` is in the future |
| C7 · การแจ้งเตือน | `GET /api/mobile/team/notify-prefs` `PUT /api/mobile/team/notify-prefs` | per user × tenant |
| C8 · ผู้อนุมัติ & คนในทีม | `GET /api/mobile/team/people` `POST /api/mobile/webview-session` | rules are read-only; "+ เชิญคนในทีม" opens the web invite page in the existing webview |
| D1 · เริ่มใช้ครั้งแรก | client-only | pre-login screen: three static selling points and the free-pack line from the app i18n (T0.4 — no task count, R-A5); the two buttons navigate to sign-up / login (T2.13, existing auth routes) |
| D2 · สร้างกิจการ | `POST /api/mobile/tenants` `POST /api/mobile/dna/answers` `POST /api/mobile/webview-session` | the five type chips map to `industryHint` on the device; connect buttons open the web settings pages (R-C6); skippable |
| D3 · จ้างคนแรก | `GET /api/mobile/team/positions/recommend` `GET /api/mobile/team/positions` `POST /api/mobile/team/employees` | quick hire = the same single call with the template values |
| D4 · โควตาหมด | `GET /api/mobile/team/quota` `GET /api/mobile/team/packs` `POST /api/mobile/team/sale-notify` | shown when `state` is EXHAUSTED or PAUSED |
| D5 · ตีกลับ + สอนงาน | `POST /api/mobile/team/inbox/teach` `POST /api/mobile/team/inbox/teach/confirm` | before T4.1 "ตีกลับ" is `inbox/decide` with REJECT + note |
| D6 · เลื่อนขั้น ให้ทำเอง | `GET /api/mobile/team/promotions` `POST /api/mobile/team/promotions/[id]/accept` `POST /api/mobile/team/promotions/[id]/dismiss` | T4.4 |
| D7 · ผลงานทีม | `GET /api/mobile/team/report` | no money anywhere (AT-F16.3) |
| D8 · มุมมองผู้อนุมัติ | `GET /api/mobile/team/summary` `GET /api/mobile/team/inbox` `POST /api/mobile/team/inbox/decide` `POST /api/mobile/team/inbox/teach` | shown when `viewerRole` is APPROVER; tab "ตรวจแล้ว" = `view=DECIDED_TODAY`; tab "สั่งงาน AI" is A1 |
| E1 · ห้องแผนกทั้งหมด | `GET /api/mobile/team/summary` `GET /api/mobile/team/rooms` | "ระบบแนะนำ" = `suggestions` of the rooms list; "ตั้งลำดับ" opens E4 |
| E2 · ห้องแผนก | `GET /api/mobile/team/rooms/[id]` `POST /api/mobile/team/rooms/[id]/tasks` `GET /api/mobile/team/tasks/[id]` `GET /api/mobile/conversations/[id]/messages` `POST /api/mobile/chat/send` `POST /api/mobile/team/inbox/decide` | "อนุมัติและส่งต่อ" = APPROVE; the hand-off follows on the server |
| E3 · สร้างห้องแผนก | `GET /api/mobile/team/employees` `GET /api/mobile/team/people` `POST /api/mobile/team/rooms` `PATCH /api/mobile/team/rooms/[id]` `POST /api/mobile/team/rooms/[id]/archive` | a room never widens anyone's rights (X2) |
| E4 · ลำดับส่งต่องาน | `GET /api/mobile/team/flows` `POST /api/mobile/team/flows/draft` `POST /api/mobile/team/flows` `PATCH /api/mobile/team/flows/[id]` `DELETE /api/mobile/team/flows/[id]` `POST /api/mobile/team/flows/[id]/run` | dragging reorders the local draft |

## 3. Every element of the 36 mockups → what it does

Source: the HTML the generators in `ledger/design-ai-team/gen_*.py` emit (`ai-team-airy-{a..e}.html`). "nav" = navigation only (client-only, no request of its own); a route = the request the element triggers. Rule for the reviewer: an element without a route must say why.

| Where | Element | Action |
|---|---|---|
| all screens | business name ▾ in the header | nav → sheet A2 |
| all screens | avatar stack (people + AI, +N) top right | nav → menu C4 (own avatar) · data from `summary.people` / employee detail `commanders` |
| A1 | search box "ค้นหาพนักงาน งาน หรือลูกค้า" | `GET team/search?q=` (debounced, ≥ 2 characters): employees → A3 · tasks → A5 · customers → the employee picker to start a task about that customer |
| A1 | card "งานเสร็จวันนี้" · "เวลาที่ประหยัด" | display (`summary.today`) |
| A1 | card "รออนุมัติ ›" | nav → A7 |
| A1 | quota bar "โควตาเดือนนี้ %" | nav → C1 (`summary.quotaPct`, `summary.cycleEndsAt`) |
| A1 | tabs ทั้งหมด / รออนุมัติ n / กำลังทำงาน / เสร็จ | client-only filter on `liveStatus`; counters from `summary.counts` |
| A1 | employee card | nav → A3 |
| A1 (E1) | switch พนักงาน / ห้องแผนก | nav between the two lists (`GET employees` · `GET rooms`) |
| A2 | business row | client-only: `switchTenant(tenantId)` then reload |
| A2 | "+ เพิ่มกิจการใหม่" | nav → D2 (`POST /api/mobile/tenants`) |
| A2 | "แพ็กฟรี · โควตาใช้ร่วมกันทุกกิจการ %" | display (`GET quota`) |
| A3 | "+" top right | nav → A4 |
| A3 | strip "จำได้ทุกงาน — คู่มือ vN · ความรู้ · ลูกค้า n" | nav → B7 (numbers from employee detail `memory`) |
| A3 | tabs งาน n / งานประจำ n / เก็บแล้ว | `GET tasks?filter=` · `GET schedules?aiEmployeeId=` |
| A3 | task row | nav → A5 |
| A3 | recurring-task row | nav → A6 (edit) |
| A4 | frequent-task chip (4) | client-only: puts `orderText` into the input |
| A4 | "🔁 ทำเป็นงานประจำ" | nav → A6 |
| A4 | "+" in the input bar | client-only: image picker (existing chat attach, ≤ 2 MB → `imageUrls`) |
| A4 | microphone | client-only: device dictation fills the input; hidden when the device has none |
| A4 | send | `POST employees/[id]/tasks` then `POST /api/mobile/chat/send` with the new `conversationId` |
| A5 | "⋯" menu: เสร็จ / เก็บ | `POST tasks/[id]/done` · `POST tasks/[id]/archive` |
| A5 | proposal card "แก้" | opens the edit sheet → `POST inbox/decide` with `edits` |
| A5 | proposal card "อนุมัติและ…" | `POST /api/mobile/proposals/confirm` (DESTRUCTIVE: second tap sends `confirm2x`) |
| A5 | proposal card "ตีกลับ" (overflow) | `POST /api/mobile/proposals/reject`; from T4.1 nav → D5 |
| A5 | plan card ยืนยัน / ไม่เอา | `POST /api/mobile/plans/confirm` · `POST /api/mobile/plans/reject` |
| A5 | input "สั่งงานต่อในงานนี้…" | `POST /api/mobile/chat/send` |
| A6 | "บันทึก" | `POST schedules` / `PATCH schedules/[id]` |
| A6 | "เปลี่ยน" (ผู้ทำ) | client-only picker over `GET employees` |
| A6 | frequency chips · time · day chips · channel chips | client-only form state |
| A6 | "ร่าง + รออนุมัติ" / "ทำเองได้" | client-only form state; "ทำเองได้" disabled until the employee has an AUTO grant (T4.2) |
| A6 | delete (in "⋯" when editing) | `DELETE schedules/[id]` |
| A7 | "ทุกกิจการ ⌄" | client-only picker → `GET inbox?tenantId=` |
| A7 | tabs ทั้งหมด / เงิน / ส่งลูกค้า / โพสต์ | `GET inbox?filter=`; counters from `counts` |
| A7 | "ดู" | nav → A5 (after `switchTenant` when needed) |
| A7 | "แก้" | edit sheet → `POST inbox/decide` with `edits` |
| A7 | "อนุมัติ…" | `POST inbox/decide` APPROVE with the row's `X-Tenant-Id` |
| A8 | recommended position card (3) | nav → D3 with that position |
| A8 | "ดูตำแหน่งทั้งหมด" | nav → B1 |
| B1–B5 | "✕" close · step indicator | client-only: keeps the draft on the device (AsyncStorage) |
| B1 | search · category tabs | client-only filter |
| B1 | position card · "＋ สร้างตำแหน่งเอง" | client-only: selects `positionKey` (`custom` = empty template) |
| B1–B3 | "ถัดไป" | nav → next step |
| B2 | name field · gender / tone / humour / length chips · language chips · "+ เพิ่ม" | client-only draft; each change → debounced `POST persona/sample-speech` |
| B3 | section card (6) | nav → B4 for that section |
| B3 | "🎙 พูดอธิบายเอง" | device dictation or typing → `POST team/manual/draft` during a hire · `POST employees/[id]/manual/draft` for an existing employee (both return a draft, save nothing) |
| B3 | "📎 แนบเอกสาร SOP" | file picker → queued → `POST employees/[id]/manual/attach` after the employee exists |
| B4 | drag handle · "−" · "＋ เพิ่มข้อ" · suggestion chips | client-only draft |
| B4 | reply text · "แจ้งคุณทันที" switch | client-only draft (`forbiddenReply`, `notifyOnForbidden`) |
| B4 | "บันทึก" | hire flow: back to B3 (draft) · existing employee: `POST employees/[id]/manual` |
| B5 | level chips per system (4 × n) | client-only draft; AUTO disabled with `autoHint` until T4.2 (R-C7) |
| B5 | "เวลาทำงาน" · "ใช้โควตาได้สูงสุด" | client-only pickers (`workHours`, `quotaCapPct` 5–100) |
| B5 | "จ้าง<ชื่อ>" | one `POST employees` (employee + access + manual v1 in one transaction; a failure creates nothing) → queued SOP files → `POST employees/[id]/manual/attach` |
| B6 | first-task shortcut (3) | `POST employees/[id]/tasks` + `POST /api/mobile/chat/send` |
| B6 | "กลับหน้าทีม" / "สั่งงานแรก" | nav → A1 / A4 |
| B7 | rows ตัวตน / คู่มือ / สิทธิ์ / ความรู้ | nav → B2 / B3 / B5 / C5 (edit mode: `PATCH employees/[id]`, `POST manual`, `PUT access`, `PUT knowledge`) |
| B7 | "พักงาน" (or "กลับมาทำงาน") | `POST employees/[id]/pause` · `POST employees/[id]/resume` |
| B7 | "เลิกจ้าง" | confirm sheet with a reason ≥ 5 characters → `POST employees/[id]/terminate`; absent for the default employee |
| B8 | "ย้อนกลับไปใช้" | confirm → `POST employees/[id]/manual/revert` |
| C1 | "ดูแพ็กทั้งหมด" | nav → C2 |
| C1 | per-employee bar | nav → B7 |
| C1 | "ถ้าโควตาหมดก่อนรอบใหม่: พักทีมจนรอบใหม่" | display only in 2.0 |
| C2 | paid pack cards | disabled ("เร็ว ๆ นี้") |
| C2 · D4 | "แจ้งฉันเมื่อเปิดขาย" | `POST sale-notify` |
| C3 | amount chips · card · PromptPay · tax invoice row · "ยังไม่เปิดให้เติม" | all disabled: client-only, no request (R-C8) |
| C4 | แพ็กและการใช้งาน / ความรู้ของร้าน / ผู้อนุมัติ & คนในทีม / บันทึกการกระทำ / การแจ้งเตือน | nav → C1 / C5 / C8 / C6 / C7 |
| C4 | ใบเสร็จ & ใบกำกับภาษี | disabled "เร็ว ๆ นี้" (R-C12) |
| C4 | ภาษาแอป | display only (Thai) |
| C4 | ช่วยเหลือ | nav → the app's existing help screen |
| C4 | "เปิดเว็บหลังร้าน" | `POST /api/mobile/webview-session` → existing webview |
| C4 | โหมดมืด (T5.4) | client-only: stored on the device |
| C4 | "ออกจากระบบ" | two-step confirm → `POST /api/mobile/auth/logout` |
| C5 | search | client-only filter |
| C5 | row → "ใครเห็น" picker | `PUT knowledge` |
| C5 | add (＋) | `POST knowledge/items` |
| C6 | tabs ทั้งหมด / ส่งลูกค้า / เงิน / แก้ข้อมูล | `GET actions?filter=` |
| C6 | "ยกเลิกได้" | confirm with a reason → `POST actions/[id]/undo` |
| C7 | five event rows (switch + time) · three channel chips · do-not-disturb · urgent choice | `PUT notify-prefs` (saved on change) |
| C8 | person row | display |
| C8 | three rule rows | display (from `ApprovalPolicy`, `AiSettings`, `ai.action.undo`) |
| C8 | "＋ เชิญคนในทีม" | `POST /api/mobile/webview-session` → web invite page |
| D1 | "เริ่มใช้ฟรี" / "มีบัญชี SHARK แล้ว · เข้าสู่ระบบ" | nav → sign-up / login (T2.13) |
| D2 | name field · five type chips | client-only form → `POST /api/mobile/tenants` then `POST /api/mobile/dna/answers` |
| D2 | LINE OA / Facebook · Instagram / สินค้า & ราคา | `POST /api/mobile/webview-session` → web settings page (R-C6) |
| D2 | "ถัดไป" · "ข้ามได้" | nav → D3 |
| D3 | "แก้" (3) · other position chips | nav → B2 / B3 / B5 · client-only: switches the template |
| D3 | "ปรับละเอียด" | nav → B1 (four steps) |
| D3 | "จ้างเลย" | one `POST employees` with the template values |
| D4 | "ตกลง · รอรอบใหม่" | nav → A1 |
| D5 | category chips · note field · "เฉพาะงานนี้" / "จำเป็นกฎในคู่มือ" | client-only form; choosing MANUAL calls `POST inbox/teach` to get "💡 เข้าใจว่า" + the proposed rule |
| D5 | "ส่งกลับให้แก้ + บันทึกกฎ" | `POST inbox/teach/confirm` |
| D6 | level chips · three condition rows | client-only form (limits) |
| D6 | "ยังก่อน" / "ให้ทำเองได้" | `POST promotions/[id]/dismiss` · `POST promotions/[id]/accept` |
| D7 | month picker "⌄" | `GET report?month=` |
| D7 | "ดู ›" on a warning row | nav → B8 of that employee |
| D8 | tabs รอตรวจ n / ตรวจแล้ว / สั่งงาน AI | `GET inbox?view=PENDING` · `GET inbox?view=DECIDED_TODAY` · nav → A1 |
| D8 | "ดู" / "ตีกลับ" / "อนุมัติ…" | nav → A5 · D5 (`inbox/teach`) · `POST inbox/decide` |
| E1 | room card | nav → E2 |
| E1 | "＋ สร้างห้องแผนก" | nav → E3 |
| E1 | suggestion "ตั้งลำดับ" | nav → E4 prefilled by `POST flows/draft` |
| E2 | "แก้" / "อนุมัติและส่งต่อ" | `POST inbox/decide` (`edits` / APPROVE) |
| E2 | input "สั่งงานต่อในห้องนี้…" | first order: `POST rooms/[id]/tasks`; follow-ups: `POST /api/mobile/chat/send` |
| E3 | "สร้าง" | `POST rooms` (edit: `PATCH rooms/[id]`) |
| E3 | employee rows · "รับงานก่อน" · commander avatars | client-only form (`memberIds`, `leadId`, `commanderUserIds`) |
| E4 | "บันทึก" | `POST flows` / `PATCH flows/[id]` |
| E4 | drag · "＋ เพิ่มขั้น" · mode pill per step | client-only draft (AUTO is lowered to DRAFT by the server without a real grant) |
| E4 | two rule rows | display (`onStuck` ASK · `staleHours` 4) |

## 4. Routes of T1.10 (the team API · `src/app/api/mobile/team/**`)

"Common errors" below = `401 unauthorized` · `403 missing_tenant` / `forbidden` / `suspended` · `404 not_found` · `429 rate_limited` (§1.3). Sections name only what is specific.

### GET /api/mobile/team/summary

Header and summary cards of the team screen (A1 / A8), the menu (C4) and each row of the business switcher (A2).

- **Auth:** `requireMobile` (Bearer + `X-Tenant-Id`)
- **Permission:** any accepted member (the numbers are counts only); `viewerRole` is computed from real rights, not from the role string
- **Request:** no body
- **Response:** `200` `ZTeamSummaryResponse`
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZTeamSummaryResponse = z.object({
  tenant: z.object({ id: ZId, name: z.string() }),
  // OWNER = role OWNER · APPROVER = not OWNER and may confirm at least one proposal kind · MEMBER = neither (D8 is shown to APPROVER)
  viewerRole: z.enum(["OWNER", "APPROVER", "MEMBER"]),
  viewer: z.object({ canManage: z.boolean(), canUse: z.boolean(), canGrantAuto: z.boolean(), canUndo: z.boolean() }),
  people: z.object({ count: z.number().int(), avatars: z.array(ZPerson).max(4) }),
  aiCount: z.number().int(),
  roomCount: z.number().int(), // 0 until T5.1
  pack: ZPack,
  quotaPct: ZPct,
  quotaState: ZQuotaState,
  cycleEndsAt: ZIso,
  today: z.object({
    tasksDone: z.number().int(),
    hoursSaved: z.number().nullable(), // null until T4.5 (R-C4) — the card shows "—"
    pendingApprovals: z.number().int(),
    approvedByMe: z.number().int(), // D8 header
    rejectedByMe: z.number().int(),
  }),
  counts: z.object({ ALL: z.number().int(), WAITING: z.number().int(), WORKING: z.number().int(), DONE: z.number().int() }), // tabs of A1
  menu: z.object({ knowledgeCount: z.number().int(), peopleCount: z.number().int() }), // C4
});
```

### GET /api/mobile/team/search

The search box of the team screen (A1: "ค้นหาพนักงาน งาน หรือลูกค้า" — the screen must match the approved mockup; reviewer SF6). Route: T1.10 · screen: T2.2. Three groups, this tenant only: employees (name, position), tasks the caller may see (`canSeeTask`, by title), customers (`CrmContact` display name) — the customer group is returned **only when the caller himself has CRM read permission**, and carries ids and names only: no phone, no e-mail, no note (X8).

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`; the `customers` group additionally needs the caller's own CRM contact read permission (else it is an empty list)
- **Request:** query `q` (2–60 characters after trim) · `limit` per group (≤ 10, default 5)
- **Response:** `200` `ZTeamSearchResponse`
- **Errors:** common errors · `400 validation` (`q` too short / long)
- **Rate limit:** `mobile-team-search:<userId>` 60 / minute

```ts
const ZTeamSearchResponse = z.object({
  q: z.string(),
  employees: z.array(ZEmployeeRef.extend({ liveStatus: ZLiveStatus })).max(10),
  tasks: z.array(z.object({ id: ZId, conversationId: ZId, title: z.string(), state: ZTaskState, aiEmployee: ZEmployeeRef })).max(10),
  customers: z.array(z.object({ id: ZId, name: z.string(), company: z.string().nullable() })).max(10), // CrmContact — display name only
});
```

### GET /api/mobile/team/quota

Pack, cycle and per-employee use as percentages (C1 · A2 · D4). RESOLUTIONS R-E C19: the v2 app reads this route, `/api/mobile/usage` stays for the 1.0 app.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`
- **Request:** no body
- **Response:** `200` `ZTeamQuotaResponse` — percentages only
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZTeamQuotaResponse = z.object({
  pack: ZPack,
  quotaPct: ZPct,
  state: ZQuotaState,
  cycleStartsAt: ZIso,
  cycleEndsAt: ZIso,
  daysLeft: z.number().int(),
  enoughUntilReset: z.boolean().nullable(), // "✓ พอใช้ถึงรอบใหม่" — null when there is too little history
  shared: z.object({ ownerBound: z.boolean(), tenantCount: z.number().int() }), // FREE pack is bound to the owner (R-A3)
  overflowMode: z.enum(["PAUSE", "WALLET", "ASK"]), // always PAUSE in 2.0
  perEmployee: z.array(z.object({ aiEmployee: ZEmployeeRef, pct: ZPct, capPct: ZPct, paused: z.boolean() })),
  thisCycle: z.object({ tasksDone: z.number().int(), hoursSaved: z.number().nullable(), waitingForQuota: z.number().int() }), // D4
});
```

### GET /api/mobile/team/employees

The team list with live status (A1), also the employee picker of A6 / E3.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`
- **Request:** query `include=terminated` (optional; default hides TERMINATED)
- **Response:** `200` `ZEmployeesResponse` — this route never creates a row. The default employee "ผู้ช่วยทั่วไป" (`isDefault: true`) is listed once it exists (T1.2 creates it lazily for a shop that already used the 1.0 assistant, T6.1 backfills the rest); an empty list means "show A8"
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZEmployeesResponse = z.object({ employees: z.array(ZEmployeeCard) });
```

### POST /api/mobile/team/employees

Hire an employee (B5 / D3) — **one call, one transaction**: the employee, its access rows and manual version 1 are created together or not at all (controller ruling 8 Oct, D2). There is no half-hired employee and no hard delete; a repeated `idempotencyKey` returns the same employee. ⚠ This replaces the three-call sequence + rollback that the T2.9 contract (S6) describes — the controller updates that brief.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.manage`
- **Request:** `ZEmployeeCreateRequest`
- **Response:** `200` `ZEmployeeCreateResponse` (the same id for a repeated `idempotencyKey`)
- **Errors:** common errors · `400 validation` (empty name, > 60 characters, HTML, unknown `positionKey`, cap outside 5–100, a manual section over its limits) · `403 cannot_grant_beyond_self` · `409 employee_auto_not_granted` (a row with `level: "AUTO"`) — any of them creates nothing
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZEmployeeCreateRequest = z.object({
  name: z.string().trim().min(1).max(60),
  positionKey: z.string().min(1).max(40), // a key of GET positions, or "custom"
  persona: ZPersona,
  quotaCapPct: z.number().int().min(5).max(100),
  workHours: ZWorkHours.default({ always: true }),
  commanderUserIds: z.array(ZId).max(50).default([]), // empty = everyone with ai.employee.use
  // omitted = the template's default levels / the template's manual (quick hire D3 sends neither)
  access: z.array(z.object({ skillId: z.string().min(1).max(40), level: z.enum(["OFF", "READ", "DRAFT"]) })).max(40).optional(),
  manual: z.object({ sections: ZManualSections, note: z.string().trim().max(200).optional() }).optional(),
  idempotencyKey: z.string().min(8).max(80),
});
const ZEmployeeCreateResponse = z.object({ id: ZId, manualVersion: z.literal(1) });
```

### GET /api/mobile/team/employees/[id]

Profile (B7), header of the task list (A3), the new-task screen (A4) and the hired screen (B6).

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`
- **Request:** no body
- **Response:** `200` `ZEmployeeDetailResponse`
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZEmployeeDetailResponse = z.object({
  employee: ZEmployeeCard.extend({
    persona: ZPersona,
    personaLine: z.string(), // "ผู้ชาย · สุภาพ · ขำนิดหน่อย"
    quotaCapPct: ZPct,
    quotaUsedPct: ZPct, // of the pack allowance, this cycle
    workHours: ZWorkHours,
    hiredAt: ZIso,
    commanders: z.array(ZPerson), // empty list = everyone with ai.employee.use
    viewerCanCommand: z.boolean(),
  }),
  greeting: z.string(), // "ให้ผมช่วยอะไรดีครับ" — built from the persona, no model call
  accessSummary: z.array(z.object({ skillId: z.string(), label: z.string(), level: ZAccessLevel })), // "เข้าถึง CRM · ใบเสนอราคา · …"
  frequentTasks: z.array(ZFrequentTask).max(8),
  memory: z.object({ manualVersion: z.number().int(), knowledgeCount: z.number().int(), customerCount: z.number().int() }),
  stats: z.object({
    tasksThisMonth: z.number().int(),
    passPct: z.number().min(0).max(100).nullable(), // approved without an edit
    hoursSaved: z.number().nullable(), // null until T4.5
    manualSections: z.number().int(),
    systemsOpen: z.number().int(),
  }),
});
```

### PATCH /api/mobile/team/employees/[id]

Edit name, persona, cap, working hours or the commander list (B7 → B2 / B5).

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.manage`
- **Request:** `ZEmployeePatchRequest` (at least one key)
- **Response:** `200` `ZEmployeePatchResponse`
- **Errors:** common errors · `400 validation` · `409 employee_paused`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZEmployeePatchRequest = z
  .object({
    name: z.string().trim().min(1).max(60),
    persona: ZPersona,
    quotaCapPct: z.number().int().min(5).max(100), // raising it lifts a QUOTA_CAP pause at once
    workHours: ZWorkHours,
    commanderUserIds: z.array(ZId).max(50),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0);
const ZEmployeePatchResponse = z.object({ employee: ZEmployeeCard });
```

### POST /api/mobile/team/employees/[id]/pause

"พักงาน" (B7). Running tasks stop taking new turns; rooms stay readable.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.manage`
- **Request:** `ZEmployeePauseRequest`
- **Response:** `200` `ZEmployeePauseResponse`
- **Errors:** common errors · `409 employee_paused`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZEmployeePauseRequest = z.object({ reason: z.string().trim().max(200).optional() });
const ZEmployeePauseResponse = z.object({ employee: ZEmployeeCard });
```

### POST /api/mobile/team/employees/[id]/resume

Back to work after a manual pause. A QUOTA_CAP / TEAM_QUOTA pause is lifted by the quota, not by this route.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.manage`
- **Request:** `ZEmployeeResumeRequest` (empty object)
- **Response:** `200` `ZEmployeeResumeResponse`
- **Errors:** common errors · `409 employee_paused` · `409 employee_quota_cap` · `409 team_quota_exhausted`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZEmployeeResumeRequest = z.object({}).strict();
const ZEmployeeResumeResponse = z.object({ employee: ZEmployeeCard });
```

### POST /api/mobile/team/employees/[id]/terminate

"เลิกจ้าง" (B7) — dangerous action (X9): explicit confirm and a reason. Open tasks become ARCHIVED, recurring tasks stop, rooms stay readable.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.manage`
- **Request:** `ZEmployeeTerminateRequest`
- **Response:** `200` `ZEmployeeTerminateResponse`
- **Errors:** common errors · `400 validation` (no `confirm`, reason shorter than 5 characters) · `409 default_employee_protected`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZEmployeeTerminateRequest = z.object({ confirm: z.literal(true), reason: z.string().trim().min(5).max(300) });
const ZEmployeeTerminateResponse = z.object({ ok: z.literal(true), archivedTasks: z.number().int(), stoppedSchedules: z.number().int() });
```

### GET /api/mobile/team/positions

Position templates (B1) with everything the later steps prefill: default levels (B5), manual in Thai (B3 / B4), frequent tasks, sample speech.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`
- **Request:** no body
- **Response:** `200` `ZPositionsResponse` — only skills that surface for this tenant's systems (R-E C30); no template has a default level AUTO
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZPosition = z.object({
  key: z.string(), // sales | chat | account | content | member | custom
  label: z.string(),
  summary: z.string(), // "CRM · ใบเสนอราคา · ตามดีล"
  category: z.enum(["SALES", "SERVICE", "ACCOUNT", "MARKETING", "OTHER"]),
  orbColor: z.string(),
  available: z.boolean(), // false when the tenant lacks the systems the position needs
  access: z.array(ZAccessRow),
  manual: ZManualSections, // Thai display text only; the English text the model reads never leaves the server
  suggestions: z.record(z.enum(MANUAL_SECTION_KEYS), z.array(z.string()).max(10)), // "แนะนำจากร้านแบบเดียวกัน"
  frequentTasks: z.array(ZFrequentTask),
  defaultPersona: ZPersona,
  defaultName: z.string(),
  defaultQuotaCapPct: ZPct,
});
const ZPositionsResponse = z.object({ positions: z.array(ZPosition) });
```

### GET /api/mobile/team/positions/recommend

Positions suggested from the shop's own signals (A8 / D3): customer chats waiting, open invoices, no post for 7 days. Reads this tenant only.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`
- **Request:** no body
- **Response:** `200` `ZPositionsRecommendResponse` (may be empty)
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZPositionsRecommendResponse = z.object({
  recommendations: z.array(z.object({ key: z.string(), label: z.string(), reason: z.string(), signal: z.enum(["CHAT_WAITING", "INVOICE_OPEN", "NO_POST", "DEFAULT"]), count: z.number().int().nullable() })).max(3),
});
```

### GET /api/mobile/team/employees/[id]/manual

The current manual version (B3 / B4 in edit mode).

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`
- **Request:** no body
- **Response:** `200` `ZManualResponse`
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZManualResponse = z.object({
  version: z.number().int(),
  sections: ZManualSections,
  note: z.string().nullable(),
  source: z.enum(["HIRE", "EDIT", "TEACH", "REVERT"]),
  editedBy: ZPerson,
  createdAt: ZIso,
  attachments: z.array(z.object({ id: ZId, fileName: z.string(), pages: z.number().int().nullable() })), // no file URL — files go through the private file route
});
```

### GET /api/mobile/team/employees/[id]/manual/versions

Version history (B8), newest first, each with a short diff against the version before it.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`
- **Request:** no body
- **Response:** `200` `ZManualVersionsResponse`
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZManualVersionsResponse = z.object({
  versions: z.array(
    z.object({
      version: z.number().int(),
      current: z.boolean(),
      note: z.string().nullable(),
      source: z.enum(["HIRE", "EDIT", "TEACH", "REVERT"]),
      editedBy: ZPerson,
      createdAt: ZIso,
      diff: z.array(z.object({ section: z.enum(MANUAL_SECTION_KEYS), added: z.array(z.string()), removed: z.array(z.string()) })),
      effect: z.object({ beforePct: z.number(), afterPct: z.number() }).nullable(), // "📈 หลังแก้ 88% → 94%" — T4.7, needs ≥ 20 tasks on both sides
    }),
  ),
});
```

### POST /api/mobile/team/employees/[id]/manual

Save a new manual version (append-only; version = max + 1 in one transaction). "บันทึก" of B4 for an existing employee (manual version 1 is written by `POST employees`).

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.manage`
- **Request:** `ZManualSaveRequest`
- **Response:** `200` `ZManualSaveResponse`
- **Errors:** common errors · `400 validation` (a section over 2,000 characters or 20 items) · `409 employee_paused`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZManualSaveRequest = z.object({ sections: ZManualSections, note: z.string().trim().max(200).optional() }); // source is EDIT; HIRE is written only by POST employees
const ZManualSaveResponse = z.object({ version: z.number().int() });
```

### POST /api/mobile/team/employees/[id]/manual/revert

"ย้อนกลับไปใช้" (B8): creates a NEW version that copies an old one. Nothing is deleted.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.manage`
- **Request:** `ZManualRevertRequest`
- **Response:** `200` `ZManualRevertResponse`
- **Errors:** common errors · `400 validation` (no `confirm`, unknown version)
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZManualRevertRequest = z.object({ version: z.number().int().min(1), confirm: z.literal(true) });
const ZManualRevertResponse = z.object({ version: z.number().int() });
```

### POST /api/mobile/team/employees/[id]/manual/draft

"พูดอธิบายเอง" (B3): the model sorts free text into the six sections and returns a DRAFT. Saves nothing. Calls the model ⇒ charged through the one charging path (X11). For an EXISTING employee only (charged to that employee); during a hire use `POST /api/mobile/team/manual/draft`.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.manage`
- **Request:** `ZManualDraftRequest`
- **Response:** `200` `ZManualDraftResponse`
- **Errors:** common errors · `400 validation` · `409 team_quota_exhausted` · `409 employee_quota_cap`
- **Rate limit:** `mobile-team-ai:<userId>` 10 / minute

```ts
const ZManualDraftRequest = z.object({ text: z.string().trim().min(10).max(6000) });
const ZManualDraftResponse = z.object({ sections: ZManualSections });
```

### POST /api/mobile/team/manual/draft

"พูดอธิบายเอง" (B3) **during a hire**, when no employee exists yet (controller ruling 8 Oct, D3 — a dedicated route instead of a reserved id): the model sorts free text into the six sections of the chosen position and returns a DRAFT. Saves nothing. Calls the model ⇒ charged through the one charging path, attributed to the tenant (no employee yet) (X11).

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.manage`
- **Request:** `ZHireManualDraftRequest`
- **Response:** `200` `ZHireManualDraftResponse`
- **Errors:** common errors · `400 validation` (unknown `positionKey`, text too short / long) · `409 team_quota_exhausted`
- **Rate limit:** `mobile-team-ai:<userId>` 10 / minute

```ts
const ZHireManualDraftRequest = z.object({ positionKey: z.string().min(1).max(40), text: z.string().trim().min(10).max(6000) });
const ZHireManualDraftResponse = z.object({ sections: ZManualSections });
```

### GET /api/mobile/team/employees/[id]/access

Access level per system (B5) with the Thai group labels.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`
- **Request:** no body
- **Response:** `200` `ZAccessResponse`
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZAccessResponse = z.object({
  access: z.array(ZAccessRow),
  viewerCanGrantAuto: z.boolean(), // OWNER or ai.access.grant — still false for every row until T4.2
});
```

### PUT /api/mobile/team/employees/[id]/access

Set levels of an existing employee (B7 → B5; the levels of a new hire travel inside `POST employees`). The caller cannot give a level for a module he cannot use himself; AUTO is refused until T4.2 and for DESTRUCTIVE kinds forever.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.manage`; a row with `level: "AUTO"` also needs `ai.access.grant` + `canGrantPermission` of the skill's module, plus `auto`
- **Request:** `ZAccessPutRequest`
- **Response:** `200` `ZAccessPutResponse`
- **Errors:** common errors · `400 validation` · `403 cannot_grant_beyond_self` · `409 employee_auto_not_granted` · `409 auto_forbidden_kind` · `409 employee_paused`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZAccessPutRequest = z.object({
  items: z
    .array(
      z.object({
        skillId: z.string().min(1).max(40),
        level: ZAccessLevel,
        auto: z.object({ maxSatang: z.number().int().min(0).optional(), maxDiscountPct: z.number().min(0).max(100).optional(), confirm: z.literal(true), reason: z.string().trim().min(5).max(300) }).optional(), // T4.2
      }),
    )
    .min(1)
    .max(40),
});
const ZAccessPutResponse = z.object({ access: z.array(ZAccessRow) });
```

### GET /api/mobile/team/employees/[id]/tasks

Tasks of one employee (A3). A task = one conversation bound to the employee (`AiTask`).

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`; rows are limited to tasks the caller may see (`canSeeTask`: starter ∪ commanders ∪ users who may confirm a pending kind)
- **Request:** query `filter=ALL|WAITING|WORKING|DONE|ARCHIVED` (default `ALL` = everything except ARCHIVED) · `cursor` · `limit` (≤ 50)
- **Response:** `200` `ZEmployeeTasksResponse`
- **Errors:** common errors · `400 validation`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZTaskRow = z.object({
  id: ZId, // AiTask.id
  conversationId: ZId,
  title: z.string(),
  state: ZTaskState,
  statusLine: z.string(), // "ร่าง Q-0012 ฿12,500 · 9:41"
  pendingProposals: z.number().int(),
  startedBy: ZPerson,
  roomId: ZId.nullable(),
  updatedAt: ZIso,
});
const ZEmployeeTasksResponse = z.object({
  tasks: z.array(ZTaskRow),
  counts: z.object({ OPEN: z.number().int(), WAITING: z.number().int(), WORKING: z.number().int(), DONE: z.number().int(), ARCHIVED: z.number().int() }),
  nextCursor: z.string().nullable(),
});
```

### POST /api/mobile/team/employees/[id]/tasks

Start a task (A4 "send", B6 shortcuts). Creates the `AiTask` + the conversation `e~<aiEmployeeId>~<hex>`; the app then streams the first message through `POST /api/mobile/chat/send` with the returned `conversationId`. No model call here.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.use` + `ai.chat.send`, and the caller must be a commander of the employee
- **Request:** `ZTaskStartRequest`
- **Response:** `200` `ZTaskStartResponse` (the same task for a repeated `idempotencyKey`)
- **Errors:** common errors · `403 not_commander` · `409 employee_paused` · `409 employee_quota_cap` · `409 team_quota_exhausted`
- **Rate limit:** `mobile-team-task:<userId>` 30 / minute

```ts
const ZTaskStartRequest = z.object({
  title: z.string().trim().max(120).optional(),
  firstMessage: z.string().trim().max(4000).optional(), // used for the title only; the text itself is sent through chat/send
  idempotencyKey: z.string().min(8).max(80),
});
const ZTaskStartResponse = z.object({ taskId: ZId, conversationId: ZId });
```

### GET /api/mobile/team/tasks/[id]

Header and pending cards of one task room (A5 / E2) — what a deep link `shark://team/tasks/<id>` needs. Added to the T1.10 route list by the controller ruling of 8 Oct (D2): A5 cannot be opened from a push notification without it.

- **Auth:** `requireMobile`
- **Permission:** `canSeeTask` (starter ∪ commanders ∪ users who may confirm a pending kind) — otherwise `404`
- **Request:** no body
- **Response:** `200` `ZTaskDetailResponse`
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZTaskDetailResponse = z.object({
  task: ZTaskRow,
  aiEmployee: ZEmployeeRef,
  currentAiEmployee: ZEmployeeRef.nullable(), // room hand-off: who holds the turn (T5.2)
  commanders: z.array(ZPerson),
  viewerCanCommand: z.boolean(),
  proposals: z.array(ZProposalCard), // PENDING ones the viewer may see
  plans: z.array(z.object({ id: ZId, title: z.string(), hasDestructive: z.boolean(), steps: z.array(z.object({ summary: z.string(), status: z.string() })).max(8) })),
});
```

### POST /api/mobile/team/tasks/[id]/done

"เสร็จ" in the "⋯" menu of A5.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.use` + commander of the employee
- **Request:** `ZTaskDoneRequest` (empty object)
- **Response:** `200` `ZTaskDoneResponse`
- **Errors:** common errors · `403 not_commander`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZTaskDoneRequest = z.object({}).strict();
const ZTaskDoneResponse = z.object({ ok: z.literal(true), state: ZTaskState });
```

### POST /api/mobile/team/tasks/[id]/archive

"เก็บ" in the "⋯" menu of A5. The conversation stays readable; pending proposals are left to expire.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.use` + commander of the employee
- **Request:** `ZTaskArchiveRequest` (empty object)
- **Response:** `200` `ZTaskArchiveResponse`
- **Errors:** common errors · `403 not_commander`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZTaskArchiveRequest = z.object({}).strict();
const ZTaskArchiveResponse = z.object({ ok: z.literal(true), state: ZTaskState });
```

### GET /api/mobile/team/schedules

Recurring tasks (A3 tab "งานประจำ", A6) plus what the form needs: the pack limit and the quota estimate per run.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`
- **Request:** query `aiEmployeeId` (optional)
- **Response:** `200` `ZSchedulesResponse`
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZSchedule = z.object({
  id: ZId,
  aiEmployee: ZEmployeeRef,
  title: z.string(),
  instruction: z.string(),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  days: z.array(z.number().int().min(1).max(31)), // WEEKLY: 1–7 (Mon–Sun) · MONTHLY: 1–31 · DAILY: []
  minuteOfDay: z.number().int().min(0).max(1439), // Asia/Bangkok
  channels: z.array(z.enum(["APP", "LINE", "EMAIL"])).min(1),
  outputMode: z.enum(["DRAFT", "AUTO"]),
  active: z.boolean(),
  nextRunAt: ZIso.nullable(),
  lastRunAt: ZIso.nullable(),
});
const ZSchedulesResponse = z.object({
  schedules: z.array(ZSchedule),
  limit: z.object({ max: z.number().int(), used: z.number().int() }), // packs.ts maxScheduled
  estimates: z.array(z.object({ aiEmployeeId: ZId, quotaPctPerRun: z.number().min(0) })), // × runs per month on the device
  channelsAvailable: z.array(z.enum(["APP", "LINE", "EMAIL"])),
});
```

### POST /api/mobile/team/schedules

Create a recurring task (A6 "บันทึก"). A run that has to write produces a proposal (DRAFT), never a direct write (R-C2).

- **Auth:** `requireMobile`
- **Permission:** `ai.schedule.manage` + commander of the employee
- **Request:** `ZScheduleCreateRequest`
- **Response:** `200` `ZScheduleCreateResponse`
- **Errors:** common errors · `400 validation` (WEEKLY without a day, unknown channel) · `403 not_commander` · `409 schedule_limit` · `409 employee_auto_not_granted` (`outputMode: "AUTO"` without a grant) · `409 employee_paused`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZScheduleCreateRequest = z.object({
  aiEmployeeId: ZId,
  title: z.string().trim().min(1).max(80),
  instruction: z.string().trim().min(5).max(2000),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  days: z.array(z.number().int().min(1).max(31)).max(31).default([]),
  minuteOfDay: z.number().int().min(0).max(1439),
  channels: z.array(z.enum(["APP", "LINE", "EMAIL"])).min(1),
  outputMode: z.enum(["DRAFT", "AUTO"]).default("DRAFT"),
});
const ZScheduleCreateResponse = z.object({ schedule: ZSchedule });
```

### PATCH /api/mobile/team/schedules/[id]

Edit or switch a recurring task on / off.

- **Auth:** `requireMobile`
- **Permission:** `ai.schedule.manage` + commander of the employee
- **Request:** `ZSchedulePatchRequest` (any subset of the create body + `active`)
- **Response:** `200` `ZSchedulePatchResponse`
- **Errors:** common errors · `400 validation` · `403 not_commander` · `409 employee_auto_not_granted`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZSchedulePatchRequest = ZScheduleCreateRequest.partial().extend({ active: z.boolean().optional() });
const ZSchedulePatchResponse = z.object({ schedule: ZSchedule });
```

### DELETE /api/mobile/team/schedules/[id]

Remove a recurring task.

- **Auth:** `requireMobile`
- **Permission:** `ai.schedule.manage` + commander of the employee
- **Request:** no body
- **Response:** `200` `ZScheduleDeleteResponse`
- **Errors:** common errors · `403 not_commander`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZScheduleDeleteResponse = z.object({ ok: z.literal(true) });
```

### GET /api/mobile/team/inbox

Everything waiting for THIS user's decision, across every tenant he belongs to (A7 · D8). The only route without `X-Tenant-Id`.

- **Auth:** `requireMobileUser` (Bearer + all accepted memberships — R-E C21)
- **Permission:** per row: the membership of the row's tenant must pass `membershipCan` for the proposal kind and `canSeeTask` for the room. No `ai.chat.send` needed (R-E C33)
- **Request:** query `tenantId` (optional — one tenant) · `filter=ALL|MONEY|CUSTOMER|POST` · `view=PENDING|DECIDED_TODAY` (default `PENDING`) · `cursor` · `limit` (≤ 50)
- **Response:** `200` `ZInboxResponse`
- **Errors:** `401 unauthorized` · `400 validation` · `404 not_found` (`tenantId` the user is not a member of) · `429 rate_limited`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZInboxResponse = z.object({
  items: z.array(ZProposalCard),
  counts: z.object({ ALL: z.number().int(), MONEY: z.number().int(), CUSTOMER: z.number().int(), POST: z.number().int() }),
  tenants: z.array(z.object({ tenantId: ZId, name: z.string(), pending: z.number().int() })),
  today: z.object({ approved: z.number().int(), rejected: z.number().int() }),
  ownerThresholdSatang: z.number().int().nullable(), // "เกิน ฿X ส่งต่อให้เจ้าของ" — from the tenant's ApprovalPolicy when one tenant is selected
  nextCursor: z.string().nullable(),
});
```

### POST /api/mobile/team/inbox/decide

Approve or reject one proposal (A7 · D8 · the edit sheet of A5). Approve = the existing `executeProposal` with the caller's own membership of that tenant; the decision is recorded (`decidedById`, `decidedAt`, `AiActionLog`).

- **Auth:** `requireMobile` — `X-Tenant-Id` must be the tenant of the row (a wrong tenant answers `404`)
- **Permission:** the kind's own module permission (`KIND_ACCESS`), evaluated at this moment; no `ai.*` key (R-E C33)
- **Request:** `ZInboxDecideRequest`
- **Response:** `200` `ZInboxDecideResponse`
- **Errors:** common errors · `400 validation` (REJECT without a note of ≥ 5 characters) · `409 already_decided` · `409 needs_second_confirm` (DESTRUCTIVE without `confirm2x`) · `409 employee_access_off` · `409 employee_access_read_only`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZInboxDecideRequest = z.object({
  proposalId: ZId,
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(500).optional(),
  edits: z.object({ amountSatang: z.number().int().min(0).optional(), text: z.string().trim().max(4000).optional() }).optional(), // only keys listed in the card's `editable`
  confirm2x: z.boolean().optional(),
});
const ZInboxDecideResponse = z.object({
  ok: z.boolean(),
  status: z.enum(["PENDING", "EXECUTED", "REJECTED", "FAILED", "EXPIRED"]),
  note: z.string(), // Thai result line of the executed kind
  needsSecondConfirm: z.boolean().optional(),
});
```

### POST /api/mobile/team/persona/sample-speech

"ตัวอย่างการพูด" (B2): a template rendered from the persona values — **no model call**, nothing charged, nothing stored.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.manage`
- **Request:** `ZSampleSpeechRequest`
- **Response:** `200` `ZSampleSpeechResponse`
- **Errors:** common errors · `400 validation`
- **Rate limit:** `mobile-team-speech:<userId>` 30 / minute (the 31st call in a minute answers `429`)

```ts
const ZSampleSpeechRequest = z.object({ persona: ZPersona, positionKey: z.string().min(1).max(40), name: z.string().trim().min(1).max(60) });
const ZSampleSpeechResponse = z.object({ text: z.string() });
```

### GET /api/mobile/me

Existing route (`src/app/api/mobile/me/route.ts`). T1.10 adds `memberships[].uiVersion` (per tenant, from `AiSettings.uiVersion`, default 1); everything else keeps today's shape. There is **no** top-level value: the app mounts the v2 tree only while the ACTIVE tenant's `uiVersion` is 2 and shows the 1.0 screens for every tenant that is still at 1 (COMMON §C13; controller ruling 8 Oct, D1).

- **Auth:** `mobileUser` (Bearer only — no tenant chosen yet)
- **Permission:** none (own identity and own accepted memberships)
- **Request:** no body
- **Response:** `200` `ZMeResponse`
- **Errors:** `401 unauthorized`
- **Rate limit:** none (as today)

```ts
const ZMeResponse = z.object({
  user: z.object({ id: ZId, email: z.string(), name: z.string().nullable() }),
  memberships: z.array(
    z.object({
      tenantId: ZId,
      name: z.string(),
      role: z.enum(["OWNER", "MANAGER", "STAFF"]),
      uiVersion: z.union([z.literal(1), z.literal(2)]), // NEW (T1.10): AiSettings.uiVersion of that tenant — default 1
      branding: z.object({ displayName: z.string().nullable(), logoUrl: z.string().nullable(), accent: z.string(), accentFg: z.string(), navTone: z.string() }).nullable(),
    }),
  ),
});
```

### GET /api/mobile/usage

Existing route, **frozen shape** (`src/app/api/mobile/usage/route.ts:3–6`: the QuotaBar of installed 1.0 builds reads exactly these keys). Not used by the v2 screens. T3.6 changes the meaning only: `pct` becomes the pack percentage, `blocked` is `"credit"` when the pack is exhausted, `balanceMicro` keeps the wallet number, and the GET stops writing the wallet. This is the only schema of this file that carries a micro-dollar field.

- **Auth:** `requireMobile`
- **Permission:** `ai.chat.send` (`mobileDenied(g, AI_CHAT)`)
- **Request:** no body
- **Response:** `200` `ZUsageResponse` — keys and types exactly as today
- **Errors:** `401 unauthorized` · `403 missing_tenant` / `forbidden` / `suspended`
- **Rate limit:** none (as today)

```ts
const ZUsageResponse = z.object({
  scope: z.literal("credit"),
  used: z.number().int(),
  limit: z.number().int(),
  pct: z.number().int().min(0).max(100),
  warn: z.boolean(),
  degraded: z.boolean(),
  blocked: z.literal("credit").nullable(),
  resetAt: z.string(),
  balanceMicro: z.number().int(),
});
```

## 5. Routes of later work orders (same conventions · contract fixed here, built by the work order named in each section)

### POST /api/mobile/team/employees/[id]/manual/attach

"แนบเอกสาร SOP" (B3) — T1.5 `attachDocument`. The file is stored through the existing private-file path (never a public URL); the extracted text (≤ 20,000 characters) is injected into the prompt as a delimited data block, not as instructions (X6). Added to the route list by the controller ruling of 8 Oct (D2) so the B3 button has a route.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.manage`
- **Request:** `ZManualAttachRequest` (base64 body, the same pattern as the existing `crm/scan-card` route) — PDF, Word or image, ≤ 5 MB
- **Response:** `200` `ZManualAttachResponse` — no file URL in the DTO
- **Errors:** common errors · `400 validation` (type outside the allow-list, too large, unreadable) · `409 employee_paused`
- **Rate limit:** `mobile-team-upload:<userId>` 10 / minute

```ts
const ZManualAttachRequest = z.object({
  dataBase64: z.string().min(1),
  contentType: z.enum(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png"]),
  filename: z.string().trim().max(120).optional(),
});
const ZManualAttachResponse = z.object({ attachment: z.object({ id: ZId, fileName: z.string(), pages: z.number().int().nullable(), extractedChars: z.number().int() }) });
```

### GET /api/mobile/team/notify-prefs

Notification settings of the calling user for this tenant (C7) — T2.11, table `AiNotifyPref` (R-E C24).

- **Auth:** `requireMobile`
- **Permission:** any accepted member (own preferences only)
- **Request:** no body
- **Response:** `200` `ZNotifyPrefsResponse` (defaults when no row exists)
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZNotifyEvent = z.object({ on: z.boolean(), digestMinute: z.number().int().min(0).max(1439).nullable() }); // null = at once
const ZNotifyPrefs = z.object({
  events: z.object({ approvalWaiting: ZNotifyEvent, employeeStuck: ZNotifyEvent, taskDone: ZNotifyEvent, quotaLow: ZNotifyEvent, weeklyReport: ZNotifyEvent }),
  channels: z.object({ app: z.boolean(), line: z.boolean(), email: z.boolean() }),
  quiet: z.object({ on: z.boolean(), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(0).max(1439), urgentBypass: z.boolean() }),
});
const ZNotifyPrefsResponse = z.object({ prefs: ZNotifyPrefs, channelsAvailable: z.object({ line: z.boolean(), email: z.boolean() }) });
```

### PUT /api/mobile/team/notify-prefs

Save the whole preference object (C7, saved on change).

- **Auth:** `requireMobile`
- **Permission:** any accepted member (own preferences only)
- **Request:** `ZNotifyPrefsPutRequest`
- **Response:** `200` `ZNotifyPrefsPutResponse`
- **Errors:** common errors · `400 validation` (quiet start = end)
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZNotifyPrefsPutRequest = z.object({ prefs: ZNotifyPrefs });
const ZNotifyPrefsPutResponse = z.object({ prefs: ZNotifyPrefs });
```

### GET /api/mobile/team/people

The humans of this shop and what each may approve (C8), the commander picker (E3) — T2.11. Read from `Membership` + `ApprovalPolicy` + permissions; nothing is editable here.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`
- **Request:** no body
- **Response:** `200` `ZPeopleResponse` — names and roles only; no e-mail, no phone
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZPeopleResponse = z.object({
  people: z.array(
    ZPerson.extend({
      isViewer: z.boolean(),
      role: z.enum(["OWNER", "MANAGER", "STAFF"]),
      roleLabel: z.string(), // "เจ้าของ" · "ผู้จัดการร้าน"
      approves: z.array(z.string()), // "ใบเสนอราคา" · "โพสต์" · "สั่งของ" — "ทุกอย่าง" for an OWNER
      approveCapSatang: z.number().int().nullable(), // Membership.permissions._maxApproveSatang
      canCommand: z.boolean(), // ai.employee.use
      canUndo: z.boolean(), // ai.action.undo
    }),
  ),
  rules: z.object({
    ownerThresholdSatang: z.number().int().nullable(), // "เกิน ฿20,000 ต้องให้เจ้าของอนุมัติ" — ApprovalPolicy
    remindAfterHours: z.number().int(), // 4 — then escalate to the owner
    undoWindowMinutes: z.number().int(), // AiSettings.undoWindowSec / 60
    undoBy: z.array(ZPerson),
  }),
  inviteWebPath: z.string(), // opened in the existing webview
});
```

### GET /api/mobile/team/packs

The pack table of «src/lib/ai/team/packs.ts» (C2 · C3 · D4) — T3.4. Version 2.0 is not sold: only FREE is `enabled`; paid packs are informational.

- **Auth:** `requireMobile`
- **Permission:** any accepted member
- **Request:** no body
- **Response:** `200` `ZPacksResponse` — `approxTasks` is `null` until the T0.1 cost table fills it; the app then shows no task count at all (R-A5 · R-C3)
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZPacksResponse = z.object({
  current: ZPack,
  salesEnabled: z.boolean(), // AI_TEAM_SALES_ENABLED — false in 2.0
  topupEnabled: z.boolean(), // false in 2.0 (C3 is a disabled screen)
  packs: z.array(
    z.object({
      key: ZPack,
      label: z.string(),
      priceThb: z.number().int(), // 0 / 490 / 1490 / 3990 — the list price of the pack, shown greyed
      enabled: z.boolean(),
      comingSoon: z.boolean(),
      approxTasks: z.number().int().nullable(),
      maxScheduled: z.number().int().nullable(), // null = unlimited
      maxApprovers: z.number().int().nullable(),
      historyDays: z.number().int(),
      extras: z.array(z.string()),
    }),
  ),
  viewerAskedToBeNotified: z.boolean(),
});
```

### POST /api/mobile/team/sale-notify

"แจ้งฉันเมื่อเปิดขาย" (C2 · D4) — T3.6, table `AiSaleNotify` (one row per user × tenant × pack; a repeat is a no-op).

- **Auth:** `requireMobile`
- **Permission:** any accepted member
- **Request:** `ZSaleNotifyRequest`
- **Response:** `200` `ZSaleNotifyResponse`
- **Errors:** common errors · `400 validation`
- **Rate limit:** `mobile-team-notify:<userId>` 10 / minute (the 11th call in a minute answers `429`)

```ts
const ZSaleNotifyRequest = z.object({ pack: z.enum(["STARTER", "PRO", "BUSINESS"]).default("STARTER") });
const ZSaleNotifyResponse = z.object({ ok: z.literal(true), already: z.boolean() });
```

### POST /api/mobile/team/inbox/teach

"ตีกลับ + สอนงาน" (D5) — T4.1 `rejectWithTeaching`. Rejects the proposal, records the note, and for `remember: "MANUAL"` asks the model to phrase ONE rule and name the section (charged, X11). The note is data: it can never change a level or a grant (X6).

- **Auth:** `requireMobile` — `X-Tenant-Id` of the row
- **Permission:** the kind's own module permission (the same gate as `inbox/decide`)
- **Request:** `ZInboxTeachRequest`
- **Response:** `200` `ZInboxTeachResponse`
- **Errors:** common errors · `400 validation` · `409 already_decided` · `409 team_quota_exhausted` (the rejection is still recorded; `proposal` is null)
- **Rate limit:** `mobile-team-ai:<userId>` 10 / minute

```ts
const ZInboxTeachRequest = z.object({
  proposalId: ZId,
  category: z.enum(["PRICE", "DISCOUNT", "CUSTOMER", "TONE", "OTHER"]),
  note: z.string().trim().min(5).max(1000),
  remember: z.enum(["JOB", "MANUAL"]),
});
const ZInboxTeachResponse = z.object({
  noteId: ZId,
  status: z.literal("REJECTED"),
  understood: z.string().nullable(), // "💡 คุณเอกเข้าใจว่า …"
  proposal: z.object({ ruleText: z.string(), section: z.enum(MANUAL_SECTION_KEYS), fromVersion: z.number().int(), toVersion: z.number().int() }).nullable(), // only for MANUAL
});
```

### POST /api/mobile/team/inbox/teach/confirm

"ส่งกลับให้แก้ + บันทึกกฎ" (D5) — T4.1 `confirmTeaching`: writes the rule as a new manual version (source TEACH), posts a system line into the task room and lets the employee redo the work (a new PENDING proposal).

- **Auth:** `requireMobile` — `X-Tenant-Id` of the row
- **Permission:** the kind's own module permission + `ai.employee.manage` when a rule is written into the manual
- **Request:** `ZInboxTeachConfirmRequest`
- **Response:** `200` `ZInboxTeachConfirmResponse` (a second confirm of the same note returns the same version)
- **Errors:** common errors · `400 validation` · `409 employee_paused`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZInboxTeachConfirmRequest = z.object({
  noteId: ZId,
  remember: z.enum(["JOB", "MANUAL"]),
  ruleText: z.string().trim().min(5).max(300).optional(), // required for MANUAL — the person may edit the proposed rule
  section: z.enum(MANUAL_SECTION_KEYS).optional(),
});
const ZInboxTeachConfirmResponse = z.object({ ok: z.literal(true), manualVersion: z.number().int().nullable(), redo: z.boolean() });
```

### GET /api/mobile/team/actions

"บันทึกการกระทำ" (C6) — T4.3 `listActions`, from `AiActionLog`. History depth = the pack's `historyDays`.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`
- **Request:** query `filter=ALL|CUSTOMER|MONEY|EDIT` · `aiEmployeeId` (optional) · `cursor` · `limit` (≤ 50)
- **Response:** `200` `ZActionsResponse` — summaries carry no customer phone / e-mail / message body (X8)
- **Errors:** common errors · `400 validation`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZActionsResponse = z.object({
  actions: z.array(
    z.object({
      id: ZId,
      at: ZIso,
      summary: z.string(), // "ส่งใบเสนอราคา Q-0012 ทาง LINE"
      aiEmployee: ZEmployeeRef,
      class: ZKindClass,
      mode: z.enum(["DRAFT", "AUTO", "SCHEDULED"]),
      approvedBy: ZPerson.nullable(), // DRAFT: who approved · AUTO: who granted
      undoUntil: ZIso.nullable(), // null = this kind has no inverse
      undoneAt: ZIso.nullable(),
      viewerCanUndo: z.boolean(),
    }),
  ),
  historyDays: z.number().int(),
  nextCursor: z.string().nullable(),
});
```

### POST /api/mobile/team/actions/[id]/undo

"ยกเลิกได้" (C6) — T4.3 `undoAction`: calls the registered inverse of that kind through the owning module's facade, once.

- **Auth:** `requireMobile`
- **Permission:** `ai.action.undo`
- **Request:** `ZActionUndoRequest`
- **Response:** `200` `ZActionUndoResponse`
- **Errors:** common errors · `400 validation` · `409 undo_expired` · `409 not_undoable` · `409 already_decided` (already undone)
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZActionUndoRequest = z.object({ reason: z.string().trim().min(5).max(300) });
const ZActionUndoResponse = z.object({ ok: z.literal(true), undoneAt: ZIso, note: z.string() });
```

### GET /api/mobile/team/promotions

Open promotion offers (D6) — T4.4: an employee × task kind that passed ≥ 95 % unedited over its last 50 tasks.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read` (`viewerCanGrant` tells whether the buttons are enabled)
- **Request:** no body
- **Response:** `200` `ZPromotionsResponse`
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZPromotionsResponse = z.object({
  offers: z.array(
    z.object({
      id: ZId,
      aiEmployee: ZEmployeeRef,
      kind: z.string(),
      kindLabel: z.string(), // "ส่งใบเสนอราคาให้ลูกค้า"
      stats: z.object({ lastN: z.number().int(), passPct: z.number(), rejected30d: z.number().int() }),
      suggestedLimits: z.object({ maxSatang: z.number().int().nullable(), maxDiscountPct: z.number().nullable(), undoMinutes: z.number().int() }),
      fewerApprovalsPerMonth: z.number().int().nullable(),
      viewerCanGrant: z.boolean(),
    }),
  ),
});
```

### POST /api/mobile/team/promotions/[id]/accept

"ให้ทำเองได้" (D6) — T4.4 `acceptPromotion` → `grantAuto` with the T4.2 rules (grantor's own permission is re-checked at every execute; DESTRUCTIVE kinds never).

- **Auth:** `requireMobile`
- **Permission:** OWNER or `ai.access.grant`, plus `canGrantPermission` of the kind
- **Request:** `ZPromotionAcceptRequest`
- **Response:** `200` `ZPromotionAcceptResponse`
- **Errors:** common errors · `400 validation` · `403 cannot_grant_beyond_self` · `409 auto_forbidden_kind` · `409 already_decided`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZPromotionAcceptRequest = z.object({
  limits: z.object({ maxSatang: z.number().int().min(0).optional(), maxDiscountPct: z.number().min(0).max(100).optional() }),
  confirm: z.literal(true),
  reason: z.string().trim().min(5).max(300),
});
const ZPromotionAcceptResponse = z.object({ ok: z.literal(true), access: z.array(ZAccessRow) });
```

### POST /api/mobile/team/promotions/[id]/dismiss

"ยังก่อน" (D6): no new offer for the same employee × kind for 30 days.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.manage`
- **Request:** `ZPromotionDismissRequest` (empty object)
- **Response:** `200` `ZPromotionDismissResponse`
- **Errors:** common errors · `409 already_decided`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZPromotionDismissRequest = z.object({}).strict();
const ZPromotionDismissResponse = z.object({ ok: z.literal(true) });
```

### GET /api/mobile/team/report

"ผลงานทีม" (D7) — T4.5 `teamReport`. Hours, tasks, pass %, approval wait, quota % — **no wages and no baht value of work** (owner decision 9, AT-F16.3).

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`
- **Request:** query `month=YYYY-MM` (Asia/Bangkok; default = the current month)
- **Response:** `200` `ZTeamReportResponse`
- **Errors:** common errors · `400 validation`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZTeamReportResponse = z.object({
  month: z.string(),
  months: z.array(z.string()), // for the picker
  hours: z.number(), // Σ estimatedMinutes of finished tasks / 60 — never model timing
  vsPrevPct: z.number().nullable(),
  tasks: z.number().int(),
  passPct: z.number().nullable(),
  avgWaitMin: z.number().nullable(),
  quotaPct: ZPct,
  perEmployee: z.array(z.object({ aiEmployee: ZEmployeeRef, tasks: z.number().int(), passPct: z.number().nullable(), hours: z.number(), rejectedPct: z.number().nullable() })),
  needsManual: z.array(z.object({ aiEmployee: ZEmployeeRef, rejectedPct: z.number() })), // "ถูกตีกลับ 18% · ควรปรับคู่มือ"
});
```

### GET /api/mobile/team/knowledge

"ความรู้ของร้าน" (C5) — T4.6: the two automatic sources (read live through the owning facades, never copied) and the shop's own items, each with who may use it (per-item audience, fail-closed — see `PUT`).

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`
- **Request:** no body
- **Response:** `200` `ZKnowledgeResponse`
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
// Per ITEM, fail-closed: an item with NO grant row is usable by every employee; an item with ≥ 1 grant row is usable ONLY by
// the granted employees / positions — an employee hired later does not see it until someone adds him.
const ZKnowledgeAudienceView = z.union([z.literal("ALL"), z.object({ aiEmployees: z.array(ZEmployeeRef), positionKeys: z.array(z.string()) })]);
const ZKnowledgeAudience = z.union([z.literal("ALL"), z.object({ aiEmployeeIds: z.array(ZId).max(50), positionKeys: z.array(z.string().max(40)).max(10) }).refine((v) => v.aiEmployeeIds.length + v.positionKeys.length > 0)]);
const ZKnowledgeItem = z.object({
  key: z.string(), // "source:products" · "source:hours" · "category:<name>" · "article:<id>"
  group: z.enum(["AUTO", "OWN"]),
  icon: z.string(),
  title: z.string(),
  detail: z.string(), // "214 รายการ · ซิงก์ทุกชั่วโมง"
  audience: ZKnowledgeAudienceView, // ALL = the item has no grant row
});
const ZKnowledgeResponse = z.object({ count: z.number().int(), items: z.array(ZKnowledgeItem) });
```

### PUT /api/mobile/team/knowledge

Choose who may use one item (C5 "ใครเห็น") — replaces the item's whole grant set. Rule (reviewer SF1): **per item, fail-closed** — no grant row = every employee; ≥ 1 grant row = only the granted employees / positions. The grant is applied inside `kbSearch` before any result reaches a prompt (X8).

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.manage`
- **Request:** `ZKnowledgePutRequest`
- **Response:** `200` `ZKnowledgePutResponse`
- **Errors:** common errors · `400 validation`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZKnowledgePutRequest = z.object({ key: z.string().min(3).max(120), audience: ZKnowledgeAudience }); // "ALL" deletes the item's grant rows
const ZKnowledgePutResponse = z.object({ item: ZKnowledgeItem });
```

### POST /api/mobile/team/knowledge/items

Add an item the shop writes or uploads itself (C5 "＋"): a text article (`KbArticle`) or a file (private file route + text extraction, like `manual/attach`).

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.manage`
- **Request:** `ZKnowledgeItemCreateRequest`
- **Response:** `200` `ZKnowledgeItemCreateResponse` — no file URL in the DTO
- **Errors:** common errors · `400 validation` (type outside the allow-list, too large)
- **Rate limit:** `mobile-team-upload:<userId>` 10 / minute

```ts
const ZKnowledgeItemCreateRequest = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.string().trim().max(60).optional(),
  body: z.string().trim().max(20000).optional(),
  file: z.object({ dataBase64: z.string().min(1), contentType: z.string().max(120), filename: z.string().max(120).optional() }).optional(),
  audience: ZKnowledgeAudience.default("ALL"),
}); // exactly one of body / file
const ZKnowledgeItemCreateResponse = z.object({ item: ZKnowledgeItem });
```

### GET /api/mobile/team/rooms

"ห้องแผนก" list (E1) — T5.1 `listRooms` + `suggestHandoffs`.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`; rows are limited to rooms the caller may command or manage
- **Request:** no body
- **Response:** `200` `ZRoomsResponse`
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZRoomCard = z.object({
  id: ZId,
  name: z.string(),
  members: z.array(ZEmployeeRef),
  statusLine: z.string(), // "ปิดดีลร้านดอยช้าง · ขั้น 2 จาก 4"
  pendingProposals: z.number().int(),
  lastActivityAt: ZIso.nullable(),
});
const ZRoomsResponse = z.object({
  rooms: z.array(ZRoomCard),
  suggestions: z.array(z.object({ from: ZEmployeeRef, to: ZEmployeeRef, times: z.number().int(), roomId: ZId.nullable() })), // "ระบบแนะนำ" — pairs handed off ≥ 3 times in 30 days
});
```

### POST /api/mobile/team/rooms

Create a room (E3). Every member keeps his own access and manual — a room adds no right to anyone (X2).

- **Auth:** `requireMobile`
- **Permission:** `ai.room.manage`
- **Request:** `ZRoomCreateRequest`
- **Response:** `200` `ZRoomCreateResponse`
- **Errors:** common errors · `400 validation` (fewer than 2 members, lead not a member, a terminated employee)
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZRoomCreateRequest = z.object({
  name: z.string().trim().min(1).max(60),
  memberIds: z.array(ZId).min(2).max(12),
  leadId: ZId,
  commanderUserIds: z.array(ZId).max(50).default([]), // empty = the users who may command every member
});
const ZRoomCreateResponse = z.object({ room: ZRoomCard });
```

### GET /api/mobile/team/rooms/[id]

One room (E2 header, E3 edit form): members, commanders, the running task and its step line.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read` + commander of the room or `ai.room.manage`
- **Request:** no body
- **Response:** `200` `ZRoomDetailResponse`
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZRoomDetailResponse = z.object({
  room: ZRoomCard.extend({ leadId: ZId, commanders: z.array(ZPerson), archived: z.boolean() }),
  viewerCanCommand: z.boolean(),
  tasks: z.array(ZTaskRow), // newest first; the first OPEN one is the room's running task
  step: z.object({ index: z.number().int(), total: z.number().int() }).nullable(),
});
```

### PATCH /api/mobile/team/rooms/[id]

Edit name, members, lead or commanders (E3 in edit mode).

- **Auth:** `requireMobile`
- **Permission:** `ai.room.manage`
- **Request:** `ZRoomPatchRequest` (any subset of the create body)
- **Response:** `200` `ZRoomPatchResponse`
- **Errors:** common errors · `400 validation`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZRoomPatchRequest = ZRoomCreateRequest.partial();
const ZRoomPatchResponse = z.object({ room: ZRoomCard });
```

### POST /api/mobile/team/rooms/[id]/archive

Close a room (dangerous: explicit confirm). Tasks stay readable; flows of the room stop.

- **Auth:** `requireMobile`
- **Permission:** `ai.room.manage`
- **Request:** `ZRoomArchiveRequest`
- **Response:** `200` `ZRoomArchiveResponse`
- **Errors:** common errors · `400 validation` (no `confirm`)
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZRoomArchiveRequest = z.object({ confirm: z.literal(true) });
const ZRoomArchiveResponse = z.object({ ok: z.literal(true) });
```

### POST /api/mobile/team/rooms/[id]/tasks

Start a task in a room (E2 first order) — T5.2: one conversation, the lead takes the first turn, each later turn runs with the persona / manual / access of the employee holding it and is charged to that employee (X11). At most 8 hand-offs / 20 turns per task.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.use` + `ai.chat.send` + commander of the room
- **Request:** `ZRoomTaskStartRequest`
- **Response:** `200` `ZRoomTaskStartResponse` — the app then streams the order through `POST /api/mobile/chat/send`
- **Errors:** common errors · `403 not_commander` · `409 employee_paused` · `409 team_quota_exhausted`
- **Rate limit:** `mobile-team-task:<userId>` 30 / minute

```ts
const ZRoomTaskStartRequest = z.object({ title: z.string().trim().max(120).optional(), firstMessage: z.string().trim().max(4000).optional(), idempotencyKey: z.string().min(8).max(80) });
const ZRoomTaskStartResponse = z.object({ taskId: ZId, conversationId: ZId });
```

### GET /api/mobile/team/flows

Hand-off flows of a room (E4) — T5.3, table `AiHandoffFlow`.

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.read`
- **Request:** query `roomId` (required)
- **Response:** `200` `ZFlowsResponse`
- **Errors:** common errors · `400 validation`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZFlowStep = z.object({ aiEmployeeId: ZId, instruction: z.string().trim().min(1).max(300), mode: z.enum(["DRAFT", "AUTO"]) });
const ZFlow = z.object({
  id: ZId,
  roomId: ZId,
  name: z.string(),
  trigger: z.string(), // "MANUAL" or an event type of `triggersAvailable`
  triggerLabel: z.string(), // "เริ่มเมื่อดีลปิดการขาย"
  steps: z.array(ZFlowStep.extend({ aiEmployee: ZEmployeeRef, effectiveMode: z.enum(["DRAFT", "AUTO"]) })).max(8), // AUTO without a real grant is lowered to DRAFT
  onStuck: z.literal("ASK"),
  staleHours: z.number().int(),
  active: z.boolean(),
});
const ZFlowsResponse = z.object({ flows: z.array(ZFlow), triggersAvailable: z.array(z.object({ type: z.string(), label: z.string() })) });
```

### POST /api/mobile/team/flows

Save a new flow (E4 "บันทึก").

- **Auth:** `requireMobile`
- **Permission:** `ai.room.manage`
- **Request:** `ZFlowCreateRequest`
- **Response:** `200` `ZFlowCreateResponse`
- **Errors:** common errors · `400 validation` (more than 8 steps, an employee who is not a member of the room, a trigger outside the allow-list)
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZFlowCreateRequest = z.object({
  roomId: ZId,
  name: z.string().trim().min(1).max(80),
  trigger: z.string().min(1).max(80),
  steps: z.array(ZFlowStep).min(1).max(8),
  staleHours: z.number().int().min(1).max(72).default(4),
  active: z.boolean().default(true),
});
const ZFlowCreateResponse = z.object({ flow: ZFlow });
```

### PATCH /api/mobile/team/flows/[id]

Edit a flow: reorder, add or remove steps, switch it on / off.

- **Auth:** `requireMobile`
- **Permission:** `ai.room.manage`
- **Request:** `ZFlowPatchRequest` (any subset of the create body except `roomId`)
- **Response:** `200` `ZFlowPatchResponse`
- **Errors:** common errors · `400 validation`
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZFlowPatchRequest = ZFlowCreateRequest.omit({ roomId: true }).partial();
const ZFlowPatchResponse = z.object({ flow: ZFlow });
```

### DELETE /api/mobile/team/flows/[id]

Remove a flow. Tasks it already started keep running.

- **Auth:** `requireMobile`
- **Permission:** `ai.room.manage`
- **Request:** no body
- **Response:** `200` `ZFlowDeleteResponse`
- **Errors:** common errors
- **Rate limit:** `mobile-team:<userId>` 120 / minute

```ts
const ZFlowDeleteResponse = z.object({ ok: z.literal(true) });
```

### POST /api/mobile/team/flows/draft

"ตั้งลำดับ" (E1 suggestion → E4 prefilled) — T5.3 `draftFlowFromHistory`: a draft built from the hand-offs the room repeated. Saves nothing. Calls the model ⇒ charged (X11).

- **Auth:** `requireMobile`
- **Permission:** `ai.room.manage`
- **Request:** `ZFlowDraftRequest`
- **Response:** `200` `ZFlowDraftResponse`
- **Errors:** common errors · `409 team_quota_exhausted`
- **Rate limit:** `mobile-team-ai:<userId>` 10 / minute

```ts
const ZFlowDraftRequest = z.object({ roomId: ZId });
const ZFlowDraftResponse = z.object({ draft: ZFlowCreateRequest, basedOnRuns: z.number().int() });
```

### POST /api/mobile/team/flows/[id]/run

Start a MANUAL flow once (the event-triggered ones are started by the outbox consumer of `ai.flow.triggered`, idempotent per event × flow).

- **Auth:** `requireMobile`
- **Permission:** `ai.employee.use` + commander of the room
- **Request:** `ZFlowRunRequest`
- **Response:** `200` `ZFlowRunResponse`
- **Errors:** common errors · `403 not_commander` · `409 employee_paused` · `409 team_quota_exhausted`
- **Rate limit:** `mobile-team-task:<userId>` 30 / minute

```ts
const ZFlowRunRequest = z.object({ note: z.string().trim().max(2000).optional(), idempotencyKey: z.string().min(8).max(80) });
const ZFlowRunResponse = z.object({ taskId: ZId, conversationId: ZId });
```

## 6. Existing routes the v2 screens reuse (unchanged — documented from the code of 8 Oct 2026)

These handlers validate by hand today (no zod in the route files); the schemas below describe their real shapes. A team work order may add optional fields only — never rename or remove one (installed 1.0 builds read them).

### POST /api/mobile/chat/send

Send one order into a conversation and stream the answer (A4 · A5 · E2). `src/app/api/mobile/chat/send/route.ts` → `sendMobileChat` → `sendMessage`. For a conversation that has an `AiTask`, T1.7 makes `sendMessage` run as the task's employee and check the commander list on every call.

- **Auth:** `requireMobile`
- **Permission:** `ai.chat.send` (`mobileDenied(g, AI_CHAT)`); for a task room also commander of the employee (T1.7)
- **Request:** `ZChatSendRequest`
- **Response:** `200` `text/event-stream` — each event is a line `data: <ZChatEvent>`
- **Errors:** `400 bad_json` · `401 unauthorized` · `403 missing_tenant` / `forbidden` / `suspended`; a refusal inside the stream is an `error` event with a Thai text (for a task room: the text of `not_commander`, `employee_paused`, `employee_quota_cap`, `team_quota_exhausted`)
- **Rate limit:** none in the route (the daily net and the pack quota apply inside `sendMessage`)

```ts
const ZChatSendRequest = z.object({ conversationId: z.string().optional(), text: z.string(), imageUrls: z.array(z.string()).optional() });
const ZChatEvent = z.union([
  z.object({ type: z.literal("status"), label: z.string() }), // drawn as the step cards (✓ / ●)
  z.object({ type: z.literal("done"), result: z.object({ ok: z.boolean(), conversationId: z.string().optional(), reply: z.string().optional(), clarify: z.object({ question: z.string(), options: z.array(z.object({ label: z.string(), value: z.string() })) }).optional() }) }),
  z.object({ type: z.literal("error"), error: z.string() }),
]);
```

### GET /api/mobile/conversations/[id]/messages

Messages of one conversation (A5 · E2). A conversation the caller may not see answers an empty list, like an unknown id.

- **Auth:** `requireMobile`
- **Permission:** `ai.chat.send`; visibility by `conversation-owner.ts` (task rooms: `canSeeTask`, T1.7)
- **Request:** no body
- **Response:** `200` `ZMessagesResponse` — T5.2 may add an optional `aiEmployeeId` per message (who held the turn)
- **Errors:** `401 unauthorized` · `403 missing_tenant` / `forbidden` / `suspended`
- **Rate limit:** none (as today)

```ts
const ZMessagesResponse = z.object({ messages: z.array(z.object({ id: z.string(), role: z.enum(["USER", "ASSISTANT"]), content: z.string(), createdAt: z.string() })) });
```

### POST /api/mobile/proposals/confirm

Approve one proposal from inside its room (A5). Runs `executeProposal` with the caller's membership. Does not require `ai.chat.send` (R-E C33).

- **Auth:** `requireMobile`
- **Permission:** the kind's own module permission (`KIND_ACCESS`), checked inside `executeProposal`
- **Request:** `ZProposalConfirmRequest`
- **Response:** `200` `ZProposalConfirmResponse`
- **Errors:** `400 bad_json` · `400 id_required` · `401 unauthorized` · `403 missing_tenant` / `forbidden` / `suspended`; a refusal is `200` with `ok: false` and a Thai `note`
- **Rate limit:** none (as today)

```ts
const ZProposalConfirmRequest = z.object({ id: z.string().min(1), confirm2x: z.boolean().optional() });
const ZProposalConfirmResponse = z.object({ ok: z.boolean(), note: z.string(), needsSecondConfirm: z.boolean().optional() });
```

### POST /api/mobile/proposals/reject

Reject one proposal from inside its room (A5, until D5 replaces it in T4.1).

- **Auth:** `requireMobile`
- **Permission:** visibility of the room (own rooms today; `canSeeTask` for task rooms)
- **Request:** `ZProposalRejectRequest`
- **Response:** `200` `ZProposalRejectResponse`
- **Errors:** `400 bad_json` · `400 id_required` · `401 unauthorized` · `403 missing_tenant` / `forbidden` / `suspended`
- **Rate limit:** none (as today)

```ts
const ZProposalRejectRequest = z.object({ id: z.string().min(1) });
const ZProposalRejectResponse = z.object({ ok: z.boolean(), error: z.string().optional() });
```

### POST /api/mobile/plans/confirm

Confirm a multi-step plan (A5 PlanCard, R-E C20). Runs `executePlan` with the caller's membership.

- **Auth:** `requireMobile`
- **Permission:** per step: the step kind's own module permission
- **Request:** `ZPlanConfirmRequest`
- **Response:** `200` `ZPlanConfirmResponse` (`PlanExecResult`)
- **Errors:** `400 bad_json` · `400 id_required` · `401 unauthorized` · `403 missing_tenant` / `forbidden` / `suspended`
- **Rate limit:** none (as today)

```ts
const ZPlanConfirmRequest = z.object({ id: z.string().min(1), confirm2x: z.boolean().optional() });
const ZPlanConfirmResponse = z.object({ ok: z.boolean(), results: z.array(z.object({ summary: z.string(), ok: z.boolean(), note: z.string() })), doneCount: z.number().int(), needsSecondConfirm: z.boolean().optional() });
```

### POST /api/mobile/plans/reject

Reject a plan (A5 PlanCard).

- **Auth:** `requireMobile`
- **Permission:** visibility of the room
- **Request:** `ZPlanRejectRequest`
- **Response:** `200` `ZPlanRejectResponse`
- **Errors:** `400 bad_json` · `400 id_required` · `401 unauthorized` · `403 missing_tenant` / `forbidden` / `suspended`
- **Rate limit:** none (as today)

```ts
const ZPlanRejectRequest = z.object({ id: z.string().min(1) });
const ZPlanRejectResponse = z.object({ ok: z.boolean() });
```

### POST /api/mobile/tenants

"+ เพิ่มกิจการใหม่" (A2) and "สร้างกิจการ" (D2): `createTenantForUser` — a new tenant with the caller as accepted OWNER.

- **Auth:** `mobileUser` (Bearer only)
- **Permission:** none (any signed-in user)
- **Request:** `ZTenantCreateRequest`
- **Response:** `200` `ZTenantCreateResponse`
- **Errors:** `400 bad_request` · `400` with a Thai `error` text when the name is empty · `401 unauthorized`
- **Rate limit:** none (as today)

```ts
const ZTenantCreateRequest = z.object({ name: z.string().trim().min(1) });
const ZTenantCreateResponse = z.object({ tenantId: z.string() });
```

### POST /api/mobile/dna/answers

Business facts of the new shop (D2 — the five type chips map to `industryHint`; the other facts take the defaults of the chosen type on the device). Saves the facts and returns a blueprint; nothing is applied until the existing `dna/apply` step.

- **Auth:** `requireMobile`
- **Permission:** any accepted member (as today)
- **Request:** `ZDnaAnswersRequest` — `ZDnaFacts` is the existing schema of `src/lib/dna/schema.ts`
- **Response:** `200` `ZDnaAnswersResponse`
- **Errors:** `400 bad_json` · `400 invalid_facts` · `401 unauthorized` · `403 missing_tenant` / `forbidden` / `suspended`
- **Rate limit:** none (as today)

```ts
const ZDnaAnswersRequest = z.object({ facts: ZDnaFacts });
const ZDnaAnswersResponse = z.object({ blueprintId: z.string(), plan: z.unknown() });
```

### POST /api/mobile/webview-session

One-time code (60 s) to open a web page of the back office inside the existing webview: "เปิดเว็บหลังร้าน" (C4), "เชิญคนในทีม" (C8), connect LINE / Facebook / products (D2). The Bearer is never put in a URL.

- **Auth:** `requireMobile`
- **Permission:** any accepted member (the web page applies its own permission checks)
- **Request:** no body
- **Response:** `200` `ZWebviewSessionResponse`
- **Errors:** `401 unauthorized` · `403 missing_tenant` / `forbidden` / `suspended`
- **Rate limit:** none (as today)

```ts
const ZWebviewSessionResponse = z.object({ code: z.string() });
```

### POST /api/mobile/auth/logout

"ออกจากระบบ" (C4, two-step confirm on the device): revokes the session and forgets the push device.

- **Auth:** Bearer read directly in the route (no `requireMobile` / `mobileUser` — a missing or expired session still answers `ok`)
- **Permission:** none
- **Request:** `ZLogoutRequest` (the body may be empty)
- **Response:** `200` `ZLogoutResponse`
- **Errors:** none (always `200`)
- **Rate limit:** none (as today)

```ts
const ZLogoutRequest = z.object({ expoToken: z.string().optional() });
const ZLogoutResponse = z.object({ ok: z.literal(true) });
```

## 7. Fixtures

Lane B screens are rendered against mock payloads of exactly these response schemas: `apps/mobile/qc/fixtures/ai-team/README.md`.
