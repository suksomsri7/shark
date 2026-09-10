# M1.1 — schema v2 + enum + ทะเบียนช่องทางกลาง + backfill 6 + seed QC (builder: Opus)

> worktree `/root/projects/shark-member` · branch `session/member` · 10 ก.ย. 2569
> ผลข้อสอบ **22/28** · ที่ตก 6 ข้อเป็น**ข้อแย้งเรื่องตัวข้อสอบเอง** (ดู §5) ไม่ใช่ของขาดในฐานข้อมูล
> ⛔ ไม่ commit / ไม่ push / ไม่ build ตามคำสั่ง · ไม่แตะ `.env` · ไม่แก้ `qc-member-m1.1.mts` / `member-qc-env.mts` / `qc-all.mts`

---

## 1. ไฟล์ที่สร้าง / แก้

### สร้างใหม่
| ไฟล์ | คืออะไร |
|---|---|
| `prisma/migrations/20261012000000_member_v2_a/migration.sql` | migration ชุด A (640 บรรทัด · additive ล้วน) |
| `src/lib/core/channels.ts` | ทะเบียนช่องทางกลาง 15 ช่องทาง (D19) + helper 6 ตัว · ไฟล์บริสุทธิ์ ไม่ import อะไรเลย |
| `scripts/member-backfill-common.mts` | ตัวช่วยร่วมของ backfill (ด่าน env · `--tenant` · `--dry-run` · เลือกร้าน · นิยามระดับ 4 ชั้น) |
| `scripts/member-backfill-tiers.mts` | 1/6 — TierDef 4 แถว · กฎเลื่อนระดับจาก `MemberTierConfig` · `Customer.tierDefId` · TierHistory INITIAL |
| `scripts/member-backfill-fields.mts` | 2/6 — ส่วนระบบ 4 กล่อง + ฟิลด์ระบบ 26 ตัว (isSystem · systemKey) |
| `scripts/member-backfill-consent.mts` | 3/6 — `marketingConsent` → `MemberConsent` LINE/EMAIL/SMS |
| `scripts/member-backfill-party-links.mts` | 4/6 — Customer/ChatContact/CrmContact/AccountContact → `partyId` (+ `customerId`/`linkedBy` ของแชท) |
| `scripts/member-backfill-attribution.mts` | 5/6 — `source` ที่ว่าง → WALK_IN (IMPORT ถ้ามีหลักฐาน) + `MemberAttribution` FIRST |
| `scripts/member-backfill-hr-users.mts` | 6/6 — `HrEmployee.linkedUserId` จากอีเมล (ต้องมี Membership ในร้านเดียวกัน) |
| `scripts/seed-member-qc.mts` | seed ชุดข้อมูล QC (ลบร้านสร้างใหม่ · รัน backfill ทั้ง 6 ท้ายสุด · เขียนเฉลย) |
| `scripts/member-expected.json` | เฉลย (เขียนใหม่ทุกครั้งที่ seed) |

### แก้ไข
| ไฟล์ | แก้อะไร |
|---|---|
| `prisma/schema/member.prisma` | enum ใหม่ 12 ชุด + `TagColor` · `Customer` +29 คอลัมน์ + 5 index · `MemberActivity` + `data`/`actorUserId` + index · **ตารางใหม่ 18 ตาราง** |
| `prisma/schema/automation.prisma` | enum `AutomationScope` · `AutomationRule` + `scope`(default KANBAN)/`memberSystemId`/`tierDefId`/`journeyStats` |
| `prisma/schema/ai_credit.prisma` | `AiCreditSource.MEMBER_ASSIST` |
| `prisma/schema/pos.prisma` | `PosSale` + `voucherUseIds`/`giftCardTxnId`/`tierDiscountSatang`/`stampEventIds`/`attributionId` |
| `prisma/schema/booking.prisma` | `Appointment.stampEventId` |
| `prisma/schema/coupon.prisma` | `Coupon` + `perMemberCode`/`saveToWallet`/`stackWithVoucher` |
| `prisma/schema/marketing.prisma` | `MktCampaign` +7 · `MktRecipient` +5 |
| `prisma/schema/chat.prisma` | `ChatContact.linkedBy MemberLinkMethod?` (`linkedAt` มีอยู่แล้ว ไม่เพิ่มซ้ำ) |
| `prisma/schema/app_system.prisma` | `SystemType.BOOKING` (ข้อตัดสิน 3) |
| `src/lib/core/scope.ts` | ลงทะเบียน 18 model ใหม่ (sys()/tenant) |

