# WO M2.3 — สแตมป์การ์ด: StampCard/Progress/Event · addStamp กฎ 5 ชนิด (PIN/QR/auto) · completeCycle → รางวัล · void/expire/merge · editor + การ์ดจริง + สถิติ (ภาพ 17) · migration `member_v2_d` — โน้ตของ builder

> สัญญา: `ledger/MEMBER-RUN.md` §2 M2.3 · พิมพ์เขียว `docs/modules/06-member-v2.md` §4.2 §4.3 §5.6 §7.1 §7.5 §9.1 §9.2 §11.9 · ข้อสอบ `scripts/qc-member-m2.3.mts`
>
> **ผลข้อสอบฉบับทางการ = 5/6 แล้ว "ระเบิด" ที่ S2.4** เพราะ **บั๊กในตัวข้อสอบเอง 4 จุด** (ดู §2) — ไม่ใช่โค้ดของ WO
> **ผลข้อสอบสำเนาที่แก้ 4 จุดนั้นแล้ว = 20/22** (แดง 2 ข้อคือ `S6.3` ภาพ + `S6.4` PARITY = งานของ Fable · `stuck=0` แล้ว)
> สำเนาที่ใช้ทดสอบถูกลบทิ้งหลังรันเสร็จ — **ไม่ได้แตะไฟล์ข้อสอบจริงแม้แต่ตัวอักษรเดียว**

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| `prisma/schema/stamp.prisma` | **ใหม่** | `StampCard` · `StampCardProgress` · `StampEvent` + enum `StampRuleKind`(5) / `StampEventType`(5) / `StampRewardKind`(4) |
| `prisma/migrations/20261020000000_member_v2_d/migration.sql` | **ใหม่** | additive ล้วน (CREATE TYPE/TABLE/INDEX เท่านั้น · ไม่แตะตารางเดิมเลย) · deploy บน QC แล้ว · `migrate diff` = **empty migration** |
| `src/lib/modules/stamp/service.ts` | **ใหม่** | ตรรกะทั้งใบ (ดู §3) |
| `src/lib/modules/stamp/index.ts` | **ใหม่** | facade 13 ตัวตามสัญญา + `getCard`/`sampleStamps` + 3 สะพาน `*Event` ให้คิว outbox |
| `src/lib/modules/stamp/db.ts` | **ใหม่** | จุดเดียวที่แตะ prisma ดิบ (ratchet F5 — แบบเดียวกับ `member/db.ts` · `giftcard/db.ts`) |
| `src/lib/modules/stamp/errors.ts` | **ใหม่** | 4 ชนิด (NotFound/Forbidden/Input/State) · ไทยทุกตัว ไม่โทษผู้ใช้ |
| `src/lib/modules/stamp/stamp-actions.ts` | **ใหม่** | server action 5 ตัว · ด่านเดียว `gate()` (เรียก `assertCan` ตรง ๆ ตาม F6) + `requireKey()` ต่อ action |
| `src/app/app/sys/[id]/member/stamps/page.tsx` | **ใหม่** | ตาราง "สแตมป์การ์ดทั้งหมด" + ปุ่มสร้าง (ภาพ 17 ครึ่งล่าง) |
| `src/app/app/sys/[id]/member/stamps/new/page.tsx` | **ใหม่** | ฟอร์มสร้างใบใหม่ (ค่าปริยาย 10 ช่อง · ประทับเอง · แต้ม 50) |
| `src/app/app/sys/[id]/member/stamps/[cardId]/page.tsx` | **ใหม่** | ตัวออกแบบการ์ด + ตัวอย่างการ์ดจริง + สถิติ + ตารางใบทั้งหมด (ภาพ 17 เต็มหน้า) |
| `src/components/member/StampCardEditor.tsx` | **ใหม่** | ฟอร์มตั้งค่าการ์ด + ตัวอย่างการ์ดจริง + สถิติ 3 ตัว · **ทะเบียนป้ายไทย** `RULE_LABEL`/`REWARD_LABEL` อยู่ที่นี่ที่เดียว |
| `src/components/member/StampCardsTable.tsx` | **ใหม่** | ตาราง 5 คอลัมน์ + สวิตช์เปิด/ปิดใบ (ใช้ `RULE_LABEL` จากไฟล์บน) |
| `src/lib/core/scope.ts` | แก้ (+4 บรรทัด) | `StampCard` = แกน system · `StampCardProgress`/`StampEvent` = แกน tenant (fail-closed F1.1) |
| `src/lib/modules/member/nav.ts` | แก้ 1 บรรทัด | หมวด `stamps` `soon` → `ready` |
| `src/lib/modules/member/profile.ts` | แก้ (+4 บรรทัด) | `mergeMembers` เรียก `stamp.mergeProgress` ใน tx เดียวกัน (dynamic import กันวงวน — แบบเดียวกับ `mergeGiftCards`) |
| `src/lib/modules/booking/service.ts` | แก้ (+2 จุด) | `setAppointmentStatus` → DONE ยิง event `booking.completed` (ดู §4 ข้อตัดสิน 1) |
| `src/lib/outbox-consumers.ts` | แก้ | `pos.sale.paid` +`stampFromSale` · `pos.sale.voided` +`stampVoidForSale` · **`booking.completed`** → `stampFromVisit` · consumer `stamp.added`/`stamp.completed`/`stamp.expired` |
| `src/lib/automation/labels.ts` | แก้ | ป้ายไทยของ `stamp.added` / `stamp.completed` / `stamp.expired` / `booking.completed` (spread ต่อเข้า `WEBHOOK_EVENTS` = ประกาศที่เดียว ไม่มีช่องติ๊กซ้ำ) |
| `src/lib/platform/cron.ts` | แก้ | step `stampExpire()` + คีย์สรุป `stampExpired` (try/catch ของตัวเอง — ห้ามพา cron ทั้งรอบล้ม) |
| `src/lib/core/outbox.ts` | แก้ 1 เงื่อนไข | `drainUntilQuiet` เลิกเมื่อ "รอบหนึ่งหยิบไม่ได้เลย" แทน "หยิบไม่เต็มรอบ" (ดู §4 ข้อตัดสิน 2) |

