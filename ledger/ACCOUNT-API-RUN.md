# ACCOUNT-API-RUN — สถานะสดของ run "API บัญชีครอบทุกฟังก์ชัน + สกิล AI" (session ใหม่อ่านไฟล์นี้ก่อน · Fable อัปเดตทุกครั้งที่ WO เปลี่ยนสถานะ)

> แผนแม่: `ledger/PLAN-ACCOUNT-API.md` (§2 หลักออกแบบ · §4 ตารางครอบทุกฟังก์ชัน · §6 เกณฑ์ความปลอดภัย · §7 WO · §8 คำตอบเจ้าของ) · โน้ตระหว่างทำ: `ledger/wo-notes/api-<WO>.md`
> **เจ้าของสั่ง 5 ก.ย. 2026 ~14:10 BKK**: "Fable วางแผนละเอียด คุมงานแทน QC ตรวจเช็ค หาบั๊ก อุดช่องโหว่ ส่ง sub-agent เลือก model ให้เหมาะ ต้องตรวจเองว่าใช้ได้จริงไม่ใช่แค่รายงาน ต้องเห็นภาพจริง ระวัง session ตาย + VPS overload · เสร็จแล้วเริ่ม run ยาวได้เลย"
> **วิธีกลับมาต่อ**: `cd /root/projects/shark-accounting && git pull --rebase` → อ่านตาราง "WO ปัจจุบัน" → อ่าน `wo-notes/api-<WO>.md` → `git status` (ไฟล์ dirty = งานค้างของ WO นั้น) → ทำต่อจาก "ขั้นที่ถึง" ห้ามเริ่มใหม่ · sub-agent ตายกลางทาง → ดู wo-notes แล้วสั่งตัวใหม่ทำต่อ (ไม่ทำซ้ำ)

## WO ปัจจุบัน
| ช่อง | ค่า |
|---|---|
| WO | A4 |
| สถานะ | IN_PROGRESS |
| ผู้ทำ | Fable (oracle เขียนแล้ว) → Opus (builder) |
| ขั้นที่ถึง | 5 ก.ย. ~09:20 UTC: A3 DONE (Fable รันเอง core 64/64 · keys 51/51 · typecheck 0 · fitness 17/17 · อ่านโค้ด require/idempotency/dispatch/actor แล้ว) · **สั่ง Opus ทำ A4** (OpenAPI+docs+F13) · ถัดไป A2 (Sonnet UI) |
| commit ล่าสุดของงานนี้ | (A3 commit ถัดไป) |
| บล็อกเกอร์ | — |

