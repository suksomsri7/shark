# CRM C5.5-G2 — independent review (AI conversations belong to their creator)

Branch `wip/crm-cf14` · tip `791b25e2` (code `8c4a8a0b`) · base `be9c9658`. Reviewed 2026-10-02, runs finished 03:43 UTC (`date -u`).

I read:
- the builder note `ledger/wo-notes/crm-C5.5-G2.md`;
- `git diff be9c9658 791b25e2`, all 36 files;
- every reader and writer of `AiConversation`, `AiMessage`, `AiProposal` and `AiPlan` in `src/`;
- the account-deletion flow, the platform support reply and push, and the shop memory.

## What I ran (QC3 only · every heavy job through `iso.sh` + `with-gate-lock.sh`, one at a time)

| run | result |
|---|---|
| builder `probe-cf14-g2` | **34/34** |
| own `scripts/pending/cf14/review/probe-cf14-g2-review.mts` | **13/14** — the one red is X7.1, the open shop-memory finding (F1.1, by design not in this card) · CLEAN 0 rows, 0 users (2 tenants) |
| `probe-cf9-g1` · `probe-cf9-g1-r2` · my `probe-cf9-g1-review` · my `probe-cf9-g1-review-r2` | 47/47 · 18/18 · **18/18** (R1.1–R1.3 = the old F1, now green) · 14/14 |
| `pnpm typecheck` (5 GB heap, own probe included) | exit 0 |
| fitness (QC3 env) · fitness (no env) | **39/39 · 39/39** — so the builder's `--no-verify` commits pass the gate |

## Attack (a) — the id-encoding scheme

- **Client-chosen ids.**
  - Every create path calls `newConversationId(ctx)`:
    - `sendMessage` (`service.ts:195`)
    - mobile `createConversation`
    - mobile welcome (`welcome/route.ts:65`)
    - the REST tools route (`route.ts:78`)
  - No `upsert`, `connectOrCreate` or seed path for AI conversations exists in `src/`.
  - `support.ts:98` only updates an existing room.
  - `AiProposal`/`AiPlan` have no FK, and they get a `conversationId` only from a room the caller can see:
    - the tool wrapper drops a room the actor cannot see (`tools.ts:2399`);
    - REST demands a room this key created;
    - CRM-door proposals use pseudo ids that are never real rooms, and the CRM door intercepts them first.
  - Own X2.1–X2.3:
    - `sendMessage` with an owner-shaped id that does not exist, or with the OWNER's real id → a new STAFF room; no owner-shaped row is created.
    - Mobile `POST /conversations` with `{id: …}` in the body → ignored.
    - REST: another key's room, a key-shaped fake id and a missing id all get **404 with a byte-identical body**.
- **LIKE wildcards.**
  - Prisma's `startsWith` is **not escaped** (X1.0: `startsWith("u~a_c~")` matched `u~aXc~…`).
  - It is safe because every reader re-checks rows exactly in JS with `canSeeConversationId`, or checks the exact id before the query:
    - `findVisibleConversation`, `latestVisibleConversation`, `listConversations`, welcome, `listMessages`, the `sendMessage` history;
    - proposals/plans list, reject and confirm.
  - X1.1: viewers with user ids `a_c`, `abc`, `a%`, `%`, `_` and `a` see only their exact prefix, in both the list and the latest room.
  - Prefix confusion `u~abc~` vs `u~abcd~` is closed by the trailing `~`. User ids, key ids and job names live in separate namespaces (`u`/`k`/`s`).
  - A `~` inside an id gives no prefix, so no room can be created (X1.2).
  - Counts and pagination could under-return only if real ids contained `_`/`%`. cuids never do, so this is INFO (finding G2-6).
- **Tenancy and role changes.**
  - Every query goes through `tenantDb`. The same user who is OWNER of shop B and STAFF of shop A cannot list or read the B room from A (X3.1).
  - An OWNER demoted to STAFF keeps their own rooms and loses the OWNER-only extras: legacy, key and scheduled rooms (X3.2).
  - A member removed and then re-added with the same `userId` gets their old rooms back. Acceptable: same person.
- **Id format.**
  - Length ≤ ~60 chars in a `text` column. FKs (`AiMessage` → `AiConversation`) are unaffected.
  - `~` is an unreserved URI character, so Next `[id]` segments, `?conversation=`, expo routes and push `data` handle it unencoded.
  - The `userId` inside the id is a pseudonymous cuid that already sits in many tables (see G2-3 for erasure).

## Attack (b) — completeness

Readers and writers by `grep prisma.ai*` / `tx.ai*`:

