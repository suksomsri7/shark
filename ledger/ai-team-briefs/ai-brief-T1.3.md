# T1.3 — Position templates (5) + recommendation (Opus · server lane)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A11, R-E C30 first. Contract: AI-TEAM-RUN §2 T1.3. Mockups B1 (template cards + categories + "สร้างตำแหน่งเอง"), A8/D3 (recommendations with signals), A4/B6 (frequent tasks).

## Verified facts (REVIEW §2.4)
- `SKILLS` `src/lib/ai/skills.ts:51` — 20 skills; **only** these surface in production through `skillsForTenant(AppSystem.type)` `:320`: `sales` (POS/ACCOUNT) · `account` · `inventory` · `members` · `booking` (BOOKING only — QUEUE is a UnitType) · `hr` · `crm` · `tasks` · `approvals` · `chat` · `knowledge` · `automation` · `memory`. The 7 unit-type skills (`shop restaurant hotel rental ticket school clinic`) never surface (C30) — do not reference them.
- `CORE_TOOLS` `:40–49`; tool read/write classification: `AiTool.action === true` (tools.ts:62), `HAND_ACTION_KIND` (tool-access.ts:107), `op.kind read|write|danger` for registry tools (account/kanban/member/crm adapters).
- Signals for recommendations exist in other modules — read through facades only: unanswered chat threads (`@/lib/modules/chat` facade — find the "pending/unanswered" count function; if none, count `ChatThread` rows with the module's own status field through `prisma` in a tiny read helper placed in **your** file with a `// AUDIT-CLASS X1` comment and a note), open invoices (`@/lib/modules/account` facade `outstandingByContacts` or a count op), last post date (content/social module facade; if absent, signal = null).
- `recommendPositions` must not hit the model.

## Deliverables (`src/lib/ai/team/templates.ts`, pure data + one DB helper file `templates-signals.ts`)
- `type PositionTemplate = { key, labelTh, labelEn, summaryTh, category: "sales"|"service"|"account"|"marketing", orbColor, skills: { skillId, level: "READ"|"DRAFT" }[], manualEn: Manual6, manualTh: Manual6, frequentTasks: { icon, titleTh, hintTh, prompt (EN), estimatedMinutes }[], sampleSpeechTh, defaultQuotaCapPct }`.
- Templates: `sales` (crm DRAFT, account DRAFT, tasks DRAFT, chat READ, knowledge READ, memory DRAFT) · `chat` (chat DRAFT, members READ, knowledge READ, crm READ, memory DRAFT) · `account` (account DRAFT, sales READ, inventory READ, knowledge READ, memory DRAFT) · `content` (automation DRAFT, knowledge READ, members READ, chat READ, memory DRAFT — social posting goes through whatever skill/tool exists today; if no posting tool exists, the template's frequent tasks produce drafts as chat text and the notes record the gap) · `member` (members DRAFT, crm READ, chat READ, knowledge READ, memory DRAFT) · `general` (hidden from B1; used by the default employee: every surfaced skill at DRAFT) · `custom` (empty skills, user fills).
- Money-touching and customer-facing skills are never above DRAFT in templates (static check); `approvals`/`hr` not included in any template.
- `manualEn` 6 sections (duties · forbidden · askWhen · steps · goodExamples · metrics) written in English, ≤ 1,200 chars each; `manualTh` is the display translation (shown in B3).
- `frequentTasks` ≥ 3 per template, matching the mockup texts for sales (ทำใบเสนอราคา · ตามลูกค้าที่เงียบ · สรุปดีลค้าง · หาลูกค้าน่าขายต่อ), `estimatedMinutes` per task (used by T4.5 hours-saved; documented guesses are fine, e.g. quotation 20, follow-up 5 per customer, summary 15).
- `sampleSpeechTh` per template with placeholders the persona layer (T1.4) fills.
- `positionByKey(key)`, `visiblePositions()` (excludes `general`), `recommendPositions(tenantId) → { key, reasonTh, signal: { kind, value } }[]` (chat if unanswered ≥ 3, account if open invoices ≥ 3, content if last post > 7 days or never; max 3, ordered by signal strength).
- Fitness F16.2 (in `scripts/fitness-ai-team.mts`): every `skillId` in templates exists in `SKILLS` and is in the surfaced set (list the surfaced ids as a constant in the fitness file with a comment pointing to C30).

## Files you own
`src/lib/ai/team/templates.ts`, `src/lib/ai/team/templates-signals.ts`, F16.2 block in `scripts/fitness-ai-team.mts`, `index.ts` export lines.

## Acceptance (oracle `qc-ai-t1.3`)
S1 [static] templates + skill ids surface for AT-1's AppSystem types · S2 [static] no AUTO, money/customer skills DRAFT · S3 [static] manualEn non-empty, no Thai chars, manualTh paired · S4 recommend AT-1 → chat + account with reasons · S5 AT-X → [] or default · S6 X1 · S7 createEmployee stores templateSnapshot · S8 F16.2 red on fake skill id · residue. Regression: `qc-ai-skills` `qc-ai-tools`.

## Controller rulings
- Template content is data the owner may edit later (T6.3 notes a web editor as future work); keep it in TS, not DB.
- If a facade lacks a signal function, the signal is `null` and the recommendation falls back to `chat` with reason "ตอบลูกค้าได้ทันที" — no new facade exports in this WO (record the gap).
