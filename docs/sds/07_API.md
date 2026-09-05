# 07 — Public API v1 (ออกแบบล่วงหน้าที่ระดับแพลตฟอร์ม — ยังไม่สร้างจริงนอกโมดูลบัญชี)

- Base: `https://shark.in.th/api/v1` · Auth: `Authorization: Bearer <API key ต่อ tenant>` (เก็บ hash · สร้าง/หมุนได้ในหน้า settings/developers · สิทธิ์ตาม scope ที่เลือกตอนสร้าง key)
- Resources ชุดแรก (read ก่อน act — **ยังไม่สร้าง นอกจากโมดูลบัญชีที่ as-built แล้วด้านล่าง**): `GET /customers` `GET /sales` `GET /bookings` `GET /inventory/items` `POST /bookings` `POST /customers`
- กติกาโดยรวมของแพลตฟอร์ม: rate limit ต่อ key · ทุก response มี `requestId` · เงินเป็นสตางค์ · error รูปแบบเดียว `{error: {code, message_th, message_en}}`
- Webhooks ขาออก: สมัคร URL ต่อ event จาก outbox types · ลายเซ็น HMAC-SHA256 header `X-Shark-Signature` · retry backoff
- เอกสาร: หน้า `/developers` สร้างจาก spec เดียวกัน (single source) — ต่อโมดูลที่มี API แล้ว เพิ่มเป็นหมวดในหน้านี้ (ดู `/developers/account` ของบัญชีด้านล่าง)

---

## Account API (as-built — WO A1–F3, "API บัญชีครอบทุกฟังก์ชัน + สกิล AI" 5 ก.ย. 2026)

โมดูลบัญชีเป็นโมดูลแรกที่ทำ API เต็มรูปตามพิมพ์เขียวด้านบน — **199 operations** ครอบทุกเมนู (เอกสาร/ผู้ติดต่อ/สินค้า/การเงิน/บัญชี-งบ-งวด/สินทรัพย์/คลังเอกสาร/ตั้งค่า) ทั้งอ่านและเขียน อยู่หลัง key เดียวกับที่ผูกกับ AI agent ได้โดยตรง รายละเอียดทุก endpoint (ตัวอย่าง curl, input/output ทุกฟิลด์, error) อยู่ที่ `docs/api/ACCOUNT-API.md` (generate จากทะเบียนโค้ดเดียวกับที่ route จริงใช้ ห้ามพิมพ์เอกสารมือ) และหน้าอ่านง่าย `/developers/account`.

### Base + auth

- Base: `https://shark.in.th/api/v1/account/*` — คนละ namespace จาก `/api/v1` เดิม (โมดูลบัญชี scope เป็น `AppSystem` ไม่ใช่ tenant)
- `Authorization: Bearer <api key>` — สร้าง/หมุน/เพิกถอนได้ในหน้าบัญชี **ตั้งค่า › การเชื่อมต่อ › แอปภายนอก / API** (rawKey โชว์ครั้งเดียว)
- `X-Shark-System: <systemId>` — จำเป็นเมื่อคีย์ไม่ได้ผูกสมุดบัญชีเล่มเดียว (ปกติสร้างจากหน้าบัญชีจะผูกสมุดนั้นเสมอ) ส่งผิดเล่ม → `403 system_mismatch`
- Schema เครื่องอ่านได้: `GET /api/v1/account/openapi.json` (OpenAPI 3.1 · ไม่ต้องใช้คีย์ · cache 5 นาที) — ทั้ง REST, docs, และ tool ของสกิล AI generate จาก **ทะเบียนเดียว** (`src/lib/modules/account/api/registry.ts`) จึงเน่าไม่ได้ (fitness F13 บังคับ)

### Scope = permission key จริง

คีย์ไม่มีคำศัพท์สิทธิ์ชุดที่สอง — **scope ของคีย์คือ permission key เดียวกับที่บทบาทคนในร้านใช้** (`<module>.<entity>.<verb>` เช่น `account.doc.issue`) คีย์จึงทำได้ไม่เกินสิ่งที่คนคนหนึ่งในร้านทำได้ ไม่ครบ scope → `403 scope_missing` พร้อม `hint` บอกชื่อ scope ที่ขาด

ตอนสร้างคีย์เลือกได้ทีละตัว หรือเลือก **bundle** สำเร็จรูป 5 ชุด (ซ้อนกันเป็นชั้น `read-only ⊂ issue-and-collect ⊂ accountant`, `danger`/`settings` แยกต่างหาก):

