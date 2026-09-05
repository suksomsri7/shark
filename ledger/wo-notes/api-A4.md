# WO A4 — OpenAPI generator + docs pipeline + fitness F13 (builder: Opus)

สถานะ: **ทำครบทุกข้อ · ด่านเขียวทั้ง 4** · ไม่ commit (tree dirty ตามกติกา ข้อ 4)

## ไฟล์ที่แตะ

| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| `src/lib/modules/account/api/openapi.ts` | **ใหม่** | `buildOpenApi(ops) → OpenApiDocument` (OpenAPI 3.1.0) บริสุทธิ์ ไม่แตะ DB/เวลา/สุ่ม |
| `src/app/api/v1/account/openapi.json/route.ts` | **ใหม่** | `GET` ไม่ต้องใช้คีย์ → `buildOpenApi(ACCOUNT_OPS)` + `Cache-Control: public, max-age=300` |
| `scripts/gen-account-api-docs.mts` | **ใหม่** | `renderDocs()` (บริสุทธิ์ · export ให้ fitness เรียก) + CLI เขียนไฟล์ / `--check` |
| `docs/api/ACCOUNT-API.md` | **ใหม่ (generate)** | คู่มืออังกฤษ 12.2 KB · ห้ามแก้มือ |
| `src/lib/modules/account/api/respond.ts` | แก้ | `ApiErrorCode` เปลี่ยนจาก union เขียนมือ → derive จาก `export const API_ERROR_CODES = [...] as const` (ต้องมี "ค่าจริง" ให้ generator แจงเป็น enum ได้ · type ที่ได้เท่าเดิมเป๊ะ · ไม่มีผู้ใช้ภายนอกไฟล์นี้ตอน A3) |
| `scripts/fitness.mts` | แก้ | เพิ่มบล็อก **F13** (3 ข้อ) ก่อนหัวข้อสรุป |
| `docs/sds/07_API.md` | แก้ | เพิ่มบรรทัด as-built ชี้ `/api/v1/account/openapi.json` + `docs/api/ACCOUNT-API.md` |

> ⚠️ ไฟล์ dirty อื่นที่ **ไม่ใช่ของ A4**: `ledger/ACCOUNT-API-RUN.md`, `scripts/qc-account-api-read-docs.mts`, `scripts/qc-account-api-read-master.mts` (Fable เขียน oracle B1/B2 ระหว่างที่ A4 ทำอยู่ — ไม่ได้แตะ)

## zod → JSON Schema ทำยังไง (ไม่เพิ่ม dependency)

zod ใน repo = **4.4.3** ⇒ มี `z.toJSONSchema` ในตัวแล้ว **ไม่ต้องลง `zod-to-json-schema`** (ตรวจจาก `node_modules/zod/package.json` + ทดลองยิงจริงก่อนเขียน)

```ts
z.toJSONSchema(schema, { target: "draft-2020-12", io, unrepresentable: "any", cycles: "ref", reused: "inline" })
```
- `target: "draft-2020-12"` — OpenAPI **3.1** ใช้ JSON Schema 2020-12 ตรง ๆ (ต่างจาก 3.0 ที่เป็น subset) ⇒ ไม่ต้องดัดสคีมา
- `io: "input"` — สคีมาของ "สิ่งที่ผู้เรียกส่งมา" (ก่อน default/transform) = สิ่งที่คู่มือต้องบอก · output ใช้ `io: "output"`
- `unrepresentable: "any"` — ชนิดที่ JSON Schema ไม่มีคำพูดให้ (เช่น `z.date()`) กลายเป็น "อะไรก็ได้" แทนที่จะ **โยน** — สำคัญมาก เพราะ op เดียวที่แปลงไม่ได้จะทำให้ `/openapi.json` ล่มทั้งไฟล์
- `reused: "inline"` — ไม่แตก `$defs` (คู่มืออ่านง่ายกว่า และ schema ต่อ op อยู่ครบในที่เดียว)
- หลังแปลงลบ `$schema` ทุกชั้น (`stripSchemaMeta`) เพราะ key นี้ห้ามอยู่ในเอกสารรวม

ที่เพิ่มเองบน schema ที่ zod ให้มา:
- `closeObject()` — object ที่ยังไม่ระบุ ให้ `additionalProperties: false` (op ปัจจุบันใช้ `.strict()` อยู่แล้ว จึงมาเองด้วย)
- `withDangerFields()` — op kind `danger` ยัด `confirm { type: boolean, enum: [true] }` + บังคับ `reason { type: string, minLength ≥ 5 }` และดัน 2 ตัวเข้า `required`
  (ตรงกับด่านจริงใน `dispatch.ts`: `confirm` ถูกตรวจ+ถอดออกก่อนถึง zod ⇒ schema ของ op ไม่มี `confirm` เอง ถ้าไม่ยัดตรงนี้ คู่มือจะบอกไม่ครบ)
