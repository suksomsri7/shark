// ช่องรับเงินของร้าน (PaymentProfile) — ฝั่งร้าน tenant-scoped ผ่าน tenantDb
// PromptPay v1: ร้านตั้งเบอร์/เลขบัตรของตัวเอง → แอปสร้าง QR ให้ลูกค้าโอน
// ทุก query ผ่าน tenantDb({ tenantId }) → inject tenantId อัตโนมัติ (kernel guard)
// ร้านอื่นมองไม่เห็น (findUnique ข้ามร้าน → null)

import type { PaymentProfile } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { isValidPromptPayId } from "./promptpay";

type Ctx = { tenantId: string };

// อ่านช่องรับเงินของร้านนี้ (ยังไม่ตั้ง → null)
export async function getPaymentProfile(ctx: Ctx): Promise<PaymentProfile | null> {
  return tenantDb(ctx).paymentProfile.findUnique({ where: { tenantId: ctx.tenantId } });
}

// ตั้ง/แก้ช่องรับเงิน — validate promptpayId ผ่าน lib กลางก่อน (เพี้ยน → throw ไทย)
// upsert: มีอยู่แล้วทับ · ยังไม่มีสร้างใหม่ (ใส่ tenantId ตรง ๆ ให้ type ผ่าน)
export async function savePaymentProfile(
  ctx: Ctx,
  input: { promptpayId: string; displayName?: string },
): Promise<PaymentProfile> {
  const promptpayId = (input.promptpayId ?? "").trim();
  if (!isValidPromptPayId(promptpayId)) {
    throw new Error("PromptPay ID ไม่ถูกต้อง — ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก");
  }
  const displayName = input.displayName?.trim() || null;
  // upsert เอง (findUnique→update/create) — kernel guard ห่อ where ของ upsert ด้วย AND
  // ทำให้ไม่มี unique field ที่ระดับบนสุด (Prisma โยน) จึงแยกขั้นตอน
  const db = tenantDb(ctx);
  const existing = await db.paymentProfile.findUnique({ where: { tenantId: ctx.tenantId } });
  if (existing) {
    return db.paymentProfile.update({
      where: { tenantId: ctx.tenantId },
      data: { promptpayId, displayName },
    });
  }
  return db.paymentProfile.create({
    data: { tenantId: ctx.tenantId, promptpayId, displayName },
  });
}
