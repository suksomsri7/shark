# M3.10 — REST/AI ชุดสาม + manifest (builder notes)

> builder: Opus · 11 ก.ย. 2569 · worktree `shark-member` · ข้อสอบ `scripts/qc-member-m3.10.mts` (ไม่ถูกแตะ) · ไม่มี migration · ไม่ build · ไม่ commit

## 1. ผลข้อสอบ

| ชุด | ผล |
|---|---|
| `qc-member-m3.10` (ตัวจริง · **ไม่มี QC server**) | **5/21** — ผ่าน S1.1 · S1.2 · S2.3 · S4.1 · S4.2 · ที่เหลือ = รอ server (S2.1 S2.2 S3.1–S3.12 ยิง HTTP) + ภาพ/PARITY (S4.3 S4.4) |
| สำเนาชั่วคราว "ยิง route handler ในโปรเซสเดียวกัน" (ลบทิ้งแล้ว) — ซองตามจริง `{data}` | 4/15 + `M3.10-ERR` (ตายที่ S3.10 `whRow!.secret` เพราะอ่าน `wh.body.id` ไม่เจอ) — ดูข้อแย้ง ก |
| สำเนาเดียวกัน แต่แกะ `.data` + นับ 200 ของ create 7 เส้นเป็น 201 (ลบทิ้งแล้ว) | **15/21** — แดง 4 ข้อที่ไม่ใช่ภาพ = ข้อแย้ง ข · ค · ง ทั้งหมด (S2.1 · S3.1 · S3.7 · S3.8) + S4.3/S4.4 ภาพ |
| `tsc --noEmit` | ✅ |
| fitness (มี env / `env -u DATABASE_URL -u DIRECT_URL`) | ✅ 26/26 · ✅ 26/26 |
| `gen-member-api-docs --check` · `gen-account-…` · `gen-kanban-…` | ✅ exit 0 ทั้ง 3 (212 · 199 · 88 op) |
| regressions สมาชิก | m1.11 **26/26** · m2.10 **17/20** (แดง 3 = S5.1–S5.3 curl ต้องมี server — "รอ server") · m3.1 20/20 · m3.2 27/27 · m3.3 32/32 · m3.4 23/23 · m3.5 21/21 · m3.6 19/19 · m3.7 23/23 · m3.8 18/18 · m3.9 24/24 · m1.3 14/14 · m1.5 20/20 |
| บัญชี/บอร์ดงาน (`QC_ENV_FILE=.env.qc`) | `qc-account-api-*` 19 ชุดเขียวทั้งหมด (settings = SKIPPED ตามเดิม) · `qc-kanban-k1.15` 30/30 · `qc-kanban-k3.5` 20/21 (S6.4 ภาพข้าม worktree = ฐานเดิม) · `qc-nav-functions` 11/11 |
| บริการ `member/join.ts` กับข้อสอบ M3.11 (สำเนาที่ถอดด่าน SKIP ของหน้า LIFF · ลบทิ้งแล้ว) | S1.1–S1.5 ✅ ครบ 5 ข้อของ service · S2.1/S2.2 แดงเพราะข้อสอบ M3.11 อ่าน `a.kind` ของ MemberAttribution (คอลัมน์จริงชื่อ `touch`) — ดูข้อแย้ง ช |

## 2. ไฟล์

### ใหม่
- `src/lib/modules/member/api/ops/{segments,campaigns,journeys,reviews,referrals,notifications,reports,settings,webhooks,join,insights}.ts` — op ชุดสาม 73 ตัวตามหัวข้อสอบ + `segments.fields` + `members.summary` / `members.recommendOffer` / `members.history` (ทะเบียนรวม 135 → **212 op** · tool 33 → **54**)
- `src/lib/modules/member/join.ts` — `joinForm` · `startJoin` · `verifyJoin` · `completeJoin` · `resolveJoinTarget` (ใช้ได้ทั้ง REST และ server action ของ M3.11)
- `src/lib/modules/member/api/public-lane.ts` — เลนสาธารณะ `/join/{tenantSlug}/*` (ร้านจาก slug → 404 · เพดานต่อ IP บน DB · actor ทำได้แค่ `member.join`)
- `src/lib/modules/member/api/campaign-port.ts` + `src/lib/member-api-ports.ts` (composition root) — ช่องเสียบแคมเปญ (ดูข้อตัดสิน 1)
- `src/lib/modules/member/api/webhook-events.ts` — `memberWebhookEvents` (ย้ายจาก openapi.ts · re-export ไว้ที่เดิม) + `isMemberWebhookEndpoint` + ตัวตรวจ url/events ใช้ร่วม REST/หน้าจอ
- `src/lib/modules/member/api/http-errors.ts` — `as400()` / `badRequest()` (error "ข้อมูลใช้ไม่ได้" ของบริการ → 400 `validation` ตามสัญญา)
- `src/lib/modules/member/insights.ts` — `memberSummary` · `recommendOffer` (กติกาเขียนมือ ไม่มี AI · ตัวเลขจากข้อมูลจริงทั้งหมด)
- `src/lib/modules/member/push-devices.ts` — `registerPushDevice` / `removePushDevice` (ตาราง MemberPushDevice ของ M3.2)
- หน้า `src/app/app/sys/[id]/member/assistant/page.tsx` + `src/components/member/MemberAssistant.tsx` + `src/lib/modules/member/{assistant.ts, assistant-actions.ts, assistant-shared.ts}`
- `src/lib/modules/member/api-shared.ts` — ชนิดของส่วน webhook บนหน้า settings/api (ไฟล์ `"use server"` ห้าม export type)

