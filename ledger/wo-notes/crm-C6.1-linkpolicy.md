# C6.1-LINKPOLICY — destination policy for tracked short links `/l/<code>` · builder · 7 Oct 2026

Owner decision P11/Q15 (7 Oct 2026): option (ข) destination policy. Branch `wip/crm-c61-linkpolicy` (from origin/session/crm 3675fb09) · worktree `shark-crm-c61l`.
Commits: 5894f471 (product + probe + inventory + docs) · 73c1bf18 (ORACLE-EDITs, controller approves) · this note.

## Policy rules (exact)
One pure, synchronous verdict `linkDestinationVerdict(url, entries, blocklisted)` (`tracking-shared.ts`), wrapped by
`linkDestinationCheck/linkDestinationAllowed(url, settings)` (`tracking.ts`, exported). Order:
1. URL must parse; scheme `http:`/`https:` only (else SCHEME/PARSE).
2. No userinfo (`https://a.com@evil.test`, `https://u:p@a.com`) → USERINFO.
3. Host (WHATWG-normalised, one trailing dot dropped) is not an IP literal — IPv4 incl. `0x7f.1` / `2130706433` forms (the URL parser folds them to a.b.c.d), IPv6 `[…]` → IP.
4. Host is not `localhost`, `local`, `internal`, `*.localhost`, `*.local`, `*.internal`, `home.arpa`, `*.home.arpa` → LOCAL.
5. `isDestinationBlocklisted(host)` → BLOCKLISTED (hook only; returns false — see debt).
6. Host must match an entry: `a.com` = exactly a.com · `*.a.com` = a.com and any subdomain (dot-boundary: `xa.com`, `a.com.evil.test` never match) → else HOST_NOT_ALLOWED.

Entries of a CRM system =
- `settings.crm.tracking.linkHosts` — declared by the shop; default `[]`; ≤ 50; each normalised by `normalizeLinkHost`: trimmed, lowercase, IDN → punycode, optional single leading `*.`, bare hostname (no scheme/port/path/`*` elsewhere), ≤ 253 chars, not an IP / local name, and `*.` refused on public-suffix-like names (`*.co.th`, `*.in.th`, `*.com`, `*.co.uk` …: 2-label names whose first label is co/com/net/org/or/ac/go/gov/edu/mi/in/ne/gr/lg/ltd/plc/nic).
- always allowed, no configuration: the shop's web-tracking domains `settings.crm.tracking.web.domains` (the same list C2.6/J3 use — reused, no second list; host + subdomains like `originAllowed`) and the platform host from `APP_URL` + subdomains (APP_URL that is an IP/localhost, i.e. QC/dev, gives no exemption).

Where it is enforced:
- `createLink` → VALIDATION (REST 422 `validation`) before anything is written.
- `updateLink` → when `url` changes, or when switching a link ON (`active: true`); rename / channel / switch OFF always allowed (so a blocked link can still be tidied).
- `resolveLinkHit` → `null` = the exact unknown-code answer (302 to LINK_FALLBACK_URL, no cookie, no click counted). Settings already come with the same query (no extra round trip). So removing a host later stops its links; pre-policy rows are judged the same way.
- Thai error texts name the host and where to fix it, e.g. `ปลายทาง other.example.net ยังไม่อยู่ในรายการโดเมนปลายทางที่อนุญาตของร้าน — เพิ่มโดเมนปลายทางที่ ตั้งค่า › ลิงก์ติดตาม แล้วลองอีกครั้ง` (IP / LOCAL / USERINFO / BLOCKLISTED have their own texts).

Settings service (key `crm.tracking.manage` — the key the page and the other tracking settings already require; no new key):
- `getLinkPolicy(ctx, actor)` · `previewLinkHosts(ctx, actor, {hosts})` (no write) · `saveLinkHosts(ctx, actor, {hosts})` (one `jsonb_set` on `crm.tracking.linkHosts`, siblings such as `tracking.web` survive · AuditLog `crm.tracking.link.hosts`). `hosts` = array or text split on whitespace/`,`/`;`. Any bad entry ⇒ the whole save is refused with a Thai message quoting the entry; > 50 after dedupe ⇒ refused.
- "would break N links": one query (`url` of active, unexpired links of the system) evaluated with the same verdict function (no second rule set in SQL) → `blockedActiveLinks`, `blockedLinkIds` (≤ 200), `blockedHosts` (≤ 10).

