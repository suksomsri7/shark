// Account — helper สิทธิ์ (can) + audit สำหรับทุก action ที่แตะเงิน/เอกสารมีผล/ผัง/ตั้งค่า
// ใช้ร่วมทุกไฟล์ในโมดูล account (QC5 Gate A-A5: can() + AuditLog ทุกจุดเงิน)
import type { ActorType, Membership, Tenant } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";

type ActiveAuth = { user: { id: string }; active: Membership & { tenant: Tenant } };

/** MembershipCtx จาก requireTenant() auth */
export function mc(auth: ActiveAuth): MembershipCtx {
  return {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
}

/** ตรวจสิทธิ์ action ของโมดูลบัญชี — โยน ForbiddenError ถ้าไม่ผ่าน (action = "account.doc.issue" ฯลฯ) */
export function assertAccountCan(auth: ActiveAuth, action: string): void {
  assertCan(mc(auth), { module: "account", action });
}

/** เขียน AuditLog (fire-and-forget ปลอดภัย — ไม่ throw ล้ม action หลัก) */
export async function writeAudit(input: {
  tenantId: string;
  actorId?: string | null;
  action: string; // "account.doc.issue" | "account.payment.record" | ...
  targetType?: string; // "AccountDocument" | ...
  targetId?: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorType: "USER",
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        before: (input.before ?? undefined) as never,
        after: (input.after ?? undefined) as never,
      },
    });
  } catch {
    // audit ล้มเหลวห้ามทำ action หลักพัง
  }
}

// ─────────────────── ประวัติการแก้ไข (Audit trail UI — WO Wave6-B) ───────────────────
// อ่าน AuditLog ของ "ร้านนี้เท่านั้น" (scope tenantId เสมอ — ห้ามรั่วข้ามร้าน) มาแสดงให้เจ้าของดู
// ว่าใครทำอะไรเมื่อไหร่ · resolve ชื่อผู้ทำจาก membership+user เหมือน kanban/meeting