| Bundle | ทำอะไรได้ |
|---|---|
| `read-only` | อ่านเอกสาร/journal/ภาษี/รายงาน — ไม่เขียนเลย |
| `issue-and-collect` (**ค่าเริ่มต้นเมื่อสร้างคีย์จากหน้าบัญชี**) | read-only + สร้าง/ออกเอกสาร, บันทึกรับเงิน, จัดการผู้ติดต่อ/สินค้า |
| `accountant` | issue-and-collect + ปรับปรุงบัญชี, ปิดงวด, ผังบัญชี, สินทรัพย์, เช็ค, บัญชีธนาคาร, กระทบยอด |
| `danger` | การกระทำย้อนกลับยาก: ยกเลิกเอกสาร/การชำระ, เปิดงวดที่ปิดแล้ว, ถอด WHT, รวมผู้ติดต่อ, ตัดจำหน่ายสินทรัพย์, อนุมัติเอกสาร |
| `settings` | ตั้งค่าบัญชี, เพดานอนุมัติ, นำเข้าข้อมูล |

คีย์เริ่มต้นจากหน้าบัญชีหมดอายุ 365 วัน (เลือกได้ 30/90/365/ไม่หมดอายุ) — คีย์หมดอายุ → `401 key_expired` ต้องหมุนคีย์ใหม่

### Pipeline ของทุกคำขอ (`src/lib/modules/account/api/{require,dispatch,run,idempotency,respond}.ts`)

1. **Bearer → verify คีย์** → หมดอายุ/เพิกถอนแล้ว → 401
2. **resolve สมุดบัญชี** (จากคีย์ หรือ `X-Shark-System`) → ผิดเล่ม/ไม่ใช่สมุดบัญชี → 403/400
3. **Rate limit ต่อคีย์ต่อ kind** (300 อ่าน / 60 เขียน / 30 รายงาน ต่อนาที) → 429 + `Retry-After` (คำขอที่ผ่าน = header `X-RateLimit-Remaining`)
4. **Scope** — คีย์ต้องมี permission key ของ op นี้ (IMPLIES เหมือน RBAC ปกติ) → 403 `scope_missing`
5. **Zod strict** ต่อ body/query ของ op (`additionalProperties:false`) → ฟิลด์ผิด/เกิน → 422 `validation` + `details[]`
6. **Danger gate** — op ที่ `kind:"danger"` ต้องส่ง `confirm: true` (ไม่งั้น 409 `confirm_required`) และ `reason` ≥5 ตัวอักษร (เก็บลง audit คู่กับชื่อคีย์)
7. **Idempotency-Key** — ทุกคำขอเขียน (POST/PATCH/PUT/DELETE) ต้องมี header นี้ (ยกเว้น op ที่ประกาศ `idempotent:"natural"`) ซ้ำ+body เดิม → คืนผลเดิม (header `Idempotent-Replayed: true`) · ซ้ำ+body ต่าง → 409 `idempotency_conflict` · เก็บ 24 ชม.
8. **handler** ของ op (service เดียวกับที่ปุ่มบนจอเรียก — REST/UI/AI ใช้เส้นเดียวกันผ่าน `api/run.ts`)
9. **Audit** — ทุกคำขอเขียนที่สำเร็จ (ไม่นับ replay) เขียน `AuditLog` (`actorType: API_KEY`, action = permission key ของ op)

เส้นเดียวกันนี้ AI agent (ทั้งภายในแอป SHARK และภายนอกผ่านสกิล) ก็เดินผ่าน — ต่างกันแค่ actor (`apikey` / `user` / `assistant`) และเขียน→proposal สำหรับ AI (ดู `docs/AI_LAYER.md`)

### Envelope + error codes

สำเร็จ: `{ data, page?, requestId }` · ล้มเหลว: `{ error: { code, message_th, message_en, hint?, details? }, requestId }` (`requestId` ซ้ำใน header `X-Request-Id`) — **แตกโค้ดตาม `error.code` เสมอ ห้ามพาร์สข้อความ**

