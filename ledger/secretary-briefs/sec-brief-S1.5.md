# S1-4 — S1.5 คิวเบื้องหลัง `secretary/worker.ts` (Opus · `wip/sec-s1.5` · หลัง S1.4 merge)

Read `sec-brief-COMMON.md`, `sec-brief-RESOLUTIONS.md` (R-K2 R-K8 R-K8b R-K20 §G), plan row S1.5, `docs/modules/31-secretary.md` §5–§6, ใบ `sec-brief-S1.4.md` (rooms.ts ที่มีแล้ว) และ oracle `scripts/qc-sec-s1.5.mts` (acceptance). Verified code: `src/lib/ai/service.ts` `sendMessage` (persist USER+ASSISTANT :315–321 · `deps` :99–108) · `src/lib/ai/actor.ts` `aiMemberActor` :64 · `src/lib/core/push.ts` `sendPushToUser(userId, msg, {tenantId?, post?})` :145 (`PushMsg {title, body, data?}`) · `src/lib/platform/minute-jobs.ts` (`registerMinuteJob({name, everyMinutes, run(now, budgetMs, ctl)})` · `runMinuteJobs` · `getMinuteJobStatus`) · แบบอย่างการลงทะเบียน `src/lib/modules/crm/sequences-job.ts` (ลงทะเบียนตอน import · `scripts/crm-cron.mts` :74 import · route outbox) · ตาราง `AiRoomJob` (S1.1: tenantId · roomId · messageId @unique · authorUserId · status QUEUED/RUNNING/DONE/FAILED · leaseUntil · attempts · error · startedAt · finishedAt).

## `src/lib/ai/secretary/worker.ts`
```ts
export const ROOM_JOB_LEASE_MS = 120_000;        // 2 นาที
export const ROOM_JOB_MAX_ATTEMPTS = 3;
export type RoomJobDeps = { provider?: AiProvider; post?: Parameters<typeof sendPushToUser>[2] extends { post?: infer P } ? P : never; now?: Date; limit?: number };
export async function enqueueRoomJob(tenantId: string, roomId: string, messageId: string, authorUserId: string): Promise<AiRoomJob>; // idempotent บน messageId (มีแล้ว = คืนแถวเดิม ไม่สร้างซ้ำ)
export async function sendRoomMessage(ctx: { tenantId: string; actor: AiMemberActor }, roomId: string, input: { text: string; imageUrls?: string[] }): Promise<{ ok: true; messageId: string; jobId: string } | { ok: false; error: "not_found" | "closed" | "empty"; message: string }>;
   // มองไม่เห็นห้อง (roomSightFor) = not_found · closedAt = closed · text ว่าง = empty · สร้าง AiMessage USER (authorUserId = actor.userId) + enqueueRoomJob ใน tx เดียว · **ไม่เรียกโมเดล** (route ของ S1.14 เรียก runRoomJobs ผ่าน `after()`) · ไม่นับงาน (R-K6: ข้อความในห้องเดิม = 0)
export async function runRoomJobs(deps?: RoomJobDeps): Promise<{ claimed: number; done: number; failed: number; requeued: number }>;
   // (1) หา job: status QUEUED หรือ (RUNNING และ leaseUntil < now) · attempts < MAX · take limit (ปริยาย 5) เรียง createdAt
   // (2) claim ทีละตัวด้วย updateMany({ where: { id, OR: [{status:"QUEUED"}, {status:"RUNNING", leaseUntil:{lt: now}}], attempts: {lt: MAX} }, data: { status:"RUNNING", leaseUntil: now+LEASE, attempts:{increment:1}, startedAt: now } }) — count 0 = ตัวอื่นได้ไป ข้าม (X5 สองรอบซ้อนทำครั้งเดียว)
   // (3) โหลด job+room+message · Membership ของ authorUserId (acceptedAt ≠ null) ไม่มี ⇒ FAILED error "ผู้สั่งไม่ได้เป็นสมาชิกของกิจการแล้ว" ไม่เรียกโมเดล
   // (4) actor = aiMemberActor(tenantId, authorUserId, membership) · service.sendMessage({tenantId, actor}, { conversationId: room.conversationId, text: message.content, imageUrls }, { provider, source: "CHAT", userMessageId: message.id })
   // (5) ผล ok ⇒ DONE (finishedAt · error null) · ผล !ok (over_budget/ai_disabled/empty) ⇒ FAILED + error = ข้อความไทย (quotaMessage) **ไม่ retry** · throw ⇒ attempts < MAX ? กลับ QUEUED (leaseUntil null · error = ข้อความ) : FAILED
   // (6) หลัง DONE/FAILED: push ถึง room.startedById ∪ AiRoomMember.userId (ไม่กรอง tenant — R-K20) `sendPushToUser(uid, { title: room.title, body: ≤120 ตัวของคำตอบ (หรือ "ทำไม่ได้: …"), data: { link: "/secretary/room/<roomId>", conversationId, roomId, kind: "room" } }, { post: deps.post })` · push ล้ม = log ไม่ throw
export function registerRoomJobsMinuteJob(): void;  // registerMinuteJob({ name: "secretary.roomJobs", everyMinutes: 1, run: async (now) => { await runRoomJobs({ now, limit: 5 }); } })
```
- `service.ts sendMessage`: เพิ่ม `deps.userMessageId?: string` — มี ⇒ **ไม่สร้างแถว USER ซ้ำ** (แถวมีแล้วจาก startRoom/sendRoomMessage) และ history ที่โหลดต้อง `NOT id = userMessageId` (ข้อความนั้นถูกส่งเป็นเทิร์นปัจจุบันผ่าน `text` อยู่แล้ว — ห้ามซ้ำสองครั้งใน prompt) · ไม่ส่ง = พฤติกรรมเดิมทุกไบต์
- ลงทะเบียน minute job: ไฟล์ `src/lib/ai/secretary/room-jobs-job.ts` (ลงทะเบียนตอน import ตามแบบ `crm/sequences-job.ts`) + `await import` ใน `scripts/crm-cron.mts` (ถัดจาก :76) + ที่ที่ route outbox โหลดงาน CRM (grep `sequences-job`) — ไม่แตะ `vercel.json` (R-K8: ไม่มี cron รายนาทีบน Vercel · ราง = VPS crontab + outbox hook + `after()` ใน request)
- ห้าม import `rooms.ts` → `worker.ts` วงกลม (worker import rooms ได้ · rooms ห้าม import worker)
## Files you own
`src/lib/ai/secretary/{worker,room-jobs-job}.ts` · `src/lib/ai/service.ts` (hunk `userMessageId`) · `scripts/crm-cron.mts` (1 บรรทัด import) · จุดลงทะเบียนฝั่ง route (1 บรรทัด) · `docs/modules/31-secretary.md` §5/§6 · `ledger/wo-notes/sec-s1.5.md`
## Acceptance = `scripts/qc-sec-s1.5.mts` ทั้งหมด PASS + regression: `qc-ai-brain` `qc-ai-schedule` `qc-ai-proactive` `qc-chat-push-badge` `qc-chat-notify-v2` `qc-mobile-chat` `qc-crm-c2.2` (ถ้ามี · minute-jobs) เท่า baseline · typecheck 0 · fitness ×2
