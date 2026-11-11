// Support Desk + ระงับร้าน — ฝั่งแพลตฟอร์ม (WO-0021)
// อ่าน/เขียนข้ามร้าน → ใช้ base client (prisma) ตรง ไม่ใช่ tenantDb
// การกระทำสำคัญบันทึก PlatformAuditLog (append-only) เสมอ
// ระงับ/เปิดร้าน = SUPER_ADMIN เท่านั้น (requirePlatformRole → throw ถ้าไม่ผ่าน)

import type {
  Prisma,
  PlatformAuditLog,
  PlatformRole,
  PlatformUser,
  SupportCase,
  SupportCaseStatus,
  SupportMessage,
} from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { requirePlatformRole } from "./auth";

export type CaseWithTenant = SupportCase & { tenantName: string };

// transport ของ push ที่ฉีดได้ (ทดสอบ) — ชนิดเดียวกับ core/push.ts
type PushPost = (payloads: unknown[]) => Promise<unknown>;

// เคสทุกร้าน (กรองสถานะได้) — ความเคลื่อนไหวล่าสุดก่อน + ชื่อร้านประกอบ
// S1.17 (R-K12 · จอ H3) ▸ กรองเพิ่ม: ช่องทาง (`source` "APP"/"WEB"/"AI") · หมวด · ผู้รับเรื่อง — ไม่ส่งตัวกรอง = เดิม ◂
export async function listAllCases(filter?: {
  status?: SupportCaseStatus;
  source?: string;
  category?: string;
  assigneePlatformUserId?: string;
}): Promise<CaseWithTenant[]> {
  const where: Prisma.SupportCaseWhereInput = {
    ...(filter?.status ? { status: filter.status } : {}),
    ...(filter?.source ? { source: filter.source } : {}),
    ...(filter?.category ? { category: filter.category } : {}),
    ...(filter?.assigneePlatformUserId ? { assigneePlatformUserId: filter.assigneePlatformUserId } : {}),
  };
  const cases = await prisma.supportCase.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { updatedAt: "desc" },
  });
  const ids = [...new Set(cases.map((c) => c.tenantId))];
  const tenants = ids.length
    ? await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(tenants.map((t) => [t.id, t.name]));
  return cases.map((c) => ({ ...c, tenantName: nameById.get(c.tenantId) ?? "—" }));
}

// ── S2.16 (จอ H3) ▸ รายการเคสของทีมงาน: แท็บ + ตัวกรองช่องทาง/หมวด + ป้ายด่วน ─────────────────────────────
//   แท็บ: new = OPEN ที่ยังไม่มีผู้รับ · waiting_shop = PENDING (ตอบแล้ว รอร้าน) · mine = ผู้รับคือฉัน และยังไม่ปิด · closed = RESOLVED
//   ไม่ส่งแท็บ = ทุกเคส · `urgent` = หมวด billing หรือหัวข้อมีคำเรื่องเงิน (ป้าย "!") · อ่านได้ทุก role ของแพลตฟอร์ม (เท่าหน้าเดิม)
export const CASE_TABS = ["new", "waiting_shop", "mine", "closed"] as const;
export type CaseTab = (typeof CASE_TABS)[number];
/** role ที่ลงมือกับเคส/ร้านได้ (รับเรื่อง · ระงับเลขา) */
export const CASE_WRITE_ROLES: PlatformRole[] = ["SUPER_ADMIN", "SUPPORT"];
const ALL_PLATFORM_ROLES: PlatformRole[] = ["SUPER_ADMIN", "SUPPORT", "FINANCE"];
/** คำเรื่องเงินในหัวข้อ ⇒ ด่วน (ไทย+อังกฤษ) */
export const MONEY_WORDS_RE = /เงิน|บิล|ชำระ|จ่าย|โอน|มัดจำ|ค่าบริการ|เครดิต|ใบเสร็จ|ใบแจ้งหนี้|บาท|฿|refund|payment|billing|invoice|charge/i;

export type PlatformCaseRow = CaseWithTenant & { urgent: boolean; assigneeName: string | null };

