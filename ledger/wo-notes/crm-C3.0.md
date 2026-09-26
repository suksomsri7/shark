# WO C3.0 — migration `crm_v2_c` (ตารางทั้งหมดของเฟส C3) — ร่างของ builder

> RUN "CRM v2" · 26 ก.ย. 2569 · builder Opus 5.5 บน QC2 (worktree `shark-crm-c20` · HEAD `7e32764f`) · ข้อสอบ `qc-crm-c3.0` 33 ข้อ
> ใบนี้เป็น 1 ใน 3 ใบของ RUN ที่แตะ `prisma/schema/*` ได้ (C1.1 · C2.0 · C3.0) · **builder ไม่ deploy** — ผู้คุมงานอ่าน SQL ทุกบรรทัดแล้ว `migrate deploy` เอง
> 🔴 ไม่ได้รัน `prisma format` — แก้สคีมาด้วยมือเป็น hunk เล็ก (`git diff --stat` = 5 ไฟล์ตามใบสั่ง)

## 1. สิ่งที่ส่งมอบ
- **`prisma/migrations/20261102000000_crm_v2_c/migration.sql`** (214 บรรทัด) — สร้างจาก `qc-prisma.sh migrate diff` บน QC2 (baseline ก่อนแก้สคีมา = "empty migration") + แก้มือ 2 อย่าง: (1) `productIds`/`loginMethods` เติม NOT NULL (แบบ `CrmAssignmentRule.userIds` ของ C2.0) (2) partial unique ของ `HrPayAdjustment.crmCommissionId` ท้ายไฟล์
- `prisma/schema/crm.prisma` — enum ใหม่ 6 + model ใหม่ 6 (ส่วนท้ายไฟล์) + back-relation 2 บรรทัดบน `CrmContact` และ `CrmCompany` (`portalAccesses` · `portalRequests` — ไม่มีคอลัมน์ใน DB)
- `prisma/schema/payroll.prisma` — `HrPayAdjustment.crmCommissionId String?` (ไม่มี `@unique` — ดู §3)
- `src/lib/core/scope.ts` — 5 ตัว `sys()` + `PortalSession: tenant`

## 2. เทียบ `NEW_TABLES` ของข้อสอบ ทีละคอลัมน์ (✔ = ตรง type · nullability · default)
(ทุกตารางมี `id TEXT PK` ด้วย · คอลัมน์เกินสเปกมีแค่ `updatedAt` ของ `CrmQuota`/`CrmCommissionRule` — ข้อสอบไม่ห้ามคอลัมน์เกิน)

**CrmQuota** — tenantId text NN ✔ · systemId text NN ✔ · ownerType CrmQuotaOwner NN ✔ · ownerId text NN ✔ · periodKey text NN ✔ · targetSatang int8 NN ✔ · targetDeals int4 null ✔ · targetActivities int4 null ✔ · note text null ✔ · createdAt timestamp NN ✔ · (+updatedAt NN @updatedAt) · unique (systemId, ownerType, ownerId, periodKey) ✔

**CrmCommissionRule** — tenantId ✔ · systemId ✔ · name text NN ✔ · basis CrmCommissionBasis NN `'PAID'` ✔ · kind CrmCommissionKind NN ✔ · config jsonb NN ✔ · pipelineId text null ✔ · teamId text null ✔ · productIds _text NN `ARRAY[]` ✔ (NOT NULL มือ) · minDealSatang int8 null ✔ · splitCollaboratorsBp int4 NN 0 ✔ · payoutDelayDays int4 NN 0 ✔ · active bool NN true ✔ · sortOrder int4 NN 0 ✔ · createdAt NN ✔ · (+updatedAt) · index (systemId, active) ✔

**CrmCommission** — tenantId ✔ · systemId ✔ · dealId/ruleId/userId text NN ✔ · amountSatang int8 NN ✔ · basisSatang int8 NN ✔ · basis CrmCommissionBasis NN ✔ · status CrmCommissionStatus NN `'PENDING'` ✔ · periodKey text NN ✔ · approvalRequestId/hrPayAdjustmentId/refType text null ✔ · **refId text NN `''`** ✔ · reversedOfId/note text null ✔ · createdAt NN ✔ · decidedAt null ✔ · unique (dealId, ruleId, userId, refId) ✔ · index (userId, periodKey) ✔ · index (systemId, status) ✔ · **ไม่มี FK** ไป CrmDeal/กฎ