**ไม่ได้แตะ** `webhooks/labels.ts` โดยตั้งใจ: `WEBHOOK_EVENTS` spread `AUTOMATION_EVENTS` อยู่แล้ว
⇒ ประกาศซ้ำที่นั่น = หน้าตั้งค่าฮุคมีช่องติ๊ก 2 แถวต่อ event (บทเรียนที่เขียนไว้ในหัวไฟล์นั้นเอง) · ข้อสอบ `in3()` ก็บังคับให้มีแถวเดียว

---

## 2. 🔴 บั๊กในข้อสอบ (4 จุด · ไม่ได้แก้เอง ตามกติกา — ขอให้ Fable ตัดสิน)

### 2.1 `goldPatong` = ลูกค้าที่ **ไม่มีอยู่จริง** ในชุด seed → ข้อสอบระเบิด (บรรทัด 118 + 141)
```ts
const goldPatong = (await prisma.customer.findFirst({ where: { …, tierDefId: gold.id, homeUnitId: E.units.patong, … } }))!;
```
วัดจาก QC จริง (`groupBy homeUnitId` ของทุกระดับ):

| ระดับ | ป่าตอง (`…ebp`) | กะตะ (`…ec1`) |
|---|---|---|
| member | 30 | 0 |
| silver | 10 | 5 |
| **gold** | **0** | **10** |
| platinum | 0 | 5 |

⇒ `goldPatong` เป็น `null` เสมอ · บรรทัด 141 `goldPatong.id` โยน `TypeError` → หลุดเข้า catch → `M2.3-ERR` และ **S2.4 เป็นต้นไปไม่ถูกวัดเลย**
**ทางแก้ที่เล็กที่สุด**: ตัด `homeUnitId: E.units.patong` ออกจาก where ของ `goldPatong` (การ์ด B จำกัด "สาขาที่ประทับ" ผ่าน `unitIds` ไม่เกี่ยวกับสาขาหลักของลูกค้า ⇒ เจตนาของข้อยังครบทุกประโยค) — สำเนาที่ผมรันแก้แบบนี้แล้วผ่าน