## กติกาของ run นี้ (สืบทอดจาก ACCOUNT-V2-RUN + เพิ่ม)
1. **เครื่อง**: VPS 2 core · cgroup claude-remote MemoryMax 5G · **งานหนัก (tsc / next build / qc:all / agent ที่รัน tsc) ทีละ 1 อย่างทั้งเครื่อง** · sub-agent ขนานสูงสุด 1 ตัว (ตัวที่ 2 เฉพาะงานอ่าน/เอกสารที่ไม่รัน tsc) · ก่อนสั่ง build/tsc: `ps -eo rss,args --sort=-rss | head` ต้องไม่มี tsc/next/tsx หนักค้าง · build ผ่าน `scripts/with-gate-lock.sh` เสมอ · Fable เช็ค `uptime` + `free -m` ก่อนทุก WO
2. **DB**: ทุกสคริปต์ใหม่ใช้ Neon branch QC `ep-plain-art` ผ่าน `scripts/acc-v2-env.mts loadQcEnv()` (ชุด acc-v2) หรือ `scripts/qc-env-guard.mts loadLegacyQcEnv()` · **ห้าม `pnpm neon:gc`** · ห้าม `source .env` (URL มี `&`) · migration สร้างด้วย `prisma migrate diff --from-config-datasource --to-schema prisma/schema --script` โดย `DIRECT_URL` ชี้ QC แล้ว apply บน QC ก่อน · additive เท่านั้น · push ทันทีที่สร้าง (session แชทอาจสร้าง migration พร้อมกัน)
3. **ลำดับต่อ WO**: Fable เขียน oracle (ข้อสอบ) ก่อน → spawn builder (model ตามตาราง) พร้อม prompt ที่ชี้ไฟล์/สัญญา/ข้อสอบ → builder ทำ + รัน oracle/typecheck/fitness/ด่านเก่าที่เกี่ยว + เขียน `wo-notes/api-<WO>.md` **ห้าม commit** → Fable ตรวจรับเอง: รัน oracle ซ้ำ + อ่าน diff จุด security + (UI) build+ถ่ายภาพจริงดูตา + `pnpm qc:all` ก่อนปิดเฟส → Fable commit + push (`session/accounting` → ff `main`) → อัปเดตตารางนี้
4. **builder ห้าม**: commit · แตะ `.env` · รัน qc ที่โหลด `.env` · แก้ oracle ของ Fable (ยกเว้น Fable สั่ง) · เพิ่ม `any` · import prisma ตรงในโมดูล (F5) · ล้วง `account/*` จากนอกโมดูล (F2.2) · รัน tsc ซ้อนกับ next build
5. **หลักฐานที่ Fable ยอมรับ**: ผล oracle ที่ Fable รันเอง · diff ที่อ่านแล้ว · PNG ที่ดูแล้ว · curl จริงต่อ server QC (`acc-v2-serve.sh` พอร์ต 3215) — รายงานของ agent ไม่นับ
6. **session ตาย**: ledger นี้ + wo-notes อัปเดตทุกขั้น · ไฟล์ dirty สำรอง `git stash`/`/root/backups/` ก่อนงานเสี่ยง · ข้อสอบห้ามผูก "วันที่ N" (oracle เน่าตามเวลา)
7. **เจ้าของเคาะแล้ว (PLAN §8)**: REST ทำจริงตาม scope · danger เปิดได้ (scope `account.doc.void` ฯลฯ + `confirm:true` + reason) · default คีย์จากหน้าบัญชี = bundle `issue-and-collect` หมดอายุ 365 วัน · E3 ตัดออก · คู่มืออังกฤษหลัก

