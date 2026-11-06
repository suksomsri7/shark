// AI Scheduled Tasks (agentic-3) — งานประจำที่ผู้ช่วย AI ทำเองตามเวลา
// วิสัยทัศน์เจ้าของ: "ทุกเย็น 6 โมง สรุปยอดขายให้" — ตั้งครั้งเดียว AI ทำซ้ำทุกวันเอง
//
// กฎเหล็ก:
// - งานประจำเป็นการ "สรุป/อ่าน" → เดินผ่าน sendMessage (มีเครื่องมืออ่านข้อมูลจริงครบ) ด้วย tier "fast" (haiku) ประหยัด
// - ผลลัพธ์ = AppNotification + push แจ้งเข้าเครื่อง (ไม่ทำ mutation — งานประจำห้ามลงมือแก้ข้อมูลเงียบ ๆ)
// - createTask/listTasks/setTaskActive/deleteTask เป็น tenant-scoped → tenantDb({ tenantId }) inject tenantId
// - runScheduledTasks เดินข้ามร้าน (cron ระดับแพลตฟอร์ม) → prisma ตรงได้ (นอก modules) · task พังตัวเดียว ไม่ล้มทั้งรอบ
//
// เลขา AI S1.9 (R-K5) ▸ งานที่มี `ownerUserId` = "งานของคนตั้ง" — รันด้วยสิทธิ์สดของผู้ตั้ง (Membership acceptedAt ≠ null)
//   ทุกรอบเปิด "ห้องงานใหม่" ผ่าน `startRoom` (นับงาน 1 + job ใน tx) → worker (`runRoomJobs`) ทำโมเดล + push ถึงผู้ตั้งเอง
//   SEC S3a.1-S1 ▸ R-Z5/R-Z6: ตัวงานของคนตั้งย้ายไป `./secretary/scheduled.ts` (ไม่เรียกโมเดลในลูป · ถึงเวลา = ชั่วโมง ≥ hourBkk) ·
//   งานที่ได้รันหลังลูป (ปริยาย) หรือส่งต่อให้ผู้เรียกผ่าน `deps.deferRoomJobs` (route hourly รันใน `after()`) ◂
//   claim ก่อนรัน (conditional updateMany ตั้ง lastRunDay = วันนี้ · count 0 = อีกรอบได้ไปแล้ว — X5) · ไม่สร้าง AppNotification
//   ความถี่ DAILY / WEEKLY (วันในสัปดาห์ไทย 0=อา) / MONTHLY (วันที่ไทย) ผ่าน `isDue` (pure) · ไม่มีนาที (R-K8 — รันรอบ hourly ของ hourBkk)
//   แถว `ownerUserId = null` = ทางเดิมทุกตัวอักษร ◂

import type { AiScheduledTask } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { sendMessage } from "./service";
import { aiSystemActor } from "./actor";
import { resolveProvider, type AiProvider } from "./provider";
import { dayKeyBangkok } from "./rules";
import { FREE_PACK } from "./secretary/pack";
import { isDue as ownedTaskDue, runOwnedTask } from "./secretary/scheduled";
import { bkkParts } from "@/lib/core/quiet-hours"; // SEC S3a.1-S2 R-Z31 ◂
import type { RoomJobDeps } from "./secretary/worker";

type Ctx = { tenantId: string };