/** dictionary: action code → คำอ่านไทย · ครอบ action ที่มีจริงในระบบ + fallback เป็นกลุ่ม/โค้ดดิบ */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  // บัญชี
  "account.doc.create": "สร้าง/แก้ไขเอกสารบัญชี",
  "account.doc.issue": "ออกเอกสารบัญชี",
  "account.doc.approve": "อนุมัติเอกสารบัญชี",
  "account.doc.void": "ยกเลิกเอกสารบัญชี",
  "account.doc.public_link": "สร้างลิงก์ขอใบกำกับภาษี",
  "account.payment.record": "บันทึกรับ/จ่ายเงิน",
  "account.payment.void": "ยกเลิกการชำระเงิน",
  "account.contact.manage": "จัดการผู้ติดต่อ (บัญชี)",
  "account.product.manage": "จัดการสินค้า/บริการ (บัญชี)",
  "account.settings.manage": "แก้ไขตั้งค่าบัญชี",
  // งานบุคคล (HR)
  "hr.employee.create": "เพิ่มพนักงาน",
  "hr.leave.decide": "อนุมัติ/ปฏิเสธการลา",
  "hr.leave.read": "เปิดดูข้อมูลการลา",
  "hr.payroll.approve": "อนุมัติรอบเงินเดือน",
  "hr.payroll.pay": "บันทึกจ่ายเงินเดือน",
  "hr.payroll.reverse": "กลับรายการเงินเดือน",
  // ขายหน้าร้าน / ร้านอาหาร / อีคอมเมิร์ซ
  "pos.sale.create": "บันทึกการขาย",
  "pos.sale.void": "ยกเลิกการขาย",
  "restaurant.checkout.create": "ปิดบิลร้านอาหาร",
  "shop.order.confirm": "ยืนยันคำสั่งซื้อ",
  "shop.order.refund": "คืนเงินคำสั่งซื้อ",
  // สมาชิก / แต้ม / รางวัล / คูปอง
  "member.customer.create": "เพิ่มลูกค้า/สมาชิก",
  "member.customer.update": "แก้ไขข้อมูลลูกค้า/สมาชิก",
  "member.customer.import": "นำเข้าลูกค้า/สมาชิก",
  "point.adjust.create": "ปรับแต้มสะสม",
  "reward.redemption.create": "แลกของรางวัล",
  "coupon.coupon.create": "สร้างคูปอง",
  // จอง / โรงแรม / อีเวนต์ / คิว
  "booking.appointment.create": "สร้างนัดหมาย",
  "booking.appointment.setStatus": "เปลี่ยนสถานะนัดหมาย",
  "hotel.reservation.create": "สร้างการจองห้องพัก",
  "hotel.reservation.cancel": "ยกเลิกการจองห้องพัก",
  "ticket.order.markPaid": "บันทึกรับชำระบัตรอีเวนต์",
  "queue.ticket.issue": "ออกบัตรคิว",
  "rental.booking.create": "สร้างการเช่า",
  "school.enrollment.create": "ลงทะเบียนเรียน",
  "school.enrollment.pay": "ชำระค่าเรียน",
  "clinic.patient.create": "เพิ่มคนไข้",
  // คลังสินค้า
  "inventory.item.create": "เพิ่มสินค้าในคลัง",
  "inventory.movement.receive": "รับสินค้าเข้าคลัง",
  "inventory.movement.consume": "ตัดสต็อก (เบิกใช้)",
  "inventory.movement.adjust": "ปรับยอดสต็อก",
  // งาน / คลังความรู้ / การตลาด / CRM
  "kanban.board.create": "สร้างบอร์ดงาน",
  "kanban.card.create": "สร้างการ์ดงาน",
  "kanban.card.delete": "ลบการ์ดงาน",
  "kb.article.create": "สร้างบทความคลังความรู้",
  "marketing.campaign.create": "สร้างแคมเปญการตลาด",
  "crm.contact.create": "เพิ่มผู้ติดต่อ CRM",
  // สายอนุมัติ / ประกาศ / AI / แดชบอร์ด / ตลาดเทมเพลต
  "approval.policy.create": "สร้างสายอนุมัติ",
  "approval.policy.update": "แก้ไขสายอนุมัติ",
  "approval.request.decide": "ตัดสินคำขออนุมัติ",
  "announce.create": "สร้างประกาศ",
  "announce.publish": "เผยแพร่ประกาศ",
  "announce.unpublish": "ยกเลิกเผยแพร่ประกาศ",
  "ai.schedule.create": "ตั้งกำหนดการผู้ช่วย AI",
  "dashboard.layout.update": "ปรับแดชบอร์ด",
  "marketplace.template.install": "ติดตั้งเทมเพลต",
  "calendar.event.read": "เปิดดูปฏิทิน",
  "support.status": "เปลี่ยนสถานะการช่วยเหลือ",
  // ระดับร้าน/แพลตฟอร์ม
  "system.system.create": "สร้างระบบใหม่",
  "membership.role.changed": "เปลี่ยนบทบาทสมาชิก",
  "billing.create": "ออกบิลจากแพลตฟอร์ม",
  "billing.paid": "ชำระบิลแพลตฟอร์ม",
  "billing.void": "ยกเลิกบิลแพลตฟอร์ม",
  "tenant.suspend": "ระงับร้าน",
  "tenant.reactivate": "เปิดใช้งานร้านอีกครั้ง",
};

/** ป้ายกลุ่ม (prefix) สำหรับ action ที่ไม่รู้จัก — ยังอ่านออกว่ามาจากระบบไหน */
const AUDIT_GROUP_LABELS: Record<string, string> = {
  account: "บัญชี",
  hr: "งานบุคคล",
  pos: "ขายหน้าร้าน",
  restaurant: "ร้านอาหาร",
  shop: "อีคอมเมิร์ซ",
  member: "สมาชิก",
  point: "แต้มสะสม",
  reward: "รางวัล",
  coupon: "คูปอง",
  booking: "นัดหมาย",
  hotel: "โรงแรม",
  ticket: "อีเวนต์",
  queue: "คิว",
  rental: "เช่า",
  school: "โรงเรียน",
  clinic: "คลินิก",
  inventory: "คลังสินค้า",
  kanban: "งาน",
  kb: "คลังความรู้",
  marketing: "การตลาด",
  crm: "CRM",
  approval: "สายอนุมัติ",
  announce: "ประกาศ",
  ai: "ผู้ช่วย AI",
  dashboard: "แดชบอร์ด",
  marketplace: "ตลาดเทมเพลต",
  calendar: "ปฏิทิน",
  support: "ช่วยเหลือ",
  system: "ระบบ",
  membership: "สมาชิกทีม",
  billing: "บิลแพลตฟอร์ม",
  tenant: "ร้าน",
};

