# WO A3 — แกน REST ของ API บัญชี (`src/lib/modules/account/api/` + catch-all route)

สถานะ: **ทำครบ · ด่านเขียวทั้งหมด · ยังไม่ commit** (ตามกติกา builder ห้าม commit)
ผู้ทำ: Opus (builder) · ข้อสอบ: `scripts/qc-account-api-core.mts` (Fable · ไม่ได้แตะ)

## ไฟล์ที่เพิ่ม
| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/modules/account/api/actor.ts` | `ApiActor` · `membershipFromScopes` (STAFF + permission ตรงตัว) · `actorCan` (เดิน `IMPLIES` เหมือน `accountCan` แต่ไม่ต้องมี session) |
| `src/lib/modules/account/api/respond.ts` | ซอง `{data,page?,requestId}` / `{error:{code,message_th,message_en,hint?,details?},requestId}` · `newRequestId` · `ok` · `fail` · `failBody` · `mapError` · `ApiErrorCode` (19 รหัส) |
| `src/lib/modules/account/api/op.ts` | ชนิด `ApiOp` / `ApiOpCtx` / `ApiMethod` / `ApiOpKind` / `ApiRateKind` · `defineOp` (generic ตาม zod schema) · `rateKindOf` |
| `src/lib/modules/account/api/registry.ts` | `ACCOUNT_OPS` · `matchOp(method, segments)` · `allowedMethods(segments)` · re-export ทุกอย่างจาก `op.ts` |
| `src/lib/modules/account/api/ops/core.ts` | 4 smoke op ถาวร: `ping` · `echo-by-id` · `echo` · `danger-echo` |
| `src/lib/modules/account/api/require.ts` | `requireAccountApi` (คีย์ → สมุด → เพดานอัตรา → scope) · `API_RATE_LIMITS` |
| `src/lib/modules/account/api/idempotency.ts` | `withIdempotency` (จองแถว → ทำงาน → เก็บผล / ตอบซ้ำ) |
| `src/lib/modules/account/api/dispatch.ts` | ลำดับกลางทั้งหมด + audit |
| `src/app/api/v1/account/[...path]/route.ts` | export GET/POST/PATCH/PUT/DELETE → `dispatch(method, req, await ctx.params)` (Next 16: `params` เป็น Promise) |

## ไฟล์ที่แก้ (เพิ่มอย่างเดียว — สัญญาเดิมไม่เปลี่ยน)
- `src/lib/api-keys/service.ts` — เพิ่ม `verifyApiKeyDetailed(raw) → {status:"ok"|"expired"|"invalid"}` (ตัว `ok` แถม `name` มาด้วย)
  `verifyApiKey` เดิมถูกเขียนใหม่ให้เรียกตัวนี้แล้วยุบ `expired`/`invalid` เป็น `null` เหมือนเดิมเป๊ะ (`qc-public-api` 18/18 · `qc-account-api-keys` 51/51 ยืนยัน)
- `src/lib/core/rate-limit-db.ts` — `RateVerdict` เพิ่มฟิลด์ **optional** `count` (จำนวนที่นับไปแล้วในหน้าต่างนี้) · คำสั่ง SQL เดิมไม่เปลี่ยนแม้แต่ตัวเดียว (ยังเป็น `INSERT … ON CONFLICT DO UPDATE … RETURNING` คำสั่งเดียว) · ผู้เรียกเดิมไม่เห็นความต่าง

## โน้ตออกแบบ

### 1. ทำไม `op.ts` แยกจาก `registry.ts`
`ops/*.ts` ต้องใช้ `defineOp` ส่วน `registry.ts` ต้องใช้ `CORE_OPS` — ถ้าอยู่ไฟล์เดียวกันจะเป็นวงกลม
`registry → ops → registry` ซึ่ง**พังจริง**เมื่อผู้เรียกเริ่มต้นที่ `ops/*` ก่อน (`ACCOUNT_OPS` ยังไม่ถูกกำหนดค่า → TDZ)
แยกชนิด+`defineOp` ออกมาไว้ `op.ts` ⇒ ทิศเดียว `registry → ops → op`

### 2. การจอง (claim) แถว idempotency
- `requestHash = sha256(method + " " + pathname + "\n" + bodyText)` — `bodyText` คือ body ดิบที่ `dispatch` อ่านครั้งเดียว (Request อ่านซ้ำไม่ได้)
- **จองด้วย INSERT อย่างเดียว** ผ่าน `tenantDb(...).apiIdempotency.create(...)` แล้วจับ `P2002` (unique `(keyId, idemKey)`)
  ⇒ การตัดสินว่า "ใครได้ทำ" จบใน SQL คำสั่งเดียว ไม่มีช่วง read-then-write ให้สองคำขอที่มาพร้อมกันแทรก
  (ยกกติกาเดียวกับ `rate-limit-db.ts` ที่เคยนับพลาดเพราะแตกเป็นหลายคำสั่ง)
  🔴 **ไม่ได้ใช้ raw SQL / raw `prisma`** อย่างที่ใบสั่งงานเปิดช่องไว้ เพราะ F5.1 baseline = 45 และตอนนี้ในโมดูลมี 45 ไฟล์พอดี — เพิ่มอีกไฟล์คือ ratchet แดงทันที ⇒ ใช้ `tenantDb` + จับ P2002 แทน (ผลลัพธ์อะตอมมิกเท่ากัน และได้ตัวกรอง tenant ฟรี)
- จองได้ → `run()` (handler + audit) → `updateMany` เก็บ `status` + `responseJson` (เก็บทั้งกรณีสำเร็จและล้มเหลว — retry ของคำสั่งที่ล้มเหลวต้องได้คำตอบเดิม)
- จองไม่ได้ → อ่านแถว: `requestHash` ต่าง → 409 `idempotency_conflict` · `status === null` → 409 `idempotency_in_progress` · มีผลแล้ว → ตอบซ้ำ `status`+`responseJson` เดิม + หัว `Idempotent-Replayed: true`
- TTL 24 ชม. (`expiresAt`) · แถวหมดอายุ = ถือว่าไม่มี → `deleteMany` แล้วจองใหม่ · แถวหายระหว่างทาง (ถูกกวาด) → จองใหม่ 1 ครั้ง แพ้ซ้ำ = 409 in_progress
- **ตอบซ้ำใช้ `requestId` เดิมที่ฝังอยู่ใน body ที่เก็บไว้** เป็นค่าหัว `X-Request-Id` (ไม่งั้นหัวกับ body จะไม่ตรงกัน)

### 3. `X-RateLimit-Remaining` คำนวณยังไง
`checkRateLimitDb` คืน `count` ที่ `RETURNING` มาจาก SQL คำสั่งเดิม (จำนวนครั้งในหน้าต่างนี้ รวมครั้งนี้)
→ `remaining = max(0, limit − count)` · ตัวจำกัดล่ม (fail-open) → `count` เป็น `undefined` → `remaining = limit`
เพดาน: `read 300` · `write 60` · `report 30` ต่อนาทีต่อคีย์ · ถัง `acct:api:<rateKind>:<keyId>` บน `ChatRateBucket`
`rateKindOf(op) = op.rate ?? (kind === "read" ? "read" : "write")`

### 4. ลำดับด่าน (สลับไม่ได้)
`matchOp` (404 `not_found` / 405 `method_not_allowed` + หัว `Allow`) → `requireAccountApi`
(401 `unauthorized` / 401 `key_expired` → 400 `system_required` / 403 `system_mismatch` → 429 `rate_limited` + `Retry-After` → 403 `scope_missing` + `hint: "ต้องการสิทธิ์ <action>"`)
→ input (GET = query · อื่น = body · JSON เสีย = 400 `invalid_json`) → **danger: `confirm === true` ก่อน zod (409 `confirm_required`) + `reason` ≥ 5 ตัว (422 `validation`) แล้วถอด `confirm` ออก** → zod `safeParse` (422 `validation` + `details[{path,message}]`)
→ write/danger ผ่าน `withIdempotency` → handler → `writeAudit({actorType:"API_KEY", actorId:keyId, action:op.action, targetType:"ApiOp", targetId:op.id, after:{keyName, opId, requestId, reason?}})` → `ok(...)`
ทุกคำตอบมีหัว `X-Request-Id` · คำตอบที่สำเร็จมี `X-RateLimit-Remaining`

เหตุผลที่เพดานอัตรามาก่อน scope: คนที่ยิงรัวด้วยคีย์สิทธิ์ไม่พอก็ต้องถูกเบรก (ไม่งั้นการเดา scope วนซ้ำจะฟรี) และ 429 ไม่บอกอะไรเกี่ยวกับสิทธิ์ของคีย์

### 5. เรื่องความปลอดภัยที่ตั้งใจ
- `membershipFromScopes` ใช้ `role: "STAFF"` เท่านั้น — `OWNER`/`MANAGER` ใน `evaluate` ปล่อยผ่านทุก action ⇒ คีย์จะกลายเป็นสิทธิ์เต็มทันที
- `unitAccess: []` ⇒ action ที่ผูก `unitId` จะถูกปฏิเสธ (คีย์ยังไม่มีมิติสาขา)
- schema ของทุก op เป็น `.strict()` ⇒ `tenantId`/`systemId` ที่แอบใส่มาใน body = 422 (ไม่ใช่ "ถูกเมิน")
- `mapError` ส่งต่อเฉพาะข้อความไทยที่ผ่าน `isSafeUserMessage` · อังกฤษ/ของภายใน (Prisma ฯลฯ) → 422 `unprocessable` + ข้อความไทยกลาง `ERR.GENERIC_ACTION_FAILED`
- คีย์ผูกสมุดแล้วส่งหัว `X-Shark-System` ต่างจากที่ผูก → 403 (ไม่ใช่ "ยึดของคีย์เงียบ ๆ" เพราะผู้เรียกที่เข้าใจผิดจะเขียนลงเล่มผิดโดยไม่รู้ตัว)

## คำสั่งที่รัน + บรรทัดสรุป
env ทุกคำสั่งที่แตะ DB (บรรทัดเดียวกัน):
```
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.qc | cut -d= -f2- | tr -d '"')" DIRECT_URL="$(grep -m1 '^DIRECT_URL=' .env.qc | cut -d= -f2- | tr -d '"')" APP_ENV=development; echo "$DIRECT_URL" | grep -q ep-plain-art || exit 1
```
| คำสั่ง | ผล |
|---|---|
| `pnpm exec tsx scripts/qc-account-api-core.mts` | `ผ่าน 64/64` · CRITICAL 0 · MAJOR 0 · MINOR 0 · `JSON_SUMMARY {"total":64,"passed":64,"findings":[]}` |
| `pnpm exec tsx scripts/qc-account-api-keys.mts` | `ผ่าน 51/51` · 0/0/0 · `JSON_SUMMARY {"total":51,"passed":51,"findings":[]}` |
| `pnpm exec tsx scripts/qc-public-api.mts` | `ผ่าน 18/18` · 0/0/0 |
| `pnpm exec tsx scripts/qc-chat-api-v1.mts` | `ผ่าน 89/89` · 0/0/0 |
| `NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck` | 0 error |
| `pnpm fitness` | `ผ่าน 17/17` · 0/0/0 (F5.1 ยังเขียวที่ baseline 45 · F2.1/F2.2 ไม่มีเส้นใหม่) |

หมายเหตุ: `qc-public-api` / `qc-chat-api-v1` โหลด `.env` เอง แต่ `process.loadEnvFile` **ไม่ทับ** ตัวแปรที่ export มาก่อน (ทดสอบยืนยันแล้ว) ⇒ รันด้วย env QC ข้างบนปลอดภัย ไม่แตะ prod

## ส่วนที่เบี่ยงจากใบสั่งงาน
1. **ไม่ใช้ raw `prisma.$executeRaw` ใน `idempotency.ts`** — ใบสั่งงานอนุญาตแบบมีเงื่อนไข "ถ้า F5.1 แดงให้ใช้ `tenantDb` แทน" · ตรวจก่อนเขียนพบว่าโมดูลมี raw prisma อยู่ 45 ไฟล์ = baseline พอดี ⇒ เลือกทาง `tenantDb` + จับ `P2002` ตั้งแต่แรก (ไม่ต้องลองผิดแล้วย้อน)
2. **`defineOp` + `op.ts`** — ใบสั่งงานให้ `registry.ts` ถือทั้ง type และ `ACCOUNT_OPS` · แยก type/`defineOp` ออกเป็น `op.ts` เพื่อตัด import วงกลม แล้ว `registry.ts` `export * from "./op"` ⇒ ผู้เรียกภายนอก (รวมข้อสอบ) ยัง `import { ApiOp, defineOp, ACCOUNT_OPS, matchOp } from ".../registry"` ได้เหมือนเดิมทุกตัว
3. **`requireAccountApi(req, op, requestId?)`** — เพิ่มพารามิเตอร์ที่ 3 (มีค่าปริยาย) เพราะ `dispatch` ต้องออก `requestId` ตั้งแต่ก่อนจับคู่ path (404/405 ก็ต้องมี `X-Request-Id`) แล้วส่งต่อให้ด่านหน้าใช้ค่าเดียวกันทั้งคำขอ
4. **`withIdempotency` รับ `requestId` + `extraHeaders` เพิ่ม** — เพื่อให้คำตอบที่ออกจากชั้นกันซ้ำ (รวม 409 และการตอบซ้ำ) มี `X-Request-Id` / `X-RateLimit-Remaining` ครบเหมือนเส้นทางปกติ

## ของค้างให้ WO ถัดไป
- A4 จะเติม `openapi.ts` + fitness F13 (ทุก op มี `test` และ id นั้นโผล่ในสคริปต์ `qc-account-api-*.mts`) — ตอนนี้ 4 op มี `test` ครบแล้ว (`CORE-2.1` · `CORE-2.4` · `CORE-4.3` · `CORE-7.5`)
- ยังไม่ได้ปิดหนี้จาก A1: คีย์บัญชียังเรียก `/api/v1/*` ของแพลตฟอร์มได้เหมือนคีย์เดิม (แกน A3 ไม่ได้ทำให้แย่ลง — ทางบัญชีตรวจ scope ครบ)
- `op.rate = "report"` ยังไม่มี op ไหนใช้ (จะเริ่มใช้ที่ B4 รายงาน)
