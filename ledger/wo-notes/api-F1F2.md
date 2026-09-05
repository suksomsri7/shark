# WO F1 + F2 — public developer page + Claude skill for the accounting API

Builder: Sonnet · session/accounting worktree · HEAD 8e4909c ก่อนเริ่ม.

## ไฟล์ที่เพิ่ม/แก้

**F1**
- `src/app/developers/account/page.tsx` — ใหม่ · server component, no client JS, no auth.
  Render จาก `buildOpenApi(ACCOUNT_OPS)` (import ตรง `@/lib/modules/account/api/openapi`
  + `@/lib/modules/account/api/registry`) — ไม่มี array endpoint เขียนมือ. หัวข้อ: Auth &
  scopes (ตาราง 5 bundle จาก `API_SCOPE_BUNDLES`) · Conventions · Error codes (จาก
  `API_ERROR_CODES` + คำอธิบายสั้นในไฟล์) · Operations (จัดกลุ่ม kind→domain จาก `op.id`
  prefix, data-driven จาก `ACCOUNT_OPS` ทั้งหมด, `<details>` ซ้อน) · Recipes 8 เรื่อง (curl
  จริง) · AI agents · Webhooks (จาก `WEBHOOK_EVENTS` filter `account.*`) · Thai glossary ·
  ลิงก์ `/api/v1/account/openapi.json` + `/developers/account.md`.
- `src/app/developers/account.md/route.ts` — ใหม่ · โฟลเดอร์ `account.md` เป็น static
  segment (จุดเป็นตัวอักษรธรรมดา ไม่ใช่ syntax พิเศษของ Next — เทคนิคเดียวกับ
  `openapi.json/route.ts` ที่มีอยู่แล้ว). `GET` อ่าน `docs/api/ACCOUNT-API.md` ที่ดิสก์ตรง ๆ
  ด้วย `readFile` → `text/markdown; charset=utf-8` → byte-identical เสมอ (แหล่งเดียว ไม่มี
  renderer ซ้ำสอง).
- `src/app/developers/page.tsx` — แก้ · เพิ่มกล่อง "Accounting API — เชื่อมโมดูลบัญชี"
  หลัง header ก่อนหัวข้อ 1 เดิม พร้อมลิงก์ `/developers/account` + อธิบาย scope (ไม่แตะ
  เนื้อหาเดิมของ platform API ด้านล่าง — ยัง PA-3.1/PA-3.2 เขียวเหมือนเดิม).

**F2**
- `.claude/skills/shark-account-api/SKILL.md` — ใหม่ · frontmatter `name/description` ·
  English หลัก (Thai ตัวแรกอยู่บรรทัด 126 ไกลจากเกณฑ์ 60 มาก) · หัวข้อ When to use ·
  Setup · Conventions · Safety (confirm+reason, ห้าม void/reopen/merge โดยไม่ถาม, scope
  เป็นเพดาน) · Workflow map (ตาราง task→endpoint) · Webhook verify · Glossary ไทยท้ายไฟล์.
- `.claude/skills/shark-account-api/references/endpoints.md` — **generate** โดย
  `scripts/gen-account-api-docs.mts` (ฟังก์ชันใหม่ `renderEndpointsReference()`) — ตาราง
  ล้วน `op id | METHOD path | scope | AI tool` จัดกลุ่มตาม kind เดียวกับเอกสารหลัก.
- `.claude/skills/shark-account-api/references/recipes.md` — เขียนมือ (prose+curl ไม่ใช่
  ทะเบียน) 8 recipes ครบทุก keyword ที่ oracle เช็ค (quotation/deposit/expense/purchase
  order/PromptPay/reconcil/close/report) — curl ทุกคำสั่งใช้ path/field จริงจากทะเบียน
  (ไม่มี endpoint ที่เสกขึ้นเอง — ตรวจไขว้กับ `ops/*.ts` ทุกตัวก่อนเขียน).
- `.claude/skills/shark-account-api/references/state-machines.md` — เขียนมือ อ้าง
  `AccountDocType`/`AccountDocStatus` จริงจาก `prisma/schema/account.prisma`.
