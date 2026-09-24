// minute-jobs.ts — ตัวกระจายงานตามเวลา (CRM v2 WO C0.5 · มติ C16 ฉบับแก้ใน RESOLUTIONS R-C.6)
//
// งานทุกชิ้นของเฟส C2 ที่ต้องเกิด "ตามเวลา" โดยไม่มีใครกดอะไร (ขั้น sequence · อีเมลตั้งเวลา · เตือนนัด ·
// ดีลนิ่ง) ขี่ตัวนี้ · ทางเข้า production จริงคือ `scripts/crm-cron.mts minute` บน crontab ของ VPS (ติดตั้งใน C6.1)
// · hook ใน `/api/cron/outbox` เป็นของแถมที่ไม่เสียหาย (route นั้นไม่มีตัวตั้งเวลาใดชี้มา)
//
// API
//   registerMinuteJob({ name, everyMinutes, run(now, budgetMs, {signal, deadline}), cadence?, vpsOnly? })
//                                      — ชื่อซ้ำ = แทนที่ตัวเดิม (นอก dev: ห้ามเปลี่ยน everyMinutes/cadence/vpsOnly)
//   runMinuteJobs(now, { cadence?, entry? }) — หนึ่งรอบ (ค่าเริ่มต้น cadence "minute") · ไม่ throw
//   settleOutstandingMinuteJobs(maxMs) — ตัวรันรองานที่ถูกตัดงบก่อน exit
//   getMinuteJobStatus(names)          — { name, everyMinutes, lastRunAt, lastOkAt, lastError }[] (หน้า integrations C3.6 · ส่งชื่อเสมอ)
//
// สถานะเก็บใน `OpsAlertState` แถวละเรื่อง (ไม่มีตารางใหม่ · ไม่มี JSON map รวม = ไม่มี lost update):
//   minute-job:lease:<name>  lastAlertAt = เวลาที่ lease หมด (ปล่อยแล้ว = epoch)
//   minute-job:run:<name>    lastAlertAt = `now` ของรอบที่ "จบ" ล่าสุด (สำเร็จ/ล้ม/ถูกตัดงบ)
//   minute-job:ok:<name>     lastAlertAt = `now` ของรอบที่สำเร็จล่าสุด
// ข้อความ error → `OpsEvent` source "minute-job" ระดับ WARN (ERROR ส่งเมลหาเจ้าของ — งานที่ล้มรัว ๆ จะถล่มเมล)
// ทุก key ขึ้นต้น `minute-job:` จึงชนกับแถว throttle ของ logOps (key = ชื่อ source ตรง ๆ) ไม่ได้
//
// 🔴 ทุกงานต้อง idempotent และเริ่มใหม่ได้ ณ ทุกคำสั่ง (every job MUST be idempotent and restartable at any
//    statement): งานอาจถูกตัดงบ ถูกยกเลิกผ่าน `signal` หรือโพรเซสตายกลางคัน แล้วรอบหลังรันซ้ำตั้งแต่ต้น
//    งานที่ดีอ่าน `signal`/`deadline` (อาร์กิวเมนต์ที่ 3) แล้วหยุดเองก่อนหมดงบ
//
// ถึงรอบแบบ "หน้าต่างตรงเวลา" (aligned windows): ถึงรอบเมื่อ `now` อยู่คนละหน้าต่างขนาด everyMinutes กับรอบที่จบล่าสุด
//   (หน้าต่างนับจากเที่ยงคืนเวลาไทย · ไม่ใช่ `now − รอบล่าสุด ≥ everyMinutes` ซึ่ง cron ที่เริ่มช้า/เร็วต่างกันไม่กี่ร้อย ms
//   จะข้ามรอบเงียบ ๆ เกือบครึ่งหนึ่ง)
//
// ⚠️ ทำไมใช้ "แถว lease" ไม่ใช่ advisory lock (C0.3 ใช้ `pg_advisory_xact_lock`): lock ระดับ transaction อยู่ได้แค่
//    ในหนึ่ง transaction ส่วน lock ระดับ session ผ่าน pooler โหมด transaction ไม่ได้ · งานรายนาทีต้องถือสิทธิ์ข้าม
//    transaction ตลอดเวลาที่งานรัน ⇒ แถว lease ที่นี่ · xact lock ที่โน่น — ห้าม "รวมให้เหมือนกัน"

