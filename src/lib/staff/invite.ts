// invite.ts — เชิญพนักงานด้วยเบอร์โทร (ใบ S1.25 · แบบ G2 · RESOLUTIONS R-K11 · R-K9 · §H R-S1.19d)
//
// 🔴 R-K11: **ไม่สร้าง Membership จนกว่าจะรับ** — คำเชิญอยู่ในตาราง StaffInvite เท่านั้น
//    (`Membership.acceptedAt = null` แปลว่า "ถูกถอนสิทธิ์" — ห้ามใช้แทน "รอรับ")
//    รับ = ผู้ใช้เข้าแอปด้วยเบอร์นั้น (OTP · R-K9) → `claimInvitesForPhone` สร้าง/คืน Membership ใน tx ต่อใบ
// กติกา (fail-closed ทุกข้อ · ตัวตรวจชุดเดียวกับ staff/service.ts updateStaffAccess):
//   · ผู้เชิญอ่านจาก DB (ไม่เชื่อ ctx.membership) · OWNER/MANAGER เท่านั้น · MANAGER เชิญได้เฉพาะ STAFF (ไม่สร้างคนระดับเดียวกับตัวเอง)
//   · สาขา ⊆ ร้าน + canGrantUnitAccess · สิทธิ์ผ่าน validatePermissionInput + checkNoEscalation (ห้ามให้สิ่งที่ตัวเองไม่มี)
//   · ตอนรับ ตรวจซ้ำกับสิทธิ์ "ปัจจุบัน" ของผู้เชิญ — ผู้เชิญถูกถอน/ลดบทบาทหลังเชิญ ⇒ ใบใช้ไม่ได้
//   · รหัส 8 ตัว (ไม่มี 0/O/1/I) เก็บแค่ sha256 · ลิงก์ https://shark.in.th/i/<code> · หมดอายุ 7 วัน
//   · เวลาส่งล่าสุด = expiresAt − 7 วัน (ไม่มีคอลัมน์ใหม่) → throttle 1 ครั้ง/เบอร์/60 วิ ต่อร้าน · ค้างได้ ≤ 20 ใบต่อร้าน
//   · ห้ามคืนรหัส/codeHash/เบอร์เต็มออกจากรายการ · ห้ามเขียนรหัสหรือเบอร์ลง log
import type { Prisma, Role, StaffInvite } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { randomCode, sha256 } from "@/lib/core/hash";
import { normalizeThaiMobile } from "@/lib/core/phone-auth";
import { canAssignRole, canGrantUnitAccess, type MembershipCtx } from "@/lib/core/rbac";
import { getSmsProvider, sendSms } from "@/lib/core/sms";
import { checkNoEscalation, listStaffAccess, listTenantUnits, validatePermissionInput, type StaffAccessRow } from "./service";

export const INVITE_TTL_DAYS = 7;
export const INVITE_RESEND_SEC = 60;
export const INVITE_PENDING_MAX = 20;
export const INVITE_LINK_BASE = "https://shark.in.th/i/";
const INVITE_CODE_LEN = 8;
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 ตัว · ไม่มี 0/O/1/I
const NAME_MAX = 60;
const DAY_MS = 86_400_000;
const TTL_MS = INVITE_TTL_DAYS * DAY_MS;

type PermissionMap = Record<string, unknown>;
type InviteRole = "MANAGER" | "STAFF";
export type InviteCtx = { tenantId: string; actorUserId: string; membership: MembershipCtx };
export type InviteFailReason =
  | "forbidden"
  | "bad_phone"
  | "bad_role"
  | "bad_units"
  | "bad_permissions"
  | "already_member"
  | "already_invited"
  | "sms_unavailable"
  | "throttled";
export type InviteResult =
  | { ok: true; inviteId: string; link: string; sms: "sent" | "mocked" | "unavailable"; expiresAt: Date }
  | { ok: false; reason: InviteFailReason; message: string };
export type InviteRow = {
  id: string;
  name: string;
  phoneMasked: string;
  role: string;
  unitAccess: string[];
  permissions: PermissionMap;
  invitedById: string;
  createdAt: Date;
  expiresAt: Date;
  expired: boolean;
  acceptedAt: Date | null;
};

