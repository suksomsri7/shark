# CRM C5.5-G3 — independent review (memory ownership · contact-data guard · support push · OWNER latest room · LIKE escape)

- Branch `wip/crm-cf17` · range `608204d3..954a69d5` (code `230e0a17`, builder note `954a69d5`).
- Runs started 2026-10-02 04:43 UTC; after a quota pause, resumed and finished 05:52 UTC (`date -u`).
- Read:
  - the builder note `ledger/wo-notes/crm-C5.5-G3.md`;
  - the full `git diff 608204d3 954a69d5` (11 files);
  - every `AiMemory` access in `src/`;
  - `sendPushToUsers` and the support case doors.

## What I ran (QC3 only · heavy jobs through `iso.sh` + `with-gate-lock.sh`, one at a time)

| run | result |
|---|---|
| builder `probe-cf17-g3` | **23/23** |
| own `scripts/pending/cf17/review/probe-cf17-g3-review.mts` | **10/12** — red G1.1, G1.4 (RV-1, RV-2) · CLEAN 0 rows (2 tenants), 0 users |
| my G2 `probe-cf14-g2-review` (unedited) · builder `probe-cf14-g2` | 14/14 (X7.1 flipped green) · 34/34 |
| `pnpm typecheck` (5 GB heap, own probe included) | exit 0 |
| fitness (QC3 env) · fitness (no env) | 39/39 · 39/39 |
| "still red at base" claims | **verified identical ids** by diffing the JSON_SUMMARY lines of the builder's logs (table below) |

Comparison of the "still red" suites:

| suite | tip `230e0a17` (`/tmp/cf17-logs/v1-*`) | G2 base `be9c9658` (`/tmp/cf14-logs/base-*`) | G2 tip `608204d3` |
|---|---|---|---|
| qc-member-m3.10 | 6/21 | same 15 ids | same 15 ids (G2 v1) |
| qc-account-api-ai-skill | 23/33 | same 10 ids | same 10 ids (G2 v2, after its K3.4 ORACLE-EDIT) |
| cf8-review | X1.3 | X1.3 | X1.3 |

## Attack summary

**AiMemory paths.** Every access lives in `src/lib/ai/memory.ts`, with no raw SQL. `scope.ts` registers the table as tenant-scoped.

| path | how it is gated |
|---|---|
| `listMemories` | LIKE pre-filter, then exact `canSeeMemory` per row |
| `memoryBlock` (the prompt) | calls `listMemories` with the actor (`service.ts:163`) |
| `forgetMemory` | `canSeeMemory` **and** `canForgetMemory` |
| `rememberFact` | the id comes only from `newMemoryId(actor)`; the guard runs before the shared write; dedup and cap use the managed set |

No other reader or writer exists: the system prompt carries DNA, memories and platform tweaks only.

**Forging through tool arguments.** Verified:
- F1.1: `remember_fact` ignores extra `id` / `scope` / `shared` arguments. A STAFF note is stored `u~<staff>~`, not `o~`.
- F1.2: STAFF forgetting an OWNER fact or a legacy fact (by id, or by text) is refused. The same user acting as OWNER of **another** shop is refused too.
- F1.3: an OWNER cannot forget a STAFF private note.
- F1.4: the role comes from the per-request actor. Web and mobile build it from a fresh `Membership` read, not a cached answer. The same user writing as OWNER of shop B creates `o~` rows in tenant B only, and they never appear in shop A prompts.

Demoted and removed members: I read the builder's M3.1/M3.2 and they match the code. A demoted OWNER keeps earlier facts shared and can still forget them through the `ownFact` match. Acceptable.

**Contact-data guard.**
- Linear time verified: 2.2 M adversarial characters take 182 ms, 220 k take 20 ms (ratio ≈ 9× for 10× input).
- The legacy read-time hiding uses the **same** `findContactData` (`canSeeMemory`).
- Misses that a model could plausibly emit: see RV-1.
- Deliberate obfuscation is out of scope for an accidental-disclosure guard, and only an OWNER can write shop facts. Missed by design: zero-width joiners, `_`, spelled-out Thai digits, "at/dot" e-mails, Arabic-Indic digits, LINE ids, a number split across two facts (G1.2).

**Support push.**
- P1.1: a creator who has left the shop → no push.
- Malformed `u~<id>` ids (never minted) fall back to the OWNERs, who cannot open such a room. INFO only.
- `sendPushToUsers` limits devices by `tenantId`.

**OWNER latest room.**
- The web sheet opens the caller's own room. Key, legacy and scheduled rooms are reachable on the web only by id.
- The confirm logic is unchanged (builder L1.2). The web simply has no list for those rooms (owner Q1).

