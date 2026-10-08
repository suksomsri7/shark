# รีวิวแบบ ↔ โค้ดจริง: SHARK HUB v2 "ทีมพนักงาน AI" (สำรวจอ่านอย่างเดียว · 8 ต.ค. 2569)

> ผู้สำรวจ: survey agent (Opus · read-only) · ฐาน = `main` @ `7411dfde` (= `origin/main` f132ce21 + 1 commit ledger)
> แบบที่ตรวจ: `ledger/DESIGN-AI-TEAM.md` (§1 ตาราง "ของที่มีอยู่แล้ว" · §4.1 ตาราง · §4.2 AUTO · §5 47 ใบ · §8 ไฟล์ as-built)
> กติกา: **โค้ดชนะแบบ** — ทุกชื่อในรายงานนี้ยืนยันจากไฟล์จริงด้วย `file:line` (บรรทัดของ `main` วันนี้)
> ไม่ได้รัน tsx/pnpm/prisma · ไม่ได้แตะ .env · ไม่ได้ fetch · ตัวเลขที่ต้องรันจริงถึงจะรู้ ระบุว่า "ประมาณ"

---

## 1. Prisma ตามที่สร้างจริง (as-built)

### 1.1 `prisma/schema/ai.prisma` (181 บรรทัด)
| model / enum | บรรทัด | ฟิลด์ (ที่เกี่ยวกับ §4.1) | หมายเหตุ |
|---|---|---|---|
| `enum AiRole` | 3 | `USER` `ASSISTANT` | |
| `AiConversation` | 8–20 | `id` (cuid **แต่จริง ๆ ออกโดย server เป็น `u~<userId>~<hex>` / `k~<keyId>~` / `s~<job>~`** — ดู §2.1) · `tenantId` · `title` (default "") · `lastReadAt?` · `deletedAt?` (soft delete ของแอป) · `createdAt` · `updatedAt` · `messages AiMessage[]` · `@@index([tenantId, updatedAt])` | **ไม่มี** `userId/startedById/status/employeeId/roomId` — ผู้สร้างฝังใน `id` (conversation-owner.ts:5–11) |
| `AiMessage` | 22–34 | `tenantId` `conversationId` (FK cascade) `role AiRole` `content` `tokensIn` `tokensOut` `createdAt` | ไม่มีผู้พิมพ์ (ห้องเป็นของคนเดียว) |
| `enum AiProposalStatus` | 38–44 | `PENDING` `EXECUTED` `REJECTED` `FAILED` `EXPIRED` (5 ค่า) | |
| `AiProposal` | 46–61 | `tenantId` `conversationId` `kind String` `risk String @default("NORMAL")` (= `NORMAL`\|`DESTRUCTIVE`) `summary` `payload Json` `status` `resultNote?` (CRM ใช้ค่า `WORKING#<ms>` เป็นธงจอง) `expiresAt` (TTL 24 ชม.) `executedAt?` `createdAt` | **ไม่มี** `decidedById` `decidedAt` `autoExecuted` `employeeId` · reject ไม่บันทึกคน/เหตุผล |
| `AiUsage` | 64–73 | `tenantId` `day` "YYYY-MM-DD" BKK `requests` `tokensIn` `tokensOut` · unique `[tenantId, day]` | เพดานรายวัน (ตาข่ายชั้นนอก) **ยังใช้อยู่** service.ts:133 |
| `enum AiUsageKind` | 76–79 | `SESSION` `WEEK` | |
| `AiUsageWindow` | 83–95 | `tenantId` `kind` `windowStart` `credits` `requests` · unique `[tenantId, kind, windowStart]` | **ตายแล้ว** — ไม่มีผู้เรียก `recordQuotaUsage/getQuotaStatus` (§2.4c) |
| `AiTrainingSample` | 100–110 | `userText` `toolCallsJson` `replyText` `model` | เก็บเมื่อ `SHARK_AI_COLLECT=1` |
| `AiMemory` | 113–121 | `tenantId` `content` · **id ฝังผู้เขียน** `o~`/`u~`/`k~`/`s~` | ไม่มี employee |
| `AiPlan` | 124–137 | `conversationId` `title` `status String` (PENDING\|RUNNING\|DONE\|FAILED\|REJECTED\|EXPIRED) `hasDestructive` `stepsJson` `[{kind,summary,payload,status,note?}]` `expiresAt` `executedAt?` | ≤ 8 ขั้น (plans.ts:20) · รันแบบซิงก์ด้วยคนกดคนเดียว |
| `AiScheduledTask` | 140–152 | `tenantId` `instruction` `hourBkk Int` `active` `lastRunDay String?` `createdAt` `updatedAt` | **ไม่มี** `createdById` (actor.ts:38 ยืนยัน) · ไม่มี frequency/days/minute/channels |
| `AiFeedback` | 155–167 | `conversationId?` `userText` `replyText` `rating` UP\|DOWN `note?` | 👍👎 ใต้คำตอบ |
| `AiPromptTweak` | 171–181 | ระดับแพลตฟอร์ม (axis platform) `content` `rationale` `status` `decidedById` | ฉีดเข้า prompt ทุกร้าน (service.ts:164) |

### 1.2 `prisma/schema/ai_credit.prisma` (85 บรรทัด)
| model / enum | บรรทัด | ฟิลด์ |
|---|---|---|
| `AiCreditWallet` | 9–16 | `tenantId @unique` `balanceMicro Int` `grantedAt DateTime?` (ตัวล็อกเครดิตต้อนรับ) |
| `enum AiCreditKind` | 18–24 | `GRANT` `TOPUP` `USAGE` `REFUND` `ADJUST` |
| `enum AiCreditSource` | 27–54 | `CHAT` `SCHEDULED` `WEEKLY_REPORT` `DNA_INTERVIEW` `AUTO_TITLE` `SUPPORT_DRAFT` `CHAT_TRANSLATE` `CHAT_SUGGEST` `ACCOUNT_INBOX` `MEMBER_ASSIST` `CRM_ASSIST` `TOPUP` `GRANT` `ADJUST` (14 ค่า) · 🔴 บรรทัด 49: ค่าใหม่ต้อง `ALTER TYPE ADD VALUE` ใน migration ของตัวเอง ห้ามใช้เป็น default |
| `AiCreditTxn` | 56–74 | `tenantId` `kind` `source` `amountMicro` (±) `balanceAfter` `model?` `tokensIn` `tokensOut` `note?` `conversationId?` **`userId?`** `ref?` · unique `[tenantId, ref]` |
| `AiSettings` | 79–85 | `tenantId @unique` `weeklyReportEnabled Boolean @default(false)` — **มีแถวตั้งค่า AI ระดับกิจการอยู่แล้ว** |

### 1.3 `prisma/schema/approval.prisma`
| model / enum | บรรทัด | ฟิลด์ |
|---|---|---|
| `enum ApprovalStatus` | 3–8 | `PENDING` `APPROVED` `REJECTED` `CANCELLED` |
| `enum ApprovalDecisionValue` | 10–13 | `APPROVED` `REJECTED` |
| `enum ApproverRole` | 15–18 | `MANAGER` `OWNER` (ไม่มี STAFF) |
| `ApprovalPolicy` | 20–36 | `name` `entityType` `active` `unitId?` `systemId?` `thresholdSatang Int?` `conditionJson` `steps ApprovalStep[]` |
| `ApprovalStep` | 38–49 | `policyId` `order` `approverRole` `approverUserId?` · unique `[policyId, order]` |
| `ApprovalRequest` | 51–71 | `policyId` `entityType` `entityId` `unitId?` `systemId?` `amountSatang?` `status` `currentStepOrder` `requestedById` `decidedAt?` `idempotencyKey` ("approval-<entityType>-<entityId>") |
| `ApprovalDecision` | 73–85 | `requestId` `stepOrder` `decidedById` `decision` `note?` (append-only) |

entityType ที่รู้จัก: `src/lib/modules/approval/labels.ts:3–23` = `PurchaseOrder` `HrLeave` `member.merge` `member.tier.manual` `member.erase` `member.point.adjust` `member.voucher.issue` `AccountDocument` `crm.discount` `crm.commission` `crm.reassign` `crm.portal_request` — **ไม่มีชนิดของ AI**

### 1.4 `prisma/schema/core.prisma` (233 บรรทัด · 🔴 บรรทัด 2: "FROZEN หลัง Stage A — ห้าม session โมดูลแก้ไฟล์นี้")
| model / enum | บรรทัด | ฟิลด์ที่เกี่ยว |
|---|---|---|
| `enum Plan` | 35–37 | **`FREE` ค่าเดียว** |
| `Tenant` | 39–58 | `plan Plan @default(FREE)` (บรรทัด 44) · `enabledModules Json` · `limits Json` · `status TenantStatus` · **ไม่มี `ownerUserId`** |
| `User` | 104–118 | `email @unique` `name?` `prefs Json` (บรรทัด 114 — ค่าปรับหน้าจอส่วนตัว ข้ามร้าน · อ่าน/เขียนผ่าน `kanban/preferences.ts`) |
| `enum Role` | 120–124 | `OWNER` `MANAGER` `STAFF` |
| `Membership` | 127–143 | `userId` `tenantId` `role` `unitAccess Json` `permissions Json` `acceptedAt?` · unique `[userId, tenantId]` — **OWNER ได้หลายคนต่อร้าน** |
| `enum AuthPurpose` | 148–152 | `MAGIC_LINK` `OTP` `WEBVIEW` |
| `Session` | 169–183 | ใช้ทั้งเว็บ (cookie) และแอป (Bearer) |
| `enum ActorType` | 208–213 | `USER` `PLATFORM_USER` `SYSTEM` `API_KEY` — **ไม่มีค่า AI** |
| `AuditLog` | 215–233 | `tenantId?` `unitId?` `actorType` `actorId?` `onBehalfOf?` (= PlatformUser impersonation) `action` `targetType?` `targetId?` `before?` `after?` `ip?` |

### 1.5 ตารางอื่นที่แบบอ้าง
| model | ไฟล์:บรรทัด | ฟิลด์ |
|---|---|---|
| `AppNotification` | automation.prisma:139–166 | `tenantId` `recipientUserId String?` (null = ทั้งร้านเห็น) `title` `body` `readAt?` `emailedAt?` `createdAt` · **ไม่มี type/link/data** |
| `PushDevice` | mobile.prisma:3–14 | `userId` `tenantId?` (hint) `expoToken @unique` `platform` · scope = global `g(...)` (scope.ts:42) |
| `KbArticle` | kb.prisma:2–13 | `tenantId` `title` `body` `category?` `active` — ไม่มีการมองเห็นรายคน |
| `TenantBranding` | branding.prisma:11–27 (ไฟล์) | `displayName?` `logoUrl?` `brandColor?` `brandFg?` `navTone NavTone` `applyStorefront` `applyMobile` |
| `Team` / `TeamMember` | team.prisma | ทีมขายของ CRM (คน) — `leadUserId` `unitIds` · **ห้ามใช้แทนห้องแผนก AI** |
| `OutboxEvent` | outbox.prisma:7–25 | `type` `payload` `idempotencyKey` `status PENDING|DONE|FAILED` `attempts` `availableAt` (= lease) `lastError` |
| `HrEmployee` | hr.prisma | พนักงาน "คน" · ตารางอื่นใช้ชื่อคอลัมน์ `employeeId` ชี้ HrEmployee อยู่แล้ว (booking.prisma:46) |

### 1.6 scope ที่ลงทะเบียน (`src/lib/core/scope.ts`, fitness F1 = CRITICAL)
`AiConversation/AiMessage/AiUsage/AiUsageWindow/AiSettings/AiCreditWallet/AiCreditTxn/AiProposal/AiTrainingSample/AiMemory/AiPlan/AiScheduledTask/AiFeedback: tenant` (135–149) · `AiPromptTweak: platform` (150) · `PushDevice: g(...)` (42) · `AuditLog/AppNotification/ApprovalPolicy/ApprovalRequest/TenantBranding/KbArticle: tenant`
⇒ **ทุก model ใหม่ใน `ai_team.prisma` ต้องลงที่นี่ใน T1.1** (F1.1 CRITICAL) และต้องมีใน migration SQL (F8.1 CRITICAL)

### 1.7 คอลัมน์ที่แบบจะเพิ่ม แต่มีอยู่แล้วในชื่ออื่น / ซ้ำความหมาย
| แบบ (§4.1) | ของที่มีแล้ว | ข้อสังเกต |
|---|---|---|
| `AiConversation.startedById` | ผู้สร้างฝังใน `AiConversation.id` (`u~<userId>~`) อ่านด้วย `conversationCreatorOf()` conversation-owner.ts:161 | เพิ่มคอลัมน์ = แหล่งความจริงที่สอง (เสี่ยงเพี้ยน) |
| `AiConversation.status` "เก็บแล้ว" | `AiConversation.deletedAt` (soft delete ของแอป) | archive ≠ delete — ต้องตัดสินว่าใช้คอลัมน์ไหน |
| `AiCreditTxn.employeeId` | มี `userId?` `conversationId?` อยู่แล้ว (แต่ service.ts:342 ไม่ส่ง `userId`) | employee หาได้จาก conversation → task |
| `AiSubscription.overflowMode` / ตั้งค่าแพ็ก | `AiSettings` (ai_credit.prisma:79) แถวต่อร้าน | ตั้งค่าระดับร้านที่ไม่ใช่แพ็กควรต่อท้าย `AiSettings` |
| `AiEmployee.persona` | `buildSystemPrompt(PersonaContext)` persona.ts:4–13,29 (ตัวเดียวทั้งร้าน) | ไม่มีแถวในฐาน |
| ระดับ `DESTRUCTIVE` | `AiProposal.risk` + `DESTRUCTIVE_KINDS` proposals.ts:125 + `ApiOpTool.risk` / `op.kind === "danger"` api/op.ts:38,48 | มีแล้ว — ใช้ต่อได้ |
| `AiProposal.decidedById` | ไม่มี (มีแค่ `executedAt`) | |
| `Plan` แพ็ก | `Tenant.plan` enum FREE · `planLimits(plan)` usage.ts:72 | core.prisma FROZEN |

---

## 2. แผนที่ `src/lib/ai/**`

### 2.0 รายการไฟล์ + export (ชื่อ · พารามิเตอร์ · คืน · หน้าที่ 1 บรรทัด)

**service.ts** (396)
- `type Ctx = { tenantId }` :24 · `type SendCtx = Ctx & { actor: AiActor }` :29 · ค่าคงที่ `HISTORY_MAX_CHARS 24_000` :31 · `MAX_TOOL_ROUNDS 5` :33 · `LOW_BALANCE_MICRO 500_000` :35
- `type SendResult = {ok:true; conversationId; reply; clarify?} | {ok:false; error:"ai_disabled"|"over_budget"|"empty"; scope?:"credit"|"day"; resetAt?}` :43
- `latestConversation(ctx: ConvCtx)` :70 — ห้องล่าสุดที่ผู้ดูสร้างเอง
- `listMessages(ctx: ConvCtx, conversationId, take=100)` :78 — ข้อความเฉพาะห้องที่เห็น
- `aiEnabled(): boolean` :89
- `sendMessage(ctx: SendCtx, input:{conversationId?; text; imageUrls?}, deps?:{provider?; source?: AiCreditSource; onToolCall?}) → Promise<SendResult>` :97 — guard → prompt → agent loop → persist → charge
- `dnaFactsSummary(tenantId) → Promise<string|undefined>` :371

