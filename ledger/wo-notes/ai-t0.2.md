# WO T0.2 — Data contract · mobile API spec · QC seed · QC env loader · fitness AT-F16.1–3

> RUN "AI TEAM" (SHARK HUB v2) · controller tree `/root/projects/shark-ai` · branch `session/ai-team` · lane `/root/projects/shark-ai-b` branch `wip/pos-ai-t0.2` · 2026-10-08 (UTC) · controller: Fable · builder: Claude Opus 5.5 (agent)
> Contract: `ledger/AI-TEAM-RUN.md` §2 T0.2 + `ledger/AI-TEAM-MASTER-PLAN.md` §6 · brief `ledger/ai-team-briefs/ai-brief-T0.2.md` (+ COMMON + RESOLUTIONS + the two controller sections at the bottom of the brief)
> Design `ledger/DESIGN-AI-TEAM.md` §2–§4 · mockups: HTML of `ledger/design-ai-team/gen_*.py` generated in a scratch copy (`/tmp/ai-t0.2-mockups`, nothing written to the design folder)
> Oracle: `scripts/qc-ai-t0.2.mts` (41 checks · commit test: 008312d5 · **edited after that commit: no**) · first red `ai-t0.2-red.txt` (2/41) · green `ai-t0.2-green.txt`

## 1. Files touched
| File | State | What | Shared file (COMMON §D)? overlap with POS/HR |
|---|---|---|---|
| `docs/modules/30-ai-team.md` | new | module contract M1–M9 at function level: 18 team files + facade, ctx shape, invariants, 8 refusal codes, AiTask decision (C7), owner-bound FREE pack (C2), enforcement points (C15), AUTO executor rules (C10/C11), charging paths, events (`ai.flow.triggered` in T5.3), jobs | no |
| `docs/api/AI-TEAM-MOBILE-API.md` | new | 72 route sections (29 of T1.10 + `/me` + `/usage` + later-WO routes + 10 existing routes the screens reuse) · one `Screen → Routes` table (36 rows) · a per-element table of all 36 mockups · shared zod schemas · error / rate-limit / permission tables | no |
| `prisma/drafts/ai_team.prisma` | new | DRAFT (not migrated, not in scope.ts, not in `prisma/schema/`): 15 models, 5 enums, "T1.1 adds" comment block + raw-SQL partial uniques for T1.1 | no (`prisma/schema/*` untouched) |
| `scripts/ai-team-qc-env.mts` | new | `loadAiTeamQcEnv()` (host gate → exit 4) · `atIds()` · `atSystemIds()` · `withInjectedNow()` · `bkkTime()` · `AT` contract constants | no |
| `scripts/seed-ai-team-qc.mts` | new | find-or-create seed of AT-1 / AT-2 / AT-X | no |
| `scripts/fitness-ai-team.mts` | new | AT-F16.1 / AT-F16.2 / AT-F16.3 (ratchets) · honours `FITNESS_AI_TEAM_ROOT` | no |
| `apps/mobile/qc/fixtures/ai-team/README.md` | new | fixture format for `shoot-ai-team.mjs` | no |
| `scripts/qc-all.mts` | hunk | two marked insertions (`// AI TEAM T0.2 ▸ … ◂`, +41 lines, 0 removed): marker `// requires: ai-team-seed` → `seed-ai-team-qc.mts` (QC4 only; other databases: no seed, no block) + the "blocked" row in the loop | **yes** — `git log --oneline origin/session/pos origin/session/hr --since=2026-10-01 -- scripts/qc-all.mts` = **empty** (0 commits since 1 Oct on either branch; refs fetched 8 Oct: `origin/session/pos` 611f54c7 · `origin/session/hr` 103fde95; the last commit touching the file on both is 02ba30bc of 19 Sep). No overlap. |
| `ledger/wo-notes/ai-t0.2.md` · `ai-t0.2-green.txt` | new | these notes + the green output | no |

Nothing under `src/`, `apps/mobile/app/`, `prisma/schema/`, `.githooks/`, `package.json`. The oracle file was not edited.