import { prisma } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";

export type MinuteJobCadence = "minute" | "hourly" | "daily";

export type MinuteJob = {
  /** ชื่อไม่ซ้ำ เช่น `crm.sequences` */
  name: string;
  /** ถึงรอบเมื่อ `now` อยู่คนละหน้าต่าง everyMinutes (นับจากเที่ยงคืนไทย) กับรอบที่จบล่าสุด — ดู minuteJobDue */
  everyMinutes: number;
  /**
   * `now` = นาฬิกาเดียวของรอบนี้ · budgetMs = งบที่ "เหลือ" ของรอบ (งานควรเคารพ แต่ตัวกระจายไม่ไว้ใจ)
   * ctrl.signal ถูก abort เมื่อหมดงบ · ctrl.deadline = เวลาจริง (ms) ที่งบหมด — งานที่ดีหยุดเองก่อนถึง
   */
  run: (now: Date, budgetMs: number, ctrl: MinuteJobControl) => unknown;
  /** ตัวรัน `crm-cron.mts` โหมดไหนเป็นคนรัน (ค่าเริ่มต้น "minute") */
  cadence?: MinuteJobCadence;
  /** true = รันเฉพาะเมื่อเรียกจากตัวรันบน VPS (`entry: "vps"`) — ใช้กับงานสัญญาณชีพ (ดูท้ายส่วนทะเบียน) เพื่อพิสูจน์ว่า crontab ยังเดิน */
  vpsOnly?: boolean;
};

export type MinuteJobControl = { signal: AbortSignal; deadline: number };
export type MinuteJobEntry = "vps" | "route";

export type MinuteJobStatus = {
  name: string;
  everyMinutes: number | null;
  lastRunAt: Date | null;
  lastOkAt: Date | null;
  lastError: string | null;
};

export type MinuteJobOutcome = "ok" | "failed" | "cut-off" | "not-due" | "busy" | "no-budget";
export type MinuteJobsSummary = {
  cadence: MinuteJobCadence;
  results: { name: string; outcome: MinuteJobOutcome }[];
  /** อ่านสถานะงานจากฐานไม่ได้ (ฐานล่ม) — ทั้งรอบไม่ได้ทำอะไร · ตัวรันต้องจบด้วย exit ≠ 0 */
  stateReadFailed: boolean;
  /** จำนวนงานที่พลาดฝั่งตัวกระจาย/ฐาน (ไม่ใช่ตัวงานล้ม) */
  dispatcherErrors: number;
  /** ปฏิเสธทั้งรอบเพราะ `now` อยู่ในอนาคต */
  refusedFutureNow: boolean;
};

export const MINUTE_JOB_BUDGET_MS = 20_000;
// AUDIT-CLASS X5: lease ≤ 15 นาที (MASTER-PLAN §4 X5) — โพรเซสที่ตายขณะถือ lease ⇒ รอบที่ now ≥ หมด lease หยิบใหม่ได้
export const MINUTE_JOB_LEASE_MS = 15 * 60_000;
/** งบที่เหลือน้อยกว่านี้ = ไม่เริ่มงานใหม่ (ปล่อยให้รอบหน้า · ยังไม่จอง จึงยังถึงรอบอยู่) */
const MIN_START_BUDGET_MS = 500;
const OPS_SOURCE = "minute-job";
/** `now` ล้ำนาฬิกาจริงเกินนี้ = ปฏิเสธทั้งรอบ (ไม่งั้นแถว run = อนาคต ทำให้งานไม่ถึงรอบจนถึงเวลานั้น) */
const FUTURE_TOLERANCE_MS = 60_000;
/** หน้าต่างนับจากเที่ยงคืนเวลาไทย (UTC+7) — หน้าต่างที่หาร 60 นาทีลงตัวไม่เปลี่ยนแนว · หน้าต่างรายวันตัดที่ 00:00 ไทย */
const WINDOW_OFFSET_MS = 7 * 60 * 60_000;
const ERROR_MAX = 4000;