## Files changed
- `src/lib/modules/crm/tracking-shared.ts` — LINK_HOSTS_MAX, isLocalOnlyHost, isIpLiteralHost, normalizeLinkHost, linkHostMatches, linkDestinationVerdict (pure, client-safe).
- `src/lib/modules/crm/tracking.ts` — linkHostsOf, linkPolicyEntries, isDestinationBlocklisted, linkDestinationCheck/Allowed, cleanLinkHostsInput, getLinkPolicy/previewLinkHosts/saveLinkHosts; wired into createLink/updateLink/resolveLinkHit (old TODO stub removed).
- `src/lib/modules/crm/tracking-actions.ts` + `src/app/app/sys/[id]/crm/settings/tracking/{actions.ts,page.tsx}` — preview/save actions (same session gate), page loads the policy.
- `src/components/crm/tracking/{TrackingSettingsForm.tsx,types.ts}` — "โดเมนปลายทางที่อนุญาต" block inside the tracked-links card: textarea `crm-track-linkhosts-input`, `crm-track-linkhosts-check` (ตรวจผลกระทบ), `crm-track-linkhosts-save`, impact line `crm-track-linkhosts-impact`, current-breakage line `crm-track-linkhosts-blocked`, error `crm-track-linkhosts-error`, per-row badge `crm-link-blocked-<id>`; always-allowed hosts listed.
- `scripts/crm-ui-inventory.json` — 3 rows (input/check/save).
- `src/lib/modules/crm/api/ops/tracking.ts` + `docs/api/CRM-API.md` (regenerated) — `tracking.links.create` summary documents the policy. No new op, no new error code (VALIDATION → 422) ⇒ skill unchanged except the regenerated local `endpoints.md`.
- `scripts/pending/c61l/probe-linkpolicy.mts` — new probe (QC2).
- ORACLE-EDITs (commit 73c1bf18, each marked `ORACLE-EDIT (C6.1-LINKPOLICY …)`): `qc-crm-c2.6.mts` X6.1 positive control → `http://plain.<DOM_A>/x` · `qc-crm-c2.11.mts` S2.11 declares `example.invalid` · `qc-crm-c3.8.mts` + `qc-crm-c3.9.mts` declare `example.invalid` (QC3-pinned — NOT run) · `qc-crm-c5.3.mts` L4-M3 shop declares its phish host.

## Proof (QC2 · iso + gate lock)
- probe `scripts/pending/c61l/probe-linkpolicy.mts`: **36/36** (A pure verdict ×12 · B settings validation ×7 · C create/update ×5 · D `/l` ×4 · E break-count ×4 · F permission ×3 · CLEAN).
- `qc-crm-c2.6` before ORACLE-EDIT 86/87 (only C2.6-X6.1: positive control `plain.example.com` refused — expected) → after **87/87**.
- `qc-crm-c2.11` **47/47** (first run 46/47: my summary had a non-ASCII `›` — fixed to `>`).
- `qc-crm-c5.3 --only=L4` **10/10** (incl. L4-M3 with the edit) · `qc-crm-c2.5` **105/105**.
- `pnpm fitness` **42/42** without env and with QC2 env · `pnpm typecheck` clean · pre-commit fitness green ×2.
- QC2 informational: active tracked links in other tenants = **0** ⇒ 0 fail the policy (seed has no links). Prod CRM v2 tables are empty (C6.1 prod probe) ⇒ no existing link breaks; no migration.
- Env note: this worktree has no QC1 file; `.env.qc` here is a **copy of `.env.qc2`** (acc-v2-env loads `.env.qc` for non-DB vars like SESSION_SECRET; qc2.sh pins the DB to QC2 anyway). Not read, not committed (ignored).