## 2. migration / seed / backfill
- migration: **none** (draft only; T1.1 owns `_ai_team_a`).
- seed `scripts/seed-ai-team-qc.mts` (QC4 only, through `loadAiTeamQcEnv()`):
  - tenants `qc-ai-team-at1` (AT-1) · `qc-ai-team-at2` (AT-2) · `qc-ai-team-atx` (AT-X); users `at-owner@qc.shark` (OWNER of AT-1 + AT-2) · `at-nid@qc.shark` (AT-1 MANAGER: `account.doc.approve`, `crm.commission.approve`, `_maxApproveSatang` 2,000,000) · `at-staff@qc.shark` (AT-1 STAFF: `ai.chat.send`, `ai.employee.use`) · `ax-owner@qc.shark` (OWNER of AT-X).
  - every tenant: one BusinessUnit `main` + one active AppSystem of ACCOUNT / CRM / CHAT / MEMBER / KANBAN linked to it (`sys.createSystem` + `sys.linkUnit`) + AccountSystemLink ACCOUNT↔CRM + CRM `uiVersion` 2.
  - AT-1 content: 24 CRM contacts (`crm.createContact`) · 6 OPEN deals (`crm.createDeal`; deals 5–6 quiet for 9 days) · account settings + chart of accounts (`saveSettings`, `ensureAccounting`) · 3 account contacts · 3 issued unpaid invoices via `createDocument` → `issueDocument` (5,136 / 13,375 / 26,750 baht incl. VAT — one above the 20,000 threshold) · 4 webchat threads (3 waiting for a reply + 1 answered control; raw prisma in the shapes of `receiveWebchatInbound`, because that service notifies staff and schedules an outbox drain) · 6 members (`member.findOrCreate`) · 5 KB articles in 3 categories (`kb.createArticle`; one category "บัญชีเท่านั้น" for the T4.6 grant test) · ApprovalPolicy `AccountDocument` ≥ 2,000,000 satang → OWNER (`approval.createPolicy`).
  - AT-2 / AT-X: systems only (AT-X must have no recommendation signal — T1.3 S5).
  - First run on QC4 (seed alone, 8 Oct 07:28Z): exit 0 · `rows created this run: 111` · 162.6 s · `AI_TEAM_SEED=created`. Second and later runs: `AI_TEAM_SEED=unchanged` (see §5).
  - The seed never deletes, never drains the outbox (drainOutbox is not tenant-scoped) and reads no other tenant. The service calls of the first run left their normal outbox events for the three tenants (`crm.contact.created`, account document events, …) PENDING; whichever lane drains next processes them like any other event.
- backfill: none.

## 3. Twelve gates (MASTER-PLAN §3)
| # | Gate | Pass? | Evidence |
|---|---|---|---|
| D1 | oracle written first by a separate agent · unforced SKIP exit 0 · forced red for the right reason | ☑ (oracle writer) | commit `test(ai-team): t0.2 oracle 41 checks` 008312d5 · `ai-t0.2-red.txt` `JSON_SUMMARY {"total":41,"passed":2,…}` |
| D2 | green forced ×2 + unforced · residue 0 | see §5 | builder runs in `ai-t0.2-green.txt`; the controller re-runs |
| D3 | X groups | ☑ | §4 |
| D4 | regression = baseline | DEFERRED to the controller | this WO adds no product code; the seed writes only its own three tenants (S1.4 + S1.5 measure it). The baseline suites were not re-run by the builder (lock time) |
| D5 | typecheck 0 · fitness ×2 modes | see §5 | |
| D6 | web build | N-A | no route / page in this WO |
| D7 | pictures | N-A | no UI |
| D8 | testID inventory | N-A | no UI (F16.4 / F16.5 arrive with T2.1) |
| D9 | reviewer / hunter | controller | |
| D10 | docs | ☑ | the two docs of §1; `fitness.mts` F7.1 (doc cross-references) stays green — files that do not exist yet are written in «…» |
| D11 | wo-notes + debt table + QC4 restored | ☑ | this file · §8 · §9 |
| D12 | merge / push | controller | builder commits on `wip/pos-ai-t0.2`, does not push |

## 4. X groups
| Group | Applies? | check ids / why N-A |
|---|---|---|
| X1 scope | ☑ | T0.2-X1.1 · X1.2 · X1.3 (seed users / tenants / rows never cross a tenant) · S1.4 · S1.5 (foreign tenants + canary untouched) |
| X2 identity / delegation | N-A | no executable product code; rules are written into the module contract §5 M4 / §7 |
| X3 concurrency | N-A | no counter is written in this WO (contract: invariant 5) |
| X4 replay | N-A | no consumer |
| X5 time-based jobs | N-A (helper only) | `withInjectedNow` / `bkkTime` delivered for later oracles |
| X6 dangerous input / prompt injection | N-A | contract only (invariant 4) |
| X7 mobile endpoints | N-A (spec) | rate-limit buckets and auth helper per route are in the API contract (S5.2) |
| X8 PDPA | ☑ (spec + seed) | DTOs carry short names only; the seed uses fictitious names, `@qc.shark` e-mails and 089-555-01xx numbers |
| X9 dangerous actions | N-A (spec) | `confirm` + reason in the terminate / revert / archive / grant / undo schemas |
| X10 secrets | ☑ | T0.2-X10.1 · X10.2 · X10.3 · S4.3 |
| X11 cost and quota | ☑ (static) | AT-F16.1 / AT-F16.3 (S6.1–S6.4); module contract §8 lists every model-calling path and whom it charges |