**ไม่ได้ทำ** (ตามสัญญา): `HrEmployee` ไม่เพิ่มคอลัมน์ (ใช้ `linkedUserId` เดิม — มติ Fable ข้อ 1) · ตารางกลุ่ม M2/M3 (PointLot/Voucher/StampCard/GiftCard/MemberReview/MemberSegment/CampaignVariantStat) ยังไม่สร้าง · ไม่รัน `prisma format`

---

## 2. คำสั่ง migrate ที่รันบน QC + ผล

ทุกคำสั่ง export env ของ QC ในบรรทัดเดียว + ด่าน `ep-plain-art` (ห้าม `source .env.qc` เพราะค่ามี `&`):

```
DU=$(grep '^DIRECT_URL=' .env.qc | cut -d= -f2- | tr -d '"'); DB=$(grep '^DATABASE_URL=' .env.qc | cut -d= -f2- | tr -d '"');
echo "$DU" | grep -q ep-plain-art || exit 1; DIRECT_URL="$DU" DATABASE_URL="$DB" pnpm exec prisma <คำสั่ง>
```

| คำสั่ง | ผล |
|---|---|
| `prisma validate` | `The schemas at prisma/schema are valid 🚀` |
| `prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema --script` (ก่อนลง) | 613 บรรทัด → เอามาเป็นตัวตั้งของ migration แล้วแก้มือ |
| `prisma migrate deploy` | `Applying migration 20261012000000_member_v2_a` · applied สำเร็จ (126 migrations) |
| `prisma migrate diff …` (หลังลง) | **`-- This is an empty migration.`** ⇒ ไม่มี drift |
| `prisma generate` | `Generated Prisma Client (v7.8.0)` |

**จุดที่แก้มือใน migration.sql** (จุดเดียว): unique ของ `Customer(tenantId, referralCode)` เขียนเป็น partial index
`CREATE UNIQUE INDEX "Customer_tenantId_referralCode_key" ON "Customer"("tenantId","referralCode") WHERE "referralCode" IS NOT NULL;`
ชื่อ index ตรงกับที่ Prisma ตั้งจาก `@@unique` เป๊ะ ⇒ `migrate diff` มองว่าไม่ต่าง (พิสูจน์แล้วด้วยผล empty migration ด้านบน)
ตรวจ destructive แล้ว: ไม่มี `DROP TABLE` / `DROP COLUMN` / `DROP TYPE` / `ALTER COLUMN … TYPE` / `SET NOT NULL` สักบรรทัด (ข้อสอบ S1.12 เขียว)

---

## 3. ผลข้อสอบ

```
JSON_SUMMARY {"total":28,"passed":22,"findings":[
 {"id":"M1.1-S1.2","sev":"CRITICAL"},{"id":"M1.1-S1.6","sev":"CRITICAL"},{"id":"M1.1-S1.8","sev":"CRITICAL"},
 {"id":"M1.1-S1.9","sev":"CRITICAL"},{"id":"M1.1-S1.10","sev":"CRITICAL"},{"id":"M1.1-S1.11","sev":"CRITICAL"}]}
```

เขียวทั้งหมด: S1.1 · S1.3 · S1.4 · S1.5 · S1.7 · S1.12 · S1b.1 · S1b.2 · S2.1–S2.8 · S3.1 · S3.2 · S3.3 · S3.4 · S4.1 · S4.2

ที่ตก 6 ข้อ **มีสาเหตุเดียวกันหมด** = ตัวช่วย `hasIdx()` ของข้อสอบ (บรรทัด 43) — ดู §5

