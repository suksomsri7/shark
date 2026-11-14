// HR H4.5 ▸ การผูก LINE ของพนักงาน (brief hr-brief-H4.5 R3 · P3 · P4 · P8) — ฝั่ง HR ล้วน: ไม่ import แชท/แพลตฟอร์ม
//
// 🔴 ตัวตน: รหัสผูกออกให้ "พนักงานของบัญชีที่ล็อกอินอยู่" เท่านั้น (resolveSelf → employeeOfUser) — ไม่มีฟังก์ชันใดรับรหัสพนักงานจากผู้เรียกฝั่งตัวเอง
//    ออกรหัส = แถว PENDING 10 นาที (ผูกกับร้าน + OA + ผู้ใช้ที่ขอ) · ขอใหม่ = แถวเก่า CANCELLED(REISSUED) · นับโควตา 5 ครั้ง/ชั่วโมง ก่อนเขียน (คืนช่องเมื่อเขียนไม่สำเร็จ)
// 🔴 ผูกสำเร็จ (completeLineLink) ตัดสินจากฐานใต้ล็อก hrline:<ระบบ>:<พนักงาน> เท่านั้น: PENDING · ยังไม่หมดอายุ · ร้านเดียวกัน · OA เดียวกับที่ออก ·
//    พนักงานยังทำงาน · บัญชีที่ผูกกับพนักงาน = ผู้ใช้ที่ขอรหัส · สมาชิกภาพของร้านยังรับเชิญแล้ว — ไม่ผ่านข้อใด = { ok:false } (ข้อความกลางเดียวทุกกรณี)
// 🔴 ผู้ดูแล (adminUnlinkLine · employeeLineStatus): สิทธิ์อ่านจากแถว Membership ในฐาน (ไม่เชื่อค่าบน viewer นอกจาก userId) + ขอบเขตสาขา (H1.1) ·
//    ปฏิเสธ = ไบต์เดียวกันทุกกรณี (นอกสาขา · ไม่มี · ร้านอื่น · ไม่มีคีย์) · ผู้ดูแลเห็นสถานะ + เวลาผูกเท่านั้น (ไม่เห็นชื่อ/รหัส LINE · Q14)
// 🔴 ตารางเก็บ id/สถานะเท่านั้น · audit ไม่มีรหัสผูก/LINE id/ชื่อ/รหัสผู้ติดต่อ · ทุกคำสั่งใน tx ใช้ tx client ◂
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { checkRateLimitDb, refundRateLimitDb } from "@/lib/core/rate-limit-db";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { resolveSettings } from "@/lib/core/settings";
import type { SelfActor } from "./self";
import { hrScopeOf, unitTargetOf } from "./scope";
import { HR_LINE_TEXT, lineNotifyPolicyOf, type LineNotifyPolicy } from "./line-rules";

type Ctx = { tenantId: string; systemId: string };
type Tx = ReturnType<typeof tenantDb>;
export type LineLinkViewer = { userId?: string | null; role?: unknown; unitAccess?: unknown; permissions?: unknown };
export type LineEndReason = "SELF" | "ADMIN" | "LINE" | "RELINK" | "OFFBOARD" | "ACCOUNT" | "BLOCKED" | "CONTACT_REUSED" | "REISSUED";
export type LineIssueCode = "NO_EMPLOYEE" | "INACTIVE" | "DISABLED" | "NO_OA" | "RATE" | "FAILED";

/** ข้อความคงที่ (ไทย · ไม่มีชื่อ/รหัสใด ๆ) */
export const LINE_LINK_TEXT = {
  NO_EMPLOYEE: "บัญชีของคุณยังไม่ได้ผูกกับรายชื่อพนักงานของร้านนี้ — ขอให้ผู้จัดการผูกบัญชีให้ก่อน", // = SELF_TEXT.noEmployee (H2.10)
  INACTIVE: "บัญชีพนักงานของคุณสิ้นสุดการจ้างแล้ว — ผูก LINE ไม่ได้",
  DISABLED: "ร้านยังไม่เปิดแจ้งเตือนพนักงานทาง LINE — สอบถามผู้ดูแลร้าน",
  NO_OA: "สาขาของคุณยังไม่ได้ตั้ง LINE OA สำหรับแจ้งพนักงาน — สอบถามผู้ดูแลร้าน",
  RATE: "ขอรหัสผูกบ่อยเกินไป — ลองใหม่อีกครั้งในภายหลัง (ไม่เกิน 5 ครั้งต่อชั่วโมง)",
  FAILED: "ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง",
  notFound: "ไม่พบพนักงานนี้ หรือคุณไม่มีสิทธิ์จัดการการผูก LINE ของพนักงานคนนี้",
} as const;

