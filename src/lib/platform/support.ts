// Support Desk + ระงับร้าน — ฝั่งแพลตฟอร์ม (WO-0021)
// อ่าน/เขียนข้ามร้าน → ใช้ base client (prisma) ตรง ไม่ใช่ tenantDb
// การกระทำสำคัญบันทึก PlatformAuditLog (append-only) เสมอ
// ระงับ/เปิดร้าน = SUPER_ADMIN เท่านั้น (requirePlatformRole → throw ถ้าไม่ผ่าน)

import type {
  PlatformAuditLog,
  PlatformUser,
  SupportCase,
  SupportCaseStatus,
  SupportMessage,
} from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { requirePlatformRole } from "./auth";

export type CaseWithTenant = SupportCase & { tenantName: string };

// เคสทุกร้าน (กรองสถานะได้) — ความเคลื่อนไหวล่าสุดก่อน + ชื่อร้านประกอบ
export async function listAllCases(filter?: {
  status?: SupportCaseStatus;
}): Promise<CaseWithTenant[]> {
  const cases = await prisma.supportCase.findMany({
    where: filter?.status ? { status: filter.status } : undefined,
    orderBy: { updatedAt: "desc" },
  });
  const ids = [...new Set(cases.map((c) => c.tenantId))];
  const tenants = ids.length
    ? await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(tenants.map((t) => [t.id, t.name]));
  return cases.map((c) => ({ ...c, tenantName: nameById.get(c.tenantId) ?? "—" }));
}

// เคสเดียว + บทสนทนา (สำหรับหน้ารายละเอียด backoffice)
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

// แพลตฟอร์มตอบเคส → ตั้งสถานะ PENDING (ตอบแล้ว รอร้าน) + ผูก assignee
export async function addPlatformMessage(
  pu: PlatformUser,
  caseId: string,
  body: string,
): Promise<boolean> {
  const c = await prisma.supportCase.findUnique({ where: { id: caseId } });
  if (!c) return false;
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
    ...(c.conversationId
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
