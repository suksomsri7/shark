# M2.1 — แต้ม v2: กฎได้แต้ม · ล็อต FIFO/หมดอายุ · cron · backfill

> builder: Opus · worktree `/root/projects/shark-member` · 10 ก.ย. 2569
> สัญญา: `scripts/qc-member-m2.1.mts` · `ledger/MEMBER-RUN.md` §2 M2.1 · พิมพ์เขียว `docs/modules/06-member-v2.md` §4.1 §4.2 §4.3 §4.6 §5.5 §7.1 §7.5 §11.4

## 1. ไฟล์ที่ส่งมอบ

| ไฟล์ | ทำอะไร |
|---|---|
| `prisma/schema/point.prisma` (แก้) | enum `PointExpiryMode` / `PointRuleKind` / `PointEventBonus` · `PointSettings` +13 คอลัมน์ v2 · `PointLedger` +`lotId/expiresAt/multiplier/ruleId/data` · ตารางใหม่ `PointRule` `PointLot` `PointTransfer` |
| `prisma/migrations/20261016000000_member_v2_c/migration.sql` (ใหม่) | migration `member_v2_c` — additive ล้วน (CREATE TYPE / CREATE TABLE / ADD COLUMN เท่านั้น) |
| `src/lib/core/scope.ts` (แก้ 3 บรรทัด) | ลงทะเบียน `PointRule: sys()` · `PointLot: sys()` · `PointTransfer: tenant` |
| `src/lib/modules/point/db.ts` (ใหม่) | จุดเดียวของโมดูลที่แตะ prisma ดิบ (แบบ `member/db.ts`) — กัน F5.1 บวมเกิน baseline |
| `src/lib/modules/point/internal.ts` (ใหม่) | ของใช้ร่วม: `withTx` `getSettings` `readSettings` `balanceIn` `writeLedger` `applyDelta` + ตัวช่วยเวลาไทย (`bkkDayIndex/DayStart/DayOfWeek/MinuteOfDay` `endOfBkkYear` `addMonths` `parseHhMm`) |
| `src/lib/modules/point/rules.ts` (ใหม่) | `listRules` `upsertRule` `toggleRule` `deleteRule` `computeEarn` (กฎ 6 ชนิด · zod ต่อชนิด · เพดาน 30 · สิทธิ์ `member.settings.manage`) |
| `src/lib/modules/point/lots.ts` (ใหม่) | `earnWithLot` `burnFifo` `reverseWithLots` `expireDue` `expiringSoon` `notifyExpiring` `usesOf` |
| `src/lib/modules/point/service.ts` (แก้) | v1 `earn`/`credit` **สร้างล็อตให้ด้วย** · `reverse` v1 คืนสภาพล็อต · `setPointSettings` เป็น v2 (15 ช่อง · รับได้ทั้ง `tenantId` และ `{tenantId}`) · ย้ายตัวช่วยไป `internal.ts` |
| `src/lib/modules/point/index.ts` (แก้) | facade: export ชุด v2 ครบ + `getPointSettings`/`setPointSettings` |
| `src/lib/outbox-consumers.ts` (แก้เฉพาะจุด) | consumer no-op ของ `point.earned/burned/expiring/expired/transferred` |
| `src/lib/automation/labels.ts` (แก้เฉพาะจุด) | `AUTOMATION_EVENTS` +5 ตัว ป้ายไทย (spread ต่อเข้า `WEBHOOK_EVENTS` ⇒ ไม่ประกาศซ้ำที่ `webhooks/labels.ts`) |
| `src/lib/platform/cron.ts` (แก้เฉพาะจุด) | `sweepPointExpiry` + `sweepPointExpiring` · step ใน `runDailyCron` (try/catch แยก) · summary +`pointExpired` `pointExpiring` |
| `scripts/member-backfill-points-lots.mts` (ใหม่) | backfill §4.6 ข้อ 4 — `--tenant` · `--dry-run` · idempotent |

## 2. ผลข้อสอบ

| ชุด | ผล |
|---|---|
| `qc-member-m2.1.mts` | 🟢 **30/30** (รัน 2 รอบ ผลเท่ากัน) |
| `tsc --noEmit` | ✅ ผ่าน (เหลือแต่ error ระหว่างทางของ builder M2.6 ในไฟล์ `outbox-consumers.ts`/giftcard ซึ่งไม่ใช่ของใบนี้) |
| `fitness.mts` (มี env) | 🟢 26/26 |
| `fitness.mts` (`env -u DATABASE_URL -u DIRECT_URL`) | 🟢 26/26 |
| regression `qc-point.mts` | 🟢 18/18 (เท่าเดิม) |
| regression `qc-member-m1.9.mts` | 🟢 26/26 (เท่าเดิม) |
| regression `qc-member-m1.4.mts` | 🟢 37/37 (เท่าเดิม) |
| `prisma migrate deploy` (QC) | ✅ `20261016000000_member_v2_c` applied |
| `prisma migrate diff … --script` | ✅ `-- This is an empty migration.` |
| drain คิวหลังรันทั้งชุด | ✅ 18 ใบ → DONE ทั้งหมด · PENDING 0 · FAILED 0 (consumer ใหม่ไม่ล้ม) |

