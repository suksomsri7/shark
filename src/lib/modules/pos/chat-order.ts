// chat-order.ts — ประตู A "ขอชำระในแชท" ฝั่ง POS (P3.7 S · R7 · มติผู้คุม 1 3 · CD-P2 CD-P5) — ผู้ประสานงาน (ไม่เขียน PosOrder* เอง)
//
// ลำดับ (แบบ P2.7 F6): สิทธิ์ (pos.sale.create ∧ pos.order.accept) → ออเดอร์ของสาขา → ขอซ้ำ = ผลเดิม (ไม่เตรียมใบใหม่) →
//   เตรียมใบ prepareOrderIntent **นอกธุรกรรม** (Beam ถ้าร้านเปิด · ไม่งั้น QR พร้อมเพย์นิ่งของสาขา) → ธุรกรรม: order.requestChatPaymentInTx
//   (ผู้เขียนเดียว) → ปฏิเสธ/ซ้ำ = orderIntentUnused (Beam charge ที่ไม่ได้ใช้ลง ops) · ส่งข้อความในห้อง = composition root (POS ไม่รู้จักแชท)
// 🔴 ไม่ถูกปิดด้วยสวิตช์แชท (CD-P5: พนักงานกดเอง) · รหัสใหม่ NO_CHAT_LINK / PROMPTPAY_NOT_CONFIGURED มี messageKey orders.chatPay.errors.* (CD-P2)
// 🔴 คืนคำปฏิเสธเป็นข้อมูล ไม่ throw
import { writeAudit } from "@/lib/core/audit";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { prisma } from "./db";
import { requestChatPaymentInTx } from "./order";
import { orderIntentUnused, prepareOrderIntent, type PaymentIntentDeps, type PreparedOrderIntent } from "./payment-intent";
import type { RegisterActor, RegisterCtx } from "./register-shared";

export type ChatPaymentCode = "NOT_FOUND" | "PERMISSION_DENIED" | "VALIDATION" | "ORDER_NOT_FOUND" | "ORDER_STATE_INVALID" | "ORDER_STATE_CHANGED" | "NO_CHAT_LINK" | "PROMPTPAY_NOT_CONFIGURED" | "INTERNAL";
export type ChatPaymentRefusal = { ok: false; code: ChatPaymentCode; message: string; messageKey?: string };
export type ChatPaymentPosResult =
  | { ok: true; orderId: string; intentId: string; duplicated: boolean; conversationId: string; code: string; totalSatang: number; payBy: string; publicToken: string }
  | ChatPaymentRefusal;

const MSG: Record<ChatPaymentCode, string> = {
  NOT_FOUND: "ไม่พบสาขานี้ หรือบัญชีนี้เข้าสาขานี้ไม่ได้",
  PERMISSION_DENIED: "ส่งลิงก์ชำระในแชทต้องมีสิทธิ์ขายและรับออเดอร์ — ขอสิทธิ์จากเจ้าของร้าน",
  VALIDATION: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
  ORDER_NOT_FOUND: "ไม่พบออเดอร์นี้ในสาขานี้",
  ORDER_STATE_INVALID: "ส่งลิงก์ชำระได้เฉพาะออเดอร์แชทใหม่ที่ยังไม่ได้จ่าย",
  ORDER_STATE_CHANGED: "ออเดอร์นี้เพิ่งถูกเปลี่ยนจากอีกเครื่อง — ดูสถานะล่าสุดก่อน",
  NO_CHAT_LINK: "ออเดอร์นี้ไม่ได้ผูกกับห้องแชท — ส่งลิงก์ชำระในแชทไม่ได้",
  PROMPTPAY_NOT_CONFIGURED: "สาขานี้ยังไม่ได้ตั้งพร้อมเพย์ — ตั้งที่หน้าตั้งค่าการรับเงินก่อน",
  INTERNAL: "ระบบขัดข้องชั่วคราว — ลองอีกครั้ง",
};
const KEY: Partial<Record<ChatPaymentCode, string>> = {
  NO_CHAT_LINK: "orders.chatPay.errors.noChatLink",
  PROMPTPAY_NOT_CONFIGURED: "orders.chatPay.errors.promptpayNotConfigured",
  ORDER_STATE_INVALID: "orders.chatPay.errors.stateInvalid",
};
const refuse = (code: ChatPaymentCode): ChatPaymentRefusal => ({ ok: false, code, message: MSG[code], ...(KEY[code] ? { messageKey: KEY[code] } : {}) });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");

function actorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId) || (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF")) return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string") || !isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}

/** R7 ประตู A — ออเดอร์ CHAT (NEW · ยังไม่จ่าย · ผูกห้อง) → รอชำระ + ใบขอรับเงิน + ลิงก์หน้าสถานะ (ผู้ส่งข้อความ = root) */
export async function requestChatPayment(ctx: RegisterCtx, actorRaw: RegisterActor, input: { orderId: string }, deps?: PaymentIntentDeps): Promise<ChatPaymentPosResult> {
  try {
    if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isId(ctx.unitId)) return refuse("NOT_FOUND");
    const actor = actorOf(actorRaw);
    if (!actor) return refuse("PERMISSION_DENIED");
    const s = { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: ctx.unitId };
    const [sys, unit, link] = await Promise.all([
      prisma.appSystem.findFirst({ where: { id: s.systemId, tenantId: s.tenantId, type: "POS", active: true }, select: { id: true } }),
      prisma.businessUnit.findFirst({ where: { id: s.unitId, tenantId: s.tenantId, status: { not: "ARCHIVED" } }, select: { id: true } }),
      prisma.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId: s.tenantId, unitId: s.unitId, type: "POS" } }, select: { systemId: true } }),
    ]);
    if (!sys || !unit || link?.systemId !== s.systemId || !canAccessUnit(actor, s.unitId)) return refuse("NOT_FOUND");
    if (!evaluate(actor, { module: "pos", action: "pos.sale.create", unitId: s.unitId }) || !evaluate(actor, { module: "pos", action: "pos.order.accept", unitId: s.unitId })) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || Object.keys(input).some((k) => k !== "orderId" && input[k as keyof typeof input] !== undefined)) return refuse("VALIDATION");
    if (!isId(input.orderId)) return refuse("ORDER_NOT_FOUND");
    const o = await prisma.posOrder.findFirst({ where: { id: input.orderId, tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId }, select: { id: true, totalSatang: true } });
    if (!o) return refuse("ORDER_NOT_FOUND");

    // ขอซ้ำ (ไม่ล็อก — ตัดสินซ้ำในธุรกรรม) ⇒ ไม่เตรียมใบใหม่ · ไม่ใช่ซ้ำ = เตรียมใบนอกธุรกรรม
    const first = await prisma.$transaction((tx) => requestChatPaymentInTx(tx, s, { orderId: o.id, prepared: null, actorUserId: actor.userId }), { timeout: 30_000, maxWait: 15_000 });
    let r = first;
    let prepared: PreparedOrderIntent | null = null;
    if (!first.ok && first.code === "INTENT_REQUIRED") {
      const prep = await prepareOrderIntent(s, o.totalSatang, deps);
      if (!prep.ok) return refuse(prep.code === "PROMPTPAY_NOT_CONFIGURED" ? "PROMPTPAY_NOT_CONFIGURED" : prep.code === "NOT_FOUND" ? "NOT_FOUND" : "INTERNAL");
      prepared = prep.prepared;
      try {
        r = await prisma.$transaction((tx) => requestChatPaymentInTx(tx, s, { orderId: o.id, prepared, actorUserId: actor.userId }), { timeout: 30_000, maxWait: 15_000 });
      } catch (e) {
        await orderIntentUnused(s, prepared, "INGEST_FAILED");
        throw e;
      }
      if (!r.ok || r.duplicated) await orderIntentUnused(s, prepared, r.ok ? "DUPLICATE" : "REFUSED");
    }
    if (!r.ok) return refuse(r.code === "INTENT_REQUIRED" ? "ORDER_STATE_CHANGED" : r.code);
    const ord = r.order;
    if (!ord.payBy || !ord.publicToken || !ord.chatConversationId) return refuse("ORDER_STATE_INVALID");
    if (!r.duplicated)
      await writeAudit({ tenantId: s.tenantId, actorId: actor.userId, action: "pos.order.chat_payment_requested", targetType: "PosOrder", targetId: ord.id, after: { orderId: ord.id, intentId: r.intentId, payBy: ord.payBy.toISOString() } });
    return { ok: true, orderId: ord.id, intentId: r.intentId, duplicated: r.duplicated, conversationId: ord.chatConversationId, code: ord.code, totalSatang: ord.totalSatang, payBy: ord.payBy.toISOString(), publicToken: ord.publicToken };
  } catch (e) {
    console.error("[pos/chat-order] requestChatPayment INTERNAL", e instanceof Error ? e.name : "Error");
    return refuse("INTERNAL");
  }
}
