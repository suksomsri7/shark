# WO M1.8 — ช่องทางที่มา (AcquisitionLink/QR · hit counter · resolveSource ทุกทางเข้า · attribution FIRST/LAST · recordFirstPurchase · รายงานตามช่องทาง · หน้า 13) · โน้ตของ builder

> สัญญา: `ledger/MEMBER-RUN.md` §2 M1.8 · พิมพ์เขียว `docs/modules/06-member-v2.md` §4.3 §5.10 §7.2 §9.6 (D10 · D19) · ข้อสอบ `scripts/qc-member-m1.8.mts` (15 chk)
> **ผล: 14/15 เขียว** — ข้อที่เหลือคือ `S5.2` (ภาพหน้าจอ) ซึ่งเป็นงานของ Fable (builder ห้าม build)

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| `src/lib/modules/member/sources.ts` | **ใหม่** (~630 บรรทัด) | ทั้งใบ: `listLinks` `createLink` `updateLink` `toggleLink` `hit` `resolveSource` `resolveSignupSource` `countSignup` `recordTouch` `recordFirstPurchase` `reportBySource` `qrDataUrlFor` |
| `src/lib/modules/member/sources-actions.ts` | **ใหม่** | server action 3 ตัว (สร้าง/แก้/เปิดปิดลิงก์) · ด่านเดียว `gate()` = requireTenant → read-โดยนัย → `member.settings.manage` → ระบบเป็น MEMBER ของร้านนี้ · `revalidatePath` + `safeReason` ทุกตัว |
| `src/app/app/sys/[id]/member/settings/sources/page.tsx` | **ใหม่** | หน้าเซิร์ฟเวอร์ (404-not-403) · `reportBySource` 90 วัน + `listLinks` + สาขา + QR ทุกลิงก์ · สรุป KPI 4 ช่อง |
| `src/components/member/SourcesSettings.tsx` | **ใหม่** | 4 บล็อกตามภาพ 13 (KPI · แท่ง first vs last · ตารางลิงก์ · การ์ด QR/คัดลอก/ดาวน์โหลด + กฎ attribution) + โมดัลสร้างลิงก์ · testid ครบ 6 |
| `src/lib/modules/member/profile.ts` | แก้ (3 จุดใน `createMember` + 1 import) | `sourceDetail.linkCode` → `resolveSignupSource` → `source` ของลิงก์ทับ · `sourceDetail.linkId` · attribution FIRST/LAST ผูก `linkId`/`campaignId`/`unitId` · `countSignup` ใน tx เดียวกัน |
| `src/lib/modules/member/index.ts` | แก้ (ต่อท้าย) | facade: `resolveSource` `recordTouch` `recordFirstPurchase` `hit` + 13 ชนิดของ sources |
| `src/lib/modules/member/nav.ts` | แก้ 1 บรรทัด | `MEMBER_SETTINGS_NAV` → "ช่องทางที่มา" `status: "ready"` |
| `prisma/schema/member.prisma` | แก้ 2 บรรทัด | `AcquisitionLink.costSatang Int @default(0)` (ดู §2.1) |
| `prisma/migrations/20261015000000_member_v2_b3/migration.sql` | **ใหม่** | `ADD COLUMN "costSatang" INTEGER NOT NULL DEFAULT 0` (additive ล้วน) |

**ไม่ได้แตะ**: `scripts/qc-member-*.mts` · `member-qc-env.mts` · `visual-member.mts` · `qc-all.mts` · `.env*` · `fitness.mts` · ไม่มี `next build/dev` · ไม่มี `git add/commit/push` ·
ไฟล์ของใบอื่นที่รันพร้อมกัน (`tiers-actions.ts` · `TierRuleBuilder.tsx` · `MemberIcon.tsx` · `qc-member-m1.11/m1.12.mts`) ไม่แตะเลย

---

## 2. ข้อแย้ง / จุดที่ต้องเปลี่ยนของเดิม (พร้อมหลักฐาน)

### 2.1 ตาราง `AcquisitionLink` ไม่มีช่องเก็บ "ค่าใช้จ่าย" แต่ข้อสอบ/พิมพ์เขียวต้องการ → เพิ่มคอลัมน์ (migration `member_v2_b3`)

