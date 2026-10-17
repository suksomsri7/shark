// pos-chat-bridges.ts — composition root ของ POS ↔ แชท (P3.7 S · R1–R12 · C-11 · มติผู้คุม 1–13 · CD-P1–P8)
//
// 🔴 ทำไมอยู่นอก `src/lib/modules/`: POS ไม่รู้จักแชท และแชทไม่รู้จัก POS (ไม่มีเส้น pos↔chat ใน fitness F2) ⇒ ต่อสายที่นี่
//    แบบเดียวกับ `pos-receipt-bridges.ts` / `member-journey-senders.ts` · import เฉพาะ facade ของโมดูล (chat · pos · member) + core
// ตัวรับคิว (outbox-consumers.ts โหลดไฟล์นี้แบบ dynamic) — ทุกตัว `(evt, deps?)` · **ไม่ throw** · ส่งไม่ได้ = ops WARN (รหัสเท่านั้น):
//   onSalePaidChat (ใบเสร็จอัตโนมัติ · R5) · onSaleRefundedChat (แจ้งคืนเงิน) · onOrderEventChat (สถานะออเดอร์ · R6) · onIntentPaidChat (เงินเข้า · R6) ·
//   onChatMessageReceivedBot (บอทตามกฎ · R9)
// ผู้เรียกตรง: requestChatPayment (ประตู A · R7) · mintChatPreorderLink (ประตู B · R8) · ordersForChatCustomer + notifyCustomer (P3.9 ใช้ต่อ · มติ 5)
// 🔴 สวิตช์ปิดทั้งหมดเป็นค่าปริยาย (มติ 4) ⇒ ไม่เรียกรอยต่อแชทเลย · ประตู A ไม่ถูกปิดด้วยสวิตช์ (CD-P5 — พนักงานกดเอง)
// 🔴 ความยินยอม (R4): สมาชิกที่ถอนความยินยอม LINE (granted false) = ไม่ส่ง · ยังไม่เคยตั้ง (null) = ส่งได้ (ข้อความธุรกรรม) · ออเดอร์แพลตฟอร์ม = ไม่ส่งเลย
// 🔴 PDPA (R10): ข้อความมีแค่รหัส/ยอด/เวลา/ลิงก์ · audit/ops เก็บรหัส/ไอดี ไม่เก็บเนื้อความ/LINE id/เบอร์/ชื่อ
// 🔴 deps (CD-P3): send = ตัวส่งที่ฉีดเข้ารอยต่อ · notify = แทนรอยต่อทั้งตัว (สปาย) · now = นาฬิกาของด่านพัก/อัตรา/หมดอายุ — production ไม่ส่งอะไร
import { writeAudit } from "@/lib/core/audit";
import { prisma } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { botContext, notifyCustomer as chatNotifyCustomer, setBotPaused, type NotifyCustomerInput, type NotifyCustomerResult, type PosSeamSend } from "@/lib/modules/chat";
import { getConsents } from "@/lib/modules/member";
import {
  bangkokHHmm,
  chatLink,
  chatMoney,
  chatReasonLabel,
  chatText,
  matchBotIntent,
  POS_CHAT_STATUS_LABELS,
  posChatLang,
  withStatusLink,
  type ChatPaymentPosResult,
  type PosChatSettings,
  type PosChatStatusKind,
  type PosChatTarget,
} from "@/lib/modules/pos";
import type { RegisterActor, RegisterCtx } from "@/lib/modules/pos";

/** P3.9 / ผู้เรียกอื่นใช้ตัวส่งเดียวกัน (มติ 5 — ห้ามเขียน ChatMessage เอง) */
export { notifyCustomer } from "@/lib/modules/chat";

export type PosChatDeps = { send?: PosSeamSend; notify?: (input: NotifyCustomerInput) => Promise<NotifyCustomerResult>; now?: Date };
/** แถว outbox (ตัวระบายคิวส่ง {id tenantId type payload systemId unitId} · ข้อสอบ/ผู้เรียกตรงส่งแถวเต็มได้) */
type Evt = { tenantId: string; type: string; payload: unknown; id?: string; systemId?: string | null; unitId?: string | null; idempotencyKey?: string | null };

