# T0.2 — oracle notes (oracle writer → controller)

> Oracle `scripts/qc-ai-t0.2.mts` · branch `wip/pos-ai-t0.2-oracle` · base `session/ai-team` 71a1f363 · 8 Oct 2026
> Contract = the header of the oracle (sections [1]–[6]). Red/SKIP output on the base: `ledger/wo-notes/ai-t0.2-red.txt`.
> Not committed, not pushed. No product file was created or edited.

## 1. How it runs
- Unforced: SKIP + exit 0 while `scripts/ai-team-qc-env.mts`, `scripts/seed-ai-team-qc.mts` or `scripts/fitness-ai-team.mts` is missing (no DB connection is opened). Also SKIP + exit 0 when the database is not QC4 (`ep-frosty-lab`) — so `qc:all` on CI / QC1 does not go red or write (forced on a non-QC4 host = exit 4).
- Forced (`QC_FORCE=1`): every check runs; anything missing is a RED check with the reason in `act`; no stack trace. The total is fixed (41) in every run — a section that crashes turns its own ids red.
- Exit 1 iff a CRITICAL/MAJOR check fails (one MINOR check: S5.5).
- Missing deliverables are reached only by `await import("./ai-team-qc-env.mts" as string)` and by child processes (`node_modules/.bin/tsx <file>`), so the file type-checks today. The builder's env module is imported into the oracle's own process only after it loaded cleanly in a child (S4.4).
- What the oracle writes: one canary tenant + user tagged `qc-ai-t0.2-<rand>` (deleted in `finally`), temp dirs under `os.tmpdir()/qc-ai-t0.2-<rand>` (fitness roots, schema copy). Nothing in the worktree. The three seed tenants are permanent and never deleted here.
- Child output (seed, loader, fitness, prisma) is never echoed raw: connection URLs and every secret-looking env value are redacted before printing.
- Base result (8 Oct): forced `2/41`, exit 1 (39 red, each for "file missing" / "tenant not found" / "seed did not run"; S8.1 + S8.2 green, residue 0) · unforced SKIPPED, exit 0. With the deliverables present the cost is 2 seed runs + 6 loader children + 10 fitness runs + 2 `prisma validate` (~2 s each).