const MSG = {
  forbidden: "เฉพาะเจ้าของกิจการหรือผู้จัดการเท่านั้นที่เชิญพนักงานได้",
  notFound: "ไม่พบคำเชิญนี้ — กรุณารีเฟรชหน้าแล้วลองใหม่",
  badPhone: "เบอร์มือถือไม่ถูกต้อง กรุณาตรวจแล้วลองใหม่",
  badRole: "เชิญได้เป็น “ผู้จัดการ” หรือ “พนักงาน” เท่านั้น",
  badRoleRank: "ผู้จัดการเชิญได้เฉพาะ “พนักงาน” — ให้เจ้าของกิจการเป็นผู้เชิญผู้จัดการ",
  badUnits: "มีสาขาที่ไม่อยู่ในกิจการนี้ หรือสาขาที่คุณเองยังเข้าไม่ถึง — กรุณาเลือกใหม่",
  alreadyMember: "เบอร์นี้เป็นผู้ใช้งานของกิจการนี้อยู่แล้ว",
  alreadyInvited: "เบอร์นี้มีคำเชิญที่ยังไม่หมดอายุอยู่แล้ว — กด “ส่งอีกครั้ง” ที่คำเชิญเดิมแทน",
  accepted: "คำเชิญนี้ถูกรับไปแล้ว",
  smsUnavailable: "ตอนนี้ระบบยังส่ง SMS ไม่ได้ — ลองใหม่ภายหลัง",
  throttled: `เพิ่งส่งคำเชิญถึงเบอร์นี้ไป รอสัก ${INVITE_RESEND_SEC} วินาทีแล้วลองใหม่`,
  tooMany: `มีคำเชิญที่ยังไม่ตอบรับครบ ${INVITE_PENDING_MAX} ใบแล้ว — ยกเลิกใบเก่าก่อนแล้วค่อยเชิญเพิ่ม`,
} as const;

const failR = (reason: InviteFailReason, message: string): InviteResult => ({ ok: false, reason, message });

/** hash ของรหัสคำเชิญ — sha256 แบบ phone-auth (ค้นด้วยรหัสอย่างเดียว ⇒ ไม่ผูกเบอร์) */
function hashInviteCode(code: string): string {
  return sha256(`staff-invite:${code}`);
}
/** รหัสที่ผู้ใช้พิมพ์/วางจากลิงก์ → ตัวพิมพ์ใหญ่ ตัดสิ่งอื่น */
function cleanCode(raw: string): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
}
const sentAtOf = (row: { expiresAt: Date }) => row.expiresAt.getTime() - TTL_MS;
const jsonArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const jsonObj = (v: unknown): PermissionMap => (v && typeof v === "object" && !Array.isArray(v) ? (v as PermissionMap) : {});

/** เบอร์แบบปิดเลขกลาง — ตัวปิดของ CRM (maskContactValue ผ่าน facade `crmApi.maskPiiDeep`) · lazy (ไม่ลาก CRM เข้าทางล็อกอิน) */
async function maskPhones<T extends { phone: string }>(rows: T[]): Promise<Map<T, string>> {
  const out = new Map<T, string>();
  if (rows.length === 0) return out;
  const { crmApi } = await import("@/lib/modules/crm");
  for (const r of rows) {
    const m = crmApi.maskPiiDeep({ phone: r.phone }) as { phone?: unknown };
    out.set(r, typeof m.phone === "string" && m.phone !== r.phone ? m.phone : "xxxxxxxxxx");
  }
  return out;
}

type Actor = { role: Role; ctx: MembershipCtx };
/** ผู้เชิญจาก DB (สมาชิกที่ยังใช้งาน) · OWNER/MANAGER เท่านั้น */
async function loadInviter(tenantId: string, userId: string, client: Prisma.TransactionClient | typeof prisma = prisma): Promise<Actor | null> {
  if (!tenantId || !userId) return null;
  const m = await client.membership.findFirst({ where: { tenantId, userId, acceptedAt: { not: null } } });
  if (!m || (m.role !== "OWNER" && m.role !== "MANAGER")) return null;
  return { role: m.role, ctx: { role: m.role, unitAccess: jsonArr(m.unitAccess), permissions: jsonObj(m.permissions) } };
}

