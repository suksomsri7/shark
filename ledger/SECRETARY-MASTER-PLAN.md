# SHARK · "เลขา AI" (Shark) — MASTER-PLAN v2 · 3 พ.ย. 2026 (แก้ตามมติ: แอป native · TestFlight ก่อน)

> แผนงานจากแบบร่าง 3 (`DESIGN-AI-HIRE.md` §0 มติ 9 ข้อ + §0.1 แก้รอบ 3–4 R1–R9) · แทนแผนเดิม `shark-ai/ledger/AI-TEAM-MASTER-PLAN.md` (49 ใบ "ทีมพนักงาน AI" · ทำไป 2/49 · เลิกใช้)
> ผู้วางแผน: Fable 5.1 (อ่านอย่างเดียว · ตัวเลขทุกตัวในเอกสารนี้ตรวจจากโค้ด `origin/main` @ `a84bca2b` วันที่ 3 พ.ย.) · ผู้ทำ: Opus (builder) ตามกติกา [[feedback-fable-plans-opus-executes]]
> ⚠️ นี่คือแผน ยังไม่มีโค้ด · เริ่ม RUN เมื่อเจ้าของสั่ง "เริ่ม RUN เลขา" และตอบคำถาม §9

---

## 0. ข้อเท็จจริงจากโค้ด (สิ่งที่มีแล้ว · ใช้ต่อ · ขาด)

| เรื่อง | มีอยู่แล้วบน main (ใช้ต่อ ห้ามสร้างซ้ำ) | ขาด / ต้องเปลี่ยน |
|---|---|---|
| ห้องแชท AI | `AiConversation`/`AiMessage` (ai.prisma) · ผู้สร้างฝังใน id `u~<userId>~…` (`conversation-owner.ts`) · การมองเห็น: ผู้สร้างเท่านั้น | ไม่มีคอลัมน์สถานะ/สมาชิก/ผู้เขียนข้อความ → ตารางข้าง `AiRoom` + `AiRoomMember` + `AiMessage.authorUserId` (nullable) |
| สิทธิ์ตอนใช้เครื่องมือ | `actor.ts` (member/apiKey/system) · `tool-access.ts`: `toolsOfferedTo` + `toolVerdict` + `actorCanConfirmKind` (สิทธิ์ = membership ของคนสั่ง) | ไม่มี "ระดับต่อกิจการ×ระบบ" (ปิด/ดู/ร่าง) → ตาราง `AiSystemAccess` ต่อเข้าด่านเดิม 2 ชั้น (ไม่สร้าง engine ใหม่) |
| ข้อเสนอรออนุมัติ | `proposals.ts` 1,436 บรรทัด: `createProposal/executeProposal/runKind` · kinds `account.* kanban.* member.* crm.*` + static · `risk NORMAL/DESTRUCTIVE` · TTL 24 ชม. · `plans.ts` = หลายขั้น (การ์ดขั้นตอน A3) | ไม่มี kind ส่งข้อความถึงลูกค้า (มีแค่ `chat_unread_conversations`) → เพิ่ม `chat.send` · ไม่มี "ต้องอนุมัติเสมอ" แบบตั้งค่าได้ · ไม่มีบันทึกการกระทำ/ย้อนกลับ |
| งานประจำ | `AiScheduledTask` (instruction · hourBkk · lastRunDay) · `scheduled.ts` รันด้วย actor `SHOP_AUDIENCE` (สิทธิ์ต่ำสุด) | ความถี่/วัน/นาที/ช่องทาง/เจ้าของงาน ไม่มี → คอลัมน์ nullable เพิ่ม · ต้องรันด้วยสิทธิ์ผู้สั่ง (มติ §4 ข้อ 7) |
| เลขาเสนองาน (A2) | `proactive.ts`: `gatherProactiveInsights` (deterministic · ไม่แตะ LLM · lowStock/pendingApprovals/…) | ยังผูก AppNotification รายวัน → เพิ่มทางอ่านเป็น "ข้อเสนอ" ในหน้า A2 |
| ความรู้ของกิจการ (B6) | `AiMemory` (ต่อ tenant · มีผู้จด) · `memory.ts` | ไม่มีสถานะ "รอเจ้าของยืนยัน" จากการสอน (C4) → เพิ่ม `status` nullable |
| ตัวตน | `persona.ts` = ผู้ช่วยประจำกิจการ (ชื่อตาม tenant) | เลขาผูก **ผู้ใช้** (ชื่อ/ลงท้าย/น้ำเสียง) → ตาราง `AiSecretary(userId unique)` |
| โควตา/เงิน | `usage.ts` (หน้าต่าง 5 ชม./สัปดาห์ · **ไม่มีผู้เรียก** — REVIEW C4) · `credit.ts` กระเป๋า $10 (`ensureWallet` ถูกเรียกทุกแชท — C3) · `AiUsage` รายวัน | นับ "งาน" ต่อเดือนไม่มี → `AiJobCounter` · แพ็กฟรี 100 งาน (มติ 7.2) · ลำดับหัก (ถาม §9 Q4) |
| ผู้ใช้/สมัคร | `User(email unique, name?)` · OTP อีเมล 6 หลัก · หมดอายุ 10 นาที · ผิดได้ 5 ครั้ง (`core/auth.ts`) · เว็บ `(marketing)/signup` passwordless · แอป `login.tsx` 372 บรรทัด (OTP + Apple/Google) | ไม่มี `User.phone` → เพิ่มคอลัมน์ · หน้า S1/S2 ใหม่ · บัญชีเดิมบังคับใส่เบอร์ (R8) |
| แอปมือถือ | expo-router `(app)/{chat/[id],sessions,index,crm,member}` · WebView ใช้อยู่แล้ว (`index.tsx`, `member/[customerId].tsx`, `webview-exchange` API) · push `core/push.ts` + `push-register.ts` · ธีม `src/theme.ts` 20 บรรทัด (สว่างล้วน) | จอชุดใหม่ 24 หน้า · โหมดมืด · ธีม Airy (งาน T0.3 เดิมอยู่บน `session/ai-team` 601f4540 ยังไม่ merge — เอาโทเคนมาใช้ได้ ภาพจอใช้ไม่ได้) |
| เว็บ | `src/app/app/sys/[id]/**` ต่อกิจการ · AI บนเว็บมีแค่ `member/assistant` · REST `api/v1/ai` | ไม่มีหน้าเลขาบนเว็บ (ชุด ก–ง ทั้งหมด) |
| เครื่องมือ QC | `scripts/iso.sh` `qc4.sh` `with-gate-lock.sh` · ข้อสอบ `qc-ai-*.mts` 26 ชุด (regression เดิม) | `seed-ai-team-qc` / `shoot-ai-team.mjs` / `parity-ai-team.sh` ยังไม่อยู่บน main (อยู่ใน wip T0.3) |
| ผลงาน T0 เดิมที่เก็บได้ | T0.0 REVIEW (ชื่อจริง/call graph) · T0.1 ต้นทุนวัดจริง **3.58 บาท/งาน** (`AI-TEAM-COST-2026-10.md`) · T0.2 `docs/modules/30-ai-team.md` (ต้องเขียนใหม่ครึ่งหนึ่ง) | — |

**ข้อขัดแย้งที่ต้องเคาะก่อนลงมือ** (ต่อจาก REVIEW C1–C19 เดิม) — อยู่ใน §9

---

## 1. สถาปัตยกรรมที่เลือก (3 ข้อหลัก)

