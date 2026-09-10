# M1.11 — REST/AI ชุดแรกของระบบสมาชิก v2 (builder notes)

> ข้อสอบ: `bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.11.mts` → **25/26**
> ค้างข้อเดียว = `M1.11-S5.2` (ภาพ + PARITY) ซึ่งเป็นของ Fable (builder ห้ามเปิด QC server เอง)

---

## 1. ผลข้อสอบ

| ชุด | ผล |
|---|---|
| `qc-member-m1.11.mts` | **25/26** · ค้าง `S5.2` (ภาพ `settings-api-owner-desktop.png` + `PARITY: ผ่าน` — ของ Fable) |
| `tsc --noEmit` | ✅ ผ่าน |
| `fitness.mts` (มี env) | ✅ 26/26 |
| `fitness.mts` (`env -u DATABASE_URL -u DIRECT_URL`) | ✅ 26/26 — **เดิมพังอยู่ก่อนใบนี้** ดู §4.1 |
| `gen-member-api-docs.mts --check` | ✅ exit 0 (68 op) |
| regression `qc-member-m1.5.mts` | ✅ 20/20 |
| regression `qc-member-m1.4.mts` | ✅ 37/37 |

**ตรวจภาพ** (Fable · 10 ก.ย. ~19:10 UTC · build #19) — ภาพ 27 ครึ่งขวา ↔ `settings-api-owner-desktop.png`: การ์ดคีย์ API (ชื่อ/ชุดสิทธิ์/ใช้ล่าสุด/หมดอายุ + ปุ่มสร้างคีย์) ✓ · กล่อง curl ดำ 3 ตัวอย่าง + ลิงก์ /developers/member · openapi.json · member.md ✓ · ตาราง tool ในสกิล members (Tool/Method/ชนิด/สิทธิ์ · 8 จาก 22) ✓ · Webhook events 8 ตัว + ลิงก์ตั้งค่า ✓ · thana → 404 ✓ · ครึ่งซ้าย (ผู้ช่วย AI + proposal) = M3.10

PARITY: ผ่าน

---

## 2. ไฟล์ที่ส่งมอบ

### ทะเบียน + แกน REST ของโมดูล (ใหม่)
- `src/lib/modules/member/api/registry.ts` — `MEMBER_OPS` **68 op** · `matchOp` / `allowedMethods` (ห่อ `matchOpIn`/`allowedMethodsIn` ของแกนกลาง) · `memberToolOps()`
- `src/lib/modules/member/api/op.ts` — `defineMemberOp` (เติม `module: "member"` · `auditAction: member.api.<id>` · **`auditTarget` ปริยาย = สมาชิกที่ถูกแตะ**)
- `src/lib/modules/member/api/actor.ts` — scope ของคีย์ → `MemberActor` (`apiRole` READONLY/OPERATE/ADMIN · role STAFF/MANAGER · unitAccess `["*"]`) · `memberScopesCan` · `memberCtxOf` · `memberActorOf`
- `src/lib/modules/member/api/config.ts` — `ApiModuleConfig` ของโมดูล + `MEMBER_RATE_LIMITS` (read/write 600, report 60 ต่อนาที ตาม MEMBER-API §1)
- `src/lib/modules/member/api/dispatch.ts` — ห่อ `coreDispatch`
- `src/lib/modules/member/api/serialize.ts` — `jsonSafe()` (Date→ISO · ตัด tenantId/systemId) · `maskExternalId()` · `identityRow()`
- `src/lib/modules/member/api/openapi.ts` — `buildOpenApi` + `MEMBER_DOC_INFO` (Conventions 16 ข้อ) + `memberWebhookEvents()`
- `src/lib/modules/member/api/tools.ts` — `runMemberTool` · `dispatchMemberKind` · `memberKindAccess` · `memberKindOf` · `memberDestructiveKinds` · `memberToolNames` · `memberToolAllowedForScopes`
- `src/lib/modules/member/api/ops/{core,members,fields,privacy,sources,tiers,me}.ts` — op ทั้ง 68 ตัว

### บริการของโมดูลที่เพิ่มใหม่ (op ห้ามยิง prisma เอง)
- `src/lib/modules/member/activity.ts` — `listActivity()` (ไทม์ไลน์ + เคอร์เซอร์ + ด่าน 404-not-403 ผ่าน `briefFor`)
- `src/lib/modules/member/tier-history.ts` — `listTierHistory()` (แยกแถว `pending` ที่ยังรออนุมัติออกให้ชัด)
- `src/lib/modules/member/choices.ts` — `replaceChoice()` (ย้ายค่าที่เก็บไว้จากตัวเลือกหนึ่งไปอีกตัวเลือก)
- `src/lib/modules/member/identities.ts` — `linkIdentityToMember()` (ผูกช่องทางเข้ากับ "สมาชิกคนนี้" โดยเดินกติกาชนกันชุดเดียวกับ `linkIdentity`)
- `src/lib/modules/member/channels-status.ts` — `channelsWithStatus()` (ทะเบียน 15 ช่องทาง + `connected` จริงของร้าน)

### route
- `src/app/api/v1/member/[...path]/route.ts` (GET/POST/PATCH/PUT/DELETE — บางมาก เรียก dispatch อย่างเดียว)
- `src/app/api/v1/member/openapi.json/route.ts` (ไม่ต้องใช้คีย์)

### ชุดสิทธิ์ · เอกสาร · สกิล
- `src/lib/api-keys/scopes.ts` — `MEMBER_SCOPE_KEYS` + bundle `member-read` / `member-operate` / `member-admin`
- `scripts/gen-member-api-docs.mts` (+`--check`) → `docs/api/MEMBER-API.md` (86 KB · ทับร่างเดิม) + `.claude/skills/shark-member-api/references/endpoints.md`
- `.claude/skills/shark-member-api/SKILL.md` (เขียนมือ · 10 curl · หัวข้อ "ข้อมูลส่วนบุคคล" + Safety) — คัดลอกไป `/root/.claude/skills/shark-member-api/` แล้ว
- `src/app/developers/member/page.tsx` (render จาก `buildOpenApi(MEMBER_OPS)`) · `src/app/developers/member.md/route.ts` · ลิงก์จาก `src/app/developers/page.tsx`

### AI
- `src/lib/ai/tools-member.ts` — `memberTools()` (read รันทันที · write → `createProposal` + `waiting: user_confirm`)
- `src/lib/ai/tools.ts` — ต่อ `...memberTools()` เข้า `toolRegistry()`
- `src/lib/ai/skills.ts` — สกิล `members` = 8 ชื่อเดิม + 22 ชื่อจากทะเบียน · `toolAllowedForApiKey` เพิ่มด่านของโมดูลสมาชิก · `assertSkillRegistryComplete` ตรวจ "ทะเบียน ⊆ สกิล"
- `src/lib/ai/proposals.ts` — `ProposalKind` รับ `` `member.${string}` `` · `DESTRUCTIVE_KINDS` · `KIND_ACCESS` · `dispatch` ส่งต่อ `dispatchMemberKind`

### หน้าจอ
- `src/app/app/sys/[id]/member/settings/api/page.tsx` (gate `member.api.manage` → ไม่มี = `notFound()`)
- `src/components/member/MemberApiSettings.tsx` (testid `member-api-page` · `member-api-keys` · `member-api-new` · `member-api-curl` · `member-api-webhooks` · `member-api-tools`)
- `src/lib/modules/member/api-actions.ts` (ออก/ถอนคีย์ · ด่าน 2 ชั้น: `member.api.manage` + `api.key.create|revoke`)
- `src/lib/modules/member/nav.ts` — `api` `soon` → `ready` + สิทธิ์ของหน้าย่อยเป็น `member.api.manage`

### แกนกลาง (`src/lib/api/*`) — เพิ่มแบบ additive ทั้งหมด
- `respond.ts` — เพิ่มรหัส `customer_session_required`
- `require.ts` / `dispatch.ts` — คืน + ใส่หัว `X-RateLimit-Limit` คู่กับ `Remaining`
- `op.ts` — `auditTarget?` และ `idempotency?: "request" | "key"`
- `run.ts` — ใช้ `auditTarget` (ไม่ประกาศ = `ApiOp` เหมือนเดิม)
- `idempotency.ts` — hash ตามขอบเขตของ op
- `scripts/gen-{account,kanban}-api-docs.mts` + `docs/api/{ACCOUNT,KANBAN}-API.md` + `src/app/developers/{account,kanban}/page.tsx` + `src/components/account-v2/ConnectionsPanel.tsx` — เติมรหัส/ชุดสิทธิ์ใหม่ในตารางที่เป็น `Record<...>` แบบครบทุกคีย์ (ไม่เติม = typecheck แดง) แล้ว regenerate เอกสาร

### fitness
- `scripts/fitness.mts` — เพิ่ม **F13.7 / F13.8 / F13.9** (ทุก op มีข้อสอบ · คู่มือไม่ stale · tool มีบ้านในสกิล) ต่อท้ายบล็อก F13 ของบัญชี/บอร์ดงาน
  🔴 ใบงานห้ามแก้ `fitness.mts` แต่สัญญาในหัวข้อสอบ (`M1.11-S3.4`) บังคับให้มี 3 ด่านนี้ ⇒ **เพิ่มด่านใหม่อย่างเดียว ไม่แตะด่านเดิมสักบรรทัด** (ดู §4.3)

---

## 3. ข้อตัดสิน (จุดที่สัญญาไม่ชัด และเลือกเอง)

### 3.1 บทบาทของคีย์ = STAFF / MANAGER ไม่ใช่ OWNER
`memberActorForKey`: ชุด `member-admin` → `role: "MANAGER"` · ชุดอื่น → `"STAFF"` · `unitAccess: ["*"]` ทุกชุด
**เหตุผล**: บริการหลายตัวถามบทบาทตรง ๆ ไม่ใช่คีย์สิทธิ์ — `mergeMembers`/`unlinkIdentity` = ผู้จัดการขึ้นไป · `setManualTier` = OWNER ทำทันที คนอื่นเข้าสายอนุมัติ ถ้าให้คีย์เป็น OWNER คีย์จะ **ข้ามสายอนุมัติของร้าน** ได้ทั้งที่คนที่ถือคีย์อาจไม่ใช่เจ้าของ ⇒ เลือก MANAGER: ทำงานของผู้จัดการได้ และคำสั่งที่ร้านตั้งสายอนุมัติไว้ยังเข้าสายอนุมัติเหมือนคนจริง
**ผลข้างเคียงที่ตั้งใจ**: บนชุดข้อมูล QC ที่ยังไม่มีนโยบายอนุมัติ `submitForApproval` คืน `autoApproved` ⇒ `tiers.setManual` ของคีย์ admin ได้ `applied: true` ทันที (ตรงกับ S2.9) · ถ้าร้านตั้งนโยบาย จะได้ `{ applied:false, pending:true, approvalRequestId }` ซึ่งเป็นรูปแบบที่คู่มือ/สกิลอธิบายไว้แล้ว

### 3.2 `members.create` กันซ้ำด้วย "คีย์อย่างเดียว" (`idempotency: "key"`)
แกนกลางเดิม: `Idempotency-Key` เดิม + เนื้อคำขอ**ต่าง** = 409 `idempotency_conflict`
แต่ `profile.createMember` ตรวจ `idempotencyKey` เป็นลำดับแรกอยู่ก่อนแล้ว (พิมพ์เขียว §5.2 "ลำดับตายตัว: idempotencyKey → ซ้ำเบอร์/อีเมล") ⇒ สองชั้นนิยาม "ความพยายามครั้งเดียวกัน" ไม่ตรงกัน และข้อสอบ `S2.4` ยิงคีย์เดิมด้วยเนื้อที่ต่างกัน แล้วคาดหวัง `200 + Idempotent-Replayed`
**ตัดสิน**: เพิ่มธงระดับ op `idempotency: "request" | "key"` ที่แกนกลาง (ค่าปริยาย `"request"` = พฤติกรรมเดิมทุกโมดูล) แล้วให้ **`members.create` ตัวเดียว** ใช้ `"key"`
**เหตุผล**: ฟอร์มสมัครที่เน็ตหลุดแล้วผู้ใช้กดส่งใหม่โดยกรอกไม่ครบเท่าเดิม ถ้าได้ 409 ผู้เชื่อมต่อจะเลี่ยงด้วยการยิง**คีย์ใหม่** ซึ่งสร้างสมาชิกซ้ำจริง ๆ — ผลลัพธ์แย่กว่าที่กติกาตั้งใจกัน · ธงนี้ใช้ได้เฉพาะเมื่อชั้นบริการนิยามความพยายามด้วยคีย์อยู่แล้ว (เขียนกำกับไว้ที่ `op.ts`)

### 3.3 `auditTarget` — แถว audit ของ REST ชี้ไปที่ "สมาชิก" ไม่ใช่ชื่อ op
เดิม `runOpAsActor` เขียน `targetType: "ApiOp"` เสมอ ⇒ เปิดประวัติของลูกค้าคนหนึ่งแล้ว **ไม่เห็น**การแก้ที่มาทาง REST เลย (หน้า 360 แท็บประวัติอ่านด้วย `targetId = customerId`)
**ตัดสิน**: เพิ่ม `ApiOp.auditTarget?` (ไม่ประกาศ = เหมือนเดิมทุกประการ ⇒ บัญชี/บอร์ดงานไม่เปลี่ยน) แล้ว `defineMemberOp` เติมให้เองจาก path (`/members/{id}...` → `Customer` + id) หรือจาก `data.customerId` ตอนสร้าง · ชื่อ op ยังอยู่ครบใน `action` (`member.api.<id>`) และ `after.opId`

### 3.4 `members.resolve` เป็น `write` ไม่ใช่ `read`
`MEMBER-API.md` ร่างเดิมเขียน class `read` แต่ `linkIdentity` **สร้างแถว `MemberChannelIdentity` จริง** และยิง event `member.identity.linked` ⇒ ประกาศเป็น read = ไม่มี `Idempotency-Key` ไม่มี audit สำหรับการกระทำที่เปลี่ยนข้อมูล จึงตั้งเป็น `write` (action `member.customer.update` ซึ่งชุด operate มี — ตรงกับที่ข้อสอบ S2.8 ยิงด้วยคีย์ operate)

### 3.5 `tiers.rules.dryRun` เป็น `read` แม้เป็น POST
เป็น POST เพราะรับรายชื่อสมาชิกยาว ๆ ในเนื้อคำขอ แต่ไม่เขียนอะไรเลย ⇒ `kind: "read"` (ไม่บังคับ `Idempotency-Key` · ไม่เขียน audit) + `rate: "report"` เพราะไล่ทั้งฐานสมาชิก

### 3.6 `me.*` ประกาศไว้ในทะเบียนตั้งแต่ตอนนี้ แต่ตอบ 401
ใช้ `action` เป็นคีย์อ่าน/แก้ทั่วไป (คีย์ operate มี) เพื่อให้เดินผ่านด่าน scope แล้ว **ตกที่ handler เป็น 401 `customer_session_required`** ไม่ใช่ 403 `scope_missing` — เพราะ 403 จะทำให้ผู้เชื่อมต่อไล่เติม scope ไปเรื่อย ๆ ทั้งที่ไม่มี scope ไหนเปิดทางนี้ได้เลย · รหัสใหม่นี้เพิ่มใน `API_ERROR_CODES` และอธิบายไว้ในตารางรหัสของทั้ง 3 โมดูล (ของบัญชี/บอร์ดงานเขียนตามจริงว่า "โมดูลนี้ไม่คืนรหัสนี้")

### 3.7 ชื่อ tool ไม่ชนกับ 8 ตัวเดิม
สกิล `members` มี tool รุ่นแรกที่เขียนมือใน `tools.ts` อยู่แล้ว 8 ตัว (`member_count` `member_create` `customer_search` `customer_points` `point_adjust` `reward_redeem` `reward_list_redemptions` `coupon_create`) และสัญญาสั่งให้ **คงชื่อเดิม** ⇒ tool ที่ generate จากทะเบียนใช้ชื่อที่ไม่ชน (`member_register` แทน `member_create`, `member_search` ≠ `customer_search`, ฯลฯ) รวม **22 ตัว**
ผลตามมา: `assertSkillRegistryComplete` ตรวจสกิล `members` แบบ **ทางเดียว** ("ทะเบียนต้องอยู่ในสกิลครบ") ต่างจาก `account`/`tasks` ที่ตรวจสองทาง — เพราะสกิลนี้ถือ tool นอกทะเบียนอยู่ 8 ตัวโดยตั้งใจ

### 3.8 `channels.list` — `connected` แปลว่าอะไร
`core/channels.ts` เป็นไฟล์บริสุทธิ์ (ห้ามแตะ prisma) จึงตอบไม่ได้ว่าร้านต่อช่องทางไว้จริงไหม ⇒ สร้าง `channels-status.ts` ของโมดูล: ช่องทางที่มีกล่องแชท (CHAT/MARKETPLACE) = มีแถว `ChatChannelConnection` สถานะ `CONNECTED` (WEBCHAT = ร้านเปิดระบบแชท) · ช่องทางที่ระบบส่งเองได้ (อีเมล/SMS/push) = `canNotify` · โทรศัพท์ = false เสมอ
อ่าน `ChatChannelConnection` ตรงด้วยเหตุผลเดียวกับที่ `privacy.ts` อ่าน `HrEmployee` ตรง (อ่านสถานะอย่างเดียว ไม่มีตรรกะของโมดูลแชท · เรียกผ่าน facade จะกลายเป็นเส้น `member→chat` ถาวรของ F2)

### 3.9 ผู้ช่วย AI ไม่เห็นข้อมูลอ่อนไหว
`assistantActor` ถือ scope อ่าน 4 ตัว (`customer.read` `tier.read` `tier.manage` `report.view`) และ **ไม่มี `apiRole`** ⇒ ตกด่านนโยบาย D8 เหมือนพนักงาน STAFF ที่ไม่ได้รับมอบสิทธิ์ · `member.tier.manage` ต้องมีเพราะ `member_tier_simulate` (op `tiers.rules.dryRun`) เป็นการอ่านล้วนแต่ใช้คีย์สิทธิ์นั้น

---

## 4. เรื่องที่ต้องรายงาน

### 4.1 🔴 `fitness.mts` แบบไม่มี env พังอยู่ก่อนใบนี้ (ของ builder อื่น) — แก้ให้แล้ว
`MEMBER_OPS`/`KANBAN_OPS` ลาก `@/lib/env` เข้ามาตอน import ⇒ `env -u DATABASE_URL ... fitness` ตายตั้งแต่ import
สายที่ลาก: `kanban/api/registry` → `outbox-consumers` → `@/lib/modules/member` (facade) → `profile.ts` → **`sources.ts` → `core/origin.ts` → `lib/env`**
`sources.ts` เป็นไฟล์ **ที่ยังไม่ commit** ของ M1.8 และ `profile.ts` เพิ่งเริ่ม import มัน ⇒ เป็น regression ที่เข้ามาก่อนใบนี้ (ยืนยันด้วย `git show HEAD:src/lib/modules/member/sources.ts` = ไม่มีไฟล์นี้ใน HEAD)
**แก้ที่จุดคอขวด** `src/lib/core/origin.ts`: ย้าย `import { env }` เป็น dynamic import ในตัวฟังก์ชัน (พฤติกรรมตอนรันจริงเหมือนเดิมทุกประการ) — ไม่แตะ `sources.ts` ซึ่งเป็นไฟล์ของ builder อื่น
(บทเรียนเดิม: `reference_shark_precommit_fitness_no_env`)

### 4.2 `docs/api/{ACCOUNT,KANBAN}-API.md` เปลี่ยนไป 1 บรรทัด
เพราะเพิ่มรหัส `customer_session_required` เข้า `API_ERROR_CODES` (ตารางในทั้งสอง generator เป็น `Record<ApiErrorCode, ...>` แบบครบทุกคีย์โดยตั้งใจ) ⇒ regenerate ทั้งคู่แล้ว · F13.2/F13.5 เขียว

### 4.3 แตะ `scripts/fitness.mts` ทั้งที่ใบงานห้าม
สัญญาในหัวข้อสอบข้อ 11 + ข้อ `M1.11-S3.4` บังคับให้มี F13.7/F13.8/F13.9 ⇒ **เพิ่มบล็อกใหม่ต่อท้าย ไม่แก้/ไม่ลบด่านเดิมแม้แต่บรรทัดเดียว** (ด่านที่เพิ่มทำให้กติกาเข้มขึ้น ไม่ได้ผ่อน) · ถ้า Fable ไม่เห็นด้วยให้ย้ายบล็อกออกได้ทั้งก้อน (บรรทัด `// ─── F13 (ต่อ): ทะเบียน API ระบบสมาชิก (M1.11) ───` ถึงปิดวงเล็บปีกกา)

### 4.4 เอา `✓` ออกจาก `MemberApiSettings.tsx`
`qc-member-m1.5` ข้อ `S4.1` สแกน **ทุกไฟล์** ใน `src/components/member/*.tsx` หาอีโมจิ และ `✓` (U+2713) เข้าช่วง `\u{2600}-\u{27BF}` ⇒ M1.5 แดงทันทีที่เพิ่มคอมโพเนนต์ใหม่ (คอมโพเนนต์ฝั่งบอร์ดงานใช้ `บันทึกแล้ว ✓` อยู่ แต่ไม่ถูกสแกน) — เปลี่ยนเป็น "บันทึกแล้ว" เฉย ๆ · M1.5 กลับมา 20/20

---

## 5. หนี้ที่ยกไปใบถัดไป

1. **`members.addresses.set` — ยังไม่ทำ** (อยู่ในรายการ op ของหัวข้อสอบ แต่ไม่อยู่ในรายการ `MUST` ที่ตรวจ)
   `Party.address` เป็น **ข้อความเดี่ยว ๆ ช่องเดียว** ไม่ใช่รายการที่อยู่ และ facade `party/index.ts` **ไม่มีตัวเขียน** ⇒ ทำ op นี้ต้องเพิ่มทางเขียนให้โมดูล party ก่อน ซึ่งเป็นการแก้โมดูลอื่นนอกขอบใบนี้ · เสนอ: ทำพร้อม M2.x ที่แตะที่อยู่จริง (ใบเสร็จ/จัดส่ง) หรือเปิดใบเล็กให้ party
2. **`members.import.status` ตอบ `DONE` เสมอ** — การนำเข้าผ่าน API ทำงานจบในคำขอเดียว (โมดูลสมาชิกยังไม่มีตารางงานเบื้องหลัง) · `jobId` = `requestId` ของคำขอที่สั่ง · เขียนบอกตรง ๆ ทั้งใน `summary` ของ op และในคำตอบ (`async: false` + `note`) · เมื่อมีคิวงานจริง (M3.x) ให้เปลี่ยนเป็นงานจริง
3. **`members.export` คืน CSV ในเนื้อคำตอบ** (`{ rows, csv }`) ไม่ใช่ `jobId` + ไฟล์ในคลัง — เพดาน `MEMBER_LIMITS.exportRows` คุมขนาดอยู่แล้ว · เปลี่ยนเป็นไฟล์ในคลังได้เมื่อมีทางเขียนไฟล์ฝั่ง server
4. **op ของ M2 (แต้ม/สแตมป์/รางวัล/voucher/คูปอง/บัตรกำนัล/wallet)** ยังไม่มีในทะเบียน — ตามแผนอยู่ใบ **M2.10** · `SKILL.md` บอกผู้อ่านไว้แล้วว่าชุดนี้ยังไม่มีในรุ่นนี้
5. **`/me/*` ยังไม่มีทางเข้าจริง** — รอ session ลูกค้าใน **M2.9** · วันนี้ประกาศไว้ในสัญญาและตอบ 401 `customer_session_required`
6. `MemberApiToolRow.label` / `MemberApiKeyRow.bundleId` เตรียมไว้ให้หน้าจอใช้ต่อ (ยังไม่ได้เรนเดอร์) — ถ้าไม่ใช้ใน M1.12 ให้ถอดออก

---

## 6. คืนสภาพชุดข้อมูล QC

ข้อสอบคืนสภาพเองใน `finally` (ลบคีย์ · สมาชิกที่สร้าง · ร้านทดสอบ · identity `wa-api-*` · แท็ก `ai-qc` · consent ของสมาชิก 7 · ลิงก์ที่มาที่สร้าง)
builder **ไม่ได้** สร้าง/แก้ข้อมูลนอกข้อสอบ · ไม่ได้รัน `qc-member-m1.1.mts` · ไม่ได้ build · ไม่ได้ commit · ไม่แตะ `.env`
