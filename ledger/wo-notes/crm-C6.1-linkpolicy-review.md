# C6.1-LINKPOLICY — independent review · 7 Oct 2026

Reviewer of branch `wip/crm-c61-linkpolicy` (builder tip `04187b9d`, base `origin/session/crm`). Worktree `shark-crm-c61l`. QC2 only.
Read: the whole diff `git diff origin/session/crm...HEAD` (17 files), the builder note, `/l` + `/t/c` routes, `emails.trackClick` / `composeOutgoing`,
`qc-crm-buttons.mts`, `crm-ui-inventory.json`, the five ORACLE-EDITs. No builder code changed.
Reviewer probe: `scripts/pending/c61l/review/probe-linkpolicy-review.mts` (pure + QC2, throwaway tenants `qc-c61r-*`, CLEAN ×2).

## Findings

| ID | Sev | Where | What | Why it matters | How to fix |
| --- | --- | --- | --- | --- | --- |
| RV-1 | MED | `src/lib/modules/crm/tracking.ts:681` vs `:684` | Re-activation check runs only for `patch.active === true`, but the write is `data.active = !!patch.active`. `updateLink(…, { active: 1 })` or `{ active: "yes" }` switches a **blocked** link ON with no check (probe R.D1: `1` and `"yes"` ACCEPTED, row `active=true`). The server action `updateCrmTrackedLinkAction` passes client JSON through unchanged. | The builder's contract "re-activation must be checked" is false. Harm is contained because `resolveLinkHit` re-judges every hit (R.D2: still the unknown-code answer, 0 clicks), but the link shows as ON and the create/update gate can be bypassed. | Work out `const turnOn = patch?.active !== undefined && !!patch.active` once, then use it for both the check and the write. Better still, refuse a non-boolean `active` with VALIDATION. Add `{active:1}` to the probe. |
| RV-2 | MED | `tracking.ts:390-405` (`platformLinkEntries`/`alwaysAllowedLinkEntries`) + `emails.ts:1008` + `src/app/t/c/[token]/route.ts` | `*.<APP_URL host>` is always allowed **including the platform's own redirectors**. `/t/c/<token>` redirects to any http(s) href the shop put in its own outgoing e-mail, and it applies no destination policy. Chain: the shop e-mails itself `href="https://evil.example"` and gets `https://shark.in.th/t/c/<token>`. It then creates `/l/<code>` → that URL, which the policy accepts as the platform host (probe R.C5: `/t/c` = OK, `/l/<other>` = OK). The result is a redirect to an undeclared host, with no `linkHosts` entry and no `crm.tracking.link.hosts` audit row naming it. | The list exists to stop accidents and to leave an audit trail. This route gets around both. (`/l/<other code>` itself is fine, because the other link is judged under its own shop's policy.) | Make the platform exemption path-aware and refuse the redirector prefixes `/t/` and `/l/` (and any future redirect route) on the platform host. Or allow only the apex with an explicit path allowlist. Or close it at the source by applying the policy to `/t/c` (Q3 below). One of these is needed before merge. The `/t/c` policy itself can be a follow-up card. |
| RV-3 | LOW | `tracking.ts:401-405` (`alwaysAllowedLinkEntries`) · `saveWebSettings` `:814-823` | The public-suffix guard applies only to `linkHosts`. The always-allowed **web-tracking domains** pass only `normalizeDomain` and are turned into `*.<domain>`. So a web domain `co.th` allows every `*.co.th`, and `github.io` allows every `*.github.io` (probe R.B6). | It is the same accident the `*.co.th` refusal exists for, reached through the second list. | Inside `alwaysAllowedLinkEntries`, give a public-suffix-like web domain no exemption (or an exact-only one). Optionally refuse such names in `saveWebSettings`, which also tightens `originAllowed`, a pre-existing gap. |
| RV-4 | LOW | `tracking-shared.ts:279-284` | The "public suffix" test is a 17-word list over 2-label names, not the PSL. It accepts `*.github.io`, `*.vercel.app`, `*.blogspot.com`, `*.netlify.app`, `*.pages.dev`, `*.web.app`, `*.herokuapp.com`, `*.me.uk`, `*.id.au`, `*.s3.amazonaws.com` and `*.workers.dev` (probe R.B5 INFO). It correctly refuses `*.com`, `*.co.th`, `*.in.th`, `*.ac.th`, `*.go.th`, `*.or.th`, `*.net.th`, `*.co.uk`, `*.com.au` and `*.co.jp`. | One `*.` entry can cover thousands of strangers' sites. See Q1. | Vendor the Public Suffix List (ICANN + PRIVATE sections, a static snapshot with no network call) and refuse `*.` when the base is a public suffix. Exact hosts such as `myshop.github.io` stay allowed. |
| RV-5 | LOW | `tracking.ts:498-500` | A single entry longer than 300 characters, or more than 500 tokens, gets the message "ใส่โดเมนปลายทางได้ไม่เกิน 50 รายการ". | The message is wrong for the long-entry case and does not name the entry. | Give the long-entry case its own Thai message that quotes the first 60 characters, like the malformed-entry message. |
| RV-6 | INFO | `tracking.ts:432-447` | Thai IDN hosts appear in errors and in the blocked-hosts line as punycode (`xn--…`). | A Thai shop owner who typed `ร้าน.com` will not recognise the name. | Use `domainToUnicode` (node:url / `new URL`) for display only. |
| RV-7 | INFO | verdict | Any port, and plain `http:`, are allowed on an allowed host. Private names other than localhost/.local/.internal/home.arpa (`localhost.localdomain`, `*.lan`, `*.nip.io`) can be declared (R.A6/R.A8 INFO). | The redirect happens in the browser, so there is no SSRF. Acceptable. | None needed. Optionally add `.lan`, `.localdomain`, `.test`, `.invalid`, `.example`, `.onion` to `isLocalOnlyHost`. |
| RV-8 | INFO | `platformLinkEntries` | If `APP_URL=https://www.shark.in.th`, the apex `shark.in.th` gets no exemption (R.C3). If APP_URL is unset, the platform gets no exemption and declared hosts still work. Neither case allows or refuses everything (R.C2). | Not verified: the prod value of APP_URL (`.env*` not read). | None needed if prod APP_URL is the apex. |
| RV-9 | INFO | `saveLinkHosts` | There is one `jsonb_set` statement (nested `||`, siblings survive). The audit row is written after it, outside a transaction. | Same pattern as `saveWebSettings`, so consistent with the file. | None needed. |
| RV-10 | INFO | API / skill | No REST op manages `linkHosts`. An API-only agent gets 422 and needs a person to fill in the list in the UI. The repo skill `SKILL.md` does not mention the list. | Agents will hit 422 with no way to fix it themselves. | Add a SKILL.md line now. Any future `tracking.linkHosts.get/set` op needs a test id (F13). |
| RV-11 | INFO | `linkPolicyOf` | `blockedLinkIds` is capped at 200 while the link cap is 1 000, so rows past 200 get no per-row badge. The count stays correct. | Cosmetic. | None needed, or raise the cap to the links cap. |