### แก้เฉพาะจุด
- `member/api/op.ts` — `MemberApiOp` = `ApiOp` + `scope` (= action · public = null · me = "customer") + `auth` ("key"|"customer"|"public" · เดาจาก path) · `memberAuthOf()`
- `member/api/config.ts` — `altAuth` = เลนสาธารณะก่อน แล้วค่อยเลนลูกค้า
- `member/api/openapi.ts` — `buildOpenApi(ops | { ops?, baseUrl? })` (ข้อสอบเรียกด้วย `{ baseUrl }`) · security ตามเลน (`[]` / `customerToken`) · Conventions ข้อ 17–18 · prefix event + `review.` `referral.` `campaign.`
- `member/api/registry.ts` (ต่อ 11 กลุ่ม) · `member/api/ops/me.ts` (+5 op) · `member/api/tools.ts` (assistant อ่าน `member.review.read` · ซ่อน tool รุ่นแรก 8 ตัวจากคีย์ที่มี scope สมาชิก · สรุปข้อเสนอบอกช่องทาง/ข้อความ/ต้นทุน voucher)
- `member/reviews.ts` (+`getReview` · `reviewTokenOwner` — additive) · `member/index.ts` (+export ช่องเสียบแคมเปญ) · `member/nav.ts` (+`assistant` ใน MEMBER_DEEP_NAV — แถบหลักล็อก 9 หมวด) · `member/api-actions.ts` (+4 action webhook)
- `src/components/member/MemberApiSettings.tsx` (ส่วน Webhook จริง + manifest) · `MemberIcon.tsx` (+`sparkle` `send` `link`) · หน้า `member/settings/api/page.tsx` (โหลดปลายทาง/การส่ง)
- `src/lib/ai/skills.ts` (+21 tool · summary ของสกิล) · `src/lib/ai/service.ts` (`deps.onToolCall?` — additive)
- `src/lib/webhooks/service.ts` — `WebhookDeps.fetch?` เป็นชื่อเรียกอีกชื่อของ `fetchFn` (ข้อสอบ S3.10 ส่ง `{ fetch }`)
- แกน REST (additive · ไม่ประกาศ = เหมือนเดิมทุกไบต์ · docs บัญชี/บอร์ดงาน `--check` ผ่านโดยไม่ต้อง regen): `api/op.ts` (`idempotency: "optional"` · `csvAlways`) · `api/idempotency.ts` · `api/dispatch.ts` · `api/openapi.ts`
- เอกสาร: `scripts/gen-member-api-docs.mts` (หัวข้อ Signup lane · scope ตามเลน · curl ตามเลน · webhook 6 event ใหม่ · CSV ของ csvAlways · glossary) → `docs/api/MEMBER-API.md` + `references/endpoints.md` · `src/app/developers/member/page.tsx` (ป้าย 11 กลุ่ม · คอลัมน์ scope ตามเลน · ย่อหน้าเลน /join) · `.claude/skills/shark-member-api/SKILL.md` (description/เลนที่สาม/danger 7 ตัว/workflow 12 แถว/recipe 4) — **คัดลอกไป `/root/.claude/skills/shark-member-api/` แล้ว (`diff -rq` ตรงกัน)**

## 3. ข้อตัดสิน