1. **แอป = native (React Native · expo-router) ทั้ง 24 หน้า** (มติเจ้าของ 3 พ.ย. — ไม่ใช้ WebView) · ธีม Airy สว่าง/มืดเป็นโทเคน RN (ต่อยอดงาน T0.3 เดิม `apps/mobile/src/theme/**` บน `session/ai-team` 601f4540 — รีเบสมาใช้) · ภาพคู่ MOCKUP|RENDER ทุกหน้า (ด่าน D7)
   **เว็บ shark.in.th**: ไม่มีห้องเลขา (เจ้าของ 3 พ.ย.: เว็บมีเฉพาะระบบ) · `member/assistant` เดิมคงไว้
   **ทดสอบบน TestFlight (iOS) + Internal testing (Android) ก่อนขึ้นสโตร์** — บัญชี dev มีแล้วทั้งคู่ (`eas.json`: ASC key U9DGP7TVFK · team 3DD2VCN6JQ · app 6793749205 · Expo project 06c3edc8) · แอปชี้ `BASE_URL = https://shark.in.th` ตายตัว (`src/api/client.ts:7`) → หลังบ้านต้องขึ้น production ก่อน TestFlight (ดู Q9)
2. **งานรันเบื้องหลังบนเซิร์ฟเวอร์** (มติ 5 แบบ Claude remote control): ข้อความผู้ใช้ → แถวคิว `AiRoomJob` (lease · idempotent) → worker รัน `sendMessage` loop → push เมื่อ WAITING/DONE · ปิดแอปได้ · เปิดกี่ห้องพร้อมกันก็ได้ (จำกัดด้วยโควตาเท่านั้น)
3. **ไม่มี engine ชุดที่สอง**: สิทธิ์ผ่าน `tool-access.ts` · การทำจริงผ่าน `proposals.ts/runKind` · เงินผ่าน `credit.ts` · ความจำผ่าน `memory.ts` · ทุกใบต่อเข้าของเดิม

---

## 2. กติกา RUN (ยกจากแผนเดิม §1–5 ทั้งชุด · เปลี่ยนเฉพาะบรรทัดนี้)

- บทบาท/ด่าน 12 ข้อ/กลุ่มข้อสอบ X1–X11/ขั้นตอน 14 ขั้น: **ใช้ตาม `AI-TEAM-MASTER-PLAN.md` §1–§5 ตามตัวอักษร** (ไม่คัดลอกมาซ้ำ) · เปลี่ยนชื่อ: ข้อสอบ `scripts/qc-sec-<wo>.mts` · ใบสั่ง `ledger/secretary-briefs/sec-brief-<wo>.md` · branch `wip/sec-<wo>` · ทรีผู้คุม `/root/projects/shark-sec` branch `session/secretary` **ตัดจาก `origin/main` a84bca2b**
- ตามมติ SVC 27 ต.ค. (ตรวจเบาลง): ต่อใบรันเฉพาะชุดที่แตะ + smoke · ด่านเต็ม (`qc:all` + build) **ครั้งเดียวต่อชุด merge** ([[feedback_pos_token_economy_batch_gates]])
- โมเดลจริง (OpenRouter/Anthropic) ใช้เฉพาะ S0.1 (วัดซ้ำ) และ S3.1 ข้อสอบรวม · ใบอื่น mock provider
- ไม่มี limit 5 ชม. แล้ว (31 ต.ค.) → เร่งได้ · คอขวด = CPU 4 vCPU + ล็อกฐาน QC4 (SVC ใช้อยู่จนจบ)
- ⛔ push main = deploy + migration prod → เจ้าของสั่งต่อครั้ง · ⛔ EAS build/OTA/สโตร์ รอเจ้าของ

---

## 3. เฟสและใบงาน (48 ใบ · เวลา = ชั่วโมงเลนโดยประมาณ รวมข้อสอบ+ตรวจ+ด่าน)

> คอลัมน์ "ภาพ" = หน้าใน DESIGN-AI-HIRE.md · "regression" = ชุด `qc-ai-*` เดิมที่ต้องเท่า baseline

### เฟส S0 — เตรียม (4 ใบ · ≈ 12 ชม.)

| ใบ | งาน | เกณฑ์รับ | ชม. |
|---|---|---|---|
| **S0.1** | **รีเบส + สำรวจ**: ตัด `session/secretary` จาก `origin/main` · ย้าย `REVIEW-AI-TEAM-DESIGN`/`AI-TEAM-COST`/`docs/modules/30-ai-team.md` มาเป็นฐาน · ผู้สำรวจ (อ่านอย่างเดียว) เขียน `REVIEW-SECRETARY-DESIGN.md`: ตารางแบบ↔โค้ด 24 หน้า → ฟังก์ชันจริง · ข้อขัดแย้งใหม่ (ห้องร่วม·เบอร์โทร·โควตางาน) พร้อมคำตัดสิน · `sec-brief-COMMON.md` + `RESOLUTIONS.md` | ทุกชื่อไฟล์/ฟังก์ชันในใบ S1.x มีอยู่จริง · baseline `qc-ai-*` 26 ชุดเขียวบน QC4 | 3 |
| **S0.2** | **ธีม Airy ใน RN + เครื่องมือเทียบภาพ** (รีเบส T0.3 601f4540 มาบนทรีใหม่): โทเคน `apps/mobile/src/theme/{tokens,light,dark,index}.ts` (คง export `C R S` เดิม) จาก CSS ของ `gen_sec.py` (สี · กระจก/blur · เงา · ลูกแก้ว · รัศมี) · คอมโพเนนต์ฐาน `src/components/airy/{Glass,Bar,Chip,Dot,SysTag,Sheet,Input}` · `scripts/shoot-sec.mjs` (expo export web สำเนา QC → Playwright 390×844 ×2 ธีม จาก fixture) + `scripts/parity-sec.sh` (วาง MOCKUP\|RENDER) · ตัวอย่าง C3 (ว่าง) ผ่านเทียบ · ตรวจ deps blur (`expo-blur`) มี/เพิ่ม | ภาพคู่ C3 สว่าง/มืด ตรงแบบ · `npm run typecheck` ของแอปสะอาด · เว็บ export ของสำเนา QC ผ่าน | 4 |
| **S0.3** | **สัญญาข้อมูล + API**: `docs/modules/31-secretary.md` — โมเดล M1 เลขา · M2 ห้อง/สมาชิก/สถานะ · M3 สิทธิ์ต่อระบบ · M4 กฎอนุมัติ · M5 บันทึก/ย้อน · M6 งานประจำ · M7 โควตางาน · M8 คิวเบื้องหลัง · M9 สมัคร/เบอร์ (ระดับฟังก์ชัน: ชื่อ·พารามิเตอร์·กติกา·event) + `docs/api/SECRETARY-API.md` (เส้นทางเว็บ/แอปชุดเดียว) + seed `scripts/seed-secretary-qc.mts` (2 กิจการ · เจ้าของ 1 · พนักงาน 3 · ห้อง 6 สถานะครบ · idempotent) | ผู้ตรวจอ่านแล้วไม่มีช่องว่างกับ 24 หน้า · seed รันซ้ำไม่เพิ่มแถว | 3 |
| **S0.4** | **นิยาม "งาน" + แพ็กฟรี**: `src/lib/ai/secretary/pack.ts` ค่าคงที่ `FREE_PACK = { jobsPerMonth: 100, scheduledMax, approversMax }` · นิยาม 1 งาน (ตาม Q3) · ข้อความโควตา 80/95/100% · ตัวเลขจาก T0.1 ใส่ comment | pure function + ข้อสอบ 100% | 2 |

### เฟส S1 — แกนเซิร์ฟเวอร์ (20 ใบ · ≈ 81 ชม.)