## ตาราง WO ทั้งหมด (สถานะ: TODO · IN_PROGRESS · REVIEW (Fable QC) · DONE · BLOCKED · SKIPPED)
| WO | ชื่อ | ผู้ทำ | สถานะ | commit | หมายเหตุ |
|---|---|---|---|---|---|
| A1 | คีย์ API มี scope/ผูกสมุด/หมดอายุ/หมุน + `ApiIdempotency` + `ActorType.API_KEY` | Opus | DONE | (HEAD) | Fable รันเอง keys 51/51 · public-api 18 · schema 61 · permissions 160 · security 298 (agent) · drift 0 · typecheck 0 · fitness 17 · migration `20260917000000_api_key_scopes` apply QC แล้ว (prod จะ apply ตอน Vercel build) · หมายเหตุ: `account.approve.limit` = ค่าตั้ง ไม่ใช่ scope (`NON_API_SCOPE_KEYS`) · หนี้: คีย์บัญชียังเรียก `/api/v1/*` ของแพลตฟอร์มได้เหมือนคีย์เดิม (ตัดสินใน A3/B) |
| A2 | หน้าตั้งค่า "แอปภายนอก/API" ในบัญชี: สร้างคีย์ผูกสมุด + bundle/scope + หมดอายุ + หมุน · `/app/settings/api` แสดง scope | Sonnet | TODO | — | ภาพจริงเทียบ g14 |
| A3 | `account/api/`: actor · `requireAccountApi` · envelope/error/requestId · idempotency · registry · catch-all route · rate limit DB | Opus | DONE | (HEAD) | Fable รันเอง core 64/64 · keys 51 · public-api 18 · chat-api-v1 89 (agent) · typecheck 0 · fitness 17 · ไฟล์ `api/{actor,respond,op,registry,require,idempotency,dispatch}.ts` + `ops/core.ts` + route catch-all · หนี้: แถว idempotency status null ค้าง (process ตาย) บล็อก key นั้น 24 ชม. → เพิ่ม stale>5 นาที=จองใหม่ ใน B/C · danger op จริงต้องมี `reason` ใน schema |
| A4 | generator OpenAPI + `/api/v1/account/openapi.json` + `gen-account-api-docs.mts` + fitness F13 (ทุก op มี test id) | Opus | IN_PROGRESS | — | oracle `qc-account-api-openapi.mts` (เขียนแล้ว) |
| B1 | READ เอกสาร: list/get/print/tags/favorites/attachments/parse/recurring/dashboard/overview | Sonnet | TODO | — | เทียบ `acc-v2-expected.json` |
| B2 | READ ผู้ติดต่อ/สินค้า/หน่วย/กลุ่ม/merge-candidates/DBD/link-suggestions | Sonnet | TODO | — | |
| B3 | READ การเงิน: finance-accounts/statement/overview/calendar/payment-requests/reconcile/cheques/wht | Sonnet | TODO | — | |
| B4 | READ บัญชี: chart/journal/general-ledger(ย้ายจาก page → service)/รายงาน 6 ตัว JSON+CSV/periods/assets/audit/settings/policy/links/files/inbox/help | Opus | TODO | — | เทียบ `qc-account-cpa` |
| C1 | WRITE เอกสาร: create/patch/delete/issue/convert/respond/deposits/public-link/tags/attachments/email/remind/approval/receive | Opus | TODO | — | E2E QT→IV→RE+TX ผ่าน REST |
| C2 | WRITE payments/void/refund-deposit/payment-requests/group docs | Opus | TODO | — | row-lock ยิงพร้อมกัน |
| C3 | WRITE contacts/products/units/categories/bundle/opening-lots/stock-documents/link-inventory/contact-groups | Sonnet | TODO | — | |
| C4 | webhook events ชุดแรก (issued/voided/quotation/payment.voided/payment_request/contact/product) | Opus | TODO | — | event PENDING = 0 |
| D1 | WRITE finance-accounts/transfers/petty cash/cheques/WHT | Opus | TODO | — | |
| D2 | WRITE journal/chart/mappings/periods/assets | Opus | TODO | — | |
| D3 | WRITE reconcile/recurring/import/files/inbox/reports-email | Sonnet | TODO | — | |
| D4 | WRITE settings/policy/permissions/links/webhooks CRUD + events ที่เหลือ | Sonnet | TODO | — | |
| E1 | สกิล AI `account` 30 tools จากทะเบียน + proposal kinds + dispatch | Opus | TODO | — | MockProvider E2E |
| E2 | `/api/v1/ai/skills/account` + tools route + golden cases 12 + persona นักบัญชี | Opus | TODO | — | |
| F1 | `/developers/account` + `.md` + `/developers` เพิ่มหมวดบัญชี | Sonnet | TODO | — | |
| F2 | `.claude/skills/shark-account-api/` + ทดสอบ agent อ่านสกิลทำ 5 งานเอง | Sonnet+Fable | TODO | — | |
| F3 | อัปเดต docs (07_API · 12-account §5 · sds/account · AI_LAYER) + HANDOVER | Sonnet | TODO | — | |
| F4 | verify prod + แจ้งเจ้าของ | Fable | TODO | — | |

## สเปคต่อ WO (สัญญาที่ builder ต้องทำตามเป๊ะ — oracle ตรวจตามนี้)

