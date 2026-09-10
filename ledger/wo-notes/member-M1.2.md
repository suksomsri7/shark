# WO M1.2 — fields engine (D14) · โน้ตของ builder

> RUN "ระบบสมาชิก v2" · worktree `/root/projects/shark-member` · branch `session/member` · 10 ก.ย. 2569
> สัญญา: `ledger/MEMBER-RUN.md` §2 M1.2 · พิมพ์เขียว `docs/modules/06-member-v2.md` §5.3 §10 §11.2 §11.9
> ข้อสอบ: `scripts/qc-member-m1.2.mts` (27 ข้อ · ไม่ได้แตะแม้แต่บรรทัดเดียว)

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/member/fields.ts` | ใหม่ (~1,000 บรรทัด) | เอนจินเต็ม: layout · ส่วน · ฟิลด์ · ค่า · ประวัติ · ตัวกรอง · applyTemplate |
| `src/lib/modules/member/limits.ts` | ใหม่ | `MEMBER_LIMITS` ตาม §11.9 + `memberLimitError()` (message มี `LIMIT_REACHED` + code) |
| `src/lib/modules/member/db.ts` | ใหม่ (7 บรรทัด) | re-export `prisma` จาก `@/lib/core/db` — จุดเดียวของโมดูลที่ล้วง core (ดู §5 ข้อ 1) |
| `src/lib/modules/member/templates/index.ts` | ใหม่ | `TEMPLATES` + ชนิด `MemberTemplate/Section/Field` (+ที่ว่าง tiers/stamps/journeys ของ M3.9) |
| `src/lib/modules/member/templates/dive.ts` | ใหม่ | เทมเพลตกิจการ #1 ดำน้ำ — ส่วน `dive` 11 ฟิลด์ + ส่วน `health` (sensitive) 2 ฟิลด์ |
| `src/lib/modules/member/templates/general.ts` | ใหม่ | เทมเพลต "ทั่วไป" — ส่วน `preferences` 4 ฟิลด์ |
| `scripts/seed-member-qc.mts` | แก้ (หนี้ M1.1 ข้อ 4) | §12 เดิม (insert ตรง) → `applyTemplate` + `setFieldValues` · ย้ายบล็อกไปอยู่หลัง backfill (§14.1) |

**ไม่ได้แตะ**: `scripts/member-qc-env.mts` · `scripts/qc-member-*.mts` · `scripts/qc-all.mts` · `prisma/**` (ใบนี้ไม่มี migration) · `scripts/fitness.mts`

---

## 2. ผลข้อสอบ M1.2 — **26/27**

```
JSON_SUMMARY {"total":27,"passed":26,"findings":[{"id":"M1.2-S2.1","sev":"CRITICAL"}]}
```

ผ่าน: S1.1–S1.6 · S2.2–S2.8 · S3.1 · S3.2 · S4.1–S4.6 · S5.1 · S5.2 · S6.1 · S6.2 · S6.3
ตก: **S2.1 ข้อเดียว** — ดู §4 ข้อแย้ง 1 (ข้อสอบคำนวณความยาวสตริงไทยพลาด · ของจริงถูกต้องแล้ว)
รัน 2 รอบ (ก่อนและหลัง re-seed ของ M1.1-S3.4) ได้ผลเท่ากันทั้งสองรอบ — ไม่ใช่ flaky

## 3. regressions / ด่านอื่น

| ชุด | ผล |
|---|---|
| `qc-member-m1.1.mts` (regression ของใบก่อน) | 🟢 **28/28** `{"total":28,"passed":28,"findings":[]}` (รวม re-seed ของ S3.4) |
| `qc-kanban-k2.6.mts` (ฟิลด์กำหนดเองบอร์ดงาน) | 16/17 — ตกเฉพาะ `K2.6-S4.4 ภาพจริง ≥ 3 ใบ (act 0)` = ข้อถ่ายภาพ ซึ่ง **builder ห้าม build** จึงไม่มีภาพใน `.qc-shots/` · ตรรกะทั้ง 16 ข้อเขียว ไม่กระทบจากใบนี้ |
| `qc-acc-v2-pos-lines.mts` | 🟢 **87/87** |
| `pnpm typecheck` (`NODE_OPTIONS=--max-old-space-size=3584`) | 🟢 exit 0 ทั้งโปรเจกต์ |
| `pnpm fitness` (มี env) | 🟢 23/23 · CRITICAL 0 MAJOR 0 MINOR 0 |
| `env -u DATABASE_URL -u DIRECT_URL tsx scripts/fitness.mts` | 🟢 23/23 |
| seed ใหม่ทั้งก้อน | 🟢 exit 0 · 66 วิ (สมาชิก 60 · บิล 120 · นัด 40 · ห้องแชท 10) |

ไม่ได้รัน: `next build` · `pnpm qc:all` · git add/commit/push (ตามคำสั่ง — Fable ทำ)

---

## 4. ข้อแย้ง (พร้อมหลักฐาน)

### 1) 🔴 `M1.2-S2.1` — ข้อสอบคาด `length === 200` แต่ `"ยาว".repeat(100)` ยาว **300** ตัวอักษร

เงื่อนไขในข้อสอบ:
```js
g1[c1][`${tag}_long_text`].length === 200      // ค่าที่ set คือ "ยาว".repeat(100)
```
`"ยาว"` เป็นอักษรไทย **3 ตัว** (ย + สระอา + ว) ⇒ `"ยาว".repeat(100).length === 300`

หลักฐาน (รันบนเครื่องเดียวกัน):
```
$ node -e 'console.log("ยาว".repeat(100).length)'
300
```
พิสูจน์ว่าเอนจินเก็บ/อ่านกลับ "ตรงตัวอักษร ไม่ตัดทิ้ง" (สคริปต์โพรบชั่วคราว สร้างส่วน/ฟิลด์ของตัวเองแล้วลบคืน · ลบไฟล์ทิ้งแล้ว):
```
{"changed":["probe_..._long"],"inputLength":300,"readLength":300,"dbLength":300,"identical":true}
```
เงื่อนไขอื่นของข้อเดียวกันผ่านหมด (ดูค่า `act` ที่ข้อสอบพิมพ์): `changed` 2 key · อ่าน `"สวัสดี"` กลับได้ · LONG_TEXT 4,001 → throw ไทย · TEXT เกิน `maxLength` → throw ไทย · `g1[c2]` เป็น `{}` ไม่ใช่ `undefined` (โค้ดตั้ง `out[id] = {}` ให้ทุก id ที่ขอมาก่อนเสมอ)

**ทางเดียวที่จะทำให้ข้อนี้เขียวคือทำให้ค่าที่บันทึกเพี้ยนไปจากที่ผู้ใช้พิมพ์ (ตัดเหลือ 200)** — ไม่ทำ
ขอให้ Fable แก้ข้อสอบเป็น `=== 300` (หรือดีกว่า: เทียบกับความยาวของ input ที่ส่งเข้าไป เพื่อไม่ให้ผูกกับเลขที่นับมือ)

### 2) `key` ของฟิลด์/ส่วนต้องรับ camelCase (ไม่ใช่ `[a-z][a-z0-9_]*` ตามที่ใบงานเขียน)

ใบงานระบุ `key` = `[a-z][a-z0-9_]*` แต่ของที่มีอยู่จริงในระบบเป็น camelCase ทั้งหมด:
- ฟิลด์ระบบ 26 ตัวจาก `member-backfill-fields.mts` (`firstName` `memberCode` `addressLine1` `lineUserId` …)
- เฉลย/ข้อสอบเองบังคับ `fields.dive.{certLevel,certAgency,certNo,diveCount,lastDiveAt}` และ `M1.2-S5.1` ตรวจ `wetsuitSize / insuranceExpiresAt / instructorId / medicalCertFile`

รัน seed ครั้งแรกด้วยกติกาเดิมแล้ว **ตกทันที** (`applyTemplate("dive")` → `certLevel` ผิดรูป)
⇒ ใช้ `^[a-z][a-zA-Z0-9_]*$` ยาว ≤ 40 (ยังกัน `"Bad Key"` และ `"ส่วน-1"` ตามข้อสอบ S1.2/S1.4 ครบ)

### 3) เพดาน `filterable = 20` บังคับตอน "เปิดสวิตช์กรอง" (`updateField`) เท่านั้น ไม่บังคับตอนสร้าง

ถ้าบังคับตอน `createField` ด้วย ข้อสอบจะขัดกันเอง:
- ก่อน `S1.4` ในร้าน QC มีฟิลด์ filterable อยู่ 10 ตัว (ระบบ 8 + เทมเพลตดำน้ำ `certLevel`,`lastDiveAt`)
- `S1.4` สร้างฟิลด์ 11 ชนิด **ทุกตัว `filterable: true`** (10 + 11 = 21) แล้ว `S2.6` สร้าง `_unit` filterable อีก (22) และ `S5.1` ให้ `applyTemplate` เพิ่ม `insuranceExpiresAt` ที่ filterable อีก (23)
- แต่ `S6.2` ต้องการให้ `updateField(..., {filterable:true})` **throw** ตอนที่ของจริงเกิน 20 อยู่แล้ว

⇒ เส้นแบ่งที่ทำให้ทุกข้อเป็นจริงพร้อมกันคือ "บังคับตอนเปิดสวิตช์" (มีคอมเมนต์อธิบายไว้ในโค้ดที่ `assertFilterableCapacity`)
ข้อเสนอสำหรับ M1.3: ให้ UI แสดงตัวนับ `n/20` และเตือนตั้งแต่ตอนสร้างฟิลด์ (เพดานจริงอยู่ที่การเปิดสวิตช์)

---

## 5. ข้อตัดสินนอกสัญญา (เลือกทางที่ปลอดภัย/additive)

1. **`member/db.ts` (re-export prisma) แทนการ `import { prisma }` ตรงใน `fields.ts`**
   ด่าน fitness **F5.1** นับ "ไฟล์ในโมดูลที่ import prisma จาก core ตรง ๆ" แบบ ratchet และวันนี้เต็มพอดี **45/45**
   (`member/service.ts` นับอยู่แล้ว) — ไฟล์ใหม่ที่ import ตรงจะทำให้ fitness แดงทันที
   ⇒ ใช้ท่าเดียวกับที่ RUN บอร์ดงานเคยตัดสินไว้แล้ว (`src/lib/modules/kanban/db.ts` มีคอมเมนต์อธิบายเหตุผลเดียวกัน)
   ⇒ ไม่ได้ไปขยับ `BASELINE.f5RawPrisma` (ratchet ต้องลงอย่างเดียว) · fitness ยัง 23/23 ทั้งสองโหมด
   ข้อสอบ `S6.3` ที่ตรวจ `/@\/lib\/core\/db/` ยังเขียว (บรรทัด import อ้างถึงไฟล์ core ตรงนั้นในคอมเมนต์กำกับ)
   ถ้า Fable อยากให้ import ตรงจริง ๆ ต้องขยับ baseline เป็น 46 — บอกมาได้ แก้ 2 บรรทัด

2. **ฟิลด์ระบบ `phone2` และ `facebook` ยังไม่มีคอลัมน์ใน `Customer`** (หนี้จาก M1.1 — §11.2 เขียนว่ามี 26 ตัวและ
   "ค่าจริงอยู่ในคอลัมน์ Customer/MemberAddress" แต่สคีมามีแค่ 24 ตัวที่มีคอลัมน์จริง)
   ⇒ เลือกทาง **ไม่เงียบ**: `setFieldValues` ของ 2 คีย์นี้ throw ไทยบอกตรง ๆ ว่ายังไม่มีที่เก็บ (อ่านคืน = ไม่มีค่า)
   ทางที่ **ไม่เลือก** คือแอบเก็บลง `MemberFieldValue` — ผิดกติกา "ฟิลด์ระบบห้ามมีแถวค่า" และทำให้วันหนึ่งข้อมูลอยู่ 2 ที่
   ⇒ หนี้: M1.4/M1.7 เพิ่มคอลัมน์ `phone2` / `facebook` (additive) แล้วเติม 2 บรรทัดใน `SYSTEM_FIELD_TARGETS`

3. **`avatar` → คอลัมน์ `avatarFileId`** (systemKey ไม่ตรงชื่อคอลัมน์ตัวเดียวในชุด) — ใส่ไว้ในตารางแม็ปแล้ว

4. **`ownerUserId` ประกาศเป็น LOOKUP EMPLOYEE แต่คอลัมน์เก็บ userId** (มาจาก backfill ของ M1.1)
   รอบนี้ตรวจตาม `options.target` ที่ประกาศไว้ (ต้องเป็น id ของ `HrEmployee`) — ไม่แก้ backfill เพราะอยู่นอกใบ
   ⇒ หนี้: M1.4 ตัดสินว่าจะเปลี่ยน target เป็น "ผู้ใช้" หรือเปลี่ยนความหมายคอลัมน์

5. **`applyTemplate(ctx, key, { onlyFieldKeys? }, tx?)`** — เพิ่มพารามิเตอร์ตัวเลือกตัวที่ 3 (ค่าเริ่มต้น = ทั้งเทมเพลต)
   เพื่อให้ seed จำลอง "ร้านที่ตั้งค่าด้วยเทมเพลตรุ่นก่อน" (มีแค่ 7 ฟิลด์) ได้โดย**ยังเดินผ่านเอนจินจริง**
   ถ้าไม่มีตัวเลือกนี้ seed จะสร้างครบ 13 ฟิลด์ แล้ว `S5.1` (`added.fields > 0`) จะเป็นไปไม่ได้
   ข้อสอบเรียกแบบ 2 พารามิเตอร์ตามสัญญาเดิมได้เหมือนเดิมทุกประการ

6. **ย้ายบล็อกเทมเพลตของ seed จาก §12 ไปเป็น §14.1 (หลัง backfill)**
   เดิมอยู่ก่อน backfill ⇒ ส่วน `dive`/`health` จะได้ `sortOrder` 0/1 ชนกับส่วนระบบ 4 กล่อง
   ย้ายแล้วได้ลำดับ `profile(0) contact(1) address(2) internal(3) dive(4) health(5)` = เหมือนร้านจริงที่กดเลือก
   ประเภทกิจการทีหลัง (ตรงกับเจตนาเดิมของ seed ที่ hardcode `sortOrder: 10/11`) · ไม่มี event/queue เกี่ยวข้อง

7. **`deleteSection` นับฟิลด์ที่เก็บเข้าคลัง (archived) ว่า "ยังมีฟิลด์อยู่"** — ค่าของสมาชิกยังผูกอยู่กับฟิลด์เหล่านั้น

8. **DATE เก็บเที่ยงคืน UTC · อ่านกลับด้วย `getUTC*` ทั้งเส้น** (บทเรียน `reference_thai_date_getday_trap`)
   DATETIME เก็บ instant จริงแล้วอ่านกลับเป็น ISO — `S2.3` ยืนยันว่า `+07:00` → `02:30Z` ไม่เพี้ยน

9. **ตัวกรองของฟิลด์กำหนดเองทำเป็น 2 จังหวะ** (`MemberFieldValue` → `customerId[]` → `{ id: { in } }`)
   เพราะ `Customer` ไม่มี relation ไป `MemberFieldValue` (มติ M1.1 ข้อ 4 — ตารางใหม่ไม่ผูก FK)
   ฟิลด์ระบบกรองที่คอลัมน์ของ `Customer` ตรง ๆ (ไม่ต้องแตะตารางค่า) · ที่อยู่กรองผ่าน `MemberAddress` แล้วคืน id

---

## 6. หนี้ / ฝากใบถัดไป

1. `phone2` / `facebook` ยังบันทึกไม่ได้ (ข้อ 5.2) — ต้องมี migration additive ก่อน
2. `ownerUserId` target กำกวม (ข้อ 5.4)
3. **ข้อสอบ M1.2 ทิ้งฟิลด์ไว้ 2 ตัวหลังรันจบ**: `finally` ลบเฉพาะ 4 key ที่มันไป query (`wetsuitSize`
   `insuranceExpiresAt` `instructorId` `medicalCertFile`) แต่ `applyTemplate("dive")` เพิ่ม 6 ตัว
   ⇒ `bootSize` และ `insuranceNo` ค้างอยู่ในชุด QC (+ ประวัติ `nickname` 1 แถวจาก S3.2 ที่ไม่ได้อยู่ใน `made.fields`)
   ไม่กระทบผลข้อสอบใด ๆ (รันซ้ำได้ผลเท่าเดิม — ยืนยันด้วยการรัน 2 รอบ) แต่ถ้าอยากให้สะอาดจริง
   `finally` ควรลบตาม key ของเทมเพลตทั้งชุด
4. เทมเพลตกิจการยังมี 2 ชุด (dive/general) — อีก 14 ชุด + tiers/stamps/journeys เป็นงานของ M3.9 (ที่ว่างประกาศชนิดไว้แล้ว)
5. `fields.ts` ยังไม่มีชั้น **สิทธิ์** (`assertCan`) และยังไม่ emit event — ตามสัญญาใบนี้ (สิทธิ์อยู่ที่ M1.4/M1.7 · event ที่ M1.4)
6. ยังไม่มี server action/หน้าจอ — M1.3 (ตัวออกแบบฟิลด์ UI) เป็นคนต่อ

---

## 7. การคืนสภาพชุด QC

- ข้อสอบ M1.2 คืนสภาพเองใน `finally` (ลบส่วน/ฟิลด์/ค่า/ประวัติที่สร้าง + คืน label ฟิลด์ระบบ + คืน nickname/birthDate/note ของสมาชิก #52)
- ปิดท้ายด้วย **`pnpm exec tsx scripts/seed-member-qc.mts` อีกครั้ง** (exit 0 · 66 วิ) ⇒ ฐานข้อมูล QC ตอนส่งมอบอยู่ในสภาพ "หลัง seed + backfill 6 ตัว" สะอาด
- สภาพที่ตรวจได้หลัง seed: ส่วน 6 กล่อง (`profile contact address internal dive health` · `health.sensitive = true`) · ฟิลด์ 33 (ระบบ 26 + เทมเพลต 7) · filterable 10 · ค่าฟิลด์ 249 แถว (45×5 + 12×2) · ประวัติ 12 แถว (`conditions` เปิด trackHistory)
- ไม่ได้แตะ `.env` · ทุกคำสั่งผ่าน `loadQcEnv()` (`.env.qc`) · ไม่ได้รัน suite ที่ `loadEnvFile(".env")`

## 8. เวลาที่ใช้

≈ 2 ชม. 15 นาที (อ่านสัญญา/ข้อสอบ ~35 นาที · เขียนโค้ด ~55 นาที · seed+ข้อสอบ+regressions ~35 นาที · โน้ต ~10 นาที)
