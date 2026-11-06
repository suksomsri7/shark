# WO S3a.1-S1 — แก้ผลนักล่า: worker · คิว · งานประจำ · โควตา

> RUN "เลขา AI" · เลน b `/root/projects/shark-sec-b` · branch `wip/sec-s3a1-s1` (ฐาน 67900c01f) · 6–7 พ.ย. 2026 · builder: Opus
> สัญญา: `ledger/secretary-briefs/sec-brief-S3a.1-S1.md` + RESOLUTIONS §Z.1 (R-Z1…R-Z12) · ข้อสอบ `scripts/qc-sec-s3a1-s1.mts` (19 ข้อ · ไม่แก้)

## 1. สิ่งที่ทำต่อมติ
| มติ | ทำอะไร (ไฟล์) |
|---|---|
| R-Z1 | `worker.ts`: claim = `updateMany where {id, attempts: c.attempts, claimable}` · fence = `c.attempts+1` (ไม่ findUnique หลัง claim) · `leaseUntil = Date.now()+LEASE` ตอน claim · heartbeat 30 วิ ต่อ lease (where fence) · คำตอบ ASSISTANT + DONE เขียนใน tx เดียวกับตรวจ fence ผ่าน `sendMessage` deps ใหม่ `persistGuard(tx)` (หลุด fence ⇒ throw `RoomJobLostError` ⇒ tx ย้อน ⇒ ผล lost) · `provider.ts`: `AbortSignal.timeout(90 วิ)` ทั้ง OpenRouter/Anthropic (`PROVIDER_FETCH_TIMEOUT_MS`) |
| R-Z2 | `worker.ts reapExhausted`: RUNNING ∧ lease < now ∧ attempts ≥ 3 ⇒ FAILED ไทย + push + คืนโควตา · `processJob` ครอบ try ทั้งตัว (throw ⇒ requeue/fail ผ่าน fence) · `secretary-ops.cancelJob`: ยกเลิก RUNNING ที่ lease หมดได้ |
| R-Z3 | `rooms.startRoom`: สร้าง `AiRoomJob` ใน tx เดียวกัน คืน `jobId` · route `rooms` · `secStartRoomAction` · `secretary/scheduled.runOwnedTask` · `tenants.createTenantFromApp` เลิก enqueue (ใช้ jobId) · route `tenants/create` รัน worker ของห้องแรกใน `after()` |
| R-Z4 | ไม่มีผู้ให้บริการ ⇒ `runRoomJobs` ไม่ claim · `ai_disabled` ⇒ กลับ QUEUED + attempts −1 · ตัวเก็บตกรายนาที `runRoomJobsTick` ส่ง `minAgeMs: 45_000` · `roomJobsHealth()` (นับ QUEUED ค้าง>5 นาที · RUNNING lease หมด · FAILED 24 ชม. · aiEnabled) ไว้ให้ runbook S3a.2 |
| R-Z5 | route `rooms` · `rooms/[id]/send` · `tenants/create`: `export const maxDuration = 300` + `runRoomJobs({ jobIds:[jobId], limit:1, deadline: start+240s })` · action เว็บใช้ jobIds เดียวกัน |
| R-Z6 | ไฟล์ใหม่ `src/lib/ai/secretary/scheduled.ts` (`isDue` ใช้ `p.h >= task.hourBkk` · `runOwnedTask` = claim + Membership + startRoom → jobId · ไม่เรียกโมเดล) · `ai/scheduled.ts`: `isDue` ส่งต่อ · query งานของคนตั้ง `hourBkk ≤ ชั่วโมง` (แถวเดิม = ตรงตัว) · `runScheduledTasks(…, { deferRoomJobs })` · route hourly: `maxDuration = 300` + รัน jobIds ใน `after()` (tier fast · deadline 240 วิ) · ไม่ส่ง defer (ข้อสอบเดิม) = รัน worker หลังลูป |
| R-Z7 | ไฟล์ใหม่ `src/lib/ai/tool-call-key.ts` (AsyncLocalStorage) · `service.ts` ห่อ `runTool` ด้วยกุญแจ `tc:<userMessageId>:<i>` (เฉพาะเมื่อมี userMessageId) · `createProposal` รหัส = `tc_<sha256(ร้าน·บทสนทนา·กุญแจ·kind)>` (มีแล้ว/P2002 = ใบเดิม) · `support/service.openCaseFromAi` รหัส `tcase_…` (createCase รับ `id?`) · ความจำกันซ้ำด้วยเนื้อความอยู่แล้ว (ไม่แตะ memory.ts) |
| R-Z8 | `minute-jobs.ts`: `MinuteJob.ownBudgetMs` ใหม่ · ลง `secretary.roomJobs` เป็นงานแรก (ก่อน `crm.heartbeat`) งบของตัวเอง 8 วิ (`SECRETARY_ROOM_JOBS_BUDGET_MS`) — เวลาที่ใช้คืนให้งบรวม (ราง minute) · worker ลงชื่อซ้ำด้วยค่าเดียวกัน (แทนที่ในตำแหน่งเดิม) |
| R-Z9 | `credit.assistUsedMicroOfDay` = aggregate เดียว ไม่นับเฉพาะ `note` ขึ้นต้น `room-worker:` (`ROOM_WORKER_NOTE_PREFIX`) · worker ส่ง `usageNote: room-worker:<jobId>` (service ใส่ note เฉพาะ `roomWorker`) · `POST /api/mobile/chat/send` + `sendAiMessageAction`: เพดาน 20/นาที (`ai-chat:<ร้าน>:<ผู้ใช้>`) + ห้องเลขา ⇒ 409 `secretary_room` (`rooms.isSecretaryRoomConversation`) · worker ห้องปิด ⇒ FAILED ไม่เรียกโมเดล · `executeProposal` / `executePlan` ห้องปิด ⇒ ปฏิเสธ (`proposals.closedRoomNote`) |
| R-Z10 | `worker.refundIfFirstJob`: FAILED ของ job แรกของห้องก่อนมี ASSISTANT (ไม่นับข้อความระบบ) ⇒ tx: `aiRoom jobsCounted 1→0` + `aiJobCounter jobs>0 −1` (ครั้งเดียว) · `startRoom` ไม่มีผู้ให้บริการ ⇒ `ai_disabled` ไทย (route ⇒ 503) |
| R-Z11 | `_shared.claimClientMessageId(tenantId, roomId, userId, cmid)` กุญแจ `sec:cmid:${tenantId}:${roomId}:${userId}:…` + `remember(messageId)`/`existingMessageId()` · send: cmid ห้าม `:` (400) · ซ้ำ ⇒ `{duplicate, messageId, jobId}` · ยังไม่จด ⇒ 409 pending · `release`/`remember` ไม่ `.catch` แล้ว — route จับ ⇒ `claimFailed` (logOps + 500) · `secStartRoomAction` รับ `clientMessageId` + `claimNewRoom` |
| R-Z12 | `notifyUser` deps `dedupeKey` (worker ส่ง `job:<jobId>`) · การจองกันสแปมคืนเมื่อส่งไม่สำเร็จ · claim ข้ามห้องที่มี RUNNING อื่นที่ lease ยังไม่หมด (ห้องละงาน) |