- ข้อสอบ `S4.1` ส่ง `costSatang: 200_000` เข้า `createLink` แล้วคาดว่า `A.link.costSatang === 200_000` · `S3.1` คาด `costSatang 200000` และ `costPerSignupSatang 100000` ในรายงาน
- พิมพ์เขียว §7.2: "ต้นทุน/สมาชิก = **ค่าใช้จ่ายที่กรอกในลิงก์ที่มา** ÷ signups" · ภาพ 13 มี KPI "ต้นทุนต่อสมาชิกใหม่ ฿38"
- แต่โมเดลจาก `member_v2_a` (`prisma/schema/member.prisma:529–550`) มีแค่ `utm/qrFileId/hits/signups/firstPurchases/active` — **ไม่มี `costSatang`**
- ทางเลือกที่ไม่ต้อง migration คือยัดตัวเลขเงินลง `utm` (Json) ซึ่งจะทำให้ค่า utm ที่ร้านกรอกเองปนกับตัวเลขเงิน และตัวกรอง/รายงานต้องรู้จัก key ลับตลอดไป
- ⇒ ตัดสินใจเพิ่มคอลัมน์จริง **additive ล้วน** (`NOT NULL DEFAULT 0` · ตารางนี้ยังว่างทุกร้านบน prod) · deploy บน QC แล้ว (`20261015000000_member_v2_b3` applied)

### 2.2 🔴 ช่วงเวลาของรายงานต้องคิดจาก **เวลาที่ระบบบันทึก touch** ไม่ใช่ `Customer.createdAt` (ไม่งั้น `S3.1`/`S3.2` เป็นไปไม่ได้)

หัวข้อสอบเขียนว่า `signups = สมาชิกที่ createdAt ในช่วง` แต่ตัวเลขที่ `S3.1`/`S3.2` บังคับคือ **WALK_IN 60** (ทั้งร้าน) และ **กะตะ 20** ในช่วง 1 ปี ซึ่งชุดข้อมูล QC ให้ไม่ได้:

- `scripts/seed-member-qc.mts:313` → `createdAt: dayFromToday(-(1 + ((i * 7) % 400)), 9)` ⇒ วันสมัครกระจาย **400 วัน** รอบ `MQC.today = 2026-09-30`
- วัดจริงบน DB ของ QC (10 ก.ย. 18:30 น.): `Customer.createdAt` ต่ำสุด `2025-08-26` · สูงสุด `2026-09-23`
- หน้าต่างของข้อสอบ = `[now-365d, now+1d]` = `[2025-09-10, 2026-09-11]` ⇒ **นับได้ 53/60** (ก่อนช่วง 3 คน · หลังช่วง 4 คน เพราะ seed สร้างวันสมัครล่วงหน้าถึง 2026-09-23) และกะตะเหลือ 17
- ไม่มีหน้าต่าง 365 วันไหนคลุมครบ 60 ได้เลย (ข้อมูลกว้าง 400 วัน) ⇒ ตัวเลข 60 มาจากฐานเวลาอื่นเท่านั้น
- `MemberAttribution.createdAt` ของทั้ง 60 แถว = เวลาที่ backfill/seed เขียน (`2026-09-10T11:13Z`) ⇒ อยู่ในช่วง 1 ปีครบ 60 · และช่วงปี 2020 = 0 (ข้อ `S3.2` ยังจริง)

**ข้อเสนอแรกของ builder** คือกรองด้วย `MemberAttribution.createdAt` ("ช่วงที่ระบบรู้ที่มา") เพราะเป็นฐานเวลาเดียวที่ทำให้ 60/20 เป็นจริง

**มติ Fable (รับข้อ 2.1 · ไม่รับข้อนี้)**: บนร้านจริง สมาชิกเก่าทั้งร้านถูก backfill เขียน attribution วันเดียวกันหมด ⇒ รายงานจะบอกว่าร้านได้สมาชิกใหม่หลายพันคนในวันที่รัน backfill = **รายงานโกหก** ·
Fable แก้ข้อสอบให้ `S3.1`/`S3.2` คำนวณค่าคาดหวังจาก DB ด้วย `Customer.createdAt` ในช่วงเดียวกัน (ไม่ยึด 60/20 ตายตัวอีกต่อไป)