### A1 — คีย์ API (schema + service)
**schema (additive)** `prisma/schema/api.prisma`:
- `ApiKey` เพิ่ม `scopesJson Json @default("[]")` · `systemId String?` · `expiresAt DateTime?` · `createdById String?` · `rotatedFromId String?` · `@@index([tenantId, systemId])`
- ใหม่ `model ApiIdempotency { id, tenantId, keyId, idemKey, requestHash, status Int?, responseJson Json?, createdAt, expiresAt · @@unique([keyId, idemKey]) · @@index([expiresAt]) }` + ลงทะเบียน `scope.ts` axis tenant
- `core.prisma` `enum ActorType` เพิ่ม `API_KEY`
- migration `20260917000000_api_key_scopes` (สร้างจาก migrate diff บน QC · apply QC · `prisma generate`)
**service** `src/lib/api-keys/service.ts` (เพิ่ม ไม่เปลี่ยนสัญญาเดิม):
- `createApiKey(ctx, name, opts?: { scopes?: string[]; systemId?: string | null; expiresAt?: Date | null; createdById?: string | null })` — scopes ทุกตัวต้องเป็น permission key จริง (`isPermissionKey`) ไม่งั้น throw ไทย · systemId ถ้าให้มาต้องเป็น `AppSystem` ของ tenant นี้ (ตรวจผ่าน tenantDb) ไม่งั้น throw ไทย · expiresAt อดีต → throw
- `verifyApiKey(raw)` → `{ tenantId, keyId, scopes: string[], systemId: string | null } | null` · หมดอายุ → null (ไม่แตะ lastUsedAt)
- `rotateApiKey(ctx, keyId, opts?: { createdById? })` → `{ id, rawKey, prefix }` ใหม่ที่คัดลอก name/scopes/systemId/expiresAt (ถ้า expiresAt เดิมผ่านแล้ว/ไม่มี → ตั้งใหม่ +365 วัน) + เพิกถอนตัวเก่า **ใน tx เดียว** + `rotatedFromId` · เพิกถอนแล้ว/ไม่มี → throw ไทย
- `listApiKeys(ctx)` เพิ่ม `scopes, systemId, expiresAt, rotatedFromId` (ยังไม่มี keyHash)
- ใหม่ `src/lib/api-keys/scopes.ts`: `ACCOUNT_SCOPE_KEYS` (= permission keys module `account` จาก `PERMISSIONS`) · `API_SCOPE_BUNDLES: { id, label(TH), summary(EN), scopes[] }[]` 5 ชุด: `read-only` (doc.view · report.view · journal.view · tax.view) · `issue-and-collect` (read-only + doc.create · doc.issue · doc.public_link · payment.record · contact.manage · product.manage · document.manage) · `accountant` (issue-and-collect + journal.adjust · period.close · chart.manage · mapping.manage · wht.manage · asset.manage · asset.register · asset.dispose · cheque.manage · cheque.deposit · cheque.clear · cheque.bounce · finance.manage · reconcile) · `danger` (doc.void · payment.void · period.reopen · wht.unmark · contact.merge · cheque.void · asset.writeoff · doc.approve) · `settings` (settings.manage · import) · `DEFAULT_BUNDLE_ID = "issue-and-collect"` · `DEFAULT_KEY_TTL_DAYS = 365` · `expandBundles(ids) → scopes[]` · `bundlesCovering(scopes) → ids[]`
- `route-auth.ts authenticateApiRequest` คืน `scopes` + `systemId` + `expiresAt` เพิ่ม (พฤติกรรม 401/429 เดิม)
- `access.ts writeAudit` รับ `actorType?: ActorType` (default USER)
**oracle** `scripts/qc-account-api-keys.mts` (Fable) · ด่านเก่าที่ต้องเขียว: `qc-public-api` · `qc-acc-v2-permissions` · `qc-acc-v2-schema` · `qc-acc-v2-security` · `fitness` · `typecheck` · `drift` (QC) = 0