### 2.2 การ์ด F/G2/H2 ใช้ `slots: 2` ทั้งที่ S1.2 บังคับว่า `slots 2 → throw` (บรรทัด 200–207)
- หัวข้อสอบ + §11.9 เขียน `slots(3–30)` · S1.2 ตรวจตรง ๆ ว่า `slots: 2` และ `slots: 31` ต้อง throw ไทย
- แต่ S3.3 สร้าง 3 ใบด้วย `slots: 2` แล้วคาดว่าสำเร็จ ⇒ **ข้อสอบขัดกันเอง ผ่านพร้อมกันไม่ได้**
- ผมเลือกทำตามสัญญา (3–30) เพราะเป็นทั้งหัวข้อสอบ พิมพ์เขียว และเป็น *ข้อที่ยืนยันกฎ* ของ S1.2
**ทางแก้ที่เล็กที่สุด**: S3.3 เปลี่ยน `slots: 2` → `3` และ `count: 2` → `3` ของ 3 ใบนั้น (rf/rg/rh) — สำเนาที่ผมรันแก้แบบนี้แล้วผ่าน

### 2.3 `createMember(… source: "STAFF" …)` — ไม่ใช่ค่าใน `MemberSource` (บรรทัด 236 · `mkCust`)
เหมือนบั๊กที่เจอตอน M2.6 เป๊ะ ๆ (`SOURCES` ใน `member/profile.ts` = WALK_IN/POS/BOOKING/…/OTHER · ไม่มี `STAFF`)
**ทางแก้**: `source: "WALK_IN"`

### 2.4 `mergeMembers(…)` ไม่ส่ง `confirm: "MERGE"` (บรรทัด 240)
`mergeMembers` โยน `MemberInputError` ทันทีถ้า `input.confirm !== "MERGE"` (กติกา M1.4 · ปุ่มบนจอบังคับพิมพ์ยืนยัน)
**ทางแก้**: เติม `confirm: "MERGE"` ใน object ที่ส่ง (เหมือนที่ M2.6 แก้ไปแล้ว)

> 2.3 + 2.4 อยู่บรรทัดติดกันใน S4.3 — ทั้งคู่จะทำให้ข้อสอบระเบิดกลางคันเหมือน 2.1

---

## 3. ตรรกะที่ทำ (สรุปสิ่งที่ต้องรู้เวลามาอ่านต่อ)

### 3.1 ทางเข้าเดียว = `addStamp` — ทุกทางอื่นเรียกตัวนี้
พนักงานกด · ลูกค้าใส่ PIN (LIFF) · อัตโนมัติจากบิล · อัตโนมัติจากนัด → ลงที่ `addStampInTx` ตัวเดียวกันหมด
⇒ กติกา (เพดานวัน · ระดับ/สาขา · ครบใบ → จ่ายรางวัล · event) เขียนครั้งเดียว ไม่มีทางที่ทางใดทางหนึ่งจะหลุดกติกา

**ลำดับด่าน** (สำคัญเพราะข้อความ error ต่างกัน): คีย์กันซ้ำ (คืนผลเดิม) → การ์ดมีจริง+เปิดอยู่ → ลูกค้าอยู่ระบบนี้ →
ใครประทับได้ (สิทธิ์/PIN/สาขาที่ actor ดูแล) → ใบนี้ใช้กับคนนี้ที่สาขานี้ได้ไหม (ระดับ/สาขาของใบ) → เปิด tx

- **404-not-403**: พนักงานสาขาป่าตองประทับให้ลูกค้าสาขากะตะ = "ไม่พบสมาชิกคนนี้ในสาขาที่คุณดูแล" (ไม่บอกใบ้ว่ามีคนนี้อยู่)
- **ลูกค้า (role CUSTOMER)**: ประทับได้เฉพาะบัตรตัวเอง + ใบต้องตั้ง PIN + PIN ตรง · `byUserId` = null · `refType` ปริยาย = `QR`
- **เพดานต่อวัน**: นับ `count` ของ event ชนิด ADD **ของใบนั้น** ในวันไทยเดียวกัน · `PER_DAY` บังคับ 1/วันเสมอไม่ว่าร้านตั้ง `perDayMax` เท่าไหร่
- **ไม่ประทับบางส่วน**: ขอ 3 แต่เหลือโควตา 2 → throw ทั้งก้อน (ทุกอย่างอยู่ใน tx เดียว ⇒ แถว progress ที่เพิ่งเปิดถูก rollback ไปด้วย)
  ยกเว้นทาง **อัตโนมัติจากบิล** ที่ "ตัดที่เพดาน" ตาม §5.6 (`clampToDailyCap`) เพราะไม่มีคนยืนอยู่ตรงนั้นให้แก้ตัวเลข