export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export const CHANNELS = ["push", "room"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export type Channel = (typeof CHANNELS)[number];
type PushPost = NonNullable<RoomJobDeps["post"]>;

/** ข้อมูลตั้งงานประจำ — ไม่มี ownerUserId = ทางเดิม (frequency/days/channels ไม่ถูกใช้) */
export type TaskInput = {
  instruction: string;
  hourBkk: number;
  ownerUserId?: string;
  frequency?: Frequency;
  days?: number[];
  channels?: Channel[];
};

const FREQ_LABEL: Record<Frequency, string> = { DAILY: "ทุกวัน", WEEKLY: "ทุกสัปดาห์", MONTHLY: "ทุกเดือน" };
const WEEKDAY_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

const MAX_TASKS_PER_TENANT = 10; // กันตั้งงานประจำล้นร้าน
const MAX_TENANT_TASKS_PER_RUN = 100; // เพดานต่อรอบ cron (กันงานบานปลายในชั่วโมงเดียว)

// ── สร้างงานประจำ ── instruction ว่าง / hourBkk นอก 0-23 → throw ไทย · เกิน 10 ต่อร้าน → throw
//   S1.9 ▸ มี ownerUserId = งานของคนตั้ง → ตรวจความถี่/วัน/ช่องทาง/สมาชิก + เพดาน FREE_PACK.scheduledMax (createOwnedTask) ◂
export async function createTask(
  ctx: Ctx,
  input: TaskInput,
  now: Date = new Date(), // SEC S3a.1-S1 รอบ 2 (§Z.4 Q1): นาฬิกาฉีดได้ — ตัดสินว่าชั่วโมงที่ตั้งผ่านไปแล้วหรือยังในวันไทยวันนี้
): Promise<{ id: string }> {
  const instruction = String(input.instruction ?? "").trim();
  if (!instruction) throw new Error("ต้องระบุสิ่งที่จะให้ผู้ช่วยทำเป็นงานประจำ");
  const hourBkk = Math.round(Number(input.hourBkk));
  if (!Number.isFinite(hourBkk) || hourBkk < 0 || hourBkk > 23) {
    throw new Error("ชั่วโมงที่ให้ทำต้องอยู่ระหว่าง 0-23 (เวลาไทย)");
  }
  const ownerUserId = typeof input.ownerUserId === "string" ? input.ownerUserId.trim() : "";
  if (ownerUserId) return createOwnedTask(ctx, { ...input, instruction, hourBkk, ownerUserId }, now);
  const count = await tenantDb(ctx).aiScheduledTask.count();
  if (count >= MAX_TASKS_PER_TENANT) {
    throw new Error(`ตั้งงานประจำได้สูงสุด ${MAX_TASKS_PER_TENANT} รายการต่อร้าน — ลบรายการเดิมก่อนถ้าต้องการเพิ่ม`);
  }
  const row = await tenantDb(ctx).aiScheduledTask.create({
    data: { tenantId: ctx.tenantId, instruction, hourBkk },
  });
  return { id: row.id };
}

/** วันที่เลือกของ WEEKLY (0–6) / MONTHLY (1–31) — ต้องเป็นจำนวนเต็มในช่วง ไม่ว่าง · ตัดซ้ำ + เรียง */
function cleanDays(frequency: Frequency, raw: unknown): number[] {
  if (frequency === "DAILY") return [];
  const [lo, hi] = frequency === "WEEKLY" ? [0, 6] : [1, 31];
  const what = frequency === "WEEKLY" ? "วันในสัปดาห์ (0=อาทิตย์ … 6=เสาร์)" : "วันที่ของเดือน (1–31)";
  if (!Array.isArray(raw) || raw.length === 0) throw new Error(`งานประจำ${FREQ_LABEL[frequency]}ต้องเลือก${what}อย่างน้อย 1 วัน`);
  const out = new Set<number>();
  for (const x of raw) {
    const n = Number(x);
    if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`${what} ต้องอยู่ระหว่าง ${lo}–${hi} — ได้ค่า "${String(x).slice(0, 10)}"`);
    out.add(n);
  }
  return [...out].sort((x, y) => x - y);
}

/** ช่องทางส่งผล ⊆ CHANNELS · ไม่ระบุ = ["push","room"] · ระบุแต่ว่าง/แปลก = throw ไทย */
function cleanChannels(raw: unknown): Channel[] {
  if (raw === undefined || raw === null) return [...CHANNELS];
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("ต้องเลือกช่องทางส่งผลอย่างน้อย 1 ช่องทาง (push หรือ room)");
  const out: Channel[] = [];
  for (const x of raw) {
    const c = typeof x === "string" ? x.trim().toLowerCase() : "";
    if (!(CHANNELS as readonly string[]).includes(c)) throw new Error(`ไม่รู้จักช่องทางส่งผล "${String(x).slice(0, 20)}" — ใช้ได้เฉพาะ push หรือ room`);
    if (!out.includes(c as Channel)) out.push(c as Channel);
  }
  return out;
}