## 2. ไฟล์ร่วม — บรรทัดที่แตะ (หลัง commit 95b46ddbd · ช่วง `+เริ่ม,จำนวน` ของ diff กับ 67900c01f)
- `src/lib/ai/service.ts`: 22–23 (import) · 157–166 (deps `usageNote`/`persistGuard`) · 338 (`toolCallIndex`) · 400–406 (กุญแจ + `withToolCallKey(runTool)`) · 419–429 + 439–458 (`persistOps(db)` + tx แบบมี guard) · 468 (`note` ใน chargeUsageSafe)
- `src/lib/ai/proposals.ts`: 13–14 (import) · 224–268 (`createProposal` รหัสกำหนดได้ + `closedRoomNote`) · 346–348 (executeProposal ห้องปิด)
- `src/app/api/mobile/chat/send/route.ts`: 6–10 (import/ค่าคงที่) · 17–22 (rate-limit) · 37–41 (ปฏิเสธห้องเลขา) — **บรรทัด SSE `e.message` (R-Z26 ของเลน c) ไม่แตะ**
- `src/app/api/mobile/secretary/_shared.ts`: 159–197 (claimClientMessageId + claimFailed) · 204 + 212–218 (claimNewRoom release/remember) — ส่วนอื่น (thrown/runAfter/withRateLimit) ไม่แตะ
- นอกรายชื่อใบแต่จำเป็นต่อมติ (แตะน้อยที่สุด): `src/lib/ai/plans.ts` 13 + 119–121 (R-Z9) · `src/lib/support/service.ts` 9 + 68 + 80 + 116–129 (R-Z7) · `src/lib/ai/actions.ts` 13–14 + 242–247 (R-Z9 action เว็บ) · `src/lib/platform/secretary-ops.ts` 123–136 (R-Z2 cancel) · `src/app/api/mobile/secretary/tenants/create/route.ts` (R-Z3/R-Z5)
- ไฟล์ของใบ: worker · rooms · scheduled (ใหม่) · notify · server-actions · credit (120–141) · provider (96–98 · 170 · 398) · minute-jobs (52–56 · 135–145 · 821 · 847–850 · 863) · tenants · routes rooms/send/hourly · docs §5.4/§5.5/§5.17/§8 + SECRETARY-API