- GET: `queryParameters()` แตก property ของ object schema เป็น `in: "query"` รายตัว (ผู้เรียก/agent อ่านง่ายกว่าเห็นเป็นก้อนเดียว) — ตรงกับ `dispatch.ts` ที่อ่าน GET จาก `searchParams`

**ความ deterministic**: `paths` เรียงตามตัวอักษร · method ในแต่ละ path เรียง · `responses` เรียงตามรหัส · ไม่มีเวลา/สุ่ม/DB ⇒ ยิงกี่ครั้งได้ JSON เท่ากันทุกไบต์ (ข้อสอบ OA-3.2 เทียบ route กับ `buildOpenApi` แบบ string ตรง ๆ)

## route `/api/v1/account/openapi.json` — ทำไม static ชนะ catch-all

- โฟลเดอร์ชื่อมีจุด **ไม่ใช่** convention ของ Next: ที่มีความหมายพิเศษคือ `[param]` `[...catchAll]` `(group)` `_private` `@slot` เท่านั้น (`node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md` §Route groups and private folders) ⇒ `openapi.json/` เป็น **static segment** ชื่อ `openapi.json` ตรงตัว
- ลำดับการจับคู่: **predefined > dynamic > catch-all** (`node_modules/next/dist/docs/02-pages/.../07-api-routes.md` §Caveats — ตัวอย่าง `post/create.js` ชนะ `post/[...slug].js`) ⇒ `openapi.json/route.ts` ชนะ `[...path]/route.ts` ที่อยู่ข้างกัน และ `dispatch` จะไม่ถูกเรียกด้วย path นี้
- กันอีกชั้นด้วยข้อสอบ OA-3.3: ทะเบียนต้องไม่มี op ที่ path มีคำว่า `openapi` (ถึงหลุดมาถึง dispatch ก็จะเป็น 404 ไม่ใช่การชนกันเงียบ ๆ)
- ยืนยันเชิงรันจริงได้แค่ระดับ module (ข้อสอบเรียก `route.GET()` ตรง) — **ไม่ได้รัน `next build`** ตามกติกาเครื่อง ⇒ ถ้า Fable อยากเห็นของจริง ให้ยิง `curl -s localhost:3215/api/v1/account/openapi.json | head -c 200` ตอนมี server QC

## โครงคู่มือ `docs/api/ACCOUNT-API.md`

1. **หัวเรื่อง 5 บรรทัดแรก อังกฤษล้วน** — ชื่อ · ลิงก์สัญญาเครื่องอ่าน (`/api/v1/account/openapi.json`) · base URL + เวอร์ชัน + จำนวน op · ประโยค "generated, do not edit by hand"
2. **Who this is for** — AI agents (ให้ branch ที่ `error.code` · `message_th` โชว์เจ้าของร้านได้เลย) และนักพัฒนา
3. **Authentication and scopes** — ตาราง bundle 5 ชุดจาก `src/lib/api-keys/scopes.ts` (label EN = `summary` + scope รายตัว) + ค่า default `issue-and-collect` / 365 วัน (อ่านจาก `DEFAULT_BUNDLE_ID`/`DEFAULT_KEY_TTL_DAYS` ไม่ฮาร์ดโค้ด)
4. **Conventions** — satang · วันที่ `YYYY-MM-DD` (วันไทย) · idempotency · `X-Shark-System` · danger confirm/reason · ซองจดหมาย · cursor pagination · rate limit · closed schema
5. **Error codes** — ตารางครบ **19 รหัส** (code · HTTP · ความหมาย · ต้องทำอะไรต่อ) จาก `API_ERROR_CODES`
6. **Operations** — จัดกลุ่มตาม kind (Read / Write / Danger · แต่ละกลุ่มมีคำอธิบายกติกาของกลุ่ม) · ต่อ op: `**METHOD /path** - summary · scope: \`action\` · kind` → path params → ตาราง field (body หรือ query จาก JSON Schema) → ตัวอย่าง `curl` ที่ค่าตัวอย่าง **ผ่าน schema จริง** (min/max/enum/`reason` ยาวพอ)
7. **Glossary (Thai ↔ English)** — 20 ศัพท์บัญชี (ใบกำกับภาษี/ภาษีหัก ณ ที่จ่าย/กระทบยอด/สตางค์ …) คู่กับชื่อที่ใช้ใน API