/** งานประจำของคนตั้ง (S1.9) — ผู้ตั้งต้องเป็นสมาชิกที่รับคำเชิญแล้วของร้านนี้ · เพดาน FREE_PACK.scheduledMax ต่อร้าน */
async function createOwnedTask(
  ctx: Ctx,
  input: TaskInput & { instruction: string; hourBkk: number; ownerUserId: string },
  now: Date = new Date(),
): Promise<{ id: string }> {
  const freqRaw = input.frequency === undefined || input.frequency === null ? "DAILY" : String(input.frequency).trim().toUpperCase();
  if (!(FREQUENCIES as readonly string[]).includes(freqRaw)) {
    throw new Error(`ไม่รู้จักความถี่ "${String(input.frequency).slice(0, 20)}" — ใช้ได้เฉพาะ ทุกวัน (DAILY) ทุกสัปดาห์ (WEEKLY) หรือทุกเดือน (MONTHLY)`);
  }
  const frequency = freqRaw as Frequency;
  const days = cleanDays(frequency, input.days);
  const channels = cleanChannels(input.channels);
  const member = await prisma.membership.findFirst({
    where: { tenantId: ctx.tenantId, userId: input.ownerUserId, acceptedAt: { not: null } },
    select: { id: true },
  });
  if (!member) throw new Error("ผู้ตั้งงานประจำต้องเป็นสมาชิกของกิจการนี้ที่รับคำเชิญแล้ว");
  const max = FREE_PACK.scheduledMax;
  const count = await tenantDb(ctx).aiScheduledTask.count();
  if (count >= max) {
    throw new Error(`ตั้งงานประจำได้สูงสุด ${max} รายการต่อร้าน — ลบหรือปิดรายการเดิมก่อนถ้าต้องการเพิ่ม`);
  }
  // SEC S3a.1-S1 รอบ 2 ▸ §Z.4 Q1: isDue = ชั่วโมง ≥ hourBkk (ตามหลังได้) ⇒ ตั้งตอนชั่วโมงที่ตั้งมาถึง/ผ่านไปแล้วของวันนี้ = นับว่าวันนี้รันแล้ว
  //   (เริ่มรอบแรกพรุ่งนี้ — ไม่รันทันทีในชั่วโมงถัดไปของวันตั้ง) · ยังไม่ถึง = รันวันนี้ตามเวลา ◂
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const passed = new Date(at.getTime() + 7 * 3_600_000).getUTCHours() >= input.hourBkk;
  const row = await tenantDb(ctx).aiScheduledTask.create({
    data: { tenantId: ctx.tenantId, instruction: input.instruction, hourBkk: input.hourBkk, ownerUserId: input.ownerUserId, frequency, days, channels, ...(passed ? { lastRunDay: dayKeyBangkok(at) } : {}) },
  });
  return { id: row.id };
}

/** S1.14 R-S1.14f ▸ แก้งานประจำ — ช่องที่ส่งมาเท่านั้น (ไม่ส่ง = คงเดิม) · ownerUserId/lastRunDay คงเดิม ◂ */
export type TaskPatch = { instruction?: string; hourBkk?: number; frequency?: Frequency; days?: number[]; channels?: Channel[]; active?: boolean };

/**
 * แก้งานประจำ (S1.14 R-S1.14f) — ผู้แก้ = เจ้าของงาน (`ownerUserId`) หรือ OWNER ของร้าน (โหลด Membership ที่รับแล้วจากฐาน · งานแบบเดิมที่ไม่มีเจ้าของ = OWNER เท่านั้น)
 *   ตรวจด้วยตัวเดียวกับตอนสร้าง (`cleanDays` · `cleanChannels` · ชั่วโมง 0–23 · คำสั่งไม่ว่าง) — ผิด = throw ไทย ไม่เขียน
 *   เปลี่ยนความถี่โดยไม่ส่งวัน ⇒ ตรวจวันเดิมกับความถี่ใหม่ (DAILY ล้างวันเป็น []) · ไม่พบ/ร้านอื่น = not_found · ไม่ใช่ผู้มีสิทธิ์ = forbidden
 */