| ใบ | สัญญา | เนื้องาน | regression | ชม. |
|---|---|---|---|---|
| **S1.1** 🎯 | M1–M9 | migration `secretary_a` = `prisma/schema/secretary.prisma` ใหม่: `AiSecretary(userId @unique, name "Shark", suffix, tone, languages[])` · `AiRoom(conversationId @unique, tenantId, startedById, title, closedAt?, systems String[])` · `AiRoomMember(roomId,userId,addedById,addedAt,seeHistory)` @@unique(roomId,userId) · `AiSystemAccess(tenantId,module,level OFF/READ/DRAFT)` @@unique(tenantId,module) · `AiApprovalRule(tenantId,key,enabled,limitSatang?)` · `AiActionLog(tenantId,roomId,userId,approverId?,module,kind,summary,payload,undoableUntil?,undoneAt?)` · `AiJobCounter(scopeId,month,jobs)` · `AiRoomJob(roomId,messageId,status,leaseUntil?,attempts)` · คอลัมน์ nullable บนตารางเดิม: `User.phone`, `AiMessage.authorUserId`, `AiMemory.status`, `AiScheduledTask.{ownerUserId,frequency,days,minute,channels}` · FK ทุกตัว + index ตาม query ของ S1.4/S1.11 · ห้ามแตะ core.prisma FROZEN นอกจาก `User.phone` (ขอข้อยกเว้นใน RESOLUTIONS) | ทุกชุด qc-ai-* | 4 |
| **S1.2** | M1 | `secretary/secretary.ts`: `ensureSecretary(userId)` (สร้างค่าเริ่มต้น Shark/ครับ/สุภาพ) · `updateSecretary` · `sampleSpeech(sec)` · ต่อ `persona.ts`: system prompt = ตัวตนเลขา (ชื่อ·ลงท้าย·น้ำเสียง) + DNA กิจการเดิม · ภาษาตาม `languages` | qc-ai-brain · qc-ai-phase-a | 3 |
| **S1.3** 🎯 | M3 | `secretary/access.ts`: `setAccess(tenant, module, level)` (OWNER เท่านั้น · AUTO ปฏิเสธด้วยเหตุผล "รุ่นแรก") · ค่าเริ่มต้น DRAFT ทุกระบบ · `chat` = READ จนเชื่อมช่องทาง · ต่อเข้า `toolsOfferedTo`/`toolVerdict`: READ ตัดเครื่องมือเขียน · OFF ตัดทั้งโมดูล · สิทธิ์สุทธิ = membership ∩ ระดับ (X2) | qc-ai-tools · qc-ai-tools2 · qc-ai-skills | 4 |
| **S1.4** 🎯 | M2 | `secretary/rooms.ts`: `startRoom(tenant, userId, instruction)` → `AiConversation` (id ตาม conversation-owner) + `AiRoom` + นับงาน (S1.13) · `roomStatus(room)` = WAITING ถ้ามี proposal/plan PENDING · RUNNING ถ้ามี job ค้าง · DONE ถ้า closedAt · `listRooms(ctx,{scope:'mine'\|'tenant', status, q})` (`tenant` = OWNER เท่านั้น) · `systems[]` อัปเดตจากเครื่องมือที่ถูกเรียก · ชื่อห้องอัตโนมัติ 60 ตัว · ปรับการมองเห็น `conversation-owner.ts`: ผู้สร้าง ∪ สมาชิก ∪ เจ้าของกิจการ | qc-ai-phase-b1/b2 · qc-ai-actions | 5 |
| **S1.5** 🎯 | M8 | **คิวเบื้องหลัง** `secretary/worker.ts`: ข้อความผู้ใช้ → `AiRoomJob` → `runRoomJobs()` (lease 2 นาที · X5 สองรอบซ้อนทำครั้งเดียว · ตายแล้วปล่อย lease · attempts ≤3) → `service.sendMessage` ด้วย actor ของ **ผู้เขียนข้อความ** · จบแล้ว push ถ้าสถานะ WAITING/DONE (`core/push.ts`) · cron ทุกนาที (ลง `platform/cron.ts`) · ทางเดิม (ตอบทันทีใน request) ยังอยู่สำหรับเว็บ streaming | qc-ai-schedule · qc-ai-proactive | 6 |
| **S1.6** 🎯 | M2 | **ห้องร่วม** `secretary/members.ts`: `addMember(room, byUserId, userId, seeHistory)` (ผู้เพิ่ม = ผู้เปิดห้องหรือ OWNER · ผู้ถูกเพิ่มต้องมี Membership กิจการเดียวกัน) · `removeMember` · `listMessages` กรอง `createdAt ≥ addedAt` เมื่อ `seeHistory=false` · ทุกข้อความ USER เก็บ `authorUserId` · เครื่องมือ/ข้อเสนอที่เกิดจากข้อความนั้นใช้ actor ของผู้เขียน (X2) · ผู้กดอนุมัติต้องผ่าน `actorCanConfirmKind` เอง · ข้อความระบบ "X เพิ่ม Y เข้าห้อง" | qc-ai-proposals · qc-ai-plan | 5 |
| **S1.7** | M4 | **ต้องอนุมัติเสมอ**: ทะเบียน `ALWAYS_APPROVE` ปิดไม่ได้ (เงินออก · DESTRUCTIVE · ส่งออก PII) + กฎตั้งค่าได้ค่าเริ่มต้นเปิด (ข้อความถึงลูกค้า · เอกสารเงินเกินวงเงิน · เปลี่ยนราคา/โปร) ใน `AiApprovalRule` · ด่านใน `createProposal`: ตีความ kind → กฎ → `requiresApproval` + "ทำไมต้องอนุมัติ" (ไทย) · ผู้อนุมัติ = OWNER/MANAGER ที่ `membershipCan` | qc-ai-proposals · qc-ai-credit | 3 |
| **S1.8** 🎯 | M5 | **บันทึกการกระทำ + ย้อนกลับ 24 ชม.**: hook ใน `executeProposal`/`runKind` เขียน `AiActionLog` ทุกครั้ง (ผู้สั่ง·ผู้อนุมัติ·ระบบ·สรุป) · ทะเบียน `UNDOABLE_KINDS` + handler ต่อ kind (เริ่ม: ย้ายดีล CRM · การ์ดบอร์ดงาน · ร่างเอกสารบัญชีที่ยังไม่ส่ง · นัด/คิวที่ยังไม่ถึง) · `undoAction(id, userId)` ภายใน `undoableUntil` = executedAt+24h · ข้อความที่ส่งแล้ว/เงินที่โอนแล้ว = ย้อนไม่ได้ (ไม่มีใน registry) · `listLog(ctx,{day,module})` | qc-ai-actions · qc-ai-kanban-board | 4 |
| **S1.9** | M6 | **งานประจำ** ขยาย `scheduled.ts`: `ownerUserId` บังคับสำหรับงานใหม่ · DAILY/WEEKLY/MONTHLY · days[] · minute · channels[] · แต่ละรอบ = เปิดห้องใหม่ (S1.4) ด้วย actor ของ `ownerUserId` (ไม่ใช่ SHOP_AUDIENCE) · ผลเขียน = ข้อเสนอรออนุมัติ (S1.7) · งานเดิม (ไม่มี ownerUserId) คงพฤติกรรมเดิม · โควตาหมด = ข้าม+จด | qc-ai-schedule | 3 |
| **S1.10** | M2/B6 | **ตีกลับ + สอน** `secretary/teach.ts`: `rejectWithNote(proposalId,{note, remember:'JOB'\|'RULE'})` → ปฏิเสธ + ข้อความผู้ใช้ใหม่ในห้อง (ให้เลขาแก้) · RULE → `AiMemory` status PENDING "กฎใหม่ของกิจการ" รอ OWNER ยืนยัน (B6) · ยืนยันแล้วจึงเข้า prompt | qc-ai-memory · qc-ai-feedback | 3 |
| **S1.11** | A2/A6 | **ข้อเสนอจากเลขา + กล่องรวม**: `suggestions(tenant, actor)` จาก `gatherProactiveInsights` → รายการ {ระบบ, หัวข้อ, คำสั่งพร้อมใช้} (ไม่เริ่มงานเอง · มติ 9) · `inboxForUser(userId,{tenantId?,kind?})` รวม proposal/plan PENDING ทุกกิจการที่ผู้ใช้อนุมัติได้ · "งานที่สั่งบ่อย" = top-N instruction ของผู้ใช้ | qc-ai-proactive | 3 |
| **S1.12** | tools | **เครื่องมือที่ขาดสำหรับเส้นทางสาธิต**: `chat.send` (ส่ง LINE/FB ผ่านโมดูล chat · DRAFT เสมอ · ลงชื่อ "ผู้ช่วย AI" ตาม §5 PDPA · เฉพาะลูกค้าที่ผูก CRM/สมาชิก) · ตรวจช่องว่าง kinds สำหรับ A3–A5 (ใบเสนอราคา `account.*` มีแล้ว? · การ์ดติดตาม `kanban.*` มี) · เพิ่มเฉพาะที่เส้นทางสาธิต 3 เส้นต้องใช้ (ใบเสนอราคา→LINE · ตามลูกค้าเงียบ · คืนมัดจำหอพัก) | qc-ai-tools · qc-ai-skills | 4 |
| **S1.13** 🎯 | M7 | **โควตา 100 งาน/เดือน**: `AiJobCounter` scope ตาม Q2 · เพิ่มใน tx เดียวกับ `startRoom` (X3 conditional update) · 100% = เปิดห้องใหม่/งานประจำหยุด · ห้องค้างยังอนุมัติ/ตอบต่อได้ · กระเป๋า $10 เดิม: ลำดับตาม Q4 · `quotaStatus(scope)` → % + "≈ N งานที่เหลือ" + วันรีเซ็ต · ปิดทาง `usage.ts` หน้าต่าง 5 ชม. (ไม่มีผู้เรียกอยู่แล้ว · ไม่ลบ) | qc-ai-usage · qc-ai-credit | 4 |
| **S1.15** 🎯 | §8 ชั้น 1–2 | **วงจรเรียนรู้** `secretary/learn.ts`: (ก) เมื่อ proposal ถูกแก้แล้วอนุมัติ → เก็บ diff "ร่าง→ที่ผ่าน" เป็น `AiLesson(tenantId, kind, pattern, example, status PENDING/CONFIRMED, source roomId/userId)` · เห็นรูปแบบเดิม ≥2 ครั้ง → เสนอเจ้าของ "ขอจำเป็นกฎ" (ข้อความระบบใน B6 + แจ้งเตือน) · (ข) ความชอบผู้ใช้ `AiSecretary.prefs` (ภาษา/ความยาว/รูปแบบ) จากการแก้ซ้ำ · (ค) `lessonBlock(ctx, kind)` ฉีดเข้า prompt เฉพาะบทเรียน CONFIRMED ของชนิดงานนั้น · ไม่เก็บ PII (X8 · anonymize แบบ `dataset.ts`) · ต่อยอด `memory.ts` ไม่สร้าง engine ใหม่ | qc-ai-memory · qc-ai-feedback · qc-ai-eval | 5 |
| **S1.16** | §8 ชั้น 3 | **ข้อมูลกิจการสด** `secretary/digest.ts`: `AiTenantDigest(tenantId, day, json)` คำนวณรายวัน (cron · lease X5) จากฐานจริง: ยอดขาย 7/30 วัน + แนวโน้ม · ลูกค้าเงียบ · สต็อกใกล้หมด · ค้างชำระ · คิว/จองพรุ่งนี้ · เฉพาะระบบที่ร้านเปิด (ข้ามเงียบแบบ `proactive.ts`) · `digestBlock(ctx)` ≤ 600 token ฉีดเข้า prompt เมื่อคำสั่งเป็นเชิงถาม/แนะนำ · S1.11 ใช้ digest เป็นแหล่งข้อเสนอ · ตัวเลขทุกตัวมีข้อสอบเทียบ SQL ตรง | qc-ai-proactive · qc-ai-analyst | 4 |
| **S1.17** | §9 ช่วยเหลือ | **Support Desk ต่อแอป**: `platform/support.ts` เพิ่ม `openCaseFromApp(userId, tenantId, {subject, body, attachments, roomId?, category})` (ตั้ง `conversationId` จากห้องงาน · หมวด "เลขาทำผิด" → แถว `AiFeedback`/คิว ai-quality) · `listCasesForUser` (ผู้แจ้ง + OWNER) · `shopReply` · `setResolvedByShop` · push ถึงผู้แจ้งเมื่อ PLATFORM ตอบ (`core/push.ts`) · คอลัมน์ nullable `SupportCase.{source APP/WEB, category}` · กติกาเดิมคงไว้ (ปิดแล้วพิมพ์ต่อ=OPEN) | ชุด backoffice เดิม | 4 |
| **S1.18** | §8 ชุดข้อมูลเทรน | **ชุดข้อมูลเทรน** ต่อยอด `dataset.ts`/`AiTrainingSample` (ไม่สร้างตารางใหม่ · คอลัมน์ nullable: `outcome APPROVED/EDITED/REJECTED`, `editedReply`, `stepsJson`, `roomId`, `tenantHash`): ป้ายผลจากปุ่มอนุมัติ/แก้/ตีกลับ (S1.7/S1.10 ยิง event) · เก็บลำดับหลายขั้นของ plan · anonymize เดิม + ชื่อลูกค้า/ที่อยู่ (ขยาย `anonymize`) · ปิดด้วย `SHARK_AI_COLLECT` เดิม + ร้านปิดได้ใน B7 · `scripts/dataset-export.mts` → JSONL (messages/tools/outcome) + สถิติ (จำนวน · สัดส่วนดี/แก้/ตีกลับ ต่อชนิดงาน) · หน้า `backoffice/ai-quality` เพิ่มตัวนับ · ข้อความในข้อตกลงใช้งาน (ร่างให้เจ้าของ) | qc-ai-tuning · qc-ai-quality | 4 |
| **S1.19** 🎯 | M9 สมัคร | **SMS OTP · เบอร์ = ID** (มติ Q5 ✅): `core/auth.ts` เพิ่ม purpose `SMS_OTP` (ใช้ `AuthToken` เดิม · 6 หลัก · 5 นาที · ผิด 5 ครั้ง · ขอซ้ำได้ทุก 60 วิ · เพดาน 5 ครั้ง/เบอร์/วัน + ต่อ IP = X7) · `core/sms.ts` ผู้ให้บริการผ่าน env (`SMS_PROVIDER` · คีย์ · ชื่อผู้ส่ง) + โหมด mock ใน QC · `UserPhone(userId @unique, phone @unique E.164, verifiedAt)` · ล็อกอินด้วยเบอร์: มีเบอร์ → session · ไม่มี → สมัคร (ชื่อ·เบอร์·อีเมล) · บัญชีเดิมที่มีแต่อีเมล: เข้าด้วยอีเมล OTP ครั้งถัดไปแล้วบังคับผูกเบอร์ (ยืนยัน SMS) · Apple/Google คงเดิม · DTO ไม่มีรหัส (X10) | qc ชุด auth เดิม | 5 |
| **S1.20** | สมอง AI | **ผู้ให้บริการโมเดลตรง Anthropic** (เจ้าของมีเครดิต $200/เดือน): `provider.ts` เพิ่มรูปแบบ Messages API (เดิมรับเฉพาะ OpenRouter) · เลือกด้วย env `AI_PROVIDER=anthropic|openrouter` · คีย์ `SHARK_ANTHROPIC_KEY` (คีย์ใหม่ชื่อ "shark" ในคอนโซลของเจ้าของ · ไม่ใช้คีย์โปรเจกต์อื่น) · prompt caching แบบ Anthropic ตรง (cache_control) · model id ตรง (`claude-haiku-4-5-20251001` · `claude-sonnet-5-5`) · ตัวนับ token/ต้นทุนเดิมทำงานเหมือนเดิม · OpenRouter คงเป็นสำรองสลับได้ · ข้อสอบ: mock ทั้งสองรูปแบบให้ผลเท่ากัน | qc-ai-brain · qc-ai-credit · qc-ai-usage | 3 |
| **S1.14** 🎯 | API | **API ชุดเดียวเว็บ+แอป** `src/app/api/mobile/secretary/**` (Bearer/session) + server actions สำหรับ RSC: secretary get/update · rooms list/start/get/messages/send/close · members add/remove · proposals approve/reject/teach · undo · log · access get/set · rules get/set · scheduled CRUD · suggestions · inbox · quota · user phone set · lessons list/confirm/delete · digest get · support cases list/open/reply/resolve + upload ภาพ · ทุกเส้น rate-limit `checkRateLimitDb` (X7) · DTO ไม่มี token/คีย์ (X10) · `docs/api/SECRETARY-API.md` ตรงจริง | qc-ai-phase-a/b · ชุด mobile เดิม | 5 |

