# WO S1.3b — ปิดช่องจากรีวิวย้อนหลัง S1-2 (สิทธิ์ต่อระบบ · ชุด S1-2b)

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-d` branch `wip/sec-s1.3b` (จาก d8625b70) · 2026-11-04T14:19Z · ผู้คุมงาน: Fable 5.1 · builder: Opus (เลน d)
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.3b.md` (8 ข้อ) + COMMON + RESOLUTIONS §I (+ R-K3/R-K4 อ่านประกอบ)
> ข้อสอบ: `scripts/qc-sec-s1.3b.mts` (13 ข้อ · commit test: 52ddabb1 · **แก้หลัง commit หรือไม่: ไม่**) · `scripts/qc-sec-s1.2.mts` ต้องยัง 28/28

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร (ข้อในใบ) | ไฟล์ร่วม (COMMON §D)? |
|---|---|---|---|
| `src/lib/ai/secretary/access-rules.ts` | แก้ (pure) | (1) `TOOL_EXTRA_MODULES` · `moduleOff(access?, module)` · `skippedSectionNote(module)` = `"ข้ามส่วน <ป้าย> (เจ้าของปิดไว้)"` | – |
| `src/lib/ai/tools.ts` | แก้ | (1) `growth_recommendations` (member/pos) · `financial_summary` (pos) · `upcoming_schedule` (booking/hotel/hr) ตัดส่วนที่ OFF + คีย์ `ข้าม` · `customer_points` point OFF ⇒ `{error}` ทั้ง tool · (5) `propose_plan` ตรวจ `kindAllowedByAccess` ทุกขั้นเมื่อมี `ctx.access` | ✅ hot |
| `src/lib/ai/tool-access.ts` | แก้ | (2) export `HAND_TOOL_MODULE` · ใหม่ `HAND_TOOL_CORE` · `UNMAPPED_TOOL_MODULE` · `toolModuleOf` คืน `"__unmapped__"` สำหรับชื่อที่ไม่มีใครประกาศ · `accessVerdict` ปฏิเสธ `__unmapped__` (ข้อความไทย) | ✅ hot |
| `src/lib/ai/secretary/access.ts` | แก้ | (4) `setAccess(tenantId, {userId, membership?}, …)` โหลด Membership จากฐาน (acceptedAt ≠ null · OWNER) · `setAccessAsPlatform` (`setById = platform:<id>`) · ตัวตรวจโมดูล/ระดับใช้ร่วม · re-export ของใหม่ | – |
| `src/lib/ai/plans.ts` | แก้ | (5) `executePlan` หลัง HF-HR-0 ก่อน claim: `planLevelBlock` (getAccess ครั้งเดียว · ขั้นแรกที่ไม่ผ่าน ⇒ คง PENDING · doneCount 0) | ✅ hot |
| `src/lib/ai/proposals.ts` | แก้ | (6) ด่านระดับในสาขาประตู CRM ก่อนส่งต่อ · (8) `accessLevelGate` try/catch ⇒ ไทย + `fallbackModule` | ✅ hot |
| `src/lib/ai/secretary/identity.ts` | แก้ (pure) | (7) CONTROL + U+200B–200F · U+202A–202E · U+2060–2069 · U+FEFF · ชื่อต้องมี `\p{L}`/`\p{N}` · นับ grapheme (`Intl.Segmenter("th")`) · `identityOf` clamp | – |
| `src/app/api/v1/ai/tools/[name]/route.ts` | แก้ | (3) `getAccess` → `toolVerdict(…, {crmLegacyLead, access})` + `runTool({…, access})` | – |
| `src/app/api/v1/ai/skills/route.ts` · `skills/[id]/route.ts` | แก้ | (3) `getAccess` → ตัวกรองสารบัญ `toolVerdict(…, {…, access})` | – |
| `docs/modules/31-secretary.md` | แก้ | §5.2 (identity) · §5.3 ลายเซ็นใหม่ + ลบบรรทัด "ยังไม่ต่อ" | – |

ไม่แตะ `service.ts` · `members.ts` · `prisma/**` · `core/phone-auth` · ไม่รัน `prisma generate` · ไม่แก้ข้อสอบ

## 2. migration / seed / backfill
- ไม่มี

