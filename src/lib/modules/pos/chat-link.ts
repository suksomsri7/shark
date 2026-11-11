// chat-link.ts — POS ↔ แชท ฝั่ง POS (P3.7 S · R2 R3 R5 R6 R8 R9 · มติผู้คุม 1 3 9)
//
// 🔴 โมดูล POS ไม่รู้จักแชท: ไฟล์นี้อ่านเฉพาะตารางของ POS (PosSale · PosOrder* · PosPaymentIntent · PosOrderLink · AppSystem) + Customer
//    (ตัวตนสมาชิกของบิล — แบบเดียวกับ receipt-send.ts) และคืน "ข้อเท็จจริง/เป้าหมาย" ให้ composition root `src/lib/pos-chat-bridges.ts`
//    เป็นผู้ส่งผ่านรอยต่อของแชท (chat/pos-seam.ts) · ไม่อ่าน ChatContact/ChatMessage (qc-pos-p1.11 ST5)
// 🔴 ตัวเขียนค่าตั้ง setPosChatSettings = เจ้าของร้านเท่านั้น (มติ 1: ส่งข้อความใช้โควตา LINE OA ของร้าน) · เขียนเฉพาะ settings.pos.chat · audit pos.settings.updated
// 🔴 ไม่ throw — ผู้เรียกคือตัวรับคิว (ข้อความเป็นของแถม ล้มแล้วห้ามพาบิล/ออเดอร์ล้ม)
import type { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { publicOrigin } from "@/lib/core/origin";
import { prisma } from "./db";
import { eReceiptUrl } from "./receipt";
import { receiptLineText } from "./receipt-send";
import { linkDoor } from "./qr-order";
import { mintChatTag } from "./chat-tag";
import { POS_SETTINGS_AUDIT } from "./settings-general";
import { parsePosChatPatch, posChatSettings, type PosChatSettings } from "./chat-link-shared";

type Ctx = { tenantId: string; systemId: string };
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const HOUR = 3_600_000;
const origin = async (): Promise<string> => (await publicOrigin()).replace(/\/+$/, "");
/** ลิงก์หน้าสถานะออเดอร์ /q/o/<token> (ไม่มีโทเคน = null) */
export async function orderStatusUrl(publicToken: string | null | undefined): Promise<string | null> {
  return publicToken ? `${await origin()}/q/o/${publicToken}` : null;
}

// ═══════════ ค่าตั้ง (R3 · มติ 1) ═══════════
export type PosChatSettingsRefusalCode = "NOT_FOUND" | "PERMISSION_DENIED" | "VALIDATION" | "UNKNOWN";
export type PosChatSettingsResult = { ok: true; chat: PosChatSettings } | { ok: false; code: PosChatSettingsRefusalCode; message: string; field?: string };
const SETTINGS_MSG: Record<PosChatSettingsRefusalCode, string> = {
  NOT_FOUND: "ไม่พบจุดขายนี้",
  PERMISSION_DENIED: "การตั้งค่าแชท (ส่งข้อความใช้โควตา LINE OA ของร้าน) เจ้าของร้านเท่านั้นที่ตั้งได้",
  VALIDATION: "ค่าที่ตั้งไม่ถูกต้อง",
  UNKNOWN: "เกิดข้อผิดพลาด — ลองอีกครั้ง",
};
const settingsRefuse = (code: PosChatSettingsRefusalCode, field?: string): PosChatSettingsResult => ({ ok: false, code, message: SETTINGS_MSG[code], ...(field ? { field } : {}) });

/** ค่าตั้งแชทของระบบ POS (อ่านอย่างเดียว · ไม่ใช่ POS ของร้านนี้ = null) */
export async function posChatSettingsOf(ctx: Ctx): Promise<PosChatSettings | null> {
  if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId)) return null;
  const sys = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { settings: true } });
  return sys ? posChatSettings(sys.settings) : null;
}
/** ระบบ POS ของสาขา (AppSystemUnit) — ไม่ระบุสาขา = POS เดียวของร้าน (มีหลายระบบ = null) */
export async function posSystemForChatUnit(i: { tenantId: string; unitId: string | null }): Promise<{ systemId: string; chat: PosChatSettings } | null> {
  if (!isId(i?.tenantId)) return null;
  let systemId: string | null = null;
  if (isId(i.unitId)) {
    const link = await prisma.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId: i.tenantId, unitId: i.unitId, type: "POS" } }, select: { systemId: true } });
    systemId = link?.systemId ?? null;
  } else {
    const all = await prisma.appSystem.findMany({ where: { tenantId: i.tenantId, type: "POS", active: true }, select: { id: true }, take: 2 });
    systemId = all.length === 1 ? all[0]!.id : null;
  }
  if (!systemId) return null;
  const sys = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId: i.tenantId, type: "POS", active: true }, select: { settings: true } });
  return sys ? { systemId, chat: posChatSettings(sys.settings) } : null;
}