Confirmed correct (probe R.A–R.E, 26 of the 29 checks pass, and the 3 failures are RV-1/2/3):
- **Scheme tricks are refused**: `javascript:` in any case, `data:`, `vbscript:`, `blob:`, `ftp:`, `file:`, scheme-relative, empty.
- **Look-alike URLs are judged on the real host**: `HTTPS://A.COM`, trailing dot, and the WHATWG slash forms of an allowed host are allowed, because the browser lands on the same host. Backslash, `#@`, `?@`, `%2f@`, `%2e` and `%40` tricks are refused.
- **Userinfo** in any form is refused.
- **IP literals are refused in every notation, even when declared**: decimal, octal, hex, short form, dword, trailing dot, `0`, 169.254.169.254, IPv6, IPv4-mapped, link-local, full-width digits and the ideographic dot.
- **Local names are refused**: localhost (any case, trailing dot, port), `*.localhost`, `.local`, `.internal`, `home.arpa`.
- **IDN is handled**: the Cyrillic homograph of `apple.com` and its punycode are refused. A Thai IDN entry matches both the unicode and the punycode URL.
- **Dot boundary holds**: `xa.com`, `a.com.evil`, `a.comevil`, `www.a.com` under an exact entry, and `xw.com` are all refused.
- **Hostile settings JSON** (null, string, number, array, array-like object, numbers, objects, nested arrays, malformed entries, `__proto__`) gives no entries and never throws.
- **The 50-entry cap holds**: a raw DB list of 60 is cut to 50 for every judge (one shared `linkHostsOf`), and a save of 51 is refused.
- **Empty list plus unset APP_URL refuses everything.**
- **One judge for all four paths**: create (`assertLinkDestination`), update, the preview/save count (`linkPolicyOf`) and `resolveLinkHit` (`linkDestinationAllowed`) all call `linkDestinationCheck` → `linkDestinationVerdict`. There is no second rule set in SQL or in the UI.

## Point 2 — bypass paths
- The only writers of `CrmTrackedLink.url` are `tracking.createLink` and `tracking.updateLink`. Both run the check.
  - They are reached from the settings server actions (`tracking-actions.ts`) and from REST `tracking.links.create`.
  - REST has no update op.
  - No AI tool, automation action, import, sequence or template creates tracked links. `member/sources.ts createLink` writes a different table.