## 5. ผลข้อสอบ (JSON_SUMMARY จริง)
- `qc-sec-s1.3b` forced #1: `JSON_SUMMARY {"total":13,"passed":13,"failed":[],"skipped":[],"findings":[]}` (เขียวตั้งแต่รอบแรกหลังโค้ดครบ)
- `qc-sec-s1.3b` forced #2: `JSON_SUMMARY {"total":13,"passed":13,"failed":[],"skipped":[],"findings":[]}`
- `qc-sec-s1.3b` unforced (ไม่ตั้ง QC_FORCE — ไฟล์มี TOOL_EXTRA_MODULES แล้ว จึงรันจริง): `JSON_SUMMARY {"total":13,"passed":13,"failed":[],"skipped":[],"findings":[]}`
- residue หลังรัน: `RESIDUE {"tenants":0,"users":0,"sec":0}` (Tenant `qc-sec-s13b-*` · User/AiSecretary `qcs13b-*`)
- `qc-sec-s1.2`: `JSON_SUMMARY {"total":28,"passed":28,"failed":[],"skipped":[],"findings":[]}` exit 0
- regression (ครั้งละ 1 รอบ · หลังโค้ดครบ · เทียบ `ledger/qc-baseline/sec-baseline-85751098.txt`) — **เท่า baseline ทุกชุด**:
  - `qc-ai-tools` exit=0 `{"total":18,"passed":18,"findings":[]}` · `qc-ai-tools2` exit=0 `{"total":8,"passed":8}` · `qc-ai-skills` exit=0 `{"total":23,"passed":23}` · `qc-ai-plan` exit=0 `{"total":7,"passed":7}` · `qc-ai-proposals` exit=0 `{"total":16,"passed":16}` · `qc-ai-wave5b` exit=0 `{"total":24,"passed":24}` · `qc-ai-growth` exit=0 `{"total":8,"passed":8}` · `qc-mobile-authz-hotfix` exit=0 `{"total":12,"passed":12}`
  - `qc-ai-api-v1` ไม่มีไฟล์ในรีโป · รันเพิ่ม `qc-hf-apiv1-scope` (route คีย์ API ที่แตะ · ไม่อยู่ใน baseline) exit=0 `{"total":143,"passed":143,"findings":[]}`
