# C5.5-fix12: independent review (RV10-1 duplicate checks · RV10-2 writer echoes · RV10-3 kanban subtitle · RV10-4 export snapshot)

- Reviewed `wip/crm-cf16` `e4869b2e` against base `6cbb8f3c`, worktree `/root/projects/shark-crm-cd2`, database QC2.
- Window: 2026-10-02 05:5x → 06:32 UTC (`date -u`).
- I did not edit any product source, run no doc generator, and touched nothing under `.claude/`.

## What I ran (QC2, each job in its own `iso.sh` unit under the gate lock, one at a time)

Runner: `scripts/pending/cf16/review/run-review.sh`. Logs are in `/tmp/cf16-review-logs/`. Chain ran 06:00:47–06:30:54 UTC.

| Job | Result |
|---|---|
| `probe-cf16-review` (new, this review) | **10/10** (also an earlier standalone run: 10/10) |
| `probe-cf16` (builder), against the builder's RED dump `/tmp/cf16-logs/red3.dump.json` | **22/22**, including `DU-control-vs-red` (visible-duplicate responses byte-identical to RED, differing: []) |
| `probe-cf13-review` (mine, unchanged) | **8/8**. `LK-create-duplicate-masked` is now green. |
| `probe-cf13` | **24/24** |
| `probe-cf10-review` | **18/18** |
| `probe-cf7-review` | **27/27** |
| `probe-cf7-review-r2` | **21/21** |
| `qc-crm-c1.4` | **110/110** |
| `qc-crm-c1.3` | **89/89** |
| `qc-crm-c1.11` | **66/66** |
| `qc-crm-c1.10` | **66/66** |
| `qc-crm-c2.4` | **91/91** |
| `qc-crm-c1.7` | **57/57** |
| `qc-kanban-k3.1` | **19/20**. The red is `K3.1-S6.3`, "≥ 3 screenshots in `.qc-shots/kanban/3.1`": a file count, and that directory does not exist in this worktree. The builder's base run (`/tmp/cf16-logs/k3.1-base.log`) has the same single red. It is red at base because it is code-independent. |
| typecheck (5 GB heap) | exit 0 |
| fitness | **36/36**: F2.3 ✅ · F14 1066/1066 |

