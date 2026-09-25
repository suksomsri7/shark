// crm-cron.mts — ตัวรันงานตามเวลาของ CRM บน VPS (CRM v2 WO C0.5 · RESOLUTIONS R-C.6 · มติ C16 ฉบับแก้)
//
// ใช้:
//   pnpm exec tsx scripts/crm-cron.mts minute   # งานรายนาทีทั้งหมด (runMinuteJobs — รวม crm.heartbeat)
//   pnpm exec tsx scripts/crm-cron.mts hourly   # เฉพาะงาน CRM ที่ลงทะเบียน cadence "hourly" (วันนี้ยังไม่มี = no-op)
//   pnpm exec tsx scripts/crm-cron.mts daily    # เฉพาะงาน CRM ที่ลงทะเบียน cadence "daily"  (วันนี้ยังไม่มี = no-op)
//
// 🔴 นี่คือ "ทางเดินจริงทางเดียว" ของงานตามเวลาใน CRM (ส่งขั้น sequence · อีเมลตั้งเวลา · เตือนนัด · ดีลนิ่ง):
//    `/api/cron/outbox` ไม่มีตัวตั้งเวลาใดชี้มา (ผลสืบใน crm-brief-C0.5 addendum) ⇒ hook ใน route เป็นแค่ของแถม
// 🔴 hourly/daily ห้ามเรียก `runDailyCron` — `/api/cron/tick` รันอยู่แล้ววันละครั้ง เรียกซ้ำ = กวาดทุกอย่างสองรอบ
// 🔴 เรียก service ตรง ไม่ผ่าน HTTP (แบบเดียวกับ acc-v2-cron-recurring.mts) — ไม่ต้องมี SHARK_CRON_SECRET
// 🔴 ปลอดภัยต่อการรันซ้อน: แต่ละงานจองด้วยแถว lease ในฐาน (คำสั่ง SQL เดียว) — flock ข้างล่างเป็นแค่ชั้นที่สอง
//
// บรรทัด crontab ที่ใบ C6.1 จะติดตั้ง (ต้องได้ OK จากเจ้าของก่อน · ใบนี้ห้ามติดตั้งเอง) — ลอกแบบบรรทัด
// voice-transcode-worker ที่ทำงานอยู่จริงทุกนาที (flock -n · cd เข้า worktree · log แยกไฟล์) · เครื่อง VPS เป็น UTC:
//   * * * * * cd /root/projects/shark-in-th && /usr/bin/flock -n /tmp/shark-crm-minute.cron.lock /usr/bin/pnpm exec tsx scripts/crm-cron.mts minute >> /var/log/shark-crm-cron.log 2>&1
//   7 * * * * cd /root/projects/shark-in-th && /usr/bin/flock -n /tmp/shark-crm-hourly.cron.lock /usr/bin/pnpm exec tsx scripts/crm-cron.mts hourly >> /var/log/shark-crm-cron.log 2>&1
//   40 20 * * * cd /root/projects/shark-in-th && /usr/bin/flock -n /tmp/shark-crm-daily.cron.lock /usr/bin/pnpm exec tsx scripts/crm-cron.mts daily >> /var/log/shark-crm-cron.log 2>&1   # 03:40 ไทย (หลัง /api/cron/tick 03:00)
//
// env: ใช้ `.env` ของโปรเจกต์ตามปกติ (งาน production จริง) — ข้อสอบ/QC ตั้ง QC_ENV_FILE=.env.qc แล้วไฟล์ `.env` จะไม่ถูกอ่านเลย
// 🔴 ด่านกันหลุด prod: process.loadEnvFile ไม่ทับตัวแปรที่มีอยู่แล้ว ⇒ shell ที่ export DATABASE_URL ของ prod ค้างไว้
//    + QC_ENV_FILE=.env.qc = รันใส่ production เงียบ ๆ · เมื่อตั้ง QC_ENV_FILE แล้วมี DATABASE_URL/DIRECT_URL อยู่ก่อน
//    ค่านั้นต้อง "ตรงกับในไฟล์ QC เป๊ะ" (ข้อสอบที่โหลด .env.qc แล้วเรียกตัวรันต่อผ่านได้) ไม่ตรง/ไฟล์ไม่มี = หยุดทันที
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const qcFile = process.env.QC_ENV_FILE;
if (qcFile) {
  let fileVars: Record<string, string | undefined>;
  try {
    fileVars = parseEnv(readFileSync(qcFile, "utf8")) as Record<string, string | undefined>;
  } catch (e) {
    console.error(`🔴 [crm-cron] หยุด! อ่านไฟล์ QC_ENV_FILE="${qcFile}" ไม่ได้ (${e instanceof Error ? e.message : String(e)}) — ไม่รันต่อเพื่อไม่ให้ไปใช้ค่าอื่นแทน`);
    process.exit(4);
  }
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const pre = process.env[key];
    if (pre !== undefined && pre !== fileVars[key]) {
      console.error(
        `🔴 [crm-cron] หยุด! ตั้ง QC_ENV_FILE="${qcFile}" แต่ shell มี ${key} อยู่ก่อนแล้วและไม่ตรงกับในไฟล์นั้น — ` +
          `process.loadEnvFile ไม่ทับตัวแปรที่มีอยู่ ค่าที่ค้างอยู่ (อาจเป็น production) จะถูกใช้แทน · ให้ unset ${key} ก่อนรัน`,
      );
      process.exit(4);
    }
  }
  if (!fileVars.DATABASE_URL) {
    console.error(`🔴 [crm-cron] หยุด! ไฟล์ QC_ENV_FILE="${qcFile}" ไม่มี DATABASE_URL`);
    process.exit(4);
  }
}
process.loadEnvFile?.(qcFile ?? ".env");

