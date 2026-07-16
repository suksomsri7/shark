"use server";

// ช่องรับเงิน + บิลแพลตฟอร์ม — server actions ฝั่งร้าน (WO-0023)
// tenantId ดึงจาก session (requireTenant) เท่านั้น — ห้ามรับจาก client (กันร้านปลอมเป็นอีกร้าน)

import type { PlatformInvoiceStatus } from "@prisma/client";
import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { savePaymentProfile } from "./service";

export type SavePaymentState =
  | { status: "idle" }
  | { status: "ok"; promptpayId: string; displayName: string | null }
  | { status: "error"; message: string };

// บันทึกช่องรับเงิน (PromptPay ID + ชื่อบัญชี)
export async function savePaymentProfileAction(
  _prev: SavePaymentState,
  formData: FormData,
): Promise<SavePaymentState> {
  const auth = await requireTenant();
  const promptpayId = String(formData.get("promptpayId") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!promptpayId) return { status: "error", message: "กรุณากรอก PromptPay ID (เบอร์มือถือหรือเลขบัตรประชาชน)" };
  try {
    const p = await savePaymentProfile(
      { tenantId: auth.active.tenantId },
      { promptpayId, displayName },
    );
    return { status: "ok", promptpayId: p.promptpayId ?? promptpayId, displayName: p.displayName };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
  }
}

export type MyInvoiceView = {
  id: string;
  title: string;
  amountSatang: number;
  status: PlatformInvoiceStatus;
  dueAt: Date | null;
  paidAt: Date | null;
  note: string | null;
  createdAt: Date;
};

// บิลที่แพลตฟอร์มเรียกเก็บจากร้านนี้ (เห็นเฉพาะของตัวเอง — tenantDb inject tenantId)
export async function listMyInvoicesAction(): Promise<MyInvoiceView[]> {
  const auth = await requireTenant();
  const rows = await tenantDb({ tenantId: auth.active.tenantId }).platformInvoice.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    amountSatang: r.amountSatang,
    status: r.status,
    dueAt: r.dueAt,
    paidAt: r.paidAt,
    note: r.note,
    createdAt: r.createdAt,
  }));
}