### เฟส S2 — แอป native (16 ใบ · ≈ 69 ชม.)

> ทุกใบ: จอใน `apps/mobile/app/(app)/secretary/**` (expo-router) · ข้อมูลผ่าน `src/api/secretary.ts` (ชนิดจาก docs S0.3 · mock จาก fixture ก่อน API จริง) · `testID` ทุกปุ่ม + ทะเบียน `scripts/sec-ui-inventory.json` · ภาพคู่สว่าง+มืด 390×844 ต่อหน้า

| ใบ | ภาพ | เนื้องาน | ชม. |
|---|---|---|---|
| **S2.1** | โครง | โครง+นำทาง: `(app)/secretary/{index,new,room/[id],inbox,scheduled,staff,settings/*,onboarding/*}` · แถบบน (ไอคอนแชท/พนักงาน ซ้าย · + ขวา · ไม่มีรูปโปรไฟล์) · ชื่อกิจการ+ตัวสลับ · ไม่มีแถบล่าง · จุดเข้า: หน้าแรกแอปเดิม `(app)/index.tsx` เพิ่มทางเข้า "เลขา" (ไม่ลบของเดิม) · โครง fixture/QC (`apps/mobile/qc/fixtures/secretary/*.json`) | 4 |
| **S2.2** | A1 · C3 | รายการห้อง: ตัวกรอง 4 ช่อง · ค้นหา · การ์ด (จุดสถานะ · ป้ายระบบ · "สั่งโดย"/"ร่วมกับ" · เวลา · badge) · pull-to-refresh + polling สถานะ · ว่าง = C3 | 4 |
| **S2.3** | A2 | เริ่มงานใหม่: ทักทายตามเลขา · ข้อเสนอจาก S1.11 (แตะ = เติมช่อง) · สั่งบ่อย · ระบบที่เข้าถึง · ช่องพิมพ์ล่างสุด (R3) · ไมค์ปิดไว้ถ้าไม่มี STT | 3 |
| **S2.4** | A3 · A4 · A5 · C4 | ห้อง: ฟองผู้ใช้/เลขา · การ์ดขั้นตอน ✓/●/⏸ (จาก plan steps) · "ทำงานอยู่เบื้องหลัง" · การ์ดอนุมัติ (รายการ · ทำไมต้องอนุมัติ · แก้/ตีกลับ/อนุมัติและส่ง) · สรุปเมื่อเสร็จ + ลิงก์ของจริง (เปิดหน้าเดิมของแอป/WebView โมดูลนั้น) · ย้อนกลับ (ถึงเวลา)/สอน/ทำซ้ำ · ตีกลับ→แก้→"แค่งานนี้/จำเป็นกฎ" · polling จาก worker | 7 |
| **S2.5** | A6 · A7 | รออนุมัติรวมทุกกิจการ (แท็บ ทั้งหมด/เงิน/ส่งลูกค้า/ลบ · การ์ดต่อกิจการ) · งานประจำ (รายการ+สวิตช์+ฟอร์มความถี่/วัน/เวลา/ช่องทาง) | 4 |
| **S2.6** | A8 | แจ้งเตือน: push จาก S1.5 (`push-register.ts` เดิม) → deep-link เปิดห้อง/กล่องรวม · ข้อความแจ้งเตือน 4 แบบ (รออนุมัติ·เสร็จ·โควตา·งานประจำ) · หน้า "เปิดต่อจากทุกที่" | 3 |
| **S2.7** | B1 · B2 · B8 | ชีตสลับกิจการ (+ เพิ่มกิจการ + แถว "เลขาของฉัน") · เลขาของฉัน (ชื่อ·น้ำเสียง·ลงท้าย·ภาษา·สถิติ 4 ตัว) · โควตา/แพ็ก (วงแหวน % · ≈ N งาน · แพ็กเสียเงินแสดงปิด · เติมเงินปิด · กระเป๋า $10 ถ้ามี) | 4 |
| **S2.8** | B3 · B4 · B5 | สิทธิ์ต่อระบบ (3 ระดับ · "ทำเองได้" ล็อก · OWNER เท่านั้นแก้) · ต้องอนุมัติเสมอ (กฎล็อก/ตั้งได้ · วงเงิน · ผู้อนุมัติ) · บันทึกการกระทำ (ไทม์ไลน์ · ย้อนกลับได้ถึง · ปุ่มย้อน) | 4 |
| **S2.9** | B6 · B7 | ความรู้ของกิจการ 3 ส่วน: กฎ/ข้อเท็จจริง · **สิ่งที่ Shark เรียนรู้** (บทเรียนจาก S1.15 พร้อมที่มา · รอยืนยัน/ยืนยันแล้ว · ลบได้) · ข้อมูลสดวันนี้ (digest S1.16) · คุยกับลูกค้าแทนร้าน + PDPA (ข้อความเปิดเผย AI · ส่งต่อคนเมื่อ… · ความยินยอม) | 4 |
| **S2.10** | D1 · D2 · D3 | รายชื่อพนักงาน (OWNER · สถานะงาน · ยังไม่ยืนยันอีเมล · แตะ = ห้องของคนนั้น) · ห้องร่วม (ฟองคนอื่นมีชื่อ · ข้อความระบบ · ป้าย "รออนุมัติ · คุณสุข") · ชีตเพิ่มคน (ติ๊ก · สวิตช์เห็นข้อความเก่า · คำเตือน) | 5 |
| **S2.11** | C1 | ตั้งชื่อเลขาครั้งแรก (ค่าเริ่มต้น Shark · ไม่มีชื่อตัวอย่าง R9 · ลงท้าย/น้ำเสียง · ตัวอย่างการพูดสด) → A1/C3 | 2 |
| **S2.12** 🎯 | S1 · S2 · login | **สมัคร/เข้า**: `app/signup.tsx` (ชื่อ·เบอร์·อีเมล → OTP อีเมล 6 ช่อง · นับถอยหลัง · แก้อีเมล) · `login.tsx` ธีม Airy ทางเข้าเดิมครบ (OTP · Apple · Google) · บัญชีเดิมไม่มีเบอร์ → หน้าบังคับใส่เบอร์ก่อนเข้า (R8 ไม่มีข้าม) · เว็บ `(marketing)/signup` เพิ่มชื่อ+เบอร์ | 5 |
| **S2.13** | ทุกหน้า (มืด) | โหมดมืดครบ 24 หน้า: ตามระบบ/บังคับ (ตั้งใน B2) · `userInterfaceStyle: "automatic"` + StatusBar ตามธีม (REVIEW C17) · ภาพคู่ 24×2 → CP2 | 4 |
| **S2.15** | H1 · H2 | ช่วยเหลือ: ไอคอน ? ตัวที่ 3 ซ้ายบน · รายการเรื่อง + ชิปหัวข้อ · ห้องแจ้งปัญหา (แนบภาพจากเครื่อง · แนบห้องงานอัตโนมัติจากเมนู ⋯ ของห้อง · ลิงก์หน้าในแอปจากทีม · การ์ดแก้แล้ว/ยังไม่แก้) · push เปิดห้องเมื่อทีมตอบ | 4 |
| **S2.16** | H3 · H4 | **backoffice ปรับ** (เว็บ · สไตล์ backoffice เดิม ไม่ใช่ Airy): `/backoffice/cases` เพิ่มแท็บ ใหม่/รอร้าน/ของฉัน + ตัวกรองช่องทาง/หมวด + ป้ายด่วน · หน้าเคส: ปุ่มรับเรื่อง/ระงับเลขาของร้าน · การ์ดแนบ (ห้องงานเลขาอ่านอย่างเดียว · บันทึกการกระทำ + ย้อน) · ร่าง AI เดิม · ตอบแล้ว push | 4 |
| **S2.14** | ปิด S2 | ต่อ API จริง (ถอด mock) · `expo export` สำเนา QC ผ่าน · typecheck · ข้อสอบจอ (fixture ทุกสถานะ) · ด่านเต็ม 1 ครั้ง · ทะเบียนปุ่มครบ | 4 |

