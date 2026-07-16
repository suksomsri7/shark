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
    const detail = opts?.detail ? opts.detail.slice(0, DETAIL_MAX) : null;
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