/** R3 — ตั้งค่าแชทของ POS (เจ้าของร้านเท่านั้น · ตรวจเข้ม · เขียนเฉพาะ settings.pos.chat · audit pos.settings.updated) */
export async function setPosChatSettings(ctx: Ctx, actor: unknown, patch: unknown): Promise<PosChatSettingsResult> {
  try {
    if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId)) return settingsRefuse("NOT_FOUND");
    if (!isRecord(actor) || !isId(actor.userId) || actor.role !== "OWNER") return settingsRefuse("PERMISSION_DENIED");
    const parsed = parsePosChatPatch(patch);
    if (!parsed.ok) return settingsRefuse("VALIDATION", parsed.field);
    const done = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AppSystem" WHERE id = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND type = 'POS' FOR UPDATE`;
      if (!locked.length) return null;
      const sys = await tx.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { settings: true } });
      if (!sys) return null;
      const before = posChatSettings(sys.settings);
      const after: PosChatSettings = { ...before, ...parsed.clean };
      if (JSON.stringify(before) === JSON.stringify(after)) return { before, after, changed: false };
      const json = JSON.stringify(after);
      // POS P4.3 ▸ CD-P43-4: raw UPDATE ไม่ผ่าน @updatedAt ของ Prisma ⇒ ขยับ "updatedAt" เอง (แบบ settings-general.ts writePosKeys) ◂
      await tx.$executeRaw`
        UPDATE "AppSystem"
        SET "settings" = jsonb_set(
          CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
          '{pos}',
          (CASE WHEN jsonb_typeof("settings"->'pos') = 'object' THEN "settings"->'pos' ELSE '{}'::jsonb END) || jsonb_build_object('chat', ${json}::jsonb),
          true),
          "updatedAt" = now()
        WHERE id = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId}`;
      return { before, after, changed: true };
    });
    if (!done) return settingsRefuse("NOT_FOUND");
    if (done.changed)
      await writeAudit({ tenantId: ctx.tenantId, actorId: actor.userId as string, action: POS_SETTINGS_AUDIT, targetType: "AppSystem", targetId: ctx.systemId, before: { chat: done.before } as Prisma.InputJsonValue, after: { chat: done.after } as Prisma.InputJsonValue });
    return { ok: true, chat: done.after };
  } catch (e) {
    console.error("[pos/chat-link] setPosChatSettings", e instanceof Error ? e.name : "Error");
    return settingsRefuse("UNKNOWN");
  }
}

// ═══════════ เป้าหมายของข้อความ (R4 R5 R6) ═══════════
/** member = สมาชิกของบิล/ออเดอร์ (LINE ของสมาชิกเท่านั้น · ผู้เรียกตรวจความยินยอม) · order = ห้องแชทที่ออเดอร์ผูกไว้ · party = ผู้ติดต่อของออเดอร์ CHAT */
export type PosChatTarget =
  | { kind: "member"; customerId: string; partyId: string | null; memberSystemId: string }
  | { kind: "order"; conversationId: string }
  | { kind: "party"; partyId: string };

async function memberTarget(tenantId: string, customerId: string): Promise<PosChatTarget | null> {
  const c = await prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true, partyId: true, memberSystemId: true } });
  return c ? { kind: "member", customerId: c.id, partyId: c.partyId ?? null, memberSystemId: c.memberSystemId } : null;
}
type OrderRow = { id: string; channelId: string; channelCode: string; memberId: string | null; partyId: string | null; chatConversationId: string | null };
/** เป้าหมายของออเดอร์: ช่องทางแพลตฟอร์ม (แพลตฟอร์มดูแลลูกค้า) = ไม่ส่งเลย · ห้องที่ผูก > สมาชิก/ผู้ติดต่อ (ช่องทาง CHAT เท่านั้น) · walk-in ไม่ผูก = ไม่ส่ง */
async function orderTarget(tenantId: string, o: OrderRow): Promise<{ platform: boolean; target: PosChatTarget | null }> {
  const ch = await prisma.salesChannel.findFirst({ where: { id: o.channelId, tenantId }, select: { payout: true } });
  if (!ch || ch.payout === "PLATFORM") return { platform: true, target: null };
  if (o.chatConversationId) return { platform: false, target: { kind: "order", conversationId: o.chatConversationId } };
  if (o.channelCode === "CHAT" && o.memberId) return { platform: false, target: await memberTarget(tenantId, o.memberId) };
  if (o.channelCode === "CHAT" && o.partyId) return { platform: false, target: { kind: "party", partyId: o.partyId } };
  return { platform: false, target: null };
}
const ORDER_TARGET_SELECT = { id: true, channelId: true, channelCode: true, memberId: true, partyId: true, chatConversationId: true } as const;