รอบแรกตก 7 ข้อ · ข้อที่ 7 (`S1b.2`) **เป็นบั๊กของผมเอง** และแก้แล้ว: คอมเมนต์ในหัวไฟล์ `channels.ts` เขียนคำว่า
`@prisma/client` ไว้ ซึ่งชน regex ตรวจ "ไฟล์บริสุทธิ์" ของข้อสอบ (มันเทียบทั้งไฟล์ ไม่ได้แยกคอมเมนต์) → เปลี่ยนถ้อยคำเป็น
"ชนิดที่ Prisma สร้าง" แล้วเขียว

---

## 4. regressions / typecheck / fitness

| ชุด | ผล |
|---|---|
| `qc-kanban-k1.1.mts` | **30/30** ✅ |
| `qc-kanban-k2.9.mts` (แตะ `AutomationRule` โดยตรง) | **25/26** — ที่ตกคือ `K2.9-S11.7` "ภาพจริง ≥ 4 ใบใน `.qc-shots/kanban/2.9`" (worktree นี้ยังไม่เคยถ่ายภาพ · builder ห้าม build) ไม่เกี่ยวกับ schema |
| `qc-acc-v2-pos-lines.mts` (แตะ `PosSale`) | **87/87** ✅ |
| `pnpm fitness` (มี env) | **23/23** ✅ |
| `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` | **23/23** ✅ |
| `pnpm typecheck` | ❌ **1 error — ไม่ใช่ไฟล์ของใบนี้** (ดูด้านล่าง) |

**ชุดที่ตั้งใจไม่รัน** (เปิดหัวไฟล์ดูแล้ว = `process.loadEnvFile(".env")` ⇒ แตะ **prod**):
`qc-chat-member-autolink.mts` (บรรทัด 14) · `qc-point.mts` (บรรทัด 30) · `qc-member-tier.mts` (บรรทัด 54)
→ 3 ชุดนี้ยังไม่ได้พิสูจน์ว่าเขียว ขอให้ Fable ย้ายมาใช้ `loadQcEnv()` ก่อน (หนี้ §6 ข้อ 1)

### typecheck: error เดียวที่ค้าง มาจากข้อสอบใบอื่น
```
scripts/qc-member-m1.4.mts(277,102): error TS2304: Cannot find name 'tag'.
```
- ไฟล์นี้ **ไม่ใช่ของ M1.1** — เป็น oracle ของ M1.4 ที่ Fable เขียนคู่ขนานระหว่างผมทำงาน (mtime 05:57 · ยัง untracked ไม่อยู่ใน commit `708722b`)
- บรรทัด 277: `await d(() => P.memberChannelIdentity.deleteMany({ where: { tenantId: tid, externalId: { contains: tag } } }));` — ตัวแปร `tag` ไม่เคยถูกประกาศในไฟล์ (เป็น typo ล้วน ไม่เกี่ยวกับ schema/ชนิดที่ผมเพิ่ม)
- **พิสูจน์ว่าโค้ดของใบนี้สะอาด**: รัน `tsc --noEmit` ด้วย tsconfig ชั่วคราวที่ exclude เฉพาะไฟล์นั้นไฟล์เดียว → **exit 0 ไม่มี error เลย** (ไม่ได้แก้ไฟล์ข้อสอบ · ไฟล์ tsconfig ชั่วคราวลบทิ้งแล้ว)
- ผมไม่แก้ให้ตามกติกา "ห้ามแก้ข้อสอบ" — ขอให้ Fable แก้ตอนตรวจรับ

---

## 5. ข้อแย้งต่อข้อสอบ (พร้อมหลักฐาน)

### 5.1 🔴 `hasIdx()` สมมติผิดว่า Postgres ใส่เครื่องหมายคำพูดให้ชื่อคอลัมน์เสมอ — ทำให้ตก 6 ข้อทั้งที่ index มีครบ

