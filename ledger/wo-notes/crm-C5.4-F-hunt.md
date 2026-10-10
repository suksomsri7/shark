# C5.4-F HUNT (public surface) · Opus 5.5 · 28 Sep 2026 · dd201a8d + batch F diff · probe `scripts/pending/hunt-54f/probe-54f.mts` (log `.log` · QC2 · tenant qc-hunt54f-* deleted, 0 rows/buckets left)
Verdict: none of these block the merge. Env is unset (default) so everything is IN. Findings 1–3 only matter once P14 sets `CRM_INBOUND_AUTHSERV_ID`, so they need to be closed before P14. Finding 4 was already there before this batch.

1. MED · PLAUSIBLE (reproduced at the parser level) · `emails.ts` authResultPass loop (~1795-1810). An attacker can inject clauses inside the GENUINE first instance, so the "first instance with our id" rule does not help. With env=mx.shark.in.th, both of these give OUT(sentBy staff):
   A2 `mx; spf=fail (mx: domain of "x);dkim=pass header.d=<staffdom>;("@evil does not designate…) …; dkim=none; dmarc=fail header.from=<staffdom>` (an unescaped `)` from the attacker's MAIL FROM inside the MTA comment)
   A3 `mx; spf=none smtp.helo=x;dkim=pass header.d=<staffdom>; dkim=none; dmarc=fail …` (unquoted HELO).
   The RFC-conformant forms stay IN (A5 quoted helo, A6 `\)` escaped). So this works only if our inbound MTA echoes the envelope/HELO without quoting or escaping.
   Fix: trust only `dmarc=pass header.from=<From domain>`, and distrust the instance if it has more than one `dmarc` (or `spf`) resinfo. Add a HELO/MAIL FROM injection case to the P14 forged-twin live test.
2. LOW-MED · reproduced in-process (whether real mail can do this depends on the provider/worker)
   A1: two instances joined with `\n\t` → the unfold at ~1826 merges the forged PASS into the genuine FAIL → OUT.
   A7: headers `{ "Authentication-Results": FAIL, "authentication-results": PASS }` → `lowerHeaders` (~1765) and `crmExtras` in `api/email/inbound/route.ts` overwrite (last key wins) → OUT.
   Fix: on a key collision, join the values with "\n" in insertion order (or distrust). Distrust if the trusted authserv-id appears as an instance head more than once.
3. LOW · reproduced · A12: `dkim=pass header.d=evil.example header.i=@<staffdom>` → OUT. header.i is accepted on its own; this only bites if the MTA reports an i= it did not validate. Fix: accept header.d only.
4. MED · reproduced · already there before batch F (SF2 covered only staff-claimed From) · `emails.ts` ~2008. Any outsider who knows `crm+KEY@` (visible in the Reply-To of every CRM mail) sends `From: x@evil.example`, `Reply-To: <customer>`. The mail is stored IN on that customer's timeline (matchedBy EMAIL) and emits crm.email.received for that contact. Fix: use Reply-To only when the From domain is in the tenant's VERIFIED domains (the form-mail case).
5. LOW · reproduced · ~1976 · A15: `ceo@<verified shop domain>` with no proof → a new lead (flagged unverifiedShopFrom, but created anyway). A14: `sales+ceo@<staffdom>` → a lead that looks like staff. A16: display name "Staff (staff@…)" → a lead with that name. Fix: add `&& !unverifiedShopFrom` to the stranger-lead condition.
6. INFO
   - IDN homograph `https://аpple.com/` is accepted by createLink and goes out punycoded in Location (owner Q15).
   - Outside prod, trackerOrigin() returns the string "null" when APP_URL is not a URL (misconfig only).
   - One-click at full bucket with a valid, already-opted-out token still runs BEGIN/UPDATE(0 rows)/COMMIT on every request, with no writes and no rate limit. Optional: check `emailOptOut` before the tx when rateLimited.

HELD (reproduced)
- Controls: genuine=OUT; FAIL then forged PASS (`\n`)=IN; env unset=IN.
- Multi-From `<evil>,<staff>` with evil passing=IN. Display-name spoof=IN. header.d suffix without a label boundary=IN.
- Genuine A-R with UPPER-case authserv-id + version + comments containing `;`=OUT (genuine inbound not broken).
- /l: ACTIVE and PENDING redirect. SUSPENDED, CLOSED and PENDING_DELETE → fallback: 0 clicks, no cookie, same bytes as an unknown code. Median 9.5 vs 9.4 ms (no enumeration by timing).
- headerSafeLocation:
  - CRLF, NUL and U+0085/2028/2029 are stripped or percent-encoded, and `new Headers` never throws.
  - Backslash is normalised the way a browser does it.
  - `//evil`, `javascript:`, `https:\\` and whitespace/U+2028 are rejected by createLink. /t/c only wraps `https?://`.
- One-click:
  - 5 fake tokens at full bucket: 0 writes.
  - Valid token at full bucket: opts out once (event, audit and consent each written once). 5 repeats: 0 writes.
  - Fresh IP + already opted out: the event stays unique.
  - GET → 405. Brute force is not feasible (random secret; the response is identical for every token).
- trackGate chain: IP bucket at 999 + 4 new tokens → all refused, 0 token rows.
- I2: production → https://shark.in.th for https, http or unset APP_URL. dev → its own origin.
- I1: no key → `dev_<uuid>` and nothing sent. The CRLF check on To still runs first. Prod has a key, so its path is unchanged.
