// outbox-consumers.ts — composition root ของ outbox (อยู่นอก core → import โมดูลได้)
// ผูก event type → handler · handler อ่านข้อมูลจาก prisma ตรง แล้วส่งให้ pos/account-bridge
// WO-0002: "pos.sale.paid" (ขายสด→บัญชี) · "pos.sale.voided" (void→กลับรายการ)

import { after } from "next/server";
import { prisma } from "@/lib/core/db";
import { drainOutbox, type OutboxHandler } from "@/lib/core/outbox";
import { bridgePosSalePaid, bridgePosSaleVoided } from "@/lib/modules/pos/account-bridge";
// 🔴 import ตรง (ไม่ผ่าน account/index) — index อยู่ในวงจร service↔inventory↔account/index อยู่แล้ว
//    การดึง inbox เข้าไปใน index ทำให้โมดูลบัญชีโหลดไม่ขึ้นทั้งชุด (ดูคอมเมนต์ใน account/index.ts)
import { ingestInboxFiles as ingestInboxFilesToAccount } from "@/lib/modules/account/inbox";
import { runForEvent } from "@/lib/automation/engine";
import { dispatchWebhooks } from "@/lib/webhooks/service";
import { entityLabel } from "@/lib/modules/approval/labels";
import { applyApprovalEffect } from "@/lib/approval-effects";
import { logOps } from "@/lib/core/ops";
import { invalidateBrandingCache } from "@/lib/branding/service";
import { chatChannelToKey, getChannel } from "@/lib/core/channels";
import { formatThaiDate } from "@/lib/ui/date";
import { logActivity as memberLogActivity, runForEvent as runJourneysForEvent } from "@/lib/modules/member";
// M3.5 — ตาข่ายเก็บตกของแนะนำเพื่อนตอน `member.created` (facade ล้วน)
import { referralOnMemberCreated } from "@/lib/modules/member";
// M3.3 — ทะเบียนทริกเกอร์ของ journey (ไฟล์บริสุทธิ์) · เช็คก่อนโหลดตัวส่ง ⇒ event อื่นทั้งระบบไม่เสียอะไรเพิ่ม
import { JOURNEY_TRIGGER_EVENTS } from "@/lib/modules/member/journeys-shared";
// M3.2 — ผลของแคมเปญถูกนับจากคิว (voucher ถูกใช้) · facade ล้วน ไม่ล้วงไฟล์ในโมดูล
import * as marketing from "@/lib/modules/marketing";
// M2.5 — ต่อสาย "ของแจกย้อนกลับ" ของระบบสมาชิก (ขึ้นระดับ → voucher ต้อนรับ)
//   คิว outbox คือทางเข้าที่ทำให้ระดับเปลี่ยนโดยไม่มีคนกดปุ่ม (ปิดบิล → เลื่อนระดับ)
// 🔴 เรียก **ตอนใช้งาน** (ต้น handler / drainAll) ไม่ใช่ตอนโหลดไฟล์: ไฟล์นี้อยู่ในวงจร import กับ
//    โมดูลสมาชิก (member → pos/service → scheduleDrain ที่นี่) ⇒ ถ้าเรียกตอนโหลด บางลำดับการ import
//    จะได้ `member/index` ที่ยังประกอบไม่เสร็จ แล้วพังด้วย "onTierChanged of undefined"
//    ตัวฟังก์ชัน idempotent อยู่แล้ว — เรียกทุก event ก็แค่เช็ค boolean
import { registerMemberHooks } from "@/lib/member-hooks";

const saleIdOf = (payload: unknown): string | null => {
  const p = payload as { saleId?: unknown } | null;
  return p && typeof p.saleId === "string" ? p.saleId : null;
};