- คัดลอกทั้งโฟลเดอร์ไป `/root/.claude/skills/shark-account-api/` ด้วย `rsync -a` —
  `diff -rq` ยืนยันเหมือนกันทุกไบต์.
- `scripts/gen-account-api-docs.mts` — แก้ · เพิ่ม `renderEndpointsReference()` +
  `SKILL_ENDPOINTS_PATH` const + CLI เขียน/เช็กทั้งสองไฟล์พร้อมกัน (`docs/api/ACCOUNT-API.md`
  และ `.claude/skills/shark-account-api/references/endpoints.md`) — `--check` แดงแยกบอกว่า
  ไฟล์ไหนเก่า.

## การ generate (ห้ามเขียนมือ)

`renderDocs()` (เดิม) และ `renderEndpointsReference()` (ใหม่) ทั้งคู่รับ `ACCOUNT_OPS`
เดียวกัน — เพิ่ม/ลบ/แก้ op ที่ไฟล์ `ops/*.ts` แล้วรัน
`pnpm exec tsx scripts/gen-account-api-docs.mts` ครั้งเดียว ได้ทั้ง
`docs/api/ACCOUNT-API.md` (คู่มือเต็ม) และ `.claude/skills/shark-account-api/references/endpoints.md`
(ตารางย่อของสกิล) พร้อมกัน — `--check` ครอบทั้งสองไฟล์ (แดงถ้าไฟล์ใดไฟล์หนึ่งไม่ตรง).
หน้า `/developers/account` และ route `/developers/account.md` ไม่มี state ของตัวเอง —
หน้าเรียก `buildOpenApi(ACCOUNT_OPS)` สด ๆ ทุก request, route อ่านไฟล์ที่ generate ไว้แล้ว
ตรง ๆ ทุก request. `recipes.md`/`state-machines.md`/หัวข้อ Recipes บนหน้าเว็บ **ไม่ได้
generate** (เป็น prose ที่ต้องเขียนให้ตรงทะเบียนเอง) — ตรวจไขว้ทุก op id/path/field กับ
`ops/*.ts` ก่อนใส่ curl จริงทุกคำสั่ง ไม่มีการเสก endpoint ขึ้นมาเอง.

## 8 recipes (ใช้ทั้งบนหน้าเว็บและใน skill — op ids จริงจากทะเบียน)

1. **Quotation → Invoice → Receipt** — `documents.create` (QUOTATION) → `documents.issue`
   → `documents.respond` → `documents.convert` (toType INVOICE) → `documents.issue` →
   `payments.record` → `documents.convert` (toType RECEIPT) → `documents.issue`.
2. **Deposit** — `documents.create` (DEPOSIT_RECEIPT) → `documents.issue` →
   `payments.record` → `documents.set-deposits` (บนใบแจ้งหนี้).
3. **Expense + WHT** — `documents.create` (EXPENSE) → `documents.issue` →
   `payments.record` (`whtIncomeType: PROFESSIONAL`, `whtRateBp`, `whtAmountSatang`).
4. **Purchase Order → Purchase** — `documents.create` (PURCHASE_ORDER) → `documents.issue`
   (→ AWAITING_APPROVAL) → `documents.approve` → `documents.convert` (ไม่ต้องส่ง toType) →
   `documents.issue`.
5. **PromptPay** — `payment-requests.create` → `payment-requests.confirm`.
6. **Bank reconciliation** — `reconcile.channels` → `reconcile.import-statement` →
   `reconcile.auto-match` → `reconcile.match` → `reconcile.confirm`.
7. **Period close** — `periods.checklist` → `periods.close`.
8. **Reports/dashboard** — `dashboard.get` → `reports.profit-loss` → `reports.trial-balance`
   (CSV ผ่าน `Accept: text/csv`).

## หมายเหตุ/ของแปลกที่เจอ

