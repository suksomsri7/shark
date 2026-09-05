# F2 — ทดสอบ SHARK Account API แบบ external agent (คู่มืออย่างเดียว ห้ามอ่านซอร์ส)

วันที่: 2026-09-05
ผู้ทดสอบ: external integration agent (ใช้เฉพาะ skill `shark-account-api` + curl)
Base URL: `https://shark.in.th/api/v1/account`
API key: `shark_****` (มาสก์ไว้ ไม่พิมพ์ค่าจริง) จากไฟล์ `/root/.f4key-write.json`
Header เสริม: `X-Shark-System: cmrmr1en300034ikz3rwtpfk9`
จำนวนคำสั่ง curl ที่ยิงไปยัง API บัญชีจริง: 9 ครั้ง (ไม่รวมการเปิด `openapi.json` ที่ไม่ต้องใช้คีย์ ซึ่งเปิดดูเพื่อเสริมรายละเอียดฟิลด์ที่ `references/*.md` ในสกิลไม่ได้แจกแจงละเอียดพอ)

สรุปผล: ทำครบ 5 งาน ไม่มี void/reopen/merge/delete ใด ๆ ถูกเรียก ไม่มีการ issue เอกสาร draft ที่สร้างในงาน 4 ทุกครั้งที่เขียนข้อมูลใช้ `Idempotency-Key` เป็น UUID ใหม่

---

## งาน 1 — Dashboard วันนี้

**Endpoint:** `GET /dashboard` (ไม่ส่ง `asOf` เพื่อใช้ค่า default = วันนี้ตามเวลาไทย)

```
curl -sS "https://shark.in.th/api/v1/account/dashboard" \
  -H "Authorization: Bearer $SHARK_KEY" \
  -H "X-Shark-System: cmrmr1en300034ikz3rwtpfk9"
```

**Response:** `200 OK`, `data.asOf = "2026-09-05"`

| ตัวชี้วัด | จำนวน (สตางค์) | แปลงเป็นบาท |
| --- | --- | --- |
| ลูกหนี้ (receivable) | 107,000 (1 ใบ) | 1,070.00 บาท |
| เจ้าหนี้ (payable) | 0 (0 ใบ) | 0.00 บาท |
| ค้างชำระเกินกำหนด — ลูกหนี้ | 0 (0 ใบ) | 0.00 บาท |
| ค้างชำระเกินกำหนด — เจ้าหนี้ | 0 (0 ใบ) | 0.00 บาท |
| เงินสดรวม (cashTotalSatang) | 0 | 0.00 บาท |

ไม่มี retry, ไม่มี error.

---

## งาน 2 — เอกสารที่รอชำระ/เกินกำหนด

**Endpoint ที่ลองก่อน (พลาด):**

```
GET /documents?status=AWAITING_PAYMENT,OVERDUE&pageSize=100
```
→ `422 unprocessable` (ไม่มี `hint` บอกว่าฟิลด์ไหนผิด) — อ่านคำอธิบายพารามิเตอร์ `status` ใน `endpoints.md`/openapi อีกครั้ง: "one status, several separated by commas, **or** `OVERDUE` / `ALL`" ตีความว่า `OVERDUE` เป็นค่าพิเศษที่ต้องส่ง **เดี่ยว ๆ** ห้ามผสมกับสถานะจริงด้วย comma จึงแก้โดยยิงแยก 2 คำขอ (retry 1 ครั้ง ตามกติกา ≤2 ครั้ง/งาน)

**Endpoint ที่ใช้จริง:**

```
GET /documents?status=AWAITING_PAYMENT&pageSize=100
GET /documents?status=OVERDUE&pageSize=100
```

**ผลลัพธ์:**

| เลขที่เอกสาร | คู่ค้า | ยอดรวม (บาท) | วันครบกำหนด | สถานะ |
| --- | --- | --- | --- | --- |
| IV-2026-07-0001 | ลูกค้า C1 | 1,070.00 | ไม่ได้ตั้งวันครบกำหนด (dueDate = null) | AWAITING_PAYMENT |

รายการ `OVERDUE` ว่างเปล่า (0 รายการ) — สอดคล้องกับ dashboard งาน 1 ที่ overdue = 0 พอดี

---

## งาน 3 — สร้างผู้ติดต่อลูกค้าใหม่ + ทดสอบซ้ำ

**Endpoint:** `POST /contacts`

**Request body (ครั้งที่ 1):**
```json
{
  "kind": "CUSTOMER",
  "legalType": "COMPANY",
  "name": "บริษัท ทดสอบสกิล เอไอ จำกัด",
  "taxId": "0105561000099",
  "branchCode": "00000",
  "phone": "081-000-0099",
  "creditTermDays": 30
}
```
Header: `Idempotency-Key: <uuid ใหม่>`