**proposals.ts** (1436)
- `type ProposalKind = StaticProposalKind | \`account.${string}\` | \`kanban.${string}\` | \`member.${string}\` | \`crm.${string}\`` :117 · `StaticProposalKind` :69–111 = **36 ชนิดเขียนมือ**
- `DESTRUCTIVE_KINDS: Set<ProposalKind>` :125–141 (danger ของบัญชี/บอร์ด/สมาชิก/CRM + `void_sale` `cancel_appointment` `cancel_reservation` `kanban_archive_card` `shop_refund_order` `restaurant_close_bill`)
- `STATIC_KIND_ACCESS` :144–188 · `KIND_ACCESS` :194–203 (รวม derive จากทะเบียน op)
- `createProposal(ctx:{tenantId}, input:{conversationId; kind; summary; payload}) → {id}` :313 — PENDING + TTL 24 ชม. + risk
- `listPendingProposals(ctx: ConvCtx, conversationId)` :335
- `rejectProposal(ctx: ConvCtx, id) → boolean` :350 — ไม่รับข้อเสนอ CRM-door · ไม่บันทึกผู้กด
- `executeProposal(m: MembershipCtx, ctx:{tenantId}, id, opts?:{confirm2x?; userId?}) → {ok; note; needsSecondConfirm?}` :363
- `isKnownKind(kind)` :462 · `kindAccessOf(kind) → {module, action}|null` :468
- `runKind(m, tenantId, kind, payload, refId?, userId?) → Promise<string>` :475 — ใช้โดย plans
- (ภายใน) `dispatch(tenantId, proposalId, kind, rawPayload, m?, userId?)` :496 · `ai_schedule_task` → `scheduledSvc.createTask` :1362

**plans.ts** (193)
- `MAX_STEPS = 8` :20 · `PLAN_HUMAN_ONLY = { hr_decide_leave, approval_decide }` :36–39
- `createPlan(ctx, {conversationId; title; steps:[{kind; summary; payload?}]}) → {id}` :45
- `executePlan(m, ctx, planId, opts?:{confirm2x?; userId?}) → PlanExecResult {ok; results; doneCount; needsSecondConfirm?}` :88 — 🔸 เรียก `runKind(m, tenantId, kind, payload, refId)` :140 **โดยไม่ส่ง userId**
- `rejectPlan(ctx: ConvCtx, id)` :175 · `listPendingPlans(ctx: ConvCtx, conversationId)` :186

**scheduled.ts** (126)
- `MAX_TASKS_PER_TENANT 10` :18 · `MAX_TENANT_TASKS_PER_RUN 100` :19
- `createTask(ctx, {instruction; hourBkk}) → {id}` :22 · `listTasks(ctx)` :43 · `setTaskActive(ctx, id, active)` :48 · `deleteTask(ctx, id)` :54 — 🔸 3 ตัวหลัง **ไม่มีผู้เรียกในโค้ดเลย** (ไม่มีจอจัดการงานประจำ)
- `runScheduledTasks(now=new Date(), deps?:{provider?}) → number` :66 — เรียกจาก `src/app/api/cron/hourly/route.ts:29`

**skills.ts** (430)
- `type Skill = { id; label; summary (EN); tools: string[]; systems?: string[] }` :25
- `CORE_TOOLS = [list_systems, ask_clarify, propose_plan, open_system, kb_search, remember_fact, list_memories, support_open_case]` :40–49
- `SKILLS: Skill[]` :51 (20 ตัว — §2.4d)
- `LOAD_SKILL_TOOL(availableIds)` :286 · `skillOfTool(name)` :307 · `skillById(id)` :311 · `skillsForTenant(openedSystemTypes)` :320 · `toolAllowedForApiKey(name, scopes, opts)` :332 · `skillToolsForApiKey(skill, scopes, opts)` :353 · `skillIndexPrompt(skills)` :361 · `toolNamesOfSkills(ids)` :372 · `assertSkillRegistryComplete()` :382 (fitness F10.1)

**tools.ts** (2526)
- `type ToolCtx = { tenantId; actor: AiActor; conversationId?; systemId? }` :45 · `type AiTool = { def:{name;description;parameters}; action?: boolean; execute(ctx, args) }` :62 (`action:true` = เครื่องมือเสนอ)
- (ภายใน) `propose(ctx, kind, summary, payload)` :463 → `createProposal` → คืน `{proposalId, summary, waiting:"user_confirm"}`
- เครื่องมือสำคัญ: `salesSummary` :165 · `pendingLeaves` :223 · `kbSearch` :395 · `hrDecideLeave` :520 · `openSystem` :650 · `scheduleTask` :899 · `proposePlan` :988 (ตรวจ `actorCanConfirmKind` ทุกขั้น :1036 แล้ว `createPlan` :1041) · `askClarify` :1055 · `approvalDecide` :1657 · `rememberFactTool` :2231 · `forgetFactTool` :2254 · `listMemoriesTool` :2292 · `supportOpenCase` :2312 (เขียนทันที userId sentinel `"ai-assistant"`) · `kbAutoSave` :2352
- (ภายใน) `guarded(t)` :2405 — ด่าน actor ห่อทุกตัว · `toolRegistry(): AiTool[]` :2418 · `registryTools()` :2422 (59 ตัวเขียนมือ + `accountTools()` + `kanbanTools()` + `memberTools()` + `crmTools()`)
- `runTool(ctx: ToolCtx, name, args) → Promise<string>` :2511 — ไม่ throw · ตรวจ `toolVerdict` ซ้ำ
- จำนวน tool ทั้งหมด ≈ 59 เขียนมือ + 36 บัญชี + 21 บอร์ด + 48 สมาชิก + 29 CRM ≈ **193** (นับจาก `tool: { name:` ด้วย grep — ตัวเลขจริงดูจาก output ของ fitness F10.1)

**tool-access.ts** (287)
- `type AccessQuery = {module; action}` :36 · `HandRule {needs; scopedData?; writesNow?; branchScoped?; needsPerson?; memberWholeShop?}` :41
- `HAND_TOOL_ACCESS: Record<string, HandRule>` :67–104 · `HAND_ACTION_KIND: Record<string,string>` :107–138 (ชื่อ tool → kind · ต่างกันตัวเดียว `schedule_task → ai_schedule_task`) · `PLAN_TOOL = "propose_plan"` :141
- `membershipCan(m, q, userId="") → boolean` :163 (ส่งต่อ crmCan / canReadMember / membershipCanAccount / kanbanMembershipCan / `evaluate`)
- `toolIsMapped(name)` :203 · `toolVerdict(actor, name, opts) → {ok:true}|{ok:false; reason}` :216 · `actorCanConfirmKind(actor, kind)` :260 · `actorBranches(actor) → string[]|null` :276 · `toolsOfferedTo(actor, names) → string[]` :285

**actor.ts** (149) — ไฟล์เบา (ห้าม import บริการ · fitness F10 โหลดแบบไร้ env)
- `AiMemberActor {kind:"member"; tenantId; userId; membership}` :18 · `AiApiKeyActor {kind:"apiKey"; keyId; scopes; systemId; scopesMalformed?}` :25 · `AiSystemActor {kind:"system"; tenantId; job}` :46 · `type AiActor` :54
- `AI_SYSTEM_JOBS = ["scheduled-task"]` :43 · `SHOP_AUDIENCE = {role:"STAFF", unitAccess:[], permissions:{}}` :57
- `aiMemberActor(tenantId, userId, m)` :64 · `aiApiKeyActor(k)` :82 · `aiSystemActor(tenantId, job)` :97 (WeakSet `GENUINE_SYSTEM_ACTORS` :94) · `aiActorMembership(a)` :107 · `aiActorUserId(a)` :117 · `actorProblem(ctx) → string|null` :126 · `keyPermissions(scopes)` :137 · `isGeneralKeyActor(a)` :145

**conversation-owner.ts** (173) — ไม่มี db
- `ConvCtx = {tenantId; actor}` :35 · `ConvSight = {own; ownerExtras}` :38
- `sightOf(ctx)` :49 · `sightOfConfirmer(m, userId)` :58 · `newConversationId(ctx)` :63 · `canSeeConversationId(s, id)` :70 · `visibleConversationWhere(s)` :81 · `likePrefix(prefix)` :93
- ความจำ: `MemorySight` :108 · `memorySightOf` :111 · `newMemoryId` :119 · `canSeeMemory` :129 · `canForgetMemory` :140 · `visibleMemoryWhere` :147 · `managedMemoryWhere` :154 · `conversationCreatorOf(id)` :161 · `memoryScopeOf(id)` :170
- กติกาการมองเห็น: ผู้สร้างเท่านั้น · OWNER เห็นห้องที่ **ไม่ได้** สร้างโดยคนในร้าน (ห้องเดิม cuid ล้วน · `k~` · `s~`) · ห้องของคนในร้านคนอื่น (แม้เป็น OWNER อีกคน) = ไม่มีใครเห็น (:12–20)

**conversations.ts** (31) — `findVisibleConversation(ctx, id)` :9 · `latestVisibleConversation(ctx)` :22

**usage.ts** (202) — `SESSION_WINDOW_HOURS=5` :17 · `modelWeight(model)` :26 · `creditsFor(model, in, out)` :34 · `weekStartBangkok(d)` :43 · `applyDegrade(model, degraded)` :51 · `planLimits(plan?)` :72 (FREE: session 1,200 / weekly 6,000 credits · env `SHARK_AI_SESSION_CREDITS` `SHARK_AI_WEEKLY_CREDITS` `SHARK_AI_DEGRADE_PCT` `SHARK_AI_WARN_PCT`) · `getQuotaStatus(ctx, now)` :110 · `recordQuotaUsage(ctx, input, now)` :151 · `quotaMessage(scope?, resetAt?)` :177

**credit.ts** (318) — `PLATFORM_LEDGER_ID="__platform__"` :19 · `welcomeGrantMicro()` :22 (env `SHARK_AI_WELCOME_USD`, ปริยาย $10) · `type Wallet` :27 · `ensureWallet(tenantId)` :34 (lazy เปิดกระเป๋า + แถว GRANT `ref:"welcome-grant"`) · `balanceOf(tenantId)` :69 · `canSpend(tenantId)` :74 (> 0) · `canSpendPeek(tenantId)` :85 (ไม่เขียน) · `type ChargeInput {source; model; tokensIn; tokensOut; conversationId?; userId?; note?; extraMicroUsd?}` :91 · `chargeUsage(ctx, input) → micro` :119 (tx: `decrement` + แถว USAGE · ติดลบได้) · `chargeUsageSafe(ctx, input)` :152 (กลืน error → logOps) · `chargePlatform(input)` :166 · `topUp(tenantId, amountMicro, {ref; note?; kind?; source?})` :197 · `listTxns(tenantId, opts)` :248 · `usageBySource(tenantId, days=30)` :269 · `outOfCreditMessage()` :286 · `getAiSettings(tenantId)` :297 · `setWeeklyReportEnabled(tenantId, enabled)` :303 · `tenantsWithWeeklyReport()` :312

**topup.ts** (77) — `REF_PREFIX="aicredit"` :15 · `thbPerUsd()` :18 · `topUpPacks()` :25 · `packById(id)` :36 · `buildReference(tenantId, microUsd, nonce)` :40 · `parseReference(ref)` :47 · `creditFromCharge(input)` :60 (เติมจาก Beam charge)

**pricing.ts** (53) — `MICRO_PER_USD` :8 · `priceOf(model)` :23 (haiku 1/5 · sonnet 3/15 · opus 5/25 · ไม่รู้จัก = opus) · `costMicroUsd(model, in, out)` :38 (× env `SHARK_AI_PRICE_MARKUP`) · `formatUsd(micro)` :48

**persona.ts** (81) — `type PersonaContext {tenantName; dna?; systems; memories?; promptTweaks?}` :4 · `ACCOUNTANT_RULES` :21 · `buildSystemPrompt(ctx) → string` :29 — prompt **ภาษาไทยทั้งก้อน** · กติกา "ตอบภาษาไทยเสมอ" :59

**memory.ts** (95) — `MemoryCtx {tenantId; actor}` :20 · `rememberFact(ctx, content) → {id; shared}` :32 · `listMemories(ctx, take=50)` :68 · `forgetMemory(ctx, id)` :79 · `memoryBlock(ctx) → string` :91 (bullet สำหรับ prompt · ≤100)

**proactive.ts** (159) — `PROACTIVE_TITLE` :19 · `gatherProactiveInsights(ctx)` :31 (deterministic ไม่แตะ LLM) · `sweepProactiveNudges(now)` :119 (AppNotification ทั้งร้าน + `sendPushToTenant`) — เรียกจาก `src/lib/platform/cron.ts:403`

**rules.ts** (36) — `dayKeyBangkok(d)` :8 · `overBudget(u, lim)` :13 · `trimHistory(msgs, maxChars)` :21 · `titleFrom(text)` :33

**provider.ts** (227) — `AiToolDef` :6 · `AiToolCall` :8 · `AiChatMessage` :11 · `AiReply` :19 · `interface AiProvider` :27 · `FAST_MODEL="anthropic/claude-haiku-4.5"` :32 · `SMART_MODEL="anthropic/claude-sonnet-5"` :33 · `pickModel(text, hasImages)` :49 (env `SHARK_AI_MODEL` บังคับ) · `buildRequestBody` :68 · `MockProvider` :95 · `OpenRouterProvider` :108 · `resolveProvider(tier="smart")` :210 (`SHARK_AI_MOCK=1` → Mock) · `dailyLimits()` :220 (env `SHARK_AI_DAILY_REQ`=300 · `SHARK_AI_DAILY_TOKENS`=400k)

**eval.ts** (178) — `GoldenCase` :15 · `GOLDEN_CASES` :19 · `evalToolFromRegistry(prompt)` :147 · `runEval(deps)` :160 · `scoreEvalWithHeuristic()` :169 · `assertGoldenCasesValid()` :174

**feedback.ts** (69) — `recordFeedback(ctx, input)` :22 · `feedbackStats(ctx)` :51

**dna-review.ts** (188) — `gatherDnaDrift(ctx)` :53 · `sweepDnaReview(now)` :147 (cron.ts:397)

**analyst.ts** (210) — `gatherBusinessSnapshot(ctx)` :39 · `weeklyAnalysis(...)` :134 · `sweepWeeklyAnalysis(...)` :174 (cron.ts:349 · หักเงิน WEEKLY_REPORT เฉพาะร้านที่เปิด `AiSettings.weeklyReportEnabled`)

