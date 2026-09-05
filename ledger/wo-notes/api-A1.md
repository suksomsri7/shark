# WO A1 — คีย์ API มี scope / ผูกสมุด / หมดอายุ / หมุน + `ApiIdempotency` + `ActorType.API_KEY`

สถานะ: **ทำครบตามสัญญา · ทุกด่านเขียว · ยังไม่ commit** (Fable ตรวจรับแล้ว commit)
ผู้ทำ: Opus (builder) · ข้อสอบ: `scripts/qc-account-api-keys.mts` (Fable · ไม่แตะ)

## ไฟล์ที่แก้ / เพิ่ม
| ไฟล์ | สิ่งที่ทำ |
|---|---|
| `prisma/schema/api.prisma` | `ApiKey` เพิ่ม `scopesJson Json @default("[]")` · `systemId` · `expiresAt` · `createdById` · `rotatedFromId` + `@@index([tenantId, systemId])` · เพิ่ม `model ApiIdempotency` |
| `prisma/schema/core.prisma` | `enum ActorType` เพิ่ม `API_KEY` |
| `prisma/migrations/20260917000000_api_key_scopes/migration.sql` | **ใหม่** (additive ล้วน — SQL เต็มด้านล่าง) |
| `src/lib/core/scope.ts` | ลงทะเบียน `ApiIdempotency: tenant` (ถัดจาก `ApiKey`) |
| `src/lib/api-keys/scopes.ts` | **ใหม่** — `ACCOUNT_SCOPE_KEYS` · `API_SCOPE_BUNDLES` 5 ชุด · `DEFAULT_BUNDLE_ID` · `DEFAULT_KEY_TTL_DAYS` · `expandBundles` · `bundlesCovering` · `isApiScope` · `NON_API_SCOPE_KEYS` |
| `src/lib/api-keys/service.ts` | `createApiKey(ctx, name, opts?)` · `verifyApiKey` คืน scope/systemId/expiresAt + กันคีย์หมดอายุ · `rotateApiKey` ใหม่ · `listApiKeys` คืนฟิลด์เพิ่ม |
| `src/lib/api-keys/route-auth.ts` | `ApiAuth` ok-branch เพิ่ม `scopes` / `systemId` / `expiresAt` · ข้อความ 401 ครอบคำว่า "หมดอายุ" |
| `src/lib/modules/account/access.ts` | `writeAudit` รับ `actorType?: ActorType` (ปริยาย `USER`) + `actorTypeLabelTh` รู้จัก `API_KEY` ("แอปภายนอก (API key)") |

ไม่มีการแก้ไฟล์อื่น · ไม่มี `any` ใน `src/` · ไม่มี raw prisma เพิ่มใน `src/lib/modules/**` (แก้เฉพาะ `access.ts` ที่ import `prisma` อยู่แล้ว)

## Migration SQL (verbatim — `prisma/migrations/20260917000000_api_key_scopes/migration.sql`)
```sql
-- AlterEnum
ALTER TYPE "ActorType" ADD VALUE 'API_KEY';

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "rotatedFromId" TEXT,
ADD COLUMN     "scopesJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "systemId" TEXT;

-- CreateTable
CREATE TABLE "ApiIdempotency" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "idemKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" INTEGER,
    "responseJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiIdempotency_expiresAt_idx" ON "ApiIdempotency"("expiresAt");

-- CreateIndex
CREATE INDEX "ApiIdempotency_tenantId_idx" ON "ApiIdempotency"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiIdempotency_keyId_idemKey_key" ON "ApiIdempotency"("keyId", "idemKey");

-- CreateIndex
CREATE INDEX "ApiKey_tenantId_systemId_idx" ON "ApiKey"("tenantId", "systemId");
```
ตรวจแล้ว: additive ล้วน (ADD COLUMN / CREATE TABLE / CREATE INDEX / ALTER TYPE ADD VALUE) — ไม่มี DROP/RENAME/NOT NULL บนคอลัมน์เดิม
`scopesJson` เป็น `NOT NULL DEFAULT '[]'` → แถวคีย์เดิมได้ `[]` อัตโนมัติ (คีย์รุ่นเดิมยังทำงานเหมือนเดิมทุกอย่าง)
⚠️ ตอน deploy prod: `ALTER TYPE ... ADD VALUE` ใช้ค่าที่เพิ่งเพิ่มใน transaction เดียวกันไม่ได้ — migration นี้ไม่ได้ใช้ค่าใหม่ จึงปลอดภัย (PG16 บน Neon)