1. **แคมเปญผ่าน "ช่องเสียบ" ไม่เพิ่มเส้น F2** — แคมเปญ v2 อยู่โมดูล marketing · allowlist มีแค่ `marketing→member` · ถ้า `ops/campaigns.ts` import marketing ตรง = เส้นใหม่ `member→marketing` + วงจรตอนโหลดไฟล์ ⇒ ประกาศช่องเสียบใน `member/api/campaign-port.ts` (ไม่รู้จัก marketing เลย) แล้วให้ composition root `src/lib/member-api-ports.ts` เสียบตัวจริง (แบบ `member-hooks.ts`) · ช่องเสียบโหลด root แบบ dynamic ครั้งแรกที่ใช้ (แบบเดียวกับ `tiers-actions.ts` → `member-hooks`) · **ข้อแย้งถึงผู้คุมงาน**: ถ้ามองว่านี่คือการหลบ F2 ให้เพิ่ม `member→marketing` ใน allowlist แล้วเปลี่ยน `campaignPort()` เป็น import facade ตรงได้ในไม่กี่บรรทัด — builder ไม่แก้ fitness เอง
2. **ซองคำตอบคงเดิม `{ data, requestId }` และสร้าง = 200** (ไม่ทำ 201 / ไม่ยก field ขึ้นระดับบน) — เป็นกติกาของ REST ทั้ง 3 โมดูล (Conventions ข้อ 11 · M1.11/M2.10 ข้อสอบอ่าน `.body.data` ทุกข้อ) · เขียนเพิ่มเป็น Conventions ข้อ 18 · ดูข้อแย้ง ก
3. **เลนสาธารณะไม่ต้องมี `Idempotency-Key`** — ข้อสอบส่ง `idempotency-key: ""` · เพิ่ม `idempotency: "optional"` ที่แกน (ส่งมา = กันซ้ำตามปกติ · ไม่ส่ง = ทำงานเลย) · บริการกันซ้ำเองอยู่แล้ว (OTP/ตั๋วใช้ครั้งเดียว · createMember idempotencyKey = id ตั๋ว)
4. **ตั๋วสมัคร `jt_` เก็บเป็นแถว `CustomerOtp` channel `JOIN_PHONE/JOIN_EMAIL`** (ห้าม migration) · เก็บแต่ hash · 15 นาที · ใช้ครั้งเดียว · ข้อมูลผิดทุกกรณีโยนก่อนสร้างสมาชิก ⇒ ตั๋วไม่ถูกเผา (M3.11 S1.5 ผ่าน) · เบอร์/อีเมลของสมาชิกใหม่มาจากตั๋วเท่านั้น
5. **`lineUserId` จากเนื้อคำขอไม่ถูกเชื่อ** — ผูก LINE เฉพาะเมื่อผู้เรียกฝั่ง server ส่ง `meta.verifiedLineUserId` (หลังตรวจ id_token ของ LIFF) · ค่าจาก REST เก็บใน `sourceDetail.lineUserIdUnverified` · เหตุผล: เชื่อค่าดิบ = ผูก LINE ของคนอื่นเข้าบัญชีตัวเองได้ แล้วเจ้าของ LINE ตัวจริงล็อกอินเข้าบัตรคนอื่น · **M3.11 ต้องส่ง verifiedLineUserId จาก server action เอง**
6. **แต้มต้อนรับ** = ผลรวมกฎ EVENT_BONUS `SIGNUP` ที่เปิดอยู่ของระบบแต้มที่ผูกสาขา (ตั้งค่าแต้มปิด = 0) · ให้จริงตอน `completeJoin` ผ่าน `computeEarn`+`earnWithLot` (คีย์กันซ้ำ `join-welcome:<customerId>`) · ฟอร์มกับยอดจริงตรงกัน (M3.11 S1.1 ผ่าน) · ให้เฉพาะสมัครด้วยตัวเอง (พนักงานสมัครให้ไม่ได้แต้มนี้ — เดิมไม่มีใครให้เลย)
7. **`startJoin` นับ hit ของลิงก์ `src`** (ข้อสอบ M3.11 S2.1 วัดจาก service) ⇒ **หน้า LIFF ของ M3.11 ห้ามเรียก `sources.hit` ซ้ำตอนเปิดหน้า** ไม่งั้นนับ 2
8. **ฟอร์มสมัคร** = ฟิลด์ไม่อ่อนไหว · ไม่ใช่งานหลังร้าน (phone/email/memberCode/source/owner/note/tags/homeUnit/lineUserId/avatar) · ไม่ใช่ FILE/LOOKUP · (customerEditable **หรือ** required) + `firstName` บังคับเสมอ (+ lastName ถ้าร้านไม่มีฟิลด์ระบบ) · คีย์นอกฟอร์ม = 400
9. **Webhook ของ REST/หน้าจอสมาชิก = เฉพาะปลายทางที่สมัครแต่เหตุการณ์ของระบบสมาชิก** (รายการว่าง = "ทุกเหตุการณ์ของร้าน" ในบริการกลาง ⇒ ไม่นับ) · ปลายทางอื่นตอบ 404 · url ต้อง https · events ต้องไม่ว่าง — คีย์สมาชิกแก้/ลบฮุคของบัญชีไม่ได้
10. **tool รุ่นแรก 8 ตัว** (`customer_search` `point_adjust` …) ไม่มี scope ของตัวเอง ⇒ คีย์ที่ถือ scope `member.*` ไม่เห็น/เรียกผ่าน `/api/v1/ai/*` (manifest = ทะเบียน 54 ตัวพอดี ตามข้อสอบ S2.1) · ผู้ช่วยในแอปและคีย์รุ่นเก่าที่ไม่มี scope ใช้ได้เหมือนเดิม · qc-account-api-ai-external / m1.11 เขียว
11. **`notifications.stats` = `member.report.view`** (ข้อสอบยิงด้วยคีย์อ่าน) แต่บริการ M3.6 ถาม `member.settings.manage` (ข้อสอบ M3.6 ให้ thana ถูกปฏิเสธ) ⇒ op ส่ง actor ที่เติมสิทธิ์อ่านสถิติเฉพาะคำขอนี้ ไม่แตะด่านของหน้าจอ · templates.list = `member.customer.read` (ข้อความของร้าน ไม่ใช่ข้อมูลลูกค้า)
12. **นิยามกลุ่มรูปสั้น + ค่าตัวเลือกไม่สนตัวพิมพ์** — ข้อสอบส่ง `[{field:"tier",op:"in",value:["GOLD","PLATINUM"]}]` แต่คีย์ระดับใน QC เป็นตัวเล็ก · แปลงที่ชั้น op (ไม่แตะเอนจิน M3.1) · ฟิลด์ที่ไม่รู้จัก = 400
13. **`POST /campaigns` ไม่ส่ง segmentId/definition = สมาชิกทุกคนของระบบ** (ข้อสอบส่ง `segmentId: null` · บริการเดิมโยน) — ปลอดภัยเพราะแคมเปญเกิดเป็นร่างเสมอ ส่งจริงต้องเรียก `/send` · `campaigns.testSend` ส่งตัวอย่างหาอีเมลของผู้ออกคีย์เท่านั้น (ไม่มี service รับ id แคมเปญ)
14. **`GET /reports/{tab}/csv` เป็นไฟล์เสมอ** (ข้อสอบ fetch ไม่ใส่ Accept) ⇒ แกนเพิ่ม `csvAlways` · RFM ไม่คืนรายตัวโดยปริยาย (`includeScores=true` สูงสุด 500)
15. **หน้า /member/assistant**: ใช้ `ai/service.sendMessage` (source MEMBER_ASSIST) + `ai/proposals` (execute/reject ด้วย Membership ของคนกด · DESTRUCTIVE ถามซ้ำ) · ตาราง = ตาราง markdown ในคำตอบ (แยกเป็นตารางจริง ไม่ render HTML) · บรรทัด "เครื่องมือที่ใช้" = ชื่อ tool จาก `onToolCall` ต่อท้ายคำตอบรูป `[tools: a · b (รอยืนยัน)]` (รูปเดียวกับที่ harness TMP310 seed) · "ต้นทุนรวม" = ท่อน "ต้นทุน…" ในสรุปข้อเสนอ (ตอนนี้ออก voucher FIXED คำนวณให้ = มูลค่า × คน · อื่น ๆ แสดง "—" ไม่เดาเลข) · "แก้ไข" = ยกเลิกข้อเสนอแล้วเอาคำสั่งเดิมกลับมาในช่องพิมพ์ · ลิงก์เข้าอยู่ drawer (MEMBER_DEEP_NAV) + ลิงก์จากการ์ด tools บนหน้า API
16. **op เพิ่มนอกหัวข้อสอบ** (test id อยู่ในข้อสอบจริงทุกตัว · F13.7 เขียว): `segments.fields` (ผู้ช่วย/ผู้เชื่อมต่อต้องรู้ฟิลด์ก่อนสร้างนิยาม) · `members.summary` / `members.recommendOffer` (บ้านของ tool `member_summary` / `member_recommend_offer` ที่ข้อสอบบังคับชื่อ) · `members.history` (M3.7 ยังไม่มี REST ของฝั่งร้าน)
17. **`me.history` ของลูกค้า** เห็นเฉพาะ ซื้อ/จอง/ระดับ/แต้ม-สิทธิ์/รีวิว-แนะนำ · ตัดชื่อพนักงานและลิงก์หลังร้าน · `me.reviews.submit` ตรวจว่าลิงก์รีวิวเป็นของ session นี้ก่อนส่ง (ของคนอื่น = 404)