## NOT verified (other lanes / heavy)
- `qc-crm-c3.8`, `qc-crm-c3.9` (QC3-pinned) — fixture edits applied, not run. Without them: c3.8 tracked-link fixture create → 422; c3.9 trackedLinks cap driver → VALIDATION instead of LIMIT.
- `qc-crm-buttons` (QC1, button lane): row `crm-link-create` fills `https://qc-btn-<u>.example.com` ⇒ now an inline error instead of a mutation. **Needs a button-lane fixture**: set `settings.crm.tracking.linkHosts = ["*.example.com"]` on the runner's CRM system (or press the new `crm-track-linkhosts-*` rows first with `*.example.com`). The 3 new inventory rows also need a run there.
- `qc-crm-c2.6-web` (browser, needs a build + server) — not run; its links point at the shops' web-tracking domains (always allowed) so no change is expected.
- Visual check of the settings block at 1440/390 — not rendered.
- Red-before of the probe on the base tree not run (the base has none of the exported functions ⇒ A.0 and every service check red by construction).

## Debt
- **Safe Browsing**: `isDestinationBlocklisted(host)` in `tracking.ts` is the single hook (returns false). A later card must keep it sync/cached — no network call on the `/l` hot path.

## Open questions for the owner
1. A shop can declare any host, including shared hosting like `*.github.io`, `*.vercel.app`, `*.blogspot.com`. The policy stops accidents and gives an audit trail, not a malicious shop (that is Safe Browsing + the C5.4-F suspend kill-switch). Refuse `*.` on known shared-hosting suffixes too? (default: allow)
2. Should verified **sending** domains (`EmailDomain`, DNS-verified) also count as always allowed? Today only web-tracking domains + the platform host do. (default: no — the shop adds them once)
3. The e-mail click redirector `/t/c/<token>` (C2.5) also sends people from shark.in.th to arbitrary hosts found in the shop's own e-mails. Apply the same policy there (with unknown hosts = plain link, not tracked)? (default: out of scope for this card)
4. Should switching the policy apply only after a grace period (e.g. warn for 7 days before blocked links stop)? Today the change is immediate, with the "would break N" preview. (default: immediate)