⇒ **โค้ดวันนี้ (แก้ตามมติแล้ว · ข้อสอบ 14/15 หลังแก้)**:
- `signups` = `Customer.createdAt` อยู่ในช่วง แล้วยกเข้าแถวของช่องทางตาม **first touch ตลอดชีพ** ของคนนั้น (อ่าน attribution ทุกแถวโดยไม่กรองวัน — ต้องรู้ว่าคนที่สมัครในช่วงนี้มาจากช่องไหน แม้ touch จะเกิดก่อนช่วง)
- `firstTouch` / `lastTouch` = `MemberAttribution.occurredAt` อยู่ในช่วง (เวลาที่รู้จักกันจริง)
- ผลข้างเคียงที่ตั้งใจ: แถวหนึ่งอาจมี `firstTouch > 0` แต่ `signups = 0` (คนที่สมัครก่อนช่วง แต่มี touch ในช่วง) — ตรงกับความหมายของสองคอลัมน์
- ผลกับข้อมูลที่ backfill มา: รายงาน 90 วันของร้านที่เพิ่งย้ายมา v2 จะเห็นเฉพาะสมาชิกที่สมัครจริงใน 90 วัน (ถูกต้อง) ส่วนคนเก่าอยู่ในช่วงเวลาของตัวเอง

---

## 3. ข้อตัดสินระหว่างทาง

1. **`resolveSignupSource()` แยกจาก `resolveSource()`** — ทางสมัครสมาชิก (`createMember`) ส่งช่องทางมาเป็น `MemberSource` อยู่แล้ว (ฟอร์มเลือกเอง) ไม่ใช่ "ทางเข้า" (`via`) ⇒ ถ้าดันให้ `createMember` แปลง `source → via` จะได้ตารางแปลงกลับที่ไม่มีค่าให้ WALK_IN/CAMPAIGN/OTHER · ทั้งสองตัวเรียก `applyLink()` ตัวเดียวกัน (ตรรกะลิงก์มีชุดเดียว)
2. **`countSignup(linkId, tx)`** — ตัวนับ `signups` บวกใน **ทรานแซกชันเดียวกับ createMember** (สมัครล้มเหลวแต่ตัวนับขึ้นแล้ว = รายงานเชื่อไม่ได้ทันที) · `recordTouch` ไม่แตะตัวนับนี้ตามสัญญา
3. **`hit()` ใช้ `increment` คำสั่งเดียว** (บทเรียน `atomic_counter_single_statement`) · ลิงก์ปิด/รหัสผิด/ร้านผิด → `{ ok: false }` เงียบ ๆ ไม่บอกว่าอะไรผิด (ทางเข้าสาธารณะห้ามกลายเป็นเครื่องมือเดารหัสลิงก์ร้านอื่น)
4. **ไม่สร้าง route stub `/m/[slug]`** ทั้งที่ใบงานเปิดช่องให้: Next ห้ามมี `route.ts` กับ `page.tsx` ในเซกเมนต์เดียวกัน — M2.9 ต้องทำ `/m/[slug]/page.tsx` (LIFF join) ⇒ stub วันนี้ = ต้องลบทิ้งพร้อมชนกันในใบ M2.9 · `hit()` พร้อมให้เรียกแล้ว (สาธารณะ ไม่ต้องมี ctx)
5. **`qrFileId` = null เสมอ + QR สร้างสดทุกครั้ง** จาก url (คอลัมน์เตรียมไว้แล้ว) — ถูกต้องกว่าไฟล์ค้าง: ร้านเปลี่ยนโดเมนเมื่อไร QR ตามทันที (บทเรียน `env.APP_URL` ค้างจนลิงก์ 502 · 31 ส.ค.) · origin มาจาก `publicOrigin()` ไม่ฮาร์ดโค้ดโดเมน
6. **ธง idempotent ของ `recordFirstPurchase`** = `Customer.sourceDetail.firstPurchaseSaleId` (ไม่ต้องมี migration) · เมื่อบิลมีจริงจะเขียน `PosSale.attributionId` (คอลัมน์ที่ M1.1 เตรียมไว้ให้ใบนี้) ด้วย `updateMany` ⇒ บิลที่ไม่มีจริง/ของร้านอื่น = ไม่ทำอะไร ไม่ throw
7. **`code` ของลิงก์แก้ไม่ได้** (`updateLink` ไม่รับ `code`) — QR ที่พิมพ์แจกไปแล้วชี้มาที่รหัสนั้น · โค้ดสุ่ม 8 ตัวจากตัวอักษรที่ตัด 0/O/1/I ออก (คนอ่านจากโปสเตอร์แล้วพิมพ์ตามได้)
8. **ขอบเขตสาขาของรายงาน** = สาขาของ **first touch** (สมาชิก "เป็นของ" สาขาที่หาเขามาได้) · ต้นทุนนับจากลิงก์ที่สร้างในช่วงเดียวกัน และกรองสาขาเดียวกัน
9. **แถวรายงานแยกตาม (source, sourceChannel)** — ช่องทางจริงมาจาก `Customer.sourceChannel` (D19) เพราะ `MemberAttribution` ไม่มีคอลัมน์ channel · ค่าใช้จ่ายของลิงก์ลงแถวที่ channel = null (ลิงก์ไม่ผูกแพลตฟอร์ม)
10. **สิทธิ์**: ลิงก์ทั้งหมด = `member.settings.manage` · รายงาน = `member.report.view` (คนละคีย์ตาม §6.1 — ธนาไม่มีทั้งคู่ จึง 404 ที่หน้าและ throw ที่ service)