**actions.ts** (275, `"use server"`) — `assertAiCan(auth, action)` :16 (ภายใน) · `PendingProposal` :29 · `PendingPlan` :38 · `AiQuotaView {balanceUsd; balanceMicro; empty; low}` :53 · `AiChatState` :60 · `loadAiQuotaAction()` :81 · `loadAiChatAction()` :110 · `loadPlansAction(convId)` :131 · `listPendingProposalsAction(convId)` :139 · `confirmProposalAction(id, opts?)` :152 · `rejectProposalAction(id)` :169 · `confirmPlanAction(id, opts?)` :189 · `rejectPlanAction(id)` :219 · `sendAiMessageAction(input)` :230 · `sendAiFeedbackAction(input)` :260

**credit-actions.ts** — `startTopUpAction(packId)` :14 · `loadMoreTxnsAction(cursor)` :44 · `setWeeklyReportAction(...)` :54
**อื่น ๆ**: `dataset.ts` (`anonymize` :21 · `recordSample` :43) · `contact-data.ts` (`findContactData` :102 · `contactDataRefusal` :181) · `interview.ts` (`nextInterviewTurn` :83) · `kanban-adapter.ts` (ชนิดล้วน)

**adapter ของ 4 โมดูล (ไฟล์บางโดยเจตนา · ทุก op ที่มี `tool:{name,hint,risk?}` ในทะเบียน REST กลายเป็น tool)**
- `tools-account.ts` → `accountTools()` :30 · ข้อมูลจาก `account-ops.ts`: `accountToolOps` :349 · `accountToolInfos` :353 (`danger: op.kind==="danger"` :363) · `accountToolNames` :371 · `accountKindOf` :378 · `isAccountKind` :382 · `accountKindAccess` :387 · `accountDestructiveKinds` :397 · `accountToolScope` :413 · `accountToolAllowedForScopes` :418 · `runAccountTool` :790 · `dispatchAccountKind` :845
- `tools-kanban.ts` → `kanbanTools()` :29 · `kanbanToolCount` :69 · `kanbanRestToolCount` :74 · `kanban-ops.ts`: `KanbanToolViewer` :51 · `kanbanMembershipCan` :101 · `kanbanToolOps` :315 · `kanbanToolInfos` :319 · `kanbanToolNames` :337 · `kanbanKindOf` :344 · `isKanbanKind` :348 · `kanbanKindAccess` :353 · `kanbanDestructiveKinds` :363 · `kanbanToolScope` :368 · `kanbanToolAllowedForScopes` :376 · `runKanbanTool` :541 · `dispatchKanbanKind` :608 · `kanban-op-from-chat.ts`: `CARD_FROM_CHAT_ADAPTER` :120 · `CARD_FROM_CHAT_OP` :167
- `tools-member.ts` → `memberTools()` (สะพานอยู่ `@/lib/modules/member/api/tools`: `dispatchMemberKind` `isMemberKind` `memberDestructiveKinds` `memberKindAccess` `memberToolNames` `memberToolScope` `memberToolAllowedForScopes`)
- `tools-crm.ts` → `crmTools()` :23 · `crmToolCount()` :60 (สะพาน `crmApi.*` ผ่าน facade `@/lib/modules/crm`: `crmToolNames` `crmToolInfos` `crmKindAccess` `crmDestructiveKinds` `isCrmKind` `dispatchCrmKind` `crmToolScope` `crmToolAllowedForScopes` `LEGACY_CRM_LEAD_TOOL_DEF` `crmLegacyLeadOpen`)
- กติกา 3 ชั้นเหมือนกันทุกตัว: `read` → ทำทันที · `write` → ข้อเสนอ `<module>.<opId>` · `danger` → ข้อเสนอ `risk: DESTRUCTIVE`

### 2.1 (a) แชท → tool → proposal → คนยืนยัน → execute (ใครตรวจสิทธิ์ · ที่ไหน · ด้วยตัวตนของใคร)
```
แอป  POST /api/mobile/chat/send            (route.ts:7)
  requireMobile(req) → Bearer + X-Tenant-Id → Membership(acceptedAt≠null) + tenant ไม่ SUSPENDED/CLOSED   [lib/mobile/auth.ts:74]
  mobileDenied(g, AI_CHAT={ai,"ai.chat.send"}) → evaluate()                                              [lib/mobile/guard.ts:10,23]
  mobileAiCtx(g) = {tenantId, actor: aiMemberActor(tenantId, user.id, membership)}                       [guard.ts:31]
  sendMobileChat(ctx,input) → SSE {status}…{done}|{error}                                                 [lib/mobile/chat.ts:15]
เว็บ  sendAiMessageAction → requireTenant + assertAiCan("ai.chat.send") → sendMessage(convCtxOf(auth))  [ai/actions.ts:230]

sendMessage(ctx: SendCtx)                                                                                [service.ts:97]
  actor.tenantId === ctx.tenantId ไม่งั้น throw                                                           :113
  canSpend(tenantId) (กระเป๋า > 0) ไม่ผ่าน → {over_budget, scope:"credit"}                                 :127
  AiUsage วันนี้ vs dailyLimits() → {over_budget, scope:"day"}                                            :133–141
  balance < $0.50 → applyDegrade → FAST_MODEL                                                             :146–156
  prompt: buildSystemPrompt({tenantName, dna, systems, memories: memoryBlock({tenantId, actor}), promptTweaks}) + skillIndexPrompt(visibleSkills)   :160–214
  visibleSkills = skillsForTenant(AppSystem types).filter(offeredOf(s.tools).length>0)  ← toolsOfferedTo(actor) = ด่านชั้น 1 (ไม่ยื่น)   :176–177
  ห้อง: findVisibleConversation(ctx, id) ?? create {id: newConversationId(ctx) = "u~<userId>~<hex>"}       :192–199
  agent loop ≤5 รอบ: provider.chat(messages,{tools}) → load_skill (ชั้น service) | runTool({tenantId, actor, conversationId}, name, args)   :240–310
runTool                                                                                                  [tools.ts:2511]
  actorProblem → toolVerdict(actor, name) (ด่านชั้น 2: HAND_TOOL_ACCESS / KIND_ACCESS ของ "คนที่จะกดยืนยัน" / scope ทะเบียน)
  guarded(): ห้องที่ actor มองไม่เห็น → ตัด conversationId ทิ้ง                                              :2405
  เครื่องมือเสนอ → propose() → createProposal({conversationId, kind, summary, payload}) risk ตาม DESTRUCTIVE_KINDS   :463 / proposals.ts:313
  ผลกลับ JSON {proposalId, summary, waiting:"user_confirm"}
persist: AiMessage USER+ASSISTANT + AiConversation.updatedAt + AiUsage upsert (tx เดียว)                   :314–338
chargeUsageSafe({tenantId},{source: deps.source ?? "CHAT", model, tokensIn, tokensOut, conversationId})   :342  (ไม่ส่ง userId)

แอป  GET /api/mobile/proposals?conversationId → listPendingProposals(mobileAiCtx) (ห้องตัวเอง)           [proposals/route.ts]
แอป  POST /api/mobile/proposals/confirm {id, confirm2x?}  — 🔸 ไม่เช็ก AI_CHAT (พึ่ง KIND_ACCESS)
  m = {role, unitAccess, permissions} ของ membership ใน requireMobile ; executeProposal(m, g.ctx, id, {confirm2x, userId: g.user.id})  [proposals/confirm/route.ts]
เว็บ confirmProposalAction → executeProposal(membershipOf(auth), ctx, id, {...opts, userId})              [ai/actions.ts:152]

executeProposal(m, ctx, id, opts)                                                                        [proposals.ts:363]
  อ่านแถวจาก DB (id = input เดียว)                                                                         :369
  ประตู CRM (crm.assist.tasks · crm.activity.ai_fill · crm_create_lead+systemId · crm.* ที่มี requestedByUserId) → crmSvc.aiBridges.confirmProposalById(userId จำเป็น)   :379–388
  การมองเห็น: canSeeConversationId(sightOfConfirmer(m, userId), row.conversationId) — ผู้สร้างห้อง หรือ OWNER ถ้าห้องไม่ใช่ u~   :393
  resultNote "WORKING#…" = ยังเตรียมอยู่ · status≠PENDING · หมดอายุ → EXPIRED                             :398–414
  assertCan(m, KIND_ACCESS[kind])  ← **สิทธิ์ของคนกด ณ ตอนกด** (ไม่ผ่าน = คง PENDING)                        :417–426
  risk DESTRUCTIVE && !confirm2x → {needsSecondConfirm:true}                                              :430–436
  claim PENDING→EXECUTED (updateMany)                                                                     :439–443
  dispatch(tenantId, id, kind, payload, m, userId) → service ของโมดูล (account/kanban/member/crm ผ่านทะเบียน op · ตัวอื่นเขียนมือ) :447/496
  พัง → FAILED + resultNote
  route แอป: res.ok → wakeOutbox() (CRM facade)
```
**AuditLog**: `executeProposal` เองไม่เขียน — เฉพาะ op ของทะเบียน (บัญชี ฯลฯ) ที่เขียนด้วย actorType USER ของคนกด (proposals.ts:509 คอมเมนต์)

### 2.2 (b) งานประจำ (scheduled) — ใครบังคับ "อ่านอย่างเดียว"
```
GET /api/cron/hourly (isCronAuthorized)  →  runScheduledTasks(new Date())        [cron/hourly/route.ts:22–35]
  provider = resolveProvider("fast")                                              [scheduled.ts:71]
  tasks = findMany({active, hourBkk == ชั่วโมงไทย, lastRunDay ≠ วันนี้}, take 100)   :78–86   ← ไม่มี lease/claim ก่อนรัน
  ต่อ task: sendMessage({tenantId, actor: aiSystemActor(tenantId,"scheduled-task")}, {text: instruction}, {provider, source:"SCHEDULED"})  :94–98
           → AppNotification {recipientUserId: null = ทั้งร้าน, title "งานประจำจากผู้ช่วย AI"}  :100–106
           → sendPushToTenant(tenantId, …)  :109–113
           → update lastRunDay = today  :118
```
**"อ่านอย่างเดียว" ไม่ได้บังคับด้วยด่านห้ามเขียน** — บังคับทางอ้อมด้วยตัวตน `aiSystemActor("scheduled-task")` ที่ได้ `SHOP_AUDIENCE = {STAFF, unitAccess:[], permissions:{}}` (actor.ts:43–61):
- เครื่องมือเสนอทุกตัวถูกตัดเพราะ `kindAccessOf(kind)` ต้องมีคีย์ → `evaluate(STAFF ว่าง)` = false (tool-access.ts:246–255) · `propose_plan` ผ่านด่านแต่ทุกขั้นถูก `actorCanConfirmKind` ปฏิเสธ (tools.ts:1036)
- 🔴 **รั่ว**: เครื่องมือ `writesNow` ที่ `needs: []` ยังผ่าน — `remember_fact` `forget_fact` `support_open_case` (tool-access.ts:71–75) ⇒ งานประจำ **เขียน AiMemory (`s~`) และเปิดเคส support ได้**
- เครื่องมือ `branchScoped` (นัด/คิว/ร้านค้า/เช่า/ร้านอาหาร/ตั๋ว) และ `needsPerson` (approvals_pending) ถูกปฏิเสธ → งานประจำตอบได้แค่ข้อมูลระดับร้านที่ OPEN
- ห้องของงานประจำ = `s~scheduled-task~…` → OWNER เท่านั้นที่เปิดดูได้
- ไม่มี lease: cron ซ้อนสองตัว = รันซ้ำ + หักเงินซ้ำ (lastRunDay ถูกเขียน **หลัง** รันเสร็จ)

### 2.3 (c) การหักเครดิต + หน้าต่างใช้งาน
- **จุดหักเงิน (ไมโครดอลลาร์)**: `chargeUsage` credit.ts:119–146 (`AiCreditWallet.balanceMicro decrement` + `AiCreditTxn` USAGE `balanceAfter` ใน `$transaction`) ← `chargeUsageSafe` :152 · ค่า = `costMicroUsd(model, in, out)` pricing.ts:38 + `extraMicroUsd`
- **ผู้เรียก `chargeUsageSafe` 17 จุด** (นอก credit.ts): `ai/service.ts:342` · `ai/analyst.ts:157` · `mobile/chat.ts:82` (AUTO_TITLE) · `dna/actions.ts:62` · `platform/crm-bridges/chat.ts:235` · `modules/chat/translate.ts:236,308` · `modules/chat/task-from-chat.ts:306` · `modules/chat/ai-suggest.ts:393` · `modules/crm/ai-bridges.ts:592` · `modules/crm/calls.ts:492,660` · `modules/kanban/automation-suggest.ts:407` · `modules/kanban/ai.ts:81` · `modules/member/reviews.ts:1095,1130` · `modules/account/inbox-ai.ts:371`
- **ผู้เรียก `canSpend`/`canSpendPeek`** 16 ไฟล์ (ai/analyst · ai/service · dna/actions · account/inbox-ai · account/rate-limit · chat/ai-suggest · chat/service · chat/task-from-chat · chat/translate · crm/ai-bridges · crm/calls · kanban/ai · kanban/automation-suggest · member/reviews · platform/crm-bridges/chat)
- **เครดิตต้อนรับแบบ lazy**: `ensureWallet` credit.ts:34–67 — ไม่มีกระเป๋า → สร้าง `{balanceMicro: welcomeGrantMicro(), grantedAt: now}` + แถว `GRANT/GRANT ref:"welcome-grant"` · P2002 = อ่านของเดิม · ถูกเรียกผ่าน `balanceOf/canSpend` (ทุกแชท) · `creditView` (ai/actions.ts:69) · **`GET /api/mobile/usage` (usage/route.ts:18) = เขียนตอน GET** · `topUp` · `chargePlatform` · `canSpendPeek` :85 = ทางอ่านที่ไม่เขียน
- **หน้าต่าง 5 ชม./สัปดาห์**: `AiUsageWindow` + `recordQuotaUsage` usage.ts:151 + `getQuotaStatus` :110 — 🔴 **ไม่มีผู้เรียกเลยใน `src/`** (grep ว่าง) = โค้ดตาย ตั้งแต่เปลี่ยนเป็นกระเป๋า prepaid 8 ส.ค. · ที่ยังใช้จาก usage.ts คือ `applyDegrade` `quotaMessage` (และ `weekStartBangkok` ภายใน)
- **ตาข่ายรายวัน**: `AiUsage` + `overBudget(dailyLimits())` service.ts:133 — ยังทำงาน (300 req / 400k token ต่อร้านต่อวัน)
- **degrade**: balance < `LOW_BALANCE_MICRO` ($0.50) → haiku (service.ts:146) — 🔴 ถ้าเลิกเครดิตต้อนรับ ร้านใหม่ทุกร้าน balance = 0 ⇒ `canSpend` false (แชทใช้ไม่ได้เลย) และ degrade ตลอด — ดู §8 C3

