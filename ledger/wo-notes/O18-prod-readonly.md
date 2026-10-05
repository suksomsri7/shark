# O18 — production read-only checks (post-deploy)

- Run: 2026-10-05T04:2xZ (UTC), by account B. `main` already at `f85f5455` (rc/hotfixes-2026-10-01 deployed), so these are **post-deploy** checks.
- Target host: `ep-royal-night-aoidednc` (direct: `ep-royal-night-aoidednc.c-2.ap-southeast-1.aws.neon.tech`; script (c) used the `-pooler` host). Not `ep-frosty-lab`.
- Connection string taken from the existing production env file `/root/projects/shark-in-th/.env` (`DIRECT_URL` for psql, `DATABASE_URL` for the script). Never printed, copied or committed. Connection worked after the owner's password reset (no auth failure).
- Every SQL statement ran inside `BEGIN TRANSACTION READ ONLY; … ROLLBACK;`. No writes, no migrate/generate.

## Verdict
Nothing to act on. No module-scoped keys exist, so nothing gets 403. No HR employee is linked to a user. No stock drift.

## (a) Active API keys by scope

| kind | active | used_30d |
|---|---|---|
| (shop-wide) | 1 | 1 |

- Module-scoped keys (`systemId` set), in any state including revoked: **0**. Total `ApiKey` rows: 1.
- Tenants whose module key was used in the last 30 days: **none**. No CHAT module key exists, so SiamDive chat is not affected by the 403 change.

## (b) HR employees linked to a user

| metric | value |
|---|---|
| `HrEmployee` rows (total) | 8 (2 tenants) |
| rows with `linkedUserId` set | **0** |
| duplicate `linkedUserId` within a tenant | 0 (no tenants) |
| leaves decided by the linked employee themself (`HrLeave.decidedById = linkedUserId`) | 0 |
| pay adjustments decided by the linked employee themself | 0 |
| `HrLeave` / `HrPayAdjustment` / `HrSalaryProfile` / `HrPayrollRun` rows | 0 / 0 / 0 / 0 |

Nothing was linked before payroll was set up, because there are no links and no payroll data at all. The HR hotfix's assumptions (no existing self-links, D3 sole-OWNER case) cannot collide with any current data.

## (c) Stock cache drift (`scripts/inv-cache-audit.mts` @ `origin/rc/hotfixes-2026-10-01`)

| tenants checked | tenants with drift | PRODUCT items | drifted (A/B/C/D/E/F) | total delta units | exposure |
|---|---|---|---|---|---|
| 1 | 0 | 6 | 0 (0/0/0/0/0/0) | 0 | ฿0.00 |

Largest drift: none (0). Runtime 0.4 s. `JSON_SUMMARY {"tenants":1,"driftedTenants":0,"items":6,"drifted":0,"a":0,"b":0,"c":0,"d":0,"e":0,"f":0,"fSkipped":0,"deltaUnits":0,"exposureSatang":0}`

## Commands (no secrets)

```bash
# wrapper: reads DIRECT_URL from /root/projects/shark-in-th/.env, refuses unless host contains ep-royal-night,
# wraps stdin in BEGIN TRANSACTION READ ONLY; … ROLLBACK; and runs psql -X -v ON_ERROR_STOP=1

# (a)
SELECT COALESCE(s.type::text,'(shop-wide)') AS kind, count(*) AS active,
       count(*) FILTER (WHERE k."lastUsedAt" > now() - interval '30 days') AS used_30d
FROM "ApiKey" k LEFT JOIN "AppSystem" s ON s.id = k."systemId"
WHERE k."revokedAt" IS NULL AND (k."expiresAt" IS NULL OR k."expiresAt" > now())
GROUP BY 1 ORDER BY 1;
SELECT s.type::text, k."tenantId", count(*), max(k."lastUsedAt")
FROM "ApiKey" k JOIN "AppSystem" s ON s.id = k."systemId"
WHERE k."revokedAt" IS NULL AND (k."expiresAt" IS NULL OR k."expiresAt" > now())
  AND k."lastUsedAt" > now() - interval '30 days' GROUP BY 1,2;
SELECT count(*), count(*) FILTER (WHERE "systemId" IS NOT NULL) FROM "ApiKey";

# (b)
SELECT count(*), count("linkedUserId"),
       count(DISTINCT "tenantId") FILTER (WHERE "linkedUserId" IS NOT NULL) FROM "HrEmployee";
SELECT "tenantId", count(*) FROM (SELECT "tenantId","linkedUserId" FROM "HrEmployee"
  WHERE "linkedUserId" IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) d GROUP BY 1;
SELECT (SELECT count(*) FROM "HrLeave" l JOIN "HrEmployee" e ON e.id=l."employeeId"
          WHERE e."linkedUserId" IS NOT NULL AND l."decidedById"=e."linkedUserId"),
       (SELECT count(*) FROM "HrPayAdjustment" a JOIN "HrEmployee" e ON e.id=a."employeeId"
          WHERE e."linkedUserId" IS NOT NULL AND a."decidedById"=e."linkedUserId"),
       (SELECT count(*) FROM "HrLeave"), (SELECT count(*) FROM "HrPayAdjustment"),
       (SELECT count(*) FROM "HrSalaryProfile"), (SELECT count(*) FROM "HrPayrollRun"),
       (SELECT count(DISTINCT "tenantId") FROM "HrEmployee");

# (c) temporary detached worktree of origin/rc/hotfixes-2026-10-01 (removed afterwards)
QC_ENV_FILE=/root/projects/shark-in-th/.env ALLOW_PROD_AUDIT=1 \
  pnpm exec tsx scripts/inv-cache-audit.mts --items=0
```