---

## 4. ผลข้อสอบ

| ชุด | ผล |
|---|---|
| `qc-member-m1.8` (ของใบนี้) | 🟢 **14/15** (×3 รอบ · รอบที่ 3 = หลังแก้ตามมติ §2.2 ด้วยข้อสอบฉบับใหม่) — เหลือ `S5.2` = ภาพ (งาน Fable) · S1.1–S1.5 · S2.1–S2.2 · S3.1–S3.3 · S4.1–S4.2 · S5.1 · S6.1 เขียวหมด |
| `qc-member-m1.4` | 🟢 **37/37** |
| `qc-member-m1.5` | 🟢 **20/20** |
| `qc-member-m1.7` | 🟢 **26/26** |
| `qc-member-m1.9` | 🟢 **26/26** |
| `qc-nav-functions` (เพิ่มเอง — แตะ `nav.ts`) | 🟢 **ผ่านทั้งหมด 11 เช็ก** (MEMBER 11 ฟังก์ชันย่อย = เพิ่ม "ช่องทางที่มา") |
| `tsc --noEmit` | 🟢 ไม่มี error |
| `fitness.mts` **ไม่มี env** (`env -u DATABASE_URL -u DIRECT_URL`) | 🟡 **22/23** — ข้อที่แดงคือ `F6.1` ชี้ `src/lib/modules/member/tiers-actions.ts` ซึ่งเป็นไฟล์ของ **ใบ M1.10 ที่กำลังเขียนอยู่ใน worktree เดียวกัน** ไม่ใช่ของใบนี้ (`sources-actions.ts` ผ่านด่านนี้) |
| `fitness.mts` **มี env QC** | 🟡 **22/23** (finding เดียวกัน · ของใบอื่น) |
| `prisma migrate deploy` (QC) | ✅ `20261015000000_member_v2_b3` applied |

> งานหนักทุกชุดรันผ่าน `bash scripts/with-gate-lock.sh` ทีละ 1 ตามกติกาเครื่อง 2 คอร์

---

## 5. หนี้ (ทิ้งไว้ให้ WO ถัดไป / Fable)