**Response:** `200 OK`
```json
{
  "id": "cmtomhlyu000204l1npo8vs7e",
  "code": "C00002",
  "name": "บริษัท ทดสอบสกิล เอไอ จำกัด",
  "taxId": "0105561000099",
  "phone": "0810000099",
  "creditTermDays": 30
}
```
→ รหัสผู้ติดต่อ `C00002`, id `cmtomhlyu000204l1npo8vs7e`, เบอร์โทรถูก normalize เป็น `0810000099` อัตโนมัติตามที่คู่มือบอก

**ครั้งที่ 2 (เลขผู้เสียภาษีเดิม, Idempotency-Key ใหม่ — เจตนาให้ชนกัน ไม่ใช่ retry):**

Response: `409 Conflict`
```json
{
  "error": {
    "code": "duplicate",
    "message_th": "เลขประจำตัวผู้เสียภาษี+สาขานี้มีผู้ติดต่ออยู่แล้ว: C00002",
    "message_en": "A contact with this tax id and branch code already exists.",
    "hint": "cmtomhlyu000204l1npo8vs7e"
  }
}
```
ตรงตามที่คู่มือ (`references/endpoints.md` bucket 409 ของ conflict) ระบุไว้ว่า tax id + branch คู่เดิมชนกันจะได้ `duplicate` พร้อม `hint` เป็น id ของผู้ติดต่อเดิม — ไม่ต้อง retry เพราะนี่คือพฤติกรรมที่ถูกต้องแล้ว

---

## งาน 4 — ใบเสนอราคาฉบับร่าง (DRAFT เท่านั้น ไม่ issue)

**Endpoint:** `POST /documents`

**Request body:**
```json
{
  "type": "QUOTATION",
  "contactId": "cmtomhlyu000204l1npo8vs7e",
  "issueDate": "2026-09-05",
  "lines": [
    {"description": "คอร์ส Open Water 2 ท่าน", "qty": 2, "unitPriceSatang": 1250000},
    {"description": "เช่าอุปกรณ์ครบชุด 3 วัน", "qty": 3, "unitPriceSatang": 80000}
  ]
}
```
ไม่ส่ง `vatMode` / line-level `vatRateBp` โดยตั้งใจ — ก่อนยิงคำขอนี้ได้เช็ค `GET /settings` ก่อน 1 ครั้ง พบว่าร้านนี้จด VAT (`vatRegistered: true`) และอัตราภาษีของสมุดบัญชีตั้งไว้ที่ `vatRateBp: 700` (7%) จึงปล่อยให้ endpoint ใช้ค่า default ของสมุดบัญชีตามที่โจทย์ขอ

**Response:** `200 OK`
```json
{
  "id": "cmtomihrb000204lg5tqxeju3",
  "type": "QUOTATION",
  "docNo": null,
  "status": "DRAFT",
  "subTotalSatang": 2740000,
  "vatSatang": 191800,
  "grandTotalSatang": 2931800
}
```

| รายการ | บาท |
| --- | --- |
| ยอดก่อนภาษี (subTotal) | 27,400.00 |
| VAT 7% | 1,918.00 |
| **ยอดรวมสุทธิ (grandTotal)** | **29,318.00** |

สถานะ `DRAFT`, `docNo` เป็น `null` (ยังไม่ได้เลขที่เอกสารจริงเพราะไม่ได้ issue) — ไม่มีการเรียก `/issue`, `/respond`, `/convert`, `payments`, หรือ `/void` ใด ๆ ตามที่โจทย์สั่งห้าม

---

## งาน 5 — งบทดลอง (Trial Balance) ม.ค.–ก.ย. 2026 เป็น CSV

**Endpoint:**
```
GET /reports/trial-balance?from=2026-01&to=2026-09
Accept: text/csv
```
Response header ยืนยัน `content-type: text/csv; charset=utf-8` และเป็นไฟล์ UTF-8 with BOM ตามที่คู่มือบอก

**ผลลัพธ์ (ถอดจาก CSV):**

| code | name | type | closingDebit | closingCredit |
| --- | --- | --- | --- | --- |
| 1010 | เงินฝากธนาคาร | ASSET | 0 | 0 |
| 1100 | ลูกหนี้การค้า | ASSET | 107,000 | 0 |
| 2200 | ภาษีขาย | LIABILITY | 0 | 0 |
| 2210 | ภาษีขายยังไม่ถึงกำหนด (บริการรอรับเงิน) | LIABILITY | 0 | 7,000 |
| 4030 | รายได้ค่าบริการ | INCOME | 0 | 100,000 |
| (แถวรวม "รวม") | — | — | 107,000 | 107,000 |

- **จำนวนแถวบัญชี:** 5 แถว (ไม่นับ header และไม่นับแถว "รวม" ท้ายไฟล์ที่เป็นผลรวม รวมทั้งไฟล์ = 7 บรรทัด)
- **สมดุลหรือไม่:** สมดุล — debit รวมการเคลื่อนไหว = credit รวมการเคลื่อนไหว = 335,000 สตางค์ และ closing debit = closing credit = 107,000 สตางค์ ทั้งคู่
- **3 รหัสบัญชีแรก:** `1010`, `1100`, `2200`