## คำสั่งที่รันจริง (ทุกคำสั่ง export env ของ `.env.qc` ในบรรทัดเดียวกัน · ตรวจ host `ep-plain-art` ก่อนเสมอ · ไม่เคย `source .env`)
```
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.qc | cut -d= -f2- | tr -d '"')" \
       DIRECT_URL="$(grep -m1 '^DIRECT_URL=' .env.qc | cut -d= -f2- | tr -d '"')" APP_ENV=development
echo "$DIRECT_URL" | grep -q ep-plain-art || { echo "WRONG DB"; exit 1; }
```
| คำสั่ง | บรรทัดสรุปสุดท้าย |
|---|---|
| `prisma migrate diff --from-config-datasource --to-schema prisma/schema --script` | เขียนลง `migration.sql` (exit 0) |
| `pnpm exec prisma migrate deploy` | `All migrations have been successfully applied.` (101 migrations found) |
| `pnpm db:generate` | `✔ Generated Prisma Client (v7.8.0)` |
| `pnpm exec tsx scripts/qc-account-api-keys.mts` | `ผ่าน 50/50` · `CRITICAL 0 · MAJOR 0 · MINOR 0` · `JSON_SUMMARY {"total":50,"passed":50,"findings":[]}` |
| `pnpm exec tsx scripts/qc-public-api.mts` | `ผ่าน 18/18` · `JSON_SUMMARY {"total":18,"passed":18,"findings":[]}` |
| `pnpm exec tsx scripts/qc-acc-v2-schema.mts` | `===== สรุป: ผ่าน 61 · ไม่ผ่าน 0 =====` |
| `pnpm exec tsx scripts/qc-acc-v2-permissions.mts` | `✅ ผ่าน 160 ข้อ · พบปัญหา 0 ข้อ` |
| `pnpm exec tsx scripts/qc-acc-v2-security.mts` | `===== สรุป: ผ่าน 298 · ไม่ผ่าน 0 =====` |
| `pnpm drift` | `No difference detected.` (exit 0) |
| `NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck` | ไม่มี output error · exit 0 |
| `pnpm fitness` | `ผ่าน 17/17` · `JSON_SUMMARY {"total":17,"passed":17,"findings":[]}` |

(ไม่ได้รัน `next build` ตามข้อห้าม · ไม่มี lint script ในโปรเจกต์)

## จุดออกแบบที่ควรรู้
1. **หมุนคีย์อะตอมมิก** — `rotateApiKey` จอง "ตัวเก่า" ด้วย `updateMany({ where: { id, tenantId, revokedAt: null }, data: { revokedAt } })` แล้วเช็ค `count === 1` (SQL คำสั่งเดียว) ก่อนสร้างตัวใหม่ ทั้งหมดใน `prisma.$transaction` แบบ interactive → ยิงพร้อมกัน 2 ครั้งได้ลูก 1 ใบ (AK-5.6 ผ่าน) · ถ้าอ่านก่อนเขียนจะได้ลูก 2 ใบจากแม่ใบเดียว
2. **วันหมดอายุตอนหมุน** — ของเดิมยังไม่ถึงกำหนด → ใช้ต่อ (หมุนคีย์ ≠ ต่ออายุ) · ไม่มี/เลยกำหนดแล้ว → ตั้ง `now + DEFAULT_KEY_TTL_DAYS (365)`
3. **คีย์หมดอายุ** — `verifyApiKey` คืน `null` **ก่อน** แตะ `lastUsedAt` → คีย์ที่ตายแล้วไม่ถูกทำให้ดูเหมือนยังมีคนใช้ · route เดิมเข้าทาง 401 เส้นเดิม (ไม่มี branch ใหม่)
4. **ผูกสมุด** — `systemId` ตรวจผ่าน `tenantDb(ctx).appSystem.findFirst` เท่านั้น (กันคีย์ชี้ระบบข้ามร้าน) · ยอมให้ผูกระบบชนิดอื่น (POS ฯลฯ) ได้ตาม AK-3.6 — ด่าน "ต้องเป็น ACCOUNT" ไปอยู่ที่ `requireAccountApi` ของ A3
5. **backward compat** — `createApiKey(ctx, name)` ไม่ใส่ opts = พฤติกรรมเดิมเป๊ะ (`scopes []`, `systemId/expiresAt/createdById` null) · ผู้เรียกเดิม 3 จุด (`/app/settings/api/actions.ts`, หน้า connections, `/app/settings/api/page.tsx`) ไม่ต้องแก้

