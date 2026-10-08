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

## Round 2 (review `crm-C5.5-G3-review.md` · RV-1, RV-2 · RV-3/RV-4 are owner questions, not touched) — 2026-10-02 06:02 UTC (`date -u`)

| finding | change |
|---|---|
| RV-1 LOW | `contact-data.ts`: digits also = full-width `０–９` (U+FF10–FF19) and Arabic-Indic `٠–٩` (U+0660–0669) · separators also = `/`, U+2010–U+2015 (‐ ‑ ‒ – — ―), U+2212 −, thin / narrow nbsp / full-width space, full-width `－ ． （ ） ／` · plus also `＋` (U+FF0B). Still one linear pass (`switch` + range test, no regex); the reviewer's 2.2 M-char adversarial input runs in 196 ms (G1.3, 10× input ≈ 9× time). |
| RV-2 LOW | `tools.ts` `kb_auto_save`: the guard scans every free-text field it stores — `title`, `content` **and `category`** (joined with newlines, which are not separators, so digits cannot merge across fields). |

Why `/` and dashes do not turn dates / ranges into phones: a span becomes a phone only as exactly 10 digits `0[6-9]…`, 9 digits `0[2-7]…`, `00`+10–15, `66`+8–9, `+`/`＋`+8–15, or a checksum-valid 13-digit ID — slash dates (`1/10/2026`, `02/10/2026` = 7–8 digits), date ranges (`01/10/2026–05/10/2026`: every contiguous span ≤ 15 digits checked, none matches), price lists (`100/150/200`), dash ranges (`1,500–2,000`, `0.5–1.5`, `09.00–18.00`) never form those shapes.

Probe `scripts/pending/cf17/probe-cf17-g3.mts` extended:
- M1.4 — OWNER shop fact with en dash, em dash, minus sign, U+2010 hyphen, slash, full-width digits, full-width plus → refused (7 cases, 0 rows).
- M1.5 — round-2 false-positive controls remembered and in the STAFF prompt: `1/10/2026` · `01/10/2026–05/10/2026` · `1,500–2,000 บาท` · `100/150/200 บาท` · `0.5–1.5 กก.` · `09.00–18.00 น.` · `10/20/30 %` · full-width year `２０２６`.
- K1.3 — phone in `kb_auto_save` `category` → refused, no row; plain category still saved.

