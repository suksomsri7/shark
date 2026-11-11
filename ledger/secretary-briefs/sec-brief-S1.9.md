# S1-7 — S1.9 งานประจำรันเป็นผู้ตั้ง (ขยาย `scheduled.ts` · ห้องใหม่ต่อรอบ · claim ก่อนรัน) (Opus · `wip/sec-s1.9` · หลัง S1.5)

Read `sec-brief-COMMON.md`, `sec-brief-RESOLUTIONS.md` (**R-K5** R-K8/K8b R-K6 §G), plan row S1.9, แบบ A7 + §4 ข้อ 7, `docs/modules/31-secretary.md` §5, และ oracle `scripts/qc-sec-s1.9.mts`. Verified code: `src/lib/ai/scheduled.ts` (126 บรรทัด · `createTask(ctx,{instruction,hourBkk})` cap 10 · `runScheduledTasks(now, deps)` ใช้ `aiSystemActor("scheduled-task")` → AppNotification + `sendPushToTenant` · mark lastRunDay **หลัง**รัน) · `AiScheduledTask` (S1.1: `ownerUserId? frequency? days Int[] channels String[]`) · `src/lib/ai/tools.ts` `schedule_task` :834 (params instruction+hourBkk) · `src/lib/ai/proposals.ts` `ai_schedule_task` :1389 (`dispatch` มี `userId` ของคนกด) · `src/lib/ai/secretary/rooms.ts` `startRoom` · `src/lib/ai/secretary/worker.ts` (`enqueueRoomJob` · `runRoomJobs(deps: {provider, post, now, limit})`) · `src/lib/ai/secretary/pack.ts` `FREE_PACK.scheduledMax` · `src/lib/core/quiet-hours.ts` `bkkParts`.

## `scheduled.ts` (ขยาย · ทางเดิมของแถว `ownerUserId = null` ต้องเดิมทุกไบต์ — `qc-ai-schedule` เขียว)
```ts
export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const; export const CHANNELS = ["push", "room"] as const;
export type TaskInput = { instruction: string; hourBkk: number; ownerUserId?: string; frequency?: Frequency; days?: number[]; channels?: Channel[] };
export async function createTask(ctx, input: TaskInput): Promise<{ id: string }>;
   // เดิม: ไม่มี ownerUserId ⇒ พฤติกรรมเดิม (cap MAX_TASKS_PER_TENANT · ไม่ตั้ง frequency) · ใหม่ (มี ownerUserId): frequency ปริยาย DAILY · WEEKLY ⇒ days ⊆ 0–6 ไม่ว่าง · MONTHLY ⇒ days ⊆ 1–31 ไม่ว่าง · DAILY ⇒ days = [] · channels ⊆ CHANNELS ปริยาย ["push","room"] · cap = FREE_PACK.scheduledMax ต่อร้าน (ข้อความไทยบอกเพดาน) · ownerUserId ต้องมี Membership acceptedAt≠null ของร้านนั้น (ไม่งั้น throw ไทย)
export function isDue(task: Pick<AiScheduledTask,"active"|"hourBkk"|"frequency"|"days"|"lastRunDay">, now: Date): boolean;  // pure · active · hourBkk === ชั่วโมงไทย · lastRunDay !== วันไทย · DAILY/null เสมอ · WEEKLY: วันในสัปดาห์ไทย (0=อา) ∈ days · MONTHLY: วันที่ไทย ∈ days
export async function runScheduledTasks(now?: Date, deps?: { provider?: AiProvider; post?: PushPost }): Promise<number>;
   // แถวเดิม (ownerUserId null): โค้ดเดิมทุกตัวอักษร
   // แถวใหม่: (1) claim ก่อนรัน `updateMany({ where: { id, active: true, OR: [{lastRunDay: null}, {lastRunDay: {not: today}}] }, data: { lastRunDay: today } })` count 0 ⇒ ข้าม (X5 สองรอบซ้อนทำครั้งเดียว) (2) `isDue` (3) Membership ของ owner (acceptedAt≠null) ไม่มี ⇒ logOps WARN "scheduled-skip" + ข้าม (4) `startRoom({tenantId, actor: aiMemberActor(...)}, { instruction, systems: [] }, now)` — error quota ⇒ logOps + ข้าม (ไม่ throw) (5) `enqueueRoomJob(tenantId, roomId, <USER message id ที่ startRoom สร้าง>, ownerUserId)` แล้ว `runRoomJobs({ provider, post, now, limit: 1 })` — worker ส่ง push ให้ผู้ตั้งเอง (channels มี "push") · ไม่สร้าง AppNotification · ไม่ sendPushToTenant · ผลเขียน = ข้อเสนอในห้อง (เดิมของ sendMessage) · นับงาน 1 (startRoom)
```
- `startRoom` ต้องคืน `messageId` ของข้อความแรกด้วย (เพิ่มในผล ok — S1.4 ไม่เปลี่ยนพฤติกรรมอื่น) หรือ worker มี `enqueueFirstMessage(roomId)` — เลือกอย่างแรก
- `tools.ts schedule_task`: เพิ่ม params optional `frequency` (enum) · `days` (int[]) · อธิบายไทย · `proposals.ts ai_schedule_task`: ส่ง `ownerUserId: userId ?? undefined`, `frequency`, `days` เข้า createTask · ข้อความผลบอกความถี่
- `listTasks` คืนคอลัมน์ใหม่ · `docs/modules/31-secretary.md` §5
## Files you own
`src/lib/ai/scheduled.ts` · `src/lib/ai/tools.ts` (schedule_task params) · `src/lib/ai/proposals.ts` (ai_schedule_task hunk) · `src/lib/ai/secretary/rooms.ts` (คืน messageId) · docs §5 · `ledger/wo-notes/sec-s1.9.md`
## Acceptance = `scripts/qc-sec-s1.9.mts` PASS ทั้งหมด + `qc-ai-schedule` `qc-ai-proposals` `qc-ai-tools` `qc-sec-s1.4` `qc-sec-s1.5` เท่าเดิม · typecheck 0 · fitness ×2 · light-check
