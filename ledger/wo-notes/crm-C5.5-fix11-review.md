# crm-C5.5-fix11 — independent review (set-based erase writes · expired-transaction classifier · re-erase finishes the follow-up)

Tree `/root/projects/shark-crm-c54d` branch `wip/crm-cf15` @ 92f5f682 (base 3e9930ec) · QC3 only · 2026-10-02 02:40 – 03:10 UTC.
Read: builder note `crm-C5.5-fix11.md`, `git diff 3e9930ec 92f5f682` (privacy.ts, privacy-shared.ts, kanban/links.ts), the Prisma 7.8
transaction manager (`@prisma/client/runtime/client.js`), `core/outbox.ts`, `platform/cron.ts`, `core/db.ts`, the Prisma schema of every
written model, and the QC3 catalog (column types, triggers, RLS). Product source not edited.

## What was run (QC3 · iso.sh + gate lock · one at a time · runner `scripts/pending/cf15/review/run-review.sh` as a /tmp copy · logs `/tmp/cf15-review-logs/rv1*`)
| run | result |
|---|---|
| **review eq probe on the BASE tree** (`probe-cf15-review-eq.mts base`, run from a detached worktree of 3e9930ec with `node_modules` symlinked) | dump 408 lines · CLEAN |
| same on base again (`base2` vs `base`) | **IDENTICAL** (fixture is deterministic) |
| review eq probe on the TIP, twice (`tip`, `tip2` vs `base`) | **IDENTICAL (408 lines) both times** |
| builder `probe-cf15.mts` regenerated independently on base (`rvbase`) then tip vs it (`rvtip rvbase`) | base: controls 6/6, findings 5/5 RED · tip: controls 7/7 incl. **Q1 identical**, findings 5/5 FIXED |
| review `probe-cf15-review.mts` (tip) | D1 X1 X2 W1 CLEAN — 5/5 |
| builder `probe-cf15-scale.mts 50000` | 70,000 rows rewritten in 7.6 s, 0 left |
| cf12 probes: probe-cf12 · probe-cf12-r2 · review · review-chain · review-scale 500 · review-r2 | 7/7+12/12 · 5/5+10/10 · 17/17 (T2/U1 not reproduced) · C1 not reproduced · 1,500 rows in 1.9 s (1.2 ms/row, was 10.2) · 10/10 — instrumented erase of the E fixture: **165 statements, 2.9 s wall** (was 5,168 statements, 53.4 s); E erase 2.2 s |
| `pnpm typecheck` (5120 MB) | exit 0, 0 errors |
| fitness | 39/39 |

The adversarial eq fixture (raw-SQL dump, so it sees what Prisma hides): JSON `null` vs SQL NULL (`IS NULL` + `jsonb_typeof`) in audit
`before`, nested identity keys, a top-level JSON string and array, `{"phone":null}`, `(เปลี่ยน)`, 12345678901234567890 / 1.5e300 / -0 /
0.1, emoji, ` `, escaped quotes and backslashes in names, mail addresses with comma/braces/quotes/backslash/`"NULL"`/`""`
elements, empty arrays, an `attachments` object instead of an array, QUEUED/SENT/RECEIVED mails with and without providerError,
set-2 mail, an unlinked QUEUED mail sent by him, activity attendees, deal changed/unchanged, stage note, deal-level activity, member
timeline with JSON data, kanban card with quoted title + null description, comment with emoji/backslash, kanban history with a big
number and with JSON `null` data, a portal-request card (redact path), and a RETENTION erase (masked-not-cleared branch).

## Claims check
- **SQL safety (a):** every value reaches SQL as a bind parameter — the captured statement text is `UPDATE "AuditLog" x SET … FROM
  unnest($1::text[], $2::jsonb[], $3::jsonb[]) …` (review-r2 P log). Identifiers: `ident()` (`privacy.ts:388`) accepts `^[A-Za-z]+$`
  and quotes; every `writeRows` call passes literals ("CrmEmailMessage", "CrmActivity", "CrmDeal", "CrmDealStageHistory",
  "MemberActivity", "AuditLog" and literal column lists); the kanban writers (`links.ts:589-623`) are fixed SQL text. All use the
  tagged `tx.$executeRaw` (no `Unsafe`). No `@map`/`@@map` on any written model or column (schema checked), so model names = table
  names; a wrong name would raise "column/relation does not exist" (loud), not update nothing. Unqualified table names resolve to
  `public` exactly like the existing raw SQL of this file.
- **Transaction (c):** every statement runs on the interactive `tx` passed down (`writeRows(tx …)`, `writeCardsInTx(tx …)`); the
  lock-timeout probe still rolls everything back (cf12-review T1).