/** action code → คำอ่านไทย · ไม่รู้จัก → "กลุ่ม: code" หรือ code ดิบ */
export function auditActionLabelTh(code: string): string {
  const exact = AUDIT_ACTION_LABELS[code];
  if (exact) return exact;
  const group = AUDIT_GROUP_LABELS[code.split(".")[0] ?? ""];
  return group ? `${group}: ${code}` : code;
}

/** ป้ายชื่อผู้ทำตามชนิด actor เมื่อไม่ใช่ผู้ใช้ในร้าน (หรือ resolve ชื่อไม่ได้) */
function actorTypeLabelTh(t: ActorType): string {
  if (t === "SYSTEM") return "ระบบอัตโนมัติ";
  if (t === "PLATFORM_USER") return "ผู้ดูแลแพลตฟอร์ม";
  return "ผู้ใช้ที่ถูกลบ";
}

export type AuditLogRow = {
  id: string;
  createdAt: Date;
  action: string;
  actionLabel: string;
  actorType: ActorType;
  actorId: string | null;
  actorName: string;
  targetType: string | null;
  targetId: string | null;
};

export type AuditLogPage = { rows: AuditLogRow[]; nextCursor: string | null };

export type ListAuditLogsInput = {
  tenantId: string;
  /** กรองด้วย action — จับคู่แบบ prefix (เช่น "account" ครอบ "account.doc.issue") */
  action?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  /** จำนวนต่อหน้า (default 50 · cap 200) */
  take?: number;
  /** id ของแถวสุดท้ายหน้าก่อน (createdAt desc) */
  cursor?: string;
};

/**
 * อ่านประวัติการแก้ไข (AuditLog) ของร้าน เรียงใหม่สุดก่อน + resolve ชื่อผู้ทำ
 * ⚠️ scope tenantId เสมอ — ทุก query มี where.tenantId (กันรั่วข้ามร้าน fail-closed)
 */
export async function listAuditLogs(input: ListAuditLogsInput): Promise<AuditLogPage> {
  const take = Math.min(Math.max(Math.trunc(input.take ?? 50), 1), 200);
  const createdAt =
    input.from || input.to
      ? { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) }
      : undefined;

  const logs = await prisma.auditLog.findMany({
    where: {
      tenantId: input.tenantId, // ← scope ร้าน (บังคับทุกครั้ง)
      ...(input.action ? { action: { startsWith: input.action } } : {}),
      ...(input.actorId ? { actorId: input.actorId } : {}),
      ...(createdAt ? { createdAt } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1, // +1 เพื่อรู้ว่ามีหน้าถัดไปไหม
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });

  const hasMore = logs.length > take;
  const page = hasMore ? logs.slice(0, take) : logs;

  // resolve ชื่อผู้ทำ: userId → name/email ผ่าน membership ของร้านนี้ (เหมือน kanban service)
  const userIds = [
    ...new Set(page.filter((l) => l.actorType === "USER" && l.actorId).map((l) => l.actorId as string)),
  ];
  const nameById = new Map<string, string>();
  if (userIds.length > 0) {
    const members = await prisma.membership.findMany({
      where: { tenantId: input.tenantId, userId: { in: userIds } },
      include: { user: true },
    });
    for (const m of members) nameById.set(m.userId, m.user.name ?? m.user.email);
  }

  const rows: AuditLogRow[] = page.map((l) => ({
    id: l.id,
    createdAt: l.createdAt,
    action: l.action,
    actionLabel: auditActionLabelTh(l.action),
    actorType: l.actorType,
    actorId: l.actorId,
    actorName:
      l.actorType === "USER" && l.actorId
        ? nameById.get(l.actorId) ?? actorTypeLabelTh(l.actorType)
        : actorTypeLabelTh(l.actorType),
    targetType: l.targetType,
    targetId: l.targetId,
  }));

  return { rows, nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

/** ชนิด action ที่มีจริงในประวัติของร้าน (สำหรับ dropdown ตัวกรอง) พร้อมป้ายไทย */
export async function listAuditActions(tenantId: string): Promise<{ action: string; label: string }[]> {
  const rows = await prisma.auditLog.findMany({
    where: { tenantId },
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });
  return rows.map((r) => ({ action: r.action, label: auditActionLabelTh(r.action) }));
}
