# C6.0 merge-main — independent review

Reviewer: Fable (independent) · 2026-10-07T09:28Z · worktree `/root/projects/shark-crm-c60` · branch `wip/crm-c60-merge-main` reviewed at **6c5b646a**
(merge ae276a54 + 8d1887ce + 699800d6 + bad0e8c0 + builder note). Bases: origin/main f85f5455 · origin/session/crm ea909894 (merge parent; later
session/crm commits c97f91d2 / 38bd130f are ledger + the C6.1 prod probe only, no `src/`). Merge-base c236a490. QC database: **QC3 only**.

## Method
1. Three-way read of the 12 conflicted files (merged vs main, merged vs session/crm, both sides' history).
2. Mechanical sweep over **all 124** `src/ scripts/ prisma/ package.json` files main changed since the merge-base:
   (a) every line main *added* must exist in the merged file; (b) no line main *removed* may be back in the merged file;
   (c) the same (a) check for every line session/crm added. Every hit was read by hand (results below).
3. Semantic read of the files both sides changed (50) and of main's hotfix notes (`HF-APIV1.md`, `hotfix-sanitize-2026-10-01*.md`,
   `HF-HR-0.md`, `HF-INV-*.md`, `HF-O23.md`, `RC-HOTFIXES-2026-10-01.md`).
4. Prisma validate / migrate status / drift against QC3; typecheck; fitness ×2; 30 suites/probes on QC3; main's apiv1 suite also run on the
   session/crm tree; my own adversarial probe `scripts/pending/c60/review/probe-c60-review.mts`.

## 1. Conflict verdicts (12)
| file | guards on main side | guards on CRM side | merged | verdict |
|---|---|---|---|---|
| `src/lib/core/sanitize.ts` | 6513a9f7 default-deny engine | same engine (C5.5-fix4 forward port) | diff vs main = **one doc comment only** | OK |
| `src/lib/mobile/guard.ts` | `mobileDenied`, `AI_CHAT`, `SYSTEM_CREATE` | + `mobileAiCtx` | main's 24 lines byte-identical + CRM's 9 | OK |
| `mobile/chat/send/route.ts` | `mobileDenied(g, AI_CHAT)` before body/stream | same gate + `mobileAiCtx` (G1 actor/G2 viewer) | gate kept first, ctx = `mobileAiCtx(g)` | OK |
| `mobile/conversations/route.ts` | gate on GET + POST | gate + own-room list / creator-stamped id | both | OK |
| `…/[id]/route.ts` | gate on PATCH + DELETE | gate + own rooms only | both | OK |
| `…/[id]/messages/route.ts` | gate | gate + other's room = `[]` | both | OK |
| `…/[id]/read/route.ts` | gate | gate + own rooms only | both | OK |
| `v1/ai/skills/route.ts` | `generalToolGate` filter on skills, toolCount, core | `toolVerdict(aiApiKeyActor)` filter on the same three | AND of both on all three | OK (stricter of both) |
| `v1/ai/skills/[id]/route.ts` | `generalToolGate` filter → 404 when empty | `toolVerdict` filter → 404 | AND of both, same 404 | OK |
| `v1/ai/tools/[name]/route.ts` | auth → tool 404 → scope 403 → **`key_not_general` 403** → system-mismatch 403 → body 400 → room create → runTool | auth → tool 404 → scope 403 → mismatch 403 → **`toolVerdict` 403** → body 400 → **room 404 (G2)** → room create (key-stamped) → runTool(actor) | auth → 404 → scope 403 → `key_not_general` 403 → mismatch 403 → `toolVerdict` 403 → 400 → room 404 → create → runTool | OK — every deny precedes the only side effect (room create); before it only auth bookkeeping (rate bucket/lastUsedAt, same as both bases) and reads (`crmLegacyLeadOpen`, `findVisibleConversation`). Main's callers get main's body/code for every case main covered (`key_not_general` still fires before mismatch) |
| `src/lib/modules/crm/emails.ts` | 1 MB HTML cap before `sanitizeHtml`/`htmlToText` | same cap placed after the C5.5-fix2 rate caps + text cap | == session/crm (`emails.ts:2575-2578`: `inboundHtml` sliced to 1 000 000, `bodyText` text also capped) | OK — only main line "missing" is the uncapped `bodyText` form, replaced by the stricter one |
| `scripts/qc-mobile-authz-hotfix.mts` | room created by Prisma, OWNER deletes | ORACLE-EDIT C5.5-G2: STAFF+ai opens the room via the real route, its creator deletes | CRM version | OK — already ruled in C5.5-G2; 12/12 |

