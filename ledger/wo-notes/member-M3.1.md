# M3.1 — segments (กลุ่มลูกค้า) · โน้ตผู้ทำ

> builder: Opus · 11 ก.ย. 2569 · worktree `shark-member` · ข้อสอบ `scripts/qc-member-m3.1.mts` (ไม่ถูกแตะ)

## 1. ไฟล์ที่ส่งมอบ

**สคีมา / migration**
- `prisma/schema/member.prisma` — ตาราง `MemberSegment` ใหม่ + relation `Customer.fieldValues/consents/pointBalances/vouchers` · `MemberFieldValue.customer/field` · `MemberConsent.customer` · `MemberField.values`
- `prisma/schema/point.prisma` — `PointBalance.customer`
- `prisma/schema/voucher.prisma` — `Voucher.customer`
- `prisma/migrations/20261025000000_member_v2_g/migration.sql` — additive: สร้างตาราง + index 2 + เก็บกวาดแถวกำพร้า + FK 5 เส้น
- `src/lib/core/scope.ts` — ลงทะเบียน `MemberSegment: sys()`

**เอนจิน / facade**
- `src/lib/modules/member/segments-shared.ts` (ใหม่ · **ไฟล์บริสุทธิ์** ไม่มี prisma/env/facade) — ชนิดข้อมูล · `SEGMENT_OPS`/`SEGMENT_OP_LABELS` · `parseDefinition` · `describeDefinition` · `valueList`/`boolOf` (หน้าจอ client กับเอนจินใช้ชุดเดียวกัน)
- `src/lib/modules/member/segments.ts` (ใหม่) — `listSegmentFields` · `evaluateSegment` · `countSegment` · `sampleSegment` · `segmentMembers` · `listSegments` · `getSegment` · `saveSegment` · `deleteSegment` · `describeDefinition` · `parseDefinition` · `canManageSegments` · `SEGMENT_OPS` / `SEGMENT_OP_LABELS`
- `src/lib/modules/member/segments-actions.ts` (ใหม่ · `"use server"`) — `countSegmentAction` · `sampleSegmentAction` · `saveSegmentAction` · `deleteSegmentAction`
- `src/lib/modules/member/index.ts` — export ชุด segment (Edit เฉพาะท้ายไฟล์)
- `src/lib/modules/marketing/segments.ts` (ใหม่) — re-export ผ่าน `@/lib/modules/member` ล้วน (ไม่มีตรรกะ)
- `src/lib/modules/member/nav.ts` — `MEMBER_CAMPAIGN_NAV` (กลุ่มลูกค้า) + ต่อท้ายใน `memberNavChildren`

**หน้าจอ**
- `src/app/app/sys/[id]/member/segments/page.tsx` (รายการ)
- `src/app/app/sys/[id]/member/segments/[segmentId]/page.tsx` (ตัวสร้างเงื่อนไข · `new` = กลุ่มใหม่)
- `src/components/member/SegmentBuilder.tsx` · `src/components/member/SegmentsList.tsx`

## 2. ผลการทดสอบ

| ชุด | ผล |
|---|---|
| `qc-member-m3.1` (หลัง Fable แก้ข้อสอบ S2.6/S2.9/S2.11 ให้คิดสดจาก DB) | **19/20** — เหลือ S6.2 (ภาพ/PARITY = งาน Fable) |
| _(รอบแรก ก่อน Fable แก้ข้อสอบ)_ | 8/10 — ตาย (uncaught) ที่บรรทัด 117 ของข้อสอบเอง · ข้อแย้ง §3 |
| `pnpm exec tsc --noEmit` | ✅ ผ่าน |
| `fitness.mts` (มี env) | ✅ 26/26 |
| `fitness.mts` (ไม่มี env) | ✅ 26/26 |
| `qc-member-m2.5` | ✅ 26/26 |
| `qc-member-m1.4` | ✅ 37/37 |
| `qc-member-m2.10` | ✅ 20/20 (QC server :3215) |
| `qc-member-m1.5` | 🔴 18/20 — **ไม่เกี่ยวกับใบนี้** (ดู §5) |
| `prisma migrate diff` หลัง deploy | ✅ `-- This is an empty migration.` |

