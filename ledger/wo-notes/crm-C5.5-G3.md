# CRM C5.5-G3 — AI memory belongs to its writer · contact-data guard · support push · OWNER latest room · LIKE escape (builder note)

- Branch `wip/crm-cf17` from `608204d3` (G2 + its review). Code commit `230e0a17`; this note goes in the next commit.
- Inputs: the G2 review (`crm-C5.5-G2-review.md`) items G2-1 (MED), G2-2, G2-5 and G2-6.
- Not done, as the brief says: G2-3, G2-4, and "OWNER plus the key's creator may confirm".
- Commits went through the normal pre-commit hook (fitness green).

## 1. Shop memory (G2-1)

### Storage: the writer is embedded in the memory id (no schema change)

`AiMemory.id` is minted by the server in `rememberFact`. It now uses the same creator rule module as conversations: `src/lib/ai/conversation-owner.ts` (nothing duplicated). One extra tag is added:

| id | written by | who sees it (prompt + `list_memories`) | who can `forget_fact` it |
|---|---|---|---|
| `o~<userId>~<rand>` | a member whose role is **OWNER** when writing → **shop fact** | every viewer of the shop (members, the shop's API key, the scheduled job) | its writer · any OWNER |
| `u~<userId>~<rand>` | any other member → **private** | that user only | that user only |
| `k~<keyId>~…` / `s~<job>~…` | an API key / an internal job | OWNER (+ the writer itself) | writer · OWNER |
| plain cuid (legacy, before this card) | unknown → **shop fact** as before | everyone, **except** rows containing contact data, which only OWNERs see | OWNER |

Notes on the rule:
- **Keys.** API keys cannot write memories: G1 refuses `remember_fact` to every key. So `k~` exists only for completeness.
- **The scheduled job can write memories.** Probe M5.1 shows `remember_fact` is allowed to it. Its memories are OWNER-only.
- **Roles and tenants.**
  - A demoted OWNER keeps their earlier shop facts shared; what they write afterwards is private (M3.1).
  - A promoted member's earlier private notes stay private.
  - The same user in two shops: everything is tenant-scoped (`tenantDb`), so nothing crosses shops (M3.2).
- **Prompt assembly uses the same filter.** `service.ts` passes the actor to `memoryBlock`, so the check runs in the loader. `memoryBlock` reuses `listMemories`, which applies:
  - a LIKE pre-filter: `visibleMemoryWhere`;
  - an exact JS re-check of every row: `canSeeMemory`, which also runs the contact-data check for legacy rows.
- **Deduplication and caps are per set.**
  - Remembering the same text again touches the existing row of the same set.
  - Caps: 100 shop facts per shop, and 100 private notes per member. Before: 100 per shop in total, which one STAFF member could have filled.
- **`list_memories` output.** Each row now carries `ขอบเขต: ร้าน / ส่วนตัว / ระบบ` (shop / private / system).
- **`remember_fact` replies** state the scope: shop memory or private memory.
- **The `remember_fact` description** no longer suggests "names of regular customers". It now says contact data must not go into shop facts.

### Contact-data guard (`src/lib/ai/contact-data.ts`, pure, linear)

Where it applies:
- `remember_fact` refuses when the memory would be **shared** (writer is an OWNER).
- `kb_auto_save` always refuses: the KB is shop-readable by design.
- Private memories may contain contact data.
- The refusal is a short Thai sentence the model can relay. It names the kind found and says "keep contact data in the member system or CRM".

What the scanner detects (it walks the string once; there is no regex backtracking):
- **E-mail:** via `core/linear-text.replaceEmailsInText`, the existing linear helper.
- **Digits:** ASCII and Thai `๐–๙` digits form groups. Up to 2 separators (`␠ - . ( )` or nbsp) may join groups. Every contiguous span of groups up to 15 digits is checked, so the cost per group is constant:
  - Thai mobile: 10 digits starting `06`–`09`.
  - Thai landline: 9 digits starting `02`–`07`.
  - International: `+` followed by 8–15 digits, `00…` with 10–15 digits, or `66` + 8–9 digits.
  - Thai ID: 13 digits with a valid mod-11 checksum and a first digit 1–8.
- **Verified as refused (M1.2, 11/11):**
  - `089-900-0102` · `089 900 0103` · `๐๘๙๙๐๐๐๑๐๔`
  - `+66 89 900 0105` · `+66899000106`
  - `02-123-4567` · `(02) 123 4568` · `โทร.0899000107`
  - an e-mail
  - a checksum-valid 13-digit Thai ID, plain and in `1-2345-67890-12-3` form
- **False-positive controls that must still be remembered (M1.3, 8/8, and they reach the STAFF prompt):**
  - `SO-2026-0001` · `INV-20261002-0042`
  - `1,250.50 บาท` · `125000 บาท`
  - `09:00-18:00` · `02/10/2026` · `2026-10-02`
  - an EAN-13 barcode
- **Known limits:**
  - A document code that is a bare 9- or 10-digit number starting with `0` is treated as a phone.
  - About 1 in 10 random 13-digit numbers passes the Thai-ID checksum.
  - Phone numbers written as words are not caught.

### Legacy shared memories that already contain contact data

- Nothing is deleted.
- At read time, `canSeeMemory` hides a legacy row from every non-OWNER viewer when `findContactData(content)` is non-empty. This covers both the prompt and `list_memories` (M4.1). OWNERs still see the row (M4.2) and can forget it (M4.3).
- **Count logic for prod:** count the rows of `AiMemory` whose `id` has no `~` (all prod rows at deploy) and for which `findContactData(content).length > 0`. Group by `tenantId`. This is a read-only scan through the same function. **Not run** — prod is out of scope.

## 2. Support reply push (G2-2)

- **Before:** `platform/support.ts` used `sendPushToTenant`. Every device of the shop received the push, and its body carried **80 characters of the platform team's reply** plus the room id.
  - That reply text is content. Lock screens of members who cannot open the room showed it. **That was a leak** of reply text (the support case itself is listed shop-wide in the support page, so the exposure is the lock screen and the push data).
- **Now:** `sendPushToUsers(tenantId, recipients)`. Recipients follow the room-visibility rule:
  - a member room → its creator, if still an accepted member of the shop;
  - a legacy, key or scheduled room → the shop's accepted OWNERs.
- The payload is unchanged (title, 80-char body, `conversationId`); it now only reaches people who can open the room.
- Probe P1.1: STAFF A's room → 1 device, A's. Probe P1.2: legacy room → the OWNER's device only. Expo requests were captured.

## 3. OWNER's web sheet — latest room (G2-5)

- `latestVisibleConversation` now returns the **caller's own** latest room only.
  - No room of their own → `null`, and the web opens a new room (L1.2).
  - Key and scheduled rooms no longer take over the OWNER's sheet (L1.1).
- Key, legacy and scheduled rooms stay reachable:
  - from the app's room list, unchanged;
  - by id: proposals list and confirm (L1.2: the key room's card is still listed by id).
- **Consequence:** the web has no room list. So an OWNER on the web no longer lands on a key's confirm card or on legacy history; those are app-only now. See owner question Q1.

## 4. LIKE escape (G2-6)

- `likePrefix()` in `conversation-owner.ts` escapes `\ % _` with `\`, Postgres's default LIKE escape. It is used by every `startsWith` creator prefix (conversations and memories).
- E1.1: a user id containing `_` gets only its own rooms back from the **database filter**, with no JS re-check. On 608204d3 the filter returned the near id too.
- `likeStartsWith` (another card) is not on this branch. **Unify later** — the comment at `likePrefix` says so.

## Probe RED → GREEN

`scripts/pending/cf17/probe-cf17-g3.mts`: real tools via `runTool`, the real prompt via `sendMessage` with a model that echoes its system prompt, the web action under a session cookie, the REST tools route with a real key, and `addPlatformMessage` with Expo calls captured. QC3, two throwaway tenants, swept.

- **RED on 608204d3 (src checked out temporarily, then restored): 7/23.**
  - Red: M1.1 (= review X7.1) · M1.2 · M2.2 · M2.3 · M3.1 · M3.2 · M4.1 · M4.3 · M4.4 · M5.1 · K1.1 · P1.1 · P1.2 · L1.1 · L1.2 · E1.1.
  - M4.4 on base is a cascade: STAFF B had already deleted A's note.
  - Logs: `/tmp/cf17-logs/red2.log` (first RED with the earlier L1.2 fixture: `red1.log`, 7/23).
- **GREEN: 23/23** (`green2.log`).
  - Positive controls: M1.3, M2.1, M4.2, M4.4, K1.2, L1.1. Each member's own memory flow is unchanged, and OWNER shop facts still reach everyone.

## Verification (QC3 · iso.sh + gate lock · one at a time · runner `scripts/pending/cf17/run-verify.sh` → `/tmp/cf17-logs/v1.summary`)

| check | this card (230e0a17) | 608204d3 |
|---|---|---|
| `pnpm typecheck` (5 GB heap) | exit 0 | — |
| probe-cf17-g3 (own) | **23/23** | 7/23 |
| reviewer probe-cf14-g2-review (not edited) | **14/14 — X7.1 flipped** | 13/14 (X7.1) |
| probe-cf14-g2 | 34/34 | 34/34 |
| probe-cf9-g1 · -r2 · review · review-r2 | 47/47 · 18/18 · 18/18 · 14/14 | same (G2 review) |
| probe-cf8-mobile · -actions · -review | 8/8 · 9/9 · 18/19 (X1.3) | same; X1.3 red at be9c9658 too (G2 base run — G1 by design) |
| qc-mobile-authz-hotfix · qc-ai-automation · qc-crm-c3.4 | 12/12 · 4/4 · 53/53 | same (G2) |
| qc-automation-authz-hotfix · qc-payment-authz-hotfix · qc-member-fix-s1 | 12/12 · 8/8 · 28/28 | same (G2) |
| qc-account-api-ai-skill | 23/33 — the same ten ids (acc-v2 seed) | 23/33, same ids (G2 base run) |
| qc-member-m3.10 | 6/21 — the same 15 ids (env) | 6/21, same ids (G2 base run) |
| gen-{crm,member,kanban,account}-api-docs --check | exit 0 ×4 (123 · 212 · 88 · 199 op), no tracked change | — |
| fitness (QC3 env) · fitness (no env) · pre-commit hook | 39/39 · 39/39 · pass | — |

## ORACLE-EDIT

| script | why | edit |
|---|---|---|
| `scripts/qc-ai-memory.mts` | memory functions take the viewer; with no actor they refuse (no creator) | `ctx` = the OWNER actor (`qcOwner`, already in the file); the other-shop check uses that shop's OWNER. Not run (loads `.env.local`). |

These were not edited because they still pass under the new rule:
- `probe-cf9-g1` P5.1: STAFF remembers and lists its own note → private, still listed.
- reviewer `probe-cf9-g1-review` R1.4 and `probe-cf14-g2` F1.1: info lines only; they now read `false`.
- reviewer `probe-cf14-g2-review` X7.1: not edited; it flips green.

## G2-3 — what remains after an account is deleted (documented only, owner/PDPA decision)

`deleteAccount` (`src/lib/platform/account-deletion.ts:80-99`) hands over or queues shops and deletes the `User`; Membership and Session cascade. It does **not** touch, in every shop where the user chatted:
- `AiConversation` rows `u~<userId>~…`: title, timestamps.
- Their `AiMessage` rows: every turn, including tool-derived answers.
- `AiProposal` / `AiPlan` rows in those rooms: summary and payload.
- `SupportCase.conversationId` / `AiFeedback.conversationId` / `AiCreditTxn.conversationId` references to those room ids.
- **New with this card:** `AiMemory`.
  - `u~<userId>~…` private memories: invisible to everyone after deletion.
  - `o~<userId>~…` shop facts: still shared; they are shop knowledge and passed the contact-data guard.

The deleted user's id stays inside those primary keys. Nobody can read the `u~` rows any more: no member has that userId, and the OWNER extras exclude `u~`. Erasing or blanking them per tenant is the open owner/PDPA decision.

## Prod notes (prod main 929c39ce)

- Prod has none of G1/G2/G3. G3 builds on G2's rule module and on G1's actor (`memoryBlock` and the memory tools take the actor). Ship G1 + G2 + G3 together.
- **At deploy:**
  - Every existing memory is legacy, so it stays shared. Legacy rows with contact data immediately disappear from non-OWNER prompts and lists (not deleted).
  - New memories written by non-OWNERs become private.
  - New shop facts and AI-written KB articles with contact data are refused.
- Support pushes stop reaching non-readers.
- The OWNER's web sheet opens their own latest room, or a new one. Legacy history and key cards are app-only on the web side.

## Owner questions

- **Q1.** The web has no room list. After G2-5, an OWNER on the web cannot reach a key's confirm card or legacy history; only the app can. Is that acceptable, or should the web get a small "requests from external assistants" list / room list?
- **Q2.** Everything an OWNER asks the assistant to remember becomes a shop fact; an OWNER has no private notes. Keep?
- **Q3.** The scheduled job may call `remember_fact` (OWNER-only result). Should it be refused instead?
- **Q4.** Guard false positives: a bare 9–10-digit code starting with `0`, and checksum-colliding 13-digit codes, are refused as shop facts or KB. Acceptable for this release?
- **Q5.** The KB proposal twin (`kb_create_article` confirmed by a human) is not guarded. Human-confirmed — keep?
- **Q6 (G2-3).** Erase or blank a deleted account's `u~` rooms and private memories?

## Not verified

- `qc-ai-memory`, `qc-kb-auto` and other suites that load `.env.local`.
- Prod data: the legacy contact-data count above.
- A real Expo delivery: only the requests were captured.
- The mobile app.
- A merged tree with `shark-hf` or with the branch that owns `likeStartsWith`.
