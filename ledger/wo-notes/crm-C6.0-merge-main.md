# C6.0 — absorb origin/main into session/crm

Worktree `/root/projects/shark-crm-c60` · branch `wip/crm-c60-merge-main` · QC database **QC3 only** (`.env.qc3`, ep-weathered-river).
Base: `origin/session/crm` ea909894 + `origin/main` f85f5455 (merge-base c236a490 · 59 main-only commits · 254 CRM-only commits).

## Commits (in order)
| sha | what |
|---|---|
| ae276a54 | merge of origin/main (12 conflicts resolved, below) |
| 8d1887ce | ORACLE-EDIT `scripts/qc-hf-hr-privacy.mts` L-4: pass an actor to `runTool` (typecheck fix, see "Semantic conflicts") |
| 699800d6 | AI key actor honours HF-APIV1 malformed scopes (`isGeneralKeyActor` == `isGeneralApiKey`) — the follow-up the C5.5-G1 note asked for once both landed |
| bad0e8c0 | merge of origin/session/crm c97f91d2 (ledger + C6.1 prod probe only, no src) so the branch is fast-forwardable for the controller |
| (this note) | |

Method: ordinary `git merge` (no rebase/squash). For each conflict both sides' history was read (`git log -p` on both branches, notes
`hotfix-sanitize-2026-10-01.md`, `HF-APIV1.md`, `crm-C5.5-G1/G2/G3.md`). Rule: the stricter check wins, no check is dropped.