### A2 — หน้าตั้งค่าคีย์ (UI)
- `ConnectionsPanel.tsx` §"แอปภายนอก / API": ฟอร์มสร้างคีย์ = ชื่อ · bundle (radio 5 ชุด default issue-and-collect · แสดง scope รายตัวแบบกางได้ + ติ๊กเพิ่ม/ลดรายตัว) · หมดอายุ (365 วัน default · เลือก 30/90/365/ไม่หมดอายุ) · **ผูกสมุดบัญชีเล่มนี้เสมอ** (systemId ของหน้า) · ตารางคีย์แสดง prefix/ชื่อ/scope (ป้าย bundle) /สมุด/หมดอายุ/ใช้ล่าสุด + ปุ่ม หมุน · เพิกถอน · rawKey โชว์ครั้งเดียว (แบบเดิม)
- `/app/settings/api` (ระดับร้าน): เพิ่มคอลัมน์ scope/หมดอายุ + หมุน · สร้างคีย์ที่นี่ = scopes [] (พฤติกรรมเดิม) + ลิงก์ "ต้องการคีย์บัญชี? ไปที่ ตั้งค่าบัญชี › การเชื่อมต่อ"
- action ใน `connections-actions.ts` `createApiKeyAction` รับ bundle/scopes/ttl · `rotateApiKeyAction` ใหม่ · ตรวจ `assertCan api.key.create` + `account.settings.manage`
- **สัญญา UI ที่ oracle ยึด** (`scripts/qc-account-api-settings.mts` · เบราว์เซอร์จริงบน :3215 · Fable เขียนแล้ว): data-testid `api-key-name` · `api-key-bundle-<bundleId>` (radio 5 ตัว · default issue-and-collect · เปลี่ยน radio = ติ๊ก scope ใหม่ตามชุด) · `api-key-ttl` (select ค่า "30"/"90"/"365"/"0"=ไม่หมดอายุ · default "365") · `api-key-scopes-toggle` (ปุ่มกาง/หุบรายการ scope) · `api-key-scope-<permissionKey>` (checkbox รายตัว · scope ที่ส่ง = ชุดที่ติ๊กจริง) · `api-key-submit` · `api-key-new` (rawKey โชว์ครั้งเดียว · รีโหลดหาย) · แถวตาราง `api-key-row-<id>` + `api-key-row-bundle-<id>` (ป้ายไทยของ bundle ที่ตรงพอดี · ถ้ากำหนดเองให้แสดง "กำหนดเอง (n สิทธิ์)") + `api-key-row-expires-<id>` (วันที่ไทย หรือ "ไม่หมดอายุ") + `api-key-row-system-<id>` (ชื่อสมุด) + `api-key-rotate-<id>` (ไม่มีเมื่อเพิกถอนแล้ว · กดแล้ว rawKey ใหม่โผล่ใน `api-key-new`) + `api-key-revoke-<id>` · แถวที่เพิกถอนมีคำว่า "เพิกถอนแล้ว" · มือถือ 390 ไม่ล้น + ปุ่ม ≥40px · หน้า `/app/settings/api`: `platform-api-key-account-link` + `api-key-row-scopes-<id>` (คอลัมน์ขอบเขตแสดง bundle/จำนวน scope)
- action: `createApiKeyAction(fd)` รับ `name` · `bundle` · `scope` (หลายค่า) · `ttlDays` · `systemId` → ใช้ `createApiKey(ctx, name, { scopes, systemId, expiresAt, createdById: userId })` คืน `{ ok, rawKey }` · `rotateApiKeyAction(fd)` รับ `id`,`systemId` → `rotateApiKey` คืน `{ ok, rawKey }` · ทั้งคู่ `assertCan api.key.create` + `assertAccountCan account.settings.manage`
- visual: เพิ่ม key `"api-A2"` ใน `scripts/visual-acc-v2.mts` (desktop+mobile ของ `?s=api` + สถานะกาง scope) · Fable ดูภาพจริง
- oracle: `qc-account-api-settings.mts` (SKIP ถ้าไม่มี server) + `qc-acc-v2-permissions` + `qc-public-api` + fitness/typecheck