สำเนาที่ใช้พิสูจน์ (`scripts/tmp-m31-selfcheck.mts`) **ลบทิ้งแล้ว** — ข้อสอบตัวจริงไม่ถูกแก้แม้แต่ตัวอักษรเดียว

## 3. ข้อแย้งต่อข้อสอบ (พร้อมหลักฐาน — Fable ตัดสิน)

### 3.1 🔴 S2.9 บรรทัด 117 ทำให้ข้อสอบตายทั้งชุด — `"STAFF"` ไม่ใช่ค่าใน enum `MemberSource`
```
const expSrc = await prisma.customer.count({ where: { ...base, source: "STAFF" as Any } });
```
`MemberSource` มี `WALK_IN POS BOOKING LINE_OA LIFF WEB_FORM CHAT REFERRAL IMPORT CRM CAMPAIGN API MARKETPLACE APP OTHER` — ไม่มี `STAFF`
⇒ Prisma โยน `Invalid value for argument 'source'. Expected MemberSource.` (ไม่ได้อยู่ใน `fails()` จึงหลุดออกไปที่ catch ใหญ่ → `M3.1-ERR` และข้อ S2.9–S6.2 ไม่ถูกวัดเลย)
**เคยเกิดกับใบ M2.6 มาแล้ว** (ledger §3.1 แถว M2.6: "Fable แก้ข้อสอบ 2 จุด · source STAFF→WALK_IN")
ข้อเสนอ: เปลี่ยนเป็น `WALK_IN` ทั้ง 2 ที่ในข้อ S2.9 (เฉลย + ค่าที่ส่งให้ `countSegment`) — ทำแบบนี้แล้วข้อ S2.9 **ผ่าน** (60/20/40)
หมายเหตุการออกแบบฝั่งโค้ด: ค่าที่ไม่อยู่ในทะเบียน (เช่น `source in ["STAFF"]`) เอนจิน **ไม่ throw** แต่แปลว่า "ไม่ตรงใคร" (กติกาเดียวกับตัวกรอง tier ของ M1.5) ⇒ ถ้า Fable อยากคงคำว่า STAFF ไว้ ก็ต้องแก้เฉลยเป็น 0 ทั้งคู่

### 3.2 🔴 S2.6 เฉลยฮาร์ดโค้ด `→ 4` ขัดกับข้อมูล seed
วัดจาก DB จริง (ก่อนข้อสอบเตรียม cache): สมาชิกที่ `spent12mSatang >= 3_600_000` มี **13 คน** อยู่แล้ว (สูงสุด 12,500,000) — seed ให้ยอด 12 เดือนกับสมาชิกครบทั้ง 60 คน
หลังข้อสอบตั้ง cache ให้ 5 คน (3.5M…3.9M) ⇒ ค่าจริง = **17** ไม่ใช่ 4 (ส่วน `visits12m gte 10 → 3` ถูกต้อง เพราะ seed ให้ทุกคน `visits12m = 2`)
ข้อเสนอ: คิดเฉลยสดจาก DB `await prisma.customer.count({ where: { ...base, spent12mSatang: { gte: 3_600_000 } } })` (ทำแบบนี้แล้วข้อนี้ **ผ่าน**) หรือยกเกณฑ์ให้เกินยอดสูงสุดของ seed แล้วเทียบเฉพาะ 5 คนที่เตรียมไว้