export type ReceiptChatPlan =
  | { ok: false; reason: "NOT_FOUND" | "NOT_ELIGIBLE" | "VOIDED" | "PLATFORM" | "NO_TARGET" }
  | { ok: true; saleId: string; systemId: string; receiptNo: string; netSatang: number; url: string; text: string; target: PosChatTarget; to: "LINE:member" | "CHAT:order" };
/** R5 — ใบเสร็จอัตโนมัติของบิล: PAID · SALE · sourceModule POS (หน้าขาย + บิลของออเดอร์) · ยอด > 0 · เป้าหมาย = สมาชิกของบิล หรือห้อง/ลูกค้าของออเดอร์ */
export async function receiptChatPlan(i: { tenantId: string; saleId: string }): Promise<ReceiptChatPlan> {
  if (!isId(i?.tenantId) || !isId(i.saleId)) return { ok: false, reason: "NOT_FOUND" };
  const sale = await prisma.posSale.findFirst({
    where: { id: i.saleId, tenantId: i.tenantId },
    select: { id: true, systemId: true, status: true, docType: true, sourceModule: true, sourceId: true, memberId: true, receiptNo: true, grandTotalSatang: true, refundedSatang: true, publicToken: true },
  });
  if (!sale) return { ok: false, reason: "NOT_FOUND" };
  if (sale.status === "VOIDED") return { ok: false, reason: "VOIDED" };
  if (sale.status !== "PAID" || sale.docType !== "SALE" || sale.sourceModule !== "POS" || sale.grandTotalSatang <= 0) return { ok: false, reason: "NOT_ELIGIBLE" };
  const order = sale.sourceId ? await prisma.posOrder.findFirst({ where: { id: sale.sourceId, tenantId: i.tenantId }, select: ORDER_TARGET_SELECT }) : null;
  let target: PosChatTarget | null = null;
  if (order) {
    const ot = await orderTarget(i.tenantId, order);
    if (ot.platform) return { ok: false, reason: "PLATFORM" };
    target = ot.target;
  } else if (sale.memberId) target = await memberTarget(i.tenantId, sale.memberId);
  if (!target) return { ok: false, reason: "NO_TARGET" };
  const url = await eReceiptUrl(prisma, i.tenantId, sale);
  if (!url) return { ok: false, reason: "NOT_FOUND" };
  const receiptNo = sale.receiptNo ?? "";
  const netSatang = sale.grandTotalSatang - sale.refundedSatang;
  return { ok: true, saleId: sale.id, systemId: sale.systemId, receiptNo, netSatang, url, text: receiptLineText(receiptNo, netSatang, url), target, to: target.kind === "order" ? "CHAT:order" : "LINE:member" };
}

export type RefundChatPlan =
  | { ok: false; reason: "NOT_FOUND" | "NOT_ELIGIBLE" | "PLATFORM" | "NO_TARGET" }
  | { ok: true; refundSaleId: string; systemId: string; originalReceiptNo: string; refundSatang: number; url: string; target: PosChatTarget };