### 3.2 ครบใบ → `completeCycle` (อยู่ใน tx เดียวกับตราใบสุดท้ายเสมอ)
`completedAt` → `StampEvent USE (count = slots)` → จ่ายรางวัล → เปิดใบใหม่ (ถ้า `autoRestart`) → `stamp.completed`
- **POINTS = ของจริง**: `point.earnWithLot` (`refType "STAMP"` · `refId` = progressId · `idempotencyKey` = `stamp:<progressId>`)
  ระบบแต้มหาเองจาก "ระบบ POINT ที่ผูกสาขาเดียวกับระบบสมาชิก" (กติกาเดียวกับ `point.getCustomerPoints`)
- **VOUCHER / REWARD / DISCOUNT_NEXT = stub**: `rewardVoucherId` = null · กติกาถูกบันทึกไว้ใน payload ของ event
  ให้ M2.5/M2.4/M2.7 มารับช่วง — **ไม่ throw** (ลูกค้าต้องไม่โดนบล็อกเพราะฟีเจอร์ยังไม่มา)
- **ส่วนเกินไหลข้ามใบ**: ครบแล้วเหลือ 1 → ใบใหม่เริ่มที่ 1 · ถ้าส่วนเกินยังเกิน slots อีก จะปิดใบต่อเป็นลูป (เพดาน 50 รอบกันวน)
- **ไม่ `autoRestart`**: ประทับครั้งถัดไป throw ไทย "ประทับครบแล้ว…" (ไม่เปิดใบใหม่เงียบ ๆ)

### 3.3 ตราคือของมีมูลค่า ⇒ ทุกอย่างเป็นแถวใน `StampEvent`
`stamps` ในใบเป็นแค่ยอดสรุปให้หน้าจออ่านเร็ว — ความจริงอยู่ที่สมุดเหตุการณ์
⇒ `voidStampsForSale(saleId)` หาเจอทันทีว่า "ตราไหนมาจากบิลใบนี้" โดยไม่ต้องเดา · ยกเลิกซ้ำได้ (idempotent)
`void` ทำได้เฉพาะ ADD ที่ยังไม่ถูกยกเลิก **และใบยังไม่ปิด** (ปิดแล้ว = จ่ายรางวัลไปแล้ว ย้อนตราอย่างเดียวทำให้บัญชีรางวัลเพี้ยน)

### 3.4 หมดอายุ (`expireDue`) = "ตราหาย แต่ประวัติไม่หาย"
ใบที่ `expiresAt ≤ now` + ยังมีตราค้าง → `StampEvent EXPIRE (count = ตราที่ค้าง)` → `stamps = 0` + `startedAt` = วันนี้ + `expiresAt` ใหม่
ไม่ลบแถวทิ้ง (ลูกค้าต้องเห็นว่าเคยสะสมไว้เท่าไหร่แล้วหมดอายุเมื่อไหร่) · idempotent ตาม where ⇒ cron รันซ้ำวันเดียวกันไม่ทำซ้ำ

### 3.5 รวมสมาชิกซ้ำ (`mergeProgress`)
คนที่เก็บไว้มีใบเปิดอยู่ของการ์ดใบเดียวกัน → บวกตราเข้าไป (`StampEvent MERGE` · `refId` = id คนที่ถูกรวม) แล้วลบใบเดิมทิ้ง
ไม่มี → ย้ายทั้งใบ (เลื่อน `cycle` ถ้าเลขชนกับใบเดิมของคนเก็บ — `@@unique(cardId, customerId, cycle)`)
บวกแล้วครบใบ = ปิดใบ + จ่ายรางวัลตามปกติ · **หลังรวม คนที่ถูกรวมต้องไม่เหลือใบสแตมป์เลย**