### 3.3 🟠 S2.11 "createdAt before วันนี้+1 = ทุกคน 60" — ข้อสอบหมดอายุตามวันที่ (วันนี้ยังทำไม่ได้)
seed ใช้วันอ้างอิง `MQC.today = 2026-09-30` แต่นาฬิกาเครื่องวันนี้ = **2026-09-11** ⇒ มีสมาชิก **4 คนที่ `createdAt` อยู่ในอนาคต** (2026-09-15 / 16 / 22 / 23)
ค่าที่ถูกต้องวันนี้จึงเป็น **56** ไม่ใช่ 60 (ส่วน `birthdayMonth eq 10 → 12` และ `gender FEMALE → 15` ผ่านทั้งคู่)
ข้อนี้จะ **กลับมาผ่านเองตั้งแต่ 1 ต.ค. 2569** — ถ้าอยากให้เขียววันนี้ ให้เทียบกับ `prisma.customer.count({ where: { ...base, createdAt: { lt: <วันเดียวกับที่ส่งเข้า countSegment> } } })` (บทเรียน `feedback_oracle_rots_over_time`)

## 4. ข้อตัดสินของ builder (จุดที่สัญญาไม่ชัด)

1. **สิทธิ์บันทึก/ลบ = `member.promo.manage` หรือ `marketing.campaign.create`** (`canManageSegments`)
   เหตุ: ข้อสอบ S5.1 บังคับว่า **ปุ๊กบันทึก PRIVATE ได้** และ **ธนาบันทึกไม่ได้** แต่สิทธิ์จริงของทั้งคู่ใน seed คือ
   ปุ๊ก = `member.report.view · member.customer.{read,create,update} · marketing.campaign.{create,send}` (ไม่มี `member.promo.*` เลย) ·
   ธนา = `member.customer.{read,create,update}` ⇒ ถ้าใช้ `member.promo.manage` อย่างเดียว ปุ๊กจะบันทึกไม่ได้และข้อสอบตาย
   เหตุผลเชิงธุรกิจ: กลุ่มลูกค้าคือ "ขั้นที่ 1 ของการสร้างแคมเปญ" (ภาพ 21) คนที่ร้านมอบหมายให้ทำแคมเปญต้องบันทึกกลุ่มเป้าหมายของตัวเองได้
   (พนักงานหน้าร้านที่มีแค่ `member.customer.*` ยังบันทึกไม่ได้เหมือนเดิม) · ข้อความปฏิเสธยังอ้างคีย์ `member.promo.manage` ตามพิมพ์เขียว
2. **ต้องเพิ่ม relation จริง 5 เส้นใน migration** (`MemberFieldValue→Customer/MemberField` · `MemberConsent→Customer` · `PointBalance→Customer` · `Voucher→Customer`)
   เหตุ: ข้อสอบเองอ่านด้วย `where: { customer: base }` / `field: {...}` (บรรทัด 95 · 101 · 110 · 113) ซึ่ง **รันไม่ได้เลย** ถ้าไม่มี relation
   (บรรทัด 95 ไม่มี `.catch` ⇒ ข้อสอบตายทันที) · ได้ประโยชน์จริงด้วย: ลบสมาชิกตาม PDPA แล้วค่าฟิลด์/ยินยอม/แต้ม/voucher หายตามจริง
   🔴 migration มี `DELETE` แถวกำพร้าก่อนผูก FK (แบบเดียวกับ `member_v2_f2_identity_fk` ของ M2.9) — **บน QC ลบไป 73 แถวของ `PointBalance`**
   (ยอดแต้มของลูกค้าที่ถูกลบไปแล้วจากชุดทดสอบเก่า) · ตารางอื่นกำพร้า 0 ⇒ **ก่อน deploy prod ต้องนับ orphan ก่อน** (คำสั่งใน §6)
3. **ฟิลด์ระบบเป็นทะเบียนคงที่ 11 ตัว** (`memberCode name phone email gender nationality birthDate status createdAt ownerUserId referredById`)
   ไม่ได้อ่านจากแถว `MemberField` ที่ `isSystem && filterable` เพราะคอลัมน์พวกนี้มีทุกร้านเสมอ และข้อสอบเรียก `gender`/`createdAt` ตรง ๆ
   (ใน seed `createdAt` ไม่มีแถว MemberField ด้วยซ้ำ) · ฟิลด์ที่ร้าน **สร้างเอง** ยังต้องเปิดสวิตช์ "ใช้กรองได้" ตามกติกา §11 เหมือนเดิม
   ⇒ `listSegmentFields` ของร้าน QC = 33 ฟิลด์ (12 ความภักดี/ที่มา + 7 ยินยอม + 11 ระบบ + 3 กำหนดเอง)