- `scripts/f4-prod-key.mts` (untracked, mtime 16:37) เป็นไฟล์ของ Fable เอง (คอมเมนต์หัวไฟล์
  บอกชัด "F4 (Fable)") ที่ปรากฏขึ้นระหว่างที่ผมทำงาน — มัน type error จริง (`ttlDays` ไม่มีใน
  `CreateApiKeyOptions` — สัญญา A1 ใช้ `expiresAt: Date | null` ไม่ใช่ `ttlDays`) และทำให้
  `pnpm typecheck` เต็มชุดแดง 1 บรรทัด **ไม่เกี่ยวกับ F1/F2**. ผมไม่แตะไฟล์นี้ (ไม่ใช่ของ WO
  นี้ และอาจกำลังแก้อยู่คนละ session) — ตรวจแยกแล้วว่างานของผมเองไม่มี error (ย้ายไฟล์ออก
  ชั่วคราว รัน typecheck ผ่าน 0 แล้วย้ายกลับที่เดิม ไม่ได้ลบ/แก้เนื้อหา). ขอให้ Fable ทราบ
  ก่อนปิด WO — อาจต้องแก้เป็น `expiresAt: new Date(Date.now()+86400000)` แทน `ttlDays: 1`.

## คำสั่งที่รัน + ผลลัพธ์สุดท้าย

```
$ pnpm exec tsx scripts/gen-account-api-docs.mts
✅ เขียน docs/api/ACCOUNT-API.md + skill endpoints.md (199 op · 179490 ไบต์ / 17855 ไบต์)

$ pnpm exec tsx scripts/qc-account-api-docs.mts   (env .env.qc: DATABASE_URL/DIRECT_URL)
ผ่าน 17/17
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":17,"passed":17,"findings":[]}

$ pnpm exec tsx scripts/qc-account-api-openapi.mts   (env .env.qc)
ผ่าน 26/26
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":26,"passed":26,"findings":[]}

$ pnpm exec tsx scripts/gen-account-api-docs.mts --check
✅ docs/api/ACCOUNT-API.md + skill endpoints.md ตรงกับทะเบียน (199 op)

$ NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck
(มี scripts/f4-prod-key.mts ของ Fable ค้างอยู่ใน tree → 1 error ไม่เกี่ยวกับงานนี้ ดูหมายเหตุ
ด้านบน; ย้ายไฟล์นั้นออกชั่วคราวเพื่อยืนยันงาน F1/F2 เองสะอาด แล้ววางกลับที่เดิมทันที)
ผลของงาน F1/F2 เอง: 0 errors

$ pnpm exec tsx scripts/qc-public-api.mts   (env .env.qc — courtesy check เพราะแก้ developers/page.tsx)
ผ่าน 18/18

$ pnpm fitness   (env .env.qc)
ผ่าน 20/20 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

$ env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness
ผ่าน 20/20 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
```

ทะเบียน `ACCOUNT_OPS` ไม่เปลี่ยน (ยังคง 199 op / 36 tool) — WO นี้ไม่แตะ `ops/*.ts` เลย
ตามสัญญา F1/F2 (เอกสาร/สกิล/หน้าเว็บเท่านั้น).

## JSON_SUMMARY

JSON_SUMMARY {"wo":"F1F2","status":"DONE_PENDING_FABLE_REVIEW","docs":{"total":17,"passed":17,"findings":[]},"openapi":{"total":26,"passed":26,"findings":[]},"gen_check":"pass","typecheck_own_work":0,"typecheck_note":"scripts/f4-prod-key.mts (Fable's own untracked WIP, unrelated to F1/F2) has 1 pre-existing type error blocking the full-repo tsc run — verified separately that F1/F2 files alone are clean","fitness_with_env":{"total":20,"passed":20},"fitness_without_env":{"total":20,"passed":20}}

ต้นไม้ปล่อยไว้แบบ dirty ตามกติกา (ไม่ commit) — ไฟล์ `scripts/f4-prod-key.mts` เป็นของเดิม
ที่ผมไม่ได้สร้าง/แก้ ยังอยู่ในสภาพเดิมตอนที่ผมเจอมัน.