**ตัวช่วยของข้อสอบ (บรรทัด 43)**
```ts
const hasIdx = async (t, colsIn, unique = false) => (await q(
  `select 1 from pg_indexes where tablename='${t}' ${unique ? "and indexdef ilike '%unique%'" : "…"} `
  + colsIn.map((c) => `and indexdef ilike '%"${c}"%'`).join(" ")
)).length >= 1;
```
มันบังคับว่าใน `indexdef` ต้องเจอสตริง `"ชื่อคอลัมน์"` **พร้อมเครื่องหมายคำพูด**

**ความจริงของ Postgres**: `pg_get_indexdef` ใส่เครื่องหมายคำพูดเฉพาะชื่อที่ *จำเป็น* ต้องใส่ (มีตัวพิมพ์ใหญ่/เป็นคำสงวน)
ชื่อคอลัมน์ที่เป็น **ตัวพิมพ์เล็กล้วน** จะถูกพิมพ์แบบไม่มีคำพูด — หลักฐานจาก QC DB จริง:
```
CREATE UNIQUE INDEX "MemberTag_systemId_name_key"          ON public."MemberTag"          USING btree ("systemId", name)
CREATE UNIQUE INDEX "AcquisitionLink_tenantId_code_key"    ON public."AcquisitionLink"    USING btree ("tenantId", code)
CREATE UNIQUE INDEX "MemberAttribution_customerId_touch_key" ON public."MemberAttribution" USING btree ("customerId", touch)
CREATE UNIQUE INDEX "MemberConsent_customerId_channel_key" ON public."MemberConsent"      USING btree ("customerId", channel)
CREATE UNIQUE INDEX "MemberSection_systemId_key_key"       ON public."MemberSection"      USING btree ("systemId", key)
CREATE INDEX        "MemberActivity_customerId_module_createdAt_idx" ON public."MemberActivity" USING btree ("customerId", module, "createdAt")
```
คอลัมน์ที่โดน: `key` · `name` · `code` · `touch` · `channel` · `status` · `version` · `module` · `source`
(ชุดข้อสอบบอร์ดงานไม่เจอปัญหานี้เพราะบังเอิญตรวจแต่คอลัมน์ camelCase)

**ผลกระทบต่อ 6 ข้อที่ตก** — ทุกข้อ "คอลัมน์ครบ" (ข้อความ act พิมพ์ `ขาด` ว่างเปล่าทุกบรรทัด) เหลือแค่ index ที่แมตช์ไม่ติด:

| ข้อ | เงื่อนไขที่แมตช์ไม่ติด | คอลัมน์ตัวพิมพ์เล็ก |
|---|---|---|
| S1.2 | `Customer(tenantId, source)` | `source` |
| S1.6 | `MemberSection(systemId,key)` · `MemberField(systemId,key)` | `key` |
| S1.8 | `MemberConsent(customerId,channel)` · `MemberChannelIdentity(tenantId,channel,externalId)` | `channel` |
| S1.9 | `MemberPrivacyRequest(tenantId,status)` · `MemberPrivacyPolicy(systemId,version)` · `MemberTag(systemId,name)` | `status` `version` `name` |
| S1.10 | `MemberTierDef(systemId,key)` · `AcquisitionLink(tenantId,code)` · `MemberAttribution(customerId,touch)` | `key` `code` `touch` |
| S1.11 | `MemberActivity(customerId,module,createdAt)` | `module` |