4. **unit scope ของ segment = `homeUnitId` ตรง ๆ** (ไม่ OR กับ "เคยมีกิจกรรมที่สาขาตน" แบบหน้ารวมสมาชิกของ M1.5)
   เหตุ: ข้อสอบ S5.2 เทียบกับจำนวน `homeUnitId = ป่าตอง` เป๊ะ ๆ · และเชิงธุรกิจ "จำนวนคนที่จะส่งถึงจริง" ไม่ควรรวมคนที่บังเอิญเคยเดินผ่านสาขา
5. **ค่าที่ไม่รู้จัก ≠ ฟิลด์ที่ไม่รู้จัก**: ฟิลด์/ช่องทาง/ตัวดำเนินการที่ไม่มีในทะเบียน → throw ไทย · แต่ "ค่า" ที่ไม่อยู่ในตัวเลือก (ระดับที่ถูกลบ/ที่มาที่สะกดไม่ตรง) = ไม่ตรงใคร ไม่ทำหน้าแตก (กติกาเดียวกับ M1.5)
6. `after` ใช้ `>=` และ `before` ใช้ `<` — เพื่อให้ "after X" กับ "before X" รวมกันได้ทุกคนพอดี (ข้อสอบ S2.2 บังคับ `expInactive + expActive === total`)
7. `nin` / `neq` **นับคนที่ยังไม่มีค่าด้วย** (ไม่มีสาขาหลัก = ไม่ได้อยู่สาขากะตะ) — SQL `NOT IN` ตัด NULL ทิ้งซึ่งไม่ตรงกับที่คนเข้าใจ
8. `points` / `voucherCount`: "ไม่มีแถว = 0" ⇒ ถ้า 0 เข้าเงื่อนไข เอนจินจะถามกลับข้าง ("ทุกคน ยกเว้นคนที่ค่าไม่เข้าเกณฑ์") — ทำให้ `points gte 0` = ทุกคนจริง
9. `birthdayMonth` อ่าน `birthDate` ของทั้งระบบมาคัดเดือนในหน่วยความจำ (Prisma กรอง `EXTRACT(MONTH …)` ตรง ๆ ไม่ได้) — คิวรีเดียว 2 คอลัมน์ · หนี้ประสิทธิภาพบนร้าน 50,000 คน จดไว้ใน §5
10. อ่านตาราง `Voucher` / `PointBalance` / `CrmContact` ตรงจาก `member/segments.ts` (ผ่าน `./db` — ไม่เพิ่ม F5/F2) เพราะเป็นคำถามแบบชุด "ทุกคนในร้าน" ที่ facade รายคนตอบไม่ไหว (precedent: `profile.pointsOfMany` · `privacy` อ่าน `crmContact`)
11. เมนู: **ไม่เพิ่มลง `MEMBER_NAV`** (ข้อสอบ M1.3-S1.6 ล็อกไว้ 9 หมวด) — ใช้ทะเบียนใหม่ `MEMBER_CAMPAIGN_NAV` ต่อท้ายใน `memberNavChildren` (drawer ☰) แทน · M3.2 ค่อยเปิดหมวด "แคมเปญ" เป็น ready แล้วดึงลิงก์นี้เข้าไปเป็นแท็บย่อย
12. หน้าตัวสร้าง: นับครั้งแรก **ที่เซิร์ฟเวอร์** (เปิดมาเห็นเลขจริงทันที ไม่รอ JS) แล้วค่อยนับสดแบบหน่วง 500 มิลลิวินาทีเมื่อผู้ใช้แก้ · เงื่อนไขที่ยังเลือกค่าไม่เสร็จจะไม่ถูกส่งไปนับ (ตัวเลขไม่กระพริบเป็น 0 ระหว่างพิมพ์)