---

## จุดที่คู่มือทำให้สับสน / ขาด

1. **พารามิเตอร์ `status` ของ `GET /documents` ผสม `OVERDUE` กับสถานะจริงไม่ได้ แต่ error ไม่บอกตรง ๆ** — คำอธิบายใน `references/endpoints.md`/openapi เขียนว่า "one status, several separated by commas, or `OVERDUE` / `ALL`" ซึ่งกำกวมว่าห้ามผสม `OVERDUE` กับสถานะอื่นด้วย comma จนกว่าจะลองพลาดจริง (ได้ `422 unprocessable` แบบไม่มี `hint`) ต้องเดาแล้วแยกยิง 2 คำขอแทน — แนะนำให้ recipes.md เพิ่มตัวอย่างการกรอง "รอชำระ+เกินกำหนด" ตรง ๆ สักตัวอย่าง เพราะเป็น use case ที่พบบ่อยมาก

2. **error 422 หลายจุดไม่มี `hint`** — คู่มือ (`SKILL.md` ส่วน Conventions) บอกให้ "อ่าน `error.code` + `hint`" แต่ในทางปฏิบัติ `hint` เป็น optional จริง ๆ (ตามสคีมา) และเคสนี้ไม่มีมาให้เลย ทำให้ต้องกลับไปอ่าน spec คร่าว ๆ + เดาสาเหตุเอง ควรระบุชัดเจนกว่านี้ว่า `hint` ไม่ได้มาเสมอ และ error 422 generic แบบนี้ควรทำอย่างไรต่อ (เช่น ลองตัดพารามิเตอร์ทีละตัว)

3. **field-level schema ไม่ได้อยู่ใน skill folder จริง** — `SKILL.md` อ้างถึง `docs/api/ACCOUNT-API.md` / `https://shark.in.th/developers/account.md` สำหรับรายละเอียดฟิลด์ระดับลึก (เช่น รูปแบบ `taxId` ต้อง 13 หลัก, `creditTermDays` อยู่ที่ contact ไม่ใช่ document, รูปแบบ object ของ `address`) แต่ไฟล์เหล่านี้ไม่ได้แนบมาใน `/root/.claude/skills/shark-account-api/` ต้อง fetch `openapi.json` จากอินเทอร์เน็ตจริงเพื่ออ่านสคีมาแทน ถ้าไม่มีอินเทอร์เน็ต/คีย์เพื่อเปิด `/developers/account.md` ตอนนั้น สกิลอย่างเดียวจะไม่พอสำหรับความแม่นยำระดับฟิลด์ (endpoints.md/recipes.md/state-machines.md ให้แค่ภาพรวมกับตัวอย่าง ไม่ครบทุกฟิลด์)

4. **ไม่มีตัวอย่างที่ตั้งใจ "ปล่อยให้ VAT ใช้ค่า default ของสมุดบัญชี"** — ตัวอย่าง curl ทุกอันใน `recipes.md` ใส่ `vatRateBp` มาตรงเสมอ (เช่น 700 ในสูตรที่ 1) ไม่มีตัวอย่างไหนแสดงการ "ไม่ส่ง" แล้วให้ระบบดึงค่า default จากการตั้งค่าร้าน ต้องเดา + เรียก `GET /settings` เองก่อนเพื่อยืนยันว่าเข้าใจถูกว่า default คือค่าอะไรกันแน่ (ผลออกมาถูกต้อง 7% แต่ทวนไม่ได้จากคู่มือเพียงอย่างเดียวว่าการไม่ส่งฟิลด์จะได้ผลลัพธ์แบบนี้แน่ ๆ)

5. **ไม่มีตัวอย่างชัดเจนสำหรับ "list ผู้ติดต่อซ้ำ tax id"** — งาน 3 ผ่านได้เพราะ error `duplicate` ตรงตามที่ระบุใน `endpoints.md` bucket 409 ทั่วไป (เขียนรวมกันหลาย error code ไว้ในบรรทัดเดียว) แต่ `hint` ที่ได้กลับมาเป็น "id ของ contact เดิม" ไม่ใช่ "code" — เป็นรายละเอียดเล็กที่ควรระบุชัดในเอกสาร เพื่อให้ agent รู้ว่าใน `hint` field จะได้อะไรกลับมา (id ไม่ใช่ human-readable code)

โดยรวม: คู่มือ `shark-account-api` (SKILL.md + references/*.md) เพียงพอสำหรับ **วางแผน** และหา endpoint/scope ที่ถูกต้องได้ครบทุกงาน แต่รายละเอียดระดับฟิลด์ (โดยเฉพาะพารามิเตอร์ query แบบผสม และพฤติกรรม default) ยังต้องพึ่ง `openapi.json` ที่ต้อง fetch สดจาก production จริงเป็นระยะเพื่อความมั่นใจ
