// slip-verify.ts — ตรวจสลิปอัตโนมัติ (P3-SKEL R8 · มติ §10-3) — โครง: ผู้ให้บริการทุกตัว NOT_CONFIGURED · สลิปไม่เปลี่ยน
// รายชื่อสำหรับเจ้าของเลือกหลังเทียบราคา (W20): API ตรวจสลิปไทย (SlipOK · EasySlip) หรือ API ตรวจสลิปของธนาคาร (SCB/KBank)
// 🔴 เมื่อเปิดจริง สลิปที่ผ่านอาจเรียก markIntentPaid(via "SLIP") = เส้นเงิน ⇒ ใบแยก + hunter (ไม่ใช่ใบนี้)
import { evaluate } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { prisma } from "./db";

export type SlipVerifyRefusal = { ok: false; code: "NOT_CONFIGURED" | "PERMISSION_DENIED" | "NOT_FOUND" | "UNKNOWN"; message: string };
export type SlipVerifyProvider = {
  code: string;
  label: string;
  ready: false;
  requiredFields: readonly { name: string; secret: boolean; required: boolean; label: string }[];
  verify: (slip: unknown, creds: unknown) => Promise<SlipVerifyRefusal>;
};

const pending = (label: string): SlipVerifyRefusal => ({ ok: false, code: "NOT_CONFIGURED", message: `${label}: ยังไม่ได้เชื่อมผู้ให้บริการตรวจสลิป — รอ credentials จากเจ้าของ (W4/W20)` });
const skeleton = (code: string, label: string, requiredFields: SlipVerifyProvider["requiredFields"]): SlipVerifyProvider => ({ code, label, ready: false, requiredFields, verify: async () => pending(label) });

/** ทะเบียนผู้ให้บริการตรวจสลิป (โครง) — ⚠️ ชื่อฟิลด์เป็นตัวแทน ผู้ให้บริการที่เลือกยืนยันชื่อจริง */
export const SLIP_VERIFY_PROVIDERS: Readonly<Record<string, SlipVerifyProvider>> = Object.freeze({
  SLIPOK: skeleton("SLIPOK", "SlipOK", [
    { name: "api_key", secret: true, required: true, label: "API key" },
    { name: "branch_id", secret: false, required: true, label: "Branch ID" },
  ]),
  EASYSLIP: skeleton("EASYSLIP", "EasySlip", [{ name: "api_key", secret: true, required: true, label: "API key" }]),
});

export function slipVerifyProvider(code: unknown): SlipVerifyProvider | null {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(SLIP_VERIFY_PROVIDERS, code) ? SLIP_VERIFY_PROVIDERS[code]! : null;
}

type Ctx = { tenantId: string; systemId: string; unitId: string };
type Actor = { userId: string; role: string; unitAccess?: unknown; permissions?: unknown };
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** ตรวจสลิปกับผู้ให้บริการ — โครง: ผู้มี pos.shift.manage ที่สาขา · สลิปของสาขานี้ · ตอบ NOT_CONFIGURED เสมอ (ไม่เขียนอะไร) */
export async function verifySlip(ctx: Ctx, actor: Actor, input: { slipId?: unknown }): Promise<SlipVerifyRefusal> {
  try {
    if (!isRecord(ctx) || typeof ctx.tenantId !== "string" || typeof ctx.unitId !== "string") return { ok: false, code: "NOT_FOUND", message: "ไม่พบสลิป" };
    const m = isRecord(actor) && typeof actor.role === "string" ? posMembership(actor as Parameters<typeof posMembership>[0]) : null;
    if (!m || !evaluate(m, { module: "pos", action: "pos.shift.manage", unitId: ctx.unitId })) return { ok: false, code: "PERMISSION_DENIED", message: "ต้องเป็นผู้จัดการกะของสาขานี้" };
    const slipId = isRecord(input) && typeof input.slipId === "string" ? input.slipId : "";
    const slip = slipId ? await prisma.posPaymentSlip.findFirst({ where: { id: slipId, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { id: true } }) : null;
    if (!slip) return { ok: false, code: "NOT_FOUND", message: "ไม่พบสลิป" };
    return pending("ตรวจสลิปอัตโนมัติ");
  } catch (e) {
    console.error("[pos/slip-verify] verifySlip", e);
    return { ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
  }
}