### 3.6 สะพานกับคิว outbox
| event | ทำอะไร |
|---|---|
| `pos.sale.paid` | `autoStampFromSaleEvent` — ต่อท้ายการลงบัญชีเดิมผ่าน `compose` (สแตมป์พัง **ห้าม** พาการลงบัญชีล้ม) · ข้ามบิลขายบัตรกำนัล |
| `pos.sale.voided` | `voidStampsForSaleEvent` |
| `booking.completed` | `autoStampFromVisitEvent` (ยิงจาก `setAppointmentStatus`) |
| `stamp.added` / `stamp.completed` / `stamp.expired` | no-op — ของจริงเขียนครบใน tx ของ service แล้ว · มีไว้ปิด event เป็น DONE + เป็นทริกเกอร์กฎอัตโนมัติ/เว็บฮุค |

ทั้ง 4 ตัวใหม่ลง **3 ทะเบียน** ครบ (consumer · `AUTOMATION_EVENTS` · `WEBHOOK_EVENTS` ผ่าน spread)

---

## 4. ข้อตัดสินของ builder (จุดที่สัญญาไม่ชัด — ตัดสินเองพร้อมเหตุผล)

1. **แตะ `booking/service.ts` เพิ่มจากขอบเขตใบ** — ใบสั่งงานบอกว่า "booking.completed ยังไม่มี event (M3.7) → ทำแค่ `autoStampFromVisit` ให้พร้อม"
   แต่ **ข้อสอบ S5.3 บังคับ** ว่า `setAppointmentStatus(DONE)` ต้องยิง `booking.completed` แล้ว drain แล้วลูกค้าต้องได้ตรา
   ⇒ ยึด "ข้อสอบ = สัญญาฉบับเต็ม" ตามที่ prompt สั่ง · แก้แค่ 2 จุด (import + บล็อก `if (status === "DONE")`) · `idempotencyKey` ผูกกับตัวนัด ⇒ กด "มาแล้ว" ซ้ำ/สลับสถานะไปกลับ ไม่ยิงซ้ำ ตราไม่เบิ้ล
2. **แก้เงื่อนไขเลิกวนของ `drainUntilQuiet` ใน `src/lib/core/outbox.ts`** (นอกขอบเขตใบ — ขอให้ Fable ตรวจเป็นพิเศษ)
   - อาการ: S6.4 ตรวจว่า "drain แล้ว event `stamp.*` ต้อง DONE ทั้งหมด" แต่ได้ `stuck=1` เสมอ
   - ต้นเหตุ: consumer `booking.completed` **สร้าง event ใหม่** (`stamp.added`) ระหว่างรอบ drain นั้นเอง · ของเดิมเลิกวนเมื่อ "หยิบได้ไม่เต็มรอบ" (47 จาก 200) ⇒ ตัวที่เพิ่งเกิดค้าง PENDING รอ cron รายชั่วโมง ทั้งที่ตัวระบายยังยืนอยู่ตรงนั้น
   - แก้เป็น "เลิกเมื่อรอบหนึ่งหยิบไม่ได้เลย" = ความหมายที่คอมเมนต์เดิมเขียนไว้เองว่า "วนจนเงียบ" · ยังจบแน่นอน (event ที่ไม่มี consumer/ล้มเหลว ถูกเลื่อน `availableAt` ไปอนาคตแล้ว) และยังมี `MAX_ROUNDS` 10 + งบเวลา 20 วิ คุมอยู่
   - ราคา: drain ที่คิวว่างอยู่แล้วเสีย query เปล่าเพิ่ม 1 ครั้ง · regression ที่รันแล้วเขียวครบ (ดู §5)
3. **`stats.rewardsPaid` = จำนวนใบที่ปิด** (ไม่ใช่จำนวน voucher/แต้มที่ออก) — รางวัลออก 1 ครั้งต่อการปิดใบ 1 ใบใน tx เดียวกันเสมอ ⇒ 2 ตัวเลขนี้เท่ากันตามนิยาม และตัวนี้นับได้จาก query เดียวกับ `completed`
4. **consumer `stamp.*` เป็น no-op ไม่เขียน `MemberActivity`** — สัญญาเขียนว่า "no-op/บันทึก MemberActivity" (เลือกได้)
   เลือก no-op เพราะไทม์ไลน์สมาชิกมีข้อสอบชุดอื่นนับจำนวนแถวอยู่ · การยัดแถวใหม่ทุกครั้งที่ประทับตราเสี่ยงทำ regression เงียบ ๆ โดยไม่มีข้อไหนของ M2.3 ต้องการมัน → ยกไปทำพร้อมงานแจ้งเตือน (M3.6)