// ── การแจ้งเตือนสมาชิก (M3.6 · §5.10 §8.x) ──────────────────────────────────
// 🔴 event เหล่านี้ (แต้ม/สแตมป์/voucher) ถูกยิงด้วย `systemId` ของระบบต้นทาง (POINT/STAMP อาจไม่ใช่
//    ระบบสมาชิกโดยตรง) ⇒ resolve ระบบสมาชิกจริงจาก `Customer.memberSystemId` เสมอ (แบบเดียวกับ
//    `journeys.ts#runForEvent` ที่ไม่พึ่ง `evt.systemId`) ไม่ใช่ใช้ `evt.systemId` ตรง ๆ
// 🔴 ตัวส่งจริง (LINE ผ่านแชท) มาจาก composition root `member-journey-senders.ts` — dynamic import
//    เพื่อไม่ให้ไฟล์นี้ผูกกับโมดูลแชทตอนโหลด (ไม่ได้เกี่ยวกับ F2 ที่นี่ — composition root อยู่นอก
//    src/lib/modules อยู่แล้ว — แต่คงรูปแบบ dynamic import เดียวกับ journey/webhooks ด้านบนเพื่อความสม่ำเสมอ)
async function notifyMember(
  tenantId: string,
  customerId: string,
  key: string,
  vars?: Record<string, string | number>,
  refId?: string,
): Promise<void> {
  try {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { memberSystemId: true } });
    if (!customer) return; // สมาชิกถูกลบ/รวมไปแล้วก่อนคิวจะมาถึง — ไม่มีใครให้แจ้งแล้ว (ปกติของ outbox)
    const notifications = await import("@/lib/modules/member/notifications");
    const { notificationSenders } = await import("@/lib/member-journey-senders");
    await notifications.send(
      { tenantId, systemId: customer.memberSystemId, actorUserId: null },
      { event: key, customerId, ...(vars ? { vars } : {}), ...(refId ? { refId } : {}) },
      { deps: notificationSenders },
    );
  } catch (e) {
    await logOps("WARN", "outbox", `แจ้งเตือนสมาชิก "${key}" ล้มเหลว`, {
      tenantId,
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
  }
}

// M1.12 (§7.1 §9.3) — ผูกห้องแชทเข้ากับสมาชิกแล้ว → บันทึกลงไทม์ไลน์สมาชิก (MemberActivity)
// ของจริง (ChatContact/MemberChannelIdentity) ถูกเขียนครบใน tx ของ `member/chat-bridge.ts#linkContact`
// แล้ว — handler นี้ทำงานจริง 1 อย่าง (เขียนไทม์ไลน์) + ปิด event เป็น DONE + เป็นจุดให้ Automation/Webhooks ยิงต่อ
const chatContactLinked: OutboxHandler = async (evt) => {
  const p = evt.payload as { contactId?: unknown; customerId?: unknown } | null;
  const customerId = p && typeof p.customerId === "string" ? p.customerId : null;
  const contactId = p && typeof p.contactId === "string" ? p.contactId : null;
  if (!customerId) return;
  // สมาชิกอาจถูกลบ/รวมไปแล้วก่อนคิวจะมาถึง (ปกติของ outbox แบบ eventual) — ไม่มีใครให้บันทึกไทม์ไลน์แล้ว
  // ถือเป็นงานเสร็จเงียบ ๆ (ไม่ throw ให้ event ค้าง PENDING ตลอดกาล) เหมือน guard `if (!sale) return;` ของ posSalePaid ด้านล่าง
  const stillExists = await prisma.customer.findFirst({ where: { id: customerId, tenantId: evt.tenantId }, select: { id: true } });
  if (!stillExists) return;
  const contact = contactId ? await prisma.chatContact.findFirst({ where: { id: contactId, tenantId: evt.tenantId } }) : null;
  const channelKey = contact ? chatChannelToKey(contact.channel) : null;
  const label = channelKey ? (getChannel(channelKey)?.label ?? channelKey) : "แชท";
  await memberLogActivity({
    tenantId: evt.tenantId,
    customerId,
    module: "chat",
    type: "CHAT_LINKED",
    refType: "ChatContact",
    refId: contactId ?? undefined,
    summary: `ผูกช่องทาง${label}เข้ากับสมาชิกคนนี้แล้ว`,
  });
};

// ขายสด POS → บัญชี
const posSalePaid: OutboxHandler = async (evt) => {
  const saleId = saleIdOf(evt.payload);
  if (!saleId) return;
  const sale = await prisma.posSale.findFirst({
    where: { id: saleId, tenantId: evt.tenantId },
    include: {
      payments: true,
      // WO 4.2: อ่านบรรทัดเต็ม (เดิมอ่านแค่ serviceId/lineTotal) → ส่งต่อให้บัญชีสร้างเอกสารต่อสินค้า
      lines: {
        select: {
          id: true,
          name: true,
          qty: true,
          unitPriceSatang: true,
          discountSatang: true,
          lineTotalSatang: true,
          itemId: true,
          serviceId: true,
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!sale) return;
  if (sale.status !== "PAID") return; // ถูก void ก่อน drain → ไม่ต้อง post (void handler จัดการ)
  // M2.6 — บิล "ขาย/เติมบัตรกำนัล" ข้ามทั้งใบ: ไม่ลงบัญชีขาย · ไม่ให้แต้ม · ไม่นับสแตมป์/ที่มา
  // 🔴 ขายบัตรกำนัลยัง**ไม่ใช่รายได้** (เป็นเงินรับล่วงหน้า หนี้สิน 2110) และยัง**ไม่ใช่การซื้อของ**
  //    ของลูกค้า ⇒ ถ้าปล่อยผ่านเส้นนี้ รายได้จะถูกบันทึกสองรอบ (ตอนขายบัตร + ตอนลูกค้าเอาบัตรมาใช้)
  //    และคนซื้อจะได้แต้มสองเด้ง · โมดูล giftcard ลงบัญชีของตัวเองผ่าน facade บัญชีแล้ว (§9.1 §9.4)
  if (sale.giftCardId) return;
  // ยอดฝั่งบริการ → ลงบัญชี 4030 รายได้ค่าบริการ (ที่เหลือเข้า 4000 ขายสินค้า)
  // ใช้ยอดก่อนหักส่วนลดท้ายบิล — facade ถอด VAT/ปรับสัดส่วนให้เอง
  const serviceGross = sale.lines.reduce((n, l) => n + (l.serviceId ? l.lineTotalSatang : 0), 0);
  // WO 4.2 (MAP §F.13): ลูกค้าของบิล — สมาชิกที่ผูกไว้ (Customer) พร้อม partyId เพื่อจับคู่ผู้ติดต่อฝั่งบัญชี
  //   ไม่มีสมาชิก = ลูกค้าเดินเข้าร้าน (walk-in) → ไม่ส่ง customer → เอกสารไม่ผูกผู้ติดต่อ
  const member = sale.memberId
    ? await prisma.customer.findFirst({
        where: { id: sale.memberId, tenantId: evt.tenantId },
        select: { id: true, name: true, phone: true, partyId: true },
      })
    : null;
  await bridgePosSalePaid(sale, sale.payments, serviceGross, {
    lines: sale.lines.map((l) => ({
      name: l.name,
      qty: l.qty,
      unitPriceSatang: l.unitPriceSatang,
      discountSatang: l.discountSatang,
      lineTotalSatang: l.lineTotalSatang,
      itemId: l.itemId,
    })),
    customer: member
      ? { memberId: member.id, partyId: member.partyId, name: member.name, phone: member.phone }
      : null,
  });
};

// void บิล POS → กลับรายการบัญชี
const posSaleVoided: OutboxHandler = async (evt) => {
  const saleId = saleIdOf(evt.payload);
  if (!saleId) return;
  const sale = await prisma.posSale.findFirst({
    where: { id: saleId, tenantId: evt.tenantId },
    select: { id: true, tenantId: true, systemId: true },
  });
  if (!sale) return;
  await bridgePosSaleVoided(sale);
};

// ห่อ handler หลักด้วย Automation (WO-0026): หลัง handler หลักสำเร็จ (event กำลังจะ DONE)
// เรียก engine แบบ best-effort — engine พัง (rule/webhook ล่ม) ห้ามล้ม consumer หลัก
// (ไม่งั้น event จะถูก retry แล้ว post บัญชีซ้ำ) → ครอบ try/catch เงียบ
const withAutomation =
  (handler: OutboxHandler): OutboxHandler =>
  async (evt) => {
    // M2.5 — hook ของแจกย้อนกลับต้องพร้อมก่อน handler ตัวใดจะทำงาน (idempotent · เช็ค boolean เฉย ๆ)
    registerMemberHooks();
    // งานหลักก่อน — พังต้องโยนต่อเหมือนเดิม (drain จะ retry/backoff) เพียงแต่ log ERROR ก่อน
    try {
      await handler(evt);
    } catch (e) {
      await logOps("ERROR", "outbox", `handler "${evt.type}" ล้มเหลว`, {
        tenantId: evt.tenantId,
        detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
      throw e; // โยนต่อ — พฤติกรรมเดิมห้ามเปลี่ยน
    }
    try {
      await runForEvent({ tenantId: evt.tenantId, type: evt.type, payload: evt.payload });
    } catch (e) {
      // automation ล้มเหลว = เรื่องรอง — event หลัก DONE ตามปกติ · แค่บันทึก WARN
      await logOps("WARN", "outbox", `automation ของ "${evt.type}" ล้มเหลว`, {
        tenantId: evt.tenantId,
        detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
    }
    // M3.3 — journey อัตโนมัติของระบบสมาชิก (best-effort แบบเดียวกับ automation: พังห้ามล้ม consumer หลัก)
    //   ส่ง `id` ของ event ไปด้วย → เอนจินอ่าน idempotencyKey เป็นกุญแจกันวน (ตรงกับตอนเรียกตรงจาก cron/ข้อสอบ)
    //   ตัวส่งจริง (แชท/บอร์ดงาน) โหลดแบบ dynamic — `member-journey-senders` → chat/kanban → … → ไฟล์นี้ = วงกลม
    if (JOURNEY_TRIGGER_EVENTS.has(evt.type)) {
      try {
        const { journeySenders } = await import("@/lib/member-journey-senders");
        await runJourneysForEvent({ tenantId: evt.tenantId, type: evt.type, payload: evt.payload, id: evt.id }, { deps: journeySenders });
      } catch (e) {
        await logOps("WARN", "outbox", `journey ของ "${evt.type}" ล้มเหลว`, {
          tenantId: evt.tenantId,
          detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
        });
      }
    }
  };

// ── บัญชี V2 · WO 7.2 (§12 กล่องขาเข้า): รูปบิลที่ลูกค้า/ทีมส่งเข้าห้องแชท → เข้ากล่องขาเข้าของบัญชี ──
//
// 🔴 ทำไมโค้ดอยู่ที่นี่ ไม่ใช่ในโมดูลบัญชี: กติกา run ห้ามแตะ `src/lib/modules/chat/**` และ fitness F2.1
//    ไม่อนุญาตเส้น `account→chat` ⇒ "การอ่านฝั่งแชท" ต้องเกิดที่ composition root (ไฟล์นี้) แล้วส่ง
//    **ข้อมูลดิบ** (url/ชื่อไฟล์/ชนิด/ผู้ส่ง) ให้ facade ของบัญชีเท่านั้น
//
// 🔴 payload ของ `chat.message.received` วันนี้มีแค่ `{ conversationId, channel }` — **ไม่มี messageId**
//    (service.ts:602–609 ใส่ messageId ไว้ใน idempotencyKey เท่านั้น) ⇒ ที่นี่จึงต้องไล่หาข้อความขาเข้า
//    ล่าสุดของห้องนั้นที่มีไฟล์แนบเอง · กันซ้ำด้วย `sourceRef = ChatMessage.id#ลำดับไฟล์` (unique ในสคีมา)
//    ⇒ replay/ยิงซ้ำกี่รอบก็ไม่เกิดไฟล์ซ้ำ · ถ้าวันหนึ่ง session แชทใส่ `messageId` ลง payload ให้ใช้ค่านั้น
//    แทนการไล่หา (โค้ดรองรับทั้ง 2 แบบแล้ว — ดู `messageIdOf`)
//
// เปิดใช้เฉพาะร้านที่ตั้งใจ: ต้องมี `AccountSystemLink.config.inboxFromChat === true` (ค่าเริ่มต้น = ปิด)
// ⇒ ร้านที่ไม่ได้เปิด จะไม่มีอะไรเปลี่ยนเลยแม้แต่ query เดียวหลัง early-return
const INBOX_CHAT_LOOKBACK_MS = 10 * 60_000; // ข้อความที่เก่ากว่านี้ = คิวค้างนานผิดปกติ ไม่ต้องดูดเข้ากล่อง

const conversationIdOf = (payload: unknown): string | null => {
  const p = payload as { conversationId?: unknown } | null;
  return p && typeof p.conversationId === "string" ? p.conversationId : null;
};
const messageIdOf = (payload: unknown): string | null => {
  const p = payload as { messageId?: unknown } | null;
  return p && typeof p.messageId === "string" ? p.messageId : null;
};

/** ระบบบัญชีของร้านที่เปิดรับบิลจากแชทไว้ — ไม่เปิด/ไม่มีระบบบัญชี = null (ไม่ทำอะไรต่อ) */
async function accountSystemForChatInbox(tenantId: string): Promise<string | null> {
  const links = await prisma.accountSystemLink.findMany({
    // WO 8.3: `enabled` = สวิตช์ "ตัดการเชื่อม" ของหน้า §9.5 — ตัดแล้วต้องหยุดดูดบิลเข้ากล่องขาเข้าด้วย
    where: { tenantId, archivedAt: null, enabled: true },
    select: { systemId: true, config: true },
  });
  for (const l of links) {
    const cfg = (l.config ?? {}) as { inboxFromChat?: unknown };
    if (cfg.inboxFromChat === true) return l.systemId;
  }
  return null;
}

const chatInboundToAccountInbox: OutboxHandler = async (evt) => {
  const conversationId = conversationIdOf(evt.payload);
  if (!conversationId) return;
  const accountSystemId = await accountSystemForChatInbox(evt.tenantId);
  if (!accountSystemId) return; // ร้านไม่ได้เปิดฟีเจอร์นี้ = จบตรงนี้

  const explicitMessageId = messageIdOf(evt.payload);
  const messages = await prisma.chatMessage.findMany({
    where: {
      tenantId: evt.tenantId,
      conversationId,
      direction: "IN",
      ...(explicitMessageId
        ? { id: explicitMessageId }
        : { createdAt: { gte: new Date(Date.now() - INBOX_CHAT_LOOKBACK_MS) } }),
    },
    orderBy: { createdAt: "desc" },
    take: explicitMessageId ? 1 : 5,
    select: {
      id: true,
      conversation: { select: { contact: { select: { displayName: true } } } },
      attachments: { select: { id: true, url: true, fileName: true, mimeType: true, sizeBytes: true } },
    },
  });

  const files = messages.flatMap((m) =>
    m.attachments.map((a) => ({
      // ลำดับไฟล์ผูกกับ id ของ ChatAttachment เอง (นิ่งกว่า index ในอาเรย์)
      sourceRef: `chat:${m.id}#${a.id}`,
      fileName: a.fileName,
      fileUrl: a.url,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    })),
  );
  if (files.length === 0) return; // ข้อความตัวอักษรล้วน = ไม่เกี่ยวกับบัญชี

  const senderLabel = messages[0]?.conversation?.contact?.displayName ?? null;
  await ingestInboxFilesToAccount(
    { tenantId: evt.tenantId, systemId: accountSystemId },
    { source: "CHAT", senderLabel, files },
  );
};

// ── Approval Engine (WO-0049): แจ้งเตือนร้านเมื่อคำขออนุมัติเปลี่ยนสถานะ ──
const approvalMeta = (payload: unknown): { entityType: string; entityId: string } => {
  const p = (payload ?? {}) as { entityType?: unknown; entityId?: unknown };
  return {
    entityType: typeof p.entityType === "string" ? p.entityType : "",
    entityId: typeof p.entityId === "string" ? p.entityId : "",
  };
};

const approvalNotify =
  (title: (label: string) => string, body: string): OutboxHandler =>
  async (evt) => {
    const { entityType } = approvalMeta(evt.payload);
    await prisma.appNotification.create({
      data: { tenantId: evt.tenantId, title: title(entityLabel(entityType)), body },
    });
  };

const approvalSubmitted = approvalNotify(
  (label) => `มีคำขออนุมัติใหม่: ${label}`,
  "มีคำขอรอการอนุมัติ เปิดหน้า “รออนุมัติของฉัน” เพื่อตรวจสอบ",
);
const approvalApproved = approvalNotify(
  (label) => `คำขออนุมัติผ่านแล้ว: ${label}`,
  "คำขอผ่านการอนุมัติครบทุกขั้นแล้ว",
);
const approvalRejected = approvalNotify(
  (label) => `คำขอถูกปฏิเสธ: ${label}`,
  "คำขออนุมัติถูกปฏิเสธ ไม่ไปขั้นถัดไป",
);

// WO-0049b: ห่อ notify ของ approved/rejected ด้วย effect — หลัง notify เดิมทำงาน (ห้ามหาย)
//   applyApprovalEffect นำผลกลับ entity ต้นทาง (PO→ORDERED / ใบลา→APPROVED|REJECTED)
//   effect เป็น updateMany + guard สถานะ → idempotent (ถ้า drain retry ก็ไม่พัง)
const withApprovalEffect =
  (handler: OutboxHandler): OutboxHandler =>
  async (evt) => {
    await handler(evt); // notify เดิมก่อนเสมอ
    if (evt.type === "approval.request.approved" || evt.type === "approval.request.rejected") {
      await applyApprovalEffect({ tenantId: evt.tenantId, type: evt.type, payload: evt.payload });
    }
  };

// ── Webhooks ขาออก (WO-0062): ห่อเพิ่มอีกชั้นหลัง handler หลัก(+automation) สำเร็จ ──
// ยิงฮุคไปทุก endpoint ที่ร้าน subscribe event นี้ — best-effort เหมือน automation
// (dispatch จับ error ต่อ endpoint อยู่แล้ว · ห่อ try/catch กัน error ระดับ query ไม่ให้ล้ม consumer)
const withWebhooks =
  (handler: OutboxHandler): OutboxHandler =>
  async (evt) => {
    await handler(evt); // handler หลัก(+automation) — พังต้องโยนต่อ (drain retry) ตามเดิม
    try {
      await dispatchWebhooks({ tenantId: evt.tenantId, type: evt.type, payload: evt.payload });
    } catch (e) {
      await logOps("WARN", "outbox", `webhook ของ "${evt.type}" ล้มเหลว`, {
        tenantId: evt.tenantId,
        detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
    }
  };

// ── K3.3 (§9.2 "การ์ดเกิดจากที่อื่น"): ต่อสะพาน "โมดูลอื่น → บอร์ดงาน" ท้าย handler เดิม ──
//
// 🔴 `compose` = "ของเดิมก่อนเสมอ แล้วค่อยของใหม่" — notify/effect/bridge บัญชีที่มีอยู่ต้องทำงาน
//    เหมือนเดิมเป๊ะ (พังก็โยนต่อให้ drain retry เหมือนเดิม) · ส่วนสะพานบอร์ดงานเป็น "ของแถม":
//    พังแล้วห้ามพา consumer หลักล้ม ไม่งั้นคิวทั้งระบบตันเพราะฟีเจอร์เสริมใบเดียว → try/catch + WARN
const compose =
  (base: OutboxHandler, extra: OutboxHandler): OutboxHandler =>
  async (evt) => {
    await base(evt); // งานเดิมของ event นี้ — พฤติกรรมห้ามเปลี่ยน
    try {
      await extra(evt);
    } catch (e) {
      await logOps("WARN", "outbox", `สะพานบอร์ดงานของ "${evt.type}" ล้มเหลว`, {
        tenantId: evt.tenantId,
        detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
    }
  };

/**
 * เรียกสะพานบอร์ดงานแบบ **dynamic import**
 * 🔴 ตั้งใจไม่ import ที่หัวไฟล์: `kanban-bridges` → `kanban/links` → … → `kanban/comments` ซึ่ง import
 *    `scheduleDrain` กลับมาที่ไฟล์นี้ ⇒ วงกลมของโมดูล (ESM รันได้แต่ลำดับ init เสี่ยง TDZ)
 *    วิธีเดียวกับที่ `kanban.inbox.requested` ใช้กับ `kanban/inbox` อยู่แล้ว
 */
const kanbanBridge =
  (name: "onFormSubmission" | "onApprovalSubmitted" | "onApprovalDecided" | "onAccountDocSettled" | "onLeaveSubmitted" | "onVoidedSale"): OutboxHandler =>
  async (evt) => {
    const bridges = await import("@/lib/platform/kanban-bridges");
    await bridges[name](evt);
  };

/**
 * K3.4 — ขาออกของบอร์ดงาน ("การ์ดปิดแล้ว → บอกปลายทางที่ผูกไว้") · dynamic import ด้วยเหตุผลเดียวกับ
 * `kanbanBridge` ข้างบน (`kanban-outbound` → `chat/service` → … → `scheduleDrain` กลับมาที่ไฟล์นี้)
 */
const kanbanOutbound =
  (name: "cardCompleted"): OutboxHandler =>
  async (evt) => {
    const outbound = await import("@/lib/platform/kanban-outbound");
    await outbound[name](evt);
  };

/**
 * M2.6 — บัตรกำนัลขายแล้ว/ถูกใช้ → บันทึกลงไทม์ไลน์ของเจ้าของบัตร
 * เจ้าของอาจเป็น null (บัตรที่พิมพ์แจก/ส่งให้คนนอกระบบ) หรือถูกลบ/รวมไปแล้วก่อนคิวจะมาถึง
 * ⇒ ถือเป็นงานเสร็จเงียบ ๆ (ห้าม throw ให้ event ค้าง PENDING ตลอดกาล — แบบเดียวกับ chatContactLinked)
 */
const giftCardActivity =
  (kind: "SOLD" | "USED"): OutboxHandler =>
  async (evt) => {
    const p = (evt.payload ?? {}) as {
      giftCardId?: unknown;
      number?: unknown;
      satang?: unknown;
      balanceAfter?: unknown;
      ownerCustomerId?: unknown;
    };
    const giftCardId = typeof p.giftCardId === "string" ? p.giftCardId : null;
    if (!giftCardId) return;
    const card = await prisma.giftCard.findFirst({
      where: { id: giftCardId, tenantId: evt.tenantId },
      select: { number: true, ownerCustomerId: true, balanceSatang: true },
    });
    const customerId = card?.ownerCustomerId ?? (typeof p.ownerCustomerId === "string" ? p.ownerCustomerId : null);
    if (!card || !customerId) return;
    const stillExists = await prisma.customer.findFirst({
      where: { id: customerId, tenantId: evt.tenantId },
      select: { id: true },
    });
    if (!stillExists) return;
    const satang = typeof p.satang === "number" ? p.satang : 0;
    const baht = (n: number) => (n / 100).toLocaleString("th-TH");
    await memberLogActivity({
      tenantId: evt.tenantId,
      customerId,
      module: "giftcard",
      type: kind === "SOLD" ? "GIFTCARD_SOLD" : "GIFTCARD_USED",
      refType: "GiftCard",
      refId: giftCardId,
      summary:
        kind === "SOLD"
          ? `ได้รับบัตรกำนัล ${card.number} มูลค่า ฿${baht(satang)}`
          : `ใช้บัตรกำนัล ${card.number} ฿${baht(satang)} (เหลือ ฿${baht(card.balanceSatang)})`,
    });
  };

/**
 * M2.3 (§9.1 §9.2) — สแตมป์การ์ดจากบิล/จากนัด
 *
 * 🔴 dynamic import ด้วยเหตุผลเดียวกับ `kanbanBridge`: `stamp/service` → `member/access` →
 *    … → `scheduleDrain` กลับมาที่ไฟล์นี้ = วงกลมของโมดูล
 * 🔴 เป็น "ของแถม" ท้าย handler เดิมเสมอ (ผ่าน `compose`) — สแตมป์พังห้ามพาการลงบัญชีขายล้ม
 *    ไม่งั้น event ค้าง PENDING แล้ว post บัญชีซ้ำตอน retry
 */
const stampFromSale: OutboxHandler = async (evt) => {
  const saleId = saleIdOf(evt.payload);
  if (!saleId) return;
  const { autoStampFromSaleEvent } = await import("@/lib/modules/stamp");
  await autoStampFromSaleEvent(evt.tenantId, saleId);
};

/** บิลถูกยกเลิก → ตราที่บิลนั้นให้ไว้ต้องหายไปด้วย (idempotent · ยิงซ้ำได้) */
const stampVoidForSale: OutboxHandler = async (evt) => {
  const saleId = saleIdOf(evt.payload);
  if (!saleId) return;
  const { voidStampsForSaleEvent } = await import("@/lib/modules/stamp");
  await voidStampsForSaleEvent(evt.tenantId, saleId);
};

/**
 * M2.8 (§9.1 §11.5) — สะพาน "การขาย × ระบบสมาชิก" หลังบิลปิด/ถูกยกเลิก
 * (ยอดสะสม · แต้มตามกฎร้าน · สแตมป์ · ที่มาซื้อครั้งแรก · เลื่อนระดับ · ไทม์ไลน์)
 *
 * 🔴 **บิล/บัญชีต้องไม่ล้มเพราะฝั่งสมาชิก**: ครอบ try/catch เองที่นี่ (ไม่พึ่ง `compose` ชั้นนอก
 *    เพื่อให้ข้อความ WARN บอกได้ว่าเป็นสะพานสมาชิก ไม่ใช่บอร์ดงาน) → event ยัง DONE ตามปกติ
 *    ไม่งั้น event ค้าง PENDING แล้ว drain รอบหน้าจะ post บัญชีซ้ำ
 * 🔴 dynamic import ด้วยเหตุผลเดียวกับ `kanbanBridge`/`stampFromSale`: `member-bridges` →
 *    `member/index` → … → `pos/service` → `scheduleDrain` กลับมาที่ไฟล์นี้ = วงกลมของโมดูล
 */
const memberSaleBridge =
  (name: "onPosSalePaid" | "onPosSaleVoided"): OutboxHandler =>
  async (evt) => {
    const saleId = saleIdOf(evt.payload);
    if (!saleId) return;
    try {
      const bridges = await import("@/lib/member-bridges");
      await bridges[name](evt.tenantId, saleId);
    } catch (e) {
      await logOps("WARN", "member", `สะพานสมาชิกของ "${evt.type}" ล้มเหลว (บิล ${saleId}) — บิลและบัญชีไม่กระทบ`, {
        tenantId: evt.tenantId,
        detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
    }
  };

/** ลูกค้ามาตามนัดจริง (Appointment → DONE) → สแตมป์ชนิด "จองที่มาจริง" */
const stampFromVisit: OutboxHandler = async (evt) => {
  const p = evt.payload as { appointmentId?: unknown } | null;
  const appointmentId = p && typeof p.appointmentId === "string" ? p.appointmentId : null;
  if (!appointmentId) return;
  const { autoStampFromVisitEvent } = await import("@/lib/modules/stamp");
  await autoStampFromVisitEvent(evt.tenantId, appointmentId);
};

const baseConsumers: Record<string, OutboxHandler> = {
  // M2.3: + สแตมป์การ์ดจากบิล (ต่อท้าย post บัญชีเดิม · บิลขายบัตรกำนัลถูกข้ามในตัว handler เอง)
  // M2.8: + สะพานสมาชิก (ยอดสะสม/แต้ม/สแตมป์/ที่มา/ระดับ/ไทม์ไลน์) — ย้ายออกจาก tx ของบิลมาที่คิวนี้
  "pos.sale.paid": withAutomation(compose(compose(posSalePaid, stampFromSale), memberSaleBridge("onPosSalePaid"))),
  // K3.3: + การ์ด "ตรวจสอบบิลยกเลิก" เมื่อยอดถึงเกณฑ์ที่ร้านตั้งไว้ (สวิตช์ปิดอยู่ = ไม่มีอะไรเกิด)
  // M2.3: + ยกเลิกตราของบิลใบนั้น (voidStampsForSale)
  // M2.8: + คืนสิทธิ์ทุกชนิด + ย้อนแต้ม/ยอดสะสม/ไทม์ไลน์ของบิลที่ถูกยกเลิก
  "pos.sale.voided": withAutomation(
    compose(compose(compose(posSaleVoided, kanbanBridge("onVoidedSale")), stampVoidForSale), memberSaleBridge("onPosSaleVoided")),
  ),
  // M2.3 (§9.2) — นัดเปลี่ยนเป็น "มาแล้ว" · ยิงจาก `booking/service.ts#setAppointmentStatus`
  "booking.completed": withAutomation(stampFromVisit),
  // M3.3 (§7.1) — นัดเปลี่ยนเป็น "ไม่มาตามนัด" · ยิงจาก `booking/service.ts#setAppointmentStatus`
  //   no-op ที่ห้ามล้ม: ปิด event เป็น DONE (ไม่ให้คิวตัน) + เป็นทริกเกอร์ของ journey "จองแล้วไม่มา" + เว็บฮุค
  "booking.no_show": withAutomation(async () => {}),
  // K3.3: + การ์ดติดตามคำขออนุมัติ (มอบหมายผู้ยื่น) — ต่อท้าย notify เดิม
  "approval.request.submitted": withAutomation(compose(approvalSubmitted, kanbanBridge("onApprovalSubmitted"))),
  // K3.3: + ความเห็น "ผลอนุมัติ: …" ที่การ์ดติดตาม + ปิดการ์ดเมื่อผ่าน (ต่อท้าย notify+effect เดิม)
  "approval.request.approved": withAutomation(compose(withApprovalEffect(approvalApproved), kanbanBridge("onApprovalDecided"))),
  "approval.request.rejected": withAutomation(compose(withApprovalEffect(approvalRejected), kanbanBridge("onApprovalDecided"))),
  // WO-0038: AppNotification ถูกสร้างแล้วใน sweepExpiringLots — consumer นี้มีไว้ปิด event เป็น DONE
  // (ไม่งั้นค้าง PENDING โดน drain วนตลอด) + เป็นจุดให้ Automation rules ยิงตามกติกาที่ร้านตั้ง
  "inventory.lot.expiring": withAutomation(async () => {}),
  // Wave4-A: AppNotification "ลูกค้าทักเข้ามา" ถูกสร้างแล้วใน chat.announceInbound (de-dup) —
  // consumer นี้ปิด event เป็น DONE + เป็นจุดให้ Automation rules / Webhooks ยิงราย inbound message
  // WO 7.2: + ดูดรูปบิลที่แนบมาในข้อความเข้ากล่องขาเข้าของบัญชี (เฉพาะร้านที่เปิด inboxFromChat)
  //   งานนี้ต้อง **ไม่ทำให้ consumer ล้ม** ถ้าฝั่งบัญชีมีปัญหา (ไม่งั้น event แชทค้าง PENDING ทั้งคิว)
  "chat.message.received": withAutomation(async (evt) => {
    try {
      await chatInboundToAccountInbox(evt);
    } catch (e) {
      await logOps("WARN", "outbox", "ดูดไฟล์จากแชทเข้ากล่องขาเข้าบัญชีไม่สำเร็จ", {
        tenantId: evt.tenantId,
        detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
    }
  }),
  // WO-C2 (§3.4): แอดมินตอบ / เธรดเปลี่ยนสถานะ — ผลข้างเคียงเกิดใน service ไปแล้ว
  // consumer เป็น no-op เพื่อ **ปิด event เป็น DONE** (ไม่มี handler = ค้าง PENDING ตลอดกาล
  // พร้อม lastError "ไม่มี consumer…" — outbox.ts:111) + เป็นจุดให้ Automation/Webhooks ยิงต่อ
  // ตัวที่ส่งออกจริงคือ withWebhooks ข้างล่าง → SiamDive รับ chat.message.sent ไปส่ง push
  "chat.message.sent": withAutomation(async () => {}),
  // WO-C3b: คำตอบของทีมงานที่ระบบภายนอก "สะท้อน" เข้ามา (`/api/v1/chat/replies`)
  // 🔴 แยก type จาก `chat.message.sent` โดยเจตนา — ตัวนั้นแปลว่า "แอดมินใน SHARK ตอบ" และ
  // WO-C6 ผูกไว้กับการ push แจ้งลูกค้า · ยิงกลับไปหาระบบที่เพิ่งส่งข้อความนั้นเอง = push ซ้ำ
  // และวนลูปได้ · ตัวนี้แปลว่า "คัดลอกเข้ามาแล้ว ไม่ต้องส่งอะไรต่อ" — no-op เพื่อปิด event เป็น DONE
  // (ไม่มี handler = ค้าง PENDING ตลอดกาล — outbox.ts:111) + เป็นจุดให้ Automation/Webhooks ยิงต่อ
  "chat.message.mirrored": withAutomation(async () => {}),
  "chat.conversation.status": withAutomation(async () => {}),
  // 🔴 30 ส.ค. 2026 — เพิ่ม type ใหม่แล้ว **ลืมลงทะเบียนตรงนี้** ⇒ event ค้าง PENDING
  //    พร้อม lastError "ไม่มี consumer…" · webhook ไม่เคยถูกยิง ⇒ ติ๊กคู่ ✓✓ ไม่มีวันขึ้น
  //    (ข้อสอบ CP-6 สแกนซอร์สแล้วเทียบกับตารางนี้ ห้ามให้เกิดซ้ำ)
  //    ผลข้างเคียงเกิดใน markRead ไปแล้ว — no-op เพื่อปิด event เป็น DONE + ให้ withWebhooks ยิงต่อ
  "chat.conversation.read": withAutomation(async () => {}),
  // M1.12 — ผูกห้องแชทเข้ากับสมาชิก (auto/manual) → เขียนไทม์ไลน์สมาชิก (ดู handler ด้านบน)
  "chat.contact.linked": withAutomation(chatContactLinked),
  // Wave4-B: AppNotification "มีคนกรอกฟอร์ม" ถูกสร้างแล้วใน submitPublicForm —
  // consumer นี้ปิด event เป็น DONE + เป็นจุดให้ Automation rules / Webhooks ยิงราย lead ใหม่
  // K3.3: + เปิดการ์ดจากฟอร์ม (คำตอบทุกข้ออยู่ในรายละเอียดการ์ด) เฉพาะร้านที่เปิดสวิตช์
  "forms.submission.received": withAutomation(compose(async () => {}, kanbanBridge("onFormSubmission"))),
  // Wave4-C: AppNotification "ได้รับมอบหมายงาน" ถูกสร้างแล้วใน kanban.notifyAssignment —
  // consumer ปิด event DONE + จุดให้ Automation/Webhooks ยิงเมื่อมอบหมายการ์ด
  "kanban.card.assigned": withAutomation(async () => {}),
  // K1.4 — ย้ายการ์ดข้ามคอลัมน์ / การ์ดเข้าคอลัมน์ "เสร็จ" (ยิงจาก `kanban/moves.ts` ใน tx เดียวกับการย้าย)
  //   🔴 ผลข้างเคียงเกิดในโมดูลไปแล้ว (position/sortOrder/completedAt) — consumer เป็น no-op เพื่อ
  //      **ปิด event เป็น DONE** (ไม่มี handler = ค้าง PENDING ตลอดกาลแล้วคิวทั้งระบบตันตามไปด้วย
  //      — บทเรียน 30 ส.ค. 2026) + เป็นจุดให้ Automation rules (§7.3) และ `withWebhooks` ยิงต่อ
  //      ตัวปิดงานที่ผูกไว้ (ขาออก K3.4) เสียบอยู่ที่ `kanban.card.completed` ด้านล่างแล้ว
  "kanban.card.moved": withAutomation(async () => {}),
  // K1.15 — การ์ดใบใหม่ / การ์ดถูกเก็บเข้าคลัง (ยิงจาก `kanban/service.ts#createCard` และ
  // `kanban/cards.ts#archiveCard` ใน tx เดียวกับการเขียนแถว) · ยังไม่มีผลข้างเคียงภายใน
  // (ฮุคขาออก + กฎอัตโนมัติของร้านเป็นผู้บริโภคจริง) — แต่ต้องลงทะเบียนไว้ ไม่งั้นคิวตันเงียบ ๆ
  "kanban.card.created": withAutomation(async () => {}),
  // 🔴 K3.4 §9.3: "เก็บเข้าคลัง" **ไม่ใช่** "ปิดงาน" ⇒ ห้ามต่อขาออกที่นี่ — เก็บการ์ดเพื่อจัดบ้าน
  //    แล้วลูกค้าได้ข้อความ "งานปิดแล้ว" ในห้องแชท คือผลข้างเคียงที่ไม่มีใครสั่ง (no-op โดยตั้งใจ)
  "kanban.card.archived": withAutomation(async () => {}),
  // K1.15 — เตือนกำหนดส่ง: ตัวยิงจริงมาใน P2 (K2.x) · ลงทะเบียนไว้ก่อนเพื่อให้ event ที่ประกาศใน
  // `webhooks/labels.ts` มีบ้านครบตั้งแต่วันแรก (บทเรียน: event ที่ไม่มี consumer = คิวตันทั้งระบบ)
  "kanban.card.due_soon": withAutomation(async () => {}),
  "kanban.card.overdue": withAutomation(async () => {}),
  // K3.4 (§9.3 "ย้อนกลับ"): + แปะบันทึกภายในในห้องแชทที่การ์ดผูกไว้ / รอยประวัติของเอกสารบัญชี
  //   🔴 ต่อท้ายด้วย `compose` เหมือนสะพานขาเข้า — ขาออกพังห้ามพา consumer หลักล้ม (WARN แล้วไปต่อ)
  "kanban.card.completed": withAutomation(compose(async () => {}, kanbanOutbound("cardCompleted"))),
  // K1.7 — เช็คลิสต์ครบทุกข้อ (ยิงจาก `kanban/checklists.ts#toggleItem` ใน tx เดียวกับการติ๊ก)
  //   🔴 ผลข้างเคียง (done/doneAt/doneById) เกิดในโมดูลไปแล้ว — consumer เป็น no-op เพื่อ
  //      **ปิด event เป็น DONE** (ไม่มี handler = ค้าง PENDING ตลอดกาล — บทเรียน 30 ส.ค. 2026)
  //      + เป็นจุดให้ Automation rules (§7.3) และ `withWebhooks` ยิงต่อ
  "kanban.checklist.completed": withAutomation(async () => {}),
  // K1.8 — มีความเห็นใหม่ในการ์ด (ยิงจาก `kanban/comments.ts#addComment` ใน tx เดียวกับการสร้างแถว)
  //   🔴 แจ้งเตือนคนที่ถูก @mention ถูกส่งไปแล้วในโมดูล (ยิงตรงคน ไม่ผ่านคิว — ต้องถึงทันทีแม้คิวยาว)
  //      consumer เป็น no-op เพื่อ **ปิด event เป็น DONE** + เป็นจุดให้ Automation rules/Webhooks ยิงต่อ
  "kanban.comment.added": withAutomation(async () => {}),
  // K2.8 (§9.2 "การ์ดเกิดจากที่อื่น"): แชท/อีเมล/ฟอร์ม/ผู้ช่วย AI ยิง `kanban.inbox.requested` มาขอ
  // "จดงานไว้ให้คนคนหนึ่ง" ก่อน (ยังไม่ใช่การ์ด) — composition root เป็นคนอ่าน payload ดิบแล้วส่งต่อให้
  // facade `kanban/inbox.ts#addFromSource` (โมดูล kanban ไม่รู้จักแชท/ฟอร์ม/อีเมลตรง ๆ — ทิศทางเดียว)
  // idempotent ด้วย `sourceKey` (ยิงซ้ำ/retry ของ consumer = ไม่มีรายการที่สอง) · ตัวยิงจริงมาใน K3.3
  // (`sourceKey = "chat:{messageId}"` ตาม §9.2) — ลงทะเบียนไว้ก่อนกันคิวตันเงียบ ๆ (บทเรียน 30 ส.ค. 2026)
  "kanban.inbox.requested": withAutomation(async (evt) => {
    if (!evt.systemId) return;
    const p = evt.payload as {
      ownerUserId?: unknown;
      source?: unknown;
      sourceKey?: unknown;
      title?: unknown;
      note?: unknown;
      fileIds?: unknown;
    };
    if (typeof p.ownerUserId !== "string" || typeof p.sourceKey !== "string" || typeof p.title !== "string") return;
    try {
      const { addFromSource } = await import("@/lib/modules/kanban/inbox");
      await addFromSource(
        { tenantId: evt.tenantId, systemId: evt.systemId, actorUserId: null },
        {
          ownerUserId: p.ownerUserId,
          source: typeof p.source === "string" ? p.source : "MANUAL",
          sourceKey: p.sourceKey,
          title: p.title,
          note: typeof p.note === "string" ? p.note : undefined,
          fileIds: Array.isArray(p.fileIds) ? p.fileIds.filter((f): f is string => typeof f === "string") : [],
        },
      );
    } catch (e) {
      await logOps("WARN", "outbox", "เพิ่มรายการกล่องงานเข้าจาก event ไม่สำเร็จ", {
        tenantId: evt.tenantId,
        detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
    }
  }),
  // K3.3 (§9.2) — พนักงานยื่นใบลา (ยิงจาก `hr/service.ts#requestLeave` หลังเขียนแถว)
  //   ผลข้างเคียงในโมดูล HR เกิดไปแล้ว — consumer นี้ปิด event เป็น DONE + เป็นจุดให้ Automation/Webhooks
  //   ยิงต่อ + ต่อสะพาน "การ์ดหาคนแทน" ของบอร์ดงาน (ร้านที่ไม่ได้เปิดสวิตช์ = ไม่มีอะไรเกิด)
  //   🔴 ขาดบรรทัดนี้ = event ค้าง PENDING ตลอดกาลแล้วคิวทั้งระบบตันตามไปด้วย (บทเรียน 30 ส.ค. 2026)
  "hr.leave.submitted": withAutomation(compose(async () => {}, kanbanBridge("onLeaveSubmitted"))),
  // WO 8.3 (§9.5 แอปภายนอก/API): เหตุการณ์บัญชี — ผลข้างเคียงเกิดในโมดูลบัญชีไปแล้ว
  //   consumer เป็น no-op เพื่อ **ปิด event เป็น DONE** (ไม่มี handler = ค้าง PENDING ตลอดกาล)
  //   + เป็นจุดให้ `withWebhooks` ยิงฮุคไปยังปลายทางที่ร้านสมัครไว้ (หน้า "แอปภายนอก/API")
  // K3.3: + ปิดการ์ดที่ผูกเอกสารใบนี้ไว้ (ขาเข้าอย่างเดียว — ไม่แตะสถานะเอกสารฝั่งบัญชี §9.3)
  "account.document.approved": withAutomation(compose(async () => {}, kanbanBridge("onAccountDocSettled"))),
  "account.payment.recorded": withAutomation(async () => {}),
  "account.invoice.paid": withAutomation(compose(async () => {}, kanbanBridge("onAccountDocSettled"))),
  "account.period.closed": withAutomation(async () => {}),
  // WO C4 — เหตุการณ์บัญชีชุดที่ 2 (ยิงจาก service ใน tx เดียวกับงานหลัก · ดู modules/account/events.ts)
  //   🔴 ทุกตัวต้องมีบรรทัดตรงนี้ **และ** ป้ายไทยใน webhooks/labels.ts
  //      ขาดตรงนี้ = event ค้าง PENDING ตลอดกาล และ **คิวทั้งระบบตันตามไปด้วย** (บทเรียน 30 ส.ค. 2026)
  "account.document.issued": withAutomation(async () => {}),
  "account.document.voided": withAutomation(async () => {}),
  "account.quotation.responded": withAutomation(async () => {}),
  "account.payment.voided": withAutomation(async () => {}),
  "account.payment_request.paid": withAutomation(async () => {}),
  "account.payment_request.expired": withAutomation(async () => {}),
  "account.contact.created": withAutomation(async () => {}),
  "account.contact.updated": withAutomation(async () => {}),
  "account.contact.merged": withAutomation(async () => {}),
  "account.product.created": withAutomation(async () => {}),
  "account.product.updated": withAutomation(async () => {}),
  // WO D4 — เหตุการณ์บัญชีชุดที่ 3 (เช็ค/กระทบยอด/งวด/สินทรัพย์/เอกสารประจำ — ดู modules/account/events.ts)
  //   🔴 ทุกตัวต้องมีบรรทัดตรงนี้ **และ** ป้ายไทยใน webhooks/labels.ts (บทเรียน 30 ส.ค. 2026)
  "account.cheque.changed": withAutomation(async () => {}),
  "account.reconcile.confirmed": withAutomation(async () => {}),
  "account.period.reopened": withAutomation(async () => {}),
  "account.asset.depreciated": withAutomation(async () => {}),
  "account.asset.disposed": withAutomation(async () => {}),
  "account.recurring.ran": withAutomation(async () => {}),
  // ── ระบบสมาชิก v2 (M1.4 · พิมพ์เขียว 06-member-v2 §7.1) ──────────────────────
  // 🔴 ทั้ง 5 ตัวเป็น **no-op ที่ห้ามล้ม**: ของจริงถูกเขียนครบใน transaction ของ service แล้ว
  //    (สมาชิก/ยินยอม/ที่มา/ไทม์ไลน์/บันทึกการดู) — consumer มีไว้ 3 อย่างเท่านั้น
  //    (1) ปิด event เป็น DONE ไม่ให้ค้าง PENDING แล้วคิวทั้งระบบตัน (บทเรียน 30 ส.ค. 2026)
  //    (2) เป็นจุดให้กฎอัตโนมัติ/journey ยิง (withAutomation)  (3) ยิงเว็บฮุคออกนอกระบบ (withWebhooks)
  //    ผลข้างเคียงจริง (แต้มต้อนรับ · แนะนำเพื่อน · sync ชื่อไปแชท/CRM) มาที่ M1.8/M1.9/M3.x
  //    ผ่าน composition root `member-bridges.ts` — ตอนนั้นค่อยต่อท้ายด้วย compose() เหมือนบอร์ดงาน
  "member.created": withAutomation(async (evt) => {
    // M3.6 — ต้อนรับสมาชิกใหม่ (notifications.send ผ่าน notifyMember ท้ายบล็อกนี้)
    // M3.5 — แนะนำเพื่อน (payload.referrerId): ผูก referral + ประเมิน SIGNUP · `createMember` ทำไปแล้วทันที
    //   ตัวนี้คือตาข่ายเก็บตก (idempotent) · ข้อมูลใช้ไม่ได้ (โค้ด/คนหาย) = WARN แล้วจบ ไม่ให้คิวค้าง
    //   ความผิดพลาดชั่วคราว (DB) = โยนต่อให้ drain retry ตามปกติ
    try {
      await referralOnMemberCreated({ tenantId: evt.tenantId, systemId: evt.systemId, payload: evt.payload });
    } catch (e) {
      const status = (e as { status?: unknown } | null)?.status;
      if (status !== 400 && status !== 404) throw e;
      await logOps("WARN", "member", "แนะนำเพื่อนของสมาชิกใหม่ผูกไม่สำเร็จ — ข้ามรายการนี้", {
        tenantId: evt.tenantId,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
    // M3.6 — ต้อนรับสมาชิกใหม่ (notifications.send เช็คยินยอม/quiet hours/สวิตช์เปิดปิดเองครบ)
    const p = evt.payload as { customerId?: unknown } | null;
    if (p && typeof p.customerId === "string") await notifyMember(evt.tenantId, p.customerId, "WELCOME");
  }),
  "member.updated": withAutomation(async () => {}),
  "member.merged": withAutomation(async () => {}),
  "member.identity.linked": withAutomation(async () => {}),
  // ── ระดับสมาชิก (M1.9 · §7.1) ──
  // 🔴 no-op เหมือนกลุ่มบน: ประวัติระดับ (MemberTierHistory) + คอลัมน์ของ Customer ถูกเขียนครบใน
  //    transaction ของ `member/tiers.ts` แล้ว · ตัวนี้มีไว้ปิด event เป็น DONE (ไม่ให้คิวตัน) +
  //    เป็นทริกเกอร์ให้กฎอัตโนมัติ/journey + ยิงเว็บฮุคออกนอกระบบ
  //    การ**แจ้งเตือนลูกค้า** ("คุณขึ้นเป็น Gold แล้ว" / "อีก 30 วันจะหลุดระดับ") — M3.6 ต่อสายแล้ว
  "member.tier.changed": withAutomation(async (evt) => {
    // M3.6 — notifications.send(TIER_UP) เฉพาะ "ขึ้น" ระดับ (ไม่แจ้งตอนลด/คงระดับ) — เทียบ sortOrder
    const p = evt.payload as { customerId?: unknown; from?: unknown; to?: unknown } | null;
    const customerId = p && typeof p.customerId === "string" ? p.customerId : null;
    const fromKey = p && typeof p.from === "string" ? p.from : null;
    const toKey = p && typeof p.to === "string" ? p.to : null;
    if (!customerId || !toKey) return;
    if (!fromKey) return; // การตั้งระดับแรกเริ่ม (ไม่มี "จาก") ไม่ใช่การ "เลื่อนขึ้น" ที่ต้องยินดีด้วย
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId: evt.tenantId }, select: { memberSystemId: true } });
    if (!customer) return;
    const defs = await prisma.memberTierDef.findMany({
      where: { tenantId: evt.tenantId, systemId: customer.memberSystemId, key: { in: [fromKey, toKey] } },
      select: { key: true, sortOrder: true },
    });
    const from = defs.find((d) => d.key === fromKey);
    const to = defs.find((d) => d.key === toKey);
    if (from && to && to.sortOrder > from.sortOrder) await notifyMember(evt.tenantId, customerId, "TIER_UP");
  }),
  "member.tier.at_risk": withAutomation(async (evt) => {
    const p = evt.payload as { customerId?: unknown } | null;
    if (p && typeof p.customerId === "string") await notifyMember(evt.tenantId, p.customerId, "TIER_AT_RISK");
  }),
  // ── ทริกเกอร์รอบเวลาของ journey (M3.3 · §7.3 §7.5) ──
  // 🔴 cron รายวัน `emitJourneyCronEvents` ยิงให้ (เฉพาะค่าที่มี journey เปิดใช้อยู่) · ตัวงานจริงคือ journey
  //    ที่ withAutomation เรียกต่อ — handler หลักเป็น no-op เพื่อปิด event เป็น DONE (ขาดบรรทัดนี้ = คิวตัน)
  "member.birthday.upcoming": withAutomation(async () => {}),
  "member.inactive": withAutomation(async () => {}),
  "member.tier.review_due": withAutomation(async () => {}),
  // ── ความยินยอมของสมาชิก (M1.7 · D19 · §7.1) ──
  // 🔴 no-op เหมือนกลุ่มบน: แถว MemberConsent + คอลัมน์ marketingConsent ถูกเขียนครบใน transaction
  //    ของ `member/privacy.setConsent` แล้ว · ตัวนี้มีไว้ปิด event เป็น DONE (ไม่ให้คิวตัน) + เป็น
  //    ทริกเกอร์ของกฎอัตโนมัติ/journey (เช่น "ลูกค้าถอนความยินยอม → หยุดส่งแคมเปญ") + ยิงเว็บฮุค
  "member.consent.changed": withAutomation(async () => {}),
  // ── แต้ม v2 (M2.1 · §7.1) ──
  // 🔴 no-op เหมือนกลุ่มบน: ledger/ล็อต/ยอดคงเหลือถูกเขียนครบใน transaction ของ `point/lots.ts` แล้ว
  //    ตัวนี้มีไว้ 3 อย่าง (1) ปิด event เป็น DONE ไม่ให้คิวตัน (2) เป็นทริกเกอร์ของกฎอัตโนมัติ/journey
  //    (3) ยิงเว็บฮุคออกนอกระบบ · การ**แจ้งลูกค้า** ("แต้มจะหมดอายุ 7 วัน") เป็นงานของ M3.6
  //    `point.transferred` ยังไม่มีใครยิงจนกว่าจะถึง M2.2 — ลงทะเบียนไว้พร้อมกันเพราะเป็นชุดเดียวกัน
  "point.earned": withAutomation(async (evt) => {
    const p = evt.payload as { customerId?: unknown; points?: unknown } | null;
    const customerId = p && typeof p.customerId === "string" ? p.customerId : null;
    const points = p && typeof p.points === "number" ? p.points : null;
    if (customerId && points) await notifyMember(evt.tenantId, customerId, "POINTS_EARNED", { แต้ม: points });
  }),
  "point.burned": withAutomation(async () => {}),
  "point.expiring": withAutomation(async (evt) => {
    const p = evt.payload as { customerId?: unknown; points?: unknown; expiresAt?: unknown; lotId?: unknown; daysLeft?: unknown } | null;
    const customerId = p && typeof p.customerId === "string" ? p.customerId : null;
    const points = p && typeof p.points === "number" ? p.points : null;
    const expiresAt = p && typeof p.expiresAt === "string" ? p.expiresAt : null;
    if (!customerId || !points) return;
    const vars: Record<string, string | number> = { แต้มที่จะหมด: points, วันหมดอายุ: expiresAt ? formatThaiDate(expiresAt) : "" };
    // idempotent ต่อ (ล็อต, วันที่เหลือ) — refId กันแจ้งซ้ำถ้า event ถูกยิงซ้ำ (drain retry / ผู้ดูแลกดรันเอง)
    const refId = `point.expiring:${typeof p?.lotId === "string" ? p.lotId : ""}:${typeof p?.daysLeft === "number" ? p.daysLeft : ""}`;
    await notifyMember(evt.tenantId, customerId, "POINTS_EXPIRING", vars, refId);
  }),
  "point.expired": withAutomation(async () => {}),
  "point.transferred": withAutomation(async () => {}),
  // ── บัตรกำนัล (M2.6 · §7.1) ──
  // ของจริง (ตัวบัตร/รายการบนบัตร/บิล POS/เอกสารบัญชี) ถูกเขียนครบใน transaction ของ `giftcard/service.ts`
  // แล้ว — consumer นี้ทำงานจริง 1 อย่าง: **เขียนไทม์ไลน์ของเจ้าของบัตร** (บัตรที่ยังไม่มีเจ้าของในระบบ
  // = ไม่มีใครให้บันทึก จบเงียบ ๆ) + ปิด event เป็น DONE + เป็นจุดให้กฎอัตโนมัติ/เว็บฮุคยิงต่อ
  "giftcard.sold": withAutomation(giftCardActivity("SOLD")),
  "giftcard.used": withAutomation(giftCardActivity("USED")),
  // ── สแตมป์การ์ด (M2.3 · §7.1) ──
  // 🔴 no-op เหมือนกลุ่มแต้ม/สมาชิก: ใบสะสม · รายการตรา · รางวัล (แต้ม) ถูกเขียนครบใน transaction
  //    ของ `stamp/service.ts` แล้ว · 3 บรรทัดนี้มีไว้ (1) ปิด event เป็น DONE ไม่ให้คิวตัน
  //    (2) เป็นทริกเกอร์ของกฎอัตโนมัติ/journey ("ครบใบแล้วส่ง LINE บอกลูกค้า" = งานของ M3.x)
  //    (3) ยิงเว็บฮุคออกนอกระบบ
  "stamp.added": withAutomation(async () => {}),
  "stamp.completed": withAutomation(async (evt) => {
    const p = evt.payload as { customerId?: unknown } | null;
    if (p && typeof p.customerId === "string") await notifyMember(evt.tenantId, p.customerId, "STAMP_COMPLETE");
  }),
  "stamp.expired": withAutomation(async () => {}),
  // ── รางวัล v2 (M2.4 · §7.1) ──
  // 🔴 no-op เหมือนกลุ่มแต้ม/สแตมป์: รายการแลก/สต็อก/แต้ม-สแตมป์ที่หัก ถูกเขียนครบใน transaction
  //    ของ `reward/v2.ts` แล้ว · 2 บรรทัดนี้มีไว้ (1) ปิด event เป็น DONE ไม่ให้คิวตัน
  //    (2) เป็นทริกเกอร์ของกฎอัตโนมัติ/journey ("แลกของรางวัลแล้ว" / "รับของแล้ว") (3) ยิงเว็บฮุคออกนอกระบบ
  "reward.redeemed": withAutomation(async () => {}),
  "reward.fulfilled": withAutomation(async () => {}),
  // ── voucher (M2.5 · §7.1) ──
  // 🔴 no-op เหมือนกลุ่มแต้ม/สแตมป์: ตัวใบ · ไทม์ไลน์ของสมาชิก · สถานะ USED/EXPIRED ถูกเขียนครบใน
  //    transaction ของ `voucher/service.ts` (และของ cron รายวัน) แล้ว · 4 บรรทัดนี้มีไว้
  //    (1) ปิด event เป็น DONE ไม่ให้คิวตัน (2) เป็นทริกเกอร์ของกฎอัตโนมัติ/journey
  //    (3) ยิงเว็บฮุคออกนอกระบบ · การ **แจ้งลูกค้า** ("voucher ใหม่" / "อีก 7 วันหมดอายุ") = M3.6
  //    `voucher.used` ยังเป็นตัวที่ M3.2 ใช้นับผลแคมเปญ (trackUse) ต่อไป
  "voucher.issued": withAutomation(async (evt) => {
    // M3.6 — notifications.send(VOUCHER_NEW) · CAMPAIGN/JOURNEY ออก voucher แล้วส่งข้อความของตัวเองที่ฝัง voucher อยู่แล้ว (M3.2/M3.3)
    // แจ้งซ้ำอีกรอบ = ลูกค้าได้ 2 ข้อความสำหรับ 1 ใบ ⇒ ข้ามเฉพาะ 2 ที่มานี้ ที่เหลือ (ต้อนรับขึ้นระดับ/
    // สแตมป์/แลกแต้ม/แนะนำเพื่อน/พนักงานออกให้เอง/ระบบภายนอก) แจ้งตามปกติ
    const p = evt.payload as { customerId?: unknown; origin?: unknown; code?: unknown } | null;
    const customerId = p && typeof p.customerId === "string" ? p.customerId : null;
    const origin = p && typeof p.origin === "string" ? p.origin : null;
    if (!customerId || origin === "CAMPAIGN" || origin === "JOURNEY") return;
    const code = p && typeof p.code === "string" ? p.code : "";
    await notifyMember(evt.tenantId, customerId, "VOUCHER_NEW", { voucher: code });
  }),
  // M3.2 — voucher ที่ **แคมเปญแนบไปให้** ถูกใช้ = ผลของแคมเปญใบนั้น (ยกความดี + อัปสถิติ variant)
  //   ใบที่ไม่ได้มาจากแคมเปญ → `trackUseFromVoucher` จบเงียบ ๆ (ไม่มีผู้รับให้ผูก)
  "voucher.used": withAutomation(async (evt) => {
    await marketing.trackUseFromVoucher({ tenantId: evt.tenantId, payload: evt.payload });
  }),
  "voucher.expiring": withAutomation(async () => {}),
  "voucher.expired": withAutomation(async () => {}),
  // ดูข้อมูลอ่อนไหว: แถว MemberAccessLog ถูกเขียนไปแล้วตอนเปิดดู (privacy.logAccess)
  // ตัวนี้จึงมีไว้ให้ระบบภายนอกที่ทำหน้าที่ "เฝ้าการเข้าถึงข้อมูลส่วนบุคคล" รับต่อผ่านเว็บฮุค
  "member.sensitive.viewed": withAutomation(async () => {}),
  // ── แคมเปญ (M3.2 · §7.1) ──
  // 🔴 no-op เหมือนกลุ่มแต้ม/voucher: ผู้รับ · สถิติ variant · สรุปที่ตัวแคมเปญ ถูกเขียนครบใน
  //    `marketing/campaigns.ts` ตอนส่งจบแล้ว · บรรทัดนี้มีไว้ (1) ปิด event เป็น DONE ไม่ให้คิวตัน
  //    (2) เป็นทริกเกอร์ของกฎอัตโนมัติ/journey ("ส่งแคมเปญแล้ว → เปิดการ์ดตามผล")
  //    (3) ยิงเว็บฮุคออกนอกระบบ (แดชบอร์ดการตลาดของร้าน)
  "campaign.sent": withAutomation(async () => {}),
  // ── รีวิว (M3.4 · §7.1) ──
  // 🔴 no-op แบบกลุ่มแคมเปญ: ส่งลิงก์ LINE · ให้แต้ม · เปิดการ์ด ≤ N ดาว · ส่งคำตอบให้ลูกค้า ทำครบใน
  //    `member/reviews.ts` ตอนเกิดเหตุการณ์แล้ว (ลูกค้าต้องได้ผลทันทีหน้าจอ LIFF ไม่ใช่รอคิว) · บรรทัดนี้มีไว้
  //    (1) ปิด event เป็น DONE ไม่ให้คิวตัน (2) ทริกเกอร์กฎอัตโนมัติ (3) ยิงเว็บฮุคออกนอกระบบ
  "review.requested": withAutomation(async () => {}),
  "review.received": withAutomation(async () => {}),
  "review.replied": withAutomation(async () => {}),
  // ── แนะนำเพื่อน (M3.5 · §7.1) ──
  // 🔴 no-op แบบกลุ่มรีวิว: แถว Referral · ไทม์ไลน์ผู้แนะนำ · แต้ม/voucher สองฝั่ง ถูกเขียนครบใน
  //    `member/referrals.ts` แล้ว · บรรทัดนี้มีไว้ (1) ปิด event เป็น DONE ไม่ให้คิวตัน
  //    (2) ทริกเกอร์กฎอัตโนมัติ/journey ("แนะนำสำเร็จ → ขอบคุณผู้แนะนำ") (3) ยิงเว็บฮุคออกนอกระบบ
  "referral.joined": withAutomation(async () => {}),
  "referral.converted": withAutomation(async () => {}),
  // B1 — ธีม/ตราสินค้าของกิจการเปลี่ยน (ยิงจาก `branding/service.ts#setBranding` ใน tx เดียวกับแถว)
  //   ทำงานจริง 1 อย่าง: ล้างแคชธีมของ **อินสแตนซ์ที่ระบายคิว** (อินสแตนซ์ที่กดบันทึกล้างไปแล้วเอง)
  //   ที่เหลือปล่อยให้ `withWebhooks` ยิงต่อ → แอป/ระบบภายนอกที่แคชโลโก้-สีไว้จะได้รู้ว่าต้องดึงใหม่
  //   🔴 ต้องมีบรรทัดนี้เสมอ ไม่งั้น event ค้าง PENDING แล้วคิวทั้งระบบตันตามไปด้วย (บทเรียน 30 ส.ค. 2026)
  "tenant.branding.updated": withAutomation(async (evt) => {
    invalidateBrandingCache(evt.tenantId);
  }),
};

// ห่อทุก consumer ด้วย withWebhooks → ทุก event ที่ drain สำเร็จจะ dispatch ฮุคให้อัตโนมัติ
export const consumers: Record<string, OutboxHandler> = Object.fromEntries(
  Object.entries(baseConsumers).map(([type, handler]) => [type, withWebhooks(handler)]),
);

export async function drainAll() {
  registerMemberHooks();
  return drainOutbox(consumers);
}

/**
 * ระบายคิวหลังตอบ response — ใช้แทน `void drainAll().catch(() => {})` ทุกที่
 *
 * 🔴 บั๊กจริงที่เจ้าของเจอ 1 ก.ย. 2026 ("ส่งข้อความไม่ออก"):
 *    `void drainAll()` เป็น floating promise · บน Vercel แลมบ์ดาถูก **แช่แข็งทันทีที่ response จบ**
 *    งานที่ยังค้างอยู่จึงถูกตัดกลางคัน ⇒ event ค้างในคิวจนกว่า cron รายชั่วโมงจะมาเก็บ
 *    วัดจาก prod: ข้อความของทีมหน่วง **557–600 วินาที** กว่าจะถึงลูกค้า (ของเดิมหน่วง 0 วิ)
 *    กรณีแย่สุด = รอถึงนาทีที่ 0 ของชั่วโมงถัดไป ≈ เกือบ 1 ชม.
 *
 * `after()` ของ Next บอกรันไทม์ว่า "ยังมีงานค้าง อย่าเพิ่งตัด" (บน Vercel ผูกกับ waitUntil)
 * ⇒ ผู้ใช้ไม่ต้องรอ (ไม่ได้ await ก่อนตอบ) แต่ของก็ไม่หาย
 *
 * ⚠️ `after()` เรียกได้เฉพาะในบริบทของคำขอ — สคริปต์/ข้อสอบ/cron ที่เรียก service ตรง ๆ
 *    จะโยน error ⇒ ตกกลับไปใช้แบบเดิมซึ่งใช้ได้ดีนอก serverless
 */
export function scheduleDrain(): void {
  try {
    after(() => {
      void drainAll().catch(() => {});
    });
  } catch {
    void drainAll().catch(() => {});
  }
}
