// บิลแพลตฟอร์ม (PlatformInvoice) — ฝั่ง backoffice · อ่าน/เขียนข้ามร้าน → prisma ตรง
// เช่น ค่าบริการ custom domain 1,500฿/ปี ที่แพลตฟอร์มเรียกเก็บจากร้าน
// เฉพาะ SUPER_ADMIN / FINANCE (requirePlatformRole → throw ถ้าไม่ผ่าน)
// ทุก mutation บันทึก PlatformAuditLog ใน $transaction เดียวกัน (append-only)

import type { PlatformInvoice, PlatformInvoiceStatus, PlatformUser } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { requirePlatformRole } from "./auth";

const BILLING_ROLES = ["SUPER_ADMIN", "FINANCE"] as const;

export type InvoiceWithTenant = PlatformInvoice & { tenantName: string };

// สร้างบิลใหม่ (สถานะ PENDING) + audit "billing.create"
export async function createInvoice(
  pu: PlatformUser,
  input: { tenantId: string; title: string; amountSatang: number; dueAt?: Date | null; note?: string | null },
): Promise<PlatformInvoice> {
  requirePlatformRole(pu, [...BILLING_ROLES]);
  const inv = await prisma.platformInvoice.create({
    data: {
      tenantId: input.tenantId,
      title: input.title,
      amountSatang: input.amountSatang,
      dueAt: input.dueAt ?? null,
      note: input.note ?? null,
    },
  });
  await prisma.platformAuditLog.create({
    data: {
      platformUserId: pu.id,
      action: "billing.create",
      targetType: "PlatformInvoice",
      targetId: inv.id,
      detail: input.title,
    },
  });
  return inv;
}

// รับชำระ — PENDING → PAID + paidAt + audit "billing.paid"
// ไม่พบ หรือ ไม่ใช่ PENDING (จ่าย/ยกเลิกไปแล้ว) → false
export async function markInvoicePaid(pu: PlatformUser, invoiceId: string): Promise<boolean> {
  requirePlatformRole(pu, [...BILLING_ROLES]);
  const inv = await prisma.platformInvoice.findUnique({ where: { id: invoiceId } });
  if (!inv || inv.status !== "PENDING") return false;
  await prisma.$transaction([
    prisma.platformInvoice.update({
      where: { id: invoiceId },
      data: { status: "PAID", paidAt: new Date() },
    }),
    prisma.platformAuditLog.create({
      data: {
        platformUserId: pu.id,
        action: "billing.paid",
        targetType: "PlatformInvoice",
        targetId: invoiceId,
      },
    }),
  ]);
  return true;
}

// ยกเลิกบิล — PENDING → VOID + audit "billing.void"
// ไม่พบ หรือ ไม่ใช่ PENDING (จ่าย/ยกเลิกไปแล้ว) → false
export async function voidInvoice(pu: PlatformUser, invoiceId: string): Promise<boolean> {
  requirePlatformRole(pu, [...BILLING_ROLES]);
  const inv = await prisma.platformInvoice.findUnique({ where: { id: invoiceId } });
  if (!inv || inv.status !== "PENDING") return false;
  await prisma.$transaction([
    prisma.platformInvoice.update({ where: { id: invoiceId }, data: { status: "VOID" } }),
    prisma.platformAuditLog.create({
      data: {
        platformUserId: pu.id,
        action: "billing.void",
        targetType: "PlatformInvoice",
        targetId: invoiceId,
      },
    }),
  ]);
  return true;
}

// รายการบิล (ใหม่→เก่า) + ชื่อร้านประกอบ · กรองสถานะ/ร้านได้
export async function listInvoices(filter?: {
  status?: PlatformInvoiceStatus;
  tenantId?: string;
}): Promise<InvoiceWithTenant[]> {
  const invoices = await prisma.platformInvoice.findMany({
    where: {
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.tenantId ? { tenantId: filter.tenantId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  const ids = [...new Set(invoices.map((i) => i.tenantId))];
  const tenants = ids.length
    ? await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(tenants.map((t) => [t.id, t.name]));
  return invoices.map((i) => ({ ...i, tenantName: nameById.get(i.tenantId) ?? "—" }));
}