**CrmPortalAccess** — tenantId ✔ · systemId ✔ · companyId/contactId text NN ✔ · role CrmPortalRole NN `'VIEW'` ✔ · invitedById text null ✔ · invitedAt NN (default now) ✔ · acceptedAt/lastLoginAt/revokedAt null ✔ · loginMethods _text NN `ARRAY[]` ✔ (NOT NULL มือ) · inviteTokenHash text null ✔ · inviteExpiresAt null ✔ · unique (companyId, contactId) ✔ · unique (inviteTokenHash) ✔ · index (contactId) ✔ · FK companyId→CrmCompany, contactId→CrmContact (CASCADE)

**CrmPortalRequest** — tenantId ✔ · systemId ✔ · companyId/contactId text NN ✔ · kind CrmPortalRequestKind NN ✔ · payload jsonb NN ✔ · status text NN `'PENDING'` ✔ · kanbanCardId/approvalRequestId/decidedById text null ✔ · decidedAt null ✔ · createdAt NN ✔ · index (companyId, status) ✔ · FK companyId→CrmCompany, contactId→CrmContact (CASCADE)

**PortalSession** — tenantId ✔ · portalAccessId text NN ✔ · crmContactId text NN ✔ · crmSystemId text NN ✔ · tokenHash text NN ✔ · userAgent null ✔ · **ipHash** null ✔ (ไม่มี `ip`) · expiresAt NN ✔ · revokedAt null ✔ · createdAt NN ✔ · unique (tokenHash) ✔ · index (portalAccessId) ✔ · index (tenantId, expiresAt) ✔ · FK portalAccessId→CrmPortalAccess (CASCADE — ลบสิทธิ์ = session ตาย)

**Enum 6** ✔ `CrmQuotaOwner{USER,TEAM}` · `CrmCommissionBasis{PAID,WON}` · `CrmCommissionKind{PCT,FIXED,TIERED}` · `CrmCommissionStatus{PENDING,APPROVED,PAID,REVERSED,REJECTED}` · `CrmPortalRole{VIEW,APPROVE,PAY,ADMIN}` · `CrmPortalRequestKind{ISSUE,CONTACT_CHANGE,PROFILE_CHANGE,DOCUMENT_REQUEST}` — CREATE TYPE ทั้งหมด ไม่มี ADD VALUE

**HrPayAdjustment.crmCommissionId** — text · nullable · ไม่มี default ✔ · partial unique `WHERE "crmCommissionId" IS NOT NULL` ✔ · ไม่มี FK ✔

## 3. partial unique กับ S1.9 (diff ต้องว่าง)
ทำแบบเดียวกับ `AutomationRun.crmContactId` ของ `crm_v2_b` (R7a) และ partial index ของบัญชี: **สคีมาไม่มี `@unique`** บน `crmCommissionId` (มีแค่คอมเมนต์ชี้ไป migration) · index อยู่ใน SQL อย่างเดียว · Prisma `migrate diff` ไม่เห็น partial index (baseline QC2 ที่มี partial 3 ตัวของ C2.0 อยู่แล้วยัง diff ว่าง) ⇒ หลัง deploy diff ต้องว่าง · ถ้าใส่ `@unique` ในสคีมา diff จะเสนอ unique เต็มซ้ำ (และ unique เต็มบนตารางเดิม = ผิด S1.6)
เช่นเดียวกัน NOT NULL ของ list 2 คอลัมน์: Prisma ไม่ diff ความ nullable ของ list (หลักฐาน: `CrmAssignmentRule.userIds` ของ C2.0)