### 2.4 (d) ทะเบียนสกิล
- รูป: `Skill { id; label (TH); summary (EN — อยู่ใน prompt ทุกคำขอ); tools: string[]; systems?: SystemType[] }` (skills.ts:25) · สกิลไม่มี `systems` = ทุกร้านเห็น
- โหลดแบบทยอย: ยื่น `CORE_TOOLS` + `load_skill({skills:[...]})` (enum = สกิลที่ยังไม่โหลด) → service เติม `toolNamesOfSkills(ids)` ที่ `toolsOfferedTo(actor)` ผ่าน
- กติกาเหล็ก: ทุก tool อยู่ในแกนกลางหรือสกิล **พอดี 1 ที่** — `assertSkillRegistryComplete()` :382 (fitness F10.1) + สกิล account/tasks ต้องตรงทะเบียน op ไม่ขาดไม่เกิน · members/crm ทางเดียว
- **20 สกิล** (id · systems):
  1 `sales` POS,ACCOUNT · 2 `account` ACCOUNT (36 tool) · 3 `inventory` INVENTORY · 4 `members` MEMBER,POINT,REWARD,COUPON (8 รุ่นแรก + ทะเบียน) · 5 `booking` BOOKING,QUEUE · 6 `shop` SHOP · 7 `restaurant` RESTAURANT · 8 `hotel` HOTEL · 9 `rental` RENTAL · 10 `ticket` TICKET · 11 `school` SCHOOL · 12 `clinic` CLINIC · 13 `hr` HR · 14 `crm` CRM,MARKETING · 15 `tasks` KANBAN · 16 `approvals` (ทุกร้าน) · 17 `chat` CHAT · 18 `knowledge` (ทุกร้าน) · 19 `automation` (ทุกร้าน: `schedule_task` `automation_create_rule`) · 20 `memory` (ทุกร้าน: `forget_fact`)
  - หมายเหตุ: `SystemType` (app_system.prisma:19–37) ไม่มี SHOP/RESTAURANT/HOTEL/RENTAL/TICKET/SCHOOL/CLINIC/QUEUE — ค่าพวกนี้เป็น `UnitType` ⇒ สกิลเหล่านั้น **ไม่มีวันโผล่** ผ่าน `skillsForTenant(AppSystem.type)` (service.ts:162,177 · `api/v1/ai/skills/route.ts:36` ก็ใช้ AppSystem.type) · ข้อสอบ `qc-ai-skills.mts:64` ยิง `skillsForTenant(["HOTEL"])` ตรง ๆ จึงเขียวทั้งที่ทาง prod ไม่เคยส่ง "HOTEL" — ควรยืนยันก่อนทำแม่แบบตำแหน่ง
- การแยก read/write ต่อ tool: เขียนมือ = `AiTool.action === true` (tools.ts:62) หรืออยู่ใน `HAND_ACTION_KIND` · ทะเบียน = `op.kind` `read|write|danger` (`AccountToolInfo.danger` ฯลฯ) · core `remember_fact/forget_fact/support_open_case/kb_auto_save` = **เขียนทันที** (`writesNow`)

### 2.5 (e) การประกอบ system prompt
`service.ts:207–214` → `[buildSystemPrompt({tenantName, dna: dnaFactsSummary, systems, memories: memoryBlock(...), promptTweaks: approvedPromptTweaksText()}), skillIndexPrompt(visibleSkills)].join("\n\n")`
- `buildSystemPrompt` (persona.ts:29–81): หัว "คุณคือผู้ช่วย AI ประจำกิจการ …" → ระบบที่เปิด → DNA → "สิ่งที่จำได้เกี่ยวกับร้านนี้" (memories) → tweaks → กติกา 20 ข้อ (ไทย) + `ACCOUNTANT_RULES` ถ้ามี ACCOUNT
- ภาษา: **ไทยล้วน + "ตอบภาษาไทยเสมอ"** (:59) · ส่วนอังกฤษมีแค่สารบัญสกิล + description ของ tool บางตัว
- memory: ผู้ดูเห็นเฉพาะของตัวเอง + ข้อเท็จจริงของร้าน (`o~`) + รุ่นเดิมที่ไม่มีข้อมูลติดต่อ (memory.ts / conversation-owner.ts:129)
- history: 40 แถวล่าสุด ตัดเหลือ 24,000 ตัวอักษร (`trimHistory`)
- ไม่มีที่ฉีด "คู่มือพนักงาน" / persona รายคน / ภาษาที่เลือก — T1.4/T1.5 ต้องเพิ่มพารามิเตอร์ใน `PersonaContext` หรือ builder ใหม่

---

## 3. Mobile API (`src/app/api/mobile/**` — 38 route)

ตัวช่วยยืนยันตัวตน (`src/lib/mobile/auth.ts`): `issueMobileToken(userId, meta)` :23 (แถว `Session` · idle 30 วัน / abs 90 วัน) · `revokeMobileToken(raw, expoToken?)` :44 · `mobileUser(req)` :53 (Bearer อย่างเดียว) · `requireMobile(req) → MobileGate` :74 (Bearer + `X-Tenant-Id` → Membership acceptedAt ≠ null + ร้านไม่ SUSPENDED/CLOSED) · `mobileError(g)` :89 · `issueWebviewCode(userId, tenantId)` :95 · `consumeWebviewCode(code)` :109 · `issueLoginCode(userId)` :132 · `consumeLoginCode(code)` :146
ด่านรายข้อ (`src/lib/mobile/guard.ts`): `mobileDenied(g, q)` :10 · `AI_CHAT` :23 · `SYSTEM_CREATE` :25 · `mobileAiCtx(g)` :31
ตัวช่วยโมดูล: `runMobileCrm(req, g, run, {readBody?, bucket?})` crm-routes.ts:51 (rate 120/นาที · scan 10/นาที · `crmMobile.resolveSystem` · `toMemberActor` · wakeOutbox หลังเขียน) · `mobileMemberScope(g) → {mc, actor, ctx}` member-routes.ts:53 · `readJson(req)` :65