5. **หน้า editor มีตาราง "สแตมป์การ์ดทั้งหมด" อยู่ด้านล่างด้วย** — ตามภาพ 17 ที่โชว์ทั้งฟอร์ม+ตัวอย่าง+ตารางในจอเดียว (หน้า `/stamps` มีตารางเหมือนกันสำหรับคนที่มาดูรายการอย่างเดียว)
6. **`sampleStamps` = ใบจริงที่คืบหน้ามากที่สุดของการ์ดใบนั้น** — ภาพ 17 โชว์ 7/10 ซึ่งต้องเป็นของจริง ไม่ใช่ตัวเลขสมมติที่วาดไว้เฉย ๆ
7. **สิทธิ์หน้า editor = `member.loyalty.manage`** (404-not-403) · หน้า list = read-โดยนัย (พนักงานที่ได้แค่สิทธิ์ประทับต้องเปิดดูได้ว่าร้านมีใบอะไรบ้าง)
8. **`ruleConfig` ถูก normalize ตอนบันทึกเสมอ** (perDayMax ≥ 1 ปริยาย 1 · allowStaffScan/allowAutoFromSale ปริยาย true) ⇒ ใบเก่าที่กรอกไม่ครบอ่านแล้วได้ค่าเดียวกับใบใหม่ ไม่มี `undefined` หลุดไปถึงกติกา
9. **`stamp→voucher` (fitness F2) ยังไม่ถูกใช้** — โมดูล voucher เกิดที่ M2.5 · วันนี้รางวัล VOUCHER เป็น stub จึงไม่มี import จริง (เส้นใน allowlist รอไว้เฉย ๆ ตามที่ Fable วางไว้)

---

## 5. ผลรัน (ของ builder)

| ชุด | ผล |
|---|---|
| `qc-member-m2.3` (ฉบับทางการ) | **5/6 + ERR** — ระเบิดที่ S2.4 เพราะบั๊กข้อสอบ §2.1 |
| `qc-member-m2.3` (สำเนาที่แก้ §2.1–2.4) | **20/22** — แดงเฉพาะ `S6.3` (ภาพ) และ `S6.4` (PARITY ของ Fable · `stuck=0` · `reg=true/true`) |
| `pnpm exec tsc --noEmit` | ✅ ผ่าน (0 error) |
| `fitness.mts` (มี env) | ✅ 26/26 |
| `fitness.mts` (ไม่มี env) | ✅ 26/26 |
| `qc-member-m2.1` | ✅ 30/30 |
| `qc-member-m1.4` | ✅ 37/37 |
| `qc-member-m1.5` | ✅ 20/20 |
| `qc-member-m2.6` | ✅ 24/24 |
| `qc-acc-v2-pos-lines` | ✅ 87/87 |
| `qc-nav-functions` | 🟡 10/11 — S5 แดง **อยู่ก่อนใบนี้แล้ว** (ขาด `/member/members/new`, `/member/members/import`, `/member/promotions/giftcards`, `/member/points/adjust`, …) · ใบนี้เพิ่ม `/member/stamps/new` เข้าไปในรายการเดียวกัน ⇒ หนี้ร่วมของ M1.6/M2.2/M2.6/M2.3 (ดู §6) |

- `migrate diff --from-config-datasource … --to-schema prisma/schema --script` → **"This is an empty migration."**
- คืนสภาพ QC แล้ว: ลบ `OutboxEvent` ชนิด `stamp.*` / `booking.completed` ที่ค้างจากรอบทดสอบ · `StampCard/Progress/Event` เหลือ 0 แถว · `PointLedger refType STAMP` เหลือ 0
- ชุดที่ **ไม่ได้รัน**: `qc-booking-*`, `qc-hr-leave-booking` — ทุกตัว `loadEnvFile(".env")` (prod) ซึ่งกติกาห้ามรัน · ขอให้ Fable รันด้วย env ที่ถูกต้องตอนตรวจรับ (ใบนี้แตะ `booking/service.ts`)

---

## 6. หนี้ที่ทิ้งไว้

