# crm-C5.5-authz-sweep — independent review

Branch `wip/crm-cf8` · reviewed tip ad720fec (base 6280997b) · DB QC3 only · review written 2026-10-01 20:51 UTC · local commit, no push.
Scope read: `git diff 6280997b ad720fec` (10 files), builder note, hotfix reviewer note (route sweep), every sibling door named below.

## Verdict on the 6 fixes
| fix | same key / helper as the web door? | before any write / side effect? | tenant + system + branch scope | bypass attempts | result |
|---|---|---|---|---|---|
| W1 `GET /api/mobile/proposals` | yes: `mobileDenied(g, AI_CHAT)` = `evaluate` (same as `assertCan`) on `ai.chat.send`, same as `listPendingProposalsAction` (`lib/ai/actions.ts:130`) | first statement after `requireMobile` | tenant from token + X-Tenant-Id membership (unchanged) | other verbs: none exported; siblings `conversations/**`, `chat/send`, `.../read` already gated; `proposals/confirm` checks per kind in `executeProposal`; `dna/questions` is a static list | holds |
| W2 `GET /api/mobile/usage` | yes (`loadAiQuotaAction:82`) | before `ensureWallet` (which can create a wallet row) | same | STAFF with `ai.*` and a branch-limited MANAGER still get 200 (V4) | holds |
| W3 `POST /api/mobile/chat/welcome` | yes (creating a room = `POST conversations` / `loadAiChatAction`) | before the room/message create | same | — | holds |
| S1 `createApiKeyAction` | `ACCOUNT_SCOPE_KEYS` = the list the page renders (`ConnectionsPanel.tsx:605`) | inside the scope loop, before `createApiKey` | key bound to the account system (unchanged) | whitespace (trimmed then refused), upper case, `crm.*`/`member.*`/`kanban.*`/`*`, mixed account+member, `crm.filter.team:` pseudo-scope, `member-admin`/`kanban-admin`/`crm.readonly` bundles, `account.approve.limit` → all refused, no key row (V1.1); duplicates de-duplicated, ticked scopes win over a foreign bundle (V1.2) | holds (see F2/F3/F4 for the other minting paths) |
| S2 `testWebhookAction` | registry `WEBHOOK_EVENTS` filtered to `account.` | before `dispatchWebhooks` | tenant from session | upper case, a CRM event's Thai label, bare `account.`, unknown `account.qc.fake` → refused, 0 delivery rows (V2.1); value with spaces is trimmed by `s()` and works (V2.2); 21 account labels are unique, each maps back to its own value, no non-account event shares an account label (R2) | holds (see F5/F6) |
| S3 v1 `addActivityAction` | `tenantDb({tenantId, systemId})` (CrmContact/CrmDeal are `sys()` in `scope.ts:60,63`), i.e. tenant + system | before `addActivity` | v1 has no per-user visibility, by design | own contact + deal of another CRM system of the same shop → 0 rows; that deal alone → 0 (V3.1); id with spaces → trimmed, 1 row (V3.2); `completeActivityAction` with shop B's activity id → B untouched (V3.3); `refuseOnV2` still runs first | holds |

No other caller of the v1 `addActivity` exists (`grep`: only `crm/actions.ts:156`). The v2 activity writers are separate (`activities.ts`).