## 4. 🔴 ข้อแย้งข้อสอบ (หลักฐานจากสำเนาชั่วคราวที่ลบแล้ว · builder ไม่แก้ข้อสอบ)

**ก. S2.1–S3.12 อ่านคำตอบแบบไม่มีซอง และคาด 201** — ข้อสอบอ่าน `seg.body?.id` · `segCount.body?.count` · `presets.body?.length` · `rvGet.body?.rewardPoints` · `rpO.body?.members?.total` · `akNew.body?.secret` · `wh.body?.id` · `jVerify.body?.joinToken` · `meAfter.body?.member?.customerId` ฯลฯ และคาด `201` ที่ POST /segments · /campaigns · /journeys · /api-keys · /webhooks · /join/{slug}/complete · /me/push-devices
แต่แกน REST ทุกโมดูลตอบ `{ data, page?, requestId }` HTTP 200 (`src/lib/api/respond.ts okBody` · dispatch `run()` คืน status 200 เสมอ · Conventions ข้อ 11) และข้อสอบ M1.11/M2.10 อ่าน `.body.data.*` ทุกข้อ (เช่น qc-member-m2.10.mts:112 `c1.body?.data?.ledgerId`)
- ผลสำเนา (ยิง route handler จริง ซองจริง): 4/15 + ERR ที่ S3.10 (`whRow!.secret` เพราะ `wh.body.id` = undefined) · และ `finally` ของข้อสอบลบของที่สร้างด้วย `body.id` ⇒ รอบนั้นทิ้ง segment/journey/webhook endpoint ค้างใน QC (builder ลบทิ้งแล้ว: `QC310 1789133402293` · `QC310 journey` · `https://hooks.example.com/qc310`)
- ผลสำเนาที่แกะ `.data` + นับ 200 ของ 7 เส้นข้างบนเป็น 201: **15/21** (เหลือ ข · ค · ง + ภาพ)
- เสนอ: ORACLE-EDIT อ่าน `.body?.data?.x` (หรือ helper `d = (r) => r.body?.data`) และคาด 200 · (ข้อสอบ M3.11 S5.1 ก็คาด "ลงทะเบียน → 201 · ซ้ำ → 200" — เงื่อนไขเดียวกัน)