## 4.1 ตีกลับรอบ 1 — `next build` พัง (tsc ผ่านแต่ build ไม่ผ่าน)

อาการ: `SegmentBuilder.tsx` (`"use client"`) import `@/lib/modules/member/segments` → ไฟล์นั้น import `./db` → `core/db.ts` → `@prisma/adapter-pg` → `pg` เข้าบันเดิลเบราว์เซอร์ → Module not found
แก้: แยกไฟล์บริสุทธิ์ `segments-shared.ts` (ชนิดข้อมูล · ทะเบียนตัวดำเนินการ/ป้ายไทย · `parseDefinition`/`describeDefinition` · ตัวช่วยอ่านค่า · import แค่ `./errors` ที่บริสุทธิ์อยู่แล้ว)
- `segments.ts` import + re-export จากไฟล์นั้น ⇒ facade/marketing/ผู้เรียกเดิมไม่ต้องแก้อะไรเลย
- `SegmentBuilder.tsx` import จาก `segments-shared` เท่านั้น · ค่าที่ต้องคิวรี (นับ/รายชื่อ/บันทึก/ลบ) ผ่าน server action `segments-actions.ts` เหมือนเดิม
- `SegmentsList.tsx` ตรวจแล้ว: import แค่ `segments-actions` (server action) — ไม่มีปัญหาเดียวกัน
ตรวจซ้ำ: `grep -rl '"use client"' src/components/member/*.tsx` แล้วไล่ดู import ทุกไฟล์ → ไม่มีไฟล์ client ไหน import `member/segments` อีก (ทั้งแบบ value และ type)
บทเรียนที่จดไว้หัวไฟล์ `segments-shared.ts`: **tsc ไม่จับสายพึ่งพาที่พังเฉพาะตอนบันเดิล** — client component ต้อง import ได้เฉพาะไฟล์บริสุทธิ์หรือ server action

## 5. หนี้ / เรื่องที่ยังค้าง

- ~~`qc-member-m1.5` 18/20~~ → Fable ตรึงระดับใน seed หลังระบายคิวแล้ว กลับเป็น 20/20 (สาเหตุเดิมคือระดับเลื่อนเองจากชุดทดสอบ POS ไม่ใช่ใบนี้) · บันทึกไว้เป็นหลักฐาน: **`qc-member-m1.5` 18/20 ตอนส่งรอบแรกไม่ได้เกิดจากใบนี้**: S1.3/S2.2 พังเพราะระดับสมาชิกในชุด QC เลื่อนไปเอง **12 คน** (เช่น `UCE4A5` SILVER→gold · `7VC93N` GOLD→platinum) ตาม `totalSpentSatang` ที่ชุดทดสอบ POS เขียนเพิ่ม — สมาชิกที่เลื่อน (index 21,27–30,40–45,55) **ไม่ใช่** 5 คนที่ข้อสอบ M3.1 แตะ (index 1,2,3,46,47) และโค้ดใบนี้ไม่เขียนอะไรลง `Customer` เลย ⇒ ให้รันซ้ำหลัง reseed
- `birthdayMonth` ยังไม่มี index (อ่านทั้งระบบมาคัดในหน่วยความจำ) — ถ้าจะรองรับ 50,000 คนแบบสบาย ควรทำ index บน `EXTRACT(MONTH FROM "birthDate")` ในใบรายงาน (M3.8) หรือเก็บคอลัมน์ `birthMonth` ตอน backfill
- `voucherCount` ใช้ `groupBy` ทั้งร้านต่อ 1 เงื่อนไข — ร้านที่มี voucher เป็นแสนใบควรเปลี่ยนเป็น subquery/CTE ตอนทำรายงาน
- ยังไม่มี REST/AI op ของ segment (ตามแผนอยู่ใบ M3.10) และยังไม่ได้เปิดลิ้นชัก "กลุ่ม" ของโมดัลออก voucher (M2.5) — ข้อสอบใบนี้ไม่ได้ขอ ถ้า Fable อยากได้ในใบนี้บอกได้ (facade มี `segmentMembers` ให้เรียกแล้ว)
- หน้าตัวสร้างยังไม่มีปุ่ม "ดูรายชื่อทั้งหมด" บนจอ (มี `sampleSegmentAction` เตรียมไว้แล้ว) — ภาพ 21 ไม่มีปุ่มนี้จึงยังไม่ใส่