### เฟส S3a — TestFlight (4 ใบ · ≈ 15 ชม.)

| ใบ | เนื้องาน | ชม. |
|---|---|---|
| **S3a.1** 🎯 | **ข้อสอบรวม + นักล่า 6 เลนส์** (L1 สิทธิ์/ห้องร่วมรั่ว · L2 โควตา/ตัวนับ · L3 คิว/cron/ซ้ำ · L4 API · L5 PDPA/prompt injection ผ่านข้อความลูกค้าในห้องร่วม · L6 ความลับ) + **เส้นทางจริง 3 เส้นด้วยโมเดลจริง** วัดต้นทุนต่อห้องเทียบ 3.58 บาท → ปรับ FREE_PACK ถ้าคลาด >30% (ถามเจ้าของ) · `qc:all` + build เต็ม | 6 |
| **S3a.2** | **หลังบ้านขึ้น production** (มติ Q9: ยังไม่มีร้านจริง ทุกร้านเริ่มทดสอบใหม่ → ไม่ต้องมี flag/backfill): `AiSystemAccess` ค่าเริ่มต้นสร้างเมื่อเข้าครั้งแรก (lazy) · runbook migration prod + rollback · ข้อมูลทดสอบเก่าล้างได้ตามเจ้าของสั่ง · PR `session/secretary → main` (รวม POS v2 + SVC v2 ที่ฐาน) · **push main + migration รอเจ้าของสั่ง "ทำ"** (CP3) · ต้องทำ W40 `POS_DEVICE_KEY` + runbook POS CD-P61-R1 ก่อน (ของ RUN POS) | 2 |
| **S3a.3** 🎯 | **บิลด์ทดสอบ** (หลัง S3a.2 ขึ้น prod): bump `app.json` version 2.0.0 · iOS buildNumber 24→25 · Android versionCode 1→2 · `runtimeVersion` policy appVersion คงเดิม · `eas build --profile production --platform ios` → `eas submit` TestFlight (ASC key ใน `eas.json`) · Android `eas build` app-bundle → Play Console Internal testing · ขั้นตอนเขียนใน `apps/mobile/SUBMIT-STEPS.md` · **รันเมื่อเจ้าของสั่ง** ([[feedback_no_eas_build_without_order]]) · ส่งลิงก์ TestFlight/Internal ให้เจ้าของ | 3 |
| **S3a.4** | **รับผลทดสอบจากเจ้าของ** (1 รอบ): รวบ feedback เป็นรายการแก้ · แก้ (ใบย่อยตามจริง · ประเมินใหม่ตอนนั้น) · OTA ผ่าน `eas update` channel production เฉพาะ JS (ไม่ต้องบิลด์ใหม่ถ้าไม่แตะ native) · รอบ 2 ถ้าเจ้าของสั่ง | 2+ |