## Findings
| # | sev | where | finding | repro |
|---|---|---|---|---|
| F1 | **HIGH** (already there before this card, also on prod 929c39ce, outside the diff) | `src/app/api/v1/customers/route.ts:11-34` · `src/app/api/v1/ai/tools/[name]/route.ts:34` → `src/lib/ai/skills.ts:340 toolAllowedForApiKey` · tools `recent_leads` (`ai/tools.ts:1860`), `financial_summary` (:1808), `kb_auto_save` (:2272), `remember_fact`/`forget_fact` | The legacy `/api/v1/*` routes ignore key scopes. **Any** API key of the shop works: account-only, scope-less, kanban, and `crm.readonly` keys (which promise masked phones). `/customers` returns member name, phone, e-mail and spend. `toolAllowedForApiKey` lets through every tool outside the account / kanban / member / CRM-registry maps. So `recent_leads` returns CRM leads with full phone numbers (all CRM systems, no team filter, no masking). `kb_auto_save` and `remember_fact` write straight away, with no proposal. Two consequences: (a) S1 closes the account-REST viewer path, but a branch-limited MANAGER with `api.key.create` can still get member and CRM lead PII through any key; (b) the builder note line 42 ("v1 API-key routes … covered by the hotfix reviewer's 100-route sweep") is wrong. The hotfix review (line 313) says "excluded: v1 API-key routes". | `probe-cf8-review` X1.2: a key scoped only `[account.doc.view]`, minted on the account page by a branch-limited MANAGER, gets `GET /api/v1/customers` 200 with the member's phone. X1.3: the same key gets `POST /api/v1/ai/tools/recent_leads` 200 with the CRM lead's phone. X1.4: an account-only key and a scope-less key can both call `recent_leads`, `financial_summary`, `kb_auto_save`, `remember_fact` and `forget_fact`. |
| F2 | LOW | `account/connections-actions.ts:108-124` | A crafted form with no `scope` and no `bundle` still mints a scope-less `[]` ("legacy") key. The account UI never offers this. The platform page `/app/settings/api` (`createKeyAction`, same `api.key.create`) mints only `[]` keys, so this grants nothing new. Its weight comes from F1. Fix: refuse `scopes.length === 0` on the account page. | X1.1 |
| F3 | LOW | `connections-actions.ts:165-182 rotateApiKeyAction` → `connections.ts:391-399 accountManagedKey` → `api-keys/service.ts:212` (copies `scopesJson`) | Rotation accepts any ACCOUNT-bound key whatever its scopes. So an account-bound key with `crm.*`/`member.*` scopes minted before S1 can be renewed from the account page indefinitely, and S1 does not cover it. Fix: refuse rotation (or strip) when scopes ⊄ `ACCOUNT_SCOPE_KEYS`. | read only (no such key in QC) |
| F4 | LOW (impact not verified) | `kanban/settings-actions.ts:53-66 createKanbanApiKeyAction` | A sibling minting door with the same class of gap as S1. It does `expandBundles([bundle])` with no family check. The member door checks `MEMBER_BUNDLE_IDS` (`member/api-actions.ts:67`); the CRM door checks `BUNDLES` + `crmKeyWiderThanCreator`. A holder of `kanban.board.member.manage` + `api.key.create` can mint a KANBAN-bound key carrying `crm.admin` / `member-admin`. CRM REST rejects a key bound to a non-CRM system (`crm/api/config.ts systemType`). I did not verify whether member REST and the scope-only gate of `/api/v1/ai/tools` then run CRM/member tools for it. Fix: a `KANBAN_BUNDLE_IDS` check. | read only |
| F5 | LOW | `account/api/ops/webhooks.ts:165-183` (`webhooks.test`, action `account.settings.manage`) | The REST twin of S2 is still family-blind. It accepts any registered event (`crm.deal.won`, `member.*`) and sends it to any endpoint id of the shop, including CRM-only endpoints. This is milder than the S2 hole because `testEndpoint` marks the call (`test_…` id, `{test:true}` payload). The builder's wording ("accepts only registered events and one named endpoint") is accurate but this door is not account-only. Fix: same `account.` filter as S2. | X2: a branch-limited MANAGER's account key `[account.settings.manage]` sends `crm.deal.won` to a CRM-only endpoint → 200 and one delivery row |
| F6 | INFO | `connections-actions.ts:248` | The fixed path still uses `dispatchWebhooks` (every active endpoint subscribed to that event or to "all events", with a real-looking `evt_` id and `{test:true, at}`), not the clicked row's endpoint. The button is on a row but tests every matching endpoint. Already the behaviour before this card. Consider `testEndpoint(id)` as REST does. | V2.2 |
| F7 | INFO | `ConnectionsPanel.tsx:691`, page `connections/page.tsx:112-118` | S2 regression check: the page lists every endpoint of the shop. For an endpoint whose first event is not an account event, the button now answers "ยิงทดสอบได้เฉพาะเหตุการณ์ของระบบบัญชี". Before the fix it answered "ยังไม่มีปลายทาง…": the label was dispatched as a literal type, so the button never worked for such rows either. No working flow is lost; account rows now work (the label bug is fixed). | V2.2, builder A2.2 |
| F8 | INFO | `crm/service.ts:113-117` | S3 accepts an archived contact of the same system. v1 never filtered archived contacts, so this is not a leak. The comment's "same as v2 logActivity (visible)" means tenant + system only here; v1 has no visibility model. | V3.2 |
| F9 | LOW (note accuracy) | builder note line 42 | See F1(b). | — |

No BLOCKER. No regression found: the OWNER can still tick the whole `ACCOUNT_SCOPE_KEYS` list (35) (R3). Every bundle the account page offers (read-only, issue-and-collect, accountant, danger, settings) ⊆ `ACCOUNT_SCOPE_KEYS`, so the default bundle-only submit still works (R1). STAFF with `ai.*` and branch-limited MANAGER keep the mobile doors (V4).

