# Prompt for account B: O18 pre-deploy production checks (READ-ONLY). Use from Wed 7 Oct.

The owner approved O18 on 5 Oct 2026. The approval covers the read-only production checks below first, then the push of `rc/hotfixes-2026-10-01` into `main`. **This prompt covers the read-only checks only.** The push to main is done separately, after the controller has read these results and the owner gives the final GO in chat.

---

You are running **read-only production checks** before the approved deploy of `rc/hotfixes-2026-10-01` (see `ledger/POS-DEPLOY-REQUEST-2026-10-01.md` §4). Report in English in `ledger/wo-notes/O18-prod-readonly.md` on branch `wip/pos-o18-checks` (from `origin/session/pos`), then push that branch. Report counts and ids only: no names, no phone numbers, no key prefixes, no secrets.

## Hard rules
- **READ ONLY.** Every SQL statement runs inside `BEGIN TRANSACTION READ ONLY; … ROLLBACK;`. Never INSERT/UPDATE/DELETE/DDL. Never `prisma migrate`, `db push` or `generate` against production.
- Find the production connection string in the existing production env file on this VPS. Ask the owner which file it is if unsure. **Never print, log, copy or commit it.** Print only the hostname. It must NOT contain `ep-frosty-lab` (that is QC4).
- Run outside shop hours if possible (check (c) scans stock tables).
- Never push `main`. Never deploy. If any permission is denied, stop and report.

## Checks
(a) **API keys that will get 403 after deploy.** These are module-scoped keys, i.e. keys with `systemId` set. Group the active keys (`revokedAt IS NULL` and not expired) by the `AppSystem.type` of their systemId, plus a separate row for `systemId IS NULL` (shop-wide keys, unaffected). Show the count, and the count with `lastUsedAt` in the last 30 days. Name any tenant whose module key was used in the last 30 days by tenant id only. The CHAT case matters most (e.g. SiamDive chat).
```sql
BEGIN TRANSACTION READ ONLY;
SELECT COALESCE(s.type::text,'(shop-wide)') AS kind, count(*) AS active,
       count(*) FILTER (WHERE k."lastUsedAt" > now() - interval '30 days') AS used_30d
FROM "ApiKey" k LEFT JOIN "AppSystem" s ON s.id = k."systemId"
WHERE k."revokedAt" IS NULL AND (k."expiresAt" IS NULL OR k."expiresAt" > now())
GROUP BY 1 ORDER BY 1;
ROLLBACK;
```
(b) **HR employees linked to a user account.** Check for collisions and for links made before payroll was set up. Count `HrEmployee` rows with `linkedUserId` set. Count the duplicates, meaning the same `linkedUserId` linked twice within one tenant, by tenant id. Also count linked rows where the linked user is the approver of their own payroll/leave chain, if that can be derived. See `REVIEW-HR-V2-DESIGN-2026-10-01.md` §8 and the HR hotfix notes for what the HR hotfix assumed.

(c) **Stock cache drift.** Run `ALLOW_PROD_AUDIT=1 pnpm exec tsx scripts/inv-cache-audit.mts` from a checkout of `origin/rc/hotfixes-2026-10-01`, against production, read-only, as the script documents. Report the number of drifted items per tenant (ids only) and the largest drift.

## Done =
- `ledger/wo-notes/O18-prod-readonly.md` has (a), (b) and (c) as tables, plus the exact commands used (without secrets).
- Push `wip/pos-o18-checks` and stop.

Commit trailer:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