## 2. Overlap / non-conflicted sweep
- (a) main-added lines absent from merged: only in the 12 files above plus `scripts/qc-hf-hr-privacy.mts` (the 8d1887ce edit) — each explained in §1/§5. **No other main line was lost.**
- (b) main-removed lines re-introduced: **none** (one false hit: a `skills/route.ts` line that only changed wrapping).
- (c) CRM-added lines absent from merged: only the pre-merge forms of the three AI routes and `ai/actor.ts`, each superseded by the `scopesMalformed`-aware form (699800d6). **No CRM line lost.**
- Byte-identical to main: `src/lib/api-keys/**` (route-auth `isGeneralApiKey`/`keyNotGeneralResponse`, service `scopesMalformed`, rotation refusal), `src/app/api/v1/ai/general-key-gate.ts`, the 8 legacy `/api/v1/*` data routes, `chat/public-auth.ts`, `scripts/vercel-build.sh`, `package.json`. No new non-CRM `/api/v1/*` route on the CRM side that would need `requireLegacyFullAccessKey`.
- Main hotfix → present on merged (read): HF-HR-0 `PLAN_HUMAN_ONLY` + pre-check (`ai/plans.ts`), R4.1a/R5.5 decider + `res.reason` (`ai/proposals.ts`), leave reason removed (`ai/tools.ts` pending_leaves), HF-O23 `pos1:` key + post-create ownership (`actions/pos.ts:366-442`, CRM never touched it), kanban revoke own-system (`kanban/settings-actions.ts`, CRM fix8 bundle allowlist added beside it), automation/payment/dna gates (merged diff vs main = CRM-only additions: BL-1 template, SSRF `outboundFetch`, v1 once-per-event). HF-APIV1 round-3 note asked the CRM side to stop the account page rotating a **general** key: done by CRM (`account/connections.ts:395` `accountManagedKey` = false for unbound keys).
- CRM ↔ hotfix areas: CRM reads inventory only through `getItemsByIds` (read) and HR only through `isOnLeave` (read) — no CRM write path bypasses HF-INV locks or HF-HR rules.

Findings (none blocks the merge):
| ID | sev | where | what | fix |
|---|---|---|---|---|
| R-1 | INFO (deploy) | `src/lib/ai/tool-access.ts:71-75,99,197-199` | Deploying this branch changes prod for **general** API keys on `/api/v1/ai/*` (G1 policy, not a merge defect): no more `remember_fact`, `forget_fact` (skill `memory` disappears), `support_open_case`, `financial_summary`, `record_expense` and other write-now / account-data hand tools — core shrinks 8 → 6 (`list_systems, ask_clarify, propose_plan, open_system, kb_search, list_memories`). | Release note + read-only prod check of general keys used on the AI lane before deploy (same idea as HF-APIV1 D1). |
| R-2 | LOW (note accuracy) | `ledger/wo-notes/crm-C6.0-merge-main.md` suite table | "origin/session/crm … the same 4 ids red" is true for the HF-12 ids, but that tree scores **60/141** (it has no HF-APIV1 at all — 77 other reds: legacy routes, chat secret mode, AI general-key gate). Wording reads as if only 4 were red. | Reword; no code change. |
| R-3 | LOW (pre-existing, both bases) | `src/app/api/v1/ai/tools/[name]/route.ts:56` | System-mismatch 403 text says "สมุดบัญชีที่ระบุ…" (account book) also for a kanban-bound key. | Neutral wording in a later card. |

## 3. Prisma
- main changed nothing under `prisma/` ⇒ merged schema/migrations = session/crm. New since merge-base (CRM only, date-ordered, `ls | sort -c` OK):
  `20261103000000_crm_perf_indexes` (4 × `CREATE INDEX IF NOT EXISTS` on CRM tables, not CONCURRENTLY — prod CRM v2 tables empty per C6.1),
  `20261104000001/2/3_account_journal_no_*` (`CREATE OR REPLACE FUNCTION` + sequences). No DROP/RENAME/ALTER COLUMN/NOT NULL. Additive.
- `prisma validate` ✓ · `migrate status` (QC3) "151 migrations · Database schema is up to date" (first try P1001 cold start, retry OK) · `migrate diff --from-config-datasource --to-schema prisma/schema --exit-code` (QC3) **No difference detected**.

## 4. Gates and suites — QC3, one at a time (iso.sh + qc3.sh + gate lock, `CRM_V2_SWITCH=all`, `with-qc3-secret.sh`), tree 6c5b646a
| run | result |
|---|---|
| typecheck (5120 MB) | exit 0 |
| fitness (QC3 env / no DB env) | 42/42 · 42/42 |
| qc-hf-apiv1-scope | **137/141** — red only HF-12.1 ×2, HF-12.2 ×2 (legacy + rotated key) |
| ↳ same suite on the session/crm tree (base-crm worktree, copied in, run, removed — worktree clean after) | 60/141; HF-12.1/12.2 red with **identical actual values** (`sales,inventory,approvals,chat,knowledge,automation` · `sales_summary,sales_by_day,pos_create_sale,void_sale`) ⇒ G1 rule, not the merge |
| qc-sanitize-hotfix · qc-security-hotfix | 29/29 · 14/14 |
| qc-mobile-authz-hotfix · qc-automation-authz-hotfix · qc-payment-authz-hotfix | 12/12 · 12/12 · 8/8 |
| qc-ai-tools · qc-ai-tools2 · qc-ai-proposals · qc-ai-skills | 18/18 · 8/8 · 16/16 · 23/23 |
| qc-mobile-chat · qc-chat-api-v1 · qc-chat-replies · qc-public-api | 29/29 · 89/89 · 60/60 · 18/18 |
| main extras: qc-hf-reports-authz · qc-hf-inventory-authz · qc-hf-inventory-atomic · qc-clinic | 79/79 · 118/118 · 143/143 · 8/8 |
| G1 probes cf9 g1 · g1-r2 · review · review-r2 | 47/47 · 18/18 · 18/18 · 14/14 |
| G2 probes cf14 g2 · review | 34/34 · 14/14 |
| G3 probes cf17 g3 · review | 28/28 · 15/15 |
| cf8 mobile · actions | 8/8 · 9/9 |
| **reviewer probe** `scripts/pending/c60/review/probe-c60-review.mts` | **43/43** (below) |