**พิสูจน์ว่าของครบจริง**: รัน `hasIdx` เวอร์ชันที่ทน "ไม่มีเครื่องหมายคำพูด" กับ DB เดียวกัน → **ผ่านครบ 12/12 เงื่อนไข**
```
✅ S1.2 Customer(tenantId,source)                       ✅ S1.9 MemberPrivacyRequest idx(tenantId,status)
✅ S1.6 MemberSection uniq(systemId,key)                ✅ S1.9 MemberPrivacyPolicy uniq(systemId,version)
✅ S1.6 MemberField uniq(systemId,key)                  ✅ S1.9 MemberTag uniq(systemId,name)
✅ S1.8 MemberConsent uniq(customerId,channel)          ✅ S1.10 MemberTierDef uniq(systemId,key)
✅ S1.8 MemberChannelIdentity uniq(tenantId,channel,externalId)  ✅ S1.10 AcquisitionLink uniq(tenantId,code)
✅ S1.10 MemberAttribution uniq(customerId,touch)       ✅ S1.11 MemberActivity idx(customerId,module,createdAt)
```
ส่วนอื่นของ 6 ข้อนั้นผ่านหมดแล้ว (ตรวจแยกทีละเงื่อนไข): `colType(MemberField.type)=MemberFieldType` ·
`MemberSensitivePolicy.roles=_Role` · `hrPositions=_text` · `MemberTierDef.legacyTier=MemberTier` ·
`AutomationRule.scope=AutomationScope` (default `'KANBAN'::"AutomationScope"`) · `ChatContact.linkedBy=MemberLinkMethod` ·
partial unique ของ `referralCode` มีจริง 1 ใบ (`… WHERE ("referralCode" IS NOT NULL)`)

**ทำไมผมแก้ให้ผ่านไม่ได้**: ชื่อคอลัมน์ต้องเป็น `key`/`name`/`channel`/… ตามที่ข้อสอบเองบังคับใน `hasAll()`
และ Postgres จะไม่มีวันใส่คำพูดให้ชื่อพวกนี้ ⇒ ไม่มีทางเลือกที่ซื่อสัตย์เลยสักทาง
(ทางเดียวที่ "ผ่าน" ได้คือตั้งชื่อ index ให้มีเครื่องหมายคำพูดฝังอยู่ ซึ่งเป็นการโกงข้อสอบและทำให้ migrate diff พัง)

**เสนอแก้ (Fable)** — เปลี่ยน `hasIdx` ให้ไม่พึ่งการเดารูปแบบสตริง เช่น
```ts
const hasIdx = async (t, colsIn, unique = false) => {
  const rows = await q<{indexdef:string}>(`select indexdef from pg_indexes where tablename='${t}' and indexdef ${unique ? "" : "not "}ilike '%unique%'`);
  return rows.some((r) => { const body = r.indexdef.slice(r.indexdef.indexOf("USING"));
    return colsIn.every((c) => body.includes(`"${c}"`) || new RegExp(`[(, ]${c}[,)]`).test(body)); });
};
```
(หรือดีกว่านั้น: อ่านจาก `pg_index` + `pg_attribute` ตรง ๆ ไม่ต้อง match ข้อความเลย)

### 5.2 🟠 `S3.3` บังคับให้เก็บวันเกิดเป็น "ปี 2026" = วันเกิดในอนาคต
ข้อสอบนับ `birthDate` ในช่วง `2026-10-01 … 2026-11-01` ต้องได้ 12 คน ⇒ seed ต้องเก็บ `2026-10-{index}`
ซึ่ง **เป็นวันในอนาคต** (วันอ้างอิงของชุดข้อมูล `MQC.today = 2026-09-30`) — ข้อมูลที่เป็นเท็จเชิงความหมาย
และจะกลายเป็นระเบิดเวลาเมื่อ journey วันเกิดของ M3.3 คำนวณอายุ/รอบปีถัดไป
ทำตามข้อสอบไปก่อนแล้ว (seed เก็บ `2026-10-{index}` สำหรับ index 1–12 · index อื่นเก็บปีเกิดจริง 19xx)
**เสนอแก้**: เปลี่ยนเงื่อนไขเป็น "เดือน 10 ปีใดก็ได้" (`extract(month from "birthDate") = 10`) แล้วให้ seed เก็บปีเกิดจริง
เช่น `1990-10-{index}` — โค้ด seed เตรียมไว้ให้แก้จุดเดียวที่ฟังก์ชัน `birthOf()` (มีคอมเมนต์ 🔴 กำกับไว้แล้ว)

---

## 6. ข้อตัดสินนอกสัญญา (เลือกทางที่ additive/ปลอดภัยที่สุด)

