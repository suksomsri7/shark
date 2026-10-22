// slip-targets.ts — POS P3-SKEL U ▸ CD-SKELU-2: ตัวอ่านอย่างเดียว "แถวชำระที่แนบสลิปได้" ของบิลหนึ่งใบ (จอสำเร็จ 02b · ลิ้นชักบิล 12)
//
// ทำไมต้องมี: attachSlip (payment-slip.ts) ต้องการ paymentId แต่ทั้งผล submit และ bill.payments ไม่มี id ของแถวชำระ
//   ⇒ ตัวอ่านนี้แค่ "จับคู่" แถว TRANSFER/PROMPTPAY ของบิล SALE ในสาขานี้ → {paymentId, type, amountSatang} + สลิปของบิล {slipId, paymentId, amountSatang (ยอดที่พิมพ์)}
// 🔴 อ่านอย่างเดียว ไม่เขียน ไม่คิดเงิน · select เฉพาะ id/type/ยอด (ไม่มีชื่อผู้แนบ/ผู้จ่าย/ไฟล์/เลขอ้างอิง/หมายเหตุ)
// 🔴 สิทธิ์: pos.sale.read หรือ pos.sale.create ที่สาขา (กติกาเดียวกับ slipViewerUrl) · บิลของสาขา/ร้านอื่น = SALE_NOT_FOUND
// คำปฏิเสธ "คืน" เป็นข้อมูล {ok:false, code, message, messageKey} เสมอ — ไม่โยน (คีย์ใต้ pos.platform.slip.errors.*)
import { evaluate } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { prisma } from "./db";

export type SlipTargetRow = { paymentId: string; type: "TRANSFER" | "PROMPTPAY"; amountSatang: number };
export type SlipTargetSlip = { slipId: string; paymentId: string | null; amountSatang: number | null };
export type SlipTargetsRefusal = { ok: false; code: "NOT_FOUND" | "SALE_NOT_FOUND" | "PERMISSION_DENIED" | "UNKNOWN"; message: string; messageKey: string };
export type SlipTargetsResult = { ok: true; saleId: string; targets: SlipTargetRow[]; slips: SlipTargetSlip[] } | SlipTargetsRefusal;
type Ctx = { tenantId: string; systemId: string; unitId: string };
type Actor = { userId: string; role: string; unitAccess?: unknown; permissions?: unknown };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const MSG = {
  NOT_FOUND: ["ไม่พบจุดขายนี้", "platform.slip.errors.notFound"],
  SALE_NOT_FOUND: ["ไม่พบบิลนี้ในสาขานี้", "platform.slip.errors.saleNotFound"],
  PERMISSION_DENIED: ["ไม่มีสิทธิ์ดูบิลของสาขานี้", "platform.slip.errors.permissionDenied"],
  UNKNOWN: ["เกิดข้อผิดพลาด — ลองอีกครั้ง", "platform.slip.errors.unknown"],
} as const;
const refuse = (code: SlipTargetsRefusal["code"]): SlipTargetsRefusal => ({ ok: false, code, message: MSG[code][0], messageKey: MSG[code][1] });

/** แถวชำระโอน/พร้อมเพย์ของบิล + สลิปของบิล (อ่านอย่างเดียว) */
export async function slipTargets(ctx: Ctx, actor: Actor, input: unknown): Promise<SlipTargetsResult> {
  try {
    if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isId(ctx.unitId)) return refuse("NOT_FOUND");
    const a: unknown = actor;
    const m = isRecord(a) && typeof a.role === "string" && typeof a.userId === "string" ? posMembership(a as Parameters<typeof posMembership>[0]) : null;
    if (!m || !(evaluate(m, { module: "pos", action: "pos.sale.read", unitId: ctx.unitId }) || evaluate(m, { module: "pos", action: "pos.sale.create", unitId: ctx.unitId }))) return refuse("PERMISSION_DENIED");
    const saleId = isRecord(input) ? input.saleId : undefined;
    if (!isId(saleId)) return refuse("SALE_NOT_FOUND");
    const sale = await prisma.posSale.findFirst({ where: { id: saleId, tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: ctx.unitId, docType: "SALE" }, select: { id: true } });
    if (!sale) return refuse("SALE_NOT_FOUND");
    const [pays, slips] = await Promise.all([
      prisma.posPayment.findMany({ where: { saleId: sale.id, tenantId: ctx.tenantId, type: { in: ["TRANSFER", "PROMPTPAY"] } }, select: { id: true, type: true, amountSatang: true }, orderBy: { id: "asc" } }),
      prisma.posPaymentSlip.findMany({ where: { tenantId: ctx.tenantId, saleId: sale.id }, select: { id: true, paymentId: true, amountSatang: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    ]);
    return {
      ok: true,
      saleId: sale.id,
      targets: pays.map((p) => ({ paymentId: p.id, type: p.type as SlipTargetRow["type"], amountSatang: p.amountSatang })),
      slips: slips.map((s) => ({ slipId: s.id, paymentId: s.paymentId, amountSatang: s.amountSatang })),
    };
  } catch (e) {
    console.error("[pos/slip-targets] read", e instanceof Error ? e.name : "error");
    return refuse("UNKNOWN");
  }
}