- Direct `prisma.crmTrackedLink.create` / raw `INSERT` appear only in scripts (seed-crm-perf, QC fixtures). The hit-time check covers those rows anyway (builder E.4).
- Rename, channel change and switch-off are not blocked (builder C.5). Re-activation is checked only for the boolean `true` (RV-1).
- The real gap is the chain through the platform host (RV-2).

## Point 3 — authorization
- **Session gate**: `previewCrmLinkHostsAction`/`saveCrmLinkHostsAction` use the same `session()` as the other tracking actions: tenant from the session, `assertCrmV2`, `crm.tracking.manage`. The page wrapper adds `gate()`.
- **Service gate**: the service re-checks through `enter()` (`resolveSystem` by id + tenantId + type CRM, then the v2 check, then the permission key).
- **The UPDATE is bound**: `WHERE id AND tenantId AND type='CRM'`.
- **Cross-tenant** save, preview and read of another shop's system all return NOT_FOUND and write nothing (R.E1).
- **The preview query is bound** to `tenantId` + `systemId` (R.E2).
- **Audit rows** go only to the acting tenant (R.E3).
- STAFF without the key is refused, and MANAGER is allowed (builder F).

## Point 4 — behavioural contract
- **Identical to an unknown code**: `/l/<code>` for a now-disallowed host gives status, all headers (`cache-control`, `location`) and an empty body byte-identical to an unknown code. No cookie, no click, no `CrmTrackedClick` row (R.D2).
- **No rate-limit difference**: no rate-limit bucket row is created (R.D3). The positive control creates one (R.D4), so the bucket is consumed only on an allowed hit. That is the same as the unknown-code, inactive and suspended paths, so existence does not leak.
- **No timing difference**: a blocked link and an unknown code each cost one query.
- **Error texts are fine**: Thai, name the host (truncated to 80), say where to fix it, and do not blame the user. They follow the file's "what — what to do" pattern. Only RV-5 and RV-6 are cosmetic.

## Point 5 — always-allowed set
- The always-allowed set is exactly `web.domains` (as `*.d`) plus `*.<APP_URL host>`. Nothing else is silently allowed: no sending domains and no hard-coded hosts.
- An APP_URL that is unset, an IP or localhost gives no exemption, and nothing else changes.
- Problems: RV-2 (redirectors under the platform host) and RV-3 (web domains skip the public-suffix guard).

## Point 6 — suites (QC2 · iso + gate lock · this review)
| Suite | Result |
| --- | --- |
| `scripts/pending/c61l/probe-linkpolicy.mts` (builder) | **36/36** (QC2 INFO: 0 active links in other tenants fail) |
| `scripts/pending/c61l/review/probe-linkpolicy-review.mts` (reviewer) | **26/29**: R.B6 (RV-3), R.C5 (RV-2), R.D1 (RV-1). CLEAN ×2 |
| `qc-crm-c2.6` (core file; the browser companion `-web` not run) | **87/87** |
| `qc-crm-c2.11` | **47/47** |
| `qc-crm-c5.3 --only=L4` | **10/10** |
| `qc-crm-c2.5` | **105/105** |
| `pnpm fitness` (no env) | **42/42** (F13 docs byte-equal included) |
| `pnpm typecheck` | clean (exit 0) |
| `qc-crm-c3.8`, `qc-crm-c3.9` | **NOT run**: QC3-pinned (`.env.qc3` through `scripts/qc3.sh`). Judged by reading |

c2.6, c2.5 and c2.11 headers name `.env.qc`. All three ran through `scripts/qc2.sh`, which pins DATABASE_URL/DIRECT_URL to QC2 (ep-cool-shadow) and refuses anything else.

### ORACLE-EDIT rulings (`73c1bf18`)
- **c2.6 X6.1 — APPROVE.** The positive control still proves that plain `http://` is accepted. It now targets `plain.<DOM_A>`, a subdomain of shop A's web-tracking domain, which is always allowed. The negative half (non-http, malformed, over-long, refused by `cleanLinkUrl`, which runs **before** the policy) is unchanged, so it still fails for the original reason.
- **c2.11 S2.11 — APPROVE.** It declares `example.invalid` before the REST create, so the check still proves the REST path. The `javascript:` refusal still comes from the zod `httpUrl`. `setCrm(S,{tracking:{linkHosts}})` replaces the whole `tracking` object (shallow `||`), but nothing in c2.11 reads `S`'s `tracking.web` after that point (grep).
- **c3.8 — APPROVE (by reading).** The fixture system `S` declares `example.invalid`, which matches the fixture link (`:441`) and the op driver body (`:554`). Caveat: if any c3.8 path drives `tracking.links.create` with a key of another system (S2/SB) and expects 2xx, it would now get 422. I found none, but only a QC3 run can confirm.
- **c3.9 — APPROVE (by reading).** `linkHosts` sits beside the existing `tracking.web` in the same object. The trackedLinks cap driver (`:675`) on `cS` still reaches LIMIT and not VALIDATION.
- **c5.3 L4-M3 — APPROVE.** The abusive shop declares its own phishing host, and the check still has its positive control (redirects while ACTIVE) plus SUSPENDED/CLOSED giving no Location. It still pins the kill-switch. Without the edit it would fail at create, which proves nothing about the kill-switch.