| method · path | auth | request → response (ย่อ) |
|---|---|---|
| POST `auth/otp` | ไม่มี | `{email}` → `{ok:true}` |
| POST `auth/verify` | ไม่มี | `{email, code}` → `{token, expiresAt, user}` (401 `{error: reason}`) |
| POST `auth/google` | ไม่มี | `{idToken}` → `{token, expiresAt, user}` (503 `google_disabled`) |
| POST `auth/apple` | ไม่มี | `{identityToken, name?}` → `{token, expiresAt, user}` |
| POST `auth/exchange` | ไม่มี | `{code}` (login code จาก LINE/FB เว็บ) → `{token, expiresAt, user}` |
| POST `auth/logout` | Bearer (revoke) | `{expoToken?}` → `{ok:true}` |
| GET `me` | `mobileUser` (ไม่ต้องมีร้าน) | → `{user:{id,email,name}, memberships:[{tenantId, name, role, branding:{displayName, logoUrl, accent, accentFg, navTone}|null}]}` (`getBrandingTokens` แคช 60 วิ · null เมื่อ `applyMobile=false`) |
| GET `tenants` | `mobileUser` | → `{tenants:[{tenantId,name,role}]}` |
| POST `tenants` | `mobileUser` | `{name}` → `{tenantId}` (`createTenantForUser` · OWNER) |
| GET `conversations` | requireMobile + AI_CHAT | → `{conversations:[{id,title,updatedAt,unread}]}` (ห้องของตัวเอง) |
| POST `conversations` | + AI_CHAT | `{title?}` → `{id}` |
| PATCH `conversations/[id]` | + AI_CHAT | `{title}` → `{ok}` |
| DELETE `conversations/[id]` | + AI_CHAT | → `{ok}` (soft `deletedAt`) |
| GET `conversations/[id]/messages` | + AI_CHAT | → `{messages:[{id,role,content,createdAt}]}` |
| POST `conversations/[id]/read` | + AI_CHAT | → `{ok}` |
| POST `chat/send` | + AI_CHAT | `{conversationId?, text, imageUrls?}` → **SSE** `data: {type:"status",label}` … `{type:"done",result:{ok,conversationId,reply,clarify?}}` / `{type:"error",error(ไทย)}` |
| POST `chat/welcome` | + AI_CHAT | `{}` → `{existing:true}` หรือ `{existing:false, conversationId, choices[≤3]}` (สร้างห้อง + ข้อความทัก) |
| GET `proposals?conversationId=` | + AI_CHAT | → `{proposals:[{id,kind,risk,summary,createdAt}]}` |
| POST `proposals/confirm` | requireMobile (ไม่มี AI_CHAT) | `{id, confirm2x?}` → `{ok, note, needsSecondConfirm?}` |
| POST `proposals/reject` | requireMobile | `{id}` → `{ok}` (CRM door: `{ok, error?}`) |
| POST `plans/confirm` | requireMobile | `{id, confirm2x?}` → `PlanExecResult` |
| POST `plans/reject` | requireMobile | `{id}` → `{ok}` |
| GET `usage` | + AI_CHAT | → `{scope:"credit", used, limit, pct, warn, degraded, blocked:"credit"|null, resetAt, balanceMicro}` 🔒 **รูปต้องคงเดิม** (build #19 อ่านอยู่ · route.ts:3–6) · เขียนกระเป๋าตอน GET |
| POST `push/register` | requireMobile | `{expoToken, platform}` → `{ok}` (upsert by expoToken · tenantId = ร้าน active) |
| POST `webview-session` | requireMobile | → `{code}` (one-time 60 วิ) |
| GET `webview-exchange?code=` | ไม่มี (code) | → cookie session + `setActiveTenant` → redirect `/app` (ผิด → `/login?err=code`) |
| GET `dna/questions` | requireMobile | → `{questions}` |
| POST `dna/answers` | requireMobile | `{facts}` (ZDnaFacts) → `{blueprintId, plan}` |
| POST `dna/apply` | + SYSTEM_CREATE | `{blueprintId}` → `{ok, results}` |
| GET `crm/deals` · GET `crm/deals/[id]` | runMobileCrm | → `crmMobile.myDeals` / `{deal}` |
| GET `crm/tasks` · POST `crm/tasks/[id]/complete` | runMobileCrm | → `crmMobile.todayTasks` / complete |
| GET/POST `crm/call-log` | runMobileCrm | `?contactId&dealId` → prompt / body → `{activityId, replayed}` 201/200 |
| POST `crm/scan-card` | runMobileCrm (scan bucket) | `{dataBase64, contentType, filename?}` → `{proposalId, draft}` |
| POST `crm/scan-card/[proposalId]/accept|reject` | runMobileCrm | → `{contactId}` / `{ok}` |
| GET `member/search?q=` · POST `member/scan {token}` · GET `member/summary?id=` · GET/POST `member/stamp` | requireMobile + `mobileMemberScope` + `canReadMember` / `assertCan(member.loyalty.stamp)` | → `{items}` / `{member}` / summary / `{cards}` / ผลประทับ |

**แอปยืนยันตัวตนอย่างไร**: login (OTP/Google/Apple/exchange) → Bearer เก็บ `SecureStore` (`src/lib/session.ts`) → ทุกคำขอใส่ `Authorization: Bearer` + `x-tenant-id` (src/api/client.ts:38–64) → หน้าแรก (WebView) ขอ `POST webview-session` → เปิด `GET /api/mobile/webview-exchange?code=` ใน WebView (cookie จริงอยู่ใน WebView เท่านั้น · ห้าม token ใน URL) · UA ต่อท้าย `SharkApp/1`
**ข้อสังเกต**: ไม่มี route ไหนในแอปเรียก `plans/*` (grep `apps/mobile` ว่าง) — การ์ดแผนยังไม่มีในแอป · ไม่มี endpoint ข้ามกิจการ (ทุกตัวผูก `X-Tenant-Id` เดียว ยกเว้น `me/tenants`)

---

## 4. แอปมือถือ (`apps/mobile` · Expo SDK 57 · RN 0.86 · React 19 · expo-router 57)

> `apps/mobile/CLAUDE.md` → `AGENTS.md`: "Expo HAS CHANGED — read https://docs.expo.dev/versions/v57.0.0/ before writing any code"

### 4.1 ไฟล์จอ + หน้าที่
| ไฟล์ | บรรทัด | หน้าที่ | ชนิด |
|---|---|---|---|
| `app/_layout.tsx` | 58 | Root: `useAppFonts` → `GestureHandlerRootView` → `AuthProvider` → `Gate` (ไม่มี token → `/login` · ไม่มีร้าน → `/dna` · อื่น → `/(app)`) → `Stack` headerShown:false, animation fade · `StatusBar style="dark"` | — |
| `app/login.tsx` | 372 | OTP อีเมล 2 ขั้น + Apple/Google/LINE/Facebook (exchange) | native |
| `app/dna.tsx` | 487 | สร้างกิจการ + สัมภาษณ์ DNA → apply ระบบ | native |
| `app/(app)/_layout.tsx` | 229 | `Drawer` (expo-router/drawer) + `DrawerBody` (ชื่อกิจการ ▾ สลับ/เพิ่มกิจการ · เมนู ระบบงาน/ผู้ช่วย AI/สมาชิก/CRM ขาย · อีเมล + ออกจากระบบ 2 จังหวะ) · `registerPush()` · แตะ push → `/chat/<id>` หรือ `crmRouteFromLink` · **`swipeEnabled: false`** (:171 — เจ้าของสั่ง 6 ก.ย. ใช้เมนูเว็บแทน) | native |
| `app/(app)/index.tsx` | 245 | **หน้าแรก = WebView `/app`** (code 60 วิ) · รับ postMessage `{ev:"chat-fullscreen"|"open-ai"|"open-member"}` · `?open=/app/...` เปิดพาธเว็บ · orb ซ่อนอยู่ (`ORB_HIDDEN_FOR_NOW`) | **WebView** |
| `app/(app)/sessions.tsx` | 350 | รายการห้องแชท AI (unread · สไลด์แก้ชื่อ/ลบ · ＋ ห้องใหม่ · `QuotaBar` · โลโก้/ชื่อจาก `useBrand`) | native |
| `app/(app)/chat/[id].tsx` | 462 | ห้องแชท: bubble · `ProposalCard` · แนบรูป (≤2 MB) · SSE `sendChat` · chips จาก welcome | native |
| `app/(app)/crm/_layout.tsx` · `index` · `tasks` · `call-log` · `scan-card` | 11/179/185/187/178 | CRM ขาย (ใบ C3.7): ดีลของฉัน · งานวันนี้ · บันทึกสายหลังวางสาย · สแกนนามบัตร — Stack ซ้อนใน Drawer · มี `CrmTabBar` (แถบล่างของโซน CRM) | native |
| `app/(app)/member/_layout.tsx` · `index` · `[customerId]` · `stamp` | 9/326/225/245 | สมาชิก (M3.11): ค้น/สแกน QR → สรุป → ประทับสแตมป์ PIN | native |

### 4.2 คอมโพเนนต์/ไลบรารีที่มี
- `src/components/chat/ProposalCard.tsx` — `ProposalView {id; summary; risk; resolved?; note?}` · props `{proposal, busy, armed, onConfirm, onReject}` · DESTRUCTIVE = ปุ่มแดง 2 จังหวะ
- `src/components/chat/QuotaBar.tsx` — GET `/api/mobile/usage` แคช 30 วิ · โผล่เมื่อ ≥ ครึ่ง · type `scope: "session"|"week"` (ไม่ตรงกับ server ที่ส่ง `"credit"`)
- `ChatBubble.tsx` · `TypingIndicator.tsx` · `Orb.tsx` (png) · `ui/orb.tsx` `AnimatedOrb` · `ui/text.tsx` (`Text`/`TextInput` กลาง — map fontWeight → IBM Plex Sans Thai · ห้าม import Text จาก RN) · `ui/page.tsx` (`PageColumn` max 720 สำหรับ iPad · `useWideScreen`)
- `components/auth/ui.tsx` (`Orb` `SpinningOrb` `PrimaryButton` `LinkButton` `InlineError` `inputStyle`) · `components/crm/ui.tsx` (`CrmHeader` `CrmTabBar` `CrmNotice` `Chip` `crmApiPath` `baht` `thaiWhen` `openDrawerFrom` …) · `components/member/ui.tsx`
- สลับกิจการ: `DrawerBody` ใน `(app)/_layout.tsx:20–140` → `useAuth().switchTenant` (auth-context.tsx)
- `src/api/client.ts`: `BASE_URL = "https://shark.in.th"` (ฮาร์ดโค้ด) · `api<T>(path, {method?, body?, auth?, tenant?})` · `ApiError {status, code, detail}` · `apiErrorText(e)` (ไทย) · `sendChat(input, onEvent)` (SSE ผ่าน `expo/fetch`)
- `src/lib/auth-context.tsx`: `AuthState {ready, token, user, tenants, activeTenantId, activeBranding, signIn, signOut, switchTenant, refreshMe}` · `TenantRow` · `Branding {displayName, logoUrl, accent, accentFg, navTone}`
- `src/lib/session.ts` (SecureStore: `shark_token` `shark_tenant` `shark_brand`) · `push-register.ts` (`registerPush` `conversationIdFromNotification` `currentPushToken` `resetPushRegistration`) · `crm-link.ts` · `call-prompt.ts` · `fonts.ts` (`useAppFonts`)

### 4.3 ธีม/โทเคน
- `src/theme.ts`: `C` {bg #fff, surface, surfaceHi, border, text, textDim, textFaint, blue #2563eb, blueHi, blueSoft, cyan, danger, dangerDim, ok} · `R` {sm 8, md 12, lg 16, full} · `S` {xs 4 … xl 24} — **light อย่างเดียว**
- `app.json`: `userInterfaceStyle: "light"` · bundle `th.in.shark.ai` · version 1.0.0 · iOS buildNumber 24 · Android versionCode 1 · `runtimeVersion.policy: "appVersion"`
- ไม่มี glass/blur ใน `package.json` (มี `expo-glass-effect` ใน node_modules แบบ transitive เท่านั้น) ⇒ Liquid Glass แบบ native = เพิ่ม native dependency = ต้อง EAS build ใหม่ (OTA ไม่พอ)

### 4.4 แบรนด์จาก `/api/mobile/me`
`AuthProvider.loadMe()` (auth-context.tsx:63–70) → `tenants[].branding` → `activeBranding` (ก่อน ready ใช้แคช `shark_brand`) → `useBrand()` (src/lib/brand.tsx:83) คืน `{accent, accentFg, soft(12% alpha), logoUrl, displayName}` — แคชระดับโมดูลกันกะพริบ · `navTone` **ไม่มีจอไหนใช้** · ใช้จริงใน sessions header (โลโก้/ชื่อ) · ปุ่ม/การ์ด

### 4.5 i18n
แอปไม่มี i18n — ข้อความไทยฝังในจอ · เลี่ยง `Intl`/`toLocaleString` (Hermes ไม่ครบ — จัดรูปเอง) · เว็บมี `src/messages/{th,en}/common.json` + `src/lib/i18n/{dict,index}.ts`

### 4.6 QC render (`apps/mobile/qc/*`)
- `README.md`: rsync สำเนา → patch `session.ts` เป็น localStorage + ห่อ `GoogleSignin.configure` → `npm install --no-save react-native-web@~0.21.0` → `npx expo export --platform web` → เสิร์ฟ → puppeteer ถ่าย · WebView dashboard เรนเดอร์บนเว็บไม่ได้
- `shoot-crm.mjs` (251) ต้องการ:
  - puppeteer-core จาก `/root/dive3d/node_modules/puppeteer-core/...` · chromium `/usr/bin/chromium-browser` · โปรไฟล์ `--user-data-dir` ต้องลบหลังปิด (snap private tmp)
  - สำเนา `QC_COPY` (ปริยาย `/root/qc-shark-mobile-crm`) · node_modules symlink `QC_NODE_MODULES` (ปริยาย `/root/qc-shark-mobile/node_modules` ต้องมี react-native-web)
  - โหมด A `QC_PREPARE=1` (rsync+patch+export+serve ที่ `QC_PORT` ปริยาย **4712**) · `QC_SKIP_EXPORT=1` · โหมด B `QC_BASE=http://127.0.0.1:4700`
  - **fixture** `QC_CRM_FIXTURE` (ปริยาย `<repo>/.qc-shots/crm/3.7/fixture-thana.json`) = ไฟล์ที่ **oracle `scripts/qc-crm-c3.7.mts` เขียนจาก seed** · sha256 ลง summary
  - mock: `page.setRequestInterception` ดักโฮสต์ `shark.in.th` ทุกคำขอ (ต้องมี CORS headers + ตอบ OPTIONS 204) · ME = ร้าน `t1` · localStorage `shark_token="qc-mock"` `shark_tenant="t1"` · ไม่มี mock = 404 + จดใน `unmocked`
  - viewport `VIEW = {tag:"iphone", w:390, h:844}` (:201) · ตรวจ `data-testid` ที่คาด · overflow แนวนอน · ผล `apps/mobile/qc/shots-crm/*.png` + `summary.json {generatedAt, base, view, fixture:{path,sha256}, screens[{name, ok, errors, missing, overflow, expect, texts, unmocked, url, file}]}`
- พอร์ตที่ใช้แล้ว: 4700 (static), 4711 (shoot-member), 4712 (shoot-crm) ⇒ เสนอ **4713** ให้ `shoot-ai-team.mjs` · `QC_COPY=/root/qc-shark-mobile-ai`

---

## 5. สิทธิ์ · อนุมัติ · audit · แจ้งเตือน

- **ประกาศคีย์สิทธิ์**: `src/lib/core/permissions.ts` — `MODULE_DEFS: ModuleDef[]` :88 (`{module, label, group, actions: Record<key, labelTH>, planned?}`) · โมดูล `ai` :659–667 มีแค่ `ai.chat.send` `ai.schedule.create` · ดัชนี: `PERMISSIONS` :812 · `PERMISSION_MODULES` :833 · `PERMISSION_KEYS` :848 · `isPermissionKey` :854 · `isPermissionParamKey` :859 · `moduleOfPermissionKey` :864 · `permissionLabel` :869 · `permissionModulesByGroup` :876 · `PERMISSION_PARAMS` :753 (ตัวเลขสิทธิ์ เช่น `_maxApproveSatang`) · `CRM_OWNER_ONLY_KEYS` :741 (แบบอย่างคีย์ที่ให้ได้เฉพาะ OWNER) · กติกา 3 ข้อหัวไฟล์ :7–13 (UI อ่านจากที่นี่ · คีย์ต้องตรง `assertCan` · `updateStaffAccess` validate)
- **ตรวจสิทธิ์**: `src/lib/core/rbac.ts` (ไม่ใช่ permissions.ts) — `type AccessQuery {module; action; unitId?}` :6 · `type MembershipCtx {role; unitAccess; permissions}` :15 · `evaluate(m, q): boolean` :32 (OWNER ผ่านหมด · MANAGER ผ่านในสาขาที่เข้าได้ · STAFF = `permissions[action]===true || permissions["<module>.*"]===true`) · **`assertCan(m: MembershipCtx|null, q: AccessQuery): void`** :140 (โยน `ForbiddenError` :132) · `canAccessUnit` :22 · `canViewPayroll` :47 · `canReadInventory` :58 · `filterAccessibleUnitIds` :69 · `permissionValue(m, key)` :76 · `ROLE_RANK` :91 · `canAssignRole` :94 · `canGrantUnitAccess` :102 · `canGrantPermission(actor, module, action)` :112 · `canGrantPermissionValue` :121 (ใช้ทำ "ห้ามให้สิ่งที่ตัวเองไม่มี" — ตรงกับหลัก AUTO ของ §4.2)
- context เว็บ: `requireTenant()` context.ts:41 · `requireMembership(tenantId)` :52 · `requireUnit` :71
- **อนุมัติ** (`src/lib/modules/approval/`, facade `index.ts` — ที่ import ได้: `submitForApproval` `cancelRequest` `cancelRequests` `lastDecisionOf` `requestStatuses` `resolvePolicy` + types `ApprovalCtx` `SubmitInput`):
  `resolvePolicy(ctx, {entityType, unitId?, systemId?, amountSatang?}, tx?) → ApprovalPolicy|null` service.ts:140 (เจาะจงสุดชนะ unit>system>global) · `submitForApproval(ctx, SubmitInput, {tx?}) → {autoApproved:true}|{requestId}` :171 (+ outbox `approval.request.submitted`) · `decide(m & {userId}, ctx, requestId, {decision, note?}) → DecideResult` :260 (`SELF_DECIDE_REFUSED` :244) · `bulkDecide` :361 · `listPending(ctx, m & {userId})` :387 · `listMyRequests` :405 · `createPolicy` :63 · `updatePolicy` :98 · `setPolicyActive` :89 · `listPolicies` :131
  ผลของการอนุมัติ: composition root `src/lib/approval-effects.ts` — `applyApprovalEffect(evt)` :31 · `applyCrmApprovalEffect(evt)` :177 · ผูกใน outbox-consumers.ts:698–702 (`approval.request.submitted|approved|rejected`)
- **audit**: `writeAudit({tenantId, actorId?, actorType?="USER", action, targetType?, targetId?, before?, after?})` `src/lib/core/audit.ts:15` (กลืน error · await เสมอ) · `account/access.ts` re-export
- **แจ้งเตือน/push** (`src/lib/core/push.ts`): `sendPushToTenant(tenantId, msg:{title, body, data?}, deps?) → {sent}` :94 · `sendPushToUser(userId, msg, {tenantId?, post?})` :145 · `sendPushToUsers(...)` :211 · `sendPushToChatStaff(args)` :291 · `sendPushToCustomerTokens(...)` :392 — นับ sent เฉพาะ Expo `status:"ok"` · ไม่มี helper กลางของ `AppNotification` (ทุกที่ `prisma.appNotification.create` เอง — 28 ไฟล์) · helper ระดับโมดูล: `notifyKanbanUser/notifyKanbanUsers` (kanban/notify.ts:167/117) · CRM `notifications.notifyStaff` (มี prefs + quiet hours)

---

## 6. Outbox / events

- kernel: `src/lib/core/outbox.ts` — `type OutboxHandler` :22 · `emitOutbox(tx, {tenantId, type, idempotencyKey, payload?, systemId?, unitId?})` :36 (ใน tx เดียวกับงานหลัก) · `emitOutboxOutsideTx` :76 · `emitOutboxMany` :100 · **`drainOutbox(consumers, {limit?})`** :139 (claim ต่อ event ด้วย `updateMany` เลื่อน `availableAt` = **lease 6 นาที** :18,133–137 · ล้ม → attempts++ backoff 2^n นาที · ≥5 = FAILED) · `outboxHealth` :201
- composition root: `src/lib/outbox-consumers.ts` — `baseConsumers: Record<type, handler>` (ห่อด้วย `withAutomation` / `crmFirst` / `compose` / `withApprovalEffect`) → `consumers` :1257 (ห่อ `withWebhooks` ทุกตัว) · **`drainAll()`** :1261 · **`scheduleDrain()`** :1281 (→ `scheduleCoalescedDrain` core/after-drain.ts:145 ผ่าน `after()`) · CRM facade มี `wakeOutbox()`
- ทะเบียนป้าย 3 ที่ที่ event ใหม่ต้องลงครบ (คอมเมนต์ outbox-consumers.ts ~1202 "ลงครบ 3 ทะเบียน"): (1) consumer ใน `baseConsumers` (🔴 ขาด = คิวตันเงียบ) (2) `AUTOMATION_EVENTS` `src/lib/automation/labels.ts:27` (`KANBAN_AUTOMATION_EVENTS` :15 · `eventLabel` :252) (3) `WEBHOOK_EVENTS` `src/lib/webhooks/labels.ts:5` (`webhookEventLabel` :120 · `WEBHOOK_GUARDED_FAMILIES` :128)
- ปลุกระบาย: cron `/api/cron/hourly` เรียก `drainAll` ท้ายรอบ · `/api/cron/outbox` · `/api/cron/tick`
- **lease ของงาน cron (ตัวอย่าง)**: `crm/sequences.ts#runDue(now, opts)` :1790 — จองแถวด้วย `updateMany` เงื่อนไข "ACTIVE + ถึงเวลา + lease ว่าง/หมด" → `leaseUntil = now + 15 นาที` (หัวไฟล์ :11) แล้วปล่อยด้วย `where {id, leaseUntil: c.lease, stepIndex}` (:1445) · คอลัมน์ `leaseUntil` + `@@index([status, leaseUntil])` crm.prisma:869/920/1150–1156
- AI วันนี้ **ไม่ยิง outbox event ใดเลย** (proposal/plan/scheduled ไม่มี event) — ถ้า T4.5/T5 ต้องการ event (`ai.task.done` ฯลฯ) ต้องลงครบ 3 ทะเบียน

---

## 7. Fitness / QC conventions

- `scripts/fitness.mts` (1372 · รัน `pnpm exec tsx scripts/fitness.mts` · <10s · ไม่แตะ DB):
  - **F1.1–F1.4** (CRITICAL) ทุก model ลง `scope.ts` · fail-closed
  - **F8.1** (CRITICAL) ทุก model ต้องปรากฏใน `prisma/migrations/**/*.sql`
  - **F2.1** `ALLOWED_EDGES` :239 — import ข้ามโมดูล **เฉพาะไฟล์ใต้ `src/lib/modules/`** (allowlist รายเส้น) · `src/lib/ai/*` ไม่ใช่โมดูล ⇒ ไม่โดน F2.1 แต่ **F2.2** (แตะ account ผ่าน `account/index` เท่านั้น) · **F2.3** (ทั้ง `src/` แตะ crm ผ่าน `crm/index` หรือ `crm/ui` เท่านั้น — proposals.ts ก็อยู่ใต้กฎนี้ :499) · **F2.4** (ฝั่ง CRM แตะ member ผ่าน facade)
  - **F5.1** raw `prisma` ในโมดูล ≤ baseline 45 (ratchet)
  - **F6.1/F6.2** ไฟล์ server action ต้องมีด่านสิทธิ์ — สแกนแค่ `src/lib/modules/**/actions.ts` + `src/lib/actions/*.ts` ⇒ 🔸 `src/lib/ai/actions.ts` และไฟล์ action ใหม่ใต้ `src/lib/ai/` **ไม่ถูกด่านนี้ตรวจ**
  - **F10.1** ทุก tool อยู่ในสกิล/แกนพอดี 1 ที่ (import `@/lib/ai/skills` + `@/lib/ai/tools` ในโหมดไร้ env — ห้าม import `@/lib/env` จากไฟล์ทะเบียน · actor.ts/tool-access.ts คอมเมนต์ย้ำ)
  - **F13.x**: F13.1/.4/.7/.10 ทุก op (บัญชี/บอร์ด/สมาชิก/CRM+พอร์ทัล) มี test id ใน `scripts/qc-<module>-*.mts` · F13.2/.5/.8/.11 docs/api/*.md ตรง generator · **F13.3/.6/.9/.12 tool ของ op ลงทะเบียนในสกิล** (อ่าน `src/lib/ai/skills.ts` เป็นตัวหนังสือ)
  - F7 docs xref · F11 ข้อสอบไม่เน่าตามวันที่ · F12 cookie secure · F14 ทะเบียนปุ่ม CRM · F15/F16 สแกน regex/คำค้น
- `scripts/qc-all.mts` (341): **ค้นทุกไฟล์ `scripts/qc-*.mts` อัตโนมัติ** (:64–67 · ยกเว้น `qc-all.mts` `qc-member-m1.1.mts`) — ไม่มีรายการให้เติม · ตัวกรอง `pnpm qc:all ai mobile` · `--shard=i/n` · เครื่องหมายหัวไฟล์ `// requires: acc-v2-seed | kanban-seed | member-seed | crm-seed` → seed ครั้งเดียวต่อ run · ด่านกัน prod (`isProdDbUrl` / `ALLOW_PROD_QC`)
  - ชุด AI/มือถือที่มี: `qc-ai.mts` `qc-ai-actions` `qc-ai-analyst` `qc-ai-automation` `qc-ai-brain` `qc-ai-credit` `qc-ai-eval` `qc-ai-feedback` `qc-ai-growth` `qc-ai-interview` `qc-ai-kanban-board` `qc-ai-memory` `qc-ai-phase-a` `qc-ai-phase-b1` `qc-ai-phase-b2` `qc-ai-plan` `qc-ai-proactive` `qc-ai-proposals` `qc-ai-quality` `qc-ai-schedule` `qc-ai-skills` `qc-ai-tools` `qc-ai-tools2` `qc-ai-tuning` `qc-ai-usage` `qc-ai-vision` `qc-ai-wave5b` · `qc-mobile-app` `qc-mobile-auth` `qc-mobile-authz-hotfix` `qc-mobile-chat` `qc-mobile-help` · `qc-push` `qc-approval` `qc-approval-edit` `qc-approval-wiring` `qc-audit-trail` `qc-dna` `qc-dna-review` · CRM ที่แตะ AI: `qc-crm-c1.10` `qc-crm-c1.11` `qc-crm-c3.7` (fixture แอป) + ชุด G1/G2/G3 ของ C5.5
  - ชุดเก่า (qc-ai-*, qc-mobile-*) ใช้ `loadLegacyQcEnv("<suite>")` จาก `qc-env-guard.mjs` + `SHARK_AI_MOCK=1` + `qcOwner(t)` actor (ORACLE-EDIT C5.5-G1) · หัวไฟล์ = "สัญญา" ที่ Builder ต้องทำตาม (ดู qc-ai-proposals.mts:1–17, qc-mobile-chat.mts:1–15)
- **สไตล์ oracle ประจำบ้าน** (`scripts/qc-crm-c1.1.mts` :1–60): หัว = ใบงาน + "Fable oracle · Builder ห้ามแตะ" + สัญญาอยู่ที่ไหน + `// requires: crm-seed` · กติกา 4 ข้อ: (1) **SKIP guard** ของที่ใบต้องสร้างยังไม่มี → พิมพ์ SKIPPED + `JSON_SUMMARY {skipped:true}` exit 0 (2) `chk(id, ชื่อ, ok, expected, actual, sev)` id = `<WO>-S<กลุ่ม>.<ข้อ>` (3) ลบทุกแถวที่สร้างใน `finally` · ห้ามแก้ seed (4) จบด้วย `JSON_SUMMARY {total, passed, findings[]}` exit 0 เมื่อผ่านหมด · โหลด env ผ่าน `await import("./acc-v2-env.mts" as string)` → `loadQcEnv()` · import `@/lib/...` แบบ dynamic หลังโหลด env · `import("…" as string)` สำหรับโมดูลที่ยังไม่มี (typecheck ของ next build ตรวจ .mts ด้วย)
- สคริปต์ห่อ:
  - `scripts/iso.sh` — `bash scripts/iso.sh <cmd…>` → `systemd-run --unit=iso-$$-… --collect --wait --pipe -p MemoryMax=${ISO_MEM:-5G}` · ส่ง `QC_ENV_FILE` (ปริยาย `.env.qc`) `NODE_OPTIONS` `PATH` `HOME`
  - `scripts/qc4.sh` — `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-<x>.mts` · อ่าน `.env.qc4` ด้วย grep|cut (ไม่ source) · บังคับ host `ep-frosty-lab` (ปฏิเสธ prod/QC1) · ตั้ง `DATABASE_URL DIRECT_URL QC_ENV_FILE=.env.qc4 GATE_LOCK_FILE=/tmp/shark-gate-qc4.lock QC_BRANCH=qc4`
  - `scripts/with-gate-lock.sh` — `NODE_OPTIONS` ปริยาย `--max-old-space-size=3584` · งานหนัก (`typecheck`/`next build`/`build`/`acc-v2-serve`/`tsc`) ถือ 3 ล็อก `/tmp/shark-gate.lock` + `-qc2` + `-qc3` (รอ 3600 วิ) · อื่น ๆ ถือ `${GATE_LOCK_FILE:-/tmp/shark-gate.lock}` (1800 วิ) · export `SHARK_GATE_LOCK_MARKER=1`
  - `scripts/acc-v2-serve.sh [build|start|stop|status]` — **พอร์ตจาก env `ACC_V2_PORT`** (ปริยาย 3215) · ⚠️ ไฟล์ env ฮาร์ดโค้ด `ENVFILE="$ROOT/.env.qc"` (:29) ไม่อ่าน `QC_ENV_FILE` ⇒ tree ของ AI team ต้องมี `.env.qc` (สำเนาของ QC4) ตามที่ kickoff สั่ง · log/pid `.qc-shots/acc-v2/`
  - `scripts/qc2.sh` `scripts/qc3.sh` = ของ CRM (ห้ามใช้)

---

## 8. ความขัดแย้ง แบบ ↔ โค้ด (เสนอคำตัดสิน)

| # | แบบบอกว่า | โค้ดจริง | คำตัดสินที่เสนอ | ความเสี่ยงถ้าไม่ทำตาม |
|---|---|---|---|---|
| C1 | "`Plan` มีค่าเดียวคือ FREE" → ทำแพ็ก 4 ระดับ | `enum Plan {FREE}` core.prisma:35 บน `Tenant.plan` :44 · core.prisma **FROZEN** (:2) · `planLimits(tenant.plan)` usage.ts:72 อ่านอยู่ (โค้ดตาย) | **ไม่แตะ `Plan`/core.prisma** · แพ็กอยู่ใน `AiSubscription` (ai_team.prisma) · `pack` เป็น enum ใหม่ของ ai_team (`AiPack FREE STARTER PRO BUSINESS`) | แก้ core = ชนกฎ FROZEN + migration ตารางหลัก |
| C2 | แพ็กฟรี "ผูกต่อเจ้าของ" ใช้ร่วมทุกกิจการ | ทุก `Ai*` เป็น axis `tenant` (scope.ts:135–149) · `Tenant` ไม่มี owner · OWNER ได้หลายคน/ร้าน (Membership role) · โอนเจ้าของได้ (`platform/account-deletion.ts:90`) | `AiSubscription` แบบ **global axis** (`g("…")` เหมือน PushDevice scope.ts:42) คีย์ `ownerUserId` (unique ต่อ FREE) + ตารางผูก `tenantId → subscriptionId` (axis tenant) ที่ resolve ครั้งแรกด้วยกติกาตายตัว: OWNER ที่ `acceptedAt` เก่าสุด · เปลี่ยนเจ้าของ = ย้ายผูกแบบมี audit | OWNER 2 คน = โควตาซ้อน/ตัดผิดคน · tenantDb ใช้กับแถวข้ามร้านไม่ได้ |
| C3 | เลิกแจก $10 (`grantedAt` lazy) | `ensureWallet` credit.ts:34 ถูกเรียกจาก `canSpend` (ทุกแชท) · `canSpend` = balance > 0 (:74) · service.ts:127 ตัดแชทเมื่อ false · degrade เมื่อ < $0.50 (service.ts:146) · `canSpendPeek` อ่าน `welcomeGrantMicro()` (:87) | **T3.6 ห้ามลงก่อน T3.1**: ด่านใหม่ `canRunAi(tenantId, employeeId?)` = (โควตาแพ็กเหลือ) OR (overflow=wallet && balance>0) แทน `canSpend` ทุกจุด · degrade อิง % แพ็ก ไม่ใช่ balance · ปิดเครดิตต้อนรับในโค้ด (ไม่พึ่ง env `SHARK_AI_WELCOME_USD=0` อย่างเดียว) · ร้านเดิมคงยอด (ค่าเริ่มต้น §6.2) | ปิด grant ก่อน = ร้านใหม่ใช้ AI ไม่ได้เลย + ทุกคำตอบเป็น haiku |
| C4 | หน้าต่าง 5 ชม./สัปดาห์ "เสนอเลิกใช้" | `recordQuotaUsage`/`getQuotaStatus` **ไม่มีผู้เรียก** · ตาราง `AiUsageWindow` ไม่ถูกเขียนแล้ว · `AiUsage` รายวันยังทำงาน | ไม่ต้องทำงานเลิก — ประกาศว่าตาย · ห้ามสร้างแพ็กทับ `AiUsageWindow` · คง `AiUsage` เป็นตาข่ายชั้นนอก (env `SHARK_AI_DAILY_*`) และเพิ่มในสัญญาว่าตาข่ายนี้ยังตัดได้แม้โควตาแพ็กเหลือ | ทำงานซ้ำ / สองแหล่งความจริง |
| C5 | "หักโควตาแพ็กก่อนกระเป๋า" | การหักมี 17 จุดผ่าน `chargeUsageSafe` + `canSpend` 16 ไฟล์ · ต้นทาง 14 ชนิด (`AiCreditSource`) รวมงานลูกค้า (CHAT_TRANSLATE/SUGGEST · CRM_ASSIST · MEMBER_ASSIST · ACCOUNT_INBOX) | ตัดใน **`credit.ts` ชั้นเดียว** (`chargeUsage` → แยก "แพ็ก/กระเป๋า" ในทรานแซกชันเดียว · ตัวนับเดี่ยว `UPDATE … SET usedMicro = usedMicro + $1 RETURNING`) ให้ทั้ง 17 จุดได้เอง · ตัดสินว่าทุกต้นทางที่ร้านจ่ายนับเข้าแพ็ก (ยกเว้น `SUPPORT_DRAFT` = แพลตฟอร์ม) — **ต้องเคาะ** (เพิ่มใน OWNER-QUESTIONS) | แก้แค่ service.ts = งานแชทลูกค้า/CRM กินกระเป๋าตรง ข้ามแพ็ก |
| C6 | `AiCreditTxn.employeeId` | มี `userId?`/`conversationId?` แต่ service.ts:342 ไม่ส่ง `userId` | เพิ่ม `aiEmployeeId String?` ได้ (nullable) + ส่ง `userId` ของผู้สั่งด้วย · `ChargeInput` เพิ่ม `aiEmployeeId?` | รายงานรายคน (M8) ทำไม่ได้ |
| C7 | เพิ่ม `AiConversation.employeeId/roomId/status/startedById` | ผู้สร้างฝังใน id (conversation-owner.ts:156–160) — คอมเมนต์ระบุชัด "ไม่มี migration — การเพิ่มคอลัมน์ในตารางแชทเคยทำแชท prod ล่ม" · `employeeId` ในฐานนี้หมายถึง `HrEmployee` (booking.prisma:46) | **ไม่เพิ่มคอลัมน์ในตาราง hot** — สร้าง `AiTask` (1:1 กับ conversation: `conversationId @unique, aiEmployeeId, roomId?, status, startedById`) ใน ai_team.prisma · ห้อง employeeId=null (ร้านเดิม) อ่านเป็น "ผู้ช่วยทั่วไป" ผ่าน left join · ชื่อ FK ใช้ `aiEmployeeId` ทุกตาราง | ALTER ตารางแชทระหว่าง deploy = แชท prod ล่ม (เคย 2.5 ชม.) · ชื่อชน HR |
| C8 | "งาน: คนที่สั่งได้" (M2) · ผู้อนุมัติยืนยันร่าง (M4/D8) · ห้องแผนก (M9) · กล่องรวม (T1.9) | ห้อง = ผู้สร้างคนเดียว · `executeProposal` ยืนยันได้เฉพาะคนที่เห็นห้อง (`sightOfConfirmer` :393) · OWNER ก็เปิดห้อง `u~` ของคนอื่นไม่ได้ | ขยาย `conversation-owner.ts` ด้วยแท็กใหม่ `e~<aiEmployeeId>~<hex>` สำหรับห้องงาน AI + กติกาเห็น = สมาชิกของงาน/ห้อง (`AiTaskMember`/`AiRoomMember`) หรือผู้อนุมัติตาม access · `sightOfConfirmer` รับ userId + ตรวจสมาชิกภาพจาก DB (ไฟล์นี้ต้องเบา ⇒ ตัวอ่าน DB อยู่ `conversations.ts`) · ต้องรัน regression ของ C5.5-G1/G2/G3 ทุกชุด · ใบ T1.7 + hunter | เปิดช่องรั่ว G2 กลับ (พนักงานอ่านคำตอบที่ได้ด้วยสิทธิ์เจ้าของ) หรือผู้อนุมัติกดไม่ได้เลย |
| C9 | "ผู้อนุมัติ + กฎวงเงิน" ผ่าน `ApprovalPolicy` | ไม่มี entityType ของ AI (approval/labels.ts:3) · ApproverRole MANAGER/OWNER · ผลอนุมัติวิ่งผ่าน outbox → approval-effects.ts | ใช้ **ทาง proposal เดิม** (คนกด = ผู้อนุมัติ · assertCan ของคนกด) · ใช้ `resolvePolicy(ctx, {entityType:"ai.<kind>", amountSatang})` แบบอ่านอย่างเดียวเพื่อบอก "ต้องให้ใครอนุมัติ/เกินวงเงิน" · ไม่สร้าง ApprovalRequest ซ้อน | สองระบบอนุมัติขัดกัน · effect ซ้ำ |
| C10 | AUTO = "การมอบอำนาจของคน" ตรวจสิทธิ์ผู้มอบ ณ ตอนทำ | `executeProposal(m, ctx, id, {userId})` ต้องมี MembershipCtx ของคน + userId (ประตู CRM ต้องมี userId :385 · `PLAN_HUMAN_ONLY` hr_decide_leave/approval_decide) | AUTO executor (ไฟล์ใหม่ `src/lib/ai/team/auto.ts`) โหลด Membership **สด** ของ `grantedById` (acceptedAt≠null) → `executeProposal(mGrantor, ctx, id, {userId: grantor, confirm2x: false})` — ห้ามส่ง `confirm2x` เด็ดขาด (DESTRUCTIVE ติด `needsSecondConfirm` :430 อัตโนมัติ) · ชนิด `PLAN_HUMAN_ONLY` + CRM-door kinds = ไม่มีวัน AUTO · ผู้มอบต้องเห็นห้อง (C8) | AUTO รันด้วยสิทธิ์ที่ถูกถอดแล้ว / void บิลเงียบ |
| C11 | ชนิดงาน DESTRUCTIVE · "งานเงิน/ถึงลูกค้า" ค่าเริ่มต้น DRAFT · ย้อนได้ | มีแค่ `risk: NORMAL|DESTRUCTIVE` (ai.prisma:51 · `DESTRUCTIVE_KINDS` :125 · `op.kind==="danger"`) · ไม่มีชั้น money/customer/reversible | ไฟล์ใหม่บริสุทธิ์ `src/lib/ai/team/kind-class.ts`: `classOfKind(kind) → {destructive, money, customerFacing, reversible}` derive จาก `DESTRUCTIVE_KINDS` + ตาราง money/customer เขียนมือ (36 static) + โมดูลของ op (account.* = money · crm send/email/member campaign = customer) · ไม่รู้จัก = money+customer (fail-closed) · ไม่เพิ่มคอลัมน์ | เพิ่ม kind ใหม่แล้วลืมจัดชั้น = AUTO ได้โดยไม่ตั้งใจ |
| C12 | `AiScheduledTask` "อ่าน/สรุปเท่านั้น" | ไม่มีด่านห้ามเขียน — ใช้ actor สิทธิ์ต่ำสุด `SHOP_AUDIENCE` (actor.ts:57) · 🔴 `remember_fact/forget_fact/support_open_case` ยังเขียนได้ (tool-access.ts:71–75) · ไม่มี `createdById` · ไม่มี lease (scheduled.ts:78–118) · ไม่มีจอจัดการ (list/setActive/delete ไม่มีผู้เรียก) | T1.8: เพิ่ม `createdById`, `aiEmployeeId` (ใน ai_team เป็นตาราง `AiScheduleV2` หรือคอลัมน์ nullable ใน AiScheduledTask — ตารางนี้ไม่ hot) · รันเป็น employee ด้วยสิทธิ์ของผู้ตั้ง ∩ ระดับ access (READ = ตัด writesNow ทั้งหมด) · claim ก่อนรัน (`updateMany where lastRunDay≠today` → set) · ผลที่ถึงลูกค้า = proposal DRAFT · แก้รั่ว writesNow ของ system actor ด้วย (ใบเดียวกัน) | รันซ้ำ+หักเงินซ้ำ · งานประจำเขียนความจำ/เปิดเคสเอง |
| C13 | มีพนักงาน AI หลายคน มีตัวตน/ภาษา | ไม่มี employee/persona ในฐาน · `buildSystemPrompt` ตัวเดียว ภาษาไทย "ตอบภาษาไทยเสมอ" (persona.ts:59) · `AI_SYSTEM_JOBS` มีแค่ `scheduled-task` | `AiEmployee` ใหม่ · prompt builder ใหม่ (อังกฤษ) `buildEmployeePrompt({persona, manual, language})` ในไฟล์ใหม่ · persona.ts เดิมคงไว้ให้ "ผู้ช่วยทั่วไป" · ถ้า AUTO/งานประจำต้องเป็น actor ใหม่ ให้เพิ่ม `kind:"employee"` ใน `AiActor` อย่างระวัง (actor.ts ต้องเบา) หรือใช้ member actor ของผู้มอบ + แนบ `aiEmployeeId` ใน ctx | prompt ไทยกิน token 4× (ขัด §T1.5) |
| C14 | ความรู้รายคน (`AiKnowledgeGrant`) | `kb_search` เปิดให้ทุกคน (HAND_TOOL_ACCESS `OPEN` :82) อ่าน `KbArticle` active ทั้งร้าน · KbArticle มีแค่ `category` | กรองใน `kbSearch` (tools.ts:395) เมื่อ ctx มี aiEmployeeId · grant ระดับ `category` ก่อน (ไม่ต้องรายบทความ) | AI รายคนเห็นทุกอย่าง |
| C15 | สิทธิ์ 4 ระดับต่อ "สกิล/ระบบ" | ด่านมี 2 ชั้นอยู่แล้ว (`toolsOfferedTo` ยื่น · `toolVerdict` ใน `runTool`) · แยก read/write ได้จาก `AiTool.action` + `HAND_ACTION_KIND` + `op.kind` · core tools ไม่อยู่ในสกิลใด | T1.6 เพิ่มชั้นที่ 3 ใน **จุดเดียวกันสองจุด** (service.ts:176 + tools.ts:2511): OFF = สกิลไม่อยู่ใน visibleSkills · READ = ตัด tool เสนอ + writesNow · DRAFT = ปัจจุบัน · AUTO = T4.2 · core tools: `remember_fact/forget_fact/kb_auto_save/support_open_case` = ระดับของ "memory/knowledge" · `executeProposal` ตรวจซ้ำว่า access ยังไม่ OFF ตอนกด | ยื่นแต่ไม่บังคับ = ชั้นเดียว (C5.5-G1 สอนแล้วว่าต้องสองชั้น) |
| C16 | "จอ native ทั้งชุด" · หัวจอ = ชื่อกิจการ + ตัวสลับ · ไม่มีแถบล่าง · เมนูจากรูปโปรไฟล์ | หน้าแรก `(app)/index.tsx` = **WebView** · native: login/dna/sessions/chat/crm/member · Drawer ปิดการสไลด์ (`_layout.tsx:171`) เมนูจริงอยู่ในเว็บ · CRM มี `CrmTabBar` แถบล่าง | T2.1: `(app)/index` ใหม่ = จอทีม (native) · ย้าย WebView ไป route `(app)/web` (เปิดจากเมนู) · ตัวสลับกิจการ = bottom sheet แทน drawer · คงโซน crm/member เดิม (มีข้อสอบ C3.7/M3.11 + ภาพ) · `CrmTabBar` คงไว้ในโซน CRM (ยกเว้นเจ้าของสั่ง) | รื้อ drawer ทำ crm/member ที่ผ่านตรวจรับแล้วพัง |
| C17 | Liquid Glass + โหมดมืด | `C` light อย่างเดียว · `userInterfaceStyle:"light"` · `StatusBar style="dark"` · ไม่มี blur ใน deps | T0.3: โทเคน 2 ชุด (light/dark) เป็น JS ล้วน + "กระจก" = rgba + border + shadow (เรนเดอร์บน web export ได้ = ภาพ parity ตรง) · blur native เป็นตัวเลือกที่ fallback · เปลี่ยน `userInterfaceStyle` = `automatic` ใน T5.4 (ต้องบิลด์) | native blur ไม่ขึ้นใน QC web export → parity ไม่ตรง · ต้อง EAS build |
| C18 | ภาษาในตัวตนพนักงาน | แอปไม่มี i18n · prompt ไทย | ภาษา = พารามิเตอร์ของ prompt เท่านั้น (ตอบลูกค้า/ผู้ใช้ภาษาไหน) · UI แอปคงไทย | — |
| C19 | % โควตาในแอป | `/api/mobile/usage` รูปตายตัว (build #19/#24) · QuotaBar type ไม่ตรง (`scope`) · GET เขียนกระเป๋า | endpoint ใหม่ `/api/mobile/team/quota` สำหรับ v2 · route เดิมคงรูป แต่เปลี่ยนเนื้อเป็น % แพ็ก (scope `"credit"` → ค่าใหม่ต้องให้ build เก่า "ไม่โชว์") และใช้ทางอ่านที่ไม่เขียน | แอปเก่าแถบพัง/ขึ้น error |
| C20 | การ์ดขั้นตอน (A5) / แผน | route `plans/*` มีแต่แอปไม่เคยเรียก · ไม่มี plan card | T2.6 ทำ `PlanCard` ใหม่ + ใช้ route เดิม | ข้อเสนอแบบแผนในแอปค้าง PENDING มองไม่เห็น |
| C21 | กล่องรออนุมัติรวมทุกกิจการ (T1.9) | `requireMobile` ผูก `X-Tenant-Id` เดียว · ไม่มี helper หลายร้าน | helper ใหม่ `requireMobileUser(req)` (= `mobileUser` + memberships acceptedAt) · ทุกแถวรันด้วย Membership ของร้านนั้น · confirm ยังส่ง `X-Tenant-Id` ของแถว | ยืนยันข้ามร้านด้วยสิทธิ์ผิดร้าน |
| C22 | AuditLog "ผู้กระทำ = พนักงาน AI · ผู้มอบ = คน" + มุมมอง C6 + ยกเลิก | `ActorType` ไม่มี AI (core.prisma:208) · FROZEN · `onBehalfOf` = PlatformUser impersonation · executeProposal ไม่เขียน audit | ไม่แก้ enum: `writeAudit({actorType:"USER", actorId: grantorUserId, action:"ai.auto.<kind>", targetType:"AiProposal", targetId, after:{aiEmployeeId, ...}})` เพื่อ compliance + ตารางใหม่ `AiActionLog` (proposalId, aiEmployeeId, grantorId, mode AUTO/DRAFT, undoUntil, undoneAt, undoneById) สำหรับจอ C6/undo | ใช้ `onBehalfOf` ผิดความหมาย · เพิ่ม enum ใน core = ขัด FROZEN |
| C23 | "ยกเลิกได้ภายในเวลา" | ไม่มีกลไก undo กลาง · ตัวย้อนมีเฉพาะบาง kind (void_sale/cancel_*/archive/ op danger ของบัญชี) | T4.3: whitelist `REVERSIBLE` ต่อ kind พร้อม inverse ที่ระบุตัว (ไม่เดา) · ที่เหลือ = ไม่มีปุ่มยกเลิก | สัญญา undo ที่ทำไม่ได้จริง |
| C24 | ตั้งค่าแจ้งเตือนรายกิจการ (C7) | `AppNotification` ไม่มี type/link · prefs มีของ kanban (`User.prefs` ผ่าน preferences.ts) และของ CRM เท่านั้น | เพิ่ม `link String?`/`kind String?` แบบ nullable ใน AppNotification **ไม่แนะนำ** (ตารางกลาง ~28 ผู้เขียน) → ใช้ push `data.link` + ตาราง prefs ใหม่ `AiNotifyPref(userId, tenantId, …)` | migration ตารางกลาง |
| C25 | (ไม่ได้พูดถึง) | **มี `AiSettings` ต่อร้านแล้ว** (ai_credit.prisma:79) | ค่าระดับร้านของทีม AI (ผู้อนุมัติปริยาย · undo window · ทีมพัก) = คอลัมน์ใหม่ nullable/default ใน `AiSettings` · `getAiSettings` คืน view ใหม่ | ตารางตั้งค่าซ้ำ |
| C26 | `AiProposal.employeeId/decidedById/autoExecuted` | ไม่มี · reject ไม่รู้คน · CRM ใช้ resultNote เป็นธง | เพิ่ม 4 คอลัมน์ nullable (`aiEmployeeId` `decidedById` `decidedAt` `autoExecuted Boolean @default(false)`) ใน T1.1 · ตาราง AiProposal ไม่ใช่ตารางแชท แต่ยัง hot (CRM เขียน) ⇒ deploy migration ก่อนโค้ดเสมอ · หรือเก็บใน `AiActionLog`/`AiTeachNote` ถ้าเจ้าของไม่อยากแตะ | reject ไม่มีเหตุผล = teach-back (T4.1) ทำไม่ได้ |
| C27 | ห้องแผนกต่อยอด `AiPlan` | AiPlan = ห้องเดียว · ซิงก์ · คนกดคนเดียว · ≤8 · ห้ามขั้นที่ต้องคนตัดสิน | `AiHandoffFlow` + งานต่อเนื่องแบบ async (task → task) แยกจาก AiPlan · AiPlan คงเป็น "แผนในงานเดียว" | ยืด AiPlan จนแตก (race RV13-4 ที่แก้ไว้) |
| C28 | "`AiProposal` 39 ชนิด" · "20 สกิล" · "AiPlan ≤8" · "AiScheduledTask รายวันต่อชั่วโมง" | 36 ชนิดเขียนมือ (:69–111) + derive `account.*/kanban.*/member.*/crm.*` (หนึ่งต่อ op write/danger ที่มี tool) · 20 สกิล ✓ · 8 ✓ · ✓ (≤10 ต่อร้าน) | ใช้ตัวเลขโค้ด · ข้อสอบ "ทุกชนิดงาน" (§4.2 ข้อ 5) ต้องวนจาก `KIND_ACCESS` จริง ไม่ใช่รายการพิมพ์มือ | ข้อสอบไม่ครอบ kind ที่ derive |
| C29 | "ทีม" (A1) / "ห้องแผนก" | มี `Team/TeamMember` (team.prisma) = ทีมขายคน (CRM) | ห้ามใช้ชื่อ `Team*` · ใช้ `AiRoom*` · copy ในแอป "ทีม" = พนักงาน AI ไม่ชน DB | ชื่อชน/ join ผิด |
| C30 | แม่แบบตำแหน่ง = ชุดสกิล | สกิล `shop/restaurant/hotel/rental/ticket/school/clinic` + `booking` (QUEUE) อ้าง `systems` ที่ไม่ใช่ `SystemType` (เป็น UnitType) → ไม่โผล่ (§2.4d) | แม่แบบ 5 ตัวของ T1.3 ใช้เฉพาะสกิลที่โผล่จริง (sales/account/members/crm/tasks/chat/knowledge/memory/approvals/automation) · หนี้สกิลที่ไม่โผล่ จดเป็น finding | แม่แบบได้สกิลว่าง |
| C31 | สิทธิ์จ้าง/มอบ AUTO | permissions.ts โมดูล `ai` มี 2 คีย์ | เพิ่มคีย์ใน `MODULE_DEFS` ai (:659–667): `ai.employee.manage` · `ai.access.grant` · `ai.task.assign` · `ai.schedule.manage` · AUTO grant = OWNER-only แบบ `CRM_OWNER_ONLY_KEYS` + ห้ามมอบเกินสิทธิ์ตัวเอง (`canGrantPermission`) | MANAGER มอบ AUTO ให้ AI เกินสิทธิ์ตัวเอง |
| C32 | server actions ของทีม AI | F6 ไม่สแกน `src/lib/ai/*actions.ts` | วาง action ใหม่ที่ `src/lib/actions/ai-team.ts` (ถูก F6 ตรวจ) หรือเพิ่มเส้นสแกนใน fitness (ไฟล์ร้อน) | action ไร้ด่านหลุด CI |
| C33 | `/api/mobile/proposals/confirm` สำหรับผู้อนุมัติ | route ไม่เช็ก AI_CHAT (พึ่ง KIND_ACCESS) | คงไว้ (ผู้อนุมัติอาจไม่มี ai.chat.send) — เขียนในสัญญาให้ชัด | — |
| C34 | วัดต้นทุนงาน (T0.1) | ~193 tool · สารบัญสกิลอังกฤษ · persona ไทยยาว · 5 รอบ/เทิร์น · `pickModel` ส่ง sonnet เมื่อข้อความ >120 ตัวหรือมีคำสั่ง | T0.1 วัดผ่าน `sendMessage` จริง (source `CHAT` · ไม่ต้องเพิ่ม enum) แล้วอ่านต้นทุนจริงจากแถว `AiCreditTxn` USAGE ของ conversationId ที่วัด (รวม AUTO_TITLE ถ้าวัดผ่านแอป) · วัดทั้งเส้น haiku และ sonnet ตาม `pickModel` | ตัวเลขแพ็กผิด |
| C35 | `AiCreditSource` สำหรับงานของพนักงาน | enum 14 ค่า · เพิ่มต้อง ALTER TYPE ADD VALUE ในไฟล์ของตัวเอง (ai_credit.prisma:49) | ถ้าต้องแยก (เช่น `AI_TEAM_TASK`) ทำใน migration T1.1 เป็น statement แยก · ห้ามใช้เป็น default ในไฟล์เดียวกัน | migration ล้มบน Postgres |

---

## 9. ไฟล์ร้อนที่ซ้อนกับ POS / HR / CRM

คำสั่งที่รัน (ไม่ fetch · ref ในเครื่อง): `git log --oneline --since=2026-09-25 origin/main origin/session/pos origin/session/hr -- src/lib/ai src/lib/core/permissions.ts src/lib/outbox-consumers.ts apps/mobile prisma/schema src/app/api/mobile` → **53 commit** (ส่วนใหญ่ CRM C2–C6 ที่ขึ้น main แล้ว + POS P1.x + HR H0.3)

สถานะสาขา (เทียบ `main`):
- `origin/session/pos` 15b269db (8 ต.ค. 03:17) ahead 573 / behind 304
- `origin/session/hr` e61eba48 (8 ต.ค. 03:47) ahead 95 / behind 283
- `origin/session/crm` feb7877e ahead 41 / behind 1 — **ไม่แตะไฟล์ในรายการเฝ้าเลย** (diff ว่าง)

`git diff <merge-base> <branch>` เฉพาะเส้นทางเฝ้า (+ scope.ts · rbac.ts · audit.ts · push.ts · mobile lib · labels):
| ไฟล์ | POS (`session/pos`, `wip/pos-p1.8`, `wip/pos-p1.10`) | HR (`session/hr`, `wip/pos-hr-h0.3`, `-h0.4`) |
|---|---|---|
| `src/lib/ai/tools.ts` | ±10: เพิ่ม `docType: "SALE"` ใน `salesSummary` `salesByDay` `growthRecommendations` `restaurantToday` `financialSummary` (P1.8 refund) | +1: `pendingLeaves` คืน `รหัสใบลา: l.id` (H0.3 D14) |
| `src/lib/ai/analyst.ts` | ±7 ยอดสุทธิหลังคืนเงิน | — |
| `src/lib/ai/dna-review.ts` | ±2 `docType:"SALE"` | — |
| `src/lib/core/permissions.ts` | +9 ในบล็อก `pos` (pos.product.manage · sale.refund · priceOverride · shift.operate/manage · report.view · stock.count · device.manage · sale.read) | — |
| `src/lib/core/scope.ts` | +21–23 (model POS ใหม่) | — |
| `src/lib/outbox-consumers.ts` | +5–7 (`pos.sale.refunded` + shift/stockCount consumers) | — |
| `src/lib/automation/labels.ts` | +5–7 | — |
| `prisma/schema/pos.prisma` `ecommerce.prisma` `restaurant.prisma` | +396–426 / +5 / +5 | — |
| `apps/mobile/**` · `src/app/api/mobile/**` · `src/lib/mobile/**` · `proposals.ts` `service.ts` `skills.ts` `tool-access.ts` `credit.ts` `usage.ts` `conversation-owner.ts` `prisma/schema/ai*.prisma` `core.prisma` | **ไม่แตะ** | **ไม่แตะ** |

ข้อสรุป: ไฟล์ที่ AI team จะแก้และ **ยังมีคนอื่นแก้อยู่** = `tools.ts` (POS 5 hunk + HR 1 hunk ใน tool อ่านยอดขาย/ใบลา — คนละที่กับจุดที่ T1.6/T4.6 จะแตะ: `runTool` :2511 · `kbSearch` :395) · `permissions.ts` (POS บล็อก `pos` — AI แตะบล็อก `ai` :659–667 ห่างกัน) · `scope.ts` (POS เติม model POS — AI เติม Ai* ใกล้ :135–150) · `outbox-consumers.ts` (ถ้า AI เพิ่ม event) · `automation/labels.ts` — ทั้งหมด merge แบบบรรทัดไม่ชน แต่ **ต้อง `patch --fuzz=3` / เช็กจำนวนบรรทัดหลัง merge** (บทเรียน git apply -3 ตัดบรรทัด) · ไฟล์ที่ AI ถือครองได้เต็มตัวตอนนี้ = `proposals.ts` `service.ts` `skills.ts` `tool-access.ts` `credit.ts` `usage.ts` `scheduled.ts` `conversation-owner.ts` `apps/mobile/**` `src/app/api/mobile/**` `src/lib/mobile/**`

---

## 10. เสนอการถือครองไฟล์ต่อเฟส (กันเลนชน)

หลัก: 1 ไฟล์ร้อน = 1 ใบที่ถือในเวลาเดียวกัน · โค้ดใหม่วางใต้ **โฟลเดอร์ใหม่ `src/lib/ai/team/`** (ไม่ใช่ `src/lib/modules/` ⇒ ไม่ต้องขอเส้น F2 · แต่ห้าม import ลึกของ account/crm/member — ใช้ facade) · route ใหม่ใต้ `src/app/api/mobile/team/**`

| เฟส | ถือครอง (เขียนได้) | แตะเป็น hunk เล็ก (ต้องระบุใน brief) | ห้ามแตะ |
|---|---|---|---|
| **T0** | `ledger/**` · `scripts/qc-ai-team-t0*.mts` · (T0.3) `apps/mobile/src/theme/**` (แยก `theme.ts` → `theme/{tokens,light,dark,index}.ts` คง export `C R S`) · `apps/mobile/qc/shoot-ai-team.mjs` · `scripts/parity-ai-team.sh` | — | src/lib/ai/** |
| **T1 (lane A เซิร์ฟเวอร์)** | `prisma/schema/ai_team.prisma` + migration ใหม่ (T1.1 เท่านั้น) · `src/lib/ai/team/{employees,templates,persona-prompt,manual,access,tasks,schedule,inbox,kind-class}.ts` · `src/lib/mobile/team-auth.ts` (`requireMobileUser`) · `src/app/api/mobile/team/**` · `src/lib/actions/ai-team.ts` · `scripts/qc-ai-team-t1.*.mts` | `src/lib/core/scope.ts` (T1.1) · `permissions.ts` บล็อก ai (T1.2) · `service.ts` (T1.4/1.5 ฉีด prompt · T1.6 กรองยื่น) · `tools.ts#runTool` (T1.6) · `tool-access.ts` (T1.6 ระดับ access + ปิดรั่ว writesNow ของ system actor) · `conversation-owner.ts` + `conversations.ts` (T1.7 แท็ก `e~` + สมาชิก) · `proposals.ts` executeProposal/rejectProposal (T1.7/T1.9 decidedById + ตรวจ access) · `scheduled.ts` + `cron/hourly/route.ts` (T1.8) · `ai.prisma`/`ai_credit.prisma` คอลัมน์ nullable (T1.1) | `apps/mobile/**` · `credit.ts` |
| **T2 (lane B แอป)** | `apps/mobile/app/(app)/{team,tasks,inbox,hire,profile,settings}/**` · `apps/mobile/src/components/team/**` · `apps/mobile/src/api/team.ts` · fixture + `qc/shoot-ai-team.mjs` · `scripts/ai-team-ui-inventory.json` | `apps/mobile/app/_layout.tsx` + `app/(app)/_layout.tsx` + `(app)/index.tsx` (T2.1 เท่านั้น) · `chat/[id].tsx` + `ProposalCard.tsx` (T2.6) · `sessions.tsx` (T2.4) | src/** ฝั่งเซิร์ฟเวอร์ (ใช้ mock ตามสัญญา T0.2) · โซน `crm/` `member/` |
| **T3** | `src/lib/ai/team/quota.ts` (ตัวนับแพ็ก · reset รายเดือนแบบ lease) · จอ `apps/mobile/app/(app)/plan/**` · `/api/mobile/team/quota` | `src/lib/ai/credit.ts` (`chargeUsage`/`canSpend`/`ensureWallet` — T3.1/T3.6 ใบเดียวต่อเนื่อง) · `service.ts` guard + degrade (T3.1) · `/api/mobile/usage/route.ts` (คงรูป) · `scheduled.ts` (พักเมื่อโควตาหมด T3.3) | ผู้เรียก chargeUsageSafe 17 จุดในโมดูลอื่น (ไม่ต้องแก้ถ้าตัดที่ credit.ts) |
| **T4** | `src/lib/ai/team/{auto,undo,teach,promotion,daily}.ts` · ตาราง `AiActionLog`/`AiTeachNote`/`AiEmployeeDaily` (มีใน T1.1 แล้ว) · cron daily ผ่าน `src/lib/platform/cron.ts` (hunk) | `proposals.ts` (เรียก executeProposal จาก auto.ts — ไม่แก้ตัว execute ถ้าเลี่ยงได้) · `tools.ts#kbSearch` (T4.6) · `core/audit.ts` (ไม่แก้ — เรียกใช้) | core.prisma · ActorType |
| **T5** | `src/lib/ai/team/rooms.ts` + `handoff.ts` · จอ rooms · dark tokens | `app.json` `userInterfaceStyle` (T5.4 — ต้องบิลด์) | AiPlan internals |
| **T6** | ledger · store assets · version bump staged | — | ทุกอย่างอื่น |

ข้อกำหนดร่วม: lane A กับ B ขนานได้ตั้งแต่ T0.2 (สัญญา API) — B ใช้ mock จาก fixture · ทุกใบที่แตะ `conversation-owner.ts` / `tool-access.ts` / `proposals.ts` / `credit.ts` ต้องรัน regression: `qc-ai-proposals` `qc-ai-plan` `qc-ai-schedule` `qc-ai-tools` `qc-ai-tools2` `qc-ai-skills` `qc-ai-memory` `qc-ai-credit` `qc-ai-usage` `qc-mobile-chat` `qc-mobile-authz-hotfix` + ชุด CRM C5.5-G1/G2/G3 + `qc-crm-c1.10` `qc-crm-c1.11`

---

## สรุปความเสี่ยงใหญ่ที่สุด

ความเสี่ยงอันดับหนึ่งคือ **โมเดลการมองเห็นห้องแชท AI ปัจจุบันเป็น "ห้องของผู้สร้างคนเดียว" ที่ฝังใน id** (`u~<userId>~`) และ `executeProposal` ยืนยันได้เฉพาะคนที่เห็นห้อง — ขัดตรง ๆ กับหัวใจของแบบ (หลายคนสั่งงานพนักงานคนเดียว · ผู้อนุมัติกดร่างของคนอื่น · กล่องรวมทุกกิจการ · ห้องแผนก) การขยายต้องทำที่ `conversation-owner.ts` ซึ่งเป็นด่านที่ปิดช่องรั่ว C5.5-G2 มาแล้ว ถ้าพลาดคือเปิดรั่วกลับ อันดับสองคือ **การเลิกเครดิตต้อนรับผูกกับด่าน `canSpend` (balance > 0) และ degrade ที่ $0.50** — ปิด grant ก่อนมีด่านโควตาแพ็กจะทำให้ร้านใหม่ใช้ AI ไม่ได้และทุกคำตอบตกเป็น haiku ส่วนการหักเงินกระจายอยู่ 17 จุด จึงต้องตัดที่ `credit.ts` ชั้นเดียว อันดับสามคือ **"งานประจำอ่านอย่างเดียว" ไม่ได้ถูกบังคับจริง** (system actor สิทธิ์ต่ำสุดยังเขียนความจำ/เปิดเคสได้ และไม่มี lease = รันซ้ำหักเงินซ้ำ) ซึ่งเป็นฐานที่ AUTO จะยืนทับ — AUTO ต้องรันด้วย Membership สดของผู้มอบผ่าน `executeProposal` เดิมโดยไม่ส่ง `confirm2x` และต้องมีตารางจัดชั้นชนิดงาน (เงิน/ถึงลูกค้า/ย้อนได้) ที่ยังไม่มีในโค้ด อันดับสี่คือ **แพ็กฟรี "ผูกต่อเจ้าของ" ไม่มีตัวตนเจ้าของที่ชัดในฐาน** (OWNER ได้หลายคน, `Tenant` ไม่มี owner, ทุก `Ai*` เป็น tenant-scoped, core.prisma FROZEN) จึงต้องตาราง global axis + กติกาเลือกเจ้าของที่ตายตัว และสุดท้าย **ฝั่งแอป**: หน้าแรกเป็น WebView, ธีมมีแต่โหมดสว่าง, ไม่มี blur native (Liquid Glass/โหมดมืดต้อง EAS build ใหม่) และ QC parity ทำผ่าน web export ซึ่งเรนเดอร์ blur native ไม่ได้ — ควรออกแบบ "กระจก" เป็นโทเคน JS ล้วนตั้งแต่ T0.3 ส่วนไฟล์ร้อนที่ POS/HR ยังแก้อยู่จริงมีแค่ `tools.ts` (tool อ่านยอดขาย/ใบลา) · `permissions.ts` บล็อก pos · `scope.ts` · `outbox-consumers.ts` · `automation/labels.ts` — ไม่มีใครแตะแอปหรือ route มือถือ