## 4. NOT-ADDED (addendum ข้อ 9 · ตรวจแล้วใน SQL)
`CustomerSession` ไม่แตะ (R-C.5 → `PortalSession`) · `ReportDef` ไม่มีคอลัมน์ schedule/recipient (R-E.6 → `settings.crm.reportSchedules[]`) · `MemberSavedView` ไม่แตะ · ไม่มี `PosSale.dealId` (C29) · ไม่มี unique เต็ม `AccountContact(systemId, partyId)` · ไม่มี unique ที่มี `CrmCompanyContact.isPrimary` · ไม่มี FK `CrmCommission.dealId → CrmDeal` · ไม่มี FK จาก `HrPayAdjustment` · ไม่มีคอลัมน์ token ดิบ

## 5. เลื่อนไป C6.1 (ห้ามหลุดเข้า C3.0)
- UNIQUE / NOT NULL / CHECK / FK ที่ต้องถือบนแถว prod เดิม: unique `AccountContact(systemId, partyId)` · unique "หนึ่ง primary ต่อบริษัท" ของ `CrmCompanyContact` (R1 ของ C2.0) · ทำคอลัมน์ nullable เดิมให้ NOT NULL
- FK `HrPayAdjustment.crmCommissionId → CrmCommission` (ถ้าจะมี) — validation อ่านทั้งตาราง
- backfill `crm-backfill-*` + นับซ้ำบน prod แบบอ่านอย่างเดียวก่อน constraint ข้างบน (`ALLOW_PROD_BACKFILL=1 … --dry-run` ก่อน · C6.2)
- บรรทัด crontab production ของ `scripts/crm-cron.mts` (ต้องได้ OK จากเจ้าของ)

## 6. ด่านที่ builder รัน (log ใน `.qc-shots/c30/`)
| คำสั่ง | ผล | log |
|---|---|---|
| `migrate diff` baseline (ก่อนแก้สคีมา) | "This is an empty migration." | `diff-baseline.log` |
| `prisma validate` | valid | `validate.log` |
| `pnpm db:generate` | Generated Prisma Client (v7.8.0) | `generate.log` |
| `pnpm typecheck` (ต้อง `NODE_OPTIONS=--max-old-space-size=4096` — ค่าปริยาย heap OOM exit 134) | exit 0 | `typecheck.log` |
| `pnpm fitness` มี env QC2 / `env -u DATABASE_URL -u DIRECT_URL` | 32/32 · 32/32 (F1.1/F8.1 = 312 model) | `fitness-env.log` · `fitness-noenv.log` |
| `qc-prisma.sh migrate status` (QC2) | ค้างตัวเดียว `20261102000000_crm_v2_c` (exit 1 = ปกติของ Prisma เมื่อมี pending) | `migrate-status.log` |
| `qc-crm-c3.0 --force-run` ก่อน deploy | 17/33 — แดง 15 ข้อเพราะยังไม่ deploy (S1.2 S1.9 S2.1 S3.1–S3.7 X1.1 X3.1 X4.1 X7.1 X8.1) + S4.3 ข้อสอบพังเอง (ดู §7) · ข้อ static บน SQL จริงเขียวครบ (T0.1–3 S1.1 S1.3–S1.8) | `oracle-predeploy.log` |

## 7. ORACLE-EDIT ที่ขอ — `C3.0-S4.3` แดงตลอดไม่ว่า deploy หรือไม่
`green = !/❌|FAIL/i` แต่บรรทัด fitness `F1.3` คือ "scopeOf fail-closed …" ⇒ คำว่า "fail" ตรง regex แบบไม่สนตัวพิมพ์ = แดงปลอม (fitness exit 0 · 32/32) และ regex `F1\.\d[^\n]*` ตัดเครื่องหมาย ✅/❌ ที่อยู่หน้า `[F1.x]` ทิ้ง จึงจับ ❌ จริงไม่ได้ด้วย · แก้ที่เสนอ:
```ts
f1 = (out.match(/^.*\[F1\.\d[^\n]*$/gm) ?? []).join(" | ");
f8 = (out.match(/^.*\[F8\.\d[^\n]*$/gm) ?? []).join(" | ");
const green = (s: string) => s.length > 0 && !/❌/.test(s) && code === 0;
```

