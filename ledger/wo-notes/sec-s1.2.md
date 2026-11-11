# WO S1.2 + S1.3 — ตัวตนเลขา (secretary.ts + persona) · สิทธิ์ต่อระบบ 3 ระดับ (access.ts + ด่านเครื่องมือ)

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-c` branch `wip/sec-s1.2` (จาก 7c69188a) · 2026-11-04T13:08Z · ผู้คุมงาน: Fable 5.1 · builder: Opus (เลน c)
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.2.md` (+ COMMON + RESOLUTIONS R-K3 R-K4 §F §G)
> ข้อสอบ: `scripts/qc-sec-s1.2.mts` (28 ข้อ · commit test: 3f1e94c4 · **แก้หลัง commit หรือไม่: ไม่** — ขอ ORACLE-EDIT 2 รายการ §7)
> commit ของใบ: `46a96320` feat(sec): s1.3 … · `76d543fb` feat(sec): s1.2 … · docs commit ถัดไป (ไฟล์นี้ + docs §5)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | ไฟล์ร่วม (COMMON §D)? |
|---|---|---|---|
| `src/lib/ai/secretary/identity.ts` | ใหม่ | pure (ไม่ import อะไร): `SECRETARY_DEFAULT` `TONES` `LANGUAGES` · `normalizeIdentityPatch` (ตรวจไทย) · `identityOf` · `sampleSpeech` · `secretaryPromptBlock` · `secretaryHeadline` · `languageRule` | – |
| `src/lib/ai/secretary/secretary.ts` | ใหม่ | `ensureSecretary` · `secretaryOf` · `updateSecretary` (prisma ตรง · แกน global) + re-export identity | – |
| `src/lib/ai/secretary/access-rules.ts` | ใหม่ | pure (ไม่ import อะไร): `ACCESS_LEVELS` `AI_MODULES` (27) `ALWAYS_ON` ค่าเริ่มต้น ป้ายไทย · `accessFromRows` · `levelVerdict` · `accessSummaryForPrompt` | – |
| `src/lib/ai/secretary/access.ts` | ใหม่ | `getAccess` (1 query) · `setAccess` (OWNER · AUTO ปฏิเสธ) + re-export rules + 4 ฟังก์ชันของ tool-access | – |
| `src/lib/ai/tool-access.ts` | แก้ | `toolVerdict(…, {access?})` (ห่อตัวเดิมที่เปลี่ยนชื่อเป็น `membershipToolVerdict` — เนื้อเดิมไม่แตะ) · `toolsOfferedTo(…, access?)` · ใหม่ `HAND_TOOL_MODULE` · `toolModuleOf` · `toolIsWrite` · `accessVerdict` · `kindAllowedByAccess` | ✅ hot |
| `src/lib/ai/tools.ts` | แก้ | `ToolCtx.access?` · `runTool` ส่ง access เข้า `toolVerdict` (1 บรรทัด) + import type | ✅ hot |
| `src/lib/ai/proposals.ts` | แก้ | `executeProposal` หลัง `assertCan` + `runKind` หลัง `assertCan` → `accessLevelGate` (import `./secretary/access` ตอนเรียก กันวงโหลด) | ✅ hot |
| `src/lib/ai/persona.ts` | แก้ | `PersonaContext.secretary?`/`access?` · บรรทัดแรก/กติกาภาษาเลือกตาม secretary · บล็อกตัวตนก่อน "กติกา:" · บรรทัดระดับท้ายกติกา | – |
| `src/lib/ai/service.ts` | แก้ | `Promise.all` เดิม + `secretaryOf` (member เท่านั้น) + `getAccess` → `toolsOfferedTo(…, access)` · `ToolCtx.access` · `PersonaContext.{secretary, access}` | ✅ hot |
| `docs/modules/31-secretary.md` | แก้ | §5.2/§5.3 ลายเซ็นตรงของจริง | – |

ไม่แตะ `prisma/**` · ไม่รัน `prisma generate` · ไม่สร้าง route · `skills.ts`/`rbac.ts` อ่านอย่างเดียว (ไม่ต้องแก้)

## 2. migration / seed / backfill
- ไม่มี (ใช้ตาราง `AiSecretary` · `AiSystemAccess` ของ S1.1)

