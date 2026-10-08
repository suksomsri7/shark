# C5.4 batch A — HUNTER (security + platform) · 28 Sep 2026 · read-only

Tree: main working tree (HEAD + uncommitted batch A). Probes: `scripts/pending/hunt-54a/` (probe-ssrf / probe-pinned / probe-hang = no DB;
probe-54a = QC2 throwaway tenant `qc-hunt54a-qqqqqfeq`, deleted — tenantsLeft=0, log `probe-54a.log`).

## Findings

**H1 · MAJOR · CONFIRMED — CRM deal rows still reach the customer through `me.history` (L1-m5 half-fixed)**
`src/lib/modules/member/history.ts:589-640` (`listHistory`) has no CUSTOMER filter for module `crm`; `history-kinds.ts:38` maps module
`crm` to kind `purchase`; `member/api/ops/me.ts:295-322` (`GET /api/v1/member/me/history`, customer lane) keeps `purchase`.
Probe: CUSTOMER actor, rows crm/DEAL_WON + pos/PURCHASE → `listHistory` returns `purchase: ปิดดีลสำเร็จ | ปิดดีล "ดีลภายใน-กำไร40%" สำเร็จ · ฿123,456`;
`listActivity` (the fixed path) hides it. Fix: in `listHistory` when `actor.role === "CUSTOMER"` push `{ module: { notIn: STAFF_ONLY_MODULES } }`
into `base` (covers list + groupBy); export the constant from one place (activity.ts) so both readers share it.

**H2 · MAJOR · PLAUSIBLE (code read, not executed) — member half of the account link is still ungated + overwrites**
`src/lib/modules/account/contact-links.ts:202-204` → `member/service.ts:531-542` `setCustomerPartyId`: no viewer/permission, unconditional
`updateMany {partyId}` (overwrites a different canonical Party — exactly L1-M3's "partyId OVERWRITTEN", member side). `suggestLinks`
(`contact-links.ts:105`) returns member name/code/phone/email to an account-only user. New interaction: the C5.4 guard in
`member-bridges.ts:637-655` then sees `linked.partyId ≠ contact.partyId` ⇒ CRM deal-won → member timeline/points silently stop for that
customer (WARN only). Scenario: accountant (no member.* key) links account contact X to customer id C that already belongs to Party P ⇒
C.partyId = X's party. Fix: mirror the CRM facade — viewer arg (`member.customer.read`/`update` + visibility), CONFLICT when canonical differs,
conditional write on the read partyId.

**H3 · MAJOR (pre-existing, Q3) · CONFIRMED — transient DB errors are stored as 422 and replayed 24 h**
`src/lib/api/respond.ts:307-308` maps any non-Thai error (Prisma P2034 write-conflict/deadlock, P2024 pool timeout, P1001/P1017 connection)
to 422 `unprocessable`; `idempotency.ts:36,257` stores it. Probe: first run throws P2034 → 422; retry with same key → 422
`Idempotent-Replayed: true`, handler ran once — the write never happens and the client is told its request is invalid. Fix: in `mapError`
map Prisma codes P1001/P1002/P1008/P1017/P2024/P2028/P2034 (and fetch/ECONNRESET) to 503 ⇒ `isTransientStatus` already drops them.

**H4 · MINOR · PLAUSIBLE — lease (60 s) shorter than a live function (300 s)**
`core/outbox.ts:18` LEASE_MS 60 s vs one event whose handler legitimately takes > 60 s (tenant with ≥10 slow/blackholed endpoints:
per endpoint ≤1.5 s DNS + 5 s; or several CRM/kanban WEBHOOK rules). A second drainer re-claims while the first is alive ⇒ all
non-deduped consumers run twice, webhooks re-sent (`webhooksAlreadyDispatched` keys on `attempts`, still 0). If the handler also throws
and another drainer keeps overtaking, the FAIL write (`outbox.ts:289`, `availableAt: lease`) never lands ⇒ attempts never grows ⇒ no
FAILED cap; every cycle re-dispatches webhooks. Idempotency uses 6 min > 300 s for the same reason; outbox does not.
Fix: LEASE_MS ≥ 6 min (crashed events wait longer, acceptable) or renew lease per webhook endpoint; key the webhook guard on
WebhookDelivery rows for this event id rather than `attempts`.

**H5 · MINOR · PLAUSIBLE — v1 typed phone disappears once the note gets a second line**
`crm/contacts-shared.ts:352` regex ends with `$` and `.` excludes `\n` ⇒ if staff append text to the note in v2, `legacyTypedPhone` → null and
the v1 list shows `c.phone` (null for "081-234"). Fix: `/m` flag or stop at `\n`.

## Tried and held
- SSRF (APP_ENV=production transport): 18 URL forms → 0 loopback hits (nip.io v4/https, localtest.me→::1, [::1], [::ffff:127.0.0.1],
  0x7f.1, 2130706433, 127.1, 0, [::], fullwidth ①②⑦, %2e, userinfo, 0.0.0.0.nip.io, [0:0:0:0:0:ffff:7f00:1], LOCALHOST., trailing dot,
  [::127.0.0.1]); public example.com 200 (positive control). `pinnedFetch` alone (bypassing the pre-check) refuses nip.io http+https,
  localtest.me, localhost, [::ffff:7f00:1]; rbndr rebinding host 12/12 blocked, 0 hits. Trickling body aborts at timeout (1503 ms),
  oversize rejects at maxBytes — no hang. Zone ids rejected by WHATWG / stripped then fe80 blocked; 3xx never followed and neither
  Location nor body is stored (lastError = status only) ⇒ no oracle beyond public-host status. Fallback path needs APP_ENV development|test;
  unset APP_ENV ⇒ pinned (fail-safe). No prod caller injects `fetch`/`post` deps. `payloadJson`/`$sharkEventId` not exposed anywhere.
- Outbox: DONE-only-if-PENDING + FAIL-only-with-own-lease: no DONE→PENDING flip, no row stuck (unowned lease always re-claimable);
  timestamp(3) equality safe. Old code during deploy can still flip once (transient).
- Idempotency: takeover CAS on createdAt single winner; ex-owner's late write/delete scoped out; unique (keyId, idemKey) + hash of
  method+path+body ⇒ no cross-tenant/key/method collisions; query string unused for writes. No route sets maxDuration > 300 s.
- v1 automation: advisory lock + findFirst + create in one tx is correct under READ COMMITTED; key = rule + OutboxEvent.id ⇒ different
  events never suppressed; hash collisions only serialise.
- Viewer: every account path passes session/API viewer; `"system"` unreachable from user input; API-key viewer keeps `crm.filter.*`
  scopes (key filters preserved) and has no implicit read.
- BE year (only changed values), honorific glued list (นางนวล/คุณากร/นายิกา not split), first-valid e-mail — no loss found.