Not run: `qc-hf-hr-privacy`, `qc-hf-pos-page-authz` (headers pin **QC4** via `qc4.sh`), `qc-hf-o23` (pins the QC4 host) — skipped by rule.
`qc-account-api-keys` pins prod-guard/other host — skipped. No UI/journey suites, no `next build`.

## 5. Reviewer probe (QC3, throwaway tenants, swept to 0)
API `/api/v1/ai/*` (merged routes, in-process):
- general key: `/skills` 200 lists sales · `/skills/sales` 200 · `tools/sales_summary` 200 · write tool `pos_create_sale` 200 pending with room `k~<key>~…` · same key continues it 200.
- room ownership: other general key → that room, general key → OWNER's member room, → legacy creator-less room, other shop's key → room: **404 `conversation_not_found`** for read and write tools; nothing written into those rooms.
- scoped (kanban-read), bound ACCOUNT `[]`, bound KANBAN, malformed `scopesJson`: `/skills` hides sales, core `[]` · `/skills/sales` 404 · `tools/sales_summary` and `pos_create_sale` **403 `key_not_general`** · with someone else's `conversationId` still **403** (deny precedes room lookup — no existence oracle).
- bound key + `X-Shark-System` of another board → 403; own board with/without header → 200 · kanban-read → `kanban_create_card` 403 scope (not `key_not_general`).
- second line (699800d6): `isGeneralKeyActor`/`toolVerdict` refuse a malformed `[]` actor and allow a clean one.
- G1: general key → `remember_fact` / `financial_summary` 403; denied calls opened no AI room and wrote no memory · unknown tool 404 · no key 401.
- ℹ️ malformed key → module tool `kanban_list_boards` 403 (module scope logic = main's, unchanged).
Mobile:
- STAFF without `ai.chat.send` → **403** on list, create, rename, delete, messages, read, chat/send, welcome, proposals, usage; STAFF+`ai.chat.send` → 200 on list/send/usage/proposals.
- second STAFF+ai: list hides the first STAFF's room · messages `[]` · rename/delete/read `ok:false` · row unchanged · OWNER sees the key room but not the staff room; the staff does not see the key room · token user not a member of `X-Tenant-Id` → 403 (both directions) · creator deletes own room → ok.

## 6. Builder test edits — ORACLE-EDIT rulings
- **8d1887ce `qc-hf-hr-privacy` L-4 — APPROVED.** Only change: `runTool` now gets an actor (required since G1). Builder used the shop OWNER, the strongest viewer, so "no leave reason" still means "never returned to anyone"; L-5 (names/types/dates still present) is unchanged and `pending_leaves` is `OPEN` in `tool-access.ts:81`, so the OWNER actor does not hide a refusal. Not weaker. Still owed: a **QC4** run of this suite on this branch (not run here).
- **699800d6 — not an oracle edit.** `src/` only (actor + 3 routes); tightens the executor's general-key test to equal `isGeneralApiKey`. Probe A3.actor + suites confirm it does not change REST behaviour.
- **HF-12.1 / HF-12.2 (drafted, not applied) — APPROVED WITH CONDITIONS** (honest adaptation to G1, provided it keeps teeth):
  1. HF-12.1: expect skills `sales` + `knowledge`, `memory` **absent**, and core **equal to the hard-coded list** `list_systems, ask_clarify, propose_plan, open_system, kb_search, list_memories` — do NOT compute the expectation from `toolVerdict` (that would make the oracle check the code against itself).
  2. HF-12.2: expect `sales_summary` + `sales_by_day` present and `financial_summary` **absent**.
  3. Add one check that the general key gets **403 that is not `key_not_general`** on `tools/remember_fact` and `tools/financial_summary` (pins that the refusal is G1's policy, not the hotfix gate over-blocking general keys), and keep HF-12.3 (200) as the positive control.
  Comment in the oracle must cite C5.5-G1 and R-1 (owner-visible behaviour change).

## 7. Could not verify
- QC4-pinned suites (hr-privacy incl. the L-4 edit, pos-page-authz, HF-O23) — controller/POS lane.
- Production build (`next build`), UI/visual parity, the mobile app on a device, prod-size migration timing.
- Whether any prod integration relies on the general-key AI tools removed by G1 (R-1) — needs a read-only prod check.

VERDICT: MERGEABLE