const leaseKey = (name: string) => `minute-job:lease:${name}`;
const runKey = (name: string) => `minute-job:run:${name}`;
const okKey = (name: string) => `minute-job:ok:${name}`;
const opsMessage = (name: string, what: string) => `${name} · ${what}`;

// ทะเบียนเก็บบน globalThis — โมดูลนี้ถูกโหลดซ้ำได้ (bundle ของ Next / ตัวรันสคริปต์) แต่ทะเบียนต้องมีชุดเดียวต่อโพรเซส
const REGISTRY_KEY = Symbol.for("shark.platform.minute-jobs.registry");
type Registry = Map<string, MinuteJob>;
const holder = globalThis as unknown as Record<symbol, Registry | undefined>;
const registry: Registry = holder[REGISTRY_KEY] ?? new Map<string, MinuteJob>();
holder[REGISTRY_KEY] = registry;

export function registerMinuteJob(job: MinuteJob): void {
  if (!job.name || !Number.isFinite(job.everyMinutes) || job.everyMinutes <= 0) {
    throw new Error(`registerMinuteJob: invalid job ${JSON.stringify(job.name)} (everyMinutes must be > 0)`);
  }
  const next: MinuteJob = { ...job, cadence: job.cadence ?? "minute", vpsOnly: job.vpsOnly ?? false };
  const prev = registry.get(job.name);
  // ชื่อซ้ำที่เปลี่ยนจังหวะ = บั๊กที่ไม่มีใครเห็น (import ตัวหลังชนะเงียบ ๆ) — นอก dev ให้ล้มดัง ๆ
  if (
    prev &&
    process.env.NODE_ENV !== "development" &&
    (prev.everyMinutes !== next.everyMinutes || prev.cadence !== next.cadence || prev.vpsOnly !== next.vpsOnly)
  ) {
    throw new Error(
      `registerMinuteJob: "${job.name}" is already registered with everyMinutes=${prev.everyMinutes} cadence=${prev.cadence} vpsOnly=${prev.vpsOnly} — refusing to change it to ${next.everyMinutes}/${next.cadence}/${next.vpsOnly}`,
    );
  }
  registry.set(job.name, next);
}

// ── no-op job ให้ข้อสอบ/หน้า integrations มีสัญญาณชีพ (ลงทะเบียนตอน import — ทั้ง route และ crm-cron.mts ผ่านทางนี้) ──
// vpsOnly: สัญญาณชีพต้องพิสูจน์ว่า "ตัวรันบน VPS" ยังเดิน — ถ้า route (uptime pinger / curl มือ) ต่ออายุได้ด้วย
//   หน้า integrations จะขึ้นว่าปกติทั้งที่ crontab หายไปแล้ว
registerMinuteJob({ name: "crm.heartbeat", everyMinutes: 5, vpsOnly: true, run: async () => {} });

