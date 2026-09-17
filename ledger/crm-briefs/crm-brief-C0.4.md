# C0.4 — Private files (decision C17)
Read `crm-brief-COMMON.md` first.

## Facts
`src/lib/storage/service.ts`: `uploadFile(ctx, input, deps)` returns a permanent public Bunny CDN `cdnUrl`; `deleteStoredFile(cdnUrl, {tenantId})`; `storagePathFromCdnUrl` (traversal-guarded); `ALLOWED_UPLOAD_TYPES`, `MAX_BYTES` 5 MB, `CHAT_ATTACHMENT_MAX_BYTES` 10 MB; model `FileAsset`. There is NO signed/expiring URL anywhere. CRM will store call recordings, inbound e-mail attachments, contracts and payment slips — none may be reachable by a permanent public URL.

## Design (decide details, keep this shape)
- `FileAsset` gains NO new column if avoidable: private files are marked by `kind` prefix (e.g. `private:crm-recording`) or an existing flag — if a column is truly needed, STOP and report (schema changes belong to migration work orders; C1.1 can carry it).
- Storage: upload private files to a path segment that is NOT served by the public pull zone, or (if the zone cannot do that) keep them in the same zone but under an unguessable path AND never return the CDN URL to any client — the only way out is the route below, which streams the bytes server-side. Document which one you chose and why.
- NEW route `GET /api/files/[id]?exp=<unix>&sig=<hmac>`: HMAC-SHA256 over `${id}.${exp}.${viewerKey}` with a server secret (reuse `SESSION_SECRET`; throw if missing); `exp` ≤ 15 min; `viewerKey` = staff userId or customer-session id so a leaked link does not work for someone else; streams with `Content-Disposition: attachment` unless mime is in a small inline allowlist (image/png, image/jpeg, audio/*); `Cache-Control: private, no-store`.
- Helper `privateFileUrl(fileId, viewer, ttlSec?)` (server only) used by DTO builders; authorisation of WHO may get a link stays with the calling module (CRM will pass its own `canSee` check) — the route re-checks tenant match.
- `uploadFile` gains `visibility?: "public" | "private"` (default public = unchanged bytes and result for every existing caller).
- `deleteStoredFile` works for private files (used by erase).

## Files you own
`src/lib/storage/*` · `src/app/api/files/[id]/route.ts` (new) · nothing else.

## Acceptance (oracle `qc-crm-c0.4`)
S1 public upload path byte-identical result shape to today (regression guard) · S2 private upload returns NO url field that is publicly fetchable (the oracle asserts the DTO has no `cdnUrl` and that the stored path is not under the public prefix or is never exposed) · S3 signed link works once generated, expires (exp in the past → 403), tampered sig → 403, other viewerKey → 403, other tenant → 404, path traversal in id → 404 · S4 attachment disposition for non-inline mimes · S5 delete removes both row and object (fake `put/delete` deps) · X10 all of the above · X7 route is rate-limited with `checkRateLimitDb` per viewer.
Regressions: `qc-storage`, `qc-chat-attachments`, `qc-acc-v2-attachments`, `qc-kanban-k1.9`, `qc-kanban-k1.15`, `qc-kanban-k3.7` (card attachments), `qc-member-fix-s4` (erase deletes files).

## Controller addendum 2026-09-17 (verified against `session/crm` @ C0.3 `a30a0a6`)
Facts in the brief re-checked against the code. They hold, with ONE correction that changes the design, plus the
decisions that follow from it.

### 🔴 CORRECTION — the `kind`-prefix idea in the brief AND in RESOLUTIONS R-E 2 is impossible without a migration
`FileAsset.kind` is **an enum** (`enum FileKind { LOGO ATTACHMENT }`, `prisma/schema/storage.prisma`), not a free
string, so `kind = "private:crm-recording"` cannot be stored. RESOLUTIONS R-E 2 says exactly that ("`FileAsset.kind`
prefixed `private:`") and is, on this single point, **not implementable as written**. The brief itself says to stop
and report rather than add a column, so here is the decision instead:

**DECISION — privacy is carried by the PATH, and `cdnUrl` never holds a working URL for a private file.**
1. `path` for a private file is `t/<tenantId>/private/<unguessable>.<ext>` — a distinct segment from today's
   `t/<tenantId>/<kind>/<id>.<ext>` (`storage/service.ts:155`). The `private/` segment IS the marker; `kind` stays
   `ATTACHMENT`. No schema change, and it is queryable (`path startsWith`).
2. `cdnUrl` is NOT NULL, so a private row stores a **sentinel that is not a URL** (e.g. `private://<path>`), never the
   public CDN URL. Nothing can then hand out a working link by accident, and a grep for the CDN base finds no private
   rows. You own `storagePathFromCdnUrl` and `deleteStoredFile` — make them understand the sentinel (delete must still
   remove the real object).
3. The unguessable part must come from a CSPRNG (≥128 bits), NOT from the row id.

### Residual risk to record, not to solve here
The Bunny pull zone serves the whole storage zone, and configuring a zone rule or token auth needs the Bunny account
credentials, which this RUN does not have (`BUNNY_ACCOUNT_KEY` is still outstanding with the owner). So a private
object IS still fetchable by anyone who learns the exact URL — the protection is that the URL is never generated,
never stored and never returned. Say this plainly in your report; I will record it as debt for the owner to close
later (zone rule or Bunny token auth), and the oracle must assert the weaker-but-real property: **no code path returns
a fetchable URL for a private file.**

### Verified present, use these exact names
- `SESSION_SECRET` exists in the env schema (`src/lib/env.ts:9`, min 32 chars) — use it for the HMAC and throw if absent.
- `checkRateLimitDb` is at `src/lib/core/rate-limit-db.ts:37` — the X7 requirement uses this, no second limiter.
- `getCustomerSession` is at `src/lib/modules/member/customer-session.ts:392` — the customer-side `viewerKey`.
- `uploadFile(ctx, input, deps)` `storage/service.ts:120`, path built at `:155`; `storagePathFromCdnUrl` `:233`
  (traversal-guarded); `deleteStoredFile` `:254`; `ALLOWED_UPLOAD_TYPES` `:69`; `CHAT_ATTACHMENT_MAX_BYTES` `:73`.
- `uploadFile` already takes an injectable `deps.put`, which is how the oracle can test without touching Bunny.

### Standing requirements
- `visibility` defaults to `"public"` and the public path must stay **byte-identical** for every existing caller —
  same `path` shape, same `cdnUrl`, same result object. That is oracle S1 and it is the regression guard for LOGO
  uploads, chat attachments, accounting attachments and kanban card attachments.
- The signed link binds to ONE viewer: a link minted for staff user A must 403 for staff user B and for any customer
  session, and vice versa. A leaked link is useless to anyone else, and useless after 15 minutes.

### Controller decisions on the oracle's questions (2026-09-17) — these bind the builder
1. **`visibility` lives on the upload INPUT**: `uploadFile(ctx, {…, visibility: "private"}, deps)`. Default `"public"`.
   Do not add a separate `uploadPrivateFile` export.
2. **One function deletes BOTH halves**: `deleteFileAsset(ctx: {tenantId}, assetId: string, deps?)` — tenant-checked,
   idempotent, removes the row AND asks storage to delete the REAL path (never the sentinel string, never the id).
   `deleteStoredFile` additionally learns the sentinel, because the PDPA erase path (C3.9) hands it whatever is in
   `cdnUrl`.
3. **`privateFileUrl(fileId, viewer, ttlSec?)`** with `viewer = { kind: "STAFF" | "CUSTOMER", id: string }`. One shape,
   no aliases — the oracle probes several spellings only so it can fail loudly rather than silently.
4. **`Cache-Control: private, no-store` on 403 and 404 as well** — confirmed, MAJOR. That means returning an explicit
   `Response`; `notFound()` carries no headers and will go red. A cacheable denial is a cache-poisoning and
   information-leak lane, so this is deliberate.
5. **Failed-signature requests ARE rate-limited** — confirmed, MAJOR. Otherwise the one lane with no ceiling is
   precisely the guessing lane, which is the lane an attacker uses.
6. **The per-viewer limit is 60 requests per 60-second window.** That satisfies both bounds the oracle asserts
   (≥10 consecutive successes for a page full of attachments, a 429 well inside 200) and is a number a real CRM page
   cannot trip by accident.
7. **`text/plain` is NOT in the inline allowlist** — confirmed. The inline allowlist is exactly `image/png`,
   `image/jpeg`, `audio/*`; everything else is `Content-Disposition: attachment` (stored-XSS lane).
8. Rate-limit buckets go through `checkRateLimitDb` unchanged — no second limiter, no bespoke key derivation.

Accepted as designed: `C0.4-S3.17` may report the third state `⚪ NOT PROVEN` when the signature recipe cannot be
recovered; that is honest reporting, not a pass. `X10.7` (`SESSION_SECRET` has no `??`/`||` fallback) stays `[static]`
because env is parsed once at import.