1. **`qc-nav-functions` S5** — accordion ของเมนู ☰ ยังไม่กาง sub-route ที่ไม่ใช่หน้าแรกของหมวด (`/stamps/new` ของใบนี้ + ของ M1.6/M2.2/M2.6) · เป็นการแก้ที่ `src/app/app/layout.tsx` จุดเดียว ควรทำเป็นใบเก็บกวาดรวม ไม่ใช่แก้ทีละ WO
2. **รางวัล VOUCHER/REWARD/DISCOUNT_NEXT ยัง stub** — payload ของ `stamp.completed` มีข้อมูลครบแล้ว รอ M2.4/M2.5/M2.7 มาต่อ (`rewardVoucherId` ในตารางเตรียมไว้แล้ว)
3. **ยังไม่มี UI "ประทับตรา"** — `addStampAction` (สิทธิ์ `member.loyalty.stamp`) พร้อมใช้แล้ว แต่ปุ่ม/จอสแกน QR อยู่ที่หน้าขาย (M2.8) และ LIFF (M2.9) ตามแผน
4. **`ruleConfig.itemIds` ยังไม่มีตัวเลือกในหน้าจอ** — service รองรับเต็ม (auto จากบิลจับ `itemId` ได้) แต่ฟอร์มให้เลือกได้เฉพาะ "บริการ" ตามภาพ 17 · เพิ่มชิปสินค้าได้ทีหลังโดยไม่แตะ service
5. **`staffPin` เก็บเป็นข้อความธรรมดาใน `ruleConfig`** (ไม่ใช่ hash แบบบัตรกำนัล) — เป็น PIN ของ *ใบ* ที่พนักงานบอกลูกค้าหน้าร้าน ไม่ใช่ความลับต่อคน · ถ้าจะยกระดับ ควรทำพร้อม M2.9 (จอลูกค้าจริง)

---

## 7. ตรวจภาพ (เว้นไว้ให้ Fable)

- ภาพที่ต้องเทียบ: `ledger/design-member/17-stamp-card-editor.png`
- สเปคภาพ: `stamps-owner` (desktop+mobile) · `stamps-editor-owner` · `stamps-new-owner` · `stamps-thana` (อ่านอย่างเดียว ไม่มีปุ่มสร้าง) · `stamps-noperm` (404)
- `PARITY:` (ยังไม่ตรวจ — Fable เติมผลตรงนี้)

### ตรวจภาพ (Fable · 10 ก.ย. 20:40 UTC · QC server build จริง)
- `stamps-editor-owner-desktop` เทียบภาพ 17: ฟอร์มซ้าย (ชื่อ · คำอธิบาย · จำนวนช่อง "ตั้งได้ 3–30 ช่อง" · ได้ตราเมื่อ + "และ บริการ =" ชิป · สูงสุด ตรา/วัน · ใครประทับได้ 3 ช่อง + PIN · รางวัลเมื่อครบ voucher + ข้อความ · เริ่มใบใหม่ · อายุใบ 12 เดือน · จำกัดระดับ ชิป · สาขา ชิป) · ขวา: ตัวอย่างการ์ดจริง 7/10 วงกลมดำติ๊ก + "ใบถัดไปเริ่มอัตโนมัติเมื่อครบ" · สถิติ 3 ช่อง (ใบที่ใช้อยู่/ครบแล้ว/รางวัลที่จ่าย) · ตารางสแตมป์การ์ดทั้งหมดด้านล่าง (ชื่อ+คำอธิบาย/ช่อง/ใบที่ใช้อยู่/ครบแล้ว/สวิตช์) — ตรงภาพ
- `stamps-owner` desktop/mobile: ตาราง + ปุ่ม "สร้างสแตมป์การ์ด" ✓ ไม่ล้น · `stamps-new-owner`: ฟอร์มค่าปริยาย ✓ · `stamps-thana`: ตารางอ่านอย่างเดียว ✓ · noperm 404 ✓
- ต่างจากภาพเล็กน้อย (ยอมรับ): ปุ่ม ยกเลิก/บันทึก อยู่ท้ายฟอร์ม (ภาพอยู่มุมขวาบน) · ชิปบริการชื่อซ้ำ "ทริปดำน้ำครึ่งวัน" 2 ใบ (บริการคนละสาขาชื่อเดียวกัน — ควรต่อท้ายชื่อสาขา · หนี้เล็ก M3.F)
- **PARITY: ผ่าน**