## 8. ผู้คุมงาน (Fable 5.1 · 26 ก.ย. 2569) — รับงาน
**อ่าน SQL ทุกบรรทัด (214 บรรทัด · sha256 `36e77600…`)**: CREATE TYPE 6 · ADD COLUMN 1 (`HrPayAdjustment.crmCommissionId` nullable ไม่มี default) · CREATE TABLE 6 · index 13 · FK 5 เฉพาะสาย portal (cascade) · partial unique 1 ท้ายไฟล์ · **ไม่มี** DROP/RENAME/ALTER COLUMN/CHECK/ADD VALUE/คำสั่งข้อมูล · `refId TEXT NOT NULL DEFAULT ''` · เงิน BIGINT · `PortalSession.ipHash` · ไม่มี FK CrmCommission→CrmDeal / HrPayAdjustment→CrmCommission ✔ ตาม addendum 1–14
| # | ผล | หลักฐาน |
|---|---|---|
| D1 | ✅ | ข้อสอบ 33 ข้อเขียนก่อน (24 ก.ย.) · SKIPPED เมื่อไม่มี migration |
| D2 | ✅ | `qc-crm-c3.0` **33/33** QC2 (`c20/.qc-shots/c30/oracle-qc2-postdeploy.log`) · **33/33 ×2** QC1 (`c30-verify.log`) |
| D3 | ✅ | ORACLE-EDIT 1 = `C3.0-S4.3` (ผู้คุมงานพิสูจน์เอง: `/FAIL/i` จับคำ "fail-closed" ของ F1.3 ใน fitness log · regex เดิมตัดเครื่องหมาย ✅/❌ ทิ้งจึงจับแดงจริงไม่ได้ด้วย) |
| D4 | ✅ | ชุดถอยหลังบน QC1 seed ใหม่ (`c30-verify.log` + `c30-verify-v2.log`): m2.9 (ENV ภาพ) · m3.11 (ENV server) · fix-s1 · payroll · payroll-reverse · hr-payadjust · hr · c2.0 · c1.1…c1.11 · c2.1…c2.11 · c0.2 · c0.5 · v1 · pages · cron · m1.9 26/26 · typecheck · fitness 32/32 ×2 — รอบ 1 แดง 27 ชุดเพราะ client ร่วมถูก generate ทับ (CRM-RUN §4 06:50) รอบ 2 เขียวทั้งหมดยกเว้น `c2.7` S0.4 = ข้อสอบนับ `crm_v2_c` เป็น migration แปลกปลอม → ORACLE-EDIT (ชื่อข้อเองบอกว่า c เป็นของ C3.0) → รันซ้ำ 62/63 (X3.2 okPayments=0 ขณะ load 66 · swap เต็ม) → รันซ้ำอีกครั้งเมื่อ load ลด **63/63** (`c27-after-c30-r2.log`) = flake จากเครื่อง |
| D5/D6 | ✅ | `migrate diff` หลัง deploy = ว่าง (S1.9) ทั้ง QC1/QC2 · scope registry F1/F8 312 โมเดล · typecheck exit 0 |
| D7 | ✅ | ไม่มี UI · หน้า v1 ไม่แตะ (S5.1/S5.2 พิสูจน์ INSERT แบบ payroll เดิมยังผ่าน) |
| D8–D11 | ✅ | ไม่มี event ใหม่ · ไม่มี consumer · m1.9 26/26 หลัง DRAIN (S7.2 รอบ 1 ค้าง 8 = ช่วง consumer บูตไม่ได้ · ระบายแล้วเขียว) |
| D12 | ⏳ | รอ push (เจ้าของกด) — `_prisma_migrations` บน prod จะมีแถว `crm_v2_c` เมื่อ deploy ขึ้น |
ลงฐานแล้ว: QC1 · QC2 · QC3 (ผู้คุมงานสั่งเอง) · มติ: FK cascade บน `CrmPortalRequest` = ตามที่ builder เสนอ (สาย portal ลบตามผู้ติดต่อ = PDPA) · `updatedAt` NOT NULL ไม่มี default บน `CrmQuota`/`CrmCommissionRule` — ข้อสอบที่ INSERT ดิบต้องใส่เอง (แจ้งผู้เขียนข้อสอบ C3.2/C3.3 แล้วผ่าน addendum)