| path | why it is fine |
|---|---|
| `onboarding-drip` | count only |
| `cron.ts:147` | expires proposals by status |
| CRM `ai-bridges` / `calls` | own door, pseudo ids, unchanged |
| `crm/privacy.ts` | masks erased tokens across all rows, as intended |
| `member/assistant.ts` `appendToolsLine` | uses the conversation id returned by `sendMessage`, so a room the caller sees |
| `mobile/chat.ts` (lastRead / autoTitle) | uses the id returned by `sendMessage`, so a room the caller sees |
| AI feedback | stores only the text the client sends; reads nothing |

All other doors are in the builder's table and are filtered. No export or search door exists for AI conversations.

## Attack (c) — proposals and plans

- Confirm and reject on every door now require the confirmer to see the room:
  - web `actions.ts:160/194`
  - mobile confirm/reject
  - member assistant (it also passes `userId`)
- `executeProposal` without a `userId` refuses non-OWNERs (X4.3).
- **API key proposes, OWNER confirms** still works. A MANAGER sees 0 key proposals and gets "not found" on confirm. A STAFF holding the confirm key is refused too. The row stays PENDING (X4.1).
- An OWNER confirming a key proposal they did not expect is the documented design (an owner-visible room titled "คำขอจากผู้ช่วยภายนอก" with a confirm card). It is not new.
- **Side benefit:** a non-viewer confirming a plan no longer burns it. The visibility check runs before the PENDING→RUNNING claim, so the plan stays PENDING (X4.2; closes G1-builder R5 for other people's plans).
- CRM-door proposals (C3.4) are untouched: the CRM branch runs before the new check (qc-crm-c3.4 53/53 per builder; my probes do not touch it).

## Attack (d) — shop memory (F1.1) and the remaining channels

- **Confirmed, X7.1 ❌.** An OWNER turn stores a phone number from a tool result with `remember_fact`. That phone then shows up in the STAFF member's **system prompt** and in their `list_memories` output.
- **Same class:** `kb_auto_save` by the OWNER's model puts a phone into a KB article that every member reads through `kb_search` (X7.2). The KB is shop-readable by design, and the writer needs `kb.article.create`.
- Other cross-user surfaces I checked, all already there before this card:
  - Support cases are listed shop-wide (`support/service.ts:123`), and their body is model-written.
  - `support.ts:109` pushes the platform team's reply (80 chars) to every device in the shop.
  - Proactive and scheduled pushes contain shop-wide figures or least-privileged output, not one member's tool results.
- **Rating: MED.**
  - It needs the model to decide to store personal data. `remember_fact`'s description encourages it ("names of regular customers").
  - After G1 + G2 it is the **last automatic channel** carrying one member's tool-derived personal data to other members.
- **Minimum safe change without a schema change.**
  1. Now: `remember_fact` refuses or masks contact-data patterns (Thai mobile/landline, e-mail, 13-digit ID) — a few lines in `memory.ts` or the tool.
  2. Next card: give memory the same id trick. `AiMemory.id` is minted by the server (`memory.ts:40`), so use `u~<userId>~…` for a member's memories. `memoryBlock` / `list_memories` then show the member's own memories plus shop facts (legacy ids, and memories written by an OWNER). `forget_fact` only deletes what the caller can see.
- Option 1 is a 1-hour change and could ride on this card. Neither needs to **block** this card: the channel is narrower than F1 was, and memory being shared by the shop was the owner's decision D1. Make it the **next card**, with option 1 now if the owner agrees (Q1).

## Attack (e) — legitimate use

- Every member's own flow works:
  - builder W2.1 / S2.2 / M2.1 / A2.1
  - OWNER on own + legacy rooms: W2.4 / W2.5 / S2.1 / M2.2 / M2.3
  - a key continuing its own room: K1.4
  - scheduled-task rooms visible to the OWNER: Y1.1
- Losses to tell the owner about:
  - STAFF and MANAGER lose their pre-deploy history (legacy rooms become OWNER-only).
  - REST integrations that resend an old `conversationId` get 404.
  - A rotated API key gets a new id, so it can no longer continue rooms created by the old key (404).
  - A MANAGER can no longer confirm key proposals.
- **Stale app screen:** each send with someone else's (or a legacy) id opens a new room for the sender. 3 sends → 3 rooms (X6.1). Nothing is written into the other room (X6.2), so data is safe; the cost is UX and clutter (G2-4).

## Attack (f) — the 8 ORACLE-EDITs

All minimal and marked. The ones that run add the viewer, or move a positive control onto a room the actor can now see:
- `qc-mobile-authz-hotfix` (fixture room created through the real route by its STAFF; delete by its creator)
- `qc-account-api-ai-skill` K3.4 (accepts the earlier "not found" refusal; still asserts refused + PENDING)
- builder G1 probe (per-actor rooms)
- `probe-cf8-mobile` W1.2 / W3.2 (now expect the new visibility)

`qc-ai`, `qc-ai-proposals`, `qc-mobile-chat` and `qc-mobile-help` load `.env.local` and were not run (by the builder or by me). No expected value was weakened beyond the new rule.

## Findings

| # | sev | where | finding | evidence / fix |
|---|---|---|---|---|
| G2-1 | **MED** (open, not this card — owner D1) | `ai/memory.ts` · `service.ts` `memoryBlock` · tools `remember_fact` / `list_memories` | Shop memory carries one member's tool-derived personal data into every member's system prompt. `kb_auto_save` → `kb_search` is the same class. | X7.1 ❌ · X7.2 · fix: see (d) |
| G2-2 | LOW (existed before; follow-up the builder listed) | `platform/support.ts:109` `sendPushToTenant` | The platform team's reply (80 chars) and the room id are pushed to every device in the shop, though only the room's creator can open it. | Send only to the creator: decode `u~<userId>~` and use `sendPushToUser`; the OWNER for non-member rooms. |
| G2-3 | LOW | `platform/account-deletion.ts:80-99` | Deleting an account leaves that user's `u~<id>~` rooms in every shop. They are now invisible to everyone, including the new OWNER, but keep the messages and tool results, with the deleted user's id in the primary key. Before G2 they were shop-visible. Retention without a door is safe, but under PDPA erasure they should go. | `deleteAccount`: soft-delete and blank the content of `u~<userId>~%` rooms per tenant (or hand them to the OWNER, as tenant handover does) — owner decision. |
| G2-4 | LOW (UX) | `apps/mobile` chat screen ignores `result.conversationId` | A stale or deep-linked screen opens a new room on every send (X6.1). | App: adopt the returned id after the first reply. |
| G2-5 | LOW | `conversations.ts` `latestVisibleConversation` | The OWNER's web sheet opens the newest visible room, which can be a key or scheduled room rather than the OWNER's own chat (builder Q5). | Prefer the latest own `u~` room; fall back to the extras. |
| G2-6 | INFO | `conversation-owner.ts` `visibleConversationWhere` | Prisma `startsWith` does not escape `_`/`%` (X1.0). Safe thanks to the JS re-check, but `take: 10/100` could under-return if ids ever contained wildcards. | Escape the prefix, or compare `left(id, n)` in SQL. |
| G2-7 | INFO | behaviour | Visible consequences for the owner: OWNER demotion drops the extras. Key rotation orphans the old key's rooms for REST (OWNER still sees them). STAFF/MANAGER lose pre-deploy history. MANAGERs cannot confirm key proposals. | Release note. |

Nothing at BLOCKER or HIGH. G1 review F1 is **closed** (R1.1–R1.3 green unedited; builder W/M/S/A/K sets green).

## Recommendations on the builder's owner questions

- **Q1 memory.** Next card. In it, member memories are private through `u~` ids, and shop facts = OWNER-written plus legacy memories. Before that, ideally with this release: a contact-data pattern guard in `remember_fact`, and a sentence in the persona: "do not remember customer contact data". Do not block G2.
- **Q2 confirm limited to the room's viewers.** Keep. "STAFF drafts, manager approves" belongs in the approval module.
- **Q3 key proposals OWNER-only.** Keep for now. `ApiKey.createdById` exists (`api.prisma`), so a later option is "OWNER + the key's creator". Do not open them to all MANAGERs.
- **Q4 legacy rooms OWNER-only, STAFF lose history.** Acceptable — those rooms mixed everyone's rights, so no safe backfill exists. Announce it in the release note together with the REST 404 for old conversation ids.
- **Q5 scheduled rooms visible to the OWNER.** Keep, with G2-5 so they do not take over the OWNER's web sheet.

## Prod and merge notes

- Agree with the builder: ship G1 and G2 together. Prod has neither.
- The `shark-hf` overlap is only the import block of the REST tools route.

## Not verified

- Suites that load `.env.local`, including 4 of the ORACLE-EDITed ones.
- The mobile app on a device.
- A production build.
- Production-size query timings.
- A tree merged with `shark-hf`.
- The builder's full `run-verify.sh`. I re-ran its G2 probe, the cf9 probes, typecheck and both fitness modes.

VERDICT: MERGEABLE