export function isUrgentCase(c: { category?: string | null; subject?: string | null }): boolean {
  return c.category === "billing" || MONEY_WORDS_RE.test(String(c.subject ?? ""));
}

function tabWhere(tab: CaseTab | undefined, puId: string): Prisma.SupportCaseWhereInput {
  switch (tab) {
    case "new":
      return { status: "OPEN", assigneePlatformUserId: null };
    case "waiting_shop":
      return { status: "PENDING" };
    case "mine":
      return { assigneePlatformUserId: puId, status: { not: "RESOLVED" } };
    case "closed":
      return { status: "RESOLVED" };
    default:
      return {};
  }
}

export async function listCasesForPlatform(
  pu: PlatformUser,
  opts?: { tab?: CaseTab; source?: string; category?: string; take?: number },
): Promise<PlatformCaseRow[]> {
  const me = requirePlatformRole(pu, ALL_PLATFORM_ROLES);
  const tab = (CASE_TABS as readonly string[]).includes(String(opts?.tab ?? "")) ? opts!.tab : undefined;
  const source = typeof opts?.source === "string" && opts.source ? opts.source.slice(0, 16) : undefined;
  const category = typeof opts?.category === "string" && opts.category ? opts.category.slice(0, 32) : undefined;
  const take = Math.min(Math.max(Math.floor(Number(opts?.take ?? 200)) || 200, 1), 500);
  const cases = await prisma.supportCase.findMany({
    where: { ...tabWhere(tab, me.id), ...(source ? { source } : {}), ...(category ? { category } : {}) },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take,
  });
  const tIds = [...new Set(cases.map((c) => c.tenantId))];
  const aIds = [...new Set(cases.map((c) => c.assigneePlatformUserId).filter((x): x is string => !!x))];
  const [tenants, assignees] = await Promise.all([
    tIds.length ? prisma.tenant.findMany({ where: { id: { in: tIds } }, select: { id: true, name: true } }) : [],
    aIds.length ? prisma.platformUser.findMany({ where: { id: { in: aIds } }, select: { id: true, name: true, email: true } }) : [],
  ]);
  const tName = new Map(tenants.map((t) => [t.id, t.name]));
  const aName = new Map(assignees.map((a) => [a.id, a.name || a.email]));
  return cases.map((c) => ({
    ...c,
    tenantName: tName.get(c.tenantId) ?? "—",
    urgent: isUrgentCase(c),
    assigneeName: c.assigneePlatformUserId ? (aName.get(c.assigneePlatformUserId) ?? "ทีมงาน") : null,
  }));
}

/** จำนวนเคสต่อแท็บ (ตัวเลขบนแท็บ H3) — 4 count */
export async function caseTabCounts(pu: PlatformUser): Promise<Record<CaseTab, number>> {
  const me = requirePlatformRole(pu, ALL_PLATFORM_ROLES);
  const [n, w, m, c] = await Promise.all(CASE_TABS.map((t) => prisma.supportCase.count({ where: tabWhere(t, me.id) })));
  return { new: n ?? 0, waiting_shop: w ?? 0, mine: m ?? 0, closed: c ?? 0 };
}

// ── S2.16 (จอ H4 "ระงับเลขาของร้าน") ▸ รุ่นแรก = ปิดการตอบเองนอกเวลา (`AiSettings.afterHoursReply=false`) + OpsEvent + audit ─────────
//   ยังไม่มีสวิตช์ระงับเลขาทั้งร้านจริง (ไม่มีคอลัมน์ · หนี้ S3) ⇒ ป้าย "ระงับแล้ว" อ่านจาก PlatformAuditLog ล่าสุด (suspend/resume)
//   audit detail เก็บค่าเดิมของ afterHoursReply ⇒ resume คืนค่าเดิมได้ · SUPER_ADMIN/SUPPORT เท่านั้น
const SEC_SUSPEND = "secretary.suspend";
const SEC_RESUME = "secretary.resume";