/** R5 refundNotice — ใบคืนเงิน (REFUND ของบิล POS) → เป้าหมายเดียวกับบิลเดิม · ลิงก์ = ใบลดหนี้ออนไลน์ /r/<โทเคนของใบคืน> */
export async function refundChatPlan(i: { tenantId: string; refundSaleId: string }): Promise<RefundChatPlan> {
  if (!isId(i?.tenantId) || !isId(i.refundSaleId)) return { ok: false, reason: "NOT_FOUND" };
  const rf = await prisma.posSale.findFirst({ where: { id: i.refundSaleId, tenantId: i.tenantId }, select: { id: true, systemId: true, docType: true, refSaleId: true, grandTotalSatang: true, publicToken: true } });
  if (!rf || !rf.refSaleId) return { ok: false, reason: "NOT_FOUND" };
  const orig = await prisma.posSale.findFirst({ where: { id: rf.refSaleId, tenantId: i.tenantId }, select: { id: true, sourceModule: true, sourceId: true, memberId: true, receiptNo: true } });
  if (!orig || rf.docType === "SALE" || orig.sourceModule !== "POS") return { ok: false, reason: "NOT_ELIGIBLE" };
  const amount = Math.abs(rf.grandTotalSatang);
  if (amount <= 0) return { ok: false, reason: "NOT_ELIGIBLE" };
  const order = orig.sourceId ? await prisma.posOrder.findFirst({ where: { id: orig.sourceId, tenantId: i.tenantId }, select: ORDER_TARGET_SELECT }) : null;
  let target: PosChatTarget | null = null;
  if (order) {
    const ot = await orderTarget(i.tenantId, order);
    if (ot.platform) return { ok: false, reason: "PLATFORM" };
    target = ot.target;
  } else if (orig.memberId) target = await memberTarget(i.tenantId, orig.memberId);
  if (!target) return { ok: false, reason: "NO_TARGET" };
  const url = await eReceiptUrl(prisma, i.tenantId, rf);
  if (!url) return { ok: false, reason: "NOT_FOUND" };
  return { ok: true, refundSaleId: rf.id, systemId: rf.systemId, originalReceiptNo: orig.receiptNo ?? "", refundSatang: amount, url, target };
}

export type OrderChatFacts = {
  orderId: string;
  systemId: string;
  code: string;
  status: string;
  paymentState: string;
  totalSatang: number;
  acceptedAt: Date | null;
  prepMinutes: number | null;
  payBy: Date | null;
  rejectReason: string | null;
  statusUrl: string | null;
  expired: boolean;
  refundNeeded: boolean;
  /** เงินเข้าของใบนี้ (บันทึก paid ของออเดอร์ที่มี intentId นี้) */
  paidIntentIds: string[];
};
export type OrderChatPlan = { ok: false; reason: "NOT_FOUND" | "PLATFORM" | "NO_TARGET" } | { ok: true; facts: OrderChatFacts; target: PosChatTarget };
/** R6 — ข้อเท็จจริงของออเดอร์สำหรับข้อความสถานะ (ไม่มีชื่อ/เบอร์ลูกค้า) + เป้าหมาย */
export async function orderChatPlan(i: { tenantId: string; orderId: string }): Promise<OrderChatPlan> {
  if (!isId(i?.tenantId) || !isId(i.orderId)) return { ok: false, reason: "NOT_FOUND" };
  const o = await prisma.posOrder.findFirst({
    where: { id: i.orderId, tenantId: i.tenantId },
    select: { ...ORDER_TARGET_SELECT, systemId: true, code: true, status: true, paymentState: true, totalSatang: true, acceptedAt: true, prepMinutes: true, payBy: true, rejectReason: true, publicToken: true },
  });
  if (!o) return { ok: false, reason: "NOT_FOUND" };
  const ot = await orderTarget(i.tenantId, o);
  if (ot.platform) return { ok: false, reason: "PLATFORM" };
  if (!ot.target) return { ok: false, reason: "NO_TARGET" };
  const evs = await prisma.posOrderEvent.findMany({ where: { tenantId: i.tenantId, orderId: o.id, type: { in: ["expired", "refund_needed", "paid"] } }, select: { type: true, payload: true } });
  const paidIntentIds = evs.filter((e) => e.type === "paid" && isRecord(e.payload) && typeof e.payload.intentId === "string").map((e) => (e.payload as { intentId: string }).intentId);
  return {
    ok: true,
    target: ot.target,
    facts: {
      orderId: o.id,
      systemId: o.systemId,
      code: o.code,
      status: o.status,
      paymentState: o.paymentState,
      totalSatang: o.totalSatang,
      acceptedAt: o.acceptedAt,
      prepMinutes: o.prepMinutes,
      payBy: o.payBy,
      rejectReason: o.rejectReason,
      statusUrl: await orderStatusUrl(o.publicToken),
      expired: o.rejectReason === "PAYMENT_EXPIRED" || evs.some((e) => e.type === "expired"),
      refundNeeded: evs.some((e) => e.type === "refund_needed"),
      paidIntentIds,
    },
  };
}
/** ออเดอร์ของใบขอรับเงิน (outbox pos.payment.intent_paid) — ใบของหน้าขาย (ไม่มี orderId) = null */
export async function orderIdOfIntent(i: { tenantId: string; intentId: string }): Promise<string | null> {
  if (!isId(i?.tenantId) || !isId(i.intentId)) return null;
  const it = await prisma.posPaymentIntent.findFirst({ where: { id: i.intentId, tenantId: i.tenantId }, select: { orderId: true } });
  return it?.orderId ?? null;
}