### Mobile app (source `apps/mobile`, read only)
- `src/api/client.ts`: a 403 only throws `ApiError`. There is no global logout or redirect.
- `QuotaBar.tsx:45` catches the error and renders nothing.
- `app/(app)/index.tsx:39-56 openAssistant` catches it and goes to `/sessions`. That list is itself gated since the hotfix, so a key-less STAFF sees the existing "ไม่มีสิทธิ์เข้าถึงกิจการนี้" text, the same as before this card (wording is misleading; pre-existing).
- `chat/[id].tsx:67-82 loadProposals` swallows the error.
- Nobody rightly permitted loses anything.

### Existing keys with crm.* / member.* scopes minted on the account page
- Nothing re-checks a key's scopes when it is used, so any such key keeps working. Through F3 it can also be rotated.
- None exist on session/crm QC (the probes sweep their tenants).
- Prod could only hold one if someone hand-built the form. Prod has the same action, but there account REST passes no viewer (`contacts-read.ts:104` at 929c39ce).

**OWNER QUESTION:** allow one read-only query on prod (ApiKey rows bound to an ACCOUNT system with any scope not starting with `account.`)? Revoke any found?

## S4 — judgement
- **Confirmed, MED, on prod too.**
  - `contact-profile.ts:602` calls `findCustomerByPartyId` (`member/service.ts:482`) with no viewer. Every holder of `account.contact.manage` (web) or of an account key with the profile op (REST `contacts-read.ts:106`) sees the member's code and tier.
  - The **POS card** (`contact-profile.ts:650`) shows that same row's visit count and total spend, so it must be hidden as well.
  - Two more siblings have the same gap and should go into the same card: `listPartyIdsWithCustomer` (`member/service.ts:445`, the "member" badge in the account contact list) and `findMemberCodesByPartyIds` (`:462`, the merge page).
  - Their CRM twins (`listPartyIdsWithContact`, `findContactByPartyId`) already take a viewer and fail closed.
- **The ORACLE-EDIT is legitimate.**
  - Q7.5 (`scripts/qc-acc-v2-contact-profile.mts:214`) loads the profile through `load()` (`:100-101`) with **no viewer**, then asserts that the member card is linked and shows details.
  - That means it asserts the leaky behaviour: a caller with no member rights sees member data.
  - Edit: give `load()` an OWNER `MemberActor` viewer, so Q7.5 stays green for a rightly-permitted viewer. Add a negative check Q7.5b: with no viewer, and with STAFF without `member.customer.read`, the member card is `linked=false` / `detail=null` and the POS card's `detail=null`.
- **Fix shape:**
  - `findCustomerByPartyId(tenantId, memberSystemId, partyId, viewer: MemberLinkViewer)`: fail closed on `undefined`/`null`; for an actor, filter through `visibleCustomerIds` (`canReadMember` + branch `briefFor`), exactly like `findCustomersForLink`.
  - `loadConnections` passes the same actor it already receives as `crmViewer` (rename it to a link viewer).
  - REST passes a member viewer built from the key's scopes (the counterpart of `crmViewerOfApi`).
  - Callers: `account/contacts/[contactId]/page.tsx:14`, `account/actions.ts:799`, `account/api/ops/contacts-read.ts:106`.
- Run it on QC1 (acc-v2 seed).

## G1 — judgement
**Confirmed, HIGH, on prod too.**
- `ToolCtx` (`ai/tools.ts:35`) carries only `tenantId`/`conversationId`/`systemId`, and `runTool` (`:2381`) never sees the caller.
- **Concrete case (session):** a cashier STAFF is given `ai.chat.send` only, so they can use the assistant. They ask "มีลูกค้ามุ่งหวังใหม่ไหม". They get up to 50 of the newest CRM leads with **full phone numbers** across every CRM system, even though they hold no `crm.contact.read` and CRM visibility is set to own-records.
  - "เดือนนี้กำไรเท่าไหร่" returns revenue and expenses with no account key.
  - "จำไว้ว่า…" writes shop AI memory.
  - `kb_auto_save` writes KB articles without `kb.article.create`.