- typecheck: `env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=9500M bash scripts/iso.sh pnpm typecheck` → exit 2 · **0 error ใน src/** และไฟล์ที่แตะ · 9 error ทั้งหมดเป็น oracle ของใบที่ยังไม่สร้าง (`scripts/qc-sec-s1.13.mts` quota · `s1.19.mts` phone-auth/routes ×4 · `s1.6.mts` members · `s1.7.mts` kind-class/approval-gate/actions) — ไม่เกี่ยวกับใบนี้
- fitness (ผ่าน qc-sec.sh มี env) exit 0 `{"total":53,"passed":53,"findings":[]}` · (`env -u DATABASE_URL -u DIRECT_URL`) exit 0 `{"total":53,"passed":53,"findings":[]}`

## 7. ข้อแย้ง / มติทางเทคนิค
- **(6) ตำแหน่งด่านระดับของประตู CRM:** ใส่ **ในสาขาประตู CRM** (บรรทัดแรกของสาขา ก่อนเช็ก userId และก่อน `confirmProposalById`) แทนการยกด่านเดิมขึ้นไปหน้าสาขาสำหรับทุก kind — ถ้ายกทั้งก้อนขึ้นไปก่อน ข้อเสนอที่ไม่ใช่ CRM จะได้เหตุผลระดับก่อนด่าน "มองไม่เห็นห้อง → ไม่พบข้อเสนอนี้" / "ทำไปแล้ว" / "หมดอายุ" (เปลี่ยนคำตอบของห้องเดิม + บอกระดับของร้านให้คนที่มองไม่เห็นห้อง) · ด่านเดิมหลัง `assertCan` คงอยู่สำหรับ kind อื่น · kind ของประตูที่ไม่มีใน KIND_ACCESS (`crm.assist.tasks` · `crm.activity.ai_fill`) ตรวจด้วยโมดูล `crm` (`fallbackModule`) — ไม่งั้น `kindAllowedByAccess` จะตอบ "ไม่รู้จักประเภทข้อเสนอนี้" และประตูพังทุกร้าน
- **(2) `HAND_TOOL_CORE`** = ask_clarify list_systems propose_plan load_skill remember_fact forget_fact list_memories support_open_case growth_recommendations · `kb_search` **ไม่**อยู่ใน CORE (อยู่ใน HAND_TOOL_MODULE → kb ตามเดิม · kb OFF ต้องตัด) · `"__unmapped__"` ใช้กับชื่อที่ไม่มีใครประกาศทุกแบบ (hand tool needs ว่างนอก CORE/MODULE · HAND_ACTION_KIND ที่ kind ไม่รู้จัก · ชื่อแปลก) — ตรวจแล้วทุก tool ในทะเบียน (`toolRegistry()`) ไม่มีตัวใดได้ `__unmapped__` (s1.2 B-0 ยังผ่าน) · `propose_plan` ยังเป็น null (s1.2 B-5)
- **(1) รูปผลเมื่อข้าม:** คีย์ `ข้าม: ["ข้ามส่วน <ป้ายไทยของโมดูล> (เจ้าของปิดไว้)"]` เพิ่มเฉพาะเมื่อมีส่วนที่ถูกตัด ⇒ ไม่มี access / ไม่มีโมดูล OFF = JSON เดิมทุกไบต์ · `financial_summary` pos OFF ⇒ ไม่คืน `รายได้บาท` และ `กำไรคร่าวบาท` (กำไร = รายได้ − รายจ่าย เผยรายได้ได้) คืนเฉพาะรายจ่าย + หมายเหตุ · `growth_recommendations` member OFF ⇒ ไม่นับลูกค้า (กติกา MARKETING/CRM ไม่ทำงาน) · pos OFF ⇒ ไม่นับบิล (กติกา INVENTORY ไม่ทำงาน) · `upcoming_schedule` OFF ส่วนไหน = ไม่ query ส่วนนั้นเลย · `moduleOff` ใช้ `levelVerdict(…, write=false)` ⇒ READ = ไม่ตัด · โมดูลนอกรายการ = ตัด (ปิดไว้ก่อน)
- **(5) แผน:** pre-check ใช้ `kindAllowedByAccess` กับทุกขั้น (kind ที่ไม่รู้จัก = ปฏิเสธ "ไม่รู้จักประเภทข้อเสนอนี้" และแผนคง PENDING — เดิม `runKind` throw แล้วแผน FAILED; createPlan กันชื่อปลอมไว้แล้วจึงเกิดได้เฉพาะแถวที่เขียนตรงลงฐาน) · อ่านฐานไม่ได้ = ปฏิเสธไทย (ไม่ claim) · `propose_plan` ข้าม kind ที่ไม่รู้จัก (ปล่อยให้ createPlan ปฏิเสธด้วยข้อความเดิม)
- **(4) `setAccess`:** `by.membership` ไม่ถูกอ่านเลย (hint · คงช่องไว้ให้ผู้เรียกเดิม) · `userId` ว่าง = Forbidden โดยไม่ query · `setAccessAsPlatform` **ไม่ตรวจสิทธิ์แพลตฟอร์มเอง** (ผู้เรียก — route H4 ของ S1.17/R-K12 — ต้องตรวจ) · ยังไม่มีผู้เรียกในโค้ด
- **(3) route คีย์ API:** ค่าเริ่มต้น chat = READ ใช้กับคีย์ด้วย — ตรวจแล้วไม่มีเครื่องมือเขียนของโมดูล chat ในทะเบียน (มีแค่ `chat_unread_conversations` อ่าน) ⇒ ร้านที่ไม่เคยตั้งระดับ = คีย์ได้ชุดเดิม · `getAccess` เพิ่ม 1 query ต่อคำขอ
- **(7) identity:** ข้อความ error ของอักขระควบคุมเปลี่ยนเป็น "ชื่อเลขาต้องอยู่บรรทัดเดียว และห้ามมีอักขระที่มองไม่เห็น — …" (ครอบทั้งบรรทัดใหม่และ zero-width) · ไม่มี `Intl.Segmenter` = นับ code point (fallback) · `identityOf` ชื่อที่ clamp แล้วไม่มีตัวอักษร = "Shark"
- ทางที่เรียกโมเดลเพิ่มในใบนี้: **ไม่มี**
- ใครได้/เสียสิทธิ์: ร้านที่ไม่มีแถว `AiSystemAccess` = ไม่มีใครเปลี่ยน · เมื่อ OWNER ตั้ง OFF: (ก) แชท AI ไม่เห็นข้อมูลของโมดูลนั้นผ่าน 4 tool ที่อ่านข้ามโมดูล (ข) คีย์ API เสียเครื่องมือ/สารบัญของโมดูลนั้น (403 / ไม่อยู่ในสารบัญ) (ค) ข้อเสนอประตู CRM กดไม่ได้เมื่อ crm OFF/READ (คง PENDING) (ง) แผนที่มีขั้นของโมดูลนั้นเสนอไม่ได้ / กดแล้วคง PENDING · `setAccess`: คนที่ส่ง membership ปลอม (OWNER) แต่ในฐานไม่ใช่ OWNER = เสียทาง · OWNER ที่ยังไม่ยอมรับคำเชิญ (`acceptedAt = null`) = ตั้งไม่ได้ · ทีมงานแพลตฟอร์มได้ทาง `setAccessAsPlatform` (ยังไม่มี route)

## 8. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| `setAccessAsPlatform` ยังไม่มีผู้เรียก/route + ด่านสิทธิ์แพลตฟอร์ม | ใบสั่งให้เพิ่มฟังก์ชันเท่านั้น | S1.17 (H4 · R-K12) |
| tool อื่นที่อ่านข้ามโมดูลนอก 4 ตัวนี้ (ถ้ามี) ยังไม่อยู่ใน `TOOL_EXTRA_MODULES` | ใบระบุ 4 ตัว · ไม่ได้ไล่ทุก tool | ผู้คุมตัดสิน (ผู้ตรวจ S1-2b) |
| `customer_points` ยังถูกยื่นให้โมเดลเมื่อ point OFF (ปฏิเสธตอนรัน) | ใบให้ปฏิเสธในตัว tool · ตัดตอนยื่นต้องให้ `accessVerdict` อ่าน TOOL_EXTRA_MODULES แบบรายตัว | ผู้คุมตัดสิน |

## 9. คืนสภาพฐาน QC เลขา
- ข้อสอบ `finally` ลบ tenant `qc-sec-s13b-*` + แถวลูก + AiSecretary/User `qcs13b-*` · regression แต่ละชุดคืนสภาพเอง · ใบนี้ไม่มี seed