## 3. ผล (QC เลขา ผ่าน `qc-sec.sh` · SHARK_AI_MOCK=1)
- oracle `qc-sec-s3a1-s1` (ก่อน merge): `{"total":19,"passed":19,"failed":[]}` · หลัง merge tip: ดูรายงานสุดท้าย (×2)
- regression: s1.4 **25/28 (L-3 L-4 L-5 แดง — ผลตรงของ R-Z3 · ดู ORACLE-EDIT §4)** · s1.5 16/16 · s1.13 14/14 · s1.14 13/13 · s1.14b 24/24 · s3a.1 16/17 (R-1 SKIP เดิม — โมเดลจริง ผู้คุมรัน) · s1.9 10/10 (หลังแก้ลำดับ — รอบแรก R-1 แดง เพราะ push แถวเดิมยิง Expo จริงแล้วลบโทเค็นปลอมก่อน push ห้อง · แก้ให้งานของคนตั้งทำก่อนแถวเดิม) · s1.14c 12/12 · s1.17 10/10 · s2.16 7/7 · qc-ai-schedule 8/8 · qc-ai-credit 32/32 (= baseline ที่จดใน sec-s1.20) · qc-ai-actions 11/12 CRASH "Cannot read properties of null (reading 'id')" (= baseline เดิม sec-s1.4/s1.7)
- s1.4 + ORACLE-EDIT ที่ขอ (สำเนาชั่วคราว ลบแล้ว): 28/28
- typecheck: 1 error ใน `scripts/qc-sec-s3a1-s2.mts:170` (oracle ของเลน c บน tip — ไม่ใช่ไฟล์ของใบนี้) · โค้ดของใบนี้ 0

## 4. คำถาม / ข้อที่ต่างจากมติ
- **ORACLE-EDIT s1.4-L-3** (L-3/L-4/L-5): R-Z3 ทำให้ห้องใหม่มี job QUEUED ⇒ สถานะ RUNNING จนงานแรกจบ — ข้อสอบเดิมคาดห้องสด = WAITING/OPEN · hunk: หลังบรรทัด `// สถานะ` (บรรทัด 144) แทรก
  `await prisma.aiRoomJob.updateMany({ where: { tenantId: tid }, data: { status: "DONE", finishedAt: new Date() } });` · พิสูจน์แล้ว 28/28