| run (QC3 · iso.sh + gate lock · one at a time · `/tmp/cf17-logs/r2.summary`) | result |
|---|---|
| own probe-cf17-g3 on e6006691 (RED) | **24/26** — M1.4 (1/7 refused: only `＋66…`, via the `66` rule), K1.3 (row stored) · M1.5 green on both trees (`/tmp/cf17-logs/r2-red.log`) |
| own probe-cf17-g3 (round 2) | **26/26** |
| reviewer probe-cf17-g3-review (unedited) | **12/12** — G1.1 and G1.4 flipped (reviewer's run on e6006691: 10/12) |
| probe-cf14-g2 · probe-cf14-g2-review | 34/34 · 14/14 |
| `pnpm typecheck` (5 GB heap) | exit 0 |
| fitness (QC3 env) · fitness (no env) | 39/39 · 39/39 |

`scripts/pending/cf17/run-verify.sh` now also runs the reviewer's cf17 probe. Not verified in round 2: the other suites of round 1 (no change touches their code paths beyond `contact-data.ts` / `kb_auto_save`), `qc-kb-auto` (loads `.env.local`), prod.

## Round 3 (review "Round 2 re-check" · RV-8, RV-9) — 2026-10-02 06:57 UTC (`date -u`)

Only `src/lib/ai/contact-data.ts` changed (still one linear pass, no regex — the reviewer's 2.2 M-char input: 201 ms vs 18 ms for 220 k ·
own run with 200 k zero-width characters added: 1.6 M chars 196 ms vs 160 k 17 ms).

**RV-8 — phone shape rule (new).** A phone built from several digit groups must have **every group after the first ≥ 3 digits**, or
consist of single digits only (`0 8 9 9 …`, typed one by one — reviewer G1.1 "one digit per group"). Exempt: international `+`/`＋`
and `00…` numbers (`+66 89 900 0102` normally has a 2-digit group). The 13-digit ID is exempt too (standard form `1-2345-67890-12-3`
has 2- and 1-digit groups; the checksum guards it). Kept caught (probe M1.2/M1.4/M1.7 + reviewer G1.1 + an extra 40-case unit check):
`089-900-0102` · `08-9900-0102` · `0-2123-4567` · `(02) 123 4567` · `02/123/4568` · `053-123-456` · en dash / slash / full-width /
Thai digits · `+66 89 900 0102` · `+66 2 123 4567` · `0066 89 900 0102` · digit-by-digit.

**Landline prefix tightened.** 9 digits = `02` + 7, or area codes `03x/04x/05x/07x` whose third digit is 2–9. There is no `030/040/050/070`
code, and `06` is mobile (10 digits). So `050/060/070` (all groups ≥ 3) is no longer a phone.

**Deliberately not caught (new residuals):** Thai numbers written in pairs, `02 123 45 67` / `089 900 01 02` — not a Thai convention
and the same shape as dates/times; `66 89 900 0102` without `+` (the bare-`66` rule needs groups ≥ 3 now; `66899000102` still caught).

Now **not** flagged (probe M1.6, reviewer G2.1): `09/10/2026-08/11/2026` · `09/10/26-08/11/26` · `08.30-17.30/09.00-18.00` ·
`050/060/070` · and the pre-existing one, `08.30-17.30 09.00-18.00` (shifts separated by one space) · plus the reviewer's other controls
(tax id `0105561000003` / `0-1055-61000-00-3`, `0905/0906/0907`, `12/345/6789`, `PO/2026/0042`, Thai-digit date).

**RV-9 — cheap bypasses.**
- Invisible format characters are dropped before scanning (phones **and** e-mails see the same cleaned text): U+00AD soft hyphen, U+061C,
  U+180E, U+200B–U+200F (zero-width space/non-joiner/joiner, LRM/RLM), U+202A–U+202E, U+2060–U+2064 (word joiner …), U+2066–U+2069,
  U+FEFF (BOM).
- `_` and `·` (U+00B7) are separators. `,` and `:` are not (prices, times).
- Residual, out of scope: spelled-out separators (`089 ขีด 900 ขีด 0102`), three or more spaces between groups, `,`/`:` separators,
  phone numbers written as words, a number split across two sentences.

**Probes (QC3 · iso.sh + gate lock · one at a time · `/tmp/cf17-logs/r3.summary`):**

| run | result |
|---|---|
| own probe-cf17-g3 on ec9da046 (RED, new cases M1.6 + M1.7 added first) | **26/28** — M1.6 (5/13 controls refused: the four RV-8 cases + space-separated shifts) · M1.7 (3/11 refused: ZWSP, ZWJ, word joiner, BOM, soft hyphen, `_`, `·`, zero-width inside an e-mail all passed) · `/tmp/cf17-logs/r3-red.log` |
| own probe-cf17-g3 (round 3) | **28/28** |
| reviewer probe-cf17-g3-review (unedited) | **13/13** — G2.1 flipped green · G1.1 / G1.3 / G1.4 green · G2.2 evidence: ZWSP/ZWJ/word joiner/BOM/`_`/`·` now caught; comma, three spaces, spelled separator, colon missed (as decided) |
| probe-cf14-g2 · probe-cf14-g2-review | 34/34 · 14/14 |
| `pnpm typecheck` (5 GB heap) | exit 0 |
| fitness (QC3 env) · fitness (no env) | 39/39 · 39/39 |

Not verified in round 3: the round-1 suites (only the scanner changed), `qc-kb-auto` (loads `.env.local`), prod.

## Controller merge gate record (2026-10-02 07:38 UTC)

Patch `scripts/pending/c55merge/g3.patch` (cf2 `608204d3..76952d70`, rounds 1–3 + reviews) applied to the main tree after fix8 (`3b2bd298`) with `patch -p1 --fuzz=3`; all 13 files verified identical to the tip commit. Gate `scripts/pending/run-main-g3.sh` (unit `crm-main-g3`, log `.qc-shots/crm/main-g3.log`): **26/29 steps exit 0**.

- Green: typecheck, docs ×4, fitness (no env + QC3), probe-cf17-g3, probe-cf17-g3-review, probe-cf14-g2, **probe-cf14-g2-review (X7.1 now green — the finding left open by the G2 merge is closed)**, probe-cf9-g1 / g1-r2 / g1-review-r2, probe-cf8-mobile / actions, mobile-authz, automation-authz, payment-authz, ai-automation, c3.4, c1.7, c2.11, c0.2, probe-cf13-sweep, probe-cf11-r4.
- Red, environmental (three suites the controller added to the gate from the builder's verify list; none exercises code G3 changed in a failing check):
  - `qc-account-api-ai-skill` 23/33 — the 10 reds answer "accounting system not opened": QC3 has no acc-v2 seed. Identical 23/33 with the same 10 ids in the builder's round-1 run (`/tmp/cf17-logs/v1.summary`).
  - `qc-member-m3.10` 7/21 — HTTP suite; the gate runs with `QC_BASE=http://127.0.0.1:9` (no server). The builder's run was red the same way (6/21).
  - `qc-member-fix-s1` S1-ERR "Membership not found" — the suite reads user ids from the main checkout's `scripts/member-expected.json`, which belongs to a different QC database's member seed than QC3's (re-run alone: same error before any check runs). The builder's worktree had the matching file and got 28/28.
