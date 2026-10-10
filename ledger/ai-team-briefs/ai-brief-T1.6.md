# T1.6 — Access levels OFF/READ/DRAFT per skill + kind classification (Opus · server lane) 🎯 hunter
Read `ai-brief-COMMON.md` + RESOLUTIONS R-E C11/C15/C28/C31 first. Contract: AI-TEAM-RUN §2 T1.6. Mockup B5 (4 levels per system group; AUTO disabled until T4.2 — R-C7).

## Verified facts (REVIEW §2.1, §2.4)
- Gate 1 (what the model sees): `service.ts:176–177` `visibleSkills = skillsForTenant(types).filter(s => offeredOf(s.tools).length > 0)` with `toolsOfferedTo(actor, names)` `tool-access.ts:285`; skills are loaded lazily via `load_skill` (`LOAD_SKILL_TOOL` `skills.ts:286`, `toolNamesOfSkills` `:372`).
- Gate 2 (dispatch): `runTool(ctx, name, args)` `tools.ts:2511` → `actorProblem` → `toolVerdict(actor, name)` `tool-access.ts:216` (HAND_TOOL_ACCESS / KIND_ACCESS of the confirming person / registry scope) → `guarded()` `:2405`.
- Gate at confirm: `executeProposal(m, ctx, id, opts)` `proposals.ts:363` → `assertCan(m, KIND_ACCESS[kind])` `:417–426`.
- Read/write classification: hand tools `AiTool.action === true` (`tools.ts:62`) or in `HAND_ACTION_KIND` (`tool-access.ts:107–138`); `writesNow` rule in `HAND_TOOL_ACCESS` (`:67–104`, e.g. `remember_fact forget_fact support_open_case kb_auto_save`); registry tools `op.kind read|write|danger` via `accountToolInfos` (`account-ops.ts:353`, `danger` `:363`), `kanbanToolInfos`, member/crm bridges; `skillOfTool(name)` `skills.ts:307`; `CORE_TOOLS` `:40–49` belong to no skill.
- Kinds: `KIND_ACCESS` `proposals.ts:194–203`, `DESTRUCTIVE_KINDS` `:125–141`, `kindAccessOf` `:468`; `PLAN_HUMAN_ONLY` `plans.ts:36`; CRM-door kinds `:379–388`.
- Permission grant rule `canGrantPermission(actor, module, action)` `rbac.ts:112`.

## Deliverables
1. `src/lib/ai/team/kind-class.ts` (pure, env-free, importable by fitness): `classOfKind(kind) → { destructive, money, customerFacing, reversible }` — destructive = `DESTRUCTIVE_KINDS.has(kind)` ∪ `PLAN_HUMAN_ONLY` ∪ CRM-door kinds; money = `account.*` (all), `member.*` points/voucher/giftcard kinds, `crm.*` discount/commission, static kinds touching money (list in file: `void_sale`, `shop_refund_order`, `restaurant_close_bill`, `record_expense` …); customerFacing = chat send/reply kinds, `crm.*` email/sequence/send, `member.*` campaign/notify/voucher-issue, content post kinds; reversible = **empty in this WO** (T4.3 fills); unknown kind → `{ destructive:false, money:true, customerFacing:true, reversible:false }`. Export `KIND_CLASS_OVERRIDES` table for the 36 static kinds.
2. `src/lib/ai/team/access.ts`:
   - `setAccess(ctx, aiEmployeeId, skillId, level, limits?)` — `assertCan(ai.employee.manage)`; `skillId ∈ SKILLS ∪ {"core"}`; `level === "AUTO"` → refuse `employee_auto_not_granted` (T4.2 lifts); the caller must themselves hold the skill's module permissions (`membershipCan` on the skill's tools' access queries — if the caller cannot do X, they cannot give the employee X) → refuse `cannot_grant_beyond_self`; upsert row; audit `ai.access.set`.
   - `accessMap(aiEmployeeId) → Record<skillId, { level, limits }>` with fallback DRAFT for skills without a row (default employee = DRAFT everywhere) and `core` default DRAFT.
   - `effectiveTools(employee, actor, toolNames) → string[]`: drop tools whose skill is OFF; at READ drop tools with `action`, `writesNow` or registry kind write/danger; at DRAFT keep today's set; then ∩ `toolsOfferedTo(actor, …)` (the commanding user's own rights).
   - `accessGroupsForUi(tenantId) → { groupKey, labelTh, skillIds[] }[]` — B5 groups: CRM ("CRM · ลูกค้า & ดีล" = crm), บัญชี ("บัญชี · ใบเสนอราคา" = account, sales), บอร์ดงาน (tasks), แชทลูกค้า (chat), + สมาชิก (members), คลัง (inventory), ความรู้/ความจำ (knowledge, memory, core), อัตโนมัติ (automation) — only skills that surface for the tenant.
3. Enforcement hunks (three places, same helper `assertEmployeeAllows(aiEmployeeId, toolName | kind)`):
   - `service.ts:176` — when `ctx.aiEmployeeId` is set, wrap `offeredOf` with `effectiveTools`.
   - `tools.ts#runTool` — after `toolVerdict`, if `ctx.aiEmployeeId`: OFF → return JSON `{ error: "employee_access_off" }`; READ + write tool → `{ error: "employee_access_read_only" }` (never throw; same shape as other refusals).
   - `proposals.ts#executeProposal` — after loading the row: if `row.aiEmployeeId` (T1.1 column; T1.7 fills it) and access for `kindAccessOf(kind)`'s skill is OFF/READ → return `{ ok:false, note: <Thai> }` leaving PENDING (same style as the assertCan refusal).
   - No employee in ctx ⇒ all three paths unchanged (byte-identical).
4. Refusal messages (Thai) in `src/messages/*/ai-team.json` `team.refusal.*` (T0.4 keys) and returned to the model as English JSON error codes.

## Files you own
`src/lib/ai/team/{kind-class,access}.ts`, hunks in `src/lib/ai/service.ts` (gate 1), `src/lib/ai/tools.ts` (`runTool` only — POS/HR edit other hunks of this file; record overlap), `src/lib/ai/proposals.ts` (`executeProposal` one block), `index.ts` exports.

## Acceptance (oracle `qc-ai-t1.6`)
S1 setAccess rules incl. `cannot_grant_beyond_self` · S2 OFF at all three gates · S3 READ at gates + core write refused · S4 DRAFT unchanged · S5 X2 commander lacking module rights ⇒ not offered · S6 `classOfKind` covers every `KIND_ACCESS` key (iterate the real registry) · S7 X6 fake tool call from the mock provider refused · S8 no-employee snapshot = baseline · S9 X1 · S10 audit · S11 UI groups. Regressions: `qc-ai-tools` `qc-ai-tools2` `qc-ai-proposals` `qc-ai-skills` `qc-approval-wiring` `qc-mobile-authz-hotfix` + CRM G1/G2/G3 + `qc-crm-c1.10`.

## Controller rulings
- `limits` is stored now (zod `{ maxSatang?, maxDiscountPct?, conditions?: string }`) but only read by T4.2.
- Hunter lens after acceptance: can any path reach a write tool at READ (plans `propose_plan`, `kb_auto_save`, registry tools via `load_skill` after level change mid-conversation)? Level changes apply from the next turn; a proposal created before OFF is refused at execute (covered by S2).