// ═══════════ บอท: ออเดอร์ของห้องนี้ (R9 · Q5) — P3.9 เรียกผ่าน root ordersForChatCustomer ═══════════
export type ChatOrderItem = { orderId: string; code: string; status: string; paymentState: string; etaAt: string | null; statusUrl: string | null };
const BOT_LOOKBACK_MS = 48 * HOUR;
const BOT_MAX_ORDERS = 3;
/** ≤ 3 ออเดอร์ล่าสุดใน 48 ชม. ที่ผูกกับ "ห้องนี้" (chatConversationId) หรือผู้ติดต่อของห้อง (partyId / สมาชิก) — ไม่ค้นจากรหัส/เบอร์ที่ลูกค้าพิมพ์ (R10) */
export async function ordersForChat(i: { tenantId: string; conversationId: string; partyId?: string | null; customerId?: string | null; now?: Date }): Promise<ChatOrderItem[]> {
  if (!isId(i?.tenantId) || !isId(i.conversationId)) return [];
  const now = i.now ?? new Date();
  const or: Prisma.PosOrderWhereInput[] = [{ chatConversationId: i.conversationId }];
  if (isId(i.partyId)) or.push({ partyId: i.partyId });
  if (isId(i.customerId)) or.push({ memberId: i.customerId });
  const rows = await prisma.posOrder.findMany({
    where: { tenantId: i.tenantId, receivedAt: { gte: new Date(now.getTime() - BOT_LOOKBACK_MS), lte: now }, OR: or },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take: BOT_MAX_ORDERS * 3,
    select: { id: true, code: true, status: true, paymentState: true, acceptedAt: true, prepMinutes: true, publicToken: true, channelId: true },
  });
  const platform = new Set(
    (await prisma.salesChannel.findMany({ where: { tenantId: i.tenantId, id: { in: [...new Set(rows.map((r) => r.channelId))] }, payout: "PLATFORM" }, select: { id: true } })).map((c) => c.id),
  );
  const out: ChatOrderItem[] = [];
  for (const r of rows) {
    if (platform.has(r.channelId)) continue;
    out.push({
      orderId: r.id,
      code: r.code,
      status: r.status,
      paymentState: r.paymentState,
      etaAt: r.acceptedAt ? new Date(r.acceptedAt.getTime() + (r.prepMinutes ?? 15) * 60_000).toISOString() : null,
      statusUrl: await orderStatusUrl(r.publicToken),
    });
    if (out.length >= BOT_MAX_ORDERS) break;
  }
  return out;
}

// ═══════════ ประตู B: ลิงก์สั่งล่วงหน้าติดแท็กห้อง (R8 · มติ 3) ═══════════
export type ChatPreorderLinkResult = { ok: true; url: string; expiresAt: string; linkToken: string } | { ok: false; code: "NO_LINK" | "DOOR_CLOSED" | "NOT_CONFIGURED" };
/** ลิงก์ ACTIVE ของสาขาของห้อง (ห้องไม่ระบุสาขา = ลิงก์เดียวของร้าน) + ประตูเปิด (QR_ORDER · มีทางรับเงิน) → /q/<link>?c=<tag> (+24 ชม.) — ห้องเป็นของร้านนี้ (ผู้เรียกตรวจผ่านรอยต่อแชทแล้ว) */
export async function chatPreorderLink(i: { tenantId: string; unitId: string | null; conversationId: string; now?: Date }): Promise<ChatPreorderLinkResult> {
  if (!isId(i?.tenantId) || !isId(i.conversationId)) return { ok: false, code: "NO_LINK" };
  const links = await prisma.posOrderLink.findMany({ where: { tenantId: i.tenantId, status: "ACTIVE", ...(isId(i.unitId) ? { unitId: i.unitId } : {}) }, select: { token: true }, take: 2 });
  if (links.length !== 1) return { ok: false, code: "NO_LINK" };
  const token = links[0]!.token;
  const door = await linkDoor(token);
  if (!door.ok || !door.view.open) return { ok: false, code: "DOOR_CLOSED" };
  const t = mintChatTag({ tenantId: i.tenantId, linkToken: token, conversationId: i.conversationId, now: i.now });
  if (!t) return { ok: false, code: "NOT_CONFIGURED" };
  return { ok: true, url: `${await origin()}/q/${token}?c=${t.tag}`, expiresAt: t.expiresAt.toISOString(), linkToken: token };
}