const OPS_SOURCE = "pos.chat";
const OPS_NOTIFY = "pos.chat.notify";
const BOT_STAFF_QUIET_MS = 30 * 60_000;
const BOT_REPLY_WINDOW_MS = 20_000;
const BOT_DAY_MS = 24 * 3_600_000;
const BOT_DAY_LIMIT = 30;
const KEY = { receipt: "pos:receipt:", refund: "pos:refund:", order: "pos:order:", ordpay: "pos:ordpay:", bot: "pos:bot:", rate: "posbot:" } as const;
const payloadOf = (evt: Evt): Record<string, unknown> => (evt?.payload && typeof evt.payload === "object" && !Array.isArray(evt.payload) ? (evt.payload as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** ส่งผ่านรอยต่อของแชท (หรือสปายของข้อสอบ) */
function send(deps: PosChatDeps | undefined, input: NotifyCustomerInput): Promise<NotifyCustomerResult> {
  return deps?.notify ? deps.notify(input) : chatNotifyCustomer(input, deps?.send ? { send: deps.send } : undefined);
}
/** ผลที่ไม่สำเร็จ (ยกเว้น "ลูกค้าไม่มีตัวตนแชท" ซึ่งไม่ใช่ความผิดพลาด) → ops WARN รหัสเท่านั้น */
async function warn(tenantId: string, kind: string, r: NotifyCustomerResult, ref: string): Promise<void> {
  if (r.ok || r.code === "NO_CHAT_IDENTITY") return;
  await logOps("WARN", OPS_SOURCE, `${OPS_NOTIFY} — ส่งข้อความแชทอัตโนมัติไม่สำเร็จ (${kind} · ${r.code})`, { tenantId, detail: `${OPS_NOTIFY} kind ${kind} · code ${r.code} · ref ${ref}` }).catch(() => undefined);
}
/** สมาชิกถอนความยินยอมช่องทาง LINE (granted false) — null = ยังไม่เคยตั้ง = ส่งข้อความธุรกรรมได้ (R4) · อ่านไม่ได้ = ไม่ส่ง */
async function lineRevoked(tenantId: string, t: Extract<PosChatTarget, { kind: "member" }>): Promise<boolean> {
  try {
    const rows = await getConsents({ tenantId, systemId: t.memberSystemId, actorUserId: null }, t.customerId);
    return rows.some((r) => String(r.channel).toUpperCase() === "LINE" && r.granted === false);
  } catch {
    return true;
  }
}
/** เป้าหมายของ POS → เป้าหมายของรอยต่อ (สมาชิก: ตามสมาชิกก่อน แล้วตาม Party) — ถอนความยินยอม = null */
async function deliver(tenantId: string, target: PosChatTarget, base: Omit<NotifyCustomerInput, "target" | "tenantId">, deps?: PosChatDeps): Promise<NotifyCustomerResult | null> {
  if (target.kind === "order") return send(deps, { ...base, tenantId, target: { conversationId: target.conversationId } });
  if (target.kind === "party") return send(deps, { ...base, tenantId, target: { partyId: target.partyId } });
  if (await lineRevoked(tenantId, target)) return null;
  const r = await send(deps, { ...base, tenantId, target: { customerId: target.customerId } });
  if (!r.ok && r.code === "NO_CHAT_IDENTITY" && target.partyId) return send(deps, { ...base, tenantId, target: { partyId: target.partyId } });
  return r;
}
/** ภาษาของผู้รับ (ห้องที่ผูก) — ไม่รู้ = ไทย */
async function langOf(tenantId: string, target: PosChatTarget): Promise<string | null> {
  if (target.kind !== "order") return null;
  return (await botContext({ tenantId, conversationId: target.conversationId }))?.contact.lang ?? null;
}
async function settingsOf(tenantId: string, systemId: string | null | undefined): Promise<PosChatSettings | null> {
  return systemId ? chatLink.settingsOf({ tenantId, systemId }) : null;
}

// ═══════════ R5 ใบเสร็จอัตโนมัติ ═══════════
/** pos.sale.paid → ใบเสร็จทาง LINE ของสมาชิก / ห้องแชทของออเดอร์ (receiptAuto) — ไม่เกินครั้งเดียวต่อบิล · audit pos.receipt.auto_sent (ไม่นับเพดานส่งมือ 5/24 ชม.) */
export async function onSalePaidChat(evt: Evt, deps?: PosChatDeps): Promise<void> {
  try {
    const tenantId = str(evt?.tenantId);
    const saleId = str(payloadOf(evt).saleId);
    if (!tenantId || !saleId) return;
    const st = await settingsOf(tenantId, evt.systemId);
    if (!st?.receiptAuto) return;
    const plan = await chatLink.receiptPlan({ tenantId, saleId });
    if (!plan.ok) return;
    // ข้อความ = ตัวเดียวกับการส่งด้วยมือ (receipt-send.receiptLineText · P1.11 R7) — ประกอบใน receiptPlan
    const r = await deliver(tenantId, plan.target, { text: plan.text, dedupeKey: `${KEY.receipt}${plan.saleId}`, kind: "receipt" }, deps);
    if (!r) return;
    if (r.ok && !r.duplicated)
      await writeAudit({ tenantId, actorId: null, actorType: "SYSTEM", action: "pos.receipt.auto_sent", targetType: "PosSale", targetId: plan.saleId, after: { via: plan.to === "CHAT:order" ? "CHAT" : "LINE", to: plan.to, kind: "receipt" } });
    await warn(tenantId, "receipt", r, plan.saleId);
  } catch (e) {
    console.error("[pos-chat-bridges] onSalePaidChat", e instanceof Error ? e.name : "Error");
  }
}
/** pos.sale.refunded → แจ้งคืนเงิน + ลิงก์ใบลดหนี้ (refundNotice) · คีย์ pos:refund:<refundSaleId> */
export async function onSaleRefundedChat(evt: Evt, deps?: PosChatDeps): Promise<void> {
  try {
    const tenantId = str(evt?.tenantId);
    const refundSaleId = str(payloadOf(evt).refundSaleId);
    if (!tenantId || !refundSaleId) return;
    const st = await settingsOf(tenantId, evt.systemId);
    if (!st?.refundNotice) return;
    const plan = await chatLink.refundPlan({ tenantId, refundSaleId });
    if (!plan.ok) return;
    const lang = await langOf(tenantId, plan.target);
    const body = chatText(lang, "refundNotice", { amount: chatMoney(plan.refundSatang), receiptNo: plan.originalReceiptNo, url: plan.url });
    const r = await deliver(tenantId, plan.target, { text: body, dedupeKey: `${KEY.refund}${plan.refundSaleId}`, kind: "refund" }, deps);
    if (r) await warn(tenantId, "refund", r, plan.refundSaleId);
  } catch (e) {
    console.error("[pos-chat-bridges] onSaleRefundedChat", e instanceof Error ? e.name : "Error");
  }
}

// ═══════════ R6 สถานะออเดอร์ ═══════════
const KIND_OF: Record<string, PosChatStatusKind> = {
  "pos.order.accepted": "accepted",
  "pos.order.ready": "ready",
  "pos.order.rejected": "cancelled",
  "pos.order.cancelled": "cancelled",
};
async function orderMessage(tenantId: string, orderId: string, kind: PosChatStatusKind, deps?: PosChatDeps, intentId?: string): Promise<void> {
  const plan = await chatLink.orderPlan({ tenantId, orderId });
  if (!plan.ok) return;
  const f = plan.facts;
  const st = await settingsOf(tenantId, f.systemId);
  if (!st?.orderStatus || !st.statusKinds.includes(kind)) return;
  const lang = await langOf(tenantId, plan.target);
  let text: string;
  if (kind === "accepted") {
    if (!f.acceptedAt) return;
    text = chatText(lang, "accepted", { code: f.code, time: bangkokHHmm(f.acceptedAt.getTime() + (f.prepMinutes ?? 15) * 60_000) });
  } else if (kind === "ready") text = chatText(lang, "ready", { code: f.code });
  else if (kind === "paid") {
    if (!intentId || !f.paidIntentIds.includes(intentId)) return;
    text = chatText(lang, "paid", { amount: chatMoney(f.totalSatang), code: f.code });
  } else if (f.expired) text = chatText(lang, "expired", { code: f.code });
  else {
    text = chatText(lang, "cancelled", { code: f.code, reason: chatReasonLabel(lang, f.rejectReason) });
    if (f.refundNeeded) text = `${text}\n${chatText(lang, "refundLine")}`;
  }
  const r = await deliver(tenantId, plan.target, { text: withStatusLink(text, f.statusUrl), dedupeKey: `${KEY.order}${f.orderId}:${kind}`, kind: `order.${kind}` }, deps);
  if (r) await warn(tenantId, `order.${kind}`, r, f.orderId);
}
/** pos.order.accepted|ready|rejected|cancelled → ข้อความสถานะ (orderStatus · statusKinds) · rejected/cancelled/หมดเวลา = ชนิด cancelled · คีย์ pos:order:<id>:<ชนิด> */
export async function onOrderEventChat(evt: Evt, deps?: PosChatDeps): Promise<void> {
  try {
    const tenantId = str(evt?.tenantId);
    const kind = KIND_OF[str(evt?.type)];
    const orderId = str(payloadOf(evt).orderId);
    if (!tenantId || !kind || !orderId) return;
    const st = await settingsOf(tenantId, evt.systemId);
    if (!st?.orderStatus || !st.statusKinds.includes(kind)) return;
    await orderMessage(tenantId, orderId, kind, deps);
  } catch (e) {
    console.error("[pos-chat-bridges] onOrderEventChat", e instanceof Error ? e.name : "Error");
  }
}
/** pos.payment.intent_paid (หลัง onIntentPaid) → "ได้รับเงิน" เมื่อออเดอร์บันทึกเงินเข้าของใบนี้แล้ว (PREPAID) · คีย์ pos:order:<id>:paid */
export async function onIntentPaidChat(evt: Evt, deps?: PosChatDeps): Promise<void> {
  try {
    const tenantId = str(evt?.tenantId);
    const intentId = str(payloadOf(evt).intentId);
    if (!tenantId || !intentId) return;
    const st = await settingsOf(tenantId, evt.systemId);
    if (st && (!st.orderStatus || !st.statusKinds.includes("paid"))) return;
    const orderId = await chatLink.orderIdOfIntent({ tenantId, intentId });
    if (!orderId) return;
    await orderMessage(tenantId, orderId, "paid", deps, intentId);
  } catch (e) {
    console.error("[pos-chat-bridges] onIntentPaidChat", e instanceof Error ? e.name : "Error");
  }
}

// ═══════════ R7 ประตู A — ขอชำระในแชท ═══════════
export type RequestChatPaymentResult =
  | { ok: true; orderId: string; intentId: string; statusUrl: string; sent: boolean; duplicated: boolean; code?: string }
  | { ok: false; code: string; message: string; messageKey?: string };
/** พนักงานกด "ส่งลิงก์ชำระในแชท" (pos.sale.create ∧ pos.order.accept) → ออเดอร์รอชำระ + ใบ + ข้อความในห้อง (ส่งไม่ได้ ≠ ปฏิเสธ — ออเดอร์ยังรอชำระ) */
export async function requestChatPayment(ctx: RegisterCtx, actor: RegisterActor, input: { orderId: string }, deps?: PosChatDeps): Promise<RequestChatPaymentResult> {
  try {
    const r: ChatPaymentPosResult = await chatLink.requestPayment(ctx, actor, input);
    if (!r.ok) return { ok: false, code: r.code, message: r.message, ...(r.messageKey ? { messageKey: r.messageKey } : {}) };
    const statusUrl = (await chatLink.statusUrl(r.publicToken)) ?? "";
    const lang = (await botContext({ tenantId: ctx.tenantId, conversationId: r.conversationId }))?.contact.lang ?? null;
    const text = withStatusLink(chatText(lang, "payRequest", { amount: chatMoney(r.totalSatang), time: bangkokHHmm(r.payBy) }), statusUrl);
    const n = await send(deps, { tenantId: ctx.tenantId, target: { conversationId: r.conversationId }, text, dedupeKey: `${KEY.ordpay}${r.orderId}:${r.intentId}`, kind: "ordpay" });
    await warn(ctx.tenantId, "ordpay", n, r.orderId);
    return { ok: true, orderId: r.orderId, intentId: r.intentId, statusUrl, sent: n.ok, duplicated: r.duplicated, ...(n.ok ? {} : { code: n.code }) };
  } catch (e) {
    console.error("[pos-chat-bridges] requestChatPayment", e instanceof Error ? e.name : "Error");
    return { ok: false, code: "INTERNAL", message: "ระบบขัดข้องชั่วคราว — ลองอีกครั้ง" };
  }
}

// ═══════════ R8 ประตู B — ลิงก์สั่งล่วงหน้าติดแท็กห้อง ═══════════
export type MintChatPreorderLinkResult = { ok: true; url: string; expiresAt: string } | { ok: false; code: string };
/** /q/<linkToken>?c=<tag> ของห้องนี้ (24 ชม.) — ห้องของร้านอื่น/ไม่มีลิงก์ ACTIVE/ประตูปิด = ok:false */
export async function mintChatPreorderLink(input: { tenantId: string; conversationId: string; now?: Date }): Promise<MintChatPreorderLinkResult> {
  try {
    const ctx = await botContext({ tenantId: input?.tenantId, conversationId: input?.conversationId });
    if (!ctx) return { ok: false, code: "NO_CONVERSATION" };
    const r = await chatLink.preorderLink({ tenantId: input.tenantId, unitId: ctx.unitId, conversationId: ctx.conversationId, now: input.now });
    return r.ok ? { ok: true, url: r.url, expiresAt: r.expiresAt } : { ok: false, code: r.code };
  } catch (e) {
    console.error("[pos-chat-bridges] mintChatPreorderLink", e instanceof Error ? e.name : "Error");
    return { ok: false, code: "INTERNAL" };
  }
}

// ═══════════ R9 บอทตามกฎ (มติ 5) ═══════════
export type ChatCustomerOrders = { ok: true; orders: { orderId: string; code: string; status: string; etaAt: string | null; statusUrl: string | null }[] } | { ok: false; code: string };
/** ≤ 3 ออเดอร์ 48 ชม. ล่าสุดที่ผูกกับห้องนี้/ผู้ติดต่อของห้อง (P3.9 ใช้ตัวเดียวกัน) — ห้องของร้านอื่น = ok:false */
export async function ordersForChatCustomer(input: { tenantId: string; conversationId: string; now?: Date }): Promise<ChatCustomerOrders> {
  try {
    const ctx = await botContext({ tenantId: input?.tenantId, conversationId: input?.conversationId });
    if (!ctx) return { ok: false, code: "NO_CONVERSATION" };
    const rows = await chatLink.ordersForChat({ tenantId: input.tenantId, conversationId: ctx.conversationId, partyId: ctx.contact.partyId, customerId: ctx.contact.customerId, now: input.now });
    return { ok: true, orders: rows.map((o) => ({ orderId: o.orderId, code: o.code, status: o.paymentState === "PENDING_PAYMENT" && o.status === "NEW" ? "PENDING_PAYMENT" : o.status, etaAt: o.etaAt, statusUrl: o.statusUrl })) };
  } catch (e) {
    console.error("[pos-chat-bridges] ordersForChatCustomer", e instanceof Error ? e.name : "Error");
    return { ok: false, code: "INTERNAL" };
  }
}

/** id ของข้อความเข้าของ event (คีย์ outbox `chat.msg.<messageId>` · ตัวระบายไม่ส่งคีย์มา = อ่านจากแถว event ของร้านนี้) */
async function inboundIdOf(evt: Evt): Promise<string | null> {
  let key = str(evt?.idempotencyKey);
  if (!key && evt?.id) key = (await prisma.outboxEvent.findFirst({ where: { id: evt.id, tenantId: evt.tenantId }, select: { idempotencyKey: true } }).catch(() => null))?.idempotencyKey ?? "";
  const m = /^chat\.msg\.(.+)$/.exec(key);
  return m ? m[1]! : null;
}
/**
 * chat.message.received (ต่อท้ายสายเดิม) → บอทตามกฎ: สวิตช์ autoReply ของ POS ของสาขาห้อง · ข้อความเข้าล่าสุดเป็นตัวหนังสือ (= ข้อความของ event นี้) ·
 * ช่องทาง LINE/WEBCHAT · ไม่มีผู้รับผิดชอบ · พนักงานไม่ได้ตอบใน 30 นาที · ไม่ได้พักบอท · ≤ 1 คำตอบ/ห้อง/20 วิ + ≤ 30/วัน (posbot:<ห้อง>) ·
 * เจตนา STATUS / ORDER / HUMAN เท่านั้น (ไม่ตรง = เงียบ) · คีย์ pos:bot:<inboundMessageId> ⇒ เล่นซ้ำ = คำตอบเดิม
 */
export async function onChatMessageReceivedBot(evt: Evt, deps?: PosChatDeps): Promise<void> {
  try {
    const tenantId = str(evt?.tenantId);
    const conversationId = str(payloadOf(evt).conversationId);
    if (!tenantId || !conversationId) return;
    const now = deps?.now ?? new Date();
    // สวิตช์ก่อน (สาขาของห้อง = unitId ของ event · ปิด = ไม่อ่านแชทเลย) แล้วจึงอ่านบริบทห้อง
    const evtUnit = typeof evt.unitId === "string" && evt.unitId ? evt.unitId : null;
    let pos = evtUnit || evt.unitId === null ? await chatLink.systemForUnit({ tenantId, unitId: evtUnit }) : null;
    if (pos && !pos.chat.autoReply) return;
    const first = await botContext({ tenantId, conversationId });
    if (!first || (first.channel !== "LINE" && first.channel !== "WEBCHAT")) return;
    if (!pos || first.unitId !== evtUnit) pos = await chatLink.systemForUnit({ tenantId, unitId: first.unitId });
    if (!pos?.chat.autoReply) return;
    // ข้อความของ event นี้ (ไม่รู้ = ข้อความเข้าล่าสุด) ต้องเป็นตัวหนังสือ — รูป/สติกเกอร์/เสียง = เงียบ
    const inId = (await inboundIdOf(evt)) ?? first.lastIn?.id ?? null;
    const ctx = inId && inId !== first.lastIn?.id ? await botContext({ tenantId, conversationId, messageId: inId }) : first;
    const msg = ctx && inId ? (ctx.lastIn?.id === inId ? ctx.lastIn : ctx.message) : null;
    if (!ctx || !msg || !inId || msg.type !== "TEXT") return;
    if (ctx.assigneeUserId) return;
    if (ctx.lastStaffOutAt && now.getTime() - Date.parse(ctx.lastStaffOutAt) < BOT_STAFF_QUIET_MS) return;
    if (ctx.posBotPausedUntil && Date.parse(ctx.posBotPausedUntil) > now.getTime()) return;
    const intent = matchBotIntent(msg.body);
    if (!intent) return;
    const lang = ctx.contact.lang;
    let text: string;
    let pauseUntil: Date | null = null;
    if (intent === "STATUS") {
      const rows = await chatLink.ordersForChat({ tenantId, conversationId, partyId: ctx.contact.partyId, customerId: ctx.contact.customerId, now });
      if (!rows.length) text = chatText(lang, "botNotFound");
      else {
        const L = POS_CHAT_STATUS_LABELS[posChatLang(lang)];
        const lines = rows.map((o) => {
          const st = o.status === "NEW" && o.paymentState === "PENDING_PAYMENT" ? "PENDING_PAYMENT" : o.status;
          const eta = o.etaAt && (o.status === "ACCEPTED" || o.status === "PREPARING") ? ` · ${chatText(lang, "eta", { time: bangkokHHmm(o.etaAt) })}` : "";
          return `${o.code} · ${L[st] ?? st}${eta}${o.statusUrl ? `\n${o.statusUrl}` : ""}`;
        });
        text = [chatText(lang, "botStatus"), ...lines].join("\n");
      }
    } else if (intent === "ORDER") {
      const m = await chatLink.preorderLink({ tenantId, unitId: ctx.unitId, conversationId, now });
      text = m.ok ? chatText(lang, "botOrderLink", { url: m.url }) : chatText(lang, "botOrderClosed");
    } else {
      pauseUntil = new Date(now.getTime() + pos.chat.botPauseHours * 3_600_000);
      text = chatText(lang, "botHandoff");
    }
    // อัตรา (นับเฉพาะครั้งที่จะตอบ · หน้าต่างตามนาฬิกา deps.now) — เกิน = เงียบ (ทีมเห็นข้อความเข้าตามปกติ)
    const burst = await checkRateLimitDb(`${KEY.rate}${conversationId}`, { limit: 1, windowMs: BOT_REPLY_WINDOW_MS }, now.getTime());
    if (!burst.ok) return;
    const day = await checkRateLimitDb(`${KEY.rate}day:${conversationId}`, { limit: BOT_DAY_LIMIT, windowMs: BOT_DAY_MS }, now.getTime());
    if (!day.ok) return;
    if (pauseUntil) await setBotPaused({ tenantId, conversationId, until: pauseUntil });
    const r = await send(deps, { tenantId, target: { conversationId }, text, dedupeKey: `${KEY.bot}${inId}`, kind: `bot.${intent.toLowerCase()}` });
    await warn(tenantId, "bot", r, conversationId);
  } catch (e) {
    console.error("[pos-chat-bridges] onChatMessageReceivedBot", e instanceof Error ? e.name : "Error");
  }
}