export async function suspendTenantSecretary(pu: PlatformUser, tenantId: string, caseId?: string): Promise<boolean> {
  const me = requirePlatformRole(pu, CASE_WRITE_ROLES);
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!t) return false;
  const prev = await prisma.aiSettings.findUnique({ where: { tenantId }, select: { afterHoursReply: true } });
  await prisma.$transaction([
    prisma.aiSettings.upsert({ where: { tenantId }, create: { tenantId, afterHoursReply: false }, update: { afterHoursReply: false } }),
    prisma.platformAuditLog.create({
      data: {
        platformUserId: me.id,
        action: SEC_SUSPEND,
        targetType: "Tenant",
        targetId: tenantId,
        detail: JSON.stringify({ afterHoursReplyBefore: prev?.afterHoursReply ?? false, caseId: caseId ?? null }),
      },
    }),
  ]);
  const { logOps } = await import("@/lib/core/ops");
  await logOps("WARN", "ai", `secretary.suspend: ทีมงานระงับเลขาของร้าน (ปิดตอบเองนอกเวลา)`, {
    tenantId,
    detail: `by ${me.id}${caseId ? ` · case ${caseId}` : ""}`,
  });
  return true;
}

export async function resumeTenantSecretary(pu: PlatformUser, tenantId: string): Promise<boolean> {
  const me = requirePlatformRole(pu, CASE_WRITE_ROLES);
  const last = await prisma.platformAuditLog.findFirst({
    where: { targetType: "Tenant", targetId: tenantId, action: { in: [SEC_SUSPEND, SEC_RESUME] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!last || last.action !== SEC_SUSPEND) return false;
  let before = false;
  try {
    before = (JSON.parse(last.detail ?? "{}") as { afterHoursReplyBefore?: unknown }).afterHoursReplyBefore === true;
  } catch {
    before = false;
  }
  await prisma.$transaction([
    ...(before ? [prisma.aiSettings.updateMany({ where: { tenantId }, data: { afterHoursReply: true } })] : []),
    prisma.platformAuditLog.create({ data: { platformUserId: me.id, action: SEC_RESUME, targetType: "Tenant", targetId: tenantId } }),
  ]);
  const { logOps } = await import("@/lib/core/ops");
  await logOps("INFO", "ai", "secretary.resume: ทีมงานยกเลิกการระงับเลขาของร้าน", { tenantId, detail: `by ${me.id}` });
  return true;
}

/** ชื่อ/อีเมลของทีมงาน 1 คน (ผู้รับเรื่องบนหน้าเคส) — ไม่มี = null */
export async function platformUserBrief(id: string): Promise<{ id: string; name: string | null; email: string } | null> {
  return id ? prisma.platformUser.findUnique({ where: { id }, select: { id: true, name: true, email: true } }) : null;
}

/** ระงับอยู่ไหม (audit ล่าสุดเป็น suspend) — คืนเวลาที่ระงับ หรือ null */
export async function tenantSecretarySuspendedAt(tenantId: string): Promise<Date | null> {
  const last = await prisma.platformAuditLog.findFirst({
    where: { targetType: "Tenant", targetId: tenantId, action: { in: [SEC_SUSPEND, SEC_RESUME] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { action: true, createdAt: true },
  });
  return last?.action === SEC_SUSPEND ? last.createdAt : null;
}

// เคสเดียว + บทสนทนา (สำหรับหน้ารายละเอียด backoffice) · S1.17: แถวเคสมี `source`/`category`/`roomId` (ห้องงานที่แนบ) ติดมาด้วย
export async function caseDetail(
  caseId: string,
): Promise<{ case: CaseWithTenant; messages: SupportMessage[] } | null> {
  const c = await prisma.supportCase.findUnique({ where: { id: caseId } });
  if (!c) return null;
  const [tenant, messages] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: c.tenantId }, select: { name: true } }),
    prisma.supportMessage.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } }),
  ]);
  return { case: { ...c, tenantName: tenant?.name ?? "—" }, messages };
}