None of the edits weakens an oracle.

## Point 7 — button runner (QC1 lane, not run)
I confirmed the builder's claim by reading:
- `fillValueFor` (`qc-crm-buttons.mts:1692`) fills `crm-link-url` with `https://qc-btn-<u>.example.com`. The seed declares no `linkHosts` and no matching web domain, so `crm-link-create` now gets an inline error instead of the mutation. The dependent rows (`crm-link-qr-*`, `crm-link-toggle-*`, …, whose `needs` = "crm-link-create creates it first") lose their fixture.
- The builder did not spot a second effect. `crm-track-linkhosts-input` matches no fill rule, so it gets `qc-btn-<u>`, a single label that `normalizeLinkHost` refuses. So `crm-track-linkhosts-check` (expect `ui` impact) and `crm-track-linkhosts-save` (expect mutation) show `crm-track-linkhosts-error` instead.
- PREFILL also types into that textarea when `crm-link-create` is pressed: the container is the shared tracked-links `<section>`, and the linkhosts block has no `-box/-panel` testid. That is harmless because nothing saves it.

The button lane must change two things:
1. **Fixture**: set `settings.crm.tracking.linkHosts = ["*.example.com"]` on the runner's CRM system before the `/settings/tracking` rows run.
2. **Fill rule**: add `/linkhosts-input$/ → "*.example.com"` to `fillValueFor`, so the save row keeps the fixture rather than replacing it with a refused or narrower list. A per-run `qc-btn-<u>.example.com` would break the next persona's create.

Then run the 3 new inventory rows for owner and manager at both viewports.

## Point 8 — recommendations on the open questions
1. **`*.` on shared hosting: refuse.** Refuse `*.` on every Public Suffix List entry, ICANN and PRIVATE (`github.io`, `vercel.app`, `blogspot.com`, `netlify.app`, `pages.dev` …), from a vendored static snapshot (RV-4). Exact hosts (`myshop.github.io`) stay allowed. The guard is still accident prevention, not anti-fraud, but it forces a malicious shop to name each host, and each name lands in the audit trail.
2. **DNS-verified sending domains: yes, add them.** Count `EmailDomain` rows in status VERIFIED, plus their subdomains, as always-allowed. They are the only entries with proven ownership, stronger than the unverified `web.domains`. Apply the same public-suffix rule. Low risk, and it saves the shop a step.
3. **`/t/c`: apply the policy, at least the hard refusals.** `/t/c` is **not** an anonymous open redirect: the destination is bound to a hashed per-link token inside the shop's own sent e-mail, and request parameters are ignored. It is a **shop-controlled redirector on shark.in.th to any http(s) URL**, the same abuse class as `/l`. Today it accepts IPs, userinfo (`https://shark.in.th@evil` style deception) and localhost, and it is the route of the RV-2 bypass. Recommendation:
   - (a) In this card: close RV-2 by excluding `/t/` and `/l/` from the platform exemption.
   - (b) In a follow-up card: in `composeOutgoing`, leave hrefs that fail the hard refusals (SCHEME/USERINFO/IP/LOCAL/BLOCKLISTED) unwrapped, and re-check at `/t/c` hit time with the unknown-token answer. Then decide whether hosts not on the list stay plain (not tracked) links, as the builder suggested.
4. **Grace period: no, keep immediate.** Removing a host is an explicit owner action behind a "would break N" preview. Prod has no existing links (builder's prod probe, not re-verified here). A grace state adds a timer and a third state to every judge, which risks the paths disagreeing. If the owner wants a softer path, warn at preview, which the UI already does.

## Point 9 — docs
- `docs/api/CRM-API.md` is regenerated. Fitness F13 and c2.11 S5.1 confirm it matches the generator byte for byte. The `tracking.links.create` summary is ASCII and describes the policy accurately.
- No new op and no new error code (VALIDATION → 422), so no new test id is needed.
- The worktree-local `.claude/skills/shark-crm-api/references/endpoints.md` (gitignored) carries the new text.
- The repo `SKILL.md` does not mention the list (RV-10, INFO).
- The installed user skill under `~/.claude-b/skills` is older and not in scope.

## Not verified by this review
- c3.8 / c3.9 runs (QC3 lane).
- `qc-crm-buttons` (QC1 button lane).
- `qc-crm-c2.6-web` (browser companion).
- Visual check at 1440/390.
- The prod APP_URL value.
- The prod "0 existing links" claim.
- Red-before of either probe on the base tree.

VERDICT: MERGEABLE AFTER RV-1, RV-2