### A3 — แกน REST (`src/lib/modules/account/api/`)
- `actor.ts`: `type ApiActor = { kind: "apikey"; tenantId; systemId; keyId; keyName; scopes; membership: MembershipCtx }` · `membershipFromScopes(scopes) = { role: "STAFF", unitAccess: [], permissions: Object.fromEntries(scopes.map(s=>[s,true])) }` · `actorCan(actor, action)` ใช้ `accountCan`-เทียบเท่า (IMPLIES) โดยไม่ต้องมี session
- `require.ts`: `requireAccountApi(req, op) → { ok: true, actor, requestId } | { ok: false, response }` ลำดับ: Bearer → verify (401 `unauthorized`) → หมดอายุ (401 `key_expired`) → systemId: จากคีย์ · หรือ header `X-Shark-System` ถ้าคีย์ไม่ผูก · ต้องเป็น AppSystem type ACCOUNT ของ tenant (403 `system_mismatch` / 400 `system_required`) → rate limit DB ต่อคีย์ตาม `op.kind` (read 300/นาที · write 60/นาที · report 30/นาที) (429 + Retry-After + `X-RateLimit-Remaining`) → scope (403 `scope_missing` + `hint` ชื่อ scope)
- `respond.ts`: `ok(data, {page?}, requestId)` · `fail(code, message_th, message_en, status, {hint?})` · `mapError(e)` จาก error ไทยของ service → code (`period_locked` เมื่อข้อความมี "ล็อก"/"ปิดงวด" · `state_conflict` เมื่อ "ร่าง"/"สถานะ" · `duplicate` เมื่อ "ซ้ำ" · `validation` zod · default `unprocessable` 422) · message_th ผ่าน `errors.ts safeReason` · requestId `req_` + 16 hex · header `X-Request-Id`
- `idempotency.ts`: `withIdempotency(actor, req, run)` — write/danger ต้องมี `Idempotency-Key` (400 `idempotency_required` — ยกเว้น op ที่ตั้ง `idempotent: "natural"`) · hash = sha256(method+path+body) · ซ้ำ+hash เดิม → คืน response เดิม (header `Idempotent-Replayed: true`) · ซ้ำ+hash ต่าง → 409 `idempotency_conflict` · ระหว่างทำอยู่ (status null) → 409 `idempotency_in_progress` · TTL 24 ชม. · แถวสร้างก่อนรัน (INSERT … ON CONFLICT DO NOTHING) เพื่อกัน 2 คำขอพร้อมกัน
- `registry.ts`: `type ApiOp = { id, method, path (เช่น "/documents/{id}/issue"), kind: "read"|"write"|"danger", action (permission key), rate?: "read"|"write"|"report", summary (EN), label (TH), input?: ZodType (body หรือ query), output?: ZodType, tool?: { name, risk?: "DESTRUCTIVE" }, test: string (id ข้อสอบ), handler(ctx: { actor, params, input, requestId }) → Promise<unknown> }` · `registerOps(ops)` · `matchOp(method, segments)` (path template → params) · `ACCOUNT_OPS` รวมจาก `ops/*.ts`
- `src/app/api/v1/account/[...path]/route.ts`: export GET/POST/PATCH/PUT/DELETE → `dispatch(req, await params)` → matchOp → requireAccountApi → parse input (zod · `additionalProperties:false`) → withIdempotency (write/danger) → handler → ok/fail · danger: body ต้องมี `confirm: true` (409 `confirm_required`) + `reason` ≥5 (422) · ทุก write: `writeAudit({ actorType: "API_KEY", actorId: keyId, action: op.action, after: { keyName, opId, … } })` (ทำใน dispatch กลาง) · op ยังไม่มี → 404 `not_found`
- op ตัวอย่างใน A3 เพื่อทดสอบแกน (ไฟล์ `api/ops/core.ts` · คงไว้ถาวรเป็น smoke): `ping` = `GET /ping` (read · `account.doc.view` · คืน `{ ok: true, systemId, keyName }`) · `echo-by-id` = `GET /echo/{id}` (read · doc.view · คืน `{ id }` จาก params) · `echo` = `POST /echo` (write · `account.doc.create` · input zod strict `{ text: string 1..100, amountSatang?: int ≥0 }` · คืน `{ echo: input, nonce: random hex }`) · `danger-echo` = `POST /danger-echo` (danger · `account.doc.void` · input `{ reason }` · คืน `{ reason }`)
- **รายละเอียดที่ oracle ยึด**: rate limit key `acct:api:<kind>:<keyId>` บน `ChatRateBucket` ผ่าน `checkRateLimitDb` (read 300/นาที · write 60/นาที · report 30/นาที) · 429 มี `Retry-After` · 200 มี `X-RateLimit-Remaining` · `X-Shark-System` header: คีย์ผูก systemId แล้วส่ง header ต่างจากที่ผูก → 403 `system_mismatch` (ส่งตรงกันได้) · คีย์ scopes [] = ไม่มีสิทธิ์บัญชี (403 `scope_missing`) · scope ผ่าน IMPLIES ของ `access.ts` (doc.create ⇒ doc.view) · error codes: `unauthorized 401` `key_expired 401` `system_required 400` `system_mismatch 403` `scope_missing 403 (+hint scope)` `invalid_json 400` `validation 422 (+details[] path/message)` `idempotency_required 400` `idempotency_conflict 409` `idempotency_in_progress 409` `confirm_required 409` `not_found 404` `method_not_allowed 405 (+header Allow)` `rate_limited 429` `period_locked 409` `state_conflict 409` `duplicate 409` `forbidden 403` `unprocessable 422` · `mapError(e)` export จาก `respond.ts` — จับคำไทย: "ปิดแล้ว"/"ปิดงวด"/"ล็อก" → period_locked · "ร่าง"/"สถานะ" → state_conflict · "ซ้ำ" → duplicate · ขึ้นต้น "ไม่พบ" → not_found · "ไม่มีสิทธิ์" → forbidden · ZodError → validation · อื่น ๆ/อังกฤษ → unprocessable + message_th กลาง (ห้ามรั่วข้อความดิบ) · replay ของ idempotency คืน status+body เดิม + header `Idempotent-Replayed: true` · idempotency แยกต่อ keyId · read ไม่เก็บแถว idempotency · audit เฉพาะ write/danger ที่สำเร็จ (ไม่นับ replay) `after = { keyName, opId, requestId, ...(danger: reason) }` · trailing slash จับคู่ได้
- oracle `scripts/qc-account-api-core.mts` (Fable · เขียนแล้ว 5 ก.ย.) · ด่านเก่า: `qc-public-api` · `qc-chat-api-v1` · `qc-account-api-keys` · `fitness` · `typecheck`