## 5. Results
Full output: `ledger/wo-notes/ai-t0.2-green.txt`.
- `qc-ai-t0.2` forced #1 (07:53Z): `🟢 T0.2: 41/41 (QC_FORCE) · missing deliverables: none · residue tag qc-ai-t0.2-0njb9v` · `JSON_SUMMARY {"total":41,"passed":41,"findings":[]}` · exit 0
- `qc-ai-t0.2` forced #2 (09:46Z, no deliverable edited in between): `🟢 T0.2: 41/41 (QC_FORCE) · missing deliverables: none · residue tag qc-ai-t0.2-yv65kb` · `JSON_SUMMARY {"total":41,"passed":41,"findings":[]}` · exit 0
- `qc-ai-t0.2` unforced: **not obtained at commit time** — the first attempt (09:49Z) ended with the wrapper's `flock -w 1800` timeout (exit 1, the oracle never started); a second attempt was queued at 10:23Z. Controller re-runs it.
- residue: S8.1 + S8.2 green in both runs (0 rows tagged `qc-ai-t0.2-*`, no temp dir, `git status` of the watched paths unchanged).
- seed inside the oracle: both runs `rows created this run: 0` · `AI_TEAM_SEED=unchanged` (≈ 30–35 s each).
- fitness (`scripts/fitness.mts`) without DATABASE_URL: `ผ่าน 42/42` · `FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0` · exit 0 — with the QC4 env exported: same, exit 0. F7.1 / F1.1 / F8.1 green (the draft is outside `prisma/schema/`).
- `scripts/fitness-ai-team.mts` on the repo: `JSON_SUMMARY {"total":3,"passed":3,"findings":[]}` · exit 0 (all three are ratchet passes today: the scanned files do not exist yet).
- typecheck: **INCONCLUSIVE / DEFERRED to the controller.** The one allowed run was started at 08:02Z; the agent harness stopped its wrapper shell after 30 min (machine load ≈ 60), `tsc` itself kept running inside its iso unit until 10:19Z and its exit code was lost with the shell. `tsconfig.tsbuildinfo` written by that run (TS 5.9.3, 3,691 files, including the four scripts of this WO) records no file with semantic diagnostics — an indication, not a proof.
- baseline regressions: not run by the builder (§8).
- Lock facts for the controller: QC4 lock waits were 5–30+ min all day; two wrapper invocations died on the 1,800 s `flock` timeout without starting.

## 6. Pictures
N-A (no UI in this WO).

## 7. Disputes / technical decisions (with evidence)

ORACLE-EDIT requests: **none**. No check was worked around.

Decisions taken by the builder that the controller should confirm (all reversible by editing a doc / the seed):

1. **`AiSettings.uiVersion`.** AI-TEAM-RUN §2 T1.10 reads `uiVersion` from `AiSettings.uiVersion` (default 1), but R-E C25 lists only `defaultApproverUserId`, `undoWindowSec`, `teamPausedUntil`. The draft's "T1.1 adds" block names `uiVersion Int @default(1)` as an addition to confirm. The API contract gives `GET /api/mobile/me` a top-level `uiVersion` (2 when any accepted membership's tenant is at 2) **and** `memberships[].uiVersion` — `/me` has no tenant header, so "the active tenant's value" cannot be computed there.
2. **Routes the T1.10 list does not have** (each marked ⚠ in its section):
   - `GET /api/mobile/team/tasks/[id]` — header + pending cards of one task room; A5 cannot be opened from a push / deep link without it, and the existing `GET /api/mobile/proposals` DTO has no amount / lines / class for the themed ProposalCard.
   - `DELETE /api/mobile/team/employees/[id]` — the T2.9 contract says "rollback ถ้าล้มกลางทาง = ลบพนักงาน" (S6) but no delete exists; specified as a rollback limited to a fresh, unused employee of the caller. Alternative for the controller: make `POST employees` accept `access` + `manual` in one transaction and drop the three-call sequence (then T2.9 S6 changes).
   - `POST /api/mobile/team/employees/[id]/manual/attach` — the B3 button "แนบเอกสาร SOP" (`attachDocument` of T1.5) has no route in the list.