## Round 2 (7 Oct 2026 · after review 88c2f8c7 · MERGEABLE AFTER RV-1, RV-2) — commit 57bc6aec
- **RV-1** `updateLink`: `active` that is not a real boolean (`1`, `"yes"`, `"true"`, `null`, `{}`) ⇒ VALIDATION "สถานะของลิงก์ต้องเป็นเปิดหรือปิดเท่านั้น — ลองกดสวิตช์อีกครั้ง", nothing written. One `turnOn` drives both the destination check and the write.
- **RV-2** new reason `REDIRECTOR`. On `shark.in.th` (always), the APP_URL host, and their subdomains, a path under `/t/` or `/l/` is refused **whichever list matched**, including an explicit `shark.in.th` / `*.shark.in.th` entry.
  - The path is judged on the parsed URL's pathname (`isPlatformRedirectorPath`): `%xx` decoded up to 3 times, `\`→`/`, `//` collapsed, `.`/`..` resolved, lowercased, then `^/(t|l)(/|$)`. Other platform paths (`/f/…`, `/s/…`, `/tx`, `/lab`) are still allowed.
  - Thai text: "ลิงก์ติดตามชี้ไปที่ลิงก์ติดตามหรือลิงก์นับคลิกอีกตัวของ <host> ไม่ได้ (ลิงก์ซ้อนลิงก์) — ใช้ลิงก์ของหน้าปลายทางจริงแทน".
  - `/t/c` uses the same hard judge (`linkHardVerdict` in tracking-shared: scheme · userinfo · IP · localhost/.local/.internal · blocklist hook). It is the first stage of `linkDestinationVerdict`, so there is one judge. It is applied:
    - (a) in `emails.composeOutgoing`: an href that fails is **not wrapped** (it stays as written in the shop's mail, and shark.in.th never redirects there);
    - (b) in `emails.trackClick`: an href that fails returns `url: null`, which is the unknown-token answer (302 home).
  - The per-shop allow-list is NOT applied to `/t/c` (owner Q3 stays open).
  - Caveat (b): for a legacy row the click is still counted, because the URL lives in the counting statement and judging it first would add a round trip on the hot path. Only e-mails wrapped before this card are affected, and prod has no CRM v2 e-mails.
  - `isDestinationBlocklisted` moved to tracking-shared (pure, so emails.ts can use it without importing tracking.ts) and is re-exported from tracking.ts. It is still the only Safe Browsing hook.
- **RV-3** always-allowed web-tracking domains pass `normalizeLinkHost("*.<d>")`. A public-suffix-like or shared-hosting name gives no link exemption; this is logged once per process with `console.warn` and does not change `originAllowed`/web tracking. To make the reviewer's R.B6 (`github.io`) pass without the PSL, the heuristic gained a short static list of shared-hosting suffixes refused under `*.`: github.io, gitlab.io, vercel.app, netlify.app, pages.dev, workers.dev, web.app, firebaseapp.com, herokuapp.com, blogspot.com, wordpress.com, wixsite.com, myshopify.com, s3.amazonaws.com, cloudfront.net, azurewebsites.net, appspot.com, onrender.com, fly.dev, glitch.me, ngrok.io, ngrok-free.app, trycloudflare.com, nip.io, sslip.io. Exact hosts (`myshop.github.io`) are still accepted. The full PSL stays debt (RV-4).
- **RV-5** an entry over 253 characters (the `*.` prefix not counted) gets its own message quoting the first 60 characters: "… ยาวเกินไปสำหรับชื่อโดเมน (ไม่เกิน 253 ตัวอักษร) — ตรวจว่าวางมาเฉพาะชื่อเว็บ ไม่ได้วางทั้งลิงก์". More than 500 raw tokens gives "ไม่เกิน 50 รายการ (ตอนนี้ N)". The bad-entry message now also names `*.github.io`.

### Proof (QC2 · iso + gate lock)
- Builder probe `scripts/pending/c61l/probe-linkpolicy.mts`, extended with G.1 (RV-1), G.2–G.4 (RV-2 verdict: 12 path spellings + subdomain + declared, QC APP_URL, create refusal), G.5 (RV-3 incl. github.io), G.6 (RV-5), H.1 (`/t/c` wrap time through a real `sendEmail` with a fake transport) and H.2 (`/t/c` hit time on legacy stored links vs an unknown token):
  - **red-before** on the round-1 source (tracking/tracking-shared/emails at 88c2f8c7, swapped in temporarily): 36/44, all 8 new checks ❌. The output showed `1`/`"yes"`/`{}` ACCEPTED with active=true, `/t/c` paths OK, IP/userinfo/localhost hrefs wrapped (6 of 6) and redirected at hit time.
  - **green-after: 44/44**.
- Reviewer probe `scripts/pending/c61l/review/probe-linkpolicy-review.mts`: **29/29**. It was 28/29 until github.io was added to the shared-hosting list.
- Suites:

  | Suite | Result |
  | --- | --- |
  | `qc-crm-c2.6` | 87/87 |
  | `qc-crm-c2.11` | 47/47 |
  | `qc-crm-c5.3 --only=L4` | 10/10 |
  | `qc-crm-c2.5` | 105/105 (`/t/c` wrapping unchanged for normal hrefs) |

- Fitness 42/42 without env and with QC2 env. Typecheck clean. No op or docs change (the API docs are unaffected).

### Still not verified / debt (unchanged from round 1 unless noted)
- c3.8 / c3.9 (QC3), qc-crm-buttons (QC1, C4.2 lane fixture + `linkhosts-input` fill rule, see the review's Point 7), c2.6-web, visual check.
- RV-4 full PSL, RV-6..RV-11 INFO: recorded as debt by the controller. RV-6 is open: `REDIRECTOR`/`HOST_NOT_ALLOWED` messages still show punycode for Thai IDN.