## 5. ผลข้อสอบ (JSON_SUMMARY จริง)
- `qc-sec-s1.2` forced #1: `JSON_SUMMARY {"total":28,"passed":27,"failed":["R-2"],"skipped":[],"findings":[{"id":"R-2","sev":"CRITICAL"}]}`
- `qc-sec-s1.2` forced #2: `JSON_SUMMARY {"total":28,"passed":27,"failed":["R-2"],"skipped":[],"findings":[{"id":"R-2","sev":"CRITICAL"}]}`
- (unforced = เหมือน forced เพราะ secretary.ts มีแล้ว — ด่าน SKIP ของข้อสอบดูแค่ไฟล์)
- residue หลังรัน: `RESIDUE {"sec":0,"users":0,"tenants":0,"access":0}` (AiSecretary `qcs12-*` · User `qcs12-*` · Tenant `qc-sec-s12-*` · AiSystemAccess ทั้งตาราง)
- R-2 แดงเพราะ regex ของข้อสอบ (ดู §7 ORACLE-EDIT 1) — พฤติกรรมถูก: vd ปฏิเสธด้วยเหตุผลระดับ · vs ผ่าน · vs2 ปฏิเสธด้วยเหตุผล membership เดิม
- regression (ครั้งละ 1 รอบ · หลังโค้ดครบ · เทียบ `ledger/qc-baseline/sec-baseline-2c2062c7.txt`):
  - `qc-ai-brain` exit=0 `JSON_SUMMARY {"total":8,"passed":8,"findings":[]}` = baseline
  - `qc-ai-tools` exit=0 `JSON_SUMMARY {"total":18,"passed":18,"findings":[]}` = baseline
  - `qc-ai-tools2` exit=0 `JSON_SUMMARY {"total":8,"passed":8,"findings":[]}` = baseline
  - `qc-ai-skills` exit=0 `JSON_SUMMARY {"total":23,"passed":23,"findings":[]}` = baseline
  - `qc-ai-phase-a` exit=0 `JSON_SUMMARY {"total":9,"passed":9,"findings":[]}` = baseline
  - `qc-mobile-authz-hotfix` exit=0 `JSON_SUMMARY {"total":12,"passed":12,"findings":[]}` = baseline
  - `qc-pos-p3.9` exit=4 (ไม่มี JSON_SUMMARY · ไม่อยู่ใน baseline): ข้อสอบนี้หยุดเองเมื่อฐานไม่ใช่ QC4 `ep-frosty-lab` ("จะเขียนแถวได้เฉพาะ QC4 … ยังไม่ได้เขียนอะไร") ⇒ รันบนฐานเลขาไม่ได้ · ข้อสถิตก่อนหยุด: ST1 ST2 ST3 ST5 PV4 ✅ · ST4 ❌ = ไฟล์ของ S1.1 (`prisma/migrations/20261227000000_secretary_a` · `prisma/schema/{ai,secretary,support}.prisma`) ต่างจากหมุด 8bded5a7 — ไม่ใช่ไฟล์ของใบนี้
