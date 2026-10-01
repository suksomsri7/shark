// ช่องรับเงินของร้าน (PaymentProfile) — ฝั่งร้าน tenant-scoped ผ่าน tenantDb
// PromptPay v1: ร้านตั้งเบอร์/เลขบัตรของตัวเอง → แอปสร้าง QR ให้ลูกค้าโอน
// ทุก query ผ่าน tenantDb({ tenantId }) → inject tenantId อัตโนมัติ (kernel guard)
// ร้านอื่นมองไม่เห็น (findUnique ข้ามร้าน → null)

import type { PaymentProfile, Role } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { tenantDb } from "@/lib/core/db";
import { isValidPromptPayId } from "./promptpay";

type Ctx = { tenantId: string };

/**
 * 🔴 HOTFIX 2026-10-01 (ledger/wo-notes/hotfix-sanitize-2026-10-01.md · Item 3) — ใครแก้ช่องรับเงินของร้านได้
 *    PromptPay ID นี้คือปลายทางเงินของ QR หน้าร้าน/ร้านออนไลน์/ตั๋ว/ค่าเรียน ⇒ เดิมพนักงานทุกคน (แค่อยู่ในร้าน) เปลี่ยนได้
 *    = เบนเงินลูกค้าเข้าบัญชีตัวเอง · ทะเบียนสิทธิ์ไม่มีคีย์ของเรื่องนี้ ⇒ ตามบทบาท: OWNER + MANAGER (ทะเบียนกำหนดให้
 *    MANAGER "ผ่านทุกอย่าง" ระดับร้านอยู่แล้ว — webhook/API key/แบรนด์ก็เช่นกัน) · STAFF ไม่ได้ไม่ว่าจะติ๊กสิทธิ์อะไร
 */
export function canManagePaymentProfile(m: { role: Role | string } | null | undefined): boolean {
  return m?.role === "OWNER" || m?.role === "MANAGER";
}

/** PromptPay ID สำหรับ AuditLog — เห็นแค่ 4 ตัวท้าย */
export function maskPromptPayId(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v);
  return s.length <= 4 ? "*".repeat(s.length) : `${"*".repeat(s.length - 4)}${s.slice(-4)}`;
}

// อ่านช่องรับเงินของร้านนี้ (ยังไม่ตั้ง → null)
export async function getPaymentProfile(ctx: Ctx): Promise<PaymentProfile | null> {
  return tenantDb(ctx).paymentProfile.findUnique({ where: { tenantId: ctx.tenantId } });
}

// ตั้ง/แก้ช่องรับเงิน — validate promptpayId ผ่าน lib กลางก่อน (เพี้ยน → throw ไทย)
// upsert: มีอยู่แล้วทับ · ยังไม่มีสร้างใหม่ (ใส่ tenantId ตรง ๆ ให้ type ผ่าน)
export async function savePaymentProfile(
  ctx: Ctx & { actorUserId?: string | null },
  input: { promptpayId: string; displayName?: string },
): Promise<PaymentProfile> {
  const promptpayId = (input.promptpayId ?? "").trim();
  if (!isValidPromptPayId(promptpayId)) {
    throw new Error("PromptPay ID ไม่ถูกต้อง — ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก");
  }
  const displayName = input.displayName?.trim() || null;
  // upsert เอง (findUnique→update/create) — kernel guard ห่อ where ของ upsert ด้วย AND
  // ทำให้ไม่มี unique field ที่ระดับบนสุด (Prisma โยน) จึงแยกขั้นตอน
  const db = tenantDb({ tenantId: ctx.tenantId });
  const existing = await db.paymentProfile.findUnique({ where: { tenantId: ctx.tenantId } });
  const row = existing
    ? await db.paymentProfile.update({ where: { tenantId: ctx.tenantId }, data: { promptpayId, displayName } })
    : await db.paymentProfile.create({ data: { tenantId: ctx.tenantId, promptpayId, displayName } });
  // 🔴 HOTFIX 2026-10-01: ทุกการเปลี่ยนปลายทางเงินมีร่องรอย (เลขเห็นแค่ 4 ตัวท้าย) — บันทึกซ้ำค่าเดิม = ไม่เขียน
  if (!existing || existing.promptpayId !== row.promptpayId || existing.displayName !== row.displayName) {
    await writeAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.actorUserId ?? null,
      action: "payment.profile.update",
      targetType: "PaymentProfile",
      targetId: row.id,
      before: existing ? { promptpayId: maskPromptPayId(existing.promptpayId), displayName: existing.displayName } : null,
      after: { promptpayId: maskPromptPayId(row.promptpayId), displayName: row.displayName },
    });
  }
  return row;
}