## Conflict table (12)
| file | main (hotfix) had | session/crm had | resolution | why |
|---|---|---|---|---|
| `src/lib/core/sanitize.ts` | 6513a9f7 default-deny engine; `attrValue` one-line doc | the same engine (forward-ported in C5.5-fix4) + a longer doc comment on `attrValue` | CRM comment; **code byte-identical to main** (`git diff origin/main` = comment only). `html-allowlist.ts`, `kanban/sanitize.ts`, `member/join.ts` (render re-sanitise), `kanban/cards.ts getCardDetail` re-sanitise all present (diff vs main = 0, or CRM's linear `descriptionToText` only) | comment-only conflict |
| `src/lib/mobile/guard.ts` (add/add) | 7089364c `mobileDenied` + `AI_CHAT` (= web door key `ai.chat.send`) | same file + `mobileAiCtx(g)` (G2: tenant + token user as actor/viewer) | CRM file (strict superset: main's 24 lines unchanged + 9 lines) | superset |
| `src/app/api/mobile/chat/send/route.ts` | `mobileDenied(g, AI_CHAT)` gate, `ctx = g.ctx` | same gate + `ctx = mobileAiCtx(g)` (G1 actor / G2 viewer) | keep gate + CRM ctx (only the import line conflicted) | both checks kept |
| `src/app/api/mobile/conversations/route.ts` | gate on GET/POST | gate + `listConversations/createConversation(mobileAiCtx(g))` (own rooms, creator in id) | gate + CRM ctx | both |
| `…/conversations/[id]/route.ts` | gate on PATCH/DELETE | gate + rename/delete own rooms only | gate + CRM ctx | both |
| `…/conversations/[id]/messages/route.ts` | gate | gate + `listMessages(mobileAiCtx(g), id)` (other's room = empty) | gate + CRM ctx | both |
| `…/conversations/[id]/read/route.ts` | gate | gate + `markRead(mobileAiCtx(g), id)` | gate + CRM ctx | both |
| `src/app/api/v1/ai/skills/route.ts` | HF-APIV1 `generalToolGate` filter (non-module tools = general key only) on skills + core | G1 r2 F4 `toolVerdict(aiApiKeyActor)` filter on skills + core | **both filters** (`generalToolGate(n, auth) && toolVerdict(actor, n, opts).ok`) for skills, toolCount and core | listing must not advertise anything either executor gate refuses |
| `src/app/api/v1/ai/skills/[id]/route.ts` | `generalToolGate` filter | `toolVerdict` filter | both (AND) | same |
| `src/app/api/v1/ai/tools/[name]/route.ts` | after scope check: `generalToolGate` → 403 `key_not_general` | after header-system check: `toolVerdict` → 403 reason; G2 conversation ownership (404 on someone else's room, creator-stamped id); actor into runTool | union of imports; order kept: scope 403 → `key_not_general` 403 → system mismatch 403 → `toolVerdict` 403 → conversation ownership 404 → runTool (re-checks) | no check dropped; hotfix's body/code unchanged for the cases it covers |
| `src/lib/modules/crm/emails.ts` | ca5a28be: inbound HTML sliced to 1 000 000 before `sanitizeHtml`/`htmlToText` (at the old position) | same cap, forward-ported in C5.5-fix4 but **after** the C5.5-fix2 sender/system rate caps, and plain text also capped at 1 000 000 (fix5 r2) | CRM side (main's earlier copy dropped — it would be a duplicate `const` and run the sanitizer before the rate cap) | CRM is stricter (cap + text cap + dropped mails cost no CPU). Merged file == session/crm |
| `scripts/qc-mobile-authz-hotfix.mts` (add/add) | room created by Prisma without creator; OWNER deletes it | ORACLE-EDIT C5.5-G2: room opened by STAFF+ai.chat.send through the real route; its creator deletes it | CRM version | under G2 a creator-less room is OWNER-only; the positive controls must use the STAFF's own room (12/12 green, below) |

## Semantic (non-textual) conflicts found
1. **`scripts/qc-hf-hr-privacy.mts` L-4** (main HF-HR-0) called `tools.runTool({ tenantId }, "pending_leaves", {})`; G1 made `ToolCtx.actor` required ⇒ typecheck red.
   ORACLE-EDIT (8d1887ce): pass the shop OWNER as actor (strongest viewer ⇒ "reason never returned" still means "whoever asks").
   before: `runTool({ tenantId: tid }, …)` → after: `runTool({ tenantId: tid, actor: { kind: "member", tenantId: tid, userId: U.owner, membership: { role: "OWNER", unitAccess: ["*"], permissions: {} } } }, …)`.
   Suite is QC4-pinned (POS lane) ⇒ **not run here** — controller: run on QC4 (or ask the POS lane).
2. **AI general key, malformed scopes** — CRM `isGeneralKeyActor` lacked HF-APIV1's `scopesMalformed` refinement (G1 note said: after both land, align).
   699800d6: `AiApiKeyActor.scopesMalformed?`, `aiApiKeyActor` copies it, `isGeneralKeyActor` = `scopes [] && systemId null && !scopesMalformed`
   (inlined, not imported: route-auth pulls key service/DB and the AI registry must load without env — fitness F10). The 3 AI routes pass `auth.scopesMalformed`.
   REST behaviour unchanged (route-level `generalToolGate` already refused these keys); this is the second line.
3. Auto-merged files touched by both sides, checked by reading the merged result: `ai/plans.ts` (HF-HR-0 `PLAN_HUMAN_ONLY` + pre-check present), `ai/proposals.ts` (R4.1a/R5.5 decider checks + `res.reason` present beside G1 changes), `ai/tools.ts` (leave reason removed — present), `approval/service.ts`, `account/product.ts` (HF-INV locks + CRM ciEquals/ciContains), `chat/service.ts`, `kanban/settings-actions.ts` (main: revoke limited to own system — present; CRM fix8 bundle allowlist — present), `kanban/cards.ts`, `dna/actions.ts`, `mobile/dna/apply`, `automation/*`, `payment/*` (diff vs main = 0 or CRM-only additions). `api-keys/route-auth.ts`, `api-keys/service.ts`, `chat/public-auth.ts`, `general-key-gate.ts`, 8 legacy `/api/v1/*` data routes: identical to main.

## Prisma
- main has **no** schema/migration changes since the merge-base ⇒ schema = session/crm. `pnpm exec prisma generate` run in this worktree (fresh install).
- Migrations: CRM-only folders `20261103000000_crm_perf_indexes`, `20261104000001/2/3_account_journal_no_*` — additive (CREATE INDEX / CREATE OR REPLACE FUNCTION / sequences), date order fine, no main folder interleaves.
- **QC3 was missing `20261104000001/2/3`** (RESUME: "QC3 owed"). Applied to QC3 with `QC_ENV_FILE=.env.qc3 bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh bash scripts/qc-prisma.sh migrate deploy` (SQL read first: functions + per-system sequences only). Needed by `qc-hf-inventory-atomic` (AT-ERR "ออกเลขที่ใบสำคัญไม่ได้" before, 143/143 after).

## Gates
- Typecheck (`bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck`): merge commit alone **rc=2** (qc-hf-hr-privacy L-4, item 1) → after 8d1887ce **rc=0** → after 699800d6 **rc=0**.
- `pnpm fitness`: **42/42** with QC3 env and **42/42** without DB env (both after 699800d6; also on the merge). No F14 ghost rows (main renamed no testids that the registry uses). Pre-commit fitness green on every commit.

## Suites — QC3, one at a time through `iso.sh` + `qc3.sh` + gate lock (`CRM_V2_SWITCH=all`, `with-qc3-secret.sh` as the G lanes ran them)
Final tree = 699800d6 (src identical to bad0e8c0). Run 1 on 8d1887ce gave the same numbers for every suite.
| suite | result | reference |
|---|---|---|
| qc-sanitize-hotfix (pure) | **29/29** | main 29/29 |
| qc-security-hotfix (pure) | **14/14** | |
| qc-mobile-authz-hotfix | **12/12** | G1–G3 12/12 |
| qc-automation-authz-hotfix | **12/12** | 12/12 |
| qc-payment-authz-hotfix | **8/8** | 8/8 |
| qc-hf-apiv1-scope | **137/141** before the ORACLE-EDIT — red HF-12.1 ×2, HF-12.2 ×2 (legacy + rotated legacy key) · **143/143 after** (follow-up below) | origin/main on QC3: 141/141 · origin/session/crm (suite copied in, same QC3): **60/141** overall (that tree has no HF-APIV1 at all — 77 other reds: legacy data routes, chat secret mode, AI general-key gate); only HF-12.1/HF-12.2 are the same reds with identical actual values |
| qc-chat-api-v1 · qc-chat-replies · qc-chat-business-hours | **89/89 · 60/60 · 73/73** | main 89 · 60 · 73 |
| qc-mobile-chat | **29/29** | |
| qc-ai-tools · qc-ai-tools2 · qc-ai-proposals | **18/18 · 8/8 · 16/16** | |
| probe-cf9-g1 · -g1-r2 · review · review-r2 (G1) | **47/47 · 18/18 · 18/18 · 14/14** | same as G1–G3 notes |
| probe-cf14-g2 · review (G2) | **34/34 · 14/14** | same |
| probe-cf17-g3 · review (G3) | **28/28 · 15/15** | (G3 note: 23/23 · 15/15 — probe grew later, all green) |
| probe-cf8-mobile · -actions | **8/8 · 9/9** | same |
| probe-cf8-review (reviewer REPRO probe: an X-* line green = gap still reproduces) | **15/19** — X1.1 X1.2 X1.3 X2 "red" = gaps **no longer reproduce** | origin/session/crm on QC3: 16/19 (X1.1 X1.3 X2). X1.1/X2 closed by CRM fix8/fix3a; **X1.2 newly closed by the hotfix** (`/api/v1/customers` → 403 key_not_general); X1.3 closed by G1 + hotfix. Good news, not regressions |
| qc-crm-c2.5 (e-mail engine, inbound sanitise/S9.10) | **105/105** | |
| qc-hf-inventory-authz · qc-hf-reports-authz · qc-clinic (main, extra) | **118/118 · 79/79 · 8/8** | |
| qc-hf-inventory-atomic (main, extra) | **143/143** after the QC3 migration (52/53 AT-ERR before = env) | |

### HF-12.1 / HF-12.2 — not a merge regression, controller decision needed
The general (legacy) key's AI listing now lacks: skill `memory` (only tool `forget_fact`, an immediate write), core `remember_fact` + `support_open_case` (immediate writes; core no longer 8 — exact count not captured, the oracle prints only skill ids), and `financial_summary` / `record_expense` in `/skills/sales` (account data / account proposal). That is C5.5-G1's deliberate executor rule ("tools that write immediately = refused for every key; hand tools touching CRM/member/account data = refused for every key — use the module registry tool"), applied to the listing by G1 r2 F4. Identical on origin/session/crm. The hotfix oracle was written before G1 and pins the pre-G1 listing.
Proposed ORACLE-EDIT (not made — oracle edits go through the controller): HF-12.1 expect `sales` + `knowledge` (not `memory`) and core = exactly what `toolVerdict` allows for a general key (capture it first); HF-12.2 expect `sales_summary` + `sales_by_day` (observed list: sales_summary, sales_by_day, pos_create_sale, void_sale). HF-12.3 (`tools/sales_summary` 200) stays green.

## Not run (and why)
- `qc-crm-c5.3` — header pins **QC2** ("QC2 database only").
- `qc-hf-hr-privacy`, `qc-hf-pos-page-authz` — headers run through `qc4.sh` (**QC4**, POS lane); `qc-hf-o23` — header requires **QC4** host (exit 4 otherwise). hr-privacy carries the L-4 ORACLE-EDIT above ⇒ worth a QC4 run.
- `qc-crm-c4.4` — does not exist (C4.4 = `scripts/crm-journeys/**`, needs the :3215 server on QC1 — not this lane). e-mail coverage taken from qc-crm-c2.5 instead; `crm/emails.ts` merged == session/crm, so no e-mail code changed.
- No UI/visual/journey suites, no `next build` (merge touched no page/component; the conflicted files are route handlers + libs).
- No QC3 reseed was needed (all suites run use throwaway tenants).

## Open points for the controller
0. **R-1 release note (owner-visible, G1 policy — not a merge defect):** deploying this branch changes prod for **general** API keys on `/api/v1/ai/*`: they lose `remember_fact`, `forget_fact` (skill `memory` disappears), `support_open_case`, `financial_summary`, `record_expense` (and the other write-now / account-data hand tools); core tools shrink 8 → 6 (`list_systems, ask_clarify, propose_plan, open_system, kb_search, list_memories`). Before deploy: read-only prod check whether any general key uses the AI lane for these tools (same idea as HF-APIV1 D1).
1. ~~HF-12.1/12.2 ORACLE-EDIT~~ done (follow-up below) — or, if the owner wants general keys to keep `remember_fact`/`financial_summary` via the AI lane, that is a G1 policy change, not a merge fix.
2. Run `qc-hf-hr-privacy` (QC4) on this branch for the L-4 ORACLE-EDIT; also `qc-hf-pos-page-authz` / `qc-hf-o23` (QC4) if a full main-suite pass on the CRM branch is wanted.
3. QC3 now has migrations 20261104000001/2/3 (RESUME's "QC3 owed" item is done).
4. Prod deploy of this branch ships CRM migrations `20261103000000` + `20261104000001..3` together (register §7 Q8 — split or not).
5. Base comparison worktrees `/root/projects/shark-crm-c60-base-crm` and `/root/projects/shark-crm-c60-base-main` — removed (follow-up).

## Follow-up after review (crm-C6.0-merge-main-review.md: MERGEABLE · R-1 · R-2 · §6 ruling)
- **ORACLE-EDIT (C6.0 · G1 rule · reviewer-approved with conditions)** in `scripts/qc-hf-apiv1-scope.mts`, comment cites C5.5-G1 + R-1:
  - HF-12.1: skills ⊇ `sales`, `knowledge`; `memory` **absent**; core **== fixed literal** `list_systems, ask_clarify, propose_plan, open_system, kb_search, list_memories` (not derived from `toolVerdict` or any src helper).
  - HF-12.2: `/skills/sales` ⊇ `sales_summary`, `sales_by_day`; `financial_summary` **absent**.
  - new HF-12.2b (per legacy + rotated legacy key): `tools/remember_fact` and `tools/financial_summary` → **403 whose code/body is not `key_not_general`** (pins G1's refusal, not the hotfix gate over-blocking general keys).
  - HF-12.3 (`tools/sales_summary` 200) unchanged = positive control.
  - before → after: `ผ่าน 137/141` → **`143/143`** on QC3 (total +2 = the two HF-12.2b checks).
- Typecheck rc=0 · fitness 42/42 (QC3 env) · 42/42 (no DB env).
- R-2 wording fixed in the suite table; R-1 added as open point 0.
- Comparison worktrees removed (`git worktree remove` ×2 + `git worktree prune`).

## Controller merge gate — 2026-10-07 09:59 UTC
Merged on `session/crm`: `3557ddd1` (wip/crm-c60-merge-main c40433a5) then `1ec59c02` (wip/crm-c61-linkpolicy 9fd5323d). session/crm now contains all of origin/main (f85f5455). Gate unit `crm-main-c60` (`scripts/pending/run-main-c60.sh`, log `.qc-shots/crm/main-c60.log`, ALLDONE): typecheck 0 · docs --check ×4 · fitness 42/42 (no env + QC3) · QC3: hf-apiv1-scope 143/143 · sanitize 29/29 · security 14/14 · mobile-authz 12/12 · automation-authz 12/12 · payment-authz 8/8 · probe-c60-review 43/43 · G1 47/47 · G2 34/34 · G3 28/28 · ai-tools 18/18 · mobile-chat 29/29 · c2.5 105/105 · c3.9 49/49 · hf-inventory-atomic 143/143 · QC2: probe-linkpolicy 44/44 · probe-linkpolicy-review 40/40 · c2.6 87/87 · c2.11 47/47 · c5.3 L4 10/10. One red: **c3.8 30/31 S7.1** = the gitignored local skill reference `.claude/skills/shark-crm-api/references/endpoints.md` (dated 2 Oct) was stale vs `renderEndpointsReference()` after the link-policy wording — not a merge defect; regenerated with `pnpm exec tsx scripts/gen-crm-api-docs.mts` (committed `docs/api/CRM-API.md` unchanged) → re-run `.qc-shots/crm/main-c60-c38-rerun.log` **31/31**.
R-1 prod check (read-only, `scripts/pending/c6/prod-probe-r1-apikey-ai.cjs`): AI unused on prod in 30 d (0 AiMessage, 0 AiCreditTxn, last AiConversation 6 Sep); the only general key "Siamdive" (lastUsedAt 7 Oct, chat API) → no live caller loses a tool; release note only.
Not run anywhere: QC4-pinned hr-privacy (incl. the L-4 actor edit) / pos-page-authz / HF-O23 — ask the POS cloud session to run them on this tip.