| code | HTTP | ความหมาย |
|---|---|---|
| `unauthorized` | 401 | ไม่มี/ผิด Bearer หรือคีย์ถูกเพิกถอน |
| `key_expired` | 401 | คีย์หมดอายุ |
| `system_required` | 400 | คีย์ไม่ผูกสมุด และไม่ได้ส่ง `X-Shark-System` |
| `system_mismatch` | 403 | `X-Shark-System` ไม่ตรงกับคีย์/ไม่ใช่สมุดบัญชีของร้านนี้ |
| `scope_missing` | 403 | คีย์ไม่มี scope นี้ (ดู `hint`) |
| `invalid_json` | 400 | body ไม่ใช่ JSON ที่ parse ได้ |
| `validation` | 422 | ไม่ผ่าน schema (`details[]` รายฟิลด์) — รวมฟิลด์แปลกปลอมที่ไม่รู้จัก |
| `idempotency_required` | 400 | คำขอเขียนไม่มี `Idempotency-Key` |
| `idempotency_conflict` | 409 | คีย์ซ้ำ แต่ body ต่างจากครั้งก่อน |
| `idempotency_in_progress` | 409 | คำขอคีย์เดียวกันกำลังทำงานอยู่ |
| `confirm_required` | 409 | op อันตรายไม่ได้ส่ง `confirm:true` |
| `not_found` | 404 | ไม่มี op นี้ หรือไม่พบข้อมูลในสมุดนี้ |
| `method_not_allowed` | 405 | path มีจริงแต่ method ผิด (header `Allow` บอกที่ใช้ได้) |
| `rate_limited` | 429 | เกินโควตาต่อนาที |
| `period_locked` | 409 | งวดบัญชีของวันที่นั้นปิด/ล็อกแล้ว |
| `state_conflict` | 409 | สถานะปัจจุบันไม่รองรับการกระทำนี้ |
| `duplicate` | 409 | ชนกับข้อมูลเดิม (เลขซ้ำ/รหัสซ้ำ/ผูกซ้ำ) |
| `forbidden` | 403 | กติกาธุรกิจปฏิเสธ (ไม่ใช่เรื่อง scope) |
| `unprocessable` | 422 | เข้าใจคำขอแต่ทำตามไม่ได้ |
| `upstream_unavailable` | 503 | บริการภายนอกที่ op นี้พึ่ง (เช่น DBD) ยังไม่ตั้งค่า/ล่ม |

รายละเอียดคำแนะนำแก้ต่อโค้ดอยู่ที่ `docs/api/ACCOUNT-API.md` ("Error codes")

### Pagination + CSV

- List ส่วนใหญ่รับ `page` (เริ่ม 1) และ `pageSize` (default 20, สูงสุด 100 — เกิน = clamp ไม่ error) คืน `page: { page, pageSize, pageCount, total, hasMore }` คู่กับ `data`
- op ที่มีรายงาน/export ประกาศ `csv:` ในทะเบียน — ส่ง header `Accept: text/csv` แทน JSON → ได้ `text/csv; charset=utf-8` + BOM + `Content-Disposition: attachment` (ผ่าน `csvRow()` กลาง กัน CSV injection)

### Webhooks ขาออก

สมัคร endpoint URL + เลือก event ได้ในหน้าเดียวกับที่สร้างคีย์ (**ตั้งค่า › การเชื่อมต่อ › แอปภายนอก / API**) ได้ secret ครั้งเดียว event ยิงในธุรกรรมเดียวกับงานหลัก (ไม่มี event หลอก ไม่มีงานที่รอดแล้วไม่มี event) ปัจจุบันมี **21 event** ขึ้นต้น `account.*` (ออก/ยกเลิกเอกสาร, ตอบใบเสนอราคา, รับ/ยกเลิกชำระ, ลิงก์ขอชำระเงินจ่ายแล้ว/หมดอายุ, ผู้ติดต่อ/สินค้าถูกสร้าง/แก้/รวม, เช็คเปลี่ยนสถานะ, กระทบยอดยืนยัน, งวดปิด/เปิดกลับ, ค่าเสื่อม/ตัดจำหน่ายสินทรัพย์, เอกสารประจำทำงานแล้ว) — รายชื่อเต็ม + ตัวอย่าง payload ที่ `docs/api/ACCOUNT-API.md` ("Webhooks")

ตรวจสอบด้วย header `X-Shark-Signature` = `HMAC-SHA256(secret, raw body)` เทียบแบบ constant-time ก่อน parse JSON เสมอ — ห้ามพาร์สก่อนตรวจลายเซ็น

### ผิวหน้า AI

- `GET /api/v1/ai/skills/account` — manifest ของสกิล `account` (36 tool ที่ generate จากทะเบียน op เดียวกันข้างบน)
- `POST /api/v1/ai/tools/account_*` — เรียก tool ตรง: อ่าน = ทำทันที, เขียน/อันตราย = สร้าง `proposal` ให้เจ้าของยืนยันในแอปก่อน แล้ว execute ด้วยสิทธิ์ของคนที่กดยืนยัน (ไม่ใช่สิทธิ์ของ AI)
- รายละเอียดสถาปัตยกรรม proposal → confirm → execute อยู่ที่ `docs/AI_LAYER.md`

**as-built (WO A4):** สัญญาเครื่องอ่านได้ที่ `/api/v1/account/openapi.json` และคู่มือคนอ่านที่ `docs/api/ACCOUNT-API.md` — ทั้งคู่ generate จากทะเบียน op เดียวกัน (`src/lib/modules/account/api/registry.ts`) ⇒ เอกสารเน่าไม่ได้ (fitness F13)