const MODES = ["minute", "hourly", "daily"] as const;
type Mode = (typeof MODES)[number];
const mode = (process.argv[2] ?? "").replace(/^-+/, "");
if (!(MODES as readonly string[]).includes(mode)) {
  console.error(`❌ [crm-cron] โหมดไม่ถูกต้อง: "${mode}" — ใช้ได้: minute | hourly | daily`);
  process.exit(2);
}

// กันค้าง: flock -n ทำให้โพรเซสที่ค้างบล็อกทุกนาทีถัดไป ⇒ ตัดตัวเองทิ้งเมื่อเกิน 2 นาที (งบของรอบคือ 20 วินาที)
setTimeout(() => {
  console.error(`❌ [crm-cron] ${mode}: เกิน 120 วินาที — ตัดโพรเซสทิ้ง (lease ในฐานจะหมดเองแล้วรอบหน้าหยิบใหม่)`);
  process.exit(3);
}, 120_000).unref();

const dbHost = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").split("/")[0] || "(ไม่พบ DATABASE_URL)";
const startedAt = new Date();
console.log(`[crm-cron] เริ่ม ${startedAt.toISOString()} · โหมด ${mode} · DB ${dbHost}`);

// ทะเบียนเดียวกับที่ route ใช้ — import นี้ลงทะเบียน crm.heartbeat เอง (C2.x จะเพิ่ม import ของงานตัวเองที่นี่)
const { runMinuteJobs, settleOutstandingMinuteJobs } = await import("@/lib/platform/minute-jobs");
// CRM C2.2 ▸ งานรายนาที "crm.sequences" (ทำขั้นของลำดับการติดตามที่ถึงเวลา) — ลงทะเบียนตอน import ◂
await import("@/lib/modules/crm/sequences-job");
// CRM C2.4 ▸ งานรายนาที "crm.activity.remind" (เตือนงาน/นัดที่ถึงเวลา ทุก 5 นาที) — `crm/reminders` import ทะเบียนให้เอง ◂
await import("@/lib/modules/crm/reminders");
// CRM C2.5 ▸ งานรายนาที "crm.email.scheduled" (ส่งอีเมลที่ตั้งเวลาไว้และถึงเวลาแล้ว) — ลงทะเบียนตอน import ◂
await import("@/lib/modules/crm/emails-job");
// CRM C2.8 ▸ งานรายวัน "crm.scoring.decay" (แต้มหมดอายุ + หักแต้มคนที่เงียบหาย) — ลงทะเบียนตอน import ◂
await import("@/lib/modules/crm/scoring-job");

let code = 0;
try {
  const cadence: Mode = mode as Mode;
  // entry "vps" — งาน vpsOnly (crm.heartbeat) รันเฉพาะทางนี้ จึงพิสูจน์ได้ว่า crontab ของ VPS ยังเดินอยู่
  const r = await runMinuteJobs(startedAt, { cadence, entry: "vps" });
  const by = (o: string) => r.results.filter((x) => x.outcome === o).length;
  const bad = r.results.filter((x) => x.outcome === "failed" || x.outcome === "cut-off").map((x) => `${x.name}=${x.outcome}`);
  console.log(
    `[crm-cron] ${mode}: งาน ${r.results.length} · สำเร็จ ${by("ok")} · ล้ม ${by("failed")} · ถูกตัดงบ ${by("cut-off")} · ` +
      `ยังไม่ถึงรอบ ${by("not-due")} · มีตัวอื่นถืออยู่ ${by("busy")} · งบหมด ${by("no-budget")}${bad.length ? ` · ${bad.join(", ")}` : ""}`,
  );
  if (r.stateReadFailed || r.dispatcherErrors > 0 || r.refusedFutureNow) {
    code = 1;
    console.error(
      `[crm-cron] ❌ ${mode}: ${r.stateReadFailed ? "อ่านสถานะงานจากฐานไม่ได้ (ฐานล่ม/ต่อไม่ได้?) — ทั้งรอบไม่ได้ทำอะไร" : ""}` +
        `${r.dispatcherErrors > 0 ? ` ตัวกระจายพลาดฝั่งฐาน ${r.dispatcherErrors} งาน` : ""}${r.refusedFutureNow ? " ปฏิเสธรอบ: now อยู่ในอนาคต" : ""}`,
    );
  }
  // งานที่ถูกตัดงบยังวิ่งเบื้องหลัง — รอให้จบ (และปล่อย lease) ก่อน exit แทนการฆ่ากลางคำสั่งแล้วทิ้ง lease ค้าง 15 นาที
  //   เพดาน 75 วิ ต่ำกว่าตัวตัดตัวเอง 120 วิ อย่างปลอดภัย (งบ 20 วิ + รอ 75 วิ + เริ่มโพรเซส)
  if (by("cut-off") > 0) {
    const settled = await settleOutstandingMinuteJobs(75_000);
    console.log(`[crm-cron] ${mode}: รองานที่ถูกตัดงบ — ${settled ? "จบครบ ปล่อย lease แล้ว" : "ยังค้างเมื่อครบ 75 วิ (lease จะหมดเองใน ≤ 15 นาที)"}`);
  }
} catch (e) {
  code = 1;
  console.error(`[crm-cron] ❌ ${mode} ล้มทั้งรอบ: ${e instanceof Error ? (e.stack ?? e.message) : e}`);
}

console.log(`[crm-cron] จบ ${new Date().toISOString()} (ใช้เวลา ${Date.now() - startedAt.getTime()} ms)`);
process.exit(code);