// CRM C2.1 ▸ กฎอัตโนมัติ CRM (ใบ C2.1 · §7.3) — ขั้น "รอ n วัน" ที่ถึงเวลา (รายชั่วโมง) · trigger ตามรอบเวลา (รายวัน 00:00 ไทย)
//   ทั้งสองงาน idempotent: ขั้นที่รอจองแบบ lease ที่ตัวรันกลาง (action-runner) · trigger ตามรอบเวลามีกุญแจกันซ้ำต่อ (กฎ, รายการ, วัน/ช่วง)
//   โหลด CRM ผ่าน facade ตอนรันเท่านั้น (ไฟล์นี้ถูก import จาก route/crm-cron.mts — ห้ามลากกราฟ CRM ตอนโหลด)
//   ประตู uiVersion (กติกาถาวร R-E.14) อยู่ในตัวงานเอง: ทั้งสองกรองเฉพาะระบบ settings.crm.uiVersion = 2 ใน SQL — ระบบ uiVersion 1 = ไม่ทำอะไร
//   (ขั้นที่รอคงสถานะ WAITING · trigger ตามรอบเวลาถูกข้ามทั้งระบบ) จนกว่าจะเปิด 2 อีกครั้ง
registerMinuteJob({
  name: "crm.automation.waits",
  everyMinutes: 60,
  cadence: "hourly",
  run: async (now, _budgetMs, ctrl) => {
    const { automation } = await import("@/lib/modules/crm");
    await automation.runDueWaits({ now, signal: ctrl.signal, deadline: ctrl.deadline });
  },
});
registerMinuteJob({
  name: "crm.automation.cron",
  everyMinutes: 1440,
  cadence: "daily",
  run: async (now, _budgetMs, ctrl) => {
    const { automation } = await import("@/lib/modules/crm");
    // ถูกตัดงบกลางทาง = คืน cutOff (ไม่ throw) — กุญแจของ close_due/field_due ผูกกับวันที่ของรายการ และรอบถัดไปย้อนเก็บได้ 7 วัน
    //   ⇒ ของที่รอบนี้ยังไม่ได้ทำไม่หาย (SF-2)
    await automation.runCronTriggers({ now, signal: ctrl.signal, deadline: ctrl.deadline });
  },
});
// ◂ CRM C2.1

function errorText(e: unknown): string {
  let s: string;
  if (e instanceof Error) s = e.stack && e.stack.includes(e.message) ? e.stack : `${e.name}: ${e.message}`;
  else if (e === undefined) s = "rejected without a reason (undefined)";
  else if (typeof e === "string") s = e;
  else {
    try {
      s = JSON.stringify(e) ?? String(e);
    } catch {
      s = String(e);
    }
  }
  return s.length > ERROR_MAX ? `${s.slice(0, ERROR_MAX - 1)}…` : s;
}

async function readTimes(keys: string[]): Promise<Map<string, Date>> {
  if (keys.length === 0) return new Map();
  const rows = await prisma.opsAlertState.findMany({ where: { source: { in: keys } }, select: { source: true, lastAlertAt: true } });
  return new Map(rows.map((r) => [r.source, r.lastAlertAt]));
}

/**
 * ถึงรอบ = `now` อยู่คนละหน้าต่างกับรอบที่จบล่าสุด (หน้าต่างขนาด everyMinutes นับจากเที่ยงคืนไทย)
 * ⚠️ ห้ามกลับไปใช้ `now − lastRun ≥ P`: cron เริ่มช้าต่างกันไม่กี่ร้อย ms (10:07:01.40 → 11:07:01.10) = ข้ามรอบเงียบ ๆ
 */
export function minuteJobDue(everyMinutes: number, lastRun: Date | null | undefined, now: Date): boolean {
  if (!lastRun) return true;
  const p = everyMinutes * 60_000;
  return Math.floor((now.getTime() + WINDOW_OFFSET_MS) / p) > Math.floor((lastRun.getTime() + WINDOW_OFFSET_MS) / p);
}
const isDue = (job: MinuteJob, lastRun: Date | undefined, now: Date) => minuteJobDue(job.everyMinutes, lastRun, now);

/** เวลา → timestamp(3) แบบ UTC โดยไม่พึ่ง TimeZone ของ session (คอลัมน์เป็น timestamp ไม่มีโซน เก็บเวลา UTC) */
const utc = (d: Date) => d.toISOString();