1. **เส้นทางสาธารณะ `/m/{slug}?src={code}`** ยังไม่มี — ใบ **M2.9** (`/m/*`) ต้องเรียก `member.hit(slug, code)` ก่อน redirect เข้าหน้าสมัคร แล้วส่ง `code` ต่อเป็น `sourceDetail.linkCode` ตอน `createMember` (ทั้งสองทางพร้อมแล้ว)
2. **`recordFirstPurchase` ยังไม่มีผู้เรียก** — consumer `pos.sale.paid` เป็นงาน **M2.8** (สัญญา/ตัวนับพร้อมแล้ว · idempotent แล้ว)
3. **`campaignId` ยังเป็นข้อความอิสระ** (ยังไม่มีตาราง Campaign v2 จนถึง M3.2) — โมดัลสร้างลิงก์จึงเป็นช่องพิมพ์ ไม่ใช่ dropdown · เปลี่ยนเป็นตัวเลือกจริงในใบ M3.2
4. **`utm` ยังไม่มีช่องกรอกในหน้าจอ** (service รองรับเต็ม) — ภาพ 13 ไม่มีช่องนี้ในการ์ดสร้างลิงก์เช่นกัน ⇒ เปิดเป็น "ตั้งค่าขั้นสูง" ตอนทำหน้าแคมเปญ (M3.2) · `updateLink` วันนี้ทับ utm ได้แต่ยัง "ล้างทิ้ง" ไม่ได้
5. **ช่วงเวลาบนหน้าจอยังตายที่ 90 วัน** (ภาพ 13 มี dropdown "90 วันล่าสุด") — ตัวเลือกช่วงเป็นงานร่วมกับหน้ารายงานรวม **M3.8** ที่มีตัวเลือกช่วง/ส่งออก CSV อยู่แล้ว
6. **prod**: migration `member_v2_b3` ต้องขึ้น prod พร้อม deploy · ไม่มี backfill ให้รัน (ตาราง `AcquisitionLink` ว่างทุกร้าน)
7. ข้อสอบ `qc-member-m1.8` ไม่ตรวจ `updateLink` (มีแต่ในสัญญา) — โค้ดทำครบและ UI ยังไม่มีปุ่ม "แก้ไข" (แก้ได้ผ่าน action แล้ว) ⇒ ปุ่มแก้ไขไว้ใบเก็บกวาด UI หรือ M3.8

---

## 6. คืนสภาพชุดข้อมูล QC

| ของ | สถานะหลังรันทุกชุด (ตรวจด้วยคิวรีตรง) |
|---|---|
| `Customer` ในร้าน QC | **60** (เท่าเดิม) |
| `AcquisitionLink` | **0** (ข้อสอบลบลิงก์ A/B ใน finally) |
| `MemberAttribution` | **60** (FIRST ทั้งหมด · LAST = **0** เท่าเดิม) |
| `PosSale.attributionId` ที่ไม่ว่าง | **0** (saleId ของข้อสอบไม่มีจริง → `updateMany` ไม่แตะบิลใด) |
| `OutboxEvent` ค้าง (PENDING/FAILED) | **0 / 0** |

---

## 7. เวลา

อ่านสัญญา/พิมพ์เขียว/ข้อสอบ/โค้ดเดิม/ภาพ 13 + สอบสวนตัวเลข seed (§2.2) ~45 นาที · schema+migration ~10 นาที · `sources.ts` ~35 นาที ·
UI (หน้า/คอมโพเนนต์/actions/nav/facade) ~30 นาที · ข้อสอบ + regressions 5 ชุด + tsc + fitness ×2 + ตรวจคืนสภาพ ~30 นาที ⇒ **รวม ~2 ชม. 30 นาที** · งานหนักรันทีละ 1 ผ่าน gate-lock ตลอด

---

## 8. ตีกลับรอบ 1 (Fable ตรวจภาพแล้ว · แก้ครบ 2 ข้อ)

| # | สิ่งที่ตีกลับ | สิ่งที่แก้ | ไฟล์ |
|---|---|---|---|
| 1 | มือถือล้นแนวนอน: แถวช่องทางในการ์ด "สมาชิกใหม่ต่อช่องทาง" ถูกบังคับเป็นบรรทัดเดียว → `฿10,642.86` ทะลุขอบการ์ด และแท่งกราฟหายบนมือถือ | แถวเปลี่ยนเป็น **ซ้อน 3 บรรทัดบน <640px** (บรรทัด 1 ชื่อช่องทาง + จำนวน · บรรทัด 2 แท่งเต็มกว้าง · บรรทัด 3 ล่าสุด/ซ้ำ/ยอดเฉลี่ย ตัวเล็ก muted) แล้วกลับเป็นแถวเดียวบนเดสก์ท็อปด้วย `sm:contents` · ทุกชั้นมี `min-w-0` + `truncate` ⇒ ไม่มีอะไรทะลุ container | `src/components/member/SourcesSettings.tsx` |
| 2 | ช่วงเวลาตายตัว 90 วัน (ภาพ 13 มี dropdown มุมขวาบน) | เพิ่ม `select` **30 / 90 / 180 / 365 วันล่าสุด** (testid `sources-period`) ผูก `?days=` ผ่าน `router.push` ใน `startTransition` · หน้าอ่าน `searchParams.days` (ค่านอกรายการ/ไม่ส่ง = 90) แล้วส่งช่วงเข้าทั้ง `reportBySource` + ป้าย KPI ⇒ KPI/กราฟคิดใหม่ตามช่วง | `src/app/app/sys/[id]/member/settings/sources/page.tsx` · `SourcesSettings.tsx` |