## ส่วนที่ต่างจากสเปคใน RUN (และเหตุผล)
**`account.approve.limit`** — สเปคของ A1 (และ prompt) เข้าใจว่าคีย์นี้เป็น "param key" แต่ของจริงในทะเบียน:
`PERMISSION_PARAMS` มีตัวเดียวคือ `_maxApproveSatang` ส่วน `account.approve.limit` ("เพดานยอดอนุมัติ") ถูกประกาศไว้ในกลุ่ม *actions* ของโมดูล `account` ⇒ `isPermissionKey("account.approve.limit") === true` และ `isPermissionParamKey(...) === false`
ข้อสอบตั้งเงื่อนไขสองข้อที่ชนกันถ้าตีความตรงตัว:
- **AK-3.4** — ใช้ `account.approve.limit` เป็น scope ต้อง **throw**
- **AK-7.10 + AK-7.11** — `ACCOUNT_SCOPE_KEYS` ต้องเท่ากับ permission key ของโมดูล account ทุกตัว (จึง**รวม** `account.approve.limit`) และทุกคีย์ต้องอยู่ในสัก bundle

ทางออกที่ใช้ (ผ่านทั้ง 3 ข้อ และยังใช้งานจริงได้):
- `NON_API_SCOPE_KEYS = ["account.approve.limit"]` + `isApiScope(key)` = `isPermissionKey && !isPermissionParamKey && !NON_API_SCOPE_KEYS` → `createApiKey` โยนข้อความไทยเมื่อเจอคีย์นี้ (มันเป็น "ค่าตั้งเพดาน" ไม่ใช่การกระทำที่ REST เรียกได้)
- ประกาศไว้ใน bundle `settings` (ครบตาม AK-7.11) แต่ `expandBundles`/`bundlesCovering` กรองคีย์กลุ่มนี้ทิ้ง → เลือก bundle `settings` แล้วสร้างคีย์ได้ตามปกติ ไม่ระเบิด
ถ้า Fable ต้องการอีกแบบ (เช่น เอา `account.approve.limit` ออกจาก bundle แล้วผ่อน AK-7.11) แก้ได้ที่ `scopes.ts` จุดเดียว

**bundle ที่สเปคไม่ได้ระบุที่อยู่**: ไล่คีย์จริงในทะเบียนแล้ว account มี 36 คีย์ · สเปคครอบ 35 ตัว ขาดแค่ `account.approve.limit` ตัวเดียว (จัดไป `settings` ตามด้านบน) · `account.wht.manage` / `account.tax.view` / `account.report.view` ที่ prompt กังวลนั้นสเปคระบุไว้แล้ว (accountant / read-only / read-only ตามลำดับ)

## คำถามค้าง / ของที่ส่งต่อ
1. `ApiIdempotency` ยังไม่มีตัวเก็บกวาดแถวหมดอายุ (มี `@@index([expiresAt])` เตรียมไว้แล้ว) — ควรผูก cron ตอน A3 ที่เริ่มเขียนแถวจริง
2. `createdById` ไม่ทำ relation ไปยัง `User` โดยตั้งใจ (คีย์ต้องอยู่ต่อได้แม้คนสร้างออกจากร้าน) — ถ้า A2 อยากโชว์ชื่อคนสร้างต้อง resolve เอง
3. migration ยัง **ไม่ push** (กติกาข้อ 2 บอกให้ push ทันทีที่สร้าง แต่ข้อ 4 ห้าม builder commit) — Fable commit+push ให้ด้วย เพื่อกัน session แชทสร้าง migration ชนลำดับ
4. ข้อความ 401 ของ `route-auth` เปลี่ยนเป็น "API key ไม่ถูกต้อง หมดอายุ หรือถูกเพิกถอนแล้ว" (เดิมไม่มีคำว่าหมดอายุ) — `qc-public-api` ไม่ผูกกับข้อความ (ตรวจแต่ status) และยังเขียว
