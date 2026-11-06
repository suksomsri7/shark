# WO S3a.1-S2 — แก้ผลนักล่า: สิทธิ์ · API · PDPA · ความลับ

> RUN "เลขา AI" · เลน c `/root/projects/shark-sec-c` · branch `wip/sec-s3a1-s2` (จาก 67900c01f) · builder Opus · 6 พ.ย. 2026 (UTC)
> สัญญา: `sec-brief-S3a.1-S2.md` + RESOLUTIONS §Z.2 (R-Z13…R-Z27) · ข้อสอบ `scripts/qc-sec-s3a1-s2.mts` (ไม่แก้)

## 1. มติ → ไฟล์
| มติ | ไฟล์ | ทำอะไร |
|---|---|---|
| R-Z13 | `src/lib/modules/crm/ai-bridges.ts` | `isSecretaryRoomConversation` · `loadDoorRow` ห้องเลขา ⇒ NOT_FOUND · `cancelProposalById` ห้องเลขา ⇒ handled:false (ทางทั่วไป) · `confirmProposalById` ห้องเลขา ⇒ handled:true ok:false (ไม่ยืนยันผ่านประตู) |
| R-Z13/R-Z20 reject | `src/lib/ai/secretary/teach.ts` (`rejectFor` ใหม่ · `visibleProposal` ใช้ `isDoorRow`) · `secretary/proposals/[id]/reject/route.ts` · `secretary/server-actions.ts` (secRejectProposalAction) | ทางเดียวแอป+เว็บ: ประตู CRM ยกเลิกด้วยสิทธิ์คนกด + บันทึก note · 403 forbidden · 409 not_pending ทั้งมี/ไม่มี note · ห้องเลขา = ทางทั่วไป |
| R-Z14 | `src/lib/ai/secretary/digest.ts` (`DigestScope` · `viewerScope` · `viewerDigest` · cache คีย์ร้าน+ผู้ดู+สาขา) · `secretary/digest/route.ts` · `server-actions.ts` (secGetDigestAction) · `suggest.ts` | ยอดขาย POS/นัด/ออเดอร์ = สาขาที่ `evaluate(m,{module,action,unitId})` ผ่าน · ลูกค้าเงียบ count+sample ผ่าน `contactWhere` (visibleWhere) ของผู้ดู |
| R-Z15 | `src/lib/staff/service.ts` (`targetRoleProblem` ใน update/revoke/restore + reactivate ใน grant) · `levels.ts` (wildcard) · `secretary/staff/[membershipId]/route.ts` (422 sensitive_key) | |
| R-Z16 | `src/lib/ai/secretary/actions.ts` | `visibleRoomSights` — สมาชิก seeHistory=false เห็น log ตั้งแต่ addedAt (listLog + undoAction) |
| R-Z17 | `src/lib/ai/secretary/approval-gate.ts` | `SECRETARY_GATED_KINDS` (chat.send · booking_refund_deposit) ใช้ด่านผู้อนุมัติทุกบทสนทนา (ข้อเสนอเดี่ยว + แผน) — ไม่แตะ proposals.ts |
| R-Z18 | `src/app/api/mobile/auth/_otp.ts` (ใหม่) · `auth/sms/verify` · `auth/phone/link` · `src/lib/core/phone-auth.ts` (`verifyRateLimit`) | zod strict ≤4 KB · `sms-verify:ip:` 30/10 นาที + `sms-verify:ph:<hash>` 10/10 นาที · 401 ยุบเป็น invalid (เว้น bad_phone/locked) |
| R-Z19 | `inbox/attachments/route.ts` | magic bytes · ไม่รับ svg/txt · contentType = ที่ตรวจได้ |
| R-Z20 | `inbox/_shared.ts` (`withErrors` · `safeMessage` · ข้อความไทยด่าน) · `secretary/_shared.ts` (`withErrors` → `thrown`) · route ทั้งหมดของ inbox/** + secretary/** (ยกเว้นของเลน b: rooms POST · rooms/[id]/send · scheduled/* · tenants/create) · routing (30 + ไม่ส่ง e.message) · read (120) · quick-replies apply (60) · `/me` (120 + message) · rules (INT4 — route + lib) · reply bounds · `staff/_staff.ts` (429 มาตรฐาน) |
| R-Z21 | `src/lib/platform/account-deletion.ts` (`verifyDeletionStepUp`) · `secretary/account/delete/route.ts` | code = SMS ของเบอร์ตัวเอง (consume) · ไม่มีเบอร์ = OTP อีเมล (`verifyOtp`) |
| R-Z22 | `src/lib/ai/tools.ts` (kb_auto_save→`kb.save` · forget_fact→`memory.forget` ในห้องเลขา · remember_fact ห้องบริบทลูกค้า forcePending) · `src/lib/ai/memory.ts` (`forcePending`) · `src/lib/ai/kind-tables.ts` (2 kind) · `src/lib/ai/proposals.ts` (dispatch 2 บรรทัด) · `src/lib/ai/secretary/memory-proposals.ts` (ใหม่) · `src/lib/ai/persona.ts` · docs 31 §388/§434 |
| R-Z23 | `src/lib/ai/secretary/members.ts` (`forbidden_chat`) · `rooms/[id]/members/route.ts` (403) |
| R-Z24 | `tools.ts` (`maskToolOutput` ใน runTool · chat_unread ไม่อ่านเบอร์) · `src/lib/modules/chat/ai-suggest.ts` (ตัดเบอร์สมาชิก · ตัดโน้ตภายใน · mask ข้อความ · กฎข้อ 6 data-not-instructions) · `persona.ts` |
| R-Z25 | `tools.ts` (`chatConvVisible` ก่อน kanban_card_from_chat) |
| R-Z26 | `src/lib/core/ops.ts` (`errDetail` · ตัด `invocation:` ใน logOps · `sweepOpsRetention`) · `src/lib/platform/cron.ts` (เรียกใน runDailyCron) · `chat/send/route.ts` (SSE) · actions.ts (undo note) · account-deletion (ลบร่องรอย) · web staff pages + `staff/service.ts` (publicEmailOf/placeholder) · members.ts/teach.ts ชื่อสำรอง |
| R-Z27 | `.gitignore` · `phone-auth.ts` (HMAC + dual-verify · ข้อความ SMS) · `sms.ts` (VERCEL_ENV) |
| docs | `docs/api/SECRETARY-API.md` (กติกาข้อ 3/6 + แถวที่แตะ) · `docs/modules/31-secretary.md` |

## 2. ไฟล์ร่วม (บรรทัดของมติตัวเอง)
- `src/lib/ai/proposals.ts`: L1035 (`kb_create_article || kb.save`) · L1403-1404 (dispatch `memory.forget`) — R-Z22 เท่านั้น
- `src/app/api/mobile/chat/send/route.ts`: L6-15 (import + `sseError`) · L47-48 (catch ของ SSE) — R-Z26
- `src/lib/ai/service.ts`: ไม่แตะ
- นอกรายการแต่จำเป็น: `src/lib/ai/memory.ts` L44-50 (forcePending) · `src/lib/ai/kind-tables.ts` L60-63/L114-116 · `src/lib/platform/cron.ts` L9 + L420-421 · `src/lib/ai/secretary/server-actions.ts` (import 4 บรรทัด · secRejectProposalAction · secGetDigestAction — เลน b แก้ secStartRoomAction คนละ hunk) · `src/lib/ai/secretary/suggest.ts` (scope digest)

## 3. ทางเลือก OTP (R-Z27)
- **dual-verify**: รหัสใหม่เก็บ HMAC(SESSION_SECRET) · ตรวจรับ sha256 เดิมด้วย (`codeMatches`) ⇒ รหัสที่ขอก่อน deploy ใช้ได้จนหมดอายุ 10 นาที · ลบสาขา sha256 ได้หลัง deploy > 10 นาที · ไม่มี SESSION_SECRET (สคริปต์) = sha256 แบบเดิม

## 4. ต่างจากมติ
- sweep (R-Z26) อยู่ใน `runDailyCron` (cron tick รายวัน) ไม่ใช่ hourly — hourly เป็นไฟล์ของเลน b (ห้ามแตะ) · อายุเก็บไม่เปลี่ยน (sms-mock ค้างได้สูงสุด ~2 วันบน QC/dev — production ไม่มี mock)
- persona T1-2: ห้องเดิมต้องได้ prompt เดิมทุกไบต์ (C.11 · s1.2 P-1) ⇒ ถ้อยคำเดิมประกอบจากชิ้น (`NOW_NO_ASK`/`NOW_NO_CONFIRM`) · ห้องบริบทลูกค้าใช้ถ้อยคำใหม่ — ข้อสอบตรวจซอร์สด้วย regex จึงผ่าน ขอ ORACLE-EDIT ให้ตรวจ prompt ที่สร้างจริงแทน
- inbox/attachments ไม่รับ text/plain อีกต่อไป (ไม่มี magic bytes)

## 5. ผลรัน (6 พ.ย. UTC)
- oracle `qc-sec-s3a1-s2` forced: #1 (ก่อน merge) 28/28 · #2 (หลัง merge tip 1d112c7b2) 28/28 — D-1/D-2 fitness ผ่าน
- `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` = 53/53 · pre-commit fitness ผ่าน
- typecheck: 1 error ที่ `scripts/qc-sec-s3a1-s2.mts(170,130)` (Uint8Array → BlobPart ของข้อสอบเอง · มีตั้งแต่ tip) — src 0
- regression: s1.6 16/16 · s1.7 27/27 · s1.12 15/15 · s1.14 13/13 · s1.14b 24/24 · s1.21 19/19 · s1.22 14/14 · s1.25 19/19 · s3a.1 16/17 (R-1 SKIP โมเดลจริง) · s1.2 28/28 · s1.10 13/13 ·
  qc-ai-memory 7/7 · ai-proposals 16/16 · ai-tools 18/18 · ai-tools2 8/8 · ai-actions 11/12 CRASH (= baseline 049df880b) · ai-phase-b2 11/11 · ai-plan 7/7 · chat-ai-suggest 44/44 · chat-attachments 37/37 · mobile-auth 31/31 · mobile-chat 29/29 · approval 16/16
- **s1.19 แดง (Q-1 · V-2 · R-2 crash)** = ข้อสอบเทียบ/แกะ `sha256(phone:code)` ตรง ๆ — ชนกับ R-Z27 HMAC ⇒ ORACLE-EDIT (§6) · สำเนาชั่วคราวที่แก้ `sha` เป็น HMAC (ลบแล้ว) = 25/26 ข้อเดียวที่แดงคือ S-2b (OTP อีเมล ยัง sha256 — สำเนาแก้เกินไปทั้งไฟล์)
- qc-crm-c3.4 52/53: X2.2 `krabiDeals=0 ownerControl=false` — ฐาน QC เลขาไม่มีทีม krabi ของ seed (อ่านฐานตรง ไม่ผ่านโค้ดที่แก้) · ไม่อยู่ใน baseline 049df880b

## 6. ORACLE-EDIT ที่ขอ
- **s1.19 L46/L51 + Q-1**: แยก helper ของเบอร์ `const hmacPhone = (v) => (process.env.SESSION_SECRET ? createHmac("sha256", process.env.SESSION_SECRET) : createHash("sha256")).update(v).digest("hex")` · `crack()` + Q-1 (`row.codeHash === …`) ใช้ hmacPhone · `sha` คงไว้ให้ OTP อีเมล (S-2b)
- **s3a1-s2 L170**: `new File([bytes as BlobPart], …)` (typecheck)
- **s3a1-s2 T1-2**: ตรวจ prompt ที่ `buildSystemPrompt({…, customer})` สร้างจริง แทน regex บนซอร์ส
- **s1.14 R-2**: regex `/export async function (POST|…)/` ไม่เจอแล้ว (route เป็น `export const POST = withErrors(…)`) ⇒ ตรวจว่างเปล่า — ควรเป็น `/(export async function|async function) (POST|PUT|DELETE|PATCH)_?\(/`
