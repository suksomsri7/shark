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
