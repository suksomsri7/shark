// ops.ts — logger กลางของแพลตฟอร์ม (Observability · WO-0041)
// 🔴 OpsEvent/OpsAlertState เป็น platform axis → เขียนผ่าน prisma ตรง (tenantDb ห้ามแตะ)
//
// logOps: เขียน OpsEvent เสมอ · **ห้าม throw ทุกกรณี** (logger พังห้ามพางานหลักพัง)
//   level ERROR → ส่ง alert (throttle 60 นาที/source ผ่าน OpsAlertState) — เมลถล่มไม่ได้
// healthSnapshot: ping DB + outbox ค้าง + error 24 ชม. (หน้า /api/health + backoffice ใช้)

import { prisma } from "@/lib/core/db";

export type OpsLevel = "ERROR" | "WARN" | "INFO";

const DETAIL_MAX = 4000; // ตัด detail กันแถวบวม
const THROTTLE_MS = 60 * 60_000; // 60 นาที/source

type LogOpts = { detail?: string; tenantId?: string };

/**
 * SEC S3a.1-S2 ▸ R-Z26 (L6 M1–M4): รายละเอียดของ error ที่เก็บได้ = ชื่อ · code · บรรทัดแรกของข้อความ — ตัดตั้งแต่ `invocation:`
 *   (Prisma พิมพ์อาร์กิวเมนต์ของคำสั่งทั้งก้อน = ชื่อ/เบอร์/เนื้อหาของลูกค้า) · ใช้กับ e ใดก็ได้ (ไม่ใช่ Error = String ตัดบรรทัดแรก) ◂
 */
export function errDetail(e: unknown): string {
  if (e instanceof Error) {
    const code = (e as { code?: unknown }).code;
    const firstLine = cutInvocation(e.message).split("\n")[0]!.trim().slice(0, 300);
    return `${e.name}${typeof code === "string" || typeof code === "number" ? ` [${String(code)}]` : ""}: ${firstLine}`;
  }
  return cutInvocation(String(e)).split("\n")[0]!.trim().slice(0, 300);
}
/** ตัดส่วน "invocation:" ของ Prisma ออก (เหลือหัวข้อความ) — ใช้ใน logOps กับ detail ทุกตัว */
function cutInvocation(s: string): string {
  const i = s.indexOf("invocation:");
  return i < 0 ? s : `${s.slice(0, i)}invocation: (ตัดรายละเอียดคำสั่งออก)`;
}

/** อายุเก็บของ OpsEvent (R-Z26) — ทั่วไป 90 วัน · ข้อความ SMS จำลอง (`sms-mock` มีรหัส) 1 วัน · PhoneOtp 30 วัน */
export const OPS_KEEP_DAYS = 90;
export const SMS_MOCK_KEEP_MS = 86_400_000;
export const PHONE_OTP_KEEP_DAYS = 30;

/** ล้างข้อมูลเก่าของ ops (งานประจำ · คืนจำนวนแถวที่ลบ) — ล้มห้ามโยน (คืน -1 + log) */
export async function sweepOpsRetention(now: Date = new Date()): Promise<{ opsEvents: number; smsMock: number; phoneOtps: number }> {
  const out = { opsEvents: -1, smsMock: -1, phoneOtps: -1 };
  const day = 86_400_000;
  try {
    out.smsMock = (await prisma.opsEvent.deleteMany({ where: { source: "sms-mock", createdAt: { lt: new Date(now.getTime() - SMS_MOCK_KEEP_MS) } } })).count;
    out.opsEvents = (await prisma.opsEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - OPS_KEEP_DAYS * day) } } })).count;
    out.phoneOtps = (await prisma.phoneOtp.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - PHONE_OTP_KEEP_DAYS * day) } } })).count;
  } catch (e) {
    await logOps("WARN", "ops", "sweepOpsRetention ล้ม", { detail: errDetail(e) });
  }
  return out;
}
type LogDeps = { sendAlert?: (subject: string, body: string) => Promise<void>; now?: Date };

