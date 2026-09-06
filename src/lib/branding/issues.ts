// "แจ้งปัญหาการใช้งาน" (T8 · DESIGN-BRANDING §7b) — ผู้ใช้กดปุ่มมุมขวาบนแล้วพิมพ์ปัญหา
//
// v1 = ตาราง `IssueReport` ของร้าน + แจ้ง ops ผ่าน `logOps` (ช่องทางที่มีอยู่แล้ว — เขียน OpsEvent
// และมีตัวส่งอีเมล/แจ้งเจ้าของต่อจากนั้น) · การ์ดในบอร์ด "ปัญหาจากผู้ใช้" ของ SHARK = งานถัดไป
// (ต้องเขียนข้ามร้าน ซึ่ง kernel guard ห้าม — ต้องมีทางเขียนฝั่ง platform ก่อน)
//
// 🔴 ทุก query ผ่าน tenantDb → ร้านอื่นมองไม่เห็นและแก้สถานะข้ามร้านไม่ได้ (where ลงไปใน SQL จริง)
// 🔴 ระดับ log = WARN ไม่ใช่ ERROR โดยเจตนา: ERROR จะยิงอีเมลเตือนทุกครั้งที่มีคนบ่น
//    (throttle 60 นาที/source) — เรื่องผู้ใช้แจ้งเข้ามาไม่ใช่เหตุระบบล่ม

import type { IssueKind, IssueReport, IssueStatus } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";

type Ctx = { tenantId: string };

const KINDS = ["BUG", "DISPLAY", "IDEA"] as const;
const STATUSES = ["OPEN", "ACK", "DONE"] as const;

/** ป้ายไทยของประเภทปัญหา (ใช้ทั้งฟอร์ม B3 และข้อความแจ้ง ops) */
export const ISSUE_KIND_LABEL: Record<IssueKind, string> = {
  BUG: "ใช้งานไม่ได้",
  DISPLAY: "แสดงผลผิด",
  IDEA: "ข้อเสนอแนะ",
};

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  OPEN: "รอตรวจ",
  ACK: "รับเรื่องแล้ว",
  DONE: "แก้แล้ว",
};

const MESSAGE_MAX = 2000;

const isKind = (v: unknown): v is IssueKind =>
  typeof v === "string" && (KINDS as readonly string[]).includes(v);
const isStatus = (v: unknown): v is IssueStatus =>
  typeof v === "string" && (STATUSES as readonly string[]).includes(v);

export type CreateIssueInput = {
  userId?: string | null;
  kind: IssueKind | string;
  message: string;
  pageUrl: string;
  userAgent: string;
  appVersion?: string | null;
  screenshotUrl?: string | null;
};

/**
 * ด่านสิทธิ์ของ "แจ้งปัญหาการใช้งาน" (B3) — ผู้แจ้งต้องเป็น **สมาชิกที่รับคำเชิญแล้ว** ของร้านนี้จริง
 *
 * 🔴 ทำไมไม่พอที่จะเชื่อ requireTenant() ฝั่ง action: requireTenant คืน membership ที่ผูกกับคุกกี้
 *    `shark_tenant` ซึ่งเป็นค่าที่ผู้ใช้แก้เองได้ · ตัว getAuth กรอง acceptedAt ให้แล้วก็จริง แต่ด่าน
 *    ของ "เรื่องที่จะถูกเขียนลงตารางของร้าน" ต้องยืนยันกับ DB ตรง ๆ ที่ชั้นบริการ ไม่ใช่ฝากชั้นบน
 *    (แพตเทิร์นเดียวกับ requireMembership ของ core — ตรวจสมาชิกภาพจริงก่อนลงมือเสมอ)
 * 🔴 ใช้ prisma ตรง (ไม่ผ่าน tenantDb) โดยตั้งใจ: Membership เป็นตารางระดับบัญชี ไม่ใช่ของร้าน
 *    และ where ผูก tenantId + userId + acceptedAt ลงไปใน SQL ทุกตัวอยู่แล้ว
 */
export async function assertCanReport(ctx: Ctx, userId: string | null | undefined): Promise<void> {
  const uid = (userId ?? "").trim();
  if (!uid) throw new Error("ต้องเข้าสู่ระบบก่อนจึงจะแจ้งปัญหาได้");
  const member = await prisma.membership.findFirst({
    where: { tenantId: ctx.tenantId, userId: uid, acceptedAt: { not: null } },
    select: { id: true },
  });
  if (!member) {
    throw new Error("แจ้งปัญหาไม่ได้ — บัญชีนี้ไม่ได้เป็นสมาชิกของกิจการนี้");
  }
}