### A4 — generator + docs pipeline
- `api/openapi.ts`: `buildOpenApi(ops) → OpenAPI 3.1` (zod → JSON Schema ด้วย `zod-to-json-schema` หรือ `z.toJSONSchema` ถ้า zod 4 · เช็ก version ใน package.json) · security scheme bearer · `x-shark-kind` · `x-shark-scope` · `x-shark-tool` ต่อ op · error schema กลาง · servers `https://shark.in.th/api/v1/account`
- route `GET /api/v1/account/openapi.json` (ไม่ต้องใช้คีย์ · cache 5 นาที)
- `scripts/gen-account-api-docs.mts` → `docs/api/ACCOUNT-API.md` (EN · หมวดตาม §4 · ต่อ op: method+path · scope · kind · input/output fields · example) · idempotent · fitness **F13**: (1) ทุก op มี `test` และ id นั้นปรากฏในสคริปต์ `scripts/qc-account-api-*.mts` (2) `docs/api/ACCOUNT-API.md` ตรงกับ generate (diff = 0) (3) ทุก op ที่มี `tool` อยู่ในสกิล `account` (เมื่อ E1 มาถึง)
- **สัญญาที่ oracle ยึด** (`scripts/qc-account-api-openapi.mts` · Fable เขียนแล้ว): `buildOpenApi(ops)` → `openapi: "3.1.x"` · `info.title/version/description` (EN · ต้องพูดถึง satang · `Idempotency-Key` · `X-Shark-System`) · `servers[0].url = https://shark.in.th/api/v1/account` · `components.securitySchemes.bearer {type:http, scheme:bearer}` + `security: [{bearer:[]}]` · `components.schemas.Error` (error.code enum ครบ 19 code · message_th · message_en · hint · details · requestId) · ต่อ op: `paths[path][method]` = `{ operationId: id, summary(EN), description(label TH ได้), "x-shark-kind", "x-shark-scope", "x-shark-tool"?, security: [{bearer:[]}], parameters: [path params required · header X-Shark-System optional (ทุก op) · header Idempotency-Key required (write/danger)], requestBody (write/danger: zod→JSON Schema · `additionalProperties:false` · danger เพิ่ม `confirm` (boolean enum [true]) + `reason` (string minLength 5) ใน required), responses: 200 {data schema} · 401 · 403 · 404 · 422 · 429 (+409 สำหรับ danger/write) อ้าง `#/components/schemas/Error` }` · spec ต้อง serializable ไม่มี handler/cuid
- route `src/app/api/v1/account/openapi.json/route.ts` (GET · ไม่ต้องใช้คีย์ · `Cache-Control: public, max-age=300` · body = buildOpenApi เดียวกัน)
- `scripts/gen-account-api-docs.mts` → เขียน `docs/api/ACCOUNT-API.md` (EN หลัก · 5 บรรทัดแรกไม่มีไทย · มีส่วน Glossary ไทย · ทุก op มีบรรทัด `METHOD path` + scope + kind · มีหัวข้อ Error codes ครบ) · รองรับ `--check` (exit 0 = ไฟล์ตรง · 1 = stale)
- fitness เพิ่มบล็อก F13 (`chk("F13.1", ...)`): ทุก op มี `test` ที่ปรากฏเป็นสตริง `"<id>"` ใน `scripts/qc-account-api-*.mts` · `F13.2`: docs ตรง generator (`--check`) · `F13.3`: op ที่มี `tool` ต้องมีชื่อใน `src/lib/ai/skills.ts` (ตอนนี้ vacuous)
- oracle: `qc-account-api-openapi` + `qc-account-api-core` + `fitness`