`--check` เทียบไฟล์บนดิสก์กับ `renderDocs()` แบบ byte-for-byte · ไม่ตรง → exit 1 + บอกคำสั่งที่ต้องรัน · โหลด env ไม่ต้อง (ไม่แตะ DB) และรันได้แม้ env ของ QC ถูก export ไว้แล้ว (ข้อสอบ OA-4.5 spawn ด้วย `process.env` ของตัวเอง)

## fitness F13 (ทะเบียน API บัญชี · MAJOR ทั้งบล็อก)

- **F13.1** — ทุก op ใน `ACCOUNT_OPS` มี `test` และสตริง `"<test>"` โผล่จริงในไฟล์ `scripts/qc-account-api-*.mts` (เพิ่ม endpoint แล้วไม่มีข้อสอบครอบ = แดงตั้งแต่ pre-commit)
- **F13.2** — `docs/api/ACCOUNT-API.md` เท่ากับ `renderDocs()` — **import ฟังก์ชันบริสุทธิ์ ไม่ spawn** (เร็วกว่ามากและไม่มีโอกาสเขียนไฟล์ทับระหว่างตรวจ) · สคริปต์ป้องกันการรัน CLI ตอนถูก import ด้วย `resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))`
- **F13.3** — op ที่ประกาศ `tool` ต้องมีชื่อ tool อยู่ใน `src/lib/ai/skills.ts` (วันนี้ 0 ตัว = ผ่านแบบว่างเปล่า · จะมีของจริงตอน E1) — เหตุผลเดียวกับ F10: tool ที่ไม่มีบ้าน = AI เรียกไม่ได้และเงียบสนิท
- fitness ยังเร็ว: **1.66 วินาที** ทั้งไฟล์ (import `registry` ไม่ลาก prisma เข้ามา — `op.ts` import `ApiActor` แบบ type-only)

## ของที่ส่งต่อ WO ถัดไป

- **เพิ่ม error code ใหม่ (B2 จะเพิ่ม `upstream_unavailable`)**: เติมใน `API_ERROR_CODES` (respond.ts) แล้ว **typecheck จะบังคับ** ให้ไปเติมคำอธิบายใน `ERROR_CODE_DOCS` ของ `gen-account-api-docs.mts` (เป็น `Record<ApiErrorCode, …>`) — enum ใน OpenAPI + ตารางในคู่มือขยับเอง แล้วต้องรัน generator ใหม่ (ไม่งั้น F13.2 แดง)
- **เพิ่ม op ใหม่ทุกครั้ง**: รัน `pnpm exec tsx scripts/gen-account-api-docs.mts` แล้ว commit `docs/api/ACCOUNT-API.md` ไปด้วยเสมอ
- op ที่ต้องคืน `page`/ฟิลด์ระดับบน (แผน B1 จะเพิ่ม `paged()`): ตอนนี้ 200 ใน spec ประกาศ `{ data, requestId }` — เมื่อ B1 ทำ `paged()` ให้เพิ่ม `page` เข้า schema ของ 200 ใน `openapi.ts` ที่เดียว (ยังไม่ทำ เพราะวันนี้ยังไม่มี op ที่ใช้จริง)
- `op.output` ยังไม่มี op ไหนประกาศ ⇒ `data` ใน spec เป็น `{}` (any) · B1 เป็นต้นไปถ้าใส่ `output` zod จะได้ schema เต็มทั้งใน OpenAPI และตารางในคู่มือฟรี

## คำสั่ง + บรรทัดสรุป (รันเอง ทั้งหมดผ่านรอบเดียว)

```
export DATABASE_URL=... DIRECT_URL=... APP_ENV=development   # จาก .env.qc (grep|cut) · ตรวจ ep-plain-art แล้ว
pnpm exec tsx scripts/qc-account-api-openapi.mts
pnpm exec tsx scripts/qc-account-api-core.mts
NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck
pnpm fitness
```

```
===== QC Account API OpenAPI (A4) =====
ผ่าน 26/26
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":26,"passed":26,"findings":[]}

===== QC Account API Core (A3) =====
ผ่าน 64/64
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":64,"passed":64,"findings":[]}

typecheck: exit 0 · error TS = 0

===== FITNESS =====
ผ่าน 20/20   (เดิม 17 + F13.1/F13.2/F13.3)
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
```