export async function updateTask(
  ctx: Ctx & { userId: string },
  id: string,
  patch: TaskPatch,
): Promise<{ ok: true; task: AiScheduledTask } | { ok: false; error: "not_found" | "forbidden" }> {
  const tid = typeof id === "string" ? id.trim() : "";
  const row = tid ? await tenantDb(ctx).aiScheduledTask.findFirst({ where: { id: tid } }) : null;
  if (!row) return { ok: false, error: "not_found" };
  const me = await prisma.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: ctx.userId, acceptedAt: { not: null } }, select: { role: true } });
  if (!me || !(me.role === "OWNER" || (row.ownerUserId !== null && row.ownerUserId === ctx.userId))) return { ok: false, error: "forbidden" };
  const p = patch ?? {};
  const data: Record<string, unknown> = {};
  if (p.instruction !== undefined) {
    const instruction = String(p.instruction ?? "").trim();
    if (!instruction) throw new Error("ต้องระบุสิ่งที่จะให้ผู้ช่วยทำเป็นงานประจำ");
    data.instruction = instruction;
  }
  if (p.hourBkk !== undefined) {
    const h = Math.round(Number(p.hourBkk));
    if (!Number.isFinite(h) || h < 0 || h > 23) throw new Error("ชั่วโมงที่ให้ทำต้องอยู่ระหว่าง 0-23 (เวลาไทย)");
    data.hourBkk = h;
  }
  if (p.frequency !== undefined || p.days !== undefined) {
    const freqRaw = String(p.frequency ?? row.frequency ?? "DAILY").trim().toUpperCase();
    if (!(FREQUENCIES as readonly string[]).includes(freqRaw)) throw new Error(`ไม่รู้จักความถี่ "${String(p.frequency).slice(0, 20)}" — ใช้ได้เฉพาะ ทุกวัน (DAILY) ทุกสัปดาห์ (WEEKLY) หรือทุกเดือน (MONTHLY)`);
    const frequency = freqRaw as Frequency;
    data.frequency = frequency;
    data.days = cleanDays(frequency, p.days !== undefined ? p.days : row.days);
  }
  if (p.channels !== undefined) data.channels = cleanChannels(p.channels);
  if (p.active !== undefined) {
    if (typeof p.active !== "boolean") throw new Error("ค่าเปิด/ปิดงานประจำต้องเป็นใช่หรือไม่ใช่");
    data.active = p.active;
  }
  if (Object.keys(data).length > 0) {
    const r = await tenantDb(ctx).aiScheduledTask.updateMany({ where: { id: row.id }, data });
    if (r.count !== 1) return { ok: false, error: "not_found" };
  }
  const task = await tenantDb(ctx).aiScheduledTask.findFirst({ where: { id: row.id } });
  return task ? { ok: true, task } : { ok: false, error: "not_found" };
}

/** คำอธิบายความถี่ภาษาไทย (pure) — เช่น "ทุกวัน" · "ทุกสัปดาห์ (วันจันทร์)" · "ทุกเดือน (วันที่ 1, 15)" */
export function describeFrequency(frequency: string | null | undefined, days: number[] | null | undefined): string {
  const f = (FREQUENCIES as readonly string[]).includes(String(frequency)) ? (frequency as Frequency) : "DAILY";
  const d = Array.isArray(days) ? days : [];
  if (f === "WEEKLY" && d.length > 0) return `${FREQ_LABEL.WEEKLY} (วัน${d.map((x) => WEEKDAY_TH[x] ?? String(x)).join(", ")})`;
  if (f === "MONTHLY" && d.length > 0) return `${FREQ_LABEL.MONTHLY} (วันที่ ${d.join(", ")})`;
  return FREQ_LABEL[f];
}

/**
 * ถึงเวลารันงานนี้ไหม ณ `now` (pure · เวลาไทย) — active · ชั่วโมงไทย ≥ hourBkk · lastRunDay ≠ วันไทย
 *   SEC S3a.1-S1 R-Z6: ตัวจริงอยู่ที่ `secretary/scheduled.ts#isDue` (ตามหลังได้ในวันเดียวกัน) — ชื่อนี้คงไว้ให้ผู้เรียกเดิม
 */
export function isDue(
  task: Pick<AiScheduledTask, "active" | "hourBkk" | "frequency" | "days" | "lastRunDay">,
  now: Date,
): boolean {
  return ownedTaskDue(task, now);
}

// ── งานประจำทั้งหมดของร้าน (ใหม่→เก่า) ──
export async function listTasks(ctx: Ctx) {
  return tenantDb(ctx).aiScheduledTask.findMany({ orderBy: { createdAt: "desc" } });
}