1. **`SystemType` ไม่มีค่า `BOOKING`** แต่ `MQC.systems` บังคับให้ร้าน QC มี `AppSystem` ประเภท BOOKING
   (ระบบจองของจริงเก็บเป็น `BusinessUnit` ไม่ใช่ `AppSystem`) → **เพิ่มค่า enum `BOOKING`** (`ALTER TYPE … ADD VALUE`
   = additive ล้วน) · ไม่มีโค้ดเดิมเปลี่ยนพฤติกรรม (`ensureUnitSystems` ยัง provision แค่ MEMBER/POINT/POS/REWARD ·
   fitness F9.1 ตรวจทิศทาง "available ⇒ มีใน enum" ซึ่งไม่กระทบ)
2. **ไม่มี enum `TagColor` ในสคีมา** (พิมพ์เขียว §4.3 อ้างถึงโดยไม่มีที่มา) → สร้างใหม่ 6 ค่าเท่ากับ `KanbanLabelColor`
   (SLATE/BLUE/GREEN/AMBER/RED/PURPLE = โทเคน `--color-tag-*` ของดีไซน์) แยก enum เพราะเป็นคนละโดเมน
3. `hrDepartmentIds[]` ของพิมพ์เขียว → ใช้ **`hrDepartments String[]`** ตามมติ Fable ข้อ 2
4. ตารางใหม่ทั้ง 18 **ไม่ผูก FK/relation** ข้ามโมดูล (แบบเดียวกับ `partyId` ของ WO 3.1) — เก็บเป็น id ข้อความล้วน
   เหตุผล: ลบ/รวมสมาชิกในอนาคตไม่ต้องไล่ลำดับ cascade และ backfill ทนข้อมูลกำกวมได้
5. `updatedAt` ใส่ครบทั้ง 18 ตาราง (ข้อสอบบังคับเฉพาะ 14 ตารางที่แก้ได้ · อีก 4 ตารางเป็น log ที่ยังมีคอลัมน์
   ถูกอัปเดตทีหลังจริง เช่น `MemberTierHistory.notifiedAt`)
6. `member-backfill-party-links.mts` เป็นสคริปต์เดียวที่ **ไม่** ห่อ transaction ต่อร้าน — เพราะต้องเรียก
   `party.safeFindOrCreate` ผ่าน facade ซึ่งเปิดขาอ่าน/เขียนของตัวเอง (ยัดเข้า tx ของเราจะกลายเป็น nested tx)
   ชดเชยด้วยความ idempotent เต็มรูปแบบ: แตะเฉพาะแถวที่ `partyId = null` ⇒ รันซ้ำ/รันค้างกลางทางแล้วรันใหม่ ผลเท่าเดิม
7. backfill-consent เขียนแถว `granted=false` ให้คนที่ปฏิเสธด้วย (ไม่ใช่ "ไม่มีแถว") — PDPA ต้องแยก
   "เคยถามแล้วไม่ยอม" ออกจาก "ไม่เคยถาม" · ข้อสอบ S2.3 ยืนยันทิศทางนี้
8. seed: บิล POS เรียก `createSale` **ภายใน `$transaction` ของเรา** (ownsTx=false) เพื่อไม่ให้ตัดสต็อก/ระบายคิวเอง
   แล้วตรึงวันที่บิลก่อน จากนั้นระบายคิว outbox **วนจนเงียบ** ท้ายสุด (บทเรียน `reference_outbox_drain_must_loop_until_quiet`)
9. seed: เติมคอลัมน์ v2 ของสมาชิก (`tier`/`totalSpentSatang`/`createdAt`) **หลัง**สร้างบิล เพราะ `createSale` →
   `member.recordSpend` เขียนยอด/ระดับทับ ⇒ ถ้าเติมก่อน การแจก 30/15/10/5 จะเพี้ยน
10. seed: นัดหมายสร้างด้วยวันในอนาคตทั้ง 40 รายการ (service ปฏิเสธเวลาที่ผ่านไปแล้วเป็นกติกาของโมดูลจอง)
    แล้วค่อยย้าย 20 รายการแรกไปอดีต + `status = DONE` ⇒ ได้ "อดีต/อนาคตปน" โดยไม่ต้องแหกกติกาของ booking