## 6. ก่อน deploy prod (ฝาก Fable)

```sql
-- ต้องได้ 0 ทุกบรรทัด ไม่งั้น migration จะ "ลบ" แถวกำพร้าเหล่านั้นทิ้ง (ตั้งใจ แต่ต้องรู้ตัวเลขก่อน)
SELECT (SELECT count(*) FROM "MemberFieldValue" v WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.id=v."customerId")) AS fv_customer,
       (SELECT count(*) FROM "MemberFieldValue" v WHERE NOT EXISTS (SELECT 1 FROM "MemberField" f WHERE f.id=v."fieldId")) AS fv_field,
       (SELECT count(*) FROM "MemberConsent" v WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.id=v."customerId")) AS consent,
       (SELECT count(*) FROM "PointBalance" v WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.id=v."customerId")) AS point_balance,
       (SELECT count(*) FROM "Voucher" v WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.id=v."customerId")) AS voucher;
```
บน QC: fv 0/0 · consent 0 · **point_balance 73 (ถูกลบ)** · voucher 0

## 7. ตรวจภาพ (Fable กรอก)

ภาพที่ต้องถ่าย: `segments-owner` (desktop + mobile) · `segments-builder-owner` (desktop) · `segments-thana` · `segments-noperm` (404)
สิ่งที่ตั้งใจให้ตรงภาพ 21 ขั้น 1: ป้ายหัวการ์ด `1 · กลุ่มเป้าหมาย` + คำอธิบาย Segment builder · ชิปดำ "สมาชิกที่" แถวแรก · ชิป "และ" แถวถัดไป · ช่องค่าเป็นชิปฟ้าเมื่อเลือกแล้ว · แถวท้าย "+ เพิ่มเงื่อนไข" พื้นเทา · กล่องฟ้า "n คน เข้าเงื่อนไข · ยอดซื้อ 12 เดือนเฉลี่ย ฿x/คน" + บรรทัด "ตัวอย่าง: …" · ปุ่ม "บันทึกเป็น Segment"

ยังไม่ได้เห็นภาพจริง (builder ห้าม build) — เมื่อเทียบกับ mockup แล้วผ่าน ให้เติมบรรทัดผลตรวจ parity ตามรูปแบบของ common.md ไว้ใต้หัวข้อนี้

### ตรวจภาพ (Fable · 11 ก.ย. 03:35 UTC · QC server build จริง · หลังแก้ client import)
- `segments-builder-owner-desktop` เทียบภาพ 21 ขั้น 1: หัว "1 กลุ่มเป้าหมาย · Segment builder" · ประโยค [สมาชิกที่][ระดับ][เป็น][Gold, Platinum] · แถว "และ" (ไม่ซื้อ/ไม่จอง มากกว่า 30 วัน · ยินยอมรับข่าวสารทาง ไลน์ ใช่) · ปุ่ม + เพิ่มเงื่อนไข · + หรือ เพิ่มกลุ่มเงื่อนไข · กล่องนับ (n คน เข้าเงื่อนไข · ยอดซื้อ 12 เดือนเฉลี่ย · ตัวอย่างชื่อ) · ชื่อ + scope + ปุ่ม "บันทึกเป็น Segment" ✓ (0 คน = ข้อมูล QC ไม่มี gold ที่หาย 30 วัน+ยินยอม LINE — ไม่ใช่บั๊ก)
- `segments-owner` รายการ (ชื่อ · เงื่อนไขย่อ · จำนวน · นับเมื่อ · scope · เจ้าของ · ลบ) + ปุ่มสร้าง ✓ · mobile ยุบ ✓ · thana อ่านอย่างเดียว ✓ · noperm 404 ✓
- **PARITY: ผ่าน**