// ── เปิด/ปิดงานประจำ — คืน true ถ้าอัปเดตได้ (ไม่พบ → false) ──
export async function setTaskActive(ctx: Ctx, id: string, active: boolean): Promise<boolean> {
  const res = await tenantDb(ctx).aiScheduledTask.updateMany({ where: { id }, data: { active } });
  return res.count > 0;
}

// ── ลบงานประจำ — คืน true ถ้าลบได้ (ไม่พบ → false) ──
export async function deleteTask(ctx: Ctx, id: string): Promise<boolean> {
  const res = await tenantDb(ctx).aiScheduledTask.deleteMany({ where: { id } });
  return res.count > 0;
}

/**
 * รันงานประจำที่ถึงเวลา — เรียกจาก /api/cron/hourly ทุกชั่วโมง
 * เงื่อนไข: task active + hourBkk == ชั่วโมงไทยปัจจุบัน (คำนวณจาก now +07:00) + lastRunDay != วันนี้ (BKK)
 * แต่ละ task: รัน AI ด้วย instruction (tier fast) → เก็บผลเป็น AppNotification → เซ็ต lastRunDay = วันนี้
 * - provider จาก deps.provider (ข้อสอบฉีดได้) ?? resolveProvider("fast") · ไม่มี provider → return 0 (ไม่ throw)
 * - task พัง catch ไปต่อ (ไม่ล้มทั้งรอบ) · คืนจำนวน task ที่ทำสำเร็จ
 */