- **Concrete case (REST, = F1):** any third party holding any key of the shop (for example the accounting firm's account-only key) gets the same, with no membership at all.
- **Fix:** pass the caller (MemberActor or API actor) into `runTool`, give each tool a permission key and the module's visibility filter, and deny unmapped tools to scoped keys. This touches every AI entry, so it needs its own card. F1's `/api/v1/customers` part can ship separately and quickly.

## Owner decisions D1–D11, ranked (first = closest to "a clear bug with an obvious door rule")
1. **D11 (MED).** Here the twin door is *stricter*, not permissive.
   - The member webhook door requires `member.api.manage` (`member/api-actions.ts:138`). The platform page (`webhooks/actions.ts:52`) and the account page need only `webhook.endpoint.create` to receive `member.*` (explicitly, or through "empty = all"), plus `chat.*`/`kanban.*`.
   - Only the `crm` family is registered (`webhooks/labels.ts:128`, `webhook-guards.ts`), so adding a `member` guard is mechanical.
   - The part that matters more is S8: a holder of `webhook.endpoint.delete`/`update` can delete or disable CRM- and member-owned integration endpoints. Only re-enabling runs the guard.
   - Data exposure is low: `member.created` carries `customerId/partyId/source/referrerId`; chat events carry ids.
   - The card's own rule says this should be fixed. Deferring it is defensible only because fix3a recorded the "empty = all, central guard decides" ruling.
2. **D3 (MED-LOW).** `interviewTurnAction` spends AI credit with no key. Every other credit-spending door requires `ai.chat.send`, so that is the obvious minimum. DNA facts also feed the AI context and the blueprint.
3. **D5 (MED, policy).** A branch-limited MANAGER can change the shop-wide PromptPay ID, which redirects customer payments. The hotfix already ruled on it; it is the highest-impact item but a trust decision.
4. **D2 (LOW).**
   - After W1, a key-less member can no longer list proposal ids, so exposure is small.
   - Requiring at least `ai.chat.send` (the same key as the listing) on web and mobile reject is an obvious alignment. The C3.4 per-kind rule is the full fix.
   - The builder's I.1/I.2 evidence was reproduced here (200, row REJECTED).
5. **D9 (LOW).** A read key (`crm.email.read`) performs a write (message link + EMAIL activity). Every other CRM e-mail write needs send/settings, so `crm.email.send` is the obvious rule.
6. **D8.** Board-rule toggles without board ADMIN, and webhook URLs listed to every member. Policy plus SSRF, which belongs in its own card.
7. **D6.** Template install and DNA apply both create systems but need different keys.
8. **D1.** AI memory writes happen by persona design. The real gap is G1/F1, not D1.
9. **D10.** Own notification preferences: no data at stake.
10. **D7.** Low-value member-only doors.
11. **D4.** Push token re-bind: needs an app change, low value.

## What I ran (QC3 via `scripts/qc3.sh`, each heavy job through `scripts/iso.sh` + `scripts/with-gate-lock.sh`, one at a time; logs `/tmp/cf8-review-logs/`)
| run | result |
|---|---|
| `scripts/pending/cf8/review/probe-cf8-review.mts` (new) | 19/19. 11 VERIFY/REGRESSION checks green: R1 R2 R3 V1.1 V1.2 V2.1 V2.2 V3.1 V3.2 V3.3 V4. 5 REPRO checks green, meaning the findings reproduced: X1.1 X1.2 X1.3 X1.4 X2. 3 CLEAN (0 rows left). |
| builder `probe-cf8-mobile.mts` · `probe-cf8-actions.mts` | 8/8 · 9/9 (INFO I.1/I.2 = D2 evidence) |
| `pnpm typecheck` (5 GB heap) | exit 0 |
| `qc-crm-v1` | 17/17 |
| `fitness` (QC3 env) | 39/39 |

The QC3 log shows `account_jno_ensure_system … does not exist` warnings at account setup. That is environment noise from this QC branch, not related to the card.

## Not verified
- F4: what a KANBAN-bound key with `crm.admin`/`member-admin` scopes reaches through member REST and `/api/v1/ai/tools` (read only).
- F3: no account-bound key with foreign scopes exists in QC to rotate (read only).
- S4 fix and oracle edit: not run (need the acc-v2 seed on QC1).
- Suites that load `.env.local` (`qc-mobile-chat`, `qc-ai-usage`, `qc-acc-v2-security`, `qc-crm-activity`, `qc-crm`, `qc-webhook`) were not run.
- Mobile app: source read only, no device run.
- No built app or browser. Server actions were exercised under a forged Next request scope, the same technique the builder used.
- Prod key inventory (owner question above).
- Payloads of member/chat events beyond `member.created` and `chat.message.received`.

VERDICT: MERGEABLE