/**
 * AUDIT-CLASS X5: การจองคือคำสั่ง SQL คำสั่งเดียว — ได้แถวคืน = ได้ lease · ไม่ได้ = คนอื่นถืออยู่และยังไม่หมด
 * นาฬิกาคือ `now` ที่ส่งเข้ามาเท่านั้น (ไม่ใช้ NOW() ของฐาน) · ห้ามจองด้วยการเขียน "รอบล่าสุด"/"เสร็จ" ล่วงหน้า
 * (บทเรียน M7/H6 — โพรเซสตายหลังจอง = งานไม่ถูกทำอีกเลย) · "รอบล่าสุด" เขียนเมื่องานจบจริงเท่านั้น
 */
async function claimLease(name: string, now: Date): Promise<Date | null> {
  const until = new Date(now.getTime() + MINUTE_JOB_LEASE_MS);
  const rows = await prisma.$queryRaw<{ lastAlertAt: Date }[]>`
    INSERT INTO "OpsAlertState" ("id", "source", "lastAlertAt")
    VALUES (gen_random_uuid()::text, ${leaseKey(name)}, (${utc(until)}::timestamptz AT TIME ZONE 'UTC'))
    ON CONFLICT ("source") DO UPDATE SET "lastAlertAt" = EXCLUDED."lastAlertAt"
    WHERE "OpsAlertState"."lastAlertAt" <= (${utc(now)}::timestamptz AT TIME ZONE 'UTC')
    RETURNING "lastAlertAt"`;
  return rows.length > 0 ? until : null;
}

/** ปล่อย lease เฉพาะเมื่อยังเป็นของเรา (compare-and-set ด้วยเวลาหมดอายุที่เราเขียน) */
async function releaseLease(name: string, until: Date): Promise<void> {
  // raw SQL + cast แบบเดียวกับตอนจอง — ความเท่ากันเป๊ะต้องไม่ขึ้นกับ TimeZone ของ session
  await prisma.$executeRaw`
    UPDATE "OpsAlertState" SET "lastAlertAt" = TIMESTAMP 'epoch'
    WHERE "source" = ${leaseKey(name)} AND "lastAlertAt" = (${utc(until)}::timestamptz AT TIME ZONE 'UTC')`;
}

/** บันทึก "จบรอบ" (+ "สำเร็จ") ในคำสั่งเดียว — แถวละงาน ไม่มี map รวมให้ทับกัน */
async function recordFinish(name: string, now: Date, ok: boolean): Promise<void> {
  if (ok) {
    await prisma.$executeRaw`
      INSERT INTO "OpsAlertState" ("id", "source", "lastAlertAt")
      VALUES (gen_random_uuid()::text, ${runKey(name)}, (${utc(now)}::timestamptz AT TIME ZONE 'UTC')),
             (gen_random_uuid()::text, ${okKey(name)}, (${utc(now)}::timestamptz AT TIME ZONE 'UTC'))
      ON CONFLICT ("source") DO UPDATE SET "lastAlertAt" = EXCLUDED."lastAlertAt"`;
  } else {
    await prisma.$executeRaw`
      INSERT INTO "OpsAlertState" ("id", "source", "lastAlertAt")
      VALUES (gen_random_uuid()::text, ${runKey(name)}, (${utc(now)}::timestamptz AT TIME ZONE 'UTC'))
      ON CONFLICT ("source") DO UPDATE SET "lastAlertAt" = EXCLUDED."lastAlertAt"`;
  }
}

type Settled = { kind: "ok" } | { kind: "error"; error: unknown } | { kind: "timeout" };

// งานที่ถูกตัดงบแต่ยังวิ่งอยู่เบื้องหลัง (ต่อโพรเซส) — ตัวรันบน VPS รอให้จบก่อน exit (ดู settleOutstandingMinuteJobs)
const OUTSTANDING_KEY = Symbol.for("shark.platform.minute-jobs.outstanding");
const outHolder = globalThis as unknown as Record<symbol, Set<Promise<void>> | undefined>;
const outstanding: Set<Promise<void>> = outHolder[OUTSTANDING_KEY] ?? new Set<Promise<void>>();
outHolder[OUTSTANDING_KEY] = outstanding;