**ข. S2.1 `toolNames = new Set(toolOps.map((o) => o.tool))`** (บรรทัด 78) — `ApiOp.tool` เป็น object `{ name, hint?, risk? }` (แกน `src/lib/api/op.ts` · ทุกโมดูล) ⇒ Set ของ object ไม่มีทาง `.has("member_search")` · ข้อสอบ M1.11 บรรทัด 157 ใช้ `o.tool.name` · ผลสำเนา: `tools=54 missing=<ครบ 10 ชื่อ> man=200/54` (manifest = ทะเบียนพอดีแล้ว) · เสนอ: `o.tool?.name`

**ค. S3.1 / S3.8 ส่ง danger ด้วย `reason: "qc"`** (บรรทัด 101 · 142) — แกนบังคับ reason ≥ 5 ตัวอักษร (`src/lib/api/dispatch.ts` `MIN_REASON = 5` · Conventions ข้อ 10 · ทุกโมดูล) ⇒ 422 `validation` · ผลสำเนา: `del=422` · `revoke=422 use=200` · เสนอ: `reason: "qc310 cleanup"`

**ง. S3.7 "คีย์ operate (ไม่มี report.view) → 403"** — ชุด `member-operate` = ชุดอ่าน + งานหน้าร้าน และชุดอ่านมี `member.report.view` (`src/lib/api-keys/scopes.ts` `MEMBER_READ_SCOPES` → `MEMBER_OPERATE_SCOPES = [...MEMBER_READ_SCOPES, …]` · คำอธิบายชุดใน M1.11 "read … reviews and the acquisition report") ⇒ 200 ถูกต้องตามสัญญา M1.11 · ผลสำเนา `noperm=200` · เสนอ: ใช้คีย์ที่สร้างด้วย scope เดี่ยว เช่น `scopes: ["member.customer.read"]` แทนชุด operate