- **Equivalence (b):** identical end state on both fixtures, including: JSON `null` before → SQL NULL in BOTH trees (old `asJson` →
  `DbNull`); `attachments`/`attendees`/timeline `data` → SQL NULL (= old `DbNull`); `KanbanActivity.data` is `jsonb NOT NULL` and a
  JSON-`null` row is never rewritten (unchanged ⇒ skipped) — if it were, the new writer sends JSON `null`, not SQL NULL (no NOT NULL
  violation); text[] rebuilt in order, `"NULL"`/`""` elements stay strings, `[]` stays `{}` (not NULL). All written JSON columns are
  `jsonb` (catalog) ⇒ key order/whitespace are not observable in either tree. Timestamps: all written timestamp columns are
  `timestamp without time zone`, session TimeZone GMT, `tsSql` = UTC wall time with ms (= Prisma's `@updatedAt`/Date writes); enum cast
  `'FAILED'::"CrmEmailStatus"` correct. `@updatedAt` exists only on CrmEmailMessage, CrmDeal, KanbanCard — exactly the three the
  writers set. No triggers and no RLS on the written tables (QC3 catalog); the only Prisma `$extends` are `tenantDb` (scoping) and
  two account read helpers — the erase always used the base client, so no extension/middleware is bypassed.
  Array alignment: every `unnest` argument is built from the same `page` by `map` ⇒ equal lengths by construction (no runtime assert).
  A row deleted concurrently between read and write is now skipped silently (the old per-row `update` threw P2025 and failed the
  whole erase) — strictly safer.
- **Size (d):** D1 — a RETENTION erase writing 25 × (1,000,000-char HTML + 1,000,000-char text) masked bodies through the pooled Neon
  connection in one statement per page: OK, 4.6 s, masked, no leak.
- **R2-3 (e):** a real expiry from the installed Prisma: `PrismaClientKnownRequestError P2028`, message "A query cannot be executed on an
  expired transaction …", `meta = {operation, timeout, timeTaken}` ⇒ classified (X1); a plain error mentioning transactions is not (X2).
- **R2-4 (f):** W1 — storage down on the first erase ⇒ PENDING, 3 files left, the approval cancelled; re-erase ⇒ DONE, 3 deletes, 0 left;
  third re-erase ⇒ DONE, 0 calls; the approval's `decidedAt` did not move (only PENDING rows are touched). Outbox: `core/outbox.ts`
  marks `FAILED` at attempt 5 (read); `outboxHealth` + `logOps("ERROR","outbox-health", …)` exists at `platform/cron.ts:364-372` — see L2
  for where it actually runs.

## Findings

### L1 · LOW · the TOO_LARGE classifier depends on Prisma's English wording
- `privacy-shared.ts:111-115` matches `/cannot be executed on an expired transaction/` on a P2028. A Prisma upgrade that rewords it ⇒
  `false` ⇒ rethrown ⇒ generic "ลองใหม่อีกครั้ง", no OpsEvent ERROR, no failed-attempt audit — i.e. silently back to the fix9 round-1
  M2 state (data-safe direction: the transaction is rolled back either way). The real error carries structured meta (X1:
  `{"operation":"query","timeout":50,"timeTaken":310}`). Fix: accept P2028 with a numeric `meta.timeout` OR the wording, and pin it with a
  check that forces a real expiry (the X1 block) in a suite that runs on upgrades.

### L2 · LOW · the "exhausted consumer ⇒ alert" path is daily and count-only (builder note says "after every cron drain")
- `outboxHealth(now)` is called only inside `runDailyCron` (`platform/cron.ts:364`, `/api/cron/tick`, schedule `0 20 * * *`), not by the
  hourly cron ⇒ up to 24 h before anyone hears of a dead `crm.contact.erased`; `dead` = `count(status = FAILED)` over all tenants and
  all time (never cleared) ⇒ once any event ever died, the same ERROR repeats every day (alert fatigue), and nothing names the event.
  The per-attempt `completeErasure` WARN (ids) is the only specific trail; re-erase (R2-4) is now the manual remedy. Not introduced by
  this card; recorded so the note's wording is corrected and C6 can decide (e.g. a per-type FAILED alert for `crm.contact.erased`).

### I1 · INFO · pre-existing behaviours the raw dump made visible (same in base and tip — not regressions)
- The audit scrub rewrites a changed row through JS numbers: 12345678901234567890 → 12345678901234567000, `-0` → 0, and unrelated
  numeric keys in the same row lose precision (au1/au2/ka1); unchanged rows are untouched. Harmless for audit text; worth knowing.
- JSON `null` in `before` becomes SQL NULL whenever the row is rewritten (old and new).
- Set-2 mail matching compares raw array elements (`lower(btrim(x.a))`), so a stored `"Name, alias" <addr>` element is not matched (my
  e3) — real rows are stored as bare addresses (`emails.ts:2579` `bareEmail`, outbound lists validated), so this is fixture-only.
- `updatedAt` of rewritten mails/deals = the erase's start time (`now`), slightly earlier than the old per-statement time; both are
  before commit. Any reader that syncs by `updatedAt > cursor` could already miss rows written in an open transaction; unchanged risk.

### I2 · INFO · statement size is bounded by rows, not bytes
- 1,000 rows per statement; D1 shows ~50 MB statements go through. The theoretical ceiling is a RETENTION erase whose 1,000-row page of
  mails carries > 1 GB of masked bodies in one array parameter (≈ 340 mails at the 1,000,000-character ingest cap with Thai text), which
  would fail with a generic error on every retry; the old per-row writer sent the same bytes one row at a time. Unrealistic today; a
  byte cap per page (e.g. ≤ 64 MB) would remove it.

## Owner questions
- None new. (Open from fix9: requester-visibility scope of the PDPA export · chain rows visible to a requester — untouched here.)

## Not verified
- Prod latency and the prod pooler's packet limits (all timings from this host to QC3); the hourly/daily cron path end-to-end
  (code-read); rows deleted concurrently during an erase (code-read: `UPDATE … FROM unnest` simply matches fewer rows); text with
  characters PostgreSQL cannot store (NUL) — cannot exist in the source rows; qc suites (the builder ran c3.9/c3.5/form/approval/
  kanban-k3.1 this round; not re-run by me).

VERDICT: MERGEABLE