## 3. ข้อตัดสิน (จุดที่สัญญาไม่ชัดและตัดสินเอง)

1. **`PointLedger.data Json?`** — สัญญาพูดถึง "ledger BURN data.lotIds" แต่ตารางเดิมไม่มีช่อง `data`
   ⇒ เพิ่มคอลัมน์ `data Json?` ใน migration นี้ (additive) · BURN เก็บ `{ lots: [{lotId, points}], lotIds: [...] }`
   **เหตุผล**: ถ้าไม่จำว่าไปตัดล็อตไหนเท่าไร `reverseWithLots` คืนแต้มกลับ "ล็อตเดิม" ตาม §11.4 ไม่ได้เลย
   (จะเหลือทางเดียวคือเปิดล็อตใหม่ให้ทุกครั้ง = ต่ออายุแต้มให้ลูกค้าฟรีทุกครั้งที่ void บิล)

2. **`setPointSettings` รับตัวแรกได้ 2 แบบ** (`tenantId: string` และ `{ tenantId }`)
   ข้อสอบ M2.1 เรียกแบบ `{ tenantId }` แต่ regression `qc-point.mts` + `src/lib/actions/systems.ts`
   (หน้าตั้งค่าแต้มเดิม) เรียกแบบ string ⇒ รับทั้งคู่แทนการหักสัญญาเดิมทิ้ง · แก้ให้เหลือแบบเดียวได้ที่ M2.2
   ที่ทำหน้าตั้งค่าแต้มใหม่อยู่แล้ว

3. **ช่องที่ไม่ส่งมา = ไม่แตะ** ใน `setPointSettings` (คีย์แปลกปลอมอย่าง `id`/`createdAt` ถูก zod ตัดทิ้ง)
   ⇒ ข้อสอบส่งทั้งแถวกลับมาได้ · หน้าจอเดิมส่งแค่ 2 ช่องก็ไม่ทำลายค่าอื่น

4. **`daysLeft` คิดแบบ "จำนวนวันเต็มที่เหลือ"** = `floor((expiresAt − now) / 1 วัน)` ไม่ใช่ผลต่างวันปฏิทินไทย
   **เหตุผล**: ผลต่างวันปฏิทินขึ้นกับว่า cron รันกี่โมง (ล็อตที่เหลือ "7 วัน 1 ชั่วโมง" จะกลายเป็น 8 ถ้ารันตอน
   ใกล้เที่ยงคืนไทย) ⇒ การแจ้งเตือน 30/7 วันจะกระโดดข้ามไปเงียบ ๆ · แบบ floor นิ่งกับเวลาที่รันเสมอ
   ส่วน "วันไทย" ยังใช้จริงกับ **เพดานต่อวัน** และ **สิ้นปีของ END_OF_YEAR** ตามสัญญา

5. **`CATEGORY_BONUS` แบบ `points` (แต้มคงที่)** — บวก **ครั้งเดียวต่อกฎ** เมื่อมีบรรทัดในหมวดนั้นอย่างน้อย 1 บรรทัด
   (ต่างจาก `ITEM_BONUS` ที่สัญญาระบุชัดว่า "ต่อชิ้น" ⇒ คูณ qty) · สัญญาเขียนแค่ "points คงที่"
   ส่วนแบบ `x` คิดจาก **แต้มฐานของบรรทัดนั้น** (`floor(line.netSatang / satangPerPoint)`) ตามข้อสอบ S2.4

6. **แต้มฐานรายบรรทัดของ `CATEGORY_BONUS` ไม่หักส่วนที่จ่ายด้วยบัตรกำนัล/voucher/แต้ม** (หักเฉพาะยอดรวมของ BASE)
   เพราะบิลไม่ได้บอกว่าเงินก้อนไหนไปจ่ายบรรทัดไหน — การเฉลี่ยเองจะเป็นการเดา ⇒ เลือกทางที่อธิบายลูกค้าได้ตรง ๆ