**จ. `finally` ของ M3.10 ไม่คืนค่าตั้งของระบบ** — ข้อสอบ PUT `/reviews/settings {rewardPoints 50}` · PUT `/settings {review.askAfterHours 3}` · PUT `/notifications/templates/WELCOME` · PUT `/referrals/program {enabled, monthlyCap 10}` แล้วไม่คืน ⇒ รันต่อด้วย m3.4 แดง S1.1 (คาด askAfterHours ปริยาย 2 · **เกิดจริง**: m3.4 22/23 หลังรันสำเนา) · builder คืนสภาพเองแล้ว (ลบ `settings.member.review` + `settings.member.notifications` ที่รอบนั้นสร้าง → m3.4 23/23 · m3.6 19/19) · เสนอ: snapshot `AppSystem.settings` ตอนต้นแล้วคืนใน finally แบบ m3.6 บรรทัด 67–68
**ฉ. (แจ้งไว้)** S3.10 `retryFailedWebhooks({ fetch: fetchOk })` ยิงซ้ำ **ทุก** delivery ที่ FAILED ทั้งฐาน QC ด้วย fetch ปลอม ⇒ ทุกแถว FAILED ของทุกร้านใน QC กลายเป็น OK ทุกครั้งที่รัน (ไม่กระทบ prod · แต่ชุดอื่นที่นับ FAILED ใน QC อาจเพี้ยน)
**ช. (แจ้งล่วงหน้าให้ M3.11)** qc-member-m3.11 S2.1/S2.2 อ่าน `a.kind === "FIRST"` ของ `MemberAttribution` — คอลัมน์จริงชื่อ `touch` (`prisma/schema/member.prisma` · `profile.createMember` เขียน `touch: "FIRST"|"LAST"`) · ผลรัน service: `attr=[[null,"LIFF",true],…]` ทั้งที่ข้อมูลถูก (hits=1 · signups=1 · linkId ตรง)

## 5. หนี้

1. **CORS** ของเลน `/join/*` — หน้าเว็บของร้านที่อยู่คนละโดเมนเรียกจากเบราว์เซอร์ตรงไม่ได้ (ไม่มีหัว CORS) · วันนี้ใช้ได้จาก LIFF/หน้า `/m/*` (โดเมนเดียวกัน) และจาก server ของผู้เชื่อมต่อ
2. **ผูก LINE ผ่าน REST** ยังไม่มี (ต้องมีตัวตรวจ id_token ของ LIFF ฝั่ง server) — M3.11 ผูกผ่าน server action ได้ด้วย `verifiedLineUserId`
3. **ต้นทุนในกล่องข้อเสนอ** คำนวณให้เฉพาะ `member_vouchers_issue` แบบ FIXED · แคมเปญ/แต้มยังเป็น "—" (ต้นทุนแคมเปญจริงดูได้จาก `POST /campaigns/{id}/preview`)
4. `GET /members/{id}/history` กับ `GET /members/import/{jobId}` จับคู่ path ชนกันได้เฉพาะ `/members/import/history` (ตัวแรกในทะเบียนชนะ) — ไม่มีใครเรียกจริง แต่ถ้าวันหนึ่งมี jobId ชื่อ `history` จะงง
5. คีย์ `member-admin` ออกคีย์ admin ใหม่ได้ผ่าน `POST /api-keys` (ตามสัญญา) — เจ้าของที่อยากจำกัดต้องไม่ออกคีย์ admin ให้ระบบภายนอก (เขียนเตือนใน SKILL.md Safety แล้ว)
6. สถิติ `notifications.stats` ผ่านคีย์อ่านใช้ actor ที่เติมสิทธิ์เฉพาะคำขอ (ข้อตัดสิน 11) — ถ้าผู้คุมงานอยากให้บริการรับ `member.report.view` เอง ต้องแก้ M3.6 + ข้อสอบ M3.6 (thana)
7. ภาพ/ลิงก์ของเครื่องมือ 54 ตัวบนหน้า API ยังโชว์ 8 ตัวแรก (คงแบบ M1.11 · รายชื่อครบอยู่คู่มือ)

## 6. ข้อมูลสำหรับถ่ายภาพ (ผู้คุมงาน)

