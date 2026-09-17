# CRM v2 — COMMON brief (every agent reads this first)

Authoritative plan: `ledger/CRM-MASTER-PLAN.md` (§2 hard rules · §3 twelve gates · §4 X-groups · §5 steps). Spec: `docs/modules/20-crm-v2.md` (+ §15 addendum). Real-code name corrections: `ledger/REVIEW-CRM-DESIGN-2026-09-18.md` §3 — **the blueprint was written before later work landed; when a name in the blueprint differs from the code, the code + REVIEW §3 win.** **Decisions that override every other document: `ledger/crm-briefs/crm-brief-RESOLUTIONS.md` (read it right after this file).** Per-work-order brief: `ledger/crm-briefs/crm-brief-<WO>.md`. Contract check-lists: `ledger/CRM-RUN.md` §2.

## Machine and database (violations kill the session or corrupt shared QC data)
- Worktree `/root/projects/shark-crm`, branch `session/crm`. Never touch other worktrees, never sweep `/tmp`.
- NEVER read or edit `.env` (production). NEVER `source` any env file. QC DB only: scripts self-load `.env.qc` (`QC_ENV_FILE=.env.qc`).
- Every tsx / tsc / pnpm / build command: `bash scripts/iso.sh <command>` in the FOREGROUND (the agent cgroup is capped at 5 GB; `next build` peaks at 5.6 GB and the whole session is OOM-killed otherwise). Never background a command and wait for a monitor.
- DB-mutating oracle runs are serialized: `bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<file>.mts`. Never wrap `scripts/acc-v2-serve.sh` in with-gate-lock (it locks itself). Never kill an oracle mid-run (cleanup lives in `finally`).
- The QC DB is shared by all sessions and `drainOutbox` is not tenant-scoped: tag every temp row/event you create (`qc-<wo>-<rand>`), assert only on your own rows, drain before cleanup.
- Builders/oracle writers/reviewers: NO `next build`, NO `git commit/push`, NO `prisma migrate` (except the builder of a migration work order, on QC only), NO edits outside the files the brief says you own.

## Code rules
- This is a custom Next.js: read `node_modules/next/dist/docs/` before using a Next API you are not sure of. `"use server"` files export only async functions (no `export type`). `'use client'` files never import a module that reaches prisma — put shared types/constants in `*-shared.ts`.
- No `any` in `src/` (scripts may use `type Any = any`). zod v4. Money = integer satang. Thai time = explicit +07:00 helpers (never raw `getDay()/getDate()`). Thai error messages that never blame the user.
- Cross-module calls only through the target module's `index.ts` facade + an `ALLOWED_EDGES` entry in `scripts/fitness.mts` with a reason. No second engine for: custom fields, automation, op registry, communication-action runner, customer login, SSRF guard (`webhookTargetProblem`), rate limit (`checkRateLimitDb`), CSV (`csvRow`).
- Every mutation: `ctx {tenantId, systemId, actorUserId|null}` + actor; re-resolve `systemId` against the session tenant (type `CRM`) — never trust ids from the client; `visibleWhere(actor, entity)` on every read; audit row; outbox event emitted INSIDE the same transaction.
- New outbox event ⇒ same work order adds: consumer in `src/lib/outbox-consumers.ts`, label in `src/lib/automation/labels.ts` or `src/lib/webhooks/labels.ts` (exactly one of them declares it; WEBHOOK_EVENTS spreads AUTOMATION_EVENTS). Payloads carry ids only — no phone, e-mail, full name, e-mail body, transcript. CRM consumers are "extras" under the `compose` contract: an extra that fails logs WARN and never fails the main consumer; a failing main consumer never starves the extras.
- The X-group rules of MASTER-PLAN §4 are requirements, not suggestions. Mark each implementation site with `// AUDIT-CLASS X<n>: <why>`.
- UI: every clickable/typable element has a `data-testid` and a row in `scripts/crm-ui-inventory.json` (schema in MASTER-PLAN §7). Every page works at 1440 px and 390 px with no horizontal overflow. Inline validation, never `alert()`.

## Oracle house style (oracle writers)
Model on `scripts/qc-crm-c1.1.mts` and `scripts/qc-member-fix-s2.mts`: SKIP guard when prerequisites are absent · `chk(id, title, ok, expected, actual)` with ids `C<wo>-S<g>.<n>` (functional, exactly as listed in CRM-RUN §2 plus the brief) and `C<wo>-X<k>.<n>` (X-groups) · races on SEPARATE connections (≥10 parallel, repeat rounds) · consumers exercised twice and twice-in-parallel · cron pick-ups exercised as two overlapping runs + a simulated crash after claim · snapshot/restore anything seeded, delete temp rows in `finally` · last line `JSON_SUMMARY {...}` · header comment `// requires: crm-seed` · dynamic `await import("…" as string)` for modules that may not exist · file must type-check under `next build`.

## Reports (all agents, English, compact)
Per acceptance item → files:lines → how → result; DEFERRED + reason; final summary line of each command run; ORACLE-EDIT requests (check id · exact hunk · reason); decisions the controller must make; temp data left behind (should be none).

## Facts every builder trips over (verified 18 Sep on main)
- Every new `page.tsx` under a module must be registered in that module's nav file or `scripts/qc-nav-functions.mts` fails (member example: `src/lib/modules/member/nav.ts` → `MEMBER_DEEP_NAV`; drawer wiring in `src/app/app/layout.tsx`). CRM gets `src/lib/modules/crm/nav.ts` in C1.3 (first UI work order) and every later UI work order appends to it.
- Write module settings with the single-statement `jsonb_set` pattern (`writeMemberSettingsKey` in `src/lib/modules/member/reviews.ts:154`) — never read-modify-write the whole `AppSystem.settings` JSON (lost-update window).
- Page guard pattern (404-not-403): `requireTenant()` → `prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } })` → `notFound()` → build actor → permission/visibility check → `notFound()`.
- There is no `Team` model today; `MemberSavedView.scope="TEAM"` currently means "whole tenant".
- Party: `safeFindOrCreate(tenantId, { name, phone?, email?, taxId?, branchCode?, kind? }, tx?)` never throws and returns `string | null`.
- Outbox: `emitOutbox(tx, { tenantId, type, idempotencyKey, payload?, systemId?, unitId? })`; `emitOutboxOutsideTx` is only for events whose loss costs nothing.
- Account events carry NO partyId and NO sourceDocId (only `documentId`, sometimes `contactId`) — CRM must look documents up through the account facade.
