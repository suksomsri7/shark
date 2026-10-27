# ใบสั่ง R0.1 — migration `svc_r0` (schema กลาง · additive ล้วน) · ตรวจ **เข้ม** (กันจองซ้อน)

> แหล่งความจริง: `ledger/SVC-MASTER-PLAN.md` แถว R0.1 · `ledger/SVC-CORE-CONTRACT.md` (CC) §1.2 §2.2 §3.2 §4.2 §5.2 · กติกา `ledger/SVC-RUN.md` §1
> ข้อสอบ (ห้ามแก้): `scripts/qc-svc-r0.1.mts` — 63 ข้อ · รับใบ = **ผ่าน 63/63 ไม่มี SKIP**
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install`** · รายงานต่อข้อ (id ข้อสอบ → ผล)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | ทำอะไร | สัญญา |
|---|---|---|
| «prisma/schema/settings.prisma» (ใหม่) | `SettingValue` `SettingProfile` `SettingChange` | CC §1.2 |
| «prisma/schema/integration.prisma» (ใหม่) | `TenantIntegration` `IntegrationCallLog` | CC §2.2 |
| `prisma/schema/payment.prisma` | + `PaymentSlip` | CC §3.2 |
| `prisma/schema/chat.prisma` | + `ChatLinkCode` `ServiceMessageLog` | CC §4.2 |
| `prisma/schema/hotel.prisma` | + คอลัมน์ `HotelRoomType`/`HotelRoom` · + `RoomBuilding` `RoomOccupancy` | CC §5.2 (K11: **ไม่ rename** โมเดลเดิม) |
| `prisma/schema/core.prisma` | `enum UnitType` + `DORM` **บรรทัดสุดท้าย** | CC §5.2 |
| «prisma/migrations/<ts>_svc_r0/migration.sql» | migration เดียวของใบ | §3 ด้านล่าง |
| `src/lib/core/scope.ts` | ลงทะเบียน 10 โมเดลใหม่ (บรรทัดเพิ่มเท่านั้น) | §2 ด้านล่าง |
| «scripts/svc-qc-env.mts» (ใหม่) | ตัวโหลด env + ด่าน host ของ RUN SVC | §4 ด้านล่าง |

## 2. สัญญาที่ข้อสอบตรวจ (นอกจาก CC)
- **ชนิด/ค่าเริ่ม** ตาม CC ตรงตัว: `String`→text · `Int`→integer · `Json`→jsonb · `DateTime`→timestamp(3) · `Decimal`→numeric · `String[]`→text[] · `RoomOccupancy.startDate/endDate` = `@db.Date` · ช่องที่ CC ไม่มี `?` = NOT NULL · `SettingValue.effectiveFrom @default("1970-01-01T00:00:00Z")` · ค่าเริ่ม `DRAFT`/`MANUAL`/`0`/`{}`/`[]`/`NIGHTLY`/`CLEAN`/`true` ตาม CC
- `createdAt` → `@default(now())` · `updatedAt` → `@updatedAt` · `at`/`appliedAt` → `@default(now())`
- **ห้ามเพิ่มคอลัมน์ NOT NULL ที่ไม่มีค่าเริ่มนอก CC** (ข้อสอบจะพิมพ์ชื่อออกมาถ้ามี — ผู้คุมตีกลับ)
- **FK**: ได้เฉพาะ `tenantId`→Tenant · `unitId`→BusinessUnit · `RoomOccupancy.roomId`→HotelRoom · `HotelRoom.buildingId`→RoomBuilding · `IntegrationCallLog.integrationId`→TenantIntegration (ใส่หรือไม่ก็ได้) · ช่องอ้างอิงอื่น (`refId` `fileId` `partyId` `approvalId` `connectionId` `verifierIntegrationId` …) = ข้อความเฉย ๆ **ไม่มี FK**
- ดัชนี: ชื่อใดก็ได้ แต่คอลัมน์/ลำดับ/unique ต้องตรง CC (I-1…I-10)
- scope (fitness F1): โมเดลใหม่ทุกตัว = `tenant` · ใช้ `unit` ได้เฉพาะตัวที่ `unitId` บังคับ (SettingProfile · PaymentSlip · ServiceMessageLog · RoomBuilding · RoomOccupancy) · ห้าม `g()`/`sys()`
- `pnpm exec prisma generate` ให้ client รู้จักโมเดลใหม่ (F-4) — ⚠️ `node_modules` ของเลนนี้ bind จาก «shark-svc» ⇒ generate ทับ client ของทุกเลน (additive จึงยอมได้ · แจ้งในรายงาน)

## 3. migration (กติกา RUN §1.1 ข้อ 5)
1. สร้างผ่านฐาน qc-svc เท่านั้น: `bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec prisma migrate dev --create-only --name svc_r0`
   - 🔴 `prisma.config.ts` โหลด `.env` (production) ถ้ามีไฟล์ — ห้ามมี `.env` ในทรี · ห้ามรัน prisma นอก `qc-svc.sh`
   - ถ้า prisma ถามว่าจะ **reset** ฐาน/เจอ drift → **หยุด ห้ามตอบ y** · รายงานผู้คุม
2. **อ่าน SQL ทุกบรรทัด**: ไม่มี DROP/RENAME/เปลี่ยนชนิด/SET NOT NULL · ADD COLUMN NOT NULL ต้องมี DEFAULT · `ALTER TYPE "UnitType" ADD VALUE 'DORM'` (ไม่มี BEFORE/AFTER) · ไม่มี UPDATE/DELETE ข้อมูล (M-2)
3. เติม **SQL มือ** ท้ายไฟล์ (Prisma เขียนเองไม่ได้ — M-3 · I-11…I-14):
   - `CREATE EXTENSION IF NOT EXISTS btree_gist;` (R0.0 ยืนยันว่ามีบน Neon)
   - `ALTER TABLE "RoomOccupancy" ADD CONSTRAINT … EXCLUDE USING gist ("roomId" WITH =, daterange("startDate","endDate",'[)') WITH &&) WHERE (active);`
   - `CREATE UNIQUE INDEX … ON "PaymentSlip"("tenantId","imageHash") WHERE status <> 'REJECTED';`
   - `CREATE UNIQUE INDEX … ON "PaymentSlip"("tenantId","transRef") WHERE "transRef" IS NOT NULL AND status <> 'REJECTED';`
   - ใส่คอมเมนต์ในไฟล์ .prisma ข้างโมเดลว่ามี constraint SQL มือ (ชื่อ constraint/index) — ใบ migration ถัดไป (B.0/D.0) ต้องลบบรรทัด DROP ที่ prisma อาจสร้างให้ของพวกนี้
4. ลงฐาน qc-svc: `bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec prisma migrate deploy` (M-5)
- **ห้าม `prisma format` ทั้งชุด** — จัดรูปได้เฉพาะไฟล์ในตาราง §1 · บรรทัดเดิมห้ามลบ/แก้ (ยกเว้นช่องว่างจัดแนว) — ข้อสอบเทียบ `git diff -w` กับ 33e8272c (M-4)

## 4. «scripts/svc-qc-env.mts» (E-1…E-8)
- `export const SVC_QC_HOST_MARK = "ep-mute-scene"` · `export function loadSvcQcEnv(label: string): { host: string; envFile: string }`
- พฤติกรรมตามแบบ `loadPosQcEnv` ใน `scripts/pos-qc-env.mts`: `QC_ENV_FILE` (ปริยาย `.env.qc-svc` · ไม่มีไฟล์ได้ถ้า export env มาแล้ว) · env ที่ export มาก่อนชนะไฟล์ (คืนทั้ง `DATABASE_URL` และ `DIRECT_URL`) · ตรวจ **ทั้งสอง URL**: prod (`isProdDbUrl` จาก `./qc-env-guard.mjs`) / QC ของ RUN อื่น (`ep-plain-art` `ep-cool-shadow` `ep-weathered-river` `ep-frosty-lab` `ep-fragrant-thunder`) / host ที่ไม่มี `ep-mute-scene` ⇒ `process.exit(4)` **ไม่มีทางปลด** · `APP_ENV=production` ⇒ exit 4 · ไม่ตั้ง ⇒ `development` · พิมพ์ host (ห้ามพิมพ์ URL/รหัสผ่าน)
- ห้าม import prisma หรือ `@/…` (fitness/ข้อสอบ import ได้โดยไม่มี env)

## 5. เกณฑ์รับ (ผู้คุมรันเอง)
1. `bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/qc-svc-r0.1.mts` → **ผ่าน 63/63 · SKIP 0**
2. regression (ต้องเขียวเท่า baseline `ledger/wo-notes/svc-baseline-*.txt`) — คำสั่งรูปเดียวกัน แทนชื่อไฟล์: `scripts/qc-hotel-money.mts` · `scripts/qc-hotel-public.mts` · `scripts/qc-hotel-refund.mts` · `scripts/qc-booking-race.mts`
3. typecheck + `scripts/fitness.mts` 2 โหมด (มี env / `env -u DATABASE_URL`) — F1 เขียว · smoke ยังไม่มี (สร้างใน R0.2)
4. ตรวจเข้ม 2 รอบ: SQL migration ทีละบรรทัด + EXCLUDE/partial unique + ไม่มี DROP

## 6. ห้าม
- แตะ `src/` นอก `scope.ts` · แตะโมดูลโรงแรม/จองคิว (การเขียน `RoomOccupancy` จากโรงแรม = R0.8) · แตะ POS/HR
- rename `HotelRoom*` · เปลี่ยน `HotelRoom.floor` เดิม · ลบ/แก้คอลัมน์หรือ enum เดิม
- migration มากกว่า 1 โฟลเดอร์ · แก้ migration เก่า · `migrate reset` · ใช้ `.env`/`.env.qc`/ฐานอื่นนอก qc-svc
- แก้ `scripts/qc-svc-r0.1.mts` (ข้อสอบผิดจริง = เขียนแย้งในรายงาน · RUN §1.3 ข้อ 11)