- typecheck: `env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=9500M bash scripts/iso.sh pnpm typecheck` (ISO_MEM ต้องอยู่หน้า iso.sh — iso.sh อ่าน MemoryMax จาก env ของตัวเอง) → exit 2 · **0 error ใน src/** · 5 error: `scripts/qc-sec-s1.4.mts` ×3 (รู้อยู่แล้ว) + `scripts/qc-sec-s1.2.mts` ×2 (:112 `permissions` เป็น `Record<string, unknown>` ใส่ช่อง Json ไม่ได้ · :152 แปลง `HAND_TOOL_ACCESS` เป็น `needs: {module}[]` แบบ mutable ไม่ได้ เพราะ `HandRule.needs` เป็น `readonly` — ทั้งสองเป็นของข้อสอบ ไม่เกี่ยวกับโค้ดใบนี้ · ดู §7 ORACLE-EDIT 2)
- fitness (มี env · ผ่าน qc-sec.sh) exit 0 `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}` · (`env -u DATABASE_URL -u DIRECT_URL`) exit 0 `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}` · pre-commit (fitness) ผ่านทั้ง 2 commit

## 7. ข้อแย้ง / มติทางเทคนิค
- **ORACLE-EDIT 1 (s1.2-R-2):** `!/ปิด|อย่างเดียว/.test(vs2.reason ?? "")` → `!/ปิดไม่ให้|อย่างเดียว/.test(vs2.reason ?? "")` · เหตุ: "ปิด" เป็นส่วนหนึ่งของคำว่า "เปิด" และเหตุผล membership เดิม (`denyMember` tool-access.ts) ลงท้าย "ขอให้เจ้าของร้าน**เปิด**สิทธิ์ให้ก่อน" — ข้อความเดิมห้ามเปลี่ยน (byte-identical) · R-3/R-6 ใช้ `ปิดไม่ให้` อยู่แล้ว
- **ORACLE-EDIT 2 (s1.2 typecheck · ไม่กระทบผล):** :112 `permissions: Record<string, unknown>` → `permissions: Record<string, unknown> as Prisma.InputJsonObject` (หรือ `as never`) · :152 `as Record<string, { needs: { module: string }[] }>` → `as unknown as Record<string, { needs: readonly { module: string }[] }>`
- **ไฟล์เพิ่ม 1 ไฟล์ (`identity.ts`)** นอกรายการ "Files you own": persona.ts ต้องเรียก `secretaryPromptBlock` แต่ secretary.ts import prisma — แยกส่วน pure ไว้ใน identity.ts (ไม่ import อะไร) แล้ว secretary.ts re-export ทั้งหมด ⇒ oracle/ผู้เรียกใช้ `@/lib/ai/secretary/secretary` ได้ตามสัญญา
- **ที่อยู่ของ `toolModuleOf`/`toolIsWrite`/`accessVerdict`/`kindAllowedByAccess` = tool-access.ts** (re-export จาก access.ts ตามสัญญา) — ตัวกติการะดับ (`levelVerdict`, ป้าย, ค่าเริ่มต้น) อยู่ใน access-rules.ts ที่ไม่ import อะไร · ถ้าวางการแปลงชื่อเครื่องมือไว้ใน access-rules จะเกิดวง tool-access ↔ access-rules (การแปลงต้องใช้ `HAND_TOOL_ACCESS`/`moduleToolQuery`/ข้อมูลทะเบียน op ที่อยู่ใน tool-access) — repo เคยแดง F10.1 จากวงโหลด TDZ (fitness.mts F2.4) จึงเลือกไม่มีวง
- **proposals.ts import `./secretary/access` แบบ `await import()` ตอนเรียก** (access → tool-access → proposals = วง ถ้า import บนหัวไฟล์)
- **`HAND_TOOL_MODULE` (ใหม่ใน tool-access):** เครื่องมือเขียนมือที่ `needs: []` แต่อ่านข้อมูลโมดูล (low_stock→inventory · pending_leaves→hr · kb_search→kb · reward_list_redemptions→reward · today_appointments→booking · queue_waiting→queue · shop_pending_orders→shop · rental_active→rental · restaurant_today→restaurant · ticket_event_sales→ticket · approvals_pending→approval · recent_leads→crm) — ตามลำดับในใบ (`hand.needs[0].module ?? …`) ตัวพวกนี้จะได้ null = ไม่ถูกตัดแม้เจ้าของปิดระบบนั้น · ใช้กับระดับเท่านั้น ไม่เปลี่ยนด่าน membership · ผลต่อ `AI_MODULES`: เพิ่ม marketing coupon reward point ticket restaurant calendar (B-0 ต้องครอบ — KIND_ACCESS/needs ใช้อยู่จริง)
- **`accessVerdict` ตรวจโมดูลที่สองด้วย** (`EXTRA_MODULE_TOOL_NEEDS`: `kanban_card_from_chat` อ่านแชท ⇒ chat OFF = ปฏิเสธ · chat READ ค่าเริ่มต้นผ่าน)
- **ด่านระดับใช้กับทุก actor เมื่อส่ง access** (รวมคีย์ API) — ปัจจุบันผู้ส่ง access มีแค่ `sendMessage`
- **ค่าในฐานที่เพี้ยน:** ระดับไม่รู้จัก = OFF (ปิดไว้ก่อน) · "AUTO" = DRAFT · โมดูลที่ไม่อยู่ใน `AI_MODULES`/`ALWAYS_ON` = ปฏิเสธใน `levelVerdict`
- **`setAccess` upsert ผ่าน `prisma` ตรง:** guard ของ `tenantDb` ห่อ where ของ upsert ด้วย `AND` ซึ่งใช้กับคีย์ unique ผสม (`tenantId_module`) ไม่ได้ (PrismaClientValidationError) — tenantId อยู่ในคีย์เอง แบบเดียวกับ `aiUsage.upsert` ใน service.ts · `getAccess` ใช้ `tenantDb`
- **`"` ในชื่อ/คำลงท้าย** แทนด้วย `'` ตอนใส่ prompt (ไม่ได้เพิ่มกติกาตรวจ) · ชื่อ/คำลงท้ายปฏิเสธอักขระควบคุมทุกตัว (รวม \n \r \t U+2028/2029) ไม่ใช่แค่บรรทัดใหม่
- **ข้อความ ForbiddenError ของ setAccess** = `ไม่มีสิทธิ์: ai.secretary.access.set` (ตัวสร้างของ rbac) — คีย์นี้ไม่มีในทะเบียนสิทธิ์ ใช้เป็นป้ายเท่านั้น (OWNER เท่านั้นโดยกติกา)
- persona: บรรทัดระดับต่อระบบอยู่ท้ายกติกา และพูดถึงเฉพาะค่าที่ต่างจากค่าเริ่มต้น (chat READ ไม่พูด · DRAFT ไม่พูด) — ใช้ได้ทั้งห้องเดิมและห้องเลขา · prompt ยังเป็นภาษาไทยตามไฟล์เดิม (§5.2 เดิมเขียน "prompt อังกฤษ" — แก้เป็นของจริงแล้ว)
- ทางที่เรียกโมเดลเพิ่มในใบนี้: **ไม่มี** (`sampleSpeech` ไม่เรียกโมเดล)
- ใครได้/เสียสิทธิ์: ไม่มีแถว = ไม่มีใครเปลี่ยน · OWNER ได้ `setAccess` (ยังไม่มี route — S1.14) · เมื่อ OWNER ตั้ง OFF/READ: ทุกคนในร้าน (รวม OWNER) เสียเครื่องมือของโมดูลนั้นในแชท AI + การกดยืนยันข้อเสนอ/ขั้นแผนของโมดูลนั้น

## 8. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| route คีย์ API `/api/v1/ai/tools/[name]` + `/api/v1/ai/skills*` ไม่ส่ง `access` ⇒ ระดับต่อระบบไม่บังคับกับเครื่องมือที่เรียกตรงจากภายนอก (ข้อเสนอที่สร้างยังติดด่านตอน execute) | นอก "Files you own" (ห้ามแตะ route) | ผู้คุมตัดสิน (S1.14 หรือใบ API) |
| ประตู CRM ใน `executeProposal` (`crm.assist.tasks` · `crm.activity.ai_fill` · `crm_create_lead` นามบัตร · `crm.*` ที่มี `requestedByUserId`) คืนก่อนถึงด่านระดับ — ข้อเสนอจากปุ่ม AI ในหน้า CRM ไม่ติด crm OFF | ใบกำหนดจุด "หลัง assertCan" · ปุ่มในหน้า CRM ไม่ใช่เลขา (ตีความว่าควรติดหรือไม่ = ผู้คุม) | ผู้คุมตัดสิน |
| `propose_plan` ยังรับขั้นของโมดูลที่ OFF/READ ตอนเสนอ (ปฏิเสธตอนรันขั้นใน `runKind`) | ใบให้ hook ที่ runKind · ตัดตอนเสนอต้องแก้ proposePlan ใน tools.ts (นอกขอบ "1 บรรทัดใน runTool") | S1.8 หรือใบแผน |
| `prefs` ของ AiSecretary ยังไม่มีทางแก้ | ไม่อยู่ในลายเซ็นของใบ | S1.14/S2.7 |

## 9. คืนสภาพฐาน QC เลขา
- ข้อสอบ `finally` ลบ tenant `qc-sec-s12-*` + แถวลูก + AiSecretary/User `qcs12-*` · ตรวจหลัง forced #2: `RESIDUE {"sec":0,"users":0,"tenants":0,"access":0}`
- regression แต่ละชุดคืนสภาพเอง (ไม่มี seed ของใบนี้)