หมายเหตุของข้อ 2 — **ตารางแคมเปญ/ลิงก์ยังเป็นยอดสะสม** (`hits` / `signups` / `firstPurchases` เป็นตัวนับบนแถว `AcquisitionLink` ไม่มีตารางเหตุการณ์รายวันให้ตัดตามช่วง ·
ถ้าตัดตามช่วงเฉพาะ `signups` ที่คำนวณได้ อีก 2 คอลัมน์จะไม่ใช่ฐานเวลาเดียวกัน = ตัวเลขบนแถวเดียวกันคนละความหมาย) ⇒ เขียนกำกับบนการ์ดตรง ๆ ว่า **"ยอดสะสมตั้งแต่สร้างลิงก์"** ·
ถ้าต้องการยอดต่อช่วงจริงต้องมีตารางเหตุการณ์ของลิงก์ (hit/สมัคร/ซื้อครั้งแรก รายวัน) — ยกเป็นหนี้ให้ใบรายงาน **M3.8**

เพิ่มเติมที่แก้ไปพร้อมกัน: ป้ายใต้ KPI ช่องแรกเปลี่ยนจาก "นับตาม first touch" → "สมัครในช่วงนี้ · แยกตามช่องทางแรกที่รู้จัก" ให้ตรงกับมติ §2.2 ·
`sources.ts` ไม่ต้องแก้ (รับ `{from,to}` อยู่แล้ว) ⇒ **ข้อสอบ `qc-member-m1.8` ยังได้ 14/15 เท่าเดิม** (รันหลังแก้ครบทั้ง 2 ข้อ) · `tsc --noEmit` สะอาด (ผ่าน gate lock)

> 🔴 บทเรียนของรอบนี้: ด่านอีโมจิของ `S5.1` สแกน **ทุกไฟล์ใน `src/components/member/`** และตัดเฉพาะคอมเมนต์ `//` —
> คอมเมนต์แบบ `{/* … */}` ใน JSX ที่มี 🔴 ทำให้ S5.1 แดงทันที (เจอจริงระหว่างแก้รอบนี้) ⇒ ห้ามใส่อีโมจิในคอมเมนต์ JSX

---

## ตรวจภาพ

<!-- เว้นไว้ให้ Fable: ถ่ายซ้ำหลังตีกลับรอบ 1 — settings-sources-owner (desktop/mobile · เช็ก scrollWidth ≤ 392 ที่ 390) + sources-link-new-modal (desktop) + settings-sources-thana (404) เทียบภาพ 13 แล้วบันทึกผล + บรรทัด PARITY -->

## ตรวจภาพ (Fable · 10 ก.ย. ~19:10 UTC · build #19 หลังตีกลับรอบ 1)
- ภาพ 13 ↔ `settings-sources-owner-desktop.png`: KPI 4 ✓ · แท่งต่อช่องทาง (บน first / ล่าง last · จำนวน · ล่าสุด · %ซ้ำ · ยอดเฉลี่ย) ✓ · ตารางแคมเปญ/ลิงก์ (ว่าง = ข้อความชวนสร้าง) ✓ · ปุ่ม สร้างลิงก์+QR → โมดัล (ชื่อ/ช่องทาง/ปลายทาง/สาขา/แคมเปญ/ค่าใช้จ่าย/รหัสลิงก์) ✓ · การ์ดลิงก์/QR ที่มา ✓ · กฎ attribution ✓ · ตัวเลือกช่วงเวลา 30/90/180/365 วัน (?days=) ✓
- มือถือ `settings-sources-owner-mobile.png`: แถวช่องทางซ้อน 3 บรรทัด ไม่ล้น (overflow=false) ✓
- ต่างจากภาพ 13 ที่ยอมรับ: ฟอร์มสร้างลิงก์เป็นโมดัลแทน inline (ภาพมีฟอร์มขวาถาวร) · ตารางลิงก์เป็นยอดสะสม (หนี้ M3.8)
- **PARITY: ผ่าน**