### ~~เฟส S2W — เว็บ~~ (ตัดออก · มติ 3 พ.ย.: เว็บ shark.in.th มีเฉพาะระบบ ไม่มีห้องเลขา · `member/assistant` เดิมคงไว้)

### เฟส S3b — ขึ้นสโตร์ (3 ใบ · ≈ 9 ชม.)

| ใบ | เนื้องาน | ชม. |
|---|---|---|
| **S3b.1** | เอกสารปิดงาน `docs/modules/31-secretary.md` · ข้อความ PDPA/เปิดเผย AI (B7) ไทย/อังกฤษ · release notes 2.0 · HANDOVER | 3 |
| **S3b.2** | ภาพ/ข้อความสโตร์ 2.0 (เทมเพลต `shot-appstore.mjs` / `asc-screenshots.py` เดิม · 6.5" + iPad · ไทย/อังกฤษ) · ตรวจ privacy labels (เบอร์โทร = ข้อมูลใหม่ที่เก็บ) | 4 |
| **S3b.3** | ยื่น App Store review + Play production · เปิด flag ให้ทุกร้าน (ทีละชุด) · ร้านนำร่อง 3 ร้านสัปดาห์แรก · **ทุกขั้นรอเจ้าของสั่ง** | 2 |

**รวม 48 ใบ ≈ 204 ชั่วโมงเลน** (S0 12 · S1 81 · S2 69 · S3a 13 · S3b 9 · + S3a.4 ตามจริง)

---

## 4. ลำดับ · ขนาน · ไฟล์เจ้าของเลน

```
S0.1 → S0.2 ∥ S0.3 ∥ S0.4
S1.1 → S1.2 ∥ S1.3 → S1.4 → S1.5 ∥ S1.6 → S1.7 → S1.8 ∥ S1.9 → S1.10 ∥ S1.11 ∥ S1.12 → S1.13 → S1.15 ∥ S1.16 ∥ S1.17 → S1.18 ∥ S1.19 ∥ S1.20 → S1.14 → ปิด S1 (ด่านเต็ม 1 ครั้ง)
   เลนแอป (เริ่มหลัง S0.2+S0.3 รับ · mock จาก fixture): S2.1 → S2.2 ∥ S2.3 → S2.4 → S2.5 ∥ S2.6 → S2.7 ∥ S2.8 → S2.9 ∥ S2.10 → S2.11 → S2.12 (ต้อง S1.19+S1.14 เส้น SMS OTP · ใบ S2.12 เปลี่ยน: ล็อกอิน/สมัครด้วยเบอร์ · OTP ทาง SMS · อีเมลเป็นช่องเพิ่ม) → S2.15 ∥ S2.16 (ต้อง S1.17) → S2.13 → S2.14 (ต่อ API จริง · ต้อง S1.14)
S3a.1 → S3a.2 (รอเจ้าของ: push main) → S3a.3 (รอเจ้าของ: build) → S3a.4 (รอเจ้าของทดสอบ)
   ระหว่างรอ TestFlight: S3b.1 ∥ S3b.2 เริ่มได้
S3b.1 ∥ S3b.2 → S3b.3 (รอเจ้าของ)
```
- เลน A (เซิร์ฟเวอร์): `src/lib/ai/secretary/**` · `src/app/api/mobile/secretary/**` · `prisma/schema/secretary.prisma` · แก้ไฟล์ร่วม `tool-access.ts` `proposals.ts` `conversation-owner.ts` `scheduled.ts` `service.ts` **เฉพาะเลน A** (เลนอื่นห้ามแตะ)
- เลน B (แอป): `apps/mobile/**` · `scripts/shoot-sec.mjs` · fixtures · `src/app/(marketing)/signup/**`
- เลน C (สำรอง · ใบเซิร์ฟเวอร์ที่ไม่แตะไฟล์ร้อนของเลน A เช่น S1.16 S1.17 S1.18)
- เพดาน 3 เลนพร้อมกัน (CPU 4 vCPU) · เมื่อ SVC ยังรันอยู่ = 2 เลน

**จุดตรวจส่ง Telegram ให้เจ้าของ**

| จุด | เมื่อ | ส่งอะไร |
|---|---|---|
| CP0 | จบ S0 | REVIEW ข้อขัดแย้ง + คำตอบ §9 ที่ยังค้าง · ภาพคู่ C3 สว่าง/มืด (พิสูจน์เครื่องมือเทียบภาพ) |
| CP1 | ปิด S1 | SQL migration ให้อ่าน · docs API · ผล qc:all · เดโม API: เปิดห้อง→ร่าง→อนุมัติ→บันทึก→ย้อน |
| CP2 | ปิด S2 | ภาพคู่ 26 หน้าแอป ×2 ธีม + backoffice 2 หน้า (แอปจริงผ่าน expo export) · วิดีโอสั้น เส้นทาง สมัคร→ตั้งชื่อ→สั่ง→อนุมัติ→เสร็จ · ห้องร่วมเดโม |
| CP3 | S3a.1 รับ | ต้นทุนจริงต่อห้อง 3 เส้นทาง · รายงานนักล่า · **ขอคำสั่ง push main + migration (flag ปิด) → แล้วขอคำสั่ง build TestFlight/Internal** |
| CP4 | S3a.3 ส่ง | ลิงก์ TestFlight + Android Internal · คู่มือทดสอบ 10 ข้อ · รอ feedback |
| CP5 | หลัง S3a.4 | ขอคำสั่งยื่นสโตร์ |

---

## 5. ประเมินเวลา

**ฐานเทียบ (RUN ที่ผ่านมาบนเครื่องนี้)**
| RUN | ใบ | ช่วง | อัตรา | เงื่อนไข |
|---|---|---|---|---|
| CRM v2 | 53 | 17 ก.ย. → 9 ต.ค. (22 วัน) | 2.4 ใบ/วัน | 1–2 เลน · ติดโควตา 5 ชม. · ด่านเต็มทุกใบ |
| POS | 55 | 1 → 27 ต.ค. (26 วัน) | 2.1 ใบ/วัน | 2–3 เลน · พักโควตาหลายครั้ง · ด่านเต็ม → เปลี่ยนเป็นต่อชุดตอนท้าย |
| SVC | 52 | 27 ต.ค. → 2 พ.ย. (≈7 วัน · 98%) | ≈7.5 ใบ/วัน | 3–4 เลน · **ไม่มี limit 5 ชม.** · ด่านเบาลงต่อใบ · ด่านเต็มต่อชุด |

**งานนี้**: 48 ใบ ≈ 204 ชม.เลน (+S1.19 SMS OTP · +S1.20 Anthropic ตรง)

| ฉาก | เงื่อนไข | เวลาเดินเครื่อง | เวลาปฏิทิน (รวมรอเจ้าของที่ CP0–CP5) |
|---|---|---|---|
| เร็ว | 3 เลนตลอด · SVC จบแล้ว · เจ้าของตอบ CP/ทดสอบ TestFlight ภายในวัน | ≈ 80–90 ชม. | **≈ 9–10 วัน** ถึง TestFlight · +3 วัน สโตร์ ≈ **2 สัปดาห์** |
| **น่าจะเป็น** | 3 เลน (เริ่มหลัง SVC จบ) · ตีกลับใบใหญ่ (S1.5 S1.6 S2.4 S2.10) อย่างละ 1 รอบ · Apple review TestFlight 1–2 วัน · เจ้าของทดสอบ 2–3 วัน | ≈ 110–125 ชม. | **≈ 13–14 วัน ถึง TestFlight** · รวมยื่นสโตร์ **≈ 3 สัปดาห์** |
| ช้า | 2 เลน · TestFlight 2 รอบ · ต้นทุนจริงคลาดต้องปรับแพ็ก · native module/blur มีปัญหาบนเครื่องจริง · รอเจ้าของหลายวัน | ≈ 160+ ชม. | ≈ 4–5 สัปดาห์ |

ต่อเฟส (ฉากน่าจะเป็น · 3 เลน): S0 1 วัน · S1 4.5 วัน · S2 5 วัน (ขนานกับ S1 ได้ครึ่ง) · S3a 1.5 วัน + รอ Apple/เจ้าของ 3–4 วัน · S3b 1 วัน (ระหว่างรอ) + Apple review
ค่า token ประเมิน: ตาม RUN SVC ≈ 50 ใบใช้ ~1 สัปดาห์ของสมาชิก (ไม่มี limit) · โมเดลจริงเฉพาะ S0.1/S3.1 ≈ 30 ห้องทดสอบ ≈ 150 บาท

---

## 6. ความเสี่ยงหลักและทางกัน

| ความเสี่ยง | ผล | ทางกัน |
|---|---|---|
| main ยังไม่มี POS v2 / SVC / HR (อยู่บน session branches) | เครื่องมือ POS/จอง/หอพักของเลขาอิง POS v1 บน main · ถ้า POS/SVC merge main ระหว่าง RUN ไฟล์ร้อน `src/lib/ai/**` ชน | S0.1 ตรวจว่า POS/SVC แตะ `src/lib/ai` ตรงไหน · ขั้น 1 ของทุกใบ fetch main · ถ้าเจ้าของจะ merge POS/SVC ให้ทำก่อนเริ่ม S1 (ถาม Q6) |
| S1.5 คิวเบื้องหลัง = ของใหม่ทั้งก้อน | ซ้อน/ซ้ำ/ค้าง | X5 บังคับ · lease สั้น · นักล่า L3 · ทางเดิม (ตอบใน request) คงไว้เป็น fallback |
| ห้องร่วมรั่วข้อมูลเกินสิทธิ์ | พนักงานเห็นข้อมูลที่ตัวเองไม่มีสิทธิ์ผ่านคำตอบเลขาในห้องเดียวกัน | ค่าเริ่มต้นไม่เห็นข้อความเก่า · คำเตือนตอนเพิ่ม · นักล่า L1/L5 · ข้อเสนอ §0.1 ข้อ 3–4 |
| ต้นทุนต่อห้องจริงสูงกว่า 3.58 บาท (งานข้ามระบบหลายขั้น) | แพ็กฟรี 100 งาน แพงกว่าคาด | S3.1 วัดจริง 3 เส้น · ตัวเลขเป็นค่าคงที่ตัวเดียว (S0.4) ปรับได้โดยไม่แตะโค้ดอื่น |
| แอป native ยังไม่เคยรันเครื่องจริงใน RUN นี้จนถึง TestFlight (เทียบภาพผ่าน expo export web) | blur/กระจก/คีย์บอร์ด/ชีตบนเครื่องจริงต่างจากภาพ | S3a.4 เผื่อรอบแก้ · ใช้ `expo-blur` + ค่าที่ทดสอบแล้วในแอปเดิม · OTA แก้ JS ได้โดยไม่บิลด์ใหม่ |
| TestFlight ต้องใช้หลังบ้าน production (BASE_URL ตายตัว) | ฟีเจอร์ขึ้น prod ก่อนทดสอบจบ | flag ปิดเป็นค่าเริ่มต้น · migration เพิ่มอย่างเดียว · เปิดเฉพาะร้านทดสอบ (Q9) · ทางเลือก: Vercel preview ผ่าน CLI + Neon branch + `EXPO_PUBLIC_API_URL` (แพงและซับซ้อนกว่า) |
| core.prisma FROZEN | `User.phone` ต้องขอยกเว้น | RESOLUTIONS ข้อแรกของ S0.1 · ทางเลือก: ตาราง `UserPhone(userId unique)` แยก (ไม่แตะ core) — แนะนำทางนี้ถ้า FROZEN เคร่ง |
| ฐาน QC4 ใช้ร่วม SVC | รอล็อก | ข้อสอบเขียนฐานรันทีละชุดผ่าน gate lock · ใบเซิร์ฟเวอร์ส่วนใหญ่ pure/mocked |

---

## 7. สิ่งที่ตัดออกจากรุ่นแรกโดยเจตนา (มติแล้ว · ไม่ออกใบ)
ระดับ "ทำเองได้"/ครั้งหน้าไม่ต้องถาม (มติ 5) · แพ็กเสียเงิน/เติมเงิน/ใบกำกับ (7.1–7.3) · งานข้ามกิจการ (8) · LINE เป็นช่องทางสั่งงาน (4 · รุ่นถัดไป) · จ้างพนักงาน AI หลายคน/ตำแหน่ง/เลื่อนขั้น/ห้องแผนก (แผนเดิม T1.2–T1.5 T2.9 T2.10 T4.4 T5.1–T5.3) · STT ไมค์ (ปุ่มแสดงแต่ปิดถ้าไม่มี)

## 10. แผนระยะยาวเรื่องสมอง AI (มติ 3 พ.ย. · ไม่ใช่ใบงานใน RUN นี้)
- ช่วง 0–300 กิจการ: Claude API ล้วน (`provider.ts` เดิม) + prompt caching + แยกรุ่น (Haiku งานอ่าน/สรุป · Sonnet/Opus งานหลายขั้น) · เป้า ≈ 1.5–2 บาท/งาน
- 300–1,000: เหมือนเดิม + เก็บชุดข้อมูล (S1.18) · เฝ้าค่าใช้จ่ายต่อร้านใน backoffice
- 1,000+: ไฮบริด — โมเดลเล็ก (Qwen 3 8–14B / Typhoon / Gemma 3 12B · เช็กรุ่น ณ ตอนนั้น) สอนจากชุดข้อมูลของเรา ทำงานซ้ำ 60–70% · Claude ทำงานยาก · เสิร์ฟด้วย vLLM บน GPU เช่า (L40S 48GB ×2) · เกณฑ์เริ่ม: ค่า Claude > ฿100k/เดือนต่อเนื่อง และตัวอย่าง APPROVED ≥ 20,000
- เครื่อง Mac (mini/Studio) = เครื่องทดลอง/สอนโมเดลขนาดเล็กในออฟฟิศ ไม่ใช่เครื่องเสิร์ฟ production (ดูคำแนะนำ 3 พ.ย.)

## 8. สิ่งที่ยกมาจากงาน T0.3 เดิม (session/ai-team 601f4540 · ยังไม่ merge)
โทเคนธีม RN · คอมโพเนนต์กระจก · `shoot-ai-team.mjs`/`parity-ai-team.sh` · fixture รูปแบบ → S0.2 รีเบสมาบนทรีใหม่ · ภาพจอเดิม (ทีมพนักงาน) ใช้ไม่ได้ · ข้อค้นพบ "static 33/39 · ข้อหนัก 6" ต้องตรวจซ้ำบน main ปัจจุบัน

---

## 9. คำถามที่ต้องตอบก่อนเริ่ม RUN (ผมแนะนำไว้ · ตอบ ✅ = ใช้ตามแนะนำ)

| # | คำถาม | แนะนำ |
|---|---|---|
| Q1 | ~~UI: เว็บ+WebView หรือ native~~ | **ตอบแล้ว 3 พ.ย.: native** · เว็บทำเฟส S2W หลัง TestFlight |
| Q2 ✅ | โควตา 100 งาน/เดือน นับต่อกิจการ | ตามแนะนำ · แก้ข้อความ B1 |
| Q3 ✅ | 1 งาน = 1 ห้องที่เปิดใหม่ · สั่งเพิ่มในห้องเดิมไม่นับ · งานประจำ 1 รอบ = 1 งาน | ตามแนะนำ |
| Q4 ✅ | แพ็กฟรีก่อน → กระเป๋า $10 เดิม → หยุด | ตามแนะนำ |
| Q5 ✅ | SMS OTP · เบอร์ = ID แบบ WhatsApp (เจ้าของ 3 พ.ย. · จะสมัครผู้ให้บริการเอง) | S1.19 · อีเมลยังขอตอนสมัคร · Apple/Google คงไว้ · แนะนำ ThaiBulkSMS (ดูคำแนะนำ 3 พ.ย.) |
| Q6 ✅ (ปรับ) | ฐานโค้ด | **ตัด `session/secretary` จากปลาย `session/svc` เมื่อ SVC 100%** (SVC ต่อจาก POS v2 940e3aca อยู่แล้ว → ได้ POS v2 + SVC v2 ครบ) · ขึ้น main พร้อมกันที่ S3a.2 เพราะยังไม่มีร้านจริง (Q9) · ไม่ชนไฟล์ · เลขาเรียก POS/จองคิว/หอพักรุ่นใหม่ตั้งแต่แรก |
| Q7 ✅ | เบอร์โทร: ตารางแยก `UserPhone` ไม่แตะ core.prisma | ตามแนะนำ |
| Q9 ✅ (ง่ายขึ้น) | เจ้าของ: ยังไม่มีร้านใช้จริง ทุกร้านพร้อมเริ่มทดสอบใหม่ | ไม่ต้องมี flag/backfill · push main + migration ตรง · ล้างข้อมูลทดสอบเก่าได้ |
| Q10 ✅ (เปลี่ยน) | เจ้าของ: เว็บมีเฉพาะระบบ ไม่มีห้องเลขา | ตัด S2W ทั้งเฟส · มติ 4 แก้เป็น "แอปเท่านั้น" · ปุ่ม Help บนเว็บยังใช้ Support Desk เดิม |
| Q8 ✅ | ข้อเสนอ 5 ข้อใน DESIGN §0.1 | ยืนยันแล้ว |

**สิ่งที่ต้องได้จากเจ้าของก่อน/ระหว่าง RUN (ไม่ใช่โค้ด)**
1. ✅ เจ้าของสมัคร SMS provider (แนะนำ ThaiBulkSMS · ลงทะเบียนชื่อผู้ส่ง "SHARK") → คีย์ใส่ env (ผมไม่แตะ `.env` เอง)
2. ✅ ไฟล์คีย์ Apple มีบนเครื่องแล้ว (`/root/projects/siamdive-rn/credentials/AuthKey_U9DGP7TVFK.p8` ทีมเดียวกัน) → คัดลอกเข้า `apps/mobile/credentials/` ตอน S3a.3 (gitignore) · เคยบิลด์ SHARK HUB iOS แล้ว (#24) · Play Console: ยืนยันตอน S3a.3
3. ✅ เจ้าของมีเครดิต Anthropic $200/เดือน → S1.20 ต่อตรง · ต้องเป็นเครดิตใน **Anthropic Console** (console.anthropic.com) ไม่ใช่โควตาแอป Claude · สร้างคีย์ใหม่ชื่อ "shark" ใส่ env · OpenRouter คงไว้เป็นสำรองจนกว่า S3a.1 ผ่าน แล้วค่อยยกเลิก
4. ก่อน S3a.2: ตั้ง `POS_DEVICE_KEY` (W40) + เดิน runbook POS · ✅ ล้างข้อมูลทดสอบเก่าได้ — ผมจะส่งรายการตารางที่จะล้าง (ข้อมูล AI + ธุรกรรมทดสอบ · **คงบัญชีผู้ใช้/ร้าน/การตั้งค่า**) ให้ดูก่อนลงมือที่ CP3
5. ✅ ข้อความข้อตกลง/นโยบาย ผมร่างใน S3b.1 เจ้าของตรวจ

ตอบครบ → ผมเปิด RUN: สร้างทรี `/root/projects/shark-sec` + `session/secretary` · run pack (briefs 35 ใบ · RUN.md · RESUME.md · KICKOFF-PROMPT) · เริ่ม S0.1