- oracle W5-3 อ่าน `src/lib/ai/secretary/scheduled.ts` (ไฟล์ไม่มีบน tip) — ใบระบุไฟล์นี้เป็นของใบ ⇒ สร้างไฟล์ใหม่ย้าย `isDue` + `runOwnedTask` มา (ai/scheduled.ts คง `isDue` ส่งต่อ) ไม่ได้ขอแก้ข้อสอบ
- `isDue ≥ hourBkk`: งานที่ตั้งตอนบ่าย hourBkk เช้า จะรันรอบชั่วโมงถัดไปของวันเดียวกันเลย (ตามหลัง) — ต้องการให้ `createTask` ตั้ง lastRunDay = วันนี้เมื่อชั่วโมงผ่านไปแล้วไหม? (ไม่ได้ทำ — นอกมติ)
- รอบที่หลุด fence (lost) เรียกโมเดลไปแล้วแต่ tx ย้อน ⇒ ต้นทุนรอบนั้นไม่ถูกบันทึกใน AiCreditTxn (เกิดเฉพาะรันซ้อนตอน lease หลุด) — ยอมรับหรือให้บันทึก?
- remember ล้มหลังห้อง/ข้อความเกิดแล้ว ⇒ ตอบ 500 ตามมติ แต่กุญแจถูกจองแล้ว (retry ได้ 409 pending 24 ชม.) — worker ยังรันงานตามปกติ · ถ้าอยากให้ตอบ 200 พร้อม log แทน บอกได้
- งานประจำผ่าน worker ใช้ tier fast เฉพาะทาง route hourly (`after()`) · ถ้าตัวเก็บตกรายนาทีหยิบแทนจะเป็น routing ปกติ (pickModel)
- `secretary.roomJobs` ที่ใช้เกินงบ 8 วิ (โมเดลช้า) = dispatcher บันทึก cut-off WARN ทุกครั้ง (lease ของ minute-job ถือจนงานจบ) — พฤติกรรมเดิมของราง · ถ้ารก ops ค่อยปรับ
- `chat.sla` ไม่ no-budget เพราะ roomJobs ไม่กินงบรวมแล้ว · ไม่ได้ย้ายตำแหน่ง chat.sla
- ใครได้/เสียสิทธิ์: ไม่มีการเปลี่ยนสิทธิ์ · ประตูแชทเดิมใช้กับห้องเลขาไม่ได้แล้ว (409) · ทางที่เรียกโมเดลใหม่: ไม่มี (ทุกทางผ่าน `sendMessage` → `chargeUsageSafe` เดิม · worker ติดป้าย note)

## รอบ 2 (RESOLUTIONS §Z.4 · merge ทิปผู้คุม b8b548481 ด้วย SHA ตรง — มี ORACLE-EDIT s1.4 L-3 · s1.14 R-2 · s1.19 · s3a1-s2 BlobPart)
- **Q1** `ai/scheduled.createTask(ctx, input, now = new Date())` → `createOwnedTask`: ชั่วโมงไทยตอนตั้ง ≥ `hourBkk` ⇒ `lastRunDay = dayKeyBangkok(now)` (รอบแรก = พรุ่งนี้) · ตั้งก่อนถึงชั่วโมง = รันวันนี้ · แถวเดิม (ไม่มีเจ้าของ) ไม่แตะ · `updateTask` ไม่แตะ (มตินับเฉพาะตอนสร้าง)
- **Q3** `_shared.rememberFailed(e, claim, where)` (คืน claim + logOps WARN · ไม่ throw) · `POST rooms`: remember ล้มหลังห้องเกิด ⇒ คืน claim แล้วตอบ 200 ปกติ · **ทำแบบเดียวกันที่ `rooms/[id]/send` และ `secStartRoomAction`** (เหตุผลเดียวกัน: ของเกิดแล้ว · ไม่ให้ 409 pending ค้าง 24 ชม.) — ถ้าต้องการเฉพาะ rooms บอกได้ · `claimFailed` (500) เหลือเฉพาะคืนกุญแจล้มก่อนของเกิด
- **Q5** `MinuteJob.quietCutOff` ใหม่ (ตั้งที่ `secretary.roomJobs` ทั้งใน minute-jobs.ts และ worker): ถูกตัดงบ ⇒ ตัวนับต่อโพรเซส + OpsEvent INFO ไม่เกิน 1 แถว/15 นาที (จองหน้าต่างด้วย INSERT … ON CONFLICT แถว `minute-job:cutoff-log:<name>` ใน OpsAlertState) · งานอื่นยัง WARN ทุกครั้ง
- Q2/Q4/R-Z7/R-Z1 ยอมรับตามมติ — ไม่เปลี่ยน · ไม่ได้ merge เลน c
- ไฟล์ร่วมที่แตะเพิ่มรอบนี้: `_shared.ts` (เพิ่ม `rememberFailed` ก่อน `claimFailed`) · ไฟล์อื่น = ไฟล์ของใบ (scheduled · minute-jobs · worker · routes rooms/send · server-actions · docs)
- ผลรอบ 2: ดูรายงานถึงผู้คุม