3. **`manual/draft` during a hire**: the employee does not exist yet, the route has `[id]`. Contract: reserved id `new` + `positionKey`, charged to the tenant.
4. **A2 business switcher** has no cross-tenant summary route in T1.10 ("GET summary" is per tenant). Contract: `GET summary` once per membership with that tenant's header (cached 60 s) + `GET quota`. If the controller prefers one call, add `GET /api/mobile/team/summary/all` with `requireMobileUser`.
5. **A6 quota estimate**: instead of an extra estimate route, `GET schedules` returns `estimates[{aiEmployeeId, quotaPctPerRun}]`; the device multiplies by runs per month.
6. **Default employee and A8**: R-B says the default employee is "created lazily at read time". If the LIST route created it, a new shop could never show the empty-team screen (A8). Contract: `GET employees` never creates a row; `ensureDefaultEmployee` runs for shops that already used the assistant (legacy conversation read / first legacy chat) and in the T6.1 backfill.
7. **HTTP status of refusals**: 409 for the eight refusal codes and other state refusals, 403 for `not_commander` / `cannot_grant_beyond_self`, 404 for anything addressed by id that is foreign or invisible, 403 `forbidden` (today's `mobileDenied` shape) for a missing permission key on a collection route. AI-TEAM-RUN T1.10 S1 says "ร้านที่ไม่เป็นสมาชิก → 404" while `requireMobile` answers 403 today — the contract keeps `requireMobile` unchanged for the tenant header and uses 404 for ids; the controller rules whether team routes must also remap the membership failure to 404.
8. **DTO key `prompt`**: T1.10 S3 forbids a key named `prompt` in any DTO, so the frequent-task chip text is `orderText` in the API (the server-side template field may keep its name).
9. **D2 business type**: no dedicated field exists; contract = existing `POST /api/mobile/tenants` + existing `POST /api/mobile/dna/answers` (`industryHint`), as T2.12 says "บันทึกประเภทใน AiSettings/DNA ที่มี".
10. **Seed details beyond the oracle's minimum**: CRM `uiVersion` 2 for the three QC shops (same switch as the CRM QC shop; v1 AI tools are closed there and the registry tools are used) · `_maxApproveSatang` 2,000,000 on at-nid (so C8 "≤ ฿20,000" has real data) · AccountSystemLink ACCOUNT↔CRM · 6 members in the MEMBER system · a 4th, answered chat thread as a negative control · KB category "บัญชีเท่านั้น". No KANBAN board and no content/social data are seeded (see §8).
11. **Chat threads by raw prisma**, everything else through services — `receiveWebchatInbound` needs a `ChatChannelConnection`, notifies staff and calls `scheduleDrain()` (a global drain from a seed would run other lanes' events).
12. **Loader strictness**: `loadAiTeamQcEnv()` exits 4 when either variable is missing, unparsable or not QC4 — including a missing `DIRECT_URL` (the house loader tolerates that). It reads the QC env file only to learn the two hostnames when a variable is not exported, and prints the variable NAME only.
13. **qc-all on a non-QC4 database** does not run the seed and does not block the suites (they SKIP themselves — ruling OQ-8); on QC4 the seed runs every time (find-or-create, ~20 s when unchanged).
14. **Fitness severities**: AT-F16.1 CRITICAL · AT-F16.2 MAJOR · AT-F16.3 CRITICAL. F16.1 scans JSON string values (not keys), string literals of the app i18n file, and `const …Response = z.…` declarations of the route tree (keys included). F16.2 falls back to the repo's `skills.ts` when a temp root has none (so the T1.3 oracle can test a fake skill id with only a temp `templates.ts`).

Model-calling paths added by this WO: none.
Who gains / loses access after this WO: nobody (no product code). On QC4 only: four QC users and three QC tenants exist.

## 8. Debt / not done
| Item | Reason | Closed by |
|---|---|---|
| Baseline regression set not re-run by the builder | shared QC4 lock (5–20 min per run); no product code changed | controller (step 3 of COMMON §B) |
| `fitness-ai-team.mts` is not in the pre-commit hook / `package.json` | controller ruling (brief error 2): exercised by `qc-ai-t0.2` S6.1 on every `qc:all` | T6.x if wanted |
| No KANBAN board, no content/social posts, no POS data in AT-1 | not needed by any T0–T1 contract; T1.3 (`recommendPositions` "no post for 7 days") or the WO that needs it extends the seed (find-or-create makes that additive) | T1.3 / first WO that needs it |
| AI-team oracles cannot run on CI shards / QC1 (loader exits 4) | ruling OQ-8, debt D-1 | T6.1 |
| Outbox events of the first seed run are PENDING on QC4 | the seed must not drain a global queue | drained by the next suite that drains (normal behaviour) |
| API contract vs AI-TEAM-RUN deltas (§7 items 1–9) | need the controller's ruling before T1.10 / T2.x briefs are written | controller |

## 9. QC4 restored
- The oracle's `finally` deletes its canary tenant + user (`qc-ai-t0.2-<rand>`) and its temp dir — S8.1 / S8.2 green in every run.
- The three seed tenants + four users are permanent by contract. A repeated seed creates 0 rows (S1.2 / S1.3).
- Foreign tenants: S1.4 (three other lanes' seed tenants) + S1.5 (canary) unchanged across both seed runs.
- Scratch on this machine: `/tmp/ai-t0.2-mockups` (generated mockup HTML + doc drafts) — my own directory, safe to delete; nothing else left in `/tmp` by the builder.