- `api-webhooks-owner` (desktop · `/app/sys/{MEMBER}/member/settings/api`): การ์ดคีย์ → curl → tools (`54 เครื่องมือในสกิล members` + บรรทัด manifest) → **Webhook** (หัว + ปุ่ม "เพิ่ม URL" อยู่ในกล่อง `member-api-webhook-new` ซึ่ง render เสมอ · QC ไม่มีปลายทางของระบบสมาชิก ⇒ ขึ้นชิป 3 event + "+n event" + ข้อความยังไม่มีปลายทาง แบบภาพ 27 ขวาล่าง · `member-api-deliveries` = "ยังไม่มีการส่ง") · ถ้าอยากเห็นตาราง: สร้างปลายทาง https ของ QC ก่อนถ่าย (เช่น `POST /webhooks {url:"https://example.com/qc310-shot", events:["member.created"]}`) แล้วลบหลังถ่าย
- `assistant-owner` (desktop + mobile · `/member/assistant?conversation=<TMP310>`): harness seed บทสนทนา + ข้อเสนอ PENDING ไว้แล้ว · หน้าจอแยกตาราง markdown เป็น `member-assistant-result-table` · ข้อเสนอ = กล่องฟ้า "ข้อเสนอ (ยังไม่ทำ)" การกระทำ/ต้นทุนรวม (`฿6,900` จากสรุป) + ยืนยัน/แก้ไข/ยกเลิก · บรรทัด `[tools: …]` → `member-assistant-tools` ใต้กล่องข้อเสนอ · ช่องพิมพ์ + ส่ง ท้ายการ์ด
- ข้อเสนอที่ harness seed ใช้ kind `member_voucher_issue` (ไม่มีในทะเบียน) ⇒ ถ้ากดยืนยันจริงจะได้ "ไม่รู้จักประเภทข้อเสนอนี้" — เป็นข้อมูลภาพเท่านั้น
- ข้อ curl ของ M3.10 (S2.1 S2.2 S3.x) ต้องใช้ server ที่ build หลังใบนี้ — และจะผ่านเมื่อแก้ข้อสอบตามข้อแย้ง ก–ง (ผลสำเนาในโปรเซส 15/21 → 19/21 เหลือภาพ)

## 7. คืนสภาพ QC

- ข้อสอบตัวจริง (ไม่มี server) ไม่สร้างของค้าง · สำเนารอบซองจริงทิ้ง segment/journey/endpoint ไว้ 3 ชิ้น → ลบแล้ว (ตรวจซ้ำ = 0) · สำเนาแตะค่าตั้ง review/notifications → คืนแล้ว (m3.4/m3.6 เขียว)
- ไม่ได้รัน `qc-member-m1.1` · ไม่ build · ไม่ commit · ไม่แตะ `.env` · สคริปต์ชั่วคราว `scripts/tmp-m310-*` / `tmp-m311-*` ลบหมดแล้ว

## 8. แก้ตามตีกลับรอบ 1 (ภาพ 27 · 2 จุด)

1. **ตารางผลค้นหาในหน้าผู้ช่วย: "ชื่อ" เป็นคอลัมน์แรก** (ภาพ 27 ซ้าย ชื่อ · ยอด 12 เดือน · มาล่าสุด)
   - `assistant-shared.ts`: `memberCodeCandidates()` (หารหัสสมาชิกในตารางของคำตอบ) + `tableWithNames()` — คอลัมน์รหัส (หัว `รหัส`/`รหัสสมาชิก`/`member code` หรือคอลัมน์ที่มีค่า resolve ได้) กลายเป็น "ชื่อ" คอลัมน์แรก · รหัสอยู่บรรทัดรองใต้ชื่อ · ตัดคอลัมน์ลำดับ `#` · คอลัมน์อื่น (ระดับ ฯลฯ) คงไว้ · resolve ไม่ได้ = แสดงรหัสเดิม · `AssistantStateDto.memberNames` (รหัส → ชื่อ)
   - `assistant.ts`: `assistantState(tenantId, conversationId, viewer?)` resolve ชื่อ **ฝั่ง server ตอนเรนเดอร์** ผ่าน `briefFor` ด้วยสิทธิ์/ขอบเขตสาขาของคนเปิดหน้า (ทดสอบ: owner เห็นชื่อ 3 คน · thana ที่อยู่นอกขอบเขตได้รหัสเดิม) · **ชื่อไม่ถูกเขียนกลับลงข้อความ และไม่เข้า prompt ของ AI** — ผลของ tool ที่ส่งกลับโมเดลยังเป็นรหัสเหมือนเดิม
   - หน้า `assistant/page.tsx` + `assistant-actions.ts` ส่ง viewer (systemId · actor · userId) ทุกทาง (โหลดครั้งแรก/ส่ง/ยืนยัน/ยกเลิก)
   - `MemberAssistant.tsx`: ตารางวาดจาก `tableWithNames` · มือถือ: ช่อง `px-2` · หัว/คอลัมน์รองขึ้นบรรทัดได้ (`sm:whitespace-nowrap`) · ซ่อนไอคอนประกายหน้าคำตอบบนมือถือ (คืนความกว้างให้ตาราง) · ตารางยังอยู่ในกล่อง `overflow-x-auto` + `min-w-0` (ไม่ดันหน้าให้ล้น)