/** MANAGER จัดการได้เฉพาะคำเชิญระดับ STAFF · OWNER ได้ทุกใบ */
function canManageInviteRole(actor: Actor, role: string): boolean {
  if (role !== "MANAGER" && role !== "STAFF") return false;
  if (!canAssignRole(actor.role, role)) return false;
  return actor.role === "OWNER" || role === "STAFF";
}

type Checked = { role: InviteRole; unitAccess: string[]; permissions: PermissionMap };
/** ตรวจบทบาท/สาขา/สิทธิ์ของใบ กับสิทธิ์ปัจจุบันของผู้เชิญ — ใช้ทั้งตอนเชิญและตอนรับ */
async function checkGrant(
  tenantId: string,
  actor: Actor,
  input: { role: unknown; unitAccess: unknown; permissions: unknown },
): Promise<{ ok: true; value: Checked } | { ok: false; reason: InviteFailReason; message: string }> {
  const role = input.role;
  if (role !== "MANAGER" && role !== "STAFF") return { ok: false, reason: "bad_role", message: MSG.badRole };
  if (!canManageInviteRole(actor, role)) return { ok: false, reason: "bad_role", message: MSG.badRoleRank };
  if (input.unitAccess !== undefined && !Array.isArray(input.unitAccess)) return { ok: false, reason: "bad_units", message: MSG.badUnits };
  const ids = [...new Set(jsonArr(input.unitAccess).map((u) => u.trim()).filter(Boolean))];
  const unitAccess = ids.includes("*") ? ["*"] : ids;
  if (unitAccess.length > 0 && unitAccess[0] !== "*") {
    const own = new Set((await listTenantUnits(tenantId)).map((u) => u.id));
    if (unitAccess.some((u) => !own.has(u))) return { ok: false, reason: "bad_units", message: MSG.badUnits };
  }
  if (!canGrantUnitAccess(actor.ctx, unitAccess)) return { ok: false, reason: "bad_units", message: MSG.badUnits };
  if (input.permissions !== undefined && input.permissions !== null && (typeof input.permissions !== "object" || Array.isArray(input.permissions))) {
    return { ok: false, reason: "bad_permissions", message: "รูปแบบสิทธิ์ไม่ถูกต้อง" };
  }
  const parsed = validatePermissionInput(jsonObj(input.permissions));
  if (!parsed.ok) return { ok: false, reason: "bad_permissions", message: parsed.reason };
  const esc = checkNoEscalation(actor.ctx, {}, parsed.value);
  if (esc) return { ok: false, reason: "bad_permissions", message: esc.reason };
  return { ok: true, value: { role, unitAccess, permissions: parsed.value } };
}

/** ส่ง SMS คำเชิญ — คืนสถานะสำหรับหน้าจอ (ไม่ throw · ไม่ log รหัส) */
async function sendInviteSms(tenantId: string, invitee: string, phone: string, link: string): Promise<"sent" | "mocked" | "unavailable"> {
  const provider = getSmsProvider();
  if (!provider) return "unavailable";
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const text = `${tenant?.name ?? "ร้าน"} เชิญคุณ ${invitee} เข้าใช้ SHARK · เปิดลิงก์ ${link} (หมดอายุ ${INVITE_TTL_DAYS} วัน)`;
  const r = await sendSms({ to: phone, text });
  if (!r.ok) return "unavailable";
  return provider.name === "mock" ? "mocked" : "sent";
}

/** ไม่มีผู้ให้บริการ SMS บน production ⇒ ไม่สร้างแถว (R-S1.19d/g) · dev ไม่มีผู้ให้บริการ ⇒ สร้างได้ (sms "unavailable" · ส่งลิงก์เอง) */
function smsBlocked(): boolean {
  return getSmsProvider() === null && process.env.APP_ENV === "production";
}

class InviteRuleError extends Error {
  constructor(public readonly reason: InviteFailReason, message: string) {
    super(message);
  }
}