## 2. Checks (41 = 24 of the contract + 11 extra S + 6 X)
| id | sev | proves |
|---|---|---|
| S1.1 | CRIT | seed runs twice, both exit 0; exactly the three tenants `qc-ai-team-at1/at2/atx` carry the prefix |
| S1.2 | CRIT | after run 2 the row count of **every** table with a `tenantId` column is unchanged for AT-1/AT-2/AT-X (per tenant × table) |
| S1.3 | CRIT | `atIds()` has the 7-key shape, equals the rows found by slug/e-mail, is the same after run 2; md5 of the sorted id list of 13 seeded tables is unchanged (find-or-create, not delete-and-recreate) |
| S1.4 | CRIT | up to 3 foreign seed tenants picked at runtime (`siam-dive-qc`, `siam-dive-member-qc`, `siam-dive-kanban-qc`, else the oldest non-`qc-` tenants): Tenant row + counts of Membership, AppSystem, AiConversation, AiProposal, CrmContact, AccountDocument, KbArticle, ApprovalPolicy unchanged; a difference names the tenant slug in `act` |
| S1.5 | CRIT | a canary tenant + user (`qc-ai-t0.2-<rand>@qc.shark`, i.e. the seed's own e-mail domain) created by the oracle is byte-identical after both seed runs — the leak detector that a concurrent lane cannot disturb |
| S1.6 | CRIT | [static] seed source: prefix present, no slug-like literal outside `qc-ai-team-`, no e-mail outside `@qc.shark`, no `deleteMany()` without where, no TRUNCATE / `DELETE FROM` without WHERE, no Tenant delete, no import of another lane's QC env |
| S1.7 | MAJOR | [static] `scripts/qc-all.mts` knows the marker `requires: ai-team-seed` and names `seed-ai-team-qc.mts` (deliverable 8) |
| S2.1 | CRIT | AT-1, AT-2, AT-X each have an active AppSystem of ACCOUNT/CRM/CHAT/MEMBER/KANBAN |
| S2.2 | CRIT | AT-1 has exactly 3 members, all accepted: at-owner OWNER · at-nid MANAGER · at-staff STAFF |
| S2.3 | CRIT | ≥ 20 CrmContact (not archived) in AT-1's CRM system |
| S2.4 | CRIT | ≥ 5 CrmDeal in AT-1's CRM system |
| S2.5 | CRIT | ≥ 3 open invoices (INVOICE · OUT · docNo set · AWAITING_PAYMENT/PARTIAL · grandTotal > paidTotal) |
| S2.6 | CRIT | ≥ 3 chat threads waiting for a reply (OPEN · lastMessageDirection IN · a real IN ChatMessage row) |
| S2.7 | MAJOR | ≥ 3 active KbArticle over ≥ 2 categories |
| S2.8 | MAJOR | active ApprovalPolicy `AccountDocument`, thresholdSatang 2,000,000, ≥ 1 step |
| S2.9 | MAJOR | permission keys: at-nid `account.doc.approve` + `crm.commission.approve`; at-staff `ai.chat.send` + `ai.employee.use` |
| S3.1 | CRIT | AT-1 and AT-2 each have one accepted OWNER and it is the same user (at-owner@qc.shark) |
| S3.2 | CRIT | AT-X's single OWNER is ax-owner@qc.shark, a different user; the two owners share no tenant |
| S4.1 | CRIT | loader spawned with a fake production URL (`ep-royal-night…invalid`) exits 4 |
| S4.2 | CRIT | exits 4 for: QC1 host · unknown host · URL with `ep-frosty-lab` only as user/db/option · good DATABASE_URL + production DIRECT_URL |
| S4.3 | CRIT | none of the 5 refusals prints the URL, user, password or database name, and none returns from the loader |
| S4.4 | CRIT | positive control: on the real QC4 env the loader returns (exit 0); module exports `loadAiTeamQcEnv`, `atIds`, `withInjectedNow` |
| S5.1 | CRIT | [static] the `Screen`/`Routes` table has exactly one row per screen id (36), no ranges, each with ≥ 1 route or `client-only` + reason |
| S5.2 | CRIT | [static] every route in the table has a `### METHOD /api/mobile/…` section; every section has Auth (naming a helper), Permission, Request, Response, Errors, Rate limit and a zod code block |
| S5.3 | CRIT | [static] sections for the 29 T1.10 routes + `/me` (uiVersion) + `/usage` (9 frozen keys) + one route per later family (notify-prefs, people, packs, sale-notify, inbox/teach, actions, promotions, report, knowledge, rooms, flows); `GET inbox` uses `requireMobileUser` |
| S5.4 | MAJOR | [static] `docs/modules/30-ai-team.md`: M1–M9 headings, the 18 team files, the 8 refusal codes, AiTask, `ai.flow.triggered` |
| S5.5 | MINOR | [static] fixtures README exists and names the keys |
| S6.1 | CRIT | fitness-ai-team on the repo: exit 0, JSON_SUMMARY, F16.1/F16.2/F16.3 all reported |
| S6.2 | CRIT | temp root with `src/messages/th/ai-team.json` containing "token" ⇒ exit ≠ 0, finding F16.1 naming the file |
| S6.3 | MAJOR | same for โทเคน, บาทต่องาน, ค่าแรง, wage, the mobile i18n file, and a `wage` key in an API response schema (6 cases) |
| S6.4 | CRIT | controls: clean files in all three locations stay green; an empty root passes (ratchet) |
| S7.1 | CRIT | temp copy of `prisma/schema/*.prisma` + the draft passes `prisma validate`; adding a broken control file makes it fail |
| S7.2 | CRIT | [static] draft: 15 models, 5 enums with exact values, `tenantId String` on all but AiSubscription, keys/uniques of the brief, no `employeeId`, "T1.1 adds" comment block |
| S8.1 | MAJOR | 0 rows tagged `qc-ai-t0.2-*` (tenant, user, rows by tenantId, kb/policy/system by name) |
| S8.2 | MAJOR | no temp dir left; `git status` of src/messages, apps/mobile/src/i18n, src/app/api/mobile/team, prisma, docs identical before/after |
| X1.1 | CRIT | seed users are members only of their own seed tenants and of no foreign tenant |
| X1.2 | CRIT | seed tenants contain only seed users (3 / 1 / 1) |
| X1.3 | CRIT | no AT-* row points at a system of another tenant (11 system columns) or names a user who is not a member of that tenant (3 user columns) |
| X10.1 | CRIT | [static] docs, seed, loader, fitness, draft: no key/URL patterns, no live value of any secret-looking env var of this environment, no `".env"`, no own `loadEnvFile`, seed loads env via `loadAiTeamQcEnv()` |
| X10.2 | CRIT | output of both seed runs, the loader children and the fitness runs carries no URL/secret |
| X10.3 | CRIT | [static] outside `/api/mobile/usage` no code block of the API doc has a `…Micro` field or `systemPrompt` |

## 3. Things the header fixes that the brief left open (controller: confirm or change before the builder starts)
- **OQ-1 `FITNESS_AI_TEAM_ROOT`.** The contract says "F16.1 red on a temp file". Writing a temp file into `src/messages/…` of a shared worktree risks a concurrent build/commit picking it up, so the oracle uses temp roots in `os.tmpdir()` and requires the fitness script to honour `FITNESS_AI_TEAM_ROOT` (default repo root). This is an addition to the brief.
- **OQ-2 Draft location.** The brief puts the draft at `prisma/schema/ai_team.prisma` and says "not in scope.ts yet". `scripts/fitness.mts:50–53` reads every `prisma/schema/*.prisma` model; F1.1 (`:167`, CRITICAL) needs each in `scope.ts`, F8.1 (`:213`, CRITICAL) needs each in a migration SQL. A draft in that folder makes `pnpm fitness` (and the pre-commit hook) red until T1.1, and `prisma generate` would emit client models for tables that do not exist. The oracle accepts either `prisma/schema/ai_team.prisma` or `prisma/drafts/ai_team.prisma` (first found) and validates a temp copy. Recommended: `prisma/drafts/`.
- **OQ-3 "customers ≥ 20".** Fixed as `CrmContact` (the brief lists it next to deals). Member `Customer` rows are only printed in `act`. Say so if the member system must also carry ≥ N customers.
- **OQ-4 E-mails and memberships.** Addendum gives the owner e-mails; the oracle fixes `at-nid@qc.shark` and `at-staff@qc.shark` by analogy and requires exact membership sets (AT-1: 3 people, AT-2: owner only, AT-X: other owner only). If the approver should also sit in AT-2 (T1.9 cross-tenant inbox), X1.1/X1.2/S2.2 need an edit.
- **OQ-5 Permission keys (S2.9, MAJOR).** `account.doc.approve` and `crm.commission.approve` exist today (`src/lib/core/permissions.ts:525`, `:452`); `ai.employee.use` does not (only `ai.chat.send`, `ai.schedule.create` at `:664–665`). The oracle requires the key to be stored in `Membership.permissions` as-is today. If an unknown key in that JSON is a problem anywhere, drop it from S2.9 until T1.2.
- **OQ-6 Threshold.** "20,000 satang×100" read as 2,000,000 satang = 20,000 baht.
- **OQ-7 `atIds()`.** Shape as in the addendum; the oracle awaits it (sync or async both pass) and requires it to resolve by slug/e-mail from the database (it is compared against an independent lookup, before and after run 2).
- **OQ-8 Loader on CI.** A loader that exits 4 on every non-`ep-frosty-lab` host means AI-team oracles cannot run on CI shards (fresh Neon branches) or QC1. This oracle SKIPs there; later AI-team oracles need the same guard or the rule needs a CI exception.
- **OQ-9 Doc format.** The API doc format is fixed in header [5] (level-3 heading per method+path, six labelled lines, one `Screen | Routes` table with 36 single-id rows). Combined headings like `GET/PATCH employees/[id]` and range rows like `B1–B6` are rejected on purpose so the parse is exact.
- **OQ-10 F16.1 on API files.** Scanning whole route files for "token" would hit legitimate code (Bearer token handling). The contract limits F16.1 there to zod response schemas (keys included); the oracle's API case uses a `wage` key in `ZTeamProbeResponse`. MAJOR, not CRITICAL.

## 4. Found wrong / inconsistent in the brief (evidence)
1. **Fitness id collision.** `scripts/fitness.mts` already has F16.0/F16.1/F16.2 = "no tag-stripping regex" (`:904–937`). The new file reuses F16.1–F16.3 with another meaning. Two different "F16.1" will appear in notes and reports. The oracle only reads the ids from `fitness-ai-team.mts`'s own output, so it works either way; renumbering (e.g. F17.x) is a controller call and would need an oracle edit of the id strings.
2. **"Registered automatically by qc-all discovery" is not true for the fitness file.** `scripts/qc-all.mts:64–67` discovers `^qc-.*\.mts$` only; `fitness-ai-team.mts` is not picked up. `package.json` runs fitness as `tsx scripts/fitness.mts`; there is no `.husky`, the hook is `.githooks/pre-commit:7` and enumerates exactly that one file (note: `core.hooksPath` of this worktree points at the absolute path `/root/projects/shark-in-th/.githooks`, i.e. the hook of ANOTHER tree runs on commit — a hook edit in this branch has no effect until it reaches that tree). The builder has to wire the new file explicitly (package.json script + `.githooks/pre-commit`, or a call from `fitness.mts` — the latter is a shared hot file); the oracle does not assert that wiring.
3. **Draft inside `prisma/schema/`** conflicts with F1.1/F8.1 — see OQ-2.
4. **Paths that do not exist yet:** `src/messages/th/` holds only `common.json`; `apps/mobile/src/i18n/` does not exist. Fine for a ratchet ("missing files = pass"), noted so nobody reads a green F16.1 as coverage.
5. **`scripts/acc-v2-env.mts` loads `.env.qc` by fixed name** (`ENV_FILE`, not `QC_ENV_FILE`); it works under `qc4.sh` only because exported variables win over the file. A wrapper that must refuse by host has to check the exported `DATABASE_URL`/`DIRECT_URL` before calling it, otherwise a production URL exits 1 from the old loader instead of 4 (S4.1 would be red).

## 5. Not verified
- Type-check of the oracle under `next build` / `pnpm typecheck` (not allowed in this role). Written for `target ES2017`, strict: no regex `s` flag, no named groups; `any` only through the house `type Any`.
- The green path: no deliverable exists, so the DB sections were exercised only on "tenant not found". The doc/schema parsers were exercised on synthetic input (one-off script outside the repo, deleted).