// เปลี่ยนสถานะเคส (เช่น ปิดเคส = RESOLVED) + audit "support.status"
export async function setCaseStatus(
  pu: PlatformUser,
  caseId: string,
  status: SupportCaseStatus,
): Promise<boolean> {
  const c = await prisma.supportCase.findUnique({ where: { id: caseId } });
  if (!c) return false;
  await prisma.$transaction([
    prisma.supportCase.update({ where: { id: caseId }, data: { status } }),
    prisma.platformAuditLog.create({
      data: {
        platformUserId: pu.id,
        action: "support.status",
        targetType: "SupportCase",
        targetId: caseId,
        detail: status,
      },
    }),
  ]);
  return true;
}

// S1.17 (R-K12 · จอ H4 "รับเรื่อง") ▸ ทีมงานรับเรื่อง = ตั้งผู้รับเรื่องเป็นตัวเอง + audit "support.assign" · ไม่มีเคส = false ◂
// S2.16 ▸ เฉพาะ SUPER_ADMIN/SUPPORT (FINANCE ⇒ throw) · คืนค่าเดิม (boolean) ◂
export async function assignCase(pu: PlatformUser, caseId: string): Promise<boolean> {
  requirePlatformRole(pu, CASE_WRITE_ROLES);
  const c = await prisma.supportCase.findUnique({ where: { id: caseId }, select: { id: true } });
  if (!c) return false;
  await prisma.$transaction([
    prisma.supportCase.update({ where: { id: caseId }, data: { assigneePlatformUserId: pu.id } }),
    prisma.platformAuditLog.create({
      data: { platformUserId: pu.id, action: "support.assign", targetType: "SupportCase", targetId: caseId },
    }),
  ]);
  return true;
}

// แพลตฟอร์มตอบเคส → ตั้งสถานะ PENDING (ตอบแล้ว รอร้าน) + ผูก assignee
// S1.17 (R-K12) ▸ เคสที่เปิดจากแอป (`source = "APP"`) ไม่แทรกข้อความลงห้อง AI · push ถึงผู้แจ้งตามค่าตั้ง "ช่วยเหลือ"
//   (`notifyUser(..., "help")` · link /help/<caseId>) · เคสอื่น = เดิมทุกอย่าง · `deps.post` ฉีด transport ได้ (ทดสอบ) ◂
export async function addPlatformMessage(
  pu: PlatformUser,
  caseId: string,
  body: string,
  deps?: { post?: PushPost },
): Promise<boolean> {
  const c = await prisma.supportCase.findUnique({ where: { id: caseId } });
  if (!c) return false;
  const fromApp = c.source === "APP";
  await prisma.$transaction([
    prisma.supportMessage.create({
      data: { tenantId: c.tenantId, caseId, authorSide: "PLATFORM", authorId: pu.id, body },
    }),
    prisma.supportCase.update({
      where: { id: caseId },
      data: { status: "PENDING", assigneePlatformUserId: pu.id },
    }),
    // help-v2 (mobile): เคสที่ AI เปิดจากห้องแชท → เด้งคำตอบทีมงานกลับ session เดิม
    //   (ห้องจะขึ้น unread เองในแอปเพราะมี ASSISTANT ใหม่กว่า lastReadAt — อย่าแตะ lastReadAt) + ดันห้องขึ้นบนสุด
    ...(c.conversationId && !fromApp
      ? [
          prisma.aiMessage.create({
            data: {
              tenantId: c.tenantId,
              conversationId: c.conversationId,
              role: "ASSISTANT",
              content: `🛟 ทีมงาน: ${body}`,
            },
          }),
          prisma.aiConversation.update({
            where: { id: c.conversationId },
            data: { updatedAt: new Date() },
          }),
        ]
      : []),
  ]);

  // push เข้าเครื่องมือถือ — best-effort ห้ามพัง flow ตอบเคส
  // CRM C5.5-G3 (รีวิว G2-2) ▸ เดิมยิง **ทุกเครื่องในร้าน** (`sendPushToTenant`) พร้อมคำตอบของทีมงาน 80 ตัวอักษรบนจอล็อก
  //   ทั้งที่ห้องเปิดได้เฉพาะผู้สร้าง ⇒ ยิงเฉพาะคนที่เปิดห้องนั้นได้: ผู้สร้างห้อง (จากรหัสห้อง) · ห้องรุ่นเดิม/ของคีย์/งานภายใน
  //   = เจ้าของร้าน (OWNER ที่ยืนยันแล้ว) ตามกติกาการมองเห็นห้อง (lib/ai/conversation-owner.ts) ◂
  if (fromApp) {
    try {
      // ผู้แจ้งต้องยังเป็นสมาชิกของร้านนี้ (ออกจากร้านแล้ว = ไม่ยิงข้อความของทีมงานไปที่จอล็อก)
      const stillMember =
        (await prisma.membership.count({ where: { tenantId: c.tenantId, userId: c.openedByUserId, acceptedAt: { not: null } } })) > 0;
      if (stillMember) {
        const { notifyUser } = await import("@/lib/ai/secretary/notify");
        await notifyUser(
          c.openedByUserId,
          c.tenantId,
          "help",
          { title: "ทีมงานตอบกลับแล้ว", body: body.slice(0, 80), data: { link: `/help/${c.id}`, caseId: c.id } },
          deps?.post ? { post: deps.post } : undefined,
        );
      }
    } catch {
      // push พัง → เงียบ (เคสถูกบันทึกแล้ว)
    }
  } else if (c.conversationId) {
    try {
      const { sendPushToUsers } = await import("@/lib/core/push");
      const { conversationCreatorOf } = await import("@/lib/ai/conversation-owner");
      const creator = conversationCreatorOf(c.conversationId);
      const recipients =
        creator?.kind === "member"
          ? // ผู้สร้างต้องยังเป็นสมาชิกของร้านนี้ (ออกจากร้านแล้ว = ไม่ยิง)
            (await prisma.membership.count({ where: { tenantId: c.tenantId, userId: creator.id, acceptedAt: { not: null } } })) > 0
            ? [creator.id]
            : []
          : (
              await prisma.membership.findMany({
                where: { tenantId: c.tenantId, role: "OWNER", acceptedAt: { not: null } },
                select: { userId: true },
              })
            ).map((m) => m.userId);
      await sendPushToUsers(c.tenantId, recipients, {
        title: "ทีมงานตอบกลับแล้ว",
        body: body.slice(0, 80),
        data: { conversationId: c.conversationId },
      }, deps?.post ? { post: deps.post } : undefined);
    } catch {
      // push พัง → เงียบ (เคสถูกบันทึกแล้ว)
    }
  }
  return true;
}