/**
 * รับเรื่องจากผู้ใช้ 1 รายการ — ข้อความว่าง/ยาวเกิน/ประเภทเพี้ยน → throw ข้อความไทย
 * ข้อมูลบริบท (หน้า/เบราว์เซอร์/เวอร์ชัน) ฝั่งเรียกเป็นคนแนบมาให้ ไม่ต้องให้ผู้ใช้พิมพ์
 */
export async function createIssueReport(ctx: Ctx, input: CreateIssueInput): Promise<IssueReport> {
  if (!isKind(input.kind)) {
    throw new Error("ประเภทปัญหาไม่ถูกต้อง — เลือกได้เฉพาะ ใช้งานไม่ได้ / แสดงผลผิด / ข้อเสนอแนะ");
  }
  const message = (input.message ?? "").trim();
  if (!message) throw new Error("กรุณาพิมพ์รายละเอียดปัญหาที่พบก่อนส่ง");
  if (message.length > MESSAGE_MAX) {
    throw new Error(`รายละเอียดยาวเกินไป — พิมพ์ได้ไม่เกิน ${MESSAGE_MAX} ตัวอักษร`);
  }
  const pageUrl = (input.pageUrl ?? "").trim();
  if (!pageUrl) throw new Error("ไม่พบหน้าที่เกิดปัญหา — กรุณาลองใหม่จากหน้าที่มีปัญหา");

  const row = await tenantDb(ctx).issueReport.create({
    data: {
      tenantId: ctx.tenantId, // guard ยัดให้อยู่แล้ว — เขียนซ้ำเพื่อให้ชนิดข้อมูลครบตามสัญญาของ Prisma
      userId: input.userId?.trim() || null,
      kind: input.kind,
      message,
      pageUrl,
      userAgent: (input.userAgent ?? "").trim() || "ไม่ทราบ",
      appVersion: input.appVersion?.trim() || null,
      screenshotUrl: input.screenshotUrl?.trim() || null,
    },
  });

  // แจ้ง ops (ห้าม throw — เรื่องแจ้งเข้าไปแล้ว ผู้ใช้ต้องได้ผลลัพธ์ว่า "ส่งแล้ว")
  await logOps("WARN", "issue-report", `ผู้ใช้แจ้งปัญหา (${ISSUE_KIND_LABEL[input.kind]}): ${message.slice(0, 120)}`, {
    tenantId: ctx.tenantId,
    detail: [
      `หน้า: ${pageUrl}`,
      `ผู้แจ้ง: ${input.userId ?? "-"}`,
      `เบราว์เซอร์/แอป: ${input.userAgent ?? "-"}${input.appVersion ? ` · เวอร์ชัน ${input.appVersion}` : ""}`,
      input.screenshotUrl ? `ภาพ: ${input.screenshotUrl}` : "",
      "",
      message,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return row;
}

/** รายการเรื่องแจ้งของร้านนี้ (ใหม่สุดขึ้นก่อน) — กรองตามสถานะได้ */
export async function listIssueReports(
  ctx: Ctx,
  opts: { status?: IssueStatus | string | null; limit?: number } = {},
): Promise<IssueReport[]> {
  const status = opts.status ?? null;
  if (status !== null && !isStatus(status)) {
    throw new Error("สถานะไม่ถูกต้อง — เลือกได้เฉพาะ รอตรวจ / รับเรื่องแล้ว / แก้แล้ว");
  }
  return tenantDb(ctx).issueReport.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(opts.limit ?? 100, 1), 500),
  });
}

/** เปลี่ยนสถานะ (รับเรื่อง/แก้แล้ว) — ข้ามร้านไม่ได้ (where มี tenantId ลงไปใน SQL) */
export async function setIssueStatus(
  ctx: Ctx,
  id: string,
  status: IssueStatus | string,
): Promise<IssueReport> {
  if (!isStatus(status)) {
    throw new Error("สถานะไม่ถูกต้อง — เลือกได้เฉพาะ รอตรวจ / รับเรื่องแล้ว / แก้แล้ว");
  }
  return tenantDb(ctx).issueReport.update({ where: { id }, data: { status } });
}