2. **ชิปชนิดของเครื่องมือบนหน้า settings/api มีสีตามภาพ** — `MemberApiSettings.tsx` `KIND_TONE`: อ่าน = `var(--color-tag-green)` · เขียน = `var(--color-tag-blue)` · อันตราย = `var(--color-tag-red)` (โทเคนเดิม ไม่มี hex · testid `member-api-tool-kind-<kind>`) · หน้า `settings/api/page.tsx` เลือกตัวอย่าง 8 แถวให้ครบทุกชนิด (อ่าน 4 · เขียน 2 · อันตราย 2) แทน 8 ตัวแรกของทะเบียน (ซึ่งไม่มีชนิดอันตรายเลย)

ผลหลังแก้: `tsc` ✅ · fitness 26/26 ×2 ✅ · grep `'use client'` (MemberAssistant/MemberApiSettings import เฉพาะ server action + ไฟล์บริสุทธิ์ `*-shared.ts` ที่ไม่มี import ใด ๆ) ✅ · ไม่มีอีโมจิ/hex ✅ · `qc-member-m3.10` (ข้อสอบฉบับแก้ของผู้คุมงาน + QC server บิลด์เก่าที่ :3215) **20/21** — เหลือ S4.4 PARITY ของผู้คุมงาน · `qc-member-m1.11` 26/26 · `qc-member-m3.4` 23/23 (ค่าตั้งคืนสภาพแล้ว)
- ไฟล์ที่แก้รอบนี้: `src/lib/modules/member/{assistant-shared.ts, assistant.ts, assistant-actions.ts}` · `src/app/app/sys/[id]/member/assistant/page.tsx` · `src/components/member/{MemberAssistant.tsx, MemberApiSettings.tsx}` · `src/app/app/sys/[id]/member/settings/api/page.tsx`
- ภาพต้องถ่ายใหม่หลัง build (assistant-owner desktop+mobile · api-webhooks-owner desktop)

### ตรวจภาพ
_(ผู้คุมงาน Opus 5 · 11 ก.ย. ~16:40 UTC · build QC หลังแก้ตีกลับรอบ 1 · เปิดดูภาพเทียบ `27-ai-panel-api.png` ด้วยตาแล้ว)_
- **assistant-owner desktop (ภาพ 27 ซ้าย)**: ตรง — หัว "ผู้ช่วย AI — สมาชิก" · บับเบิลคำถามผู้ใช้ขวา · คำตอบ AI "พบ 23 คน แสดง 5 คนแรก" + ตาราง (ชื่อ + รหัสบรรทัดล่าง · ระดับ · ยอด 12 เดือน · ไม่มา n วัน) · กล่องฟ้า "ข้อเสนอ (ยังไม่ทำ)" การกระทำ + ต้นทุนรวม ฿6,900 · ปุ่ม ยืนยัน (ดำ)/แก้ไข/ยกเลิก · "เครื่องมือที่ใช้: member_search · voucher_issue (รอยืนยัน)" · ช่องพิมพ์ + ส่ง
- ต่างจาก mockup (ยอมรับ): ผู้ช่วย AI กับหน้า API แยกเป็น 2 หน้า (สัญญา M3.10 ให้ /member/assistant + settings/api) · มีคอลัมน์ระดับเพิ่ม
- **รอบแรกตีกลับ**: ตารางแสดงรหัสสมาชิกแทนชื่อ · ชิปชนิด tool สีเทาทั้งหมด → builder แก้ (ชื่อ resolve ฝั่ง server ตามสิทธิ์ผู้ดู ไม่ส่งเข้า prompt AI · ชิป read เขียว/write ฟ้า/danger แดง ด้วยโทเคน)
- **assistant-owner mobile**: ไม่ล้น · ตารางอยู่ในกล่องเลื่อนของตัวเอง · ชื่อขึ้นบรรทัดได้
- **api-webhooks-owner (ภาพ 27 ขวา)**: ตรง — แท็บย่อยตั้งค่า API · คีย์ API ของระบบสมาชิก + ปุ่มสร้างคีย์ (ตารางว่างเพราะคีย์ QC ของข้อสอบถูกลบแล้ว) · ตัวอย่างการเรียก curl พื้นดำ · "54 เครื่องมือในสกิล members" + manifest + ตาราง Tool/Method/ชนิด/สิทธิ์ (ตัวอย่างครบทั้ง 3 ชนิด) · Webhook + เพิ่ม URL + ชิป event + การส่งล่าสุด
- **PARITY: ผ่าน**