7. **เพดานต่อวันนับ `EARN` ทุกใบของวันไทยนั้น** (ไม่ได้กรองว่ามาจากบิลขายเท่านั้น) เพราะ ledger v1 ไม่ได้แยก
   ที่มาไว้ · ส่วน `EVENT_BONUS` **ไม่นับและไม่ติดเพดาน** ตาม §11.4 (บวกหลังตัดเพดานเสมอ)
   เมื่อโดนตัด จะมีบรรทัด `DAILY_CAP` (ค่าติดลบ) ใน `breakdown` ให้เห็นว่าหายไปเท่าไรและเพราะอะไร

8. **`expireDue` ทำทีละล็อตใน transaction สั้น ๆ** (หยิบครั้งละ 1,000 ใบ แล้ววนจนหมด)
   **เหตุผล**: ร้อยพันล็อตใน transaction เดียวจะชน timeout และถือล็อกยาวจนหน้าขายค้าง · idempotent ผ่าน
   `expiredAt` + `idempotencyKey = point.expire:<lotId>` ⇒ รันซ้ำได้ทุกเมื่อ

9. **v1 `earn()` / `credit()` สร้างล็อตให้ด้วย** (สัญญาบังคับเฉพาะ "ต้องมี lotId") · `credit()` ใช้อายุตาม
   settings ของร้าน แต่ **ไม่ดูสิทธิ์ระดับ `NO_POINT_EXPIRY`** เพราะเป็นการคืนแต้ม ไม่ใช่การได้แต้มจากการซื้อ

10. **v1 `reverse()` คืนสภาพล็อตด้วย** (นอกสัญญาข้อสอบ) — ถ้าไม่ทำ POS void วันนี้จะทำให้ยอดคงเหลือกับ
    ผลรวมล็อตเพี้ยนกันทันทีจนกว่า M2.8 · คีย์ ledger เดิม (`<key>:<i>`) **ไม่เปลี่ยน** เพื่อไม่ให้ void
    ที่เคยบันทึกบน prod กลายเป็นซ้ำ · เพิ่มด่านกันคืนล็อตซ้ำด้วยการเช็ค `<key>:0`

11. **`PointTransfer` มี `systemId`** (พิมพ์เขียวไม่ได้ระบุ) เพื่อให้ M2.2 query ตามระบบแต้มได้ · แต่ลงทะเบียน
    scope เป็น `tenant` เพราะคู่โอนอยู่ร้านเดียวกันเสมอและหน้าประวัติต้องกวาดข้ามระบบ

## 4. หนี้ / งานที่ส่งต่อ

- **`adjustPoints` (v1) ยังไม่แตะล็อต** — บวกมือไม่เปิดล็อต · ลบมือไม่กินล็อต ⇒ ยอดคงเหลือกับผลรวมล็อต
  ของคนที่ถูกปรับมือจะต่างกัน · **M2.2 เป็นเจ้าของ `adjust` + สายอนุมัติอยู่แล้ว** ให้ต่อล็อตที่นั่น
  (ผลข้างเคียงที่เห็นวันนี้: ตอน "รวมสมาชิกซ้ำ" ฝั่งคนที่ถูกรวมจะเหลือล็อตค้างที่ไม่มียอดหนุน)
- **`point.transferred` ยังไม่มีใครยิง** — ลงทะเบียนครบ 3 ทะเบียนแล้วตามสัญญา ตัวจริงมาที่ M2.2
- **consumer ทั้ง 5 ตัวเป็น no-op** — การแจ้งลูกค้า ("แต้มจะหมดอายุใน 7 วัน") เป็นงาน M3.6
- **`computeEarn` ยังไม่ถูกเสียบเข้า POS** — วันนี้ POS ยังใช้ `earn()` v1 (อัตราเดียว ไม่มีกฎ 6 ชนิด)
  ตามแผน M2.8 ("ย้าย point/member/coupon จาก tx เป็น consumer `pos.sale.paid`")
- **backfill บน prod ยังไม่ได้รัน** — ต้อง `--dry-run` ทีละร้านก่อนตามขั้นที่ 7 ของ §0.1
- **โหมดขนานกับ M2.6**: ตอนเขียน migration `member_v2_c` เสร็จใหม่ ๆ `migrate diff` ยังไม่ empty เพราะ
  ตาราง `GiftCard*` ของ M2.6 ที่ยังไม่ migrate — ตรวจแล้วว่า **ไม่มีอะไรของ Point ค้างใน diff เลย**
  หลังจาก M2.6 apply migration ของเขา diff กลับเป็น `empty migration` ตามสัญญา (ยืนยันซ้ำแล้ว)

## 5. ตรวจภาพ (Fable)

ใบนี้ไม่มีหน้าจอ — หน้าตั้งค่าแต้ม/ledger รวม/แต้มใกล้หมดอายุ (ภาพ 16) อยู่ที่ **M2.2**