/**
 * AUDIT-CLASS X5: งบเวลาเป็นของตัวกระจาย ไม่ไว้ใจงาน — แข่งงานกับตัวจับเวลาที่เหลือของรอบ
 * งานที่ไม่คืนตัวภายในงบ ⇒ abort signal + ตัวกระจายเดินต่อ (งานค้างอยู่เบื้องหลังได้ แต่ไม่ขวางรอบ)
 * throw แบบ synchronous / reject(undefined) / throw "string" ถูกจับหมดใน Promise.resolve().then(...)
 */
function runWithin(job: MinuteJob, now: Date, budgetMs: number): { settled: Promise<Settled>; late: Promise<void> } {
  const ac = new AbortController();
  const ctrl: MinuteJobControl = { signal: ac.signal, deadline: Date.now() + budgetMs };
  const work = Promise.resolve().then(() => job.run(now, budgetMs, ctrl));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Settled>((res) => {
    timer = setTimeout(() => {
      ac.abort(new Error(`minute job ${job.name}: budget of ${budgetMs} ms exhausted`));
      res({ kind: "timeout" });
    }, Math.max(0, budgetMs));
  });
  const outcome = work.then(
    (): Settled => ({ kind: "ok" }),
    (error: unknown): Settled => ({ kind: "error", error }),
  );
  const settled = Promise.race([outcome, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
  return { settled, late: outcome.then(() => undefined) };
}

/**
 * หนึ่งรอบของตัวกระจาย — งานรันทีละตัวตามลำดับที่ลงทะเบียน ภายในงบรวม ≤ 20 วินาทีต่อการเรียก
 * งานที่เริ่มทีหลังได้ "งบที่เหลือ" ไม่ใช่ 20 วินาทีใหม่ · งานที่งบไม่พอ = ไม่รัน ไม่บันทึก ⇒ ยังถึงรอบในรอบหน้า
 * `entry`: "vps" = ตัวรัน crm-cron.mts (งาน vpsOnly รันเฉพาะทางนี้) · "route" = /api/cron/outbox
 * ไม่ throw เด็ดขาด (ความล้มของงานถูกบันทึก ไม่ถูกโยนออกไป · ความล้มฝั่งฐานบอกผ่าน stateReadFailed/dispatcherErrors)
 */
export async function runMinuteJobs(
  now: Date,
  opts?: { cadence?: MinuteJobCadence; entry?: MinuteJobEntry },
): Promise<MinuteJobsSummary> {
  const cadence = opts?.cadence ?? "minute";
  const summary: MinuteJobsSummary = { cadence, results: [], stateReadFailed: false, dispatcherErrors: 0, refusedFutureNow: false };
  // AUDIT-CLASS X5: `now` ในอนาคตจะเขียน run = อนาคต แล้วงานไม่ถึงรอบจนถึงเวลานั้น (กู้ได้แค่ลบแถวมือ) — ปฏิเสธทั้งรอบ
  //   (`now` ในอดีตไม่มีพิษ: แย่ง lease ที่ยังไม่หมดไม่ได้ และถอย run ไม่ได้เพราะไม่ถึงรอบ)
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || now.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    summary.refusedFutureNow = true;
    await logOps("WARN", OPS_SOURCE, "tick refused — `now` is invalid or in the future", {
      detail: `now=${now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString() : String(now)} wall=${new Date().toISOString()}`,
    });
    return summary;
  }
  // งบวัดด้วยนาฬิกาจริง (เวลาที่ผ่านไปจริง) · ถึงรอบ/lease วัดด้วย `now` เท่านั้น
  const deadline = Date.now() + MINUTE_JOB_BUDGET_MS;
  const jobs = [...registry.values()].filter(
    (j) => (j.cadence ?? "minute") === cadence && (!j.vpsOnly || opts?.entry === "vps"),
  );
  if (jobs.length === 0) return summary;

  let lastRuns: Map<string, Date>;
  try {
    lastRuns = await readTimes(jobs.map((j) => runKey(j.name)));
  } catch (e) {
    summary.stateReadFailed = true;
    await logOps("WARN", OPS_SOURCE, "dispatcher could not read job state — tick skipped", { detail: errorText(e) });
    return summary;
  }

  for (const job of jobs) {
    // ตรวจเบื้องต้นจากที่อ่านไว้ (ประหยัดการจองงานที่ยังไม่ถึงรอบ) — ตัวตัดสินจริงคือการตรวจซ้ำหลังจอง
    if (!isDue(job, lastRuns.get(runKey(job.name)), now)) {
      summary.results.push({ name: job.name, outcome: "not-due" });
      continue;
    }
    if (deadline - Date.now() < MIN_START_BUDGET_MS) {
      summary.results.push({ name: job.name, outcome: "no-budget" });
      continue;
    }
    try {
      summary.results.push({ name: job.name, outcome: await dispatchOne(job, now, deadline) });
    } catch (e) {
      // พลาดที่ฝั่งบันทึก/ฐาน (ไม่ใช่ตัวงาน) — ห้ามลามไปงานอื่น
      summary.dispatcherErrors += 1;
      summary.results.push({ name: job.name, outcome: "failed" });
      await logOps("WARN", OPS_SOURCE, opsMessage(job.name, "dispatcher error"), { detail: errorText(e) });
    }
  }
  return summary;
}

async function dispatchOne(job: MinuteJob, now: Date, deadline: number): Promise<MinuteJobOutcome> {
  // AUDIT-CLASS X5: 1) จอง (คำสั่งเดียว) → 2) ตรวจซ้ำว่ายังถึงรอบ (อีกตัวอาจทำจบและปล่อย lease ไปแล้ว) → 3) รัน
  //   → 4) บันทึกจบรอบ → 5) ปล่อย lease · ตายระหว่าง 1–4 ⇒ ไม่มีแถว "จบรอบ" ⇒ ยังถึงรอบ ⇒ หยิบใหม่เมื่อ lease หมด
  const until = await claimLease(job.name, now);
  if (!until) return "busy";
  const fresh = await readTimes([runKey(job.name)]);
  if (!isDue(job, fresh.get(runKey(job.name)), now)) {
    await releaseLease(job.name, until);
    return "not-due";
  }
  // AUDIT-CLASS X5: งบหมดระหว่างจอง+อ่านซ้ำ — ปล่อย lease คืน (ไม่เริ่มงานที่รู้อยู่แล้วว่าจะถูกตัด แล้วถือ lease 15 นาที)
  if (deadline - Date.now() < MIN_START_BUDGET_MS) {
    await releaseLease(job.name, until);
    return "no-budget";
  }

  const budgetMs = Math.max(0, deadline - Date.now());
  const startedAt = Date.now();
  const { settled, late } = runWithin(job, now, budgetMs);
  const r = await settled;

  if (r.kind === "ok") {
    await recordFinish(job.name, now, true);
    await releaseLease(job.name, until);
    return "ok";
  }
  if (r.kind === "error") {
    await logOps("WARN", OPS_SOURCE, opsMessage(job.name, "failed"), { detail: errorText(r.error) });
    await recordFinish(job.name, now, false);
    await releaseLease(job.name, until);
    return "failed";
  }
  // AUDIT-CLASS X5: ถูกตัดงบ — ไม่นับเป็นสำเร็จ (ไม่มีแถว ok) · บันทึกการตัด · lease ยังถือไว้เพราะงานอาจยังวิ่ง
  //   อยู่เบื้องหลัง (กันสำเนาที่สองระหว่างนั้น) — ปล่อยเมื่องานคืนตัว หรือหมดเองตามเวลา lease
  //   ตัวรันบน VPS รอ settleOutstandingMinuteJobs() ก่อน exit เพื่อไม่ฆ่างานกลางคำสั่งแล้วทิ้ง lease ค้าง 15 นาที
  await logOps("WARN", OPS_SOURCE, opsMessage(job.name, "cut off"), {
    detail: `cut off by the dispatcher after ${Date.now() - startedAt} ms (budget ${budgetMs} ms of ${MINUTE_JOB_BUDGET_MS} ms per tick) — not recorded as a success; lease kept until the job settles or ${until.toISOString()}`,
  });
  await recordFinish(job.name, now, false);
  const tail: Promise<void> = late
    .then(() => releaseLease(job.name, until))
    .catch(() => {})
    .finally(() => {
      outstanding.delete(tail);
    });
  outstanding.add(tail);
  return "cut-off";
}

/**
 * รอให้งานที่ถูกตัดงบ (ยังวิ่งเบื้องหลัง) จบและปล่อย lease — เรียกโดยตัวรันก่อน process.exit
 * คืน true = จบครบ · false = ยังค้างเมื่อครบ maxWaitMs (lease จะหมดเองตามเวลา)
 */
export async function settleOutstandingMinuteJobs(maxWaitMs: number): Promise<boolean> {
  if (outstanding.size === 0) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const done = await Promise.race([
    Promise.allSettled([...outstanding]).then(() => true),
    new Promise<boolean>((res) => {
      timer = setTimeout(() => res(false), Math.max(0, maxWaitMs));
    }),
  ]);
  if (timer) clearTimeout(timer);
  return done && outstanding.size === 0;
}

/**
 * สถานะต่องาน (หน้า integrations C3.6)
 * 🔴 ผู้เรียกต้องส่งชื่องานมาเองเสมอ — ไม่ส่ง = คืนเฉพาะงานที่ "โพรเซสนี้" ลงทะเบียนไว้ ซึ่งใน bundle ของหน้าเว็บ
 *    แทบไม่มีอะไร (งานลงทะเบียนตอน import โมดูลของมัน) · ชื่อที่ไม่ได้ลงทะเบียนในโพรเซสนี้ได้ everyMinutes = null
 * lastRunAt = รอบที่ "จบ" ล่าสุด (สำเร็จ ล้ม หรือถูกตัดงบ — ไม่ใช่ตอนจอง) · lastError มีค่าเมื่อรอบล่าสุดไม่สำเร็จ
 */
export async function getMinuteJobStatus(names?: string[]): Promise<MinuteJobStatus[]> {
  const list = names && names.length > 0 ? [...new Set(names)] : [...registry.keys()];
  if (list.length === 0) return [];
  const times = await readTimes(list.flatMap((n) => [runKey(n), okKey(n)]));
  const out: MinuteJobStatus[] = [];
  for (const name of list) {
    const lastRunAt = times.get(runKey(name)) ?? null;
    const lastOkAt = times.get(okKey(name)) ?? null;
    let lastError: string | null = null;
    if (lastRunAt && (!lastOkAt || lastOkAt.getTime() !== lastRunAt.getTime())) {
      const ev = await prisma.opsEvent.findFirst({
        where: { source: OPS_SOURCE, message: { startsWith: `${name} · ` } },
        orderBy: { createdAt: "desc" },
        select: { detail: true, message: true },
      });
      const text = ev ? (ev.detail ?? ev.message) : "the last run did not succeed";
      lastError = text.length > ERROR_MAX ? `${text.slice(0, ERROR_MAX - 1)}…` : text;
    }
    out.push({ name, everyMinutes: registry.get(name)?.everyMinutes ?? null, lastRunAt, lastOkAt, lastError });
  }
  return out;
}