### B1–B4 (READ) · C1–C4 · D1–D4 (WRITE) — สเปคละเอียดเขียนตอนถึง (อ้าง PLAN §4 แถวต่อแถว) · ทุก op: id/path/scope ตามตาราง §4 · oracle เทียบเฉลย `acc-v2-expected.json` + `qc-account-cpa`
### E1–E2 · F1–F4 — ตาม PLAN §3 / §7

## บันทึกเหตุการณ์ (ล่าสุดบนสุด)
- 5 ก.ย. ~09:20 UTC — A3 ปิด (Opus 16 นาที · ผ่านรอบเดียว) · เริ่ม A4 · ความคืบหน้า 2/24
- 5 ก.ย. ~08:35 UTC — A1 ปิด (Opus 12 นาที · Fable ตรวจ diff+รัน oracle ซ้ำ) · เริ่ม A3
- 5 ก.ย. ~07:30 UTC — เริ่ม run · เครื่อง: load 1.2 · RAM ว่าง 5.4G · gate ว่าง · Neon QC `ep-plain-art` seed-check 279/279 · เจ้าของเคาะ §8 ครบ · push แผนขึ้น main `43cdb2a`

## ของที่ต้องส่งต่อ session อื่น / รอเจ้าของ
- 🔑 ของเดิม (ไม่บล็อก): BEAM_* · DBD_API_KEY · inbox@ · ลบ tenant ทดสอบ prod 3 ราย
- 📨 session แชท: migration `20260917000000_api_key_scopes` จะแตะ `api.prisma`/`core.prisma` (enum ActorType) — ถ้าสร้าง migration พร้อมกันให้ rebase ลำดับ