// ระงับร้าน (SUPER_ADMIN) → SUSPENDED + audit "tenant.suspend"
export async function suspendTenant(
  pu: PlatformUser,
  tenantId: string,
  reason: string,
): Promise<boolean> {
  requirePlatformRole(pu, ["SUPER_ADMIN"]);
  await prisma.$transaction([
    prisma.tenant.update({ where: { id: tenantId }, data: { status: "SUSPENDED" } }),
    prisma.platformAuditLog.create({
      data: {
        platformUserId: pu.id,
        action: "tenant.suspend",
        targetType: "Tenant",
        targetId: tenantId,
        detail: reason,
      },
    }),
  ]);
  return true;
}

// เปิดใช้ร้านอีกครั้ง (SUPER_ADMIN) → ACTIVE + audit "tenant.reactivate"
export async function reactivateTenant(pu: PlatformUser, tenantId: string): Promise<boolean> {
  requirePlatformRole(pu, ["SUPER_ADMIN"]);
  await prisma.$transaction([
    prisma.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } }),
    prisma.platformAuditLog.create({
      data: {
        platformUserId: pu.id,
        action: "tenant.reactivate",
        targetType: "Tenant",
        targetId: tenantId,
      },
    }),
  ]);
  return true;
}

// ประวัติการกระทำล่าสุดที่มีต่อร้านนี้ (แสดงในหน้ารายละเอียดร้าน)
export async function listTenantAudit(tenantId: string, take = 10): Promise<PlatformAuditLog[]> {
  return prisma.platformAuditLog.findMany({
    where: { targetType: "Tenant", targetId: tenantId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