/**
 * บันทึกเหตุการณ์ระบบ 1 รายการ — ห้าม throw เด็ดขาด (ครอบ try/catch ทั้งฟังก์ชัน)
 * ERROR → alert เจ้าของแบบ throttle 60 นาที/source (กันเมลถล่มเวลาเหตุรัว)
 */
export async function logOps(
  level: OpsLevel,
  source: string,
  message: string,
  opts?: LogOpts,
  deps?: LogDeps,
): Promise<void> {
  try {
    const detail = opts?.detail ? cutInvocation(opts.detail).slice(0, DETAIL_MAX) : null; // R-Z26: ไม่เก็บอาร์กิวเมนต์ของคำสั่ง Prisma ◂
    await prisma.opsEvent.create({
      data: {
        level,
        source,
        message,
        detail,
        tenantId: opts?.tenantId ?? null,
      },
    });

    if (level !== "ERROR") return;

    // sendAlert: ฉีดได้ (ข้อสอบ) · ของจริง = sendEmail ไป OPS_ALERT_EMAIL
    // ไม่มี env และไม่ได้ฉีด = ข้าม alert เงียบ ๆ (ไม่ throttle ไม่ส่ง)
    // lazy import email — email.ts ดึง env.ts (parse เข้ม) มา ถ้า import บนหัวไฟล์
    // จะพัง env ใน context ที่ตั้งไม่ครบ (เช่น สคริปต์ QC). โหลดเฉพาะตอนส่งจริงเท่านั้น
    const alertEmail = process.env.OPS_ALERT_EMAIL;
    const send =
      deps?.sendAlert ??
      (alertEmail
        ? async (subject: string, body: string) => {
            const { sendEmail } = await import("@/lib/core/email");
            await sendEmail(alertEmail, subject, body);
          }
        : null);
    if (!send) return;

    const now = deps?.now ?? new Date();

    // throttle ต่อ source ผ่าน OpsAlertState (find → update/create · ไม่ใช้ upsert)
    const state = await prisma.opsAlertState.findUnique({ where: { source } });
    if (state) {
      if (now.getTime() - state.lastAlertAt.getTime() < THROTTLE_MS) return; // ยังในหน้าต่าง → เงียบ
      await prisma.opsAlertState.update({ where: { source }, data: { lastAlertAt: now } });
    } else {
      await prisma.opsAlertState.create({ data: { source, lastAlertAt: now } });
    }

    const subject = `[SHARK ops] ${source}: ${message}`.slice(0, 200);
    const body = `แหล่ง: ${source}\nข้อความ: ${message}\nเวลา: ${now.toISOString()}${
      detail ? `\n\nรายละเอียด:\n${detail}` : ""
    }`;
    await send(subject, body);
  } catch {
    // logger พังห้ามพางานหลักพัง — กลืน error ทุกกรณี (รวม sendAlert/DB ล่ม)
  }
}

export type HealthSnapshot = { db: boolean; outboxPending: number; opsErrors24h: number };

/**
 * ภาพรวมสุขภาพระบบ — ping DB + outbox ที่ยังค้าง + error 24 ชม.
 * DB พัง → db:false + ตัวเลขเป็น 0 (ไม่ throw)
 */
export async function healthSnapshot(): Promise<HealthSnapshot> {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    return { db: false, outboxPending: 0, opsErrors24h: 0 };
  }

  const since = new Date(Date.now() - 24 * 60 * 60_000);
  let outboxPending = 0;
  let opsErrors24h = 0;
  try {
    [outboxPending, opsErrors24h] = await Promise.all([
      prisma.outboxEvent.count({ where: { status: "PENDING" } }),
      prisma.opsEvent.count({ where: { level: "ERROR", createdAt: { gte: since } } }),
    ]);
  } catch {
    // นับไม่ได้ → คง 0 (db ยัง true เพราะ ping ผ่าน)
  }

  return { db, outboxPending, opsErrors24h };
}