---

## 7. หนี้ / ผัดไปใบถัดไป

1. **3 ชุดข้อสอบเดิมยัง `loadEnvFile(".env")` (แตะ prod)** — `qc-chat-member-autolink` · `qc-point` · `qc-member-tier`
   ทั้งสามแตะตารางที่ใบนี้แก้ (`ChatContact` · `PointLedger` ทางอ้อม · `Customer.tier`) แต่รันไม่ได้อย่างปลอดภัย
   ⇒ ขอให้ย้ายมาใช้ `loadQcEnv()` แล้วรันเป็น regression จริง
2. `scripts/qc-member-m1.4.mts` typecheck ไม่ผ่าน (`tag` ไม่ถูกประกาศ) — Fable แก้
3. `MemberSensitivePolicy` / `MemberAccessLog` / `MemberPrivacyPolicy` / `MemberPrivacyRequest` / `MemberSavedView` /
   `MemberTag` / `MemberAddress` / `AcquisitionLink` / `MemberTierBenefit` — **มีตารางแล้วแต่ยังไม่มีข้อมูลใน seed**
   (เจ้าของงานคือ M1.4/M1.5/M1.7/M1.8/M1.9) · ถ้าใบไหนต้องการข้อมูลตั้งต้น ให้เติมใน seed ใบนั้น
4. ฟิลด์ระบบ 26 ตัวยัง **ไม่มีเอนจิน** — M1.2 ต้องเปลี่ยน seed ส่วน "เทมเพลตดำน้ำ" จาก insert ตรง → `applyTemplate`
   (จุดที่ต้องแก้มีคอมเมนต์ 🔴 กำกับไว้ใน `seed-member-qc.mts` §12)
5. `backfill-points-lots` (ข้อ 4 ของ §4.6) ยกไป M2.1 ตามมติ Fable — ยังไม่ได้เขียน
6. คอลัมน์ใหม่ของ `PosSale`/`Appointment`/`Coupon`/`MktCampaign`/`MktRecipient` ยัง **ไม่มีโค้ดเขียนค่า**
   (เตรียมช่องไว้ให้ migration เป็นก้อนเดียว) — เจ้าของคือ M2.3/M2.5/M2.6/M2.8/M3.2
7. prod: ยังไม่ได้ลง migration และยังไม่ได้รัน backfill (Fable ทำหลัง push + Vercel READY · dry-run ก่อนทุกร้าน)

---

## 8. การคืนสภาพ QC

- ข้อสอบคืนสภาพเองใน `finally` (ลบลูกค้า BF-1/2/3 · ห้องแชท · ผู้ติดต่อ CRM · พนักงาน HR ทดสอบ · ผู้ใช้ · ร้าน "MEMBER BF OTHER")
- ตรวจหลังรันจริง: ร้าน `siam-dive-member-qc` มี **1 ร้าน · สมาชิก 60 คน** · ร้าน `member-bf-other-*` เหลือ **0**
  · `member-expected.json` ชี้ `tenantId` เดียวกับใน DB (`cmtv4ly2o0000qykzm2q4hw5p`)
- ฐานข้อมูล QC อยู่ในสภาพ **"หลัง seed + backfill ครบ 6 ตัว"** พร้อมให้ M1.2 ใช้ต่อทันที
- ชุดข้อมูลของงานอื่นในฐาน QC เดียวกัน (บอร์ดงาน · บัญชี V2) ไม่ถูกแตะ — พิสูจน์จาก k1.1 30/30 และ acc-v2-pos-lines 87/87

---

## 9. เวลาที่ใช้

~2 ชม. 40 นาที (อ่านสัญญา/ข้อสอบ ~35 นาที · schema+migration ~35 นาที · channels+backfill 6 ตัว ~30 นาที ·
seed ~30 นาที · รันข้อสอบ 2 รอบ + regressions + typecheck + ไล่หาเหตุที่ตก ~30 นาที)
seed รันครั้งละ ~64 วินาที · ข้อสอบเต็มรอบละ ~7 นาที