**`likePrefix`.**
- Used at every creator-prefix `startsWith` (conversations: own; memories: own, ownFact, managed private).
- The constant tags `u~` / `o~` need no escaping.
- E1.1: at the database, ids containing `_`, `%` or `\` return exactly their own row (Postgres default LIKE escape `\`).

**ORACLE-EDIT `qc-ai-memory`.** Honest: the viewer is the shop OWNER (shop facts, as the checks always meant), and the other-shop check uses that shop's OWNER. Not run — it loads `.env.local`.

## Findings

| # | sev | where | finding | evidence / fix |
|---|---|---|---|---|
| RV-1 | LOW | `contact-data.ts:16-21` (`digitOf`, `isSep`) | Phone formats a model could plausibly copy are **not caught**: an en dash separator `089–900–0102`, a slash `089/900/0102`, full-width digits `０８９９…`. Caught as expected: dash, space, dot, thin space, nbsp, Thai digits, +66, digit-by-digit spacing, upper-case e-mail. | G1.1 ❌ (missed `en dash`, `slash`, `full-width`). Fix: add U+2010–U+2015, U+2212 and `/` to `isSep`, and FF10–FF19 (plus Arabic-Indic 0660–0669 if wanted) to `digitOf`. Dates like `02/10/2026` stay safe: 8 digits with a leading non-`0`, and the other cases too short. Re-run M1.3. |
| RV-2 | LOW | `tools.ts` `kbAutoSave` (scan of `${title}\n${content}` only) | `kb_auto_save` stores a phone placed in **`category`**. The category is shown in KB lists and `kb_search` results (`[category]`). | G1.4 ❌ (row stored). Fix: scan `category` too. |
| RV-3 | LOW (owner question) | design of `o~` shop facts | The guard covers contact data only. An OWNER turn that stores other personal data — a customer's name + spend + health note — becomes a shop fact and reaches every STAFF prompt. That is tool-derived data a STAFF may not otherwise see. The description no longer invites "names of regular customers", but nothing stops it. | R1.1 (stored; STAFF prompt contains it). Owner Q2: either OWNER memories are private by default and become shop facts only on explicit "for the team" wording, or the description and persona forbid facts about individual customers. Not a blocker. |
| RV-4 | LOW (existed before; outside this card) | `tools.ts` `support_open_case` → `support/actions.ts:55` `loadMyCasesAction` (every member) | The other unguarded **write-now** tool lands on a surface every member can read: the support case list and thread. The model writes the case body from the conversation, so it can carry tool-derived data, unguarded. It also makes the G2-2 rationale partial: the push now reaches only the room's readers, but every member can still read the same platform reply in the shop's case thread. | Read only. Fix options: run the contact guard on `subject`/`detail`, or limit AI-opened cases to the room's readers. |
| RV-5 | INFO | `support.ts` push targeting | A malformed member-shaped id `u~<id>` (2 parts) falls back to the OWNERs, who cannot open it. Such ids are never minted. | P1.2. Optional: drop the push when the id starts with `u~` but does not parse. |
| RV-6 | INFO | `conversation-owner.ts` `likePrefix` | Correct today: Prisma passes the value raw and Postgres's default escape is `\`. If a future Prisma version escaped `startsWith` itself, the double escape would hide users' own rows (fail-closed, not a leak). | E1.1 (verified) — keep E1.1-style checks in the suite. |
| RV-7 | INFO | behaviour | STAFF can no longer forget legacy shop memories (OWNER only). OWNERs on the web lose the key/legacy/scheduled rooms from the sheet (app list or id only; owner Q1). Shop-fact cap: the 100 includes legacy rows, so a shop with 100 legacy rows must forget some before an OWNER adds new facts. | Read + F1.2 / L1.1. |

Nothing at BLOCKER, HIGH or MED. G2-1 (MED) is closed for its stated channel: X7.1 flipped green, unedited. G2-2, G2-5 and G2-6 are closed as described, with the caveats in RV-4 and RV-6.

## Recommendations on the builder's owner questions

- **Q1.** Accept for this release, but add a small web "requests from external assistants" list in the next UI card. The documented flow says "the owner confirms in app/web".
- **Q2.** See RV-3. Prefer OWNER notes private by default, becoming shop facts only when explicitly meant for the team — or at least forbid individual-customer facts in the description.
- **Q3.** Allow. The job runs as the least-privileged reader, and its memories are OWNER-only.
- **Q4.** Acceptable. The refusal text tells the user where the data belongs.
- **Q5.** Keep: the human confirms. Optionally show a warning on the card when contact data is detected.
- **Q6.** Same as my G2 review G2-3: owner/PDPA decision. Blank `u~` rooms and private memories when the account is deleted.

## Verified vs only read

- **Verified by running:** builder probe 23/23 · own probe (F1.1–F1.4, P1.1, E1.1, G1.1–G1.4, R1.1) · G2 probes · typecheck · fitness ×2 · base-identical ids (log diff).
- **Only read:**
  - RV-4 (support doors);
  - the demoted/removed-member cases beyond F1.4 (the builder's M3.1/M3.2);
  - the ORACLE-EDIT (not run — `.env.local`);
  - Expo delivery (requests captured only);
  - the mobile app;
  - prod legacy-memory counts;
  - a tree merged with `shark-hf` / `likeStartsWith`.

VERDICT: MERGEABLE

---

# Round 2 re-check — builder tip `dece4b11` (one commit on `e6006691`)

Scope: `git diff e6006691 dece4b11`. That is `src/lib/ai/contact-data.ts` (RV-1: more separators, more digit scripts, full-width `+`) and
`src/lib/ai/tools.ts` (RV-2: `kb_auto_save` now scans `category`). Checked 2026-10-02 06:06 UTC (`date -u`). QC3 only; each job through
`iso.sh` + `with-gate-lock.sh`, one at a time.

## Runs

| run | result |
|---|---|
| builder `probe-cf17-g3` | **26/26** |
| own `probe-cf17-g3-review.mts`, original checks unchanged | **G1.1 ✅** (no plausible format missed) · **G1.4 ✅** (phone in `category` refused) · G1.3 ✅ · F1.1–F1.4 ✅ · P1.1 ✅ · E1.1 ✅ · CLEAN ✅ |
| own probe, new round-2 cases (G2.1 / G2.2, added before this run; the original checks were not touched) | 12/13 — **G2.1 ❌** (false positives, RV-8) · G2.2 evidence (RV-9) |
| old vs new scanner on the same strings (`git show 954a69d5:` copy of the scanner, run once via `iso.sh`, temporary files deleted) | see RV-8 |

Typecheck was not re-run: no `src` change on my side. The probe edit only adds typed string arrays and calls through an untyped import.

## Linearity

Still one pass over the string. The new code is a `switch` / range test per character and a constant-cost `isPlus`; there is no regex.
Measured: 2.2 M adversarial characters in 230 ms vs 220 k in 21 ms (≈ 11× for 10× input).

## Findings (round 2)

| # | sev | finding | evidence | fix suggestion |
|---|---|---|---|---|
| RV-8 | LOW (usability, fail-safe) | **New false positives from `/` as a separator.** Groups joined into a 10-digit span starting `08`/`09`, or a 9-digit span starting `05`, read as a phone, so these shop facts / KB articles are refused: a date range `09/10/2026-08/11/2026`, `09/10/26-08/11/26`, opening hours `08.30-17.30/09.00-18.00`, and zero-padded codes `050/060/070`. Already a false positive before this commit (missed in my round 1): opening hours written with one space between shifts, `08.30-17.30 09.00-18.00`. Not flagged: `12/345/6789`, `100/150/200`, `0905/0906/0907`, the juristic tax id `0105561000003` / `0-1055-61000-00-3`, and plain dates. | G2.1 ❌. Old/new comparison: the four `/` cases were `[]` at `954a69d5` and `["phone"]` at `dece4b11`; the space-separated hours were `["phone"]` on both trees. | A shape rule for phone spans: groups after the first must have ≥ 3 digits (`089-900-0102`, `(02) 123 4567`, `089/900/0102` still match). Dates and hours made of 2-digit groups then never join into a phone. Re-run M1.3 + G2.1. The refusal text tells the user what to change, so this does not block. |
| RV-9 | LOW (deliberate bypass; no new capability) | **Cheap user-made variants still pass:** zero-width space / joiner / word joiner / BOM between digits, `_`, `,`, `·`, `:`, three or more spaces, spelled-out separators ("ขีด"). Caught as intended: **Thai digits ๐–๙** (also dashed), mixed digit scripts in one number, full-width, Arabic-Indic. | G2.2 evidence. | Only an OWNER (shop facts) or someone holding `kb.article.create` (KB) reaches these writes, and both can type the same text in the web UI. So this is not an escalation. Cheap hardening: drop Unicode format characters (U+200B–U+200F, U+2060, U+FEFF) before scanning, and treat `_` / `·` as separators. Commas and colons would hit prices and times — leave them. |

RV-1 and RV-2 from round 1 are **fixed** (G1.1 and G1.4 green). RV-3 to RV-7 are unchanged and out of this round's scope.

## Verified vs only read (round 2)

- **Verified:** both probes on QC3; the old vs new scanner on the same strings; linear timing.
- **Only read:** the builder's new note section and its probe additions (M1.5 etc.; its 26/26 run is mine).

VERDICT: MERGEABLE