**QC2 clean** (`scripts/pending/cf16/review/leftover-check.mts`):
- `qc-cf16/13/10/7-*` tenants = 0, users = 0.
- 14 orphan `crm:contact:ident:<tenant>:<user>` rate buckets were left by probe runs on this tip (mine and the builder's). `ChatRateBucket` has no `tenantId`, so tenant sweeps do not remove them (RV12-3). I deleted those 14 with `--clean`; re-check: 0.

## Attack results

### Doors that return or echo a hidden contact or company
- **Verified for contacts:**
  - `createContact` with and without force, and mixed visible + hidden (builder `DU-*`);
  - `updateContact` mixed: the new phone hits a hidden contact and the new e-mail a visible one ⇒ DUPLICATE whose `duplicates` holds the visible name only; the phone hitting a hidden contact only ⇒ neutral text with no `duplicates` (`UP-mixed`);
  - REST `contacts.create` 409 neutral (builder `DU-rest-create`);
  - import update / skip / candidate, below (`IM-modes`);
  - card scan, below (`CS-loop`).
- **Verified for companies:** company create, update, restore and merge by tax id (builder `DU-company-tax`, `SW-company-*`).
- **Read only:**
  - The AI proposal message (`api/tools.ts:471`) uses only what `createContact` returns, which is now visible-only.
  - The audit row of `createContact` holds only visible duplicate ids.
  - The REST error body keeps no extras: `toCrmApiError` → `crmApiError(409, "duplicate", th)`.
  - The UI action forwards `e.duplicates`, which are visible-only.
  - `companies.createCompany` with a visible match is unchanged; with a hidden match it returns the neutral text and no `duplicateOf`.
  - Contact import's `companyFor` → `createCompany` turns a hidden tax-id match into a **note**, with no company id or name.
- **Timing and messages.** A hidden duplicate costs one extra `contactWhere` read inside the transaction, and only when a duplicate exists. The response itself already says "exists, not yours" (the unavoidable existence oracle), so timing adds nothing. "No duplicate" creates the contact. No message names, counts or orders the hidden match.
- **Force with a hidden match, legitimate user.** The neutral text says to ask the team lead or shop owner. The owner sees every contact and can assign it or merge. Not stuck, but there is no in-app hand-off. That is the builder's owner question 1, and I agree it is a product choice.

### Card scan (`CS-loop`, `CS-owner`)
- A STAFF member who cannot see the matching contact accepts → neutral DUPLICATE, the proposal returns to PENDING with the neutral note. Retrying gives the same result. Discard works (`REJECTED`). Rows with that phone stay at 1.
- The owner accepting the same card still creates a duplicate (`force:true`, as before for anyone who can see the match).
- There is no loop beyond the user retrying.

### Import (`IM-modes`)
Each mode imports three rows: a hidden-only phone match, a visible e-mail match and a new contact. In every mode the hidden row is `failed=1` with the neutral text and `kind:"error"`, no contact is created with that phone, and the hidden contact's name appears nowhere in the result.

| Mode | created | updated | skipped | candidates |
|---|---|---|---|---|
| update | 1 | 1 | 0 | 0 |
| skip | 1 | 0 | 1 | 0 |
| candidate | 2 | 0 | 0 | 1 |

Counts and row order reveal only "this row matched something you cannot see" (the existence oracle), and errors come first by the fix7 rule.

### Rate limit (`RL-*`)
- **Key** (`contacts.ts:336`): `crm:contact:ident:<tenantId>:<userId>`, i.e. per person per shop.
  - Another user in the same shop is unaffected.
  - The same user in another shop is unaffected.
  - The counter is the existing single-statement `INSERT … ON CONFLICT DO UPDATE … RETURNING` (`core/rate-limit-db.ts`): atomic, fixed window.
- **What counts:**
  - create with a phone: +1;
  - update with the **same** phone: +0;
  - the AI assistant actor (`crmActorOf kind "assistant"` = the person's membership): counted, and refused at the limit.
- **What does not count (by design):** API-key creates (REST bucket) and import (RV12-2).
- **At the limit:**
  - create with a phone → `LIMIT` with a Thai message, **0 writes** across the tenant;
  - create without a phone still OK.
- **Failure mode:** fail-open (logged), the same as every other user of this limiter.
- **Busy users and import:** 120 per 10 minutes is 12 per minute for manual entry, and import is not counted, so neither is hurt.
- **REST shape:** RV12-1.

### `viewerDtoOf` on every writer
- `grep` finds **no raw `toDto(row)` return left** in `contacts.ts`; the only `toDto` use is inside `viewerDto`.
- Measured (`WE-mutate-masked`): `assignContact`, `setOptOut`, `archiveContact` and `restoreContact` by a STAFF member on a contact linked to a hidden company all return `companyText: null`. The builder's `WE-masked` covers update, tags, lead status and lifecycle.
- Deal writers return `DealDto` with no name fields (read). Company writers return the company the writer acted on (read).

### Kanban subtitle (RV10-3)
- `hideInvisibleCrm` makes 1 `companyTextsForCrossViewer` call per resolve batch (`link-resolvers.ts:880`), and only for the visible contact ids of that batch: 2 queries.
- Both callers (`listCardLinks` for one card, `linkChipsOfCards` for a page of cards) resolve their rows in one batch. No N+1 under pagination (read).
- Behaviour is the builder's `KB-subtitle`, re-run through `probe-cf16` (green). I did not drive a board myself.

### `exportDeals` in `crmScope` (RV10-4)
`EX-scope`: for owner, an own-records STAFF member and a STAFF member with no deals, the CSV contains exactly the deals `listDeals` shows: 2/2, 1/1, 0/0, no extras. The scope wrapper changes no result; it only memoises within the call.

## Findings

### RV12-1 · LOW · the rate-limit refusal travels as a plan-cap "LIMIT" (409 state_conflict, not marked nothing-written)
- **Where:** `assertIdentRate` throws `fail("LIMIT", …)`, which `toCrmApiError` (`http-errors.ts:95`) maps to **409 `state_conflict`** with the English text "This CRM system reached one of its limits, so nothing was saved." (`RL-rest-shape`).
- **Why it matters:** the codebase's own convention for rate limits (`portal-lane.ts:88`, `member/api/http-errors.ts:39`) is **429 `rate_limited` + `nothingWritten`**, so that a retry with the same Idempotency-Key is not answered with the stored refusal after the window passes.
- **Who is affected:** user and assistant REST actors (the AI path); API keys are exempt from this limit. The UI shows the Thai text, which is correct.
- **Fix:** a dedicated code (e.g. `RATE_LIMITED`) → 429 + `nothingWritten` + `retryAfterSec`.
- Not a leak; does not block.

### RV12-2 · INFO · the existence oracle is not rate-limited for API keys and import (by design, documented)
- **API keys:** an owner-issued key, possibly narrowed by `crm.filter.*`, can test 300 phone numbers or e-mail addresses per minute through the REST write bucket.
- **Import:** `crm.contact.import`, MANAGER by default, takes up to 5,000 rows per call. Rows that do **not** match create real contacts, so probing this way is noisy and leaves a trace.
- Both reveal existence only: no name, id or owner. Acceptable; noted so the owner's question 3 covers it.

### RV12-3 · INFO · probe and test hygiene: phone/e-mail rate buckets outlive their throwaway tenants
- `ChatRateBucket` has no `tenantId`, so `_fx` tenant sweeps leave `crm:contact:ident:<tid>:<uid>` rows behind. 14 were orphaned in QC2 from probe runs on this tip, and I deleted them.
- On production the daily cron `sweepRateBuckets` (24 h) handles this.
- Suggest that `_fx.done()` (all probe fixtures) also delete `crm:contact:ident:<tenantId>:` keys.

### RV12-4 · INFO · process: the builder's doc-generator run created and then deleted a gitignored `.claude/skills/…` file
The builder note's "Process note" says `gen-crm-api-docs.mts` in write mode created `.claude/skills/shark-crm-api/references/endpoints.md`, and the builder then removed it. The end state matches the start state, but the review briefs forbid creating or deleting files under `.claude/`. Worth stating in the builder rules: run generators with `--check` only, and commit `docs/api/*` from a write run that targets only that path.

### RV12-5 · INFO · ratings of the "reported only" sweep rows
None needs fixing in this card.

| Row | Rating |
|---|---|
| #11 `importCompanies` counts | INFO. Existence by tax id; MANAGER-default key; batched. |
| #13 chat panel `contactState: hidden` vs `none` | INFO. Intended existence signal (N-4); no id or name. |
| #15 e-mail from-address check | INFO. Existence of a contact e-mail on the shop's own verified domain; settings-level user. |
| #21 member `createMember` returns `duplicate: briefOf(existing)` | INFO for CRM. The member module's read model is shop-wide (no per-row ownership; units only scope visits and sensitive fields), so returning the existing member is consistent with what the caller can already list. Member lane. |
| #22 `getImportJob` by job id | LOW, measured (`JB-other-user`). Another STAFF member holding the id reads the owner's job result. The id is a random UUID returned only to the importer, and row messages no longer carry names. Cheap hardening: filter the audit row by `actorId = caller` unless the caller can see all. |

## Verified vs only read

| Claim | How |
|---|---|
| Duplicate doors: create (force, mixed), update (mixed), import (3 modes), card scan (loop + discard) | **Verified** (my probe) |
| REST `contacts.create` 409 | **Verified** by re-running the builder's probe |
| Company tax-id doors | **Verified** by re-running the builder's probe |
| Rate limit: key scope, counting, assistant, API key, import, zero writes, REST shape | **Verified** |
| `viewerDtoOf`: assign, opt-out, archive, restore | **Verified** |
| `viewerDtoOf`: update, tags, lead status, lifecycle | **Verified** via the builder's probe |
| No raw `toDto` left | Grep |
| `exportDeals` result parity | **Verified** |
| Export snapshot read once | Builder's `EX-visibility-once`, re-run green |
| Kanban subtitle behaviour | Builder's `KB-subtitle`, re-run green |
| Kanban query count, no N+1 | **Read** |
| Timing equivalence | **Read** (one conditional query) |
| Rate-limit concurrency | **Read**: the limiter's single statement, tested elsewhere (`qc-chat-security` M9) |
| AI proposal message, audit payloads | **Read** |
| `k3.1` S6.3 red at base | Builder's base log plus the missing directory |

## Not verified
- No live :3215 build: the forms, import panel, card-scan sheet and kanban board were not rendered.
- `qc-crm-c3.7` (mobile, QC3), the button runner and `qc-crm-forms` were not run.
- REST company update, restore and merge were not driven through the HTTP dispatcher.
- No real burst of 120 requests: I pre-filled the bucket.
- The 24 h prod bucket sweep was not exercised.

## Verdict
- No BLOCKER, HIGH or MED.
- RV10-1..RV10-4 are closed:
  - no door I attacked returns a hidden contact's or company's name, id, phone, e-mail or company text;
  - refusals write nothing;
  - visible-duplicate behaviour is byte-identical to before;
  - writer echoes are masked;
  - the kanban subtitle follows the rule;
  - the export result is unchanged.
- RV12-1 (LOW: rate-limit REST shape) and RV12-5 #22 (LOW: job id) are cheap follow-ups. The rest is INFO.

VERDICT: MERGEABLE