const CODE_TTL_MIN = 10;
const ISSUE_RATE = { limit: 5, windowMs: 60 * 60_000 };
const TX_OPTS = { maxWait: 15_000, timeout: 20_000 } as const;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const nowOf = (o?: { now?: Date }): Date => (o?.now instanceof Date && Number.isFinite(o.now.getTime()) ? o.now : new Date());
const lockKey = (systemId: string, employeeId: string) => `hrline:${systemId}:${employeeId}`;
async function lock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
const isActiveEmp = (e: { active: boolean; employmentStatus: string | null } | null | undefined) => !!e && e.active && e.employmentStatus !== "ENDED";

/** นโยบาย LINE ของระบบ HR (ค่าตั้ง AppSystem.settings.lineNotify) */
export async function linePolicyOf(ctx: Ctx): Promise<LineNotifyPolicy> {
  const s = await tenantDb({ tenantId: ctx.tenantId }).appSystem.findFirst({ where: { id: ctx.systemId, type: "HR" }, select: { settings: true } });
  const o = s?.settings && typeof s.settings === "object" && !Array.isArray(s.settings) ? (s.settings as Record<string, unknown>) : {};
  return lineNotifyPolicyOf(o.lineNotify);
}

/** OA ของพนักงาน = `messaging.lineConnectionId` ของสาขาประจำ · ไม่มี ⇒ ของสาขาใน lineNotify.unitId · ไม่มีทั้งคู่ ⇒ null (Q4) */
export async function lineOaOf(tenantId: string, homeUnitId: string | null, policy: LineNotifyPolicy): Promise<string | null> {
  for (const unitId of [homeUnitId, policy.unitId]) {
    if (!unitId) continue;
    const v = (await resolveSettings({ tenantId }, ["messaging.lineConnectionId"], { unitId }))["messaging.lineConnectionId"]?.value;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

type LinkRow = { id: string; tenantId: string; systemId: string; employeeId: string; issuedForUserId: string; status: string; connectionId: string | null; chatContactId: string | null; expiresAt: Date; linkedAt: Date | null };
const LINK_SELECT = { id: true, tenantId: true, systemId: true, employeeId: true, issuedForUserId: true, status: true, connectionId: true, chatContactId: true, expiresAt: true, linkedAt: true } as const;

/** เหตุที่พนักงานได้แจ้งในแอปว่า LINE ที่ผูกไว้ถูกเปลี่ยน/ยกเลิก (ไม่ใช่การกดเองจากหน้าของฉัน) — มติผู้คุม J */
const NOTE_REASONS = new Set<LineEndReason>(["RELINK", "ADMIN", "LINE", "CONTACT_REUSED"]);
/** ปิดการผูก ACTIVE หนึ่งแถว (ใน tx ของผู้เรียก · ล็อกพนักงานแล้ว) + audit hr.line.unlink {employeeId, reason} (+ แจ้งในแอปผู้ที่ขอผูก · ไม่มีชื่อ LINE ใด) */
async function endActiveInTx(tx: Tx, row: { id: string; tenantId: string; employeeId: string }, reason: LineEndReason, now: Date, actorUserId: string | null): Promise<boolean> {
  const cur = await tx.hrLineLink.findFirst({ where: { id: row.id, tenantId: row.tenantId }, select: { issuedForUserId: true } });
  const r = await tx.hrLineLink.updateMany({ where: { id: row.id, tenantId: row.tenantId, status: "ACTIVE" }, data: { status: "ENDED", endReason: reason, endedAt: now } });
  if (r.count !== 1) return false;
  await tx.auditLog.create({ data: { tenantId: row.tenantId, actorType: actorUserId ? "USER" : "SYSTEM", actorId: actorUserId, action: "hr.line.unlink", targetType: "HrEmployee", targetId: row.employeeId, after: { employeeId: row.employeeId, reason } } });
  if (cur?.issuedForUserId && NOTE_REASONS.has(reason)) await tx.appNotification.create({ data: { tenantId: row.tenantId, recipientUserId: cur.issuedForUserId, title: HR_LINE_TEXT.changedTitle!, body: HR_LINE_TEXT.changedBody! } });
  return true;
}

/**
 * HR H4.5 fix ▸ D2: การผูก ACTIVE ใช้ได้เฉพาะคู่ (แถวพนักงาน, ผู้ใช้ที่ขอรหัส) — พนักงานยังทำงาน · linkedUserId ปัจจุบัน = issuedForUserId ·
 * สมาชิกภาพของผู้ใช้นั้นยังรับเชิญ · ไม่ผ่าน ⇒ เหตุสิ้นสุด (OFFBOARD/ACCOUNT) ให้ผู้เรียกปิดการผูก · ผ่าน ⇒ null
 */
export async function lineLinkInvalidReason(i: { tenantId: string; systemId: string; employeeId: string; issuedForUserId: string }): Promise<"OFFBOARD" | "ACCOUNT" | null> {
  const e = await tenantDb({ tenantId: i.tenantId, systemId: i.systemId }).hrEmployee.findFirst({ where: { id: i.employeeId }, select: { active: true, employmentStatus: true, linkedUserId: true } });
  if (!isActiveEmp(e)) return "OFFBOARD";
  if (!e?.linkedUserId || e.linkedUserId !== i.issuedForUserId) return "ACCOUNT";
  const m = await tenantDb({ tenantId: i.tenantId }).membership.findFirst({ where: { tenantId: i.tenantId, userId: i.issuedForUserId, acceptedAt: { not: null } }, select: { id: true } });
  return m ? null : "ACCOUNT";
}
type ActiveRow = { id: string; systemId: string; employeeId: string; issuedForUserId: string; linkedAt: Date | null; chatContactId: string | null };
/** การผูก ACTIVE ที่ยังใช้ได้จริง — ใช้ไม่ได้ ⇒ ปิด (ACCOUNT/OFFBOARD) แล้วคืน null (การผูกเก่าไม่ฟื้นอีก · D3) */
async function validActive(tenantId: string, a: ActiveRow | null | undefined): Promise<ActiveRow | null> {
  if (!a) return null;
  const why = await lineLinkInvalidReason({ tenantId, systemId: a.systemId, employeeId: a.employeeId, issuedForUserId: a.issuedForUserId });
  if (!why) return a;
  await endLineLinks({ tenantId, systemId: a.systemId, employeeId: a.employeeId }, why);
  return null;
}

/**
 * HR H4.5 fix ▸ D1: ปิดการผูกใน tx ของผู้เรียก (ตัวให้/ถอนสิทธิ์บัญชีพนักงาน · staff/service.ts) — แถวพนักงานที่ระบุ และ/หรือ การผูกที่ออกให้ผู้ใช้ที่ระบุ ·
 * ACTIVE ⇒ ENDED(ACCOUNT) + audit · PENDING ⇒ CANCELLED · keepUserId = ผู้ใช้ใหม่ที่ผูกกับแถวนี้ (การผูกที่ออกให้คนนี้คงไว้) · คืนจำนวนที่ปิด
 */
export async function endLineLinksForAccountInTx(
  tx: Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw" | "auditLog">,
  i: { tenantId: string; employeeIds?: string[]; issuedForUserId?: string | null; keepUserId?: string | null },
): Promise<number> {
  const tenantId = str(i?.tenantId);
  const ids = (i?.employeeIds ?? []).filter((x) => typeof x === "string" && x);
  const forUser = str(i?.issuedForUserId);
  const keep = str(i?.keepUserId);
  if (!tenantId || (!ids.length && !forUser)) return 0;
  const ended = await tx.$queryRaw<{ id: string; employeeId: string }[]>`
    UPDATE "HrLineLink" SET "status" = 'ENDED', "endReason" = 'ACCOUNT', "endedAt" = now()
    WHERE "tenantId" = ${tenantId} AND "status" = 'ACTIVE' AND ("employeeId" = ANY(${ids}::text[]) OR "issuedForUserId" = ${forUser || "∅"})
      AND (${keep} = '' OR "issuedForUserId" <> ${keep})
    RETURNING "id", "employeeId"`;
  await tx.$executeRaw`
    UPDATE "HrLineLink" SET "status" = 'CANCELLED', "endedAt" = now()
    WHERE "tenantId" = ${tenantId} AND "status" = 'PENDING' AND ("employeeId" = ANY(${ids}::text[]) OR "issuedForUserId" = ${forUser || "∅"})
      AND (${keep} = '' OR "issuedForUserId" <> ${keep})`;
  if (ended.length) await tx.auditLog.createMany({ data: ended.map((r) => ({ tenantId, actorType: "SYSTEM" as const, actorId: null, action: "hr.line.unlink", targetType: "HrEmployee", targetId: r.employeeId, after: { employeeId: r.employeeId, reason: "ACCOUNT" } })) });
  return ended.length;
}

// ═══════════════════════════ ผู้ดูแล: ด่านจากฐาน ═══════════════════════════
/** สมาชิกภาพของผู้ดูจากฐาน (รับเชิญแล้ว) · ต้องเป็น OWNER หรือถือ hr.employee.create · พนักงานต้องอยู่ในระบบ + ขอบเขตสาขา — ไม่ผ่าน ⇒ null */
async function adminTarget(ctx: Ctx, viewer: LineLinkViewer | null | undefined, employeeId: unknown): Promise<{ employeeId: string; userId: string } | null> {
  const userId = str(viewer?.userId);
  const tenantId = str(ctx?.tenantId);
  const systemId = str(ctx?.systemId);
  const id = str(employeeId);
  if (!userId || !tenantId || !systemId || !id || id.length > 100) return null;
  const m = await tenantDb({ tenantId }).membership.findFirst({ where: { tenantId, userId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!m) return null;
  const mc: MembershipCtx = {
    role: m.role,
    unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [],
    permissions: m.permissions && typeof m.permissions === "object" && !Array.isArray(m.permissions) ? (m.permissions as Record<string, unknown>) : {},
  };
  if (!evaluate(mc, { module: "hr", action: "hr.employee.create" })) return null;
  const e = await tenantDb({ tenantId, systemId }).hrEmployee.findFirst({ where: { id }, select: { id: true, unitId: true, units: { select: { unitId: true, fromDate: true, toDate: true }, take: 200 } } });
  if (!e) return null;
  const t = unitTargetOf(hrScopeOf({ role: mc.role, unitAccess: mc.unitAccess }), { unitId: e.unitId, borrowings: e.units });
  return t.ok ? { employeeId: e.id, userId } : null;
}
const adminRefusal = () => ({ ok: false as const, reason: LINE_LINK_TEXT.notFound });

// ═══════════════════════════ ตัวช่วยของแพลตฟอร์ม (ไม่ใช่ทางของผู้ใช้) ═══════════════════════════
/** ยกเลิกแถว PENDING ที่ออกรหัสไม่สำเร็จ (ผู้เรียก = platform/hr-line.ts หลัง issueLinkCode ล้ม) */
export async function abortLineLink(i: { tenantId: string; linkId: string }): Promise<void> {
  const tenantId = str(i?.tenantId);
  const id = str(i?.linkId);
  if (!tenantId || !id) return;
  await tenantDb({ tenantId }).$executeRaw`UPDATE "HrLineLink" SET "status" = 'CANCELLED', "endedAt" = now() WHERE "id" = ${id} AND "tenantId" = ${tenantId} AND "status" = 'PENDING'`;
}

/** การผูก ACTIVE ของผู้ติดต่อบน OA นี้ของร้านนี้ (ค่าจาก webhook เท่านั้น · P4) — เมนู/ยกเลิกทาง LINE ใช้ */
export async function activeLinkOfContact(i: { tenantId: string; connectionId: string; chatContactId: string }): Promise<{ employeeId: string; systemId: string } | null> {
  const tenantId = str(i?.tenantId);
  const connectionId = str(i?.connectionId);
  const chatContactId = str(i?.chatContactId);
  if (!tenantId || !connectionId || !chatContactId) return null;
  const rows = await tenantDb({ tenantId }).$queryRaw<ActiveRow[]>`
    SELECT "id", "employeeId", "systemId", "issuedForUserId", "linkedAt", "chatContactId" FROM "HrLineLink"
    WHERE "tenantId" = ${tenantId} AND "connectionId" = ${connectionId} AND "chatContactId" = ${chatContactId} AND "status" = 'ACTIVE' LIMIT 1`;
  const a = await validActive(tenantId, rows[0]); // HR H4.5 fix ▸ D2 — บัญชี/สมาชิกภาพ/สถานะพนักงานเปลี่ยน ⇒ ไม่ถือว่าผูก ◂
  return a ? { employeeId: a.employeeId, systemId: a.systemId } : null;
}

/**
 * ปิดการผูกตามตัวกรอง (ร้านบังคับ) — ACTIVE ⇒ ENDED(reason) + audit · PENDING ⇒ CANCELLED (เมื่อ includePending)
 * ผู้เรียก: ตัวบริโภค hr.employee.offboarded (OFFBOARD) · ผู้ส่ง (BLOCKED) · ยกเลิกทาง LINE (LINE)
 */
export async function endLineLinks(
  filter: { tenantId: string; systemId?: string; employeeId?: string; chatContactId?: string; connectionId?: string },
  reason: LineEndReason,
  opts: { now?: Date; includePending?: boolean; actorUserId?: string | null } = {},
): Promise<{ ended: number; employeeIds: string[] }> {
  const tenantId = str(filter?.tenantId);
  const out = { ended: 0, employeeIds: [] as string[] };
  if (!tenantId || (!filter.employeeId && !filter.chatContactId)) return out;
  const now = nowOf(opts);
  const statuses = opts.includePending ? ["ACTIVE", "PENDING"] : ["ACTIVE"];
  const rows = await tenantDb({ tenantId }).$queryRaw<{ id: string; systemId: string; employeeId: string }[]>`
    SELECT "id", "systemId", "employeeId" FROM "HrLineLink"
    WHERE "tenantId" = ${tenantId} AND "status" = ANY(${statuses}::text[])
      AND (${str(filter.systemId)} = '' OR "systemId" = ${str(filter.systemId)})
      AND (${str(filter.employeeId)} = '' OR "employeeId" = ${str(filter.employeeId)})
      AND (${str(filter.chatContactId)} = '' OR "chatContactId" = ${str(filter.chatContactId)})
      AND (${str(filter.connectionId)} = '' OR "connectionId" = ${str(filter.connectionId)})
    LIMIT 50`;
  for (const r of rows) {
    const ended = await tenantDb({ tenantId, systemId: r.systemId }).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lock(tx, lockKey(r.systemId, r.employeeId));
      const cur = await tx.hrLineLink.findFirst({ where: { id: r.id }, select: { id: true, status: true } });
      if (cur?.status === "PENDING") {
        await tx.hrLineLink.updateMany({ where: { id: r.id, status: "PENDING" }, data: { status: "CANCELLED", endedAt: now } });
        return false;
      }
      return cur?.status === "ACTIVE" ? endActiveInTx(tx, { id: r.id, tenantId, employeeId: r.employeeId }, reason, now, opts.actorUserId ?? null) : false;
    }, TX_OPTS);
    if (ended) {
      out.ended++;
      out.employeeIds.push(r.employeeId);
    }
  }
  return out;
}

/** งานตามเวลา: รหัสที่หมดอายุแล้ว (PENDING) ⇒ CANCELLED — ทุกร้าน */
export async function cancelExpiredLineLinks(now: Date): Promise<number> {
  const at = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  return tenantDb({ tenantId: "" }).$executeRaw`UPDATE "HrLineLink" SET "status" = 'CANCELLED', "endedAt" = ${at} WHERE "status" = 'PENDING' AND "expiresAt" <= ${at}`;
}

/**
 * ผูก LINE จากรหัส (ผู้เรียก = platform/hr-line.ts#onHrLinked หลังแชทอ้างสิทธิ์รหัสแล้ว) — ค่าทั้งหมดมาจากแถว connection ของ webhook + refId ของรหัส ·
 * ตัดสินใหม่จากฐานใต้ล็อกพนักงาน · ไม่ผ่าน ⇒ { ok:false } (ไม่บอกเหตุผล)
 */
export async function completeLineLink(i: { tenantId: string; connectionId: string; chatContactId: string; linkId: string }, opts: { now?: Date } = {}): Promise<{ ok: true; employeeId: string } | { ok: false }> {
  const tenantId = str(i?.tenantId);
  const connectionId = str(i?.connectionId);
  const chatContactId = str(i?.chatContactId);
  const linkId = str(i?.linkId);
  const no = { ok: false as const };
  if (!tenantId || !connectionId || !chatContactId || !linkId || linkId.length > 100) return no;
  const now = nowOf(opts);
  const head = (await tenantDb({ tenantId }).$queryRaw<{ systemId: string; employeeId: string }[]>`SELECT "systemId", "employeeId" FROM "HrLineLink" WHERE "id" = ${linkId} AND "tenantId" = ${tenantId}`)[0];
  if (!head) return no;
  const ctx: Ctx = { tenantId, systemId: head.systemId };
  return tenantDb(ctx).$transaction(async (t) => {
    const tx = t as unknown as Tx;
    await lock(tx, lockKey(head.systemId, head.employeeId));
    const l = (await tx.hrLineLink.findFirst({ where: { id: linkId }, select: LINK_SELECT })) as LinkRow | null;
    if (!l || l.status !== "PENDING" || l.expiresAt.getTime() <= now.getTime() || l.connectionId !== connectionId || l.employeeId !== head.employeeId) return no;
    const e = await tx.hrEmployee.findFirst({ where: { id: l.employeeId }, select: { active: true, employmentStatus: true, linkedUserId: true } });
    if (!isActiveEmp(e) || !e?.linkedUserId || e.linkedUserId !== l.issuedForUserId) return no;
    const m = await tx.membership.findFirst({ where: { tenantId, userId: l.issuedForUserId, acceptedAt: { not: null } }, select: { id: true } });
    if (!m) return no;
    // การผูกเดิมของพนักงานคนนี้ ⇒ RELINK · ผู้ติดต่อนี้ผูกพนักงานคนอื่นอยู่ ⇒ คนนั้น CONTACT_REUSED
    const olds = await tx.hrLineLink.findMany({ where: { employeeId: l.employeeId, status: "ACTIVE" }, select: { id: true, tenantId: true, employeeId: true } });
    for (const o of olds) await endActiveInTx(tx, o, "RELINK", now, null);
    const other = await tx.$queryRaw<{ id: string; employeeId: string }[]>`
      SELECT "id", "employeeId" FROM "HrLineLink" WHERE "tenantId" = ${tenantId} AND "chatContactId" = ${chatContactId} AND "status" = 'ACTIVE' FOR UPDATE`;
    for (const o of other) await endActiveInTx(tx, { id: o.id, tenantId, employeeId: o.employeeId }, "CONTACT_REUSED", now, null);
    const up = await tx.hrLineLink.updateMany({ where: { id: l.id, status: "PENDING" }, data: { status: "ACTIVE", connectionId, chatContactId, linkedAt: now } });
    if (up.count !== 1) return no;
    await tx.appNotification.create({ data: { tenantId, recipientUserId: l.issuedForUserId, title: HR_LINE_TEXT.linked!.split(" — ")[0]!, body: HR_LINE_TEXT.appLinked! } });
    await tx.auditLog.create({ data: { tenantId, actorType: "USER", actorId: l.issuedForUserId, action: "hr.line.link", targetType: "HrEmployee", targetId: l.employeeId, after: { employeeId: l.employeeId } } });
    return { ok: true as const, employeeId: l.employeeId };
  }, TX_OPTS);
}

// ═══════════════════════════ ผู้ดูแล ═══════════════════════════
/** สถานะการผูกของพนักงาน 1 คน (ชิปหน้าโปรไฟล์) — คีย์ตายตัว ok/state/linkedAt · ปฏิเสธไบต์เดียวกันทุกกรณี */
export async function employeeLineStatus(ctx: Ctx, viewer: LineLinkViewer, input: { employeeId?: unknown }): Promise<{ ok: true; state: "ACTIVE" | "PENDING" | "NONE"; linkedAt: string | null } | { ok: false; reason: string }> {
  try {
    const t = await adminTarget(ctx, viewer, input?.employeeId);
    if (!t) return adminRefusal();
    const rows = await tenantDb(ctx).hrLineLink.findMany({ where: { employeeId: t.employeeId, status: { in: ["ACTIVE", "PENDING"] } }, select: { id: true, systemId: true, employeeId: true, issuedForUserId: true, chatContactId: true, status: true, linkedAt: true, expiresAt: true }, take: 4 });
    const a = await validActive(ctx.tenantId, rows.find((r) => r.status === "ACTIVE")); // HR H4.5 fix ▸ D2 ◂
    if (a) return { ok: true, state: "ACTIVE", linkedAt: a.linkedAt ? a.linkedAt.toISOString() : null };
    const p = rows.find((r) => r.status === "PENDING" && r.expiresAt.getTime() > Date.now());
    return { ok: true, state: p ? "PENDING" : "NONE", linkedAt: null };
  } catch {
    return adminRefusal();
  }
}

/** ผู้ดูแลยกเลิกการผูก LINE ของพนักงาน (ADMIN) */
export async function adminUnlinkLine(ctx: Ctx, viewer: LineLinkViewer, input: { employeeId?: unknown }): Promise<{ ok: true; ended: number } | { ok: false; reason: string }> {
  try {
    const t = await adminTarget(ctx, viewer, input?.employeeId);
    if (!t) return adminRefusal();
    const r = await endLineLinks({ tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: t.employeeId }, "ADMIN", { actorUserId: t.userId });
    return { ok: true, ended: r.ended };
  } catch {
    return adminRefusal();
  }
}

// ═══════════════════════════ ของฉัน (ตัวตนจากเซสชันเท่านั้น) ═══════════════════════════
export type MyLineStatus = { ok: true; state: "NONE" | "PENDING" | "ACTIVE" | "NOT_AVAILABLE"; linkedAt: string | null; shopEnabled: boolean };

/** การผูก ACTIVE ที่ใช้ได้ของตัวเอง (ออกให้บัญชีนี้ + ยังใช้ได้ · D2) — ภายใน: myLineStatus + myLineContactId */
async function myValidActive(me: { tenantId: string; userId: string; employeeId: string; ctx: Ctx }): Promise<ActiveRow | null> {
  const a = await tenantDb(me.ctx).hrLineLink.findFirst({ where: { employeeId: me.employeeId, status: "ACTIVE" }, select: { id: true, systemId: true, employeeId: true, issuedForUserId: true, linkedAt: true, chatContactId: true } });
  if (a && a.issuedForUserId !== me.userId) {
    await endLineLinks({ tenantId: me.tenantId, systemId: a.systemId, employeeId: a.employeeId }, "ACCOUNT"); // ออกให้บัญชีอื่น (บัญชีของแถวพนักงานถูกเปลี่ยน)
    return null;
  }
  return validActive(me.tenantId, a);
}

/** HR H4.5 fix ▸ MJ-2: ผู้ติดต่อ LINE ของการผูกที่ใช้ได้ของตัวเอง (id เท่านั้น) — ผู้เรียก = กาวแพลตฟอร์ม (อ่านชื่อ LINE ผ่านฝั่งแชท) · ไม่ส่งถึงหน้า */
export async function myLineContactId(actor: SelfActor): Promise<{ tenantId: string; chatContactId: string } | null> {
  const me = await (await import("./self")).resolveSelf(actor); // H2.10 resolveSelf (โหลดตอนเรียก — ดู myLineStatus) ◂
  if (!me) return null;
  const a = await myValidActive(me);
  return a?.chatContactId ? { tenantId: me.tenantId, chatContactId: a.chatContactId } : null;
}

/** สถานะ LINE ของตัวเอง (ไม่มีชื่อ LINE — กาว platform/hr-line.ts#myHrLineStatus เติมชื่อของตัวเองให้หน้า · Q14) */
export async function myLineStatus(actor: SelfActor): Promise<MyLineStatus | { ok: false; reason: string }> {
  const me = await (await import("./self")).resolveSelf(actor); // H2.10 resolveSelf — โหลดตอนเรียก (self.ts พา UI สลิป → core/context → env มาด้วย · facade HR ต้องโหลดได้โดยไม่มี env: fitness F10.1) ◂
  if (!me) return { ok: false, reason: LINE_LINK_TEXT.NO_EMPLOYEE };
  const policy = await linePolicyOf(me.ctx);
  const a = await myValidActive(me); // HR H4.5 fix ▸ D2: ออกให้บัญชีนี้ + พนักงาน/บัญชี/สมาชิกภาพยังตรง ◂
  if (a) return { ok: true, state: "ACTIVE", linkedAt: a.linkedAt ? a.linkedAt.toISOString() : null, shopEnabled: policy.enabled };
  const pending = (await tenantDb(me.ctx).hrLineLink.findMany({ where: { employeeId: me.employeeId, status: "PENDING", issuedForUserId: me.userId }, select: { expiresAt: true }, take: 2 })).some((r) => r.expiresAt.getTime() > Date.now());
  const oa = pending ? "x" : await lineOaOf(me.tenantId, me.homeUnitId, policy);
  return { ok: true, state: pending ? "PENDING" : oa ? "NONE" : "NOT_AVAILABLE", linkedAt: null, shopEnabled: policy.enabled };
}

/** เริ่มผูก: แถว PENDING 10 นาที (ผู้เรียก = platform/hr-line.ts#issueHrLineCode ซึ่งออกรหัสของแชทผูกกับ linkId นี้) */
export async function beginLineLink(
  actor: SelfActor,
  opts: { now?: Date } = {},
): Promise<{ ok: true; tenantId: string; linkId: string; connectionId: string; expiresAt: Date } | { ok: false; code: LineIssueCode; reason: string }> {
  const me = await (await import("./self")).resolveSelf(actor); // H2.10 resolveSelf — โหลดตอนเรียก (self.ts พา UI สลิป → core/context → env มาด้วย · facade HR ต้องโหลดได้โดยไม่มี env: fitness F10.1) ◂
  if (!me) return { ok: false, code: "NO_EMPLOYEE", reason: LINE_LINK_TEXT.NO_EMPLOYEE };
  if (!me.active) return { ok: false, code: "INACTIVE", reason: LINE_LINK_TEXT.INACTIVE };
  const policy = await linePolicyOf(me.ctx);
  if (!policy.enabled) return { ok: false, code: "DISABLED", reason: LINE_LINK_TEXT.DISABLED };
  const connectionId = await lineOaOf(me.tenantId, me.homeUnitId, policy);
  if (!connectionId) return { ok: false, code: "NO_OA", reason: LINE_LINK_TEXT.NO_OA };
  const key = `hr-line-issue:${me.tenantId}:${me.employeeId}`;
  const rl = await checkRateLimitDb(key, ISSUE_RATE);
  if (!rl.ok) return { ok: false, code: "RATE", reason: LINE_LINK_TEXT.RATE };
  const now = nowOf(opts);
  const expiresAt = new Date(now.getTime() + CODE_TTL_MIN * 60_000);
  try {
    const linkId = await tenantDb(me.ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lock(tx, lockKey(me.ctx.systemId, me.employeeId));
      await tx.hrLineLink.updateMany({ where: { employeeId: me.employeeId, status: "PENDING" }, data: { status: "CANCELLED", endReason: "REISSUED", endedAt: now } });
      const row = await tx.hrLineLink.create({ data: { tenantId: me.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId, issuedForUserId: me.userId, status: "PENDING", connectionId, expiresAt, createdAt: now }, select: { id: true } });
      return row.id;
    }, TX_OPTS);
    return { ok: true, tenantId: me.tenantId, linkId, connectionId, expiresAt };
  } catch {
    await refundRateLimitDb(key, rl.windowStart);
    return { ok: false, code: "FAILED", reason: LINE_LINK_TEXT.FAILED };
  }
}

/** ยกเลิกการผูก LINE ของตัวเอง (SELF) */
export async function unlinkMyLine(actor: SelfActor): Promise<{ ok: true; ended: number } | { ok: false; reason: string }> {
  const me = await (await import("./self")).resolveSelf(actor); // H2.10 resolveSelf — โหลดตอนเรียก (self.ts พา UI สลิป → core/context → env มาด้วย · facade HR ต้องโหลดได้โดยไม่มี env: fitness F10.1) ◂
  if (!me) return { ok: false, reason: LINE_LINK_TEXT.NO_EMPLOYEE };
  try {
    const r = await endLineLinks({ tenantId: me.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId }, "SELF", { actorUserId: me.userId });
    return { ok: true, ended: r.ended };
  } catch {
    return { ok: false, reason: LINE_LINK_TEXT.FAILED };
  }
}