export async function inviteStaff(
  ctx: InviteCtx,
  input: { name: string; phone: string; role: InviteRole; unitIds?: string[]; permissions?: PermissionMap },
  now: Date = new Date(),
): Promise<InviteResult> {
  const actor = await loadInviter(ctx.tenantId, ctx.actorUserId);
  if (!actor) return failR("forbidden", MSG.forbidden);
  const checked = await checkGrant(ctx.tenantId, actor, { role: input?.role, unitAccess: input?.unitIds, permissions: input?.permissions });
  const phone = normalizeThaiMobile(input?.phone);
  if (!phone) return failR("bad_phone", MSG.badPhone);
  if (!checked.ok) return failR(checked.reason, checked.message);
  if (smsBlocked()) return failR("sms_unavailable", MSG.smsUnavailable);
  const name = String(input?.name ?? "").trim().slice(0, NAME_MAX) || "พนักงานใหม่";

  const code = randomCode(INVITE_CODE_LEN, INVITE_ALPHABET);
  const expiresAt = new Date(now.getTime() + TTL_MS);
  let row: StaffInvite;
  try {
    row = await prisma.$transaction(async (tx) => {
      // ต่อคิวต่อ (ร้าน, เบอร์) — สองคำขอพร้อมกันได้ใบเดียว
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`staff-invite:${ctx.tenantId}:${phone}`}, 0))`;
      const holder = await tx.userPhone.findUnique({ where: { phone }, select: { userId: true } });
      if (holder) {
        const mem = await tx.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: holder.userId, acceptedAt: { not: null } }, select: { id: true } });
        if (mem) throw new InviteRuleError("already_member", MSG.alreadyMember);
      }
      const same = await tx.staffInvite.findMany({ where: { tenantId: ctx.tenantId, phone }, select: { acceptedAt: true, expiresAt: true } });
      if (same.some((r) => r.acceptedAt === null && r.expiresAt > now)) throw new InviteRuleError("already_invited", MSG.alreadyInvited);
      if (same.some((r) => sentAtOf(r) > now.getTime() - INVITE_RESEND_SEC * 1000)) throw new InviteRuleError("throttled", MSG.throttled);
      const pending = await tx.staffInvite.count({ where: { tenantId: ctx.tenantId, acceptedAt: null, expiresAt: { gt: now } } });
      if (pending >= INVITE_PENDING_MAX) throw new InviteRuleError("throttled", MSG.tooMany);
      return tx.staffInvite.create({
        data: {
          tenantId: ctx.tenantId,
          phone,
          name,
          role: checked.value.role,
          unitAccess: checked.value.unitAccess,
          permissions: checked.value.permissions as Prisma.InputJsonValue,
          codeHash: hashInviteCode(code),
          expiresAt,
          invitedById: ctx.actorUserId,
        },
      });
    });
  } catch (e) {
    if (e instanceof InviteRuleError) return failR(e.reason, e.message);
    throw e;
  }
  const link = `${INVITE_LINK_BASE}${code}`;
  const sms = await sendInviteSms(ctx.tenantId, name, phone, link);
  return { ok: true, inviteId: row.id, link, sms, expiresAt };
}

/** คำเชิญของร้าน (OWNER/MANAGER) — ไม่มี codeHash · เบอร์ปิดเลขกลาง · ปริยายเฉพาะที่ยังไม่รับ */
export async function listInvites(ctx: InviteCtx, opts: { includeAccepted?: boolean; now?: Date } = {}): Promise<InviteRow[]> {
  const actor = await loadInviter(ctx.tenantId, ctx.actorUserId);
  if (!actor) return [];
  const now = opts.now ?? new Date();
  const rows = await prisma.staffInvite.findMany({
    where: { tenantId: ctx.tenantId, ...(opts.includeAccepted ? {} : { acceptedAt: null }) },
    orderBy: { createdAt: "desc" },
  });
  const masked = await maskPhones(rows);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phoneMasked: masked.get(r) ?? "xxxxxxxxxx",
    role: r.role,
    unitAccess: jsonArr(r.unitAccess),
    permissions: jsonObj(r.permissions),
    invitedById: r.invitedById,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    expired: r.acceptedAt === null && r.expiresAt <= now,
    acceptedAt: r.acceptedAt,
  }));
}

/** ผู้ใช้งานของร้าน + แถว "รอรับคำเชิญ" (D1) — แยกจาก listStaffAccess เพื่อไม่เปลี่ยนรูปของผู้เรียกเดิม */
export type StaffOrInviteRow =
  | (StaffAccessRow & { pending: false })
  | { pending: true; inviteId: string; name: string; phoneMasked: string; role: string; unitAccess: string[]; permissions: PermissionMap; expiresAt: Date; expired: boolean };
export async function listStaffAccessWithInvites(ctx: InviteCtx, now: Date = new Date()): Promise<StaffOrInviteRow[]> {
  const actor = await loadInviter(ctx.tenantId, ctx.actorUserId);
  if (!actor) return [];
  const [staff, invites] = await Promise.all([listStaffAccess(ctx.tenantId), listInvites(ctx, { now })]);
  return [
    ...staff.map((s) => ({ ...s, pending: false as const })),
    ...invites.map((i) => ({
      pending: true as const,
      inviteId: i.id,
      name: i.name,
      phoneMasked: i.phoneMasked,
      role: i.role,
      unitAccess: i.unitAccess,
      permissions: i.permissions,
      expiresAt: i.expiresAt,
      expired: i.expired,
    })),
  ];
}

/** ยกเลิกคำเชิญที่ยังไม่รับ (ลบแถว) — MANAGER ยกเลิกได้เฉพาะใบระดับ STAFF */
export async function cancelInvite(ctx: InviteCtx, inviteId: string): Promise<boolean> {
  const actor = await loadInviter(ctx.tenantId, ctx.actorUserId);
  if (!actor || typeof inviteId !== "string" || !inviteId) return false;
  const row = await prisma.staffInvite.findFirst({ where: { id: inviteId, tenantId: ctx.tenantId, acceptedAt: null }, select: { id: true, role: true } });
  if (!row || !canManageInviteRole(actor, row.role)) return false;
  const r = await prisma.staffInvite.deleteMany({ where: { id: row.id, tenantId: ctx.tenantId, acceptedAt: null } });
  return r.count === 1;
}

/** ส่งใหม่ = รหัสใหม่ + หมดอายุใหม่ (ลิงก์เดิมใช้ไม่ได้) · throttle เดิม 60 วิ */
export async function resendInvite(ctx: InviteCtx, inviteId: string, now: Date = new Date()): Promise<InviteResult> {
  const actor = await loadInviter(ctx.tenantId, ctx.actorUserId);
  if (!actor) return failR("forbidden", MSG.forbidden);
  const row = typeof inviteId === "string" && inviteId ? await prisma.staffInvite.findFirst({ where: { id: inviteId, tenantId: ctx.tenantId } }) : null;
  if (!row || !canManageInviteRole(actor, row.role)) return failR("forbidden", MSG.notFound);
  if (row.acceptedAt) return failR("already_member", MSG.accepted);
  if (sentAtOf(row) > now.getTime() - INVITE_RESEND_SEC * 1000) return failR("throttled", MSG.throttled);
  // ใบเก่าที่หมดอายุแล้ว แต่เบอร์เดียวกันมีใบใหม่ค้างอยู่ ⇒ ห้ามมีสองใบค้างพร้อมกัน
  const other = await prisma.staffInvite.count({ where: { tenantId: ctx.tenantId, phone: row.phone, acceptedAt: null, expiresAt: { gt: now }, id: { not: row.id } } });
  if (other > 0) return failR("already_invited", MSG.alreadyInvited);
  if (smsBlocked()) return failR("sms_unavailable", MSG.smsUnavailable);
  const code = randomCode(INVITE_CODE_LEN, INVITE_ALPHABET);
  const expiresAt = new Date(now.getTime() + TTL_MS);
  // conditional คำสั่งเดียว: ยังไม่รับ + ยังเป็นรอบส่งเดิม (กดส่งพร้อมกันได้รอบเดียว)
  const r = await prisma.staffInvite.updateMany({
    where: { id: row.id, tenantId: ctx.tenantId, acceptedAt: null, expiresAt: row.expiresAt },
    data: { codeHash: hashInviteCode(code), expiresAt },
  });
  if (r.count !== 1) return failR("throttled", MSG.throttled);
  const link = `${INVITE_LINK_BASE}${code}`;
  const sms = await sendInviteSms(ctx.tenantId, row.name, row.phone, link);
  return { ok: true, inviteId: row.id, link, sms, expiresAt };
}

/** หน้า /i/<code> (S2.21) — ชื่อร้าน + ชื่อผู้ถูกเชิญ + เบอร์ปิดเลขกลาง · ไม่เปิดเผยเบอร์เต็ม */
export async function previewInvite(
  code: string,
  now: Date = new Date(),
): Promise<{ ok: true; tenantName: string; name: string; role: string; phoneMasked: string; expiresAt: Date } | { ok: false; reason: "not_found" | "expired" | "accepted" }> {
  const c = cleanCode(code);
  if (c.length !== INVITE_CODE_LEN) return { ok: false, reason: "not_found" };
  const row = await prisma.staffInvite.findUnique({ where: { codeHash: hashInviteCode(c) } });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.acceptedAt) return { ok: false, reason: "accepted" };
  if (row.expiresAt <= now) return { ok: false, reason: "expired" };
  const tenant = await prisma.tenant.findUnique({ where: { id: row.tenantId }, select: { name: true } });
  if (!tenant) return { ok: false, reason: "not_found" };
  const masked = await maskPhones([row]);
  return { ok: true, tenantName: tenant.name, name: row.name, role: row.role, phoneMasked: masked.get(row) ?? "xxxxxxxxxx", expiresAt: row.expiresAt };
}

/**
 * รับ 1 ใบ ใน tx เดียว: จองใบแบบ conditional (ยังไม่รับ+ยังไม่หมดอายุ) → ตรวจซ้ำกับสิทธิ์ปัจจุบันของผู้เชิญ → Membership
 *   ไม่มีแถว ⇒ สร้าง (acceptedAt = now) · แถวที่ถูกถอน ⇒ คืนตามใบใหม่ · สมาชิก active อยู่แล้ว ⇒ ไม่แตะ (ไม่ลดบทบาท ไม่ทับสิทธิ์)
 *   ตรวจไม่ผ่าน ⇒ โยน ⇒ ย้อนทั้ง tx (ใบยังค้าง) · คืน null
 */
async function claimOne(inv: StaffInvite, userId: string, now: Date): Promise<{ tenantId: string; membershipId: string } | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const got = await tx.staffInvite.updateMany({
        where: { id: inv.id, tenantId: inv.tenantId, acceptedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now, acceptedUserId: userId },
      });
      if (got.count !== 1) throw new InviteRuleError("already_invited", "taken");
      const actor = await loadInviter(inv.tenantId, inv.invitedById, tx);
      if (!actor) throw new InviteRuleError("forbidden", "inviter");
      const checked = await checkGrant(inv.tenantId, actor, { role: inv.role, unitAccess: inv.unitAccess, permissions: inv.permissions });
      if (!checked.ok) throw new InviteRuleError(checked.reason, "grant");
      const v = checked.value;
      const existing = await tx.membership.findUnique({ where: { userId_tenantId: { userId, tenantId: inv.tenantId } } });
      if (existing && existing.acceptedAt) return { tenantId: inv.tenantId, membershipId: existing.id };
      const data = { role: v.role as Role, unitAccess: v.unitAccess, permissions: v.permissions as Prisma.InputJsonValue, acceptedAt: now };
      const m = existing
        ? await tx.membership.update({ where: { id: existing.id }, data })
        : await tx.membership.create({ data: { userId, tenantId: inv.tenantId, invitedAt: inv.createdAt, ...data } });
      return { tenantId: inv.tenantId, membershipId: m.id };
    });
  } catch (e) {
    if (!(e instanceof InviteRuleError)) throw e;
    if (e.message !== "taken") await logInvite(inv.tenantId, `คำเชิญ ${inv.id} รับไม่ได้: ${e.reason}`);
    return null;
  }
}

/** แจ้งผู้เชิญ "<ชื่อ> รับคำเชิญแล้ว" — กล่องแจ้งเตือนในแอป + push · best-effort */
async function notifyAccepted(inv: StaffInvite, now: Date): Promise<void> {
  const title = "พนักงานรับคำเชิญแล้ว";
  const body = `${inv.name} รับคำเชิญแล้ว`;
  try {
    await prisma.appNotification.create({ data: { tenantId: inv.tenantId, recipientUserId: inv.invitedById, title, body } });
  } catch {
    /* best-effort */
  }
  try {
    const { notifyUser } = await import("@/lib/ai/secretary/notify");
    await notifyUser(inv.invitedById, inv.tenantId, "inbox", { title, body, data: { link: "/staff", inviteId: inv.id } }, { now, assigneeUserId: inv.invitedById });
  } catch {
    /* best-effort */
  }
}

async function logInvite(tenantId: string, message: string): Promise<void> {
  try {
    const { logOps } = await import("@/lib/core/ops");
    await logOps("WARN", "staff-invite", message, { tenantId });
  } catch {
    /* logger ห้ามพางานหลัก */
  }
}

/** ผู้ใช้ยืนยันเบอร์นี้แล้วจริงไหม (UserPhone ของเขา · verifiedAt) */
async function ownsVerifiedPhone(userId: string, phone: string): Promise<boolean> {
  const up = await prisma.userPhone.findUnique({ where: { userId }, select: { phone: true, verifiedAt: true } });
  return !!up && up.phone === phone && up.verifiedAt !== null;
}

/** รับทุกใบของเบอร์นี้ที่ยังไม่รับ+ยังไม่หมดอายุ (ทุกร้าน) — เรียกจาก hook ของ phone-auth หลังยืนยันเบอร์ */
export async function claimInvitesForPhone(userId: string, rawPhone: string, now: Date = new Date()): Promise<{ accepted: { tenantId: string; membershipId: string }[] }> {
  const phone = normalizeThaiMobile(rawPhone);
  if (!phone || !userId || !(await ownsVerifiedPhone(userId, phone))) return { accepted: [] };
  const invites = await prisma.staffInvite.findMany({ where: { phone, acceptedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: "asc" } });
  const accepted: { tenantId: string; membershipId: string }[] = [];
  for (const inv of invites) {
    const r = await claimOne(inv, userId, now);
    if (!r) continue;
    accepted.push(r);
    await notifyAccepted(inv, now);
  }
  return { accepted };
}

/** รับด้วยรหัสจากลิงก์ — ต้องมีเบอร์ที่ยืนยันแล้วตรงกับใบ (phone_mismatch ไม่บอกว่าใบเป็นของเบอร์ไหน) */
export async function acceptInviteByCode(
  userId: string,
  code: string,
  now: Date = new Date(),
): Promise<{ ok: true; tenantId: string } | { ok: false; reason: "not_found" | "expired" | "accepted" | "phone_mismatch" }> {
  const c = cleanCode(code);
  if (c.length !== INVITE_CODE_LEN || !userId) return { ok: false, reason: "not_found" };
  const inv = await prisma.staffInvite.findUnique({ where: { codeHash: hashInviteCode(c) } });
  if (!inv) return { ok: false, reason: "not_found" };
  if (inv.acceptedAt) return { ok: false, reason: "accepted" };
  if (inv.expiresAt <= now) return { ok: false, reason: "expired" };
  if (!(await ownsVerifiedPhone(userId, inv.phone))) return { ok: false, reason: "phone_mismatch" };
  const r = await claimOne(inv, userId, now);
  if (!r) {
    const again = await prisma.staffInvite.findUnique({ where: { id: inv.id }, select: { acceptedAt: true } });
    return { ok: false, reason: again?.acceptedAt ? "accepted" : "not_found" };
  }
  await notifyAccepted(inv, now);
  return { ok: true, tenantId: r.tenantId };
}