export async function runScheduledTasks(
  now: Date = new Date(),
  deps?: {
    provider?: AiProvider;
    post?: PushPost;
    /** SEC S3a.1-S1 R-Z6: มี = ผู้เรียกรับ jobId ของห้องงานประจำไปรันเอง (route hourly · `after()`) · ไม่มี = รัน worker หลังลูป */
    deferRoomJobs?: (jobIds: string[]) => void;
  },
): Promise<number> {
  // งานประจำ = สรุป/อ่าน → tier "fast" (haiku) ประหยัด · ไม่มี provider (ยังไม่เปิด AI) = ข้ามเงียบ ๆ
  const provider = deps?.provider ?? resolveProvider("fast");
  if (!provider) return 0;

  // ชั่วโมงไทยปัจจุบัน: บวก 7 ชม.แล้วอ่าน UTC hour (เชื่อถือได้ทุก environment) · วันแบบ BKK ผ่าน rules
  const hourBkk = new Date(now.getTime() + 7 * 3_600_000).getUTCHours();
  const today = dayKeyBangkok(now);

  // SEC S3a.1-S1 ▸ R-Z6: งานของคนตั้ง = ชั่วโมงไทย ≥ hourBkk (ตามหลังได้) · แถวเดิม (ไม่มีเจ้าของ) = ชั่วโมงตรงตัวเหมือนเดิม ◂
  // SEC S3a.1-S2 ▸ R-Z31 (RC2 MAJOR-1): สอง query แยกกลุ่ม · take ต่อกลุ่ม · งานของคนตั้งกรอง "วันที่ต้องรัน" ใน SQL ก่อน take
  //   (DAILY/null ∨ WEEKLY ∧ days มีวันในสัปดาห์ไทย ∨ MONTHLY ∧ days มีวันที่ไทย) — งานที่ไม่ถึงวันไม่กินที่ของงานที่ถึงวัน · เต็ม take = logOps ◂
  const notToday = { OR: [{ lastRunDay: null }, { lastRunDay: { not: today } }] };
  const p = bkkParts(now);
  const dow = new Date(Date.UTC(p.y, p.mo, p.day)).getUTCDay();
  const [legacy, owned] = await Promise.all([
    prisma.aiScheduledTask.findMany({
      where: { active: true, ownerUserId: null, hourBkk, ...notToday },
      orderBy: { createdAt: "asc" },
      take: MAX_TENANT_TASKS_PER_RUN,
    }),
    prisma.aiScheduledTask.findMany({
      where: {
        active: true,
        ownerUserId: { not: null },
        hourBkk: { lte: hourBkk },
        AND: [
          notToday,
          {
            OR: [
              { frequency: null },
              { frequency: "DAILY" },
              { frequency: "WEEKLY", days: { has: dow } },
              { frequency: "MONTHLY", days: { has: p.day } },
            ],
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: MAX_TENANT_TASKS_PER_RUN,
    }),
  ]);
  for (const [name, rows] of [["legacy", legacy], ["owned", owned]] as const) {
    if (rows.length >= MAX_TENANT_TASKS_PER_RUN) {
      await logOps("WARN", "ai", `scheduled: งานประจำกลุ่ม ${name} ถึงเพดาน ${MAX_TENANT_TASKS_PER_RUN} ต่อรอบ — ส่วนที่เหลือรอรอบถัดไป`, { detail: JSON.stringify({ hourBkk, today }) }).catch(() => {});
    }
  }
  const tasks = [...owned, ...legacy];

  let ran = 0;
  // SEC S3a.1-S1 ▸ R-Z6: รอบที่ 1 = งานของคนตั้ง (claim + startRoom(+job) เท่านั้น · ไม่เรียกโมเดล) → ส่ง jobId ให้ผู้เรียก (route hourly
  //   รันใน `after()`) หรือรัน worker ที่นี่ · รอบที่ 2 = แถวเดิม (ownerUserId null) เดินโค้ดเดิมทุกตัวอักษร ◂
  const ownedJobIds: string[] = [];
  for (const task of tasks) {
    if (!task.ownerUserId) continue;
    const jobId = await runOwnedTask(task, now, today);
    if (jobId) {
      ran++;
      ownedJobIds.push(jobId);
    }
  }
  if (ownedJobIds.length > 0) {
    if (deps?.deferRoomJobs) deps.deferRoomJobs([...ownedJobIds]);
    else {
      try {
        const { runRoomJobs } = await import("./secretary/worker");
        await runRoomJobs({ provider, ...(deps?.post ? { post: deps.post } : {}), now, jobIds: ownedJobIds, limit: ownedJobIds.length });
      } catch (e) {
        await logOps("WARN", "ai", "scheduled: รันงานของห้องงานประจำไม่สำเร็จ (ตัวเก็บตกรายนาทีหยิบต่อ)", { detail: e instanceof Error ? e.message : String(e) }).catch(() => {});
      }
    }
  }
  for (const task of tasks) {
    if (task.ownerUserId) continue; // S1.9 ▸ งานของคนตั้งทำในรอบที่ 1 แล้ว ◂
    try {
      // รัน AI แบบเดียวกับผู้ใช้พิมพ์คำสั่งเอง (มีเครื่องมืออ่านข้อมูลจริงครบ) — ฉีด provider fast
      // CRM C5.5-G1 ▸ ไม่มีคนกด + แถวงานไม่เก็บผู้ตั้ง · ผลส่งเป็นแจ้งเตือนที่ "ทุกคนในร้าน" เห็น (recipientUserId null)
      //   ⇒ รันด้วย system actor `scheduled-task` = สิทธิ์ของผู้อ่านที่น้อยที่สุด (ดูเหตุผลที่ ai/actor.ts) ◂
      const res = await sendMessage(
        { tenantId: task.tenantId, actor: aiSystemActor(task.tenantId, "scheduled-task") },
        { text: task.instruction },
        { provider, source: "SCHEDULED" },
      );
      if (!res.ok) continue; // เกินเพดาน/ปิดใช้ → ข้าม ไม่ mark เพื่อให้ลองใหม่รอบถัดไปได้
      await prisma.appNotification.create({
        data: {
          tenantId: task.tenantId,
          title: "งานประจำจากผู้ช่วย AI",
          body: `${task.instruction}\n\n${res.reply}`,
        },
      });
      // push แจ้งเข้าเครื่อง — best-effort ห้ามพารอบ cron พัง
      try {
        const { sendPushToTenant } = await import("@/lib/core/push");
        await sendPushToTenant(task.tenantId, {
          title: "งานประจำจากผู้ช่วย AI",
          body: task.instruction.slice(0, 80),
        });
      } catch {
        // push พัง → เงียบ (noti ถูกบันทึกแล้ว)
      }
      // mark วันนี้แล้ว — รันซ้ำชั่วโมงเดิมในวันเดียวกันจะถูกข้าม
      await prisma.aiScheduledTask.update({ where: { id: task.id }, data: { lastRunDay: today } });
      ran++;
    } catch {
      // task ตัวนี้พัง (เช่น provider ล่มชั่วคราว) → ข้ามไปทำตัวถัดไป ไม่ให้ล้มทั้งรอบ
      continue;
    }
  }
  return ran;
}
