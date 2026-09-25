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
import { applyApprovalEffect, applyCrmApprovalEffect } from "@/lib/approval-effects";
import { logOps as logOpsRaw } from "@/lib/core/ops";
import { invalidateBrandingCache } from "@/lib/branding/service";
import { formatThaiDate } from "@/lib/ui/date";
import { runForEvent as runJourneysForEvent } from "@/lib/modules/member";
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

// ── 🔴 AUDIT L12: บันทึกเหตุการณ์ระบบห้ามมีข้อมูลติดต่อของลูกค้าแบบดิบ ─────────────────────
//
// error/stack ของสะพานมักลากข้อความอย่าง "บิล <เลขใบเสร็จ> ผูกกับสมาชิก…" ติดมาด้วย และเลขใบเสร็จ/
// ข้อความของโมดูลอาจมีเบอร์หรืออีเมลของลูกค้าอยู่ · OpsEvent เปิดอ่านจากหน้าผู้ดูแลแพลตฟอร์ม
// และถูกส่งต่อเข้าอีเมลแจ้งเตือนของ level ERROR ⇒ ปิดบังทั้ง `message` และ `detail` ก่อนเขียนเสมอ
//   • เลขติดกัน ≥ 7 หลัก = เบอร์ / เลขบัตรประชาชน / เลขบัญชี (เลขสั้นอย่างจำนวนเงิน/บรรทัดของ stack ไม่โดน)
//   • อีเมล = ปิดทั้งใบ (ส่วนหน้า @ คือตัวระบุตัวบุคคล)
const redactPii = (text: string): string =>
  text.replace(/\d{7,}/g, "[ตัวเลขถูกปิดบัง]").replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[อีเมลถูกปิดบัง]");

/**
 * `logOps` ของไฟล์นี้ — **ปิดบัง PII ให้ก่อนเสมอ** แล้วค่อยส่งต่อให้ตัวจริง (`logOpsRaw`)
 * จงใจตั้งชื่อทับของเดิม: ทุกจุดในไฟล์นี้เรียก `logOps(...)` เหมือนเดิม จึงไม่มีทางหลุดด่านปิดบังโดยไม่ตั้งใจ
 */
async function logOps(
  level: "ERROR" | "WARN" | "INFO",
  source: string,
  message: string,
  opts?: { detail?: string; tenantId?: string },
): Promise<void> {
  await logOpsRaw(level, source, redactPii(message), {
    ...(opts ?? {}),
    ...(opts?.detail ? { detail: redactPii(opts.detail) } : {}),
  });
}

/**
 * ข้อความของ error (ใช้ stack ถ้ามี) — รูปเดียวกันทุกจุดที่เขียน detail ของ OpsEvent
 * CRM C1.8 ▸ AUDIT-CLASS X8: error ของ Prisma/driver adapter (validation · known request · DriverAdapterError · …) พาค่าของฟิลด์ (ชื่อ/เบอร์/อีเมล/คำตอบฟอร์ม) ติดมาใน
 *   message/stack ได้ ⇒ เก็บแค่ "ชื่อชนิด + code" · error อื่นยังผ่าน redactPii ของ `logOps` ตามเดิม ◂
 */
const errDetail = (e: unknown): string => {
  if (e instanceof Error && /^(PrismaClient|DriverAdapter)/.test(e.name)) {
    const code = (e as { code?: unknown }).code;
    return `${e.name}${typeof code === "string" ? ` ${code}` : ""}`;
  }
  return e instanceof Error ? (e.stack ?? e.message) : String(e);
};

// ── การแจ้งเตือนสมาชิก (M3.6 · §5.10 §8.x) ──────────────────────────────────
// 🔴 event เหล่านี้ (แต้ม/สแตมป์/voucher) ถูกยิงด้วย `systemId` ของระบบต้นทาง (POINT/STAMP อาจไม่ใช่
//    ระบบสมาชิกโดยตรง) ⇒ resolve ระบบสมาชิกจริงจาก `Customer.memberSystemId` เสมอ (แบบเดียวกับ
//    `journeys.ts#runForEvent` ที่ไม่พึ่ง `evt.systemId`) ไม่ใช่ใช้ `evt.systemId` ตรง ๆ
// 🔴 ตัวส่งจริง (LINE ผ่านแชท) มาจาก composition root `member-journey-senders.ts` — dynamic import
//    เพื่อไม่ให้ไฟล์นี้ผูกกับโมดูลแชทตอนโหลด (ไม่ได้เกี่ยวกับ F2 ที่นี่ — composition root อยู่นอก
//    src/lib/modules อยู่แล้ว — แต่คงรูปแบบ dynamic import เดียวกับ journey/webhooks ด้านบนเพื่อความสม่ำเสมอ)
// 🔴 AUDIT H6 (ครึ่งของคิว): ส่ง `eventId` = id ของ event ในคิวไปด้วยทุกครั้ง — redelivery/drain ซ้อน
//    ของ event เดิมจะถูก `notifications.send` ตัดทิ้งด้วยกุญแจนี้ (ลูกค้าไม่ได้ LINE/SMS/อีเมลซ้ำ)
//    ผู้เรียกที่มีคีย์ของตัวเองอยู่แล้ว (`point.expiring` = ล็อต × วันที่เหลือ) ส่ง `refId` มาทับได้เหมือนเดิม
async function notifyMember(
  evt: { id: string; tenantId: string },
  customerId: string,
  key: string,
  vars?: Record<string, string | number>,
  refId?: string,
): Promise<void> {
  const tenantId = evt.tenantId;
  try {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { memberSystemId: true } });
    if (!customer) return; // สมาชิกถูกลบ/รวมไปแล้วก่อนคิวจะมาถึง — ไม่มีใครให้แจ้งแล้ว (ปกติของ outbox)
    const notifications = await import("@/lib/modules/member/notifications");
    const { notificationSenders } = await import("@/lib/member-journey-senders");
    await notifications.send(
      { tenantId, systemId: customer.memberSystemId, actorUserId: null },
      { event: key, customerId, ...(vars ? { vars } : {}), ...(refId ? { refId } : {}), eventId: evt.id },
      { deps: notificationSenders },
    );
  } catch (e) {
    await logOps("WARN", "outbox", `แจ้งเตือนสมาชิก "${key}" ล้มเหลว`, { tenantId, detail: errDetail(e) });
  }
}

// M1.12 (§7.1 §9.3) — ผูกห้องแชทเข้ากับสมาชิกแล้ว → ไทม์ไลน์สมาชิก
// M3.7 — ตัวเขียนย้ายไป `member-bridges.ts#onChatContactLinked` (แถว CHANNEL_LINKED · recordOnce ต่อผู้ติดต่อ ·
//   สมาชิกถูกลบก่อนคิวมาถึง = จบเงียบเหมือนเดิม) — ดู `memberBridge` ด้านล่าง

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
    // 🔴 AUDIT M10: งานหลักพัง = ยัง "ล้ม" เหมือนเดิม (drain retry/backoff) แต่ **ห้ามโยนตรงนี้**
    //    ของเดิมโยนทันที ⇒ กฎอัตโนมัติ/journey/เว็บฮุคของ event นั้นไม่เคยได้วิ่งเลยเมื่อขาบัญชีล้ม
    //    (ร้านตั้ง journey "ปิดบิลแล้วขอบคุณลูกค้า" ไว้ แล้วเงียบสนิทเพราะผังบัญชียังไม่ได้ตั้ง)
    //    ⇒ เก็บ error ไว้ก่อน วิ่งชั้นที่เหลือให้ครบ แล้วค่อยโยนท้ายสุด
    let failure: unknown = null;
    try {
      await handler(evt);
    } catch (e) {
      await logOps("ERROR", "outbox", `handler "${evt.type}" ล้มเหลว`, { tenantId: evt.tenantId, detail: errDetail(e) });
      failure = e;
    }
    try {
      // CRM C2.1 ▸ ส่ง id (กุญแจกันซ้ำจาก OutboxEvent) + systemId (ระบบของ event) ต่อให้เอนจิน — กฎ CRM ใช้ทั้งสองช่อง · v1 ไม่อ่าน ◂
      await runForEvent({ tenantId: evt.tenantId, type: evt.type, payload: evt.payload, id: evt.id, systemId: evt.systemId });
    } catch (e) {
      // automation ล้มเหลว = เรื่องรอง — event หลัก DONE ตามปกติ · แค่บันทึก WARN
      await logOps("WARN", "outbox", `automation ของ "${evt.type}" ล้มเหลว`, { tenantId: evt.tenantId, detail: errDetail(e) });
    }
    // M3.3 — journey อัตโนมัติของระบบสมาชิก (best-effort แบบเดียวกับ automation: พังห้ามล้ม consumer หลัก)
    //   ส่ง `id` ของ event ไปด้วย → เอนจินอ่าน idempotencyKey เป็นกุญแจกันวน (ตรงกับตอนเรียกตรงจาก cron/ข้อสอบ)
    //   ตัวส่งจริง (แชท/บอร์ดงาน) โหลดแบบ dynamic — `member-journey-senders` → chat/kanban → … → ไฟล์นี้ = วงกลม
    if (JOURNEY_TRIGGER_EVENTS.has(evt.type)) {
      try {
        const { journeySenders } = await import("@/lib/member-journey-senders");
        await runJourneysForEvent({ tenantId: evt.tenantId, type: evt.type, payload: evt.payload, id: evt.id }, { deps: journeySenders });
      } catch (e) {
        await logOps("WARN", "outbox", `journey ของ "${evt.type}" ล้มเหลว`, { tenantId: evt.tenantId, detail: errDetail(e) });
      }
    }
    // 🔴 AUDIT M10: รายงานความล้มของงานหลักท้ายสุด — event ยังถูก retry เหมือนเดิม
    //    (ขั้นที่วิ่งไปแล้ว idempotent ทุกตัว: ธงยอดสะสม · คีย์แต้ม · คีย์ตรา · eventKey ของ journey · ฮุคยิงรอบเดียวต่อ event)
    if (failure) throw failure;
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
const approvalMeta = (payload: unknown): { entityType: string; entityId: string; requestId: string } => {
  const p = (payload ?? {}) as { entityType?: unknown; entityId?: unknown; requestId?: unknown };
  return {
    entityType: typeof p.entityType === "string" ? p.entityType : "",
    entityId: typeof p.entityId === "string" ? p.entityId : "",
    requestId: typeof p.requestId === "string" ? p.requestId : "",
  };
};

// 🔴 AUDIT L13: คิวยิงซ้ำได้เสมอ (lease หมด · ขั้นหลังล้มแล้ว drain รอบถัดไป) — ของเดิม `create` ตรง ๆ
//    ⇒ ทีมเห็นใบแจ้ง "มีคำขออนุมัติใหม่" ซ้ำหลายใบสำหรับคำขอเดียว · ตารางแจ้งเตือนไม่มีคอลัมน์คีย์
//    (เพิ่ม = migration ซึ่ง run นี้ห้าม) ⇒ ผูก "รหัสคำขอ" ไว้ในเนื้อความ แล้วเช็คก่อนสร้าง
//    (รหัสมีประโยชน์กับทีมอยู่แล้ว — ใช้อ้างอิงคำขอได้ตรงใบ) · ไม่มีรหัส = สร้างตามเดิม (ห้ามกลืนใบของคนอื่น)
const approvalNotify =
  (title: (label: string) => string, body: string): OutboxHandler =>
  async (evt) => {
    const { entityType, entityId, requestId } = approvalMeta(evt.payload);
    const ref = requestId || entityId;
    const notifTitle = title(entityLabel(entityType));
    const notifBody = ref ? `${body} (รหัสคำขอ ${ref})` : body;
    if (ref) {
      const dup = await prisma.appNotification.findFirst({
        where: { tenantId: evt.tenantId, title: notifTitle, body: notifBody },
        select: { id: true },
      });
      if (dup) return; // แจ้งไปแล้วสำหรับคำขอใบนี้ — retry ห้ามแจ้งซ้ำ
    }
    await prisma.appNotification.create({
      data: { tenantId: evt.tenantId, title: notifTitle, body: notifBody },
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
/**
 * 🔴 AUDIT M10: ยิงฮุค **รอบเดียวต่อ event** — ตอนนี้ event ที่งานหลักล้มยังยิงฮุคอยู่ และถูก retry ได้ถึง 5 รอบ
 *    ถ้าไม่กัน ปลายทางของร้านจะได้ของใบเดียวกัน 5 ใบ (ระบบภายนอกส่วนใหญ่ไม่ได้กันซ้ำให้)
 *    ตาราง `WebhookDelivery` ไม่มีคอลัมน์อ้าง event (เพิ่ม = migration ซึ่ง run นี้ห้าม) ⇒ ใช้ "รอบแรกของ event"
 *    เป็นเกณฑ์: `attempts === 0` คือยังไม่เคยมีรอบไหนล้ม · ใบที่ยิงแล้วปลายทางไม่รับ มี cron `retryFailedWebhooks`
 *    ตามเก็บให้ต่อ (backoff ต่อใบ) ⇒ ไม่ต้องอาศัยการ retry ของคิวเพื่อส่งซ้ำ
 *    เรียกนอกคิว (ข้อสอบ/สคริปต์เรียก consumer ตรง) = ไม่มีแถว event → ยิงตามปกติ
 */
async function webhooksAlreadyDispatched(evt: { id: string }): Promise<boolean> {
  const row = await prisma.outboxEvent.findUnique({ where: { id: evt.id }, select: { attempts: true } });
  return !!row && row.attempts > 0;
}

const withWebhooks =
  (handler: OutboxHandler): OutboxHandler =>
  async (evt) => {
    // 🔴 AUDIT M10: งานหลักพัง = ฮุคยังต้องออก (ร้าน/ระบบภายนอกต้องรู้ว่าเกิดเหตุการณ์แล้ว)
    //    แล้วค่อยโยน error ท้ายสุดเพื่อให้คิว retry ตามเดิม
    let failure: unknown = null;
    try {
      await handler(evt);
    } catch (e) {
      failure = e;
    }
    try {
      if (!(await webhooksAlreadyDispatched(evt))) {
        await dispatchWebhooks({ tenantId: evt.tenantId, type: evt.type, payload: evt.payload });
      }
    } catch (e) {
      await logOps("WARN", "outbox", `webhook ของ "${evt.type}" ล้มเหลว`, { tenantId: evt.tenantId, detail: errDetail(e) });
    }
    if (failure) throw failure;
  };

// ── K3.3 (§9.2 "การ์ดเกิดจากที่อื่น"): ต่อสะพาน "โมดูลอื่น → บอร์ดงาน" ท้าย handler เดิม ──
//
// 🔴 `compose` = "ของเดิมก่อนเสมอ แล้วค่อยของใหม่" — notify/effect/bridge บัญชีที่มีอยู่ต้องทำงาน
//    เหมือนเดิมเป๊ะ (พังก็โยนต่อให้ drain retry เหมือนเดิม) · ส่วนสะพานบอร์ดงานเป็น "ของแถม":
//    พังแล้วห้ามพา consumer หลักล้ม ไม่งั้นคิวทั้งระบบตันเพราะฟีเจอร์เสริมใบเดียว → try/catch + WARN
// 🔴 AUDIT M10 (แก้ 17 ก.ย.): ของเดิม `await base(evt)` โยนทันทีที่งานเดิมล้ม ⇒ ขั้นของแถมทั้งสาย
//    (สะพานสมาชิก · สแตมป์ · บอร์ดงาน) ไม่ได้วิ่งเลย · ผลจริง: ร้านที่ยังไม่ได้ตั้งผังบัญชี ปิดบิลแล้ว
//    ลูกค้าไม่ได้แต้ม/ยอดสะสม/ตรา **ทั้งร้าน เงียบ ๆ** จนกว่าจะมีคนไปเปิดดู lastError ของคิว
//    ตอนนี้: ทุกขั้นวิ่งเสมอ แล้วรวมความล้มเหลวเป็นใบเดียวโยนท้ายสุด ⇒ event ถูก retry ตามเดิม
//    (ทุกขั้นเป็น idempotent จึงวิ่งซ้ำตอน retry ได้ — ธงยอดสะสม · คีย์แต้ม/ตรา · sourceKey ของการ์ด)
//    ของแถมที่ล้มยังเขียน WARN บอกว่าเป็น "ของแถม" เหมือนเดิม และ **ไม่ทำให้คิวตัน**: event ที่ล้มถูกถอย
//    ด้วย backoff และหยุดที่ 5 ครั้ง (FAILED) ไม่ได้ขวาง event ตัวอื่นในคิว
//    🔴 สะพานสมาชิก/ไทม์ไลน์ยังกลืน error ของตัวเองอยู่ (ดู memberSaleBridge/memberBridge) —
//       "ไทม์ไลน์ขาดไปแถวหนึ่ง" จึงยังไม่ทำให้บิลของร้านค้างคิวเหมือนเดิม
const compose =
  (base: OutboxHandler, extra: OutboxHandler): OutboxHandler =>
  async (evt) => {
    const errors: unknown[] = [];
    try {
      await base(evt); // งานเดิมของ event นี้
    } catch (e) {
      errors.push(e);
    }
    try {
      await extra(evt); // ของแถม — วิ่งเสมอ แม้งานเดิมจะล้ม
    } catch (e) {
      await logOps("WARN", "outbox", `ขั้นเสริม (สะพานบอร์ดงาน/สมาชิก) ของ "${evt.type}" ล้มเหลว`, {
        tenantId: evt.tenantId,
        detail: errDetail(e),
      });
      // 🔴 Fable (ตรวจรับ S2): ของแถมล้ม = WARN เท่านั้น **ไม่โยนต่อ** — คงสัญญาเดิมของ compose
      //    ("ของแถมพังห้ามพา consumer หลักล้ม") · ถ้าโยน งานหลักที่สำเร็จแล้วจะถูก retry ซ้ำเพราะฟีเจอร์เสริม
    }
    // งานเดิมล้ม → โยนท้ายสุด (หลังของแถมวิ่งแล้ว) ให้คิว retry ตามเดิม
    if (errors.length) throw errors[0];
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

// CRM C1.6 ▸ การ์ดบอร์ดงานปิด → ปิดกิจกรรม CRM ที่ผูกการ์ด (dynamic import: crm → … → scheduleDrain ที่ไฟล์นี้ = วงกลมถ้า import หัวไฟล์)
const crmKanbanCardCompleted: OutboxHandler = async (evt) => {
  const crm = await import("@/lib/modules/crm");
  await crm.activities.onKanbanCardCompleted(evt);
};
// ◂ CRM C1.6

// CRM C1.8 ▸ สะพาน "โมดูลอื่น ⇄ CRM v2" (`src/lib/platform/crm-bridges/` · พิมพ์เขียว §7.1 §7.2 §9 · มติ C11 C12)
//   🔴 ทุกตัวเป็น "ของแถม" ใต้ `compose` เสมอ: ล้ม = WARN (ของ compose) ไม่ทำให้ event ล้ม · งานหลักล้ม = ของแถมยังวิ่ง
//   🔴 dynamic import (crm/member/account → … → scheduleDrain ที่ไฟล์นี้ = วงโหลดไฟล์ — เหตุผลเดียวกับ kanbanBridge/memberBridge)
//   🔴 ประตู (uiVersion 2 + settings.crm.bridgesEnabled · R-E.14) อยู่ในตัวสะพานเอง — ยกเว้น lead จากฟอร์มของระบบ v1 (มติผู้คุมงาน C1.8 ข้อ 1)
//      และสะพานสมาชิกเดิม `onCrmDealWon` (ไม่ผ่านที่นี่)
type CrmBridgeName =
  | "onFormLead"
  | "onFormTimeline"
  | "onChatMessage"
  | "onQuotationResponded"
  | "onDocumentIssued"
  | "onAccountContactMerged"
  | "onMemberCreated"
  | "onMemberMerged"
  | "onCrmTimelineEvent"
  | "onCustomRecordCreated"
  // CRM C2.2 ▸ หยุดลำดับการติดตามอัตโนมัติ (crm-bridges/sequences.ts) ◂
  | "onDealWonStopSequences"
  | "onDealLostStopSequences"
  | "onContactOptOutStopSequences"
  // CRM C2.4 ▸ ห้องแชทปิด → กิจกรรมชนิด CHAT ใบเดียวต่อห้อง (crm-bridges/chat.ts) ◂
  | "onChatConversationStatus"
  // CRM C2.7 ▸ ทางเดินเงิน (crm-bridges/money.ts) — บัญชี/หน้าร้าน → ยอดเงินของดีล ◂
  | "onPaymentRecorded"
  | "onInvoicePaid"
  | "onPaymentVoided"
  | "onDocumentVoided"
  | "onPosSalePaid"
  | "onPosSaleVoided"
  | "onDealWonAutoInvoice"
  // CRM C2.9 ▸ เหตุการณ์ธุรกิจของ 8 โมดูล — ตัวรับ **ตัวเดียว** (crm-bridges/business.ts) ◂
  | "onBusinessEvent"
  // CRM C2.8 ▸ คะแนนผู้ติดต่อ (crm-bridges/scoring.ts) — ของแถมใต้ compose ในตัวบริโภคของทุก event ที่กฎคะแนนอ้างได้ ◂
  | "onScoringEvent";

const crmBridge =
  (name: CrmBridgeName): OutboxHandler =>
  async (evt) => {
    const bridges = await import("@/lib/platform/crm-bridges");
    await bridges[name](evt);
  };

/**
 * ขั้นแรกที่ retry ได้ (มติผู้คุมงาน C1.8 ข้อ 2 · 6): `first` วิ่งก่อนทุกชั้น — ล้ม ⇒ โยนทันที ⇒ event ล้ม ⇒ คิวส่งใหม่
 *   และ `rest` (งานหลักเดิม + automation + journey + ของแถม) ยังไม่ได้วิ่ง ⇒ ไม่มี automation/แจ้งเตือนซ้ำตอน retry ·
 *   เว็บฮุคยิงรอบแรกของ event ครั้งเดียวอยู่แล้ว (`withWebhooks` · attempts === 0)
 * 🔴 `first` ต้อง idempotent (ธงใต้ล็อก) และต้องโยนเฉพาะความล้มชั่วคราว — ข้อมูลใช้ไม่ได้ถาวรให้ WARN แล้วจบเอง (ไม่งั้นขวาง `rest` ถึง FAILED)
 */
const crmFirst =
  (first: OutboxHandler, rest: OutboxHandler): OutboxHandler =>
  async (evt) => {
    await first(evt);
    await rest(evt);
  };

/** ผลอนุมัติชนิด `crm.*` (ส่วนลดเกินเพดานของดีล · crm.reassign รับทราบ) — ขั้นแรกที่ retry ได้ (ดู `crmFirst`) */
const crmApprovalEffect: OutboxHandler = async (evt) => {
  if (evt.type !== "approval.request.approved" && evt.type !== "approval.request.rejected") return;
  await applyCrmApprovalEffect({ tenantId: evt.tenantId, type: evt.type, payload: evt.payload });
};
// ◂ CRM C1.8

// M2.6 — บัตรกำนัลขายแล้ว/ถูกใช้ → ไทม์ไลน์ของเจ้าของบัตร
// M3.7 — ตัวเขียนย้ายไป `member-bridges.ts#onLoyaltyEvent` (recordOnce · เจ้าของว่าง/ถูกลบ = จบเงียบเหมือนเดิม)

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
        detail: errDetail(e),
      });
    }
  };

/**
 * M3.7 (§4.3 §7.1 §8) — ไทม์ไลน์ประวัติสมาชิก: ทุกโมดูล → MemberActivity ผ่าน composition root `member-bridges.ts`
 *
 * 🔴 ห่อ try/catch เองทุกตัว (แบบ `memberSaleBridge`): ไทม์ไลน์เป็น "บันทึกประกอบ" — พังแล้วต้องไม่พางานหลัก
 *    ของ event (บัญชี · แจ้งเตือน · บอร์ดงาน · journey) ล้ม และต้องไม่ทำให้ event ค้าง PENDING ⇒ WARN แล้ว DONE
 *    (ทุกขั้นในสะพาน idempotent อยู่แล้ว — replay ด้วยมือได้ถ้าต้องการเก็บตก)
 * 🔴 dynamic import ด้วยเหตุผลเดียวกับ `memberSaleBridge` (member-bridges → member/index → … → scheduleDrain = วงกลม)
 */
type MemberEventBridge =
  | "onChatContactLinked"
  | "onChatMessageReceived"
  | "onKanbanCardCompleted"
  | "onCrmDealWon"
  | "onShopOrderPaid"
  | "onPointEvent"
  | "onTierChanged"
  | "onLoyaltyEvent";

const memberBridge =
  (name: MemberEventBridge): OutboxHandler =>
  async (evt) => {
    try {
      const bridges = await import("@/lib/member-bridges");
      await bridges[name](evt);
    } catch (e) {
      await logOps("WARN", "member", `ไทม์ไลน์สมาชิกของ "${evt.type}" บันทึกไม่สำเร็จ — งานหลักของเหตุการณ์ไม่กระทบ`, {
        tenantId: evt.tenantId,
        detail: errDetail(e),
      });
    }
  };

/** M3.7 — นัดหมาย "มาแล้ว" / "ไม่มา" → ไทม์ไลน์ (+ สแตมป์ตาข่าย · แต้ม CHECKIN · ขอรีวิว) · ห่อ try/catch แบบเดียวกัน */
const memberApptBridge =
  (name: "onBookingCompleted" | "onBookingNoShow"): OutboxHandler =>
  async (evt) => {
    const p = evt.payload as { appointmentId?: unknown } | null;
    const appointmentId = p && typeof p.appointmentId === "string" ? p.appointmentId : null;
    if (!appointmentId) return;
    try {
      const bridges = await import("@/lib/member-bridges");
      await bridges[name](evt.tenantId, appointmentId);
    } catch (e) {
      await logOps("WARN", "member", `ไทม์ไลน์สมาชิกของ "${evt.type}" บันทึกไม่สำเร็จ (นัด ${appointmentId})`, {
        tenantId: evt.tenantId,
        detail: errDetail(e),
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
  // CRM C2.7 ▸ + ทางเดินเงินของ CRM (บิลที่แคชเชียร์ผูกไว้กับดีล → paidSatang) — ต่อ **ท้ายสุด** เสมอ:
  //   บัญชี (posSalePaid) → ตรา (stampFromSale) → สมาชิก (memberSaleBridge) → CRM · ทุกตัวก่อนหน้าทำงานเหมือนเดิมทุกประการ ◂
  "pos.sale.paid": withAutomation(compose(compose(compose(posSalePaid, stampFromSale), memberSaleBridge("onPosSalePaid")), crmBridge("onPosSalePaid"))),
  // K3.3: + การ์ด "ตรวจสอบบิลยกเลิก" เมื่อยอดถึงเกณฑ์ที่ร้านตั้งไว้ (สวิตช์ปิดอยู่ = ไม่มีอะไรเกิด)
  // M2.3: + ยกเลิกตราของบิลใบนั้น (voidStampsForSale)
  // M2.8: + คืนสิทธิ์ทุกชนิด + ย้อนแต้ม/ยอดสะสม/ไทม์ไลน์ของบิลที่ถูกยกเลิก
  // CRM C2.7 ▸ + ถอนคืนยอดของบิลที่ถูกยกเลิก (เฉพาะที่เคยนับ) — ต่อท้ายสุดเช่นกัน ◂
  "pos.sale.voided": withAutomation(
    compose(compose(compose(compose(posSaleVoided, kanbanBridge("onVoidedSale")), stampVoidForSale), memberSaleBridge("onPosSaleVoided")), crmBridge("onPosSaleVoided")),
  ),
  // M2.3 (§9.2) — นัดเปลี่ยนเป็น "มาแล้ว" · ยิงจาก `booking/service.ts#setAppointmentStatus`
  // M3.7: + ไทม์ไลน์ VISIT (+ แถวจองย้อนหลัง) · แต้มโบนัส CHECKIN · ขอรีวิว (ร้านที่เปิดรีวิว) — สแตมป์ของ M2.3 ยังเป็นงานหลัก (พัง = retry เหมือนเดิม)
  // CRM C2.9 ▸ + ไทม์ไลน์ CRM ของ Party ที่ผูกนัด (กิจกรรม VISIT ใบเดียว + ขั้นลูกค้า) — ต่อ **ท้ายสุด** ใต้ compose:
  //   สแตมป์ (M2.3) และไทม์ไลน์สมาชิก (M3.7) วิ่งก่อนเหมือนเดิมทุกประการ · ล้ม = WARN ไม่ทำให้ event ล้ม
  //   🔴 `booking.no_show` **ไม่** ต่อสะพานนี้: คนไม่มาตามนัด ไม่ใช่ "มาใช้บริการ" ⇒ ไม่มีกิจกรรม VISIT และห้ามเลื่อนขั้นเป็นลูกค้า ◂
  "booking.completed": withAutomation(compose(compose(stampFromVisit, memberApptBridge("onBookingCompleted")), crmBridge("onBusinessEvent"))),
  // M3.3 (§7.1) — นัดเปลี่ยนเป็น "ไม่มาตามนัด" · ยิงจาก `booking/service.ts#setAppointmentStatus`
  //   ปิด event เป็น DONE (ไม่ให้คิวตัน) + เป็นทริกเกอร์ของ journey "จองแล้วไม่มา" + เว็บฮุค
  // M3.7: + ไทม์ไลน์ NO_SHOW (ห่อ try/catch — พังไม่ค้างคิว)
  "booking.no_show": withAutomation(memberApptBridge("onBookingNoShow")),
  // K3.3: + การ์ดติดตามคำขออนุมัติ (มอบหมายผู้ยื่น) — ต่อท้าย notify เดิม
  "approval.request.submitted": withAutomation(compose(approvalSubmitted, kanbanBridge("onApprovalSubmitted"))),
  // K3.3: + ความเห็น "ผลอนุมัติ: …" ที่การ์ดติดตาม + ปิดการ์ดเมื่อผ่าน (ต่อท้าย notify+effect เดิม)
  // CRM C1.8 ▸ + ผลอนุมัติ crm.* เป็นขั้นแรกที่ retry ได้ (crmFirst) — applyApprovalEffect ไม่แตะ crm.* แล้ว (ไม่ทำซ้ำสองที่) ◂
  "approval.request.approved": crmFirst(crmApprovalEffect, withAutomation(compose(withApprovalEffect(approvalApproved), kanbanBridge("onApprovalDecided")))),
  "approval.request.rejected": crmFirst(crmApprovalEffect, withAutomation(compose(withApprovalEffect(approvalRejected), kanbanBridge("onApprovalDecided")))),
  // WO-0038: AppNotification ถูกสร้างแล้วใน sweepExpiringLots — consumer นี้มีไว้ปิด event เป็น DONE
  // (ไม่งั้นค้าง PENDING โดน drain วนตลอด) + เป็นจุดให้ Automation rules ยิงตามกติกาที่ร้านตั้ง
  "inventory.lot.expiring": withAutomation(async () => {}),
  // Wave4-A: AppNotification "ลูกค้าทักเข้ามา" ถูกสร้างแล้วใน chat.announceInbound (de-dup) —
  // consumer นี้ปิด event เป็น DONE + เป็นจุดให้ Automation rules / Webhooks ยิงราย inbound message
  // WO 7.2: + ดูดรูปบิลที่แนบมาในข้อความเข้ากล่องขาเข้าของบัญชี (เฉพาะร้านที่เปิด inboxFromChat)
  //   งานนี้ต้อง **ไม่ทำให้ consumer ล้ม** ถ้าฝั่งบัญชีมีปัญหา (ไม่งั้น event แชทค้าง PENDING ทั้งคิว)
  // CRM C1.8 ▸ + ห้องแชท → Party → ผู้ติดต่อ CRM / lead (ถ้าร้านเปิด chatToLead) เป็นของแถมใต้ compose ◂
  "chat.message.received": withAutomation(compose(async (evt) => {
    try {
      await chatInboundToAccountInbox(evt);
    } catch (e) {
      await logOps("WARN", "outbox", "ดูดไฟล์จากแชทเข้ากล่องขาเข้าบัญชีไม่สำเร็จ", {
        tenantId: evt.tenantId,
        detail: errDetail(e),
      });
    }
    // M3.7 — ห้องที่ผูกสมาชิก → ไทม์ไลน์ "แชท" 1 แถวต่อห้องต่อวันไทย (memberBridge กลืน error เอง ไม่ล้มคิว)
    await memberBridge("onChatMessageReceived")(evt);
    // CRM C2.8 ▸ + คะแนนของกฎ "ทักแชทเข้ามา" (+5 · ไม่เกิน 1 ครั้ง/วัน) — ห่อไว้เอง: ชั้นนี้เป็น base ของ compose
    //   ⇒ ถ้าปล่อยให้โยน สะพานผู้ติดต่อ (`onChatMessage`) จะยังวิ่งแต่ event จะถูก retry ทั้งที่งานหลักสำเร็จแล้ว ◂
    try {
      await crmBridge("onScoringEvent")(evt);
    } catch (e) {
      await logOps("WARN", "outbox", `ให้คะแนนจากแชทไม่สำเร็จ (${evt.type})`, { tenantId: evt.tenantId, detail: errDetail(e) });
    }
  }, crmBridge("onChatMessage"))),
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
  // CRM C2.4 ▸ ห้องแชทถูกปิด (RESOLVED) → กิจกรรมชนิด CHAT **ใบเดียวต่อห้อง** ในระบบ CRM ที่มีผู้ติดต่อของ Party นั้น
  //   (+ สรุปด้วย AI เมื่อร้านเปิด `settings.crm.ai.chatSummary`) · เป็น "ของแถม" ใต้ compose: ล้ม = WARN ไม่ทำให้ event ล้ม
  //   งานหลักของ event นี้ยังเป็น no-op เหมือนเดิม (ผลข้างเคียงเกิดใน service ของแชทไปแล้ว — ที่นี่แค่ปิด event เป็น DONE) ◂
  "chat.conversation.status": withAutomation(compose(async () => {}, crmBridge("onChatConversationStatus"))),
  // 🔴 30 ส.ค. 2026 — เพิ่ม type ใหม่แล้ว **ลืมลงทะเบียนตรงนี้** ⇒ event ค้าง PENDING
  //    พร้อม lastError "ไม่มี consumer…" · webhook ไม่เคยถูกยิง ⇒ ติ๊กคู่ ✓✓ ไม่มีวันขึ้น
  //    (ข้อสอบ CP-6 สแกนซอร์สแล้วเทียบกับตารางนี้ ห้ามให้เกิดซ้ำ)
  //    ผลข้างเคียงเกิดใน markRead ไปแล้ว — no-op เพื่อปิด event เป็น DONE + ให้ withWebhooks ยิงต่อ
  "chat.conversation.read": withAutomation(async () => {}),
  // M1.12 — ผูกห้องแชทเข้ากับสมาชิก (auto/manual) → เขียนไทม์ไลน์สมาชิก
  // M3.7 — ย้ายตัวเขียนไปสะพาน (CHANNEL_LINKED · data.channel · recordOnce ต่อผู้ติดต่อ — replay ไม่ซ้ำ)
  "chat.contact.linked": withAutomation(memberBridge("onChatContactLinked")),
  // Wave4-B: AppNotification "มีคนกรอกฟอร์ม" ถูกสร้างแล้วใน submitPublicForm —
  // consumer นี้ปิด event เป็น DONE + เป็นจุดให้ Automation rules / Webhooks ยิงราย lead ใหม่
  // K3.3: + เปิดการ์ดจากฟอร์ม (คำตอบทุกข้ออยู่ในรายละเอียดการ์ด) เฉพาะร้านที่เปิดสวิตช์
  // CRM C1.8 ▸ lead เข้า CRM (ย้ายจากการเรียกตรงใน forms/service) = ขั้นแรกที่ retry ได้ (crmFirst · lead ต้องไม่หายเพราะล้มชั่วคราว)
  //   ระบบ = resolveFormCrmSystem(form) · crmContactId เขียนใน tx เดียวกับ lead · ไทม์ไลน์สมาชิก = ของแถมใต้ compose ◂
  // CRM C2.8 ▸ + คะแนนของกฎที่ผูกกับ "ลูกค้ากรอกฟอร์ม" (แต้มของ `FormDef.scoreOnSubmit` มาทางสะพานฟอร์มด้านบน — คนละใบ คนละกุญแจ) ◂
  "forms.submission.received": crmFirst(
    crmBridge("onFormLead"),
    withAutomation(compose(compose(compose(async () => {}, kanbanBridge("onFormSubmission")), crmBridge("onFormTimeline")), crmBridge("onScoringEvent"))),
  ),
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
  // M3.7: + ไทม์ไลน์ CARD_COMPLETED ของสมาชิกที่การ์ดผูก PARTY ไว้ (ห่อ try/catch — ไม่พาขาออกล้ม)
  // CRM C1.6 ▸ + ปิดกิจกรรม CRM ที่ผูกการ์ดนี้ (`crm.activities.onKanbanCardCompleted` · ของแถมใต้ compose — ล้ม = WARN ไม่พางานหลักล้ม ·
  //   ปิดครั้งเดียวด้วย conditional update ใน tx เดียวกับ `crm.activity.completed` ⇒ ส่งซ้ำ/พร้อมกันกี่รอบก็ผลเดียว — AUDIT-CLASS X4) ◂
  "kanban.card.completed": withAutomation(
    compose(compose(compose(async () => {}, kanbanOutbound("cardCompleted")), memberBridge("onKanbanCardCompleted")), crmKanbanCardCompleted),
  ),
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
        detail: errDetail(e),
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
  // CRM C2.7 ▸ ทางเดินเงิน: รับชำระ → CrmDealPayment(PAYMENT) + paidSatang/wonValueSatang/lifecycle/แคชบริษัท ·
  //   ใบแจ้งหนี้จ่ายครบ → ตรวจ "ชนะอัตโนมัติ" (ไม่เพิ่มยอดซ้ำ) — ทั้งคู่เป็นของแถมใต้ compose ◂
  "account.payment.recorded": withAutomation(compose(async () => {}, crmBridge("onPaymentRecorded"))),
  "account.invoice.paid": withAutomation(compose(compose(async () => {}, kanbanBridge("onAccountDocSettled")), crmBridge("onInvoicePaid"))),
  "account.period.closed": withAutomation(async () => {}),
  // WO C4 — เหตุการณ์บัญชีชุดที่ 2 (ยิงจาก service ใน tx เดียวกับงานหลัก · ดู modules/account/events.ts)
  //   🔴 ทุกตัวต้องมีบรรทัดตรงนี้ **และ** ป้ายไทยใน webhooks/labels.ts
  //      ขาดตรงนี้ = event ค้าง PENDING ตลอดกาล และ **คิวทั้งระบบตันตามไปด้วย** (บทเรียน 30 ส.ค. 2026)
  "account.document.issued": withAutomation(compose(async () => {}, crmBridge("onDocumentIssued"))), // CRM C1.8 ▸ ใบแจ้งหนี้จากใบเสนอราคาของดีล → invoiceDocId ◂
  "account.document.voided": withAutomation(compose(async () => {}, crmBridge("onDocumentVoided"))), // CRM C2.7 ▸ ธง "เอกสารถูกยกเลิก" ของดีล + ถอนคืนเงินของสายเอกสารนั้น ◂
  "account.quotation.responded": withAutomation(compose(async () => {}, crmBridge("onQuotationResponded"))), // CRM C1.8 ▸ ดีลย้ายขั้นตาม pipeline ◂
  "account.payment.voided": withAutomation(compose(async () => {}, crmBridge("onPaymentVoided"))), // CRM C2.7 ▸ ถอนคืนเฉพาะยอดที่เคยนับ (M10) ◂
  "account.payment_request.paid": withAutomation(async () => {}),
  "account.payment_request.expired": withAutomation(async () => {}),
  "account.contact.created": withAutomation(async () => {}),
  "account.contact.updated": withAutomation(async () => {}),
  "account.contact.merged": withAutomation(compose(async () => {}, crmBridge("onAccountContactMerged"))), // CRM C1.8 ▸ CrmCompany.accountContactId → ตัวที่เก็บ ◂
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
  "member.created": withAutomation(compose(async (evt) => {
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
    if (p && typeof p.customerId === "string") await notifyMember(evt, p.customerId, "WELCOME");
  }, crmBridge("onMemberCreated"))), // CRM C1.8 ▸ ผู้ติดต่อ CRM v2 ที่ Party เดียวกัน → memberCustomerId (ไม่ทับของเดิม) ◂
  "member.updated": withAutomation(async () => {}),
  "member.merged": withAutomation(compose(async () => {}, crmBridge("onMemberMerged"))), // CRM C1.8 ▸ ผู้ติดต่อที่ชี้สมาชิกที่ถูกรวม → ตัวที่เก็บ ◂
  "member.identity.linked": withAutomation(async () => {}),
  // ── ระดับสมาชิก (M1.9 · §7.1) ──
  // 🔴 no-op เหมือนกลุ่มบน: ประวัติระดับ (MemberTierHistory) + คอลัมน์ของ Customer ถูกเขียนครบใน
  //    transaction ของ `member/tiers.ts` แล้ว · ตัวนี้มีไว้ปิด event เป็น DONE (ไม่ให้คิวตัน) +
  //    เป็นทริกเกอร์ให้กฎอัตโนมัติ/journey + ยิงเว็บฮุคออกนอกระบบ
  //    การ**แจ้งเตือนลูกค้า** ("คุณขึ้นเป็น Gold แล้ว" / "อีก 30 วันจะหลุดระดับ") — M3.6 ต่อสายแล้ว
  // M3.7: + ไทม์ไลน์ TIER_CHANGED { from, to, reason ไทย+ตัวเลข } (ต่อท้ายด้วย compose · memberBridge กลืน error เอง)
  "member.tier.changed": withAutomation(compose(async (evt) => {
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
    if (from && to && to.sortOrder > from.sortOrder) await notifyMember(evt, customerId, "TIER_UP");
  }, memberBridge("onTierChanged"))),
  "member.tier.at_risk": withAutomation(async (evt) => {
    const p = evt.payload as { customerId?: unknown } | null;
    if (p && typeof p.customerId === "string") await notifyMember(evt, p.customerId, "TIER_AT_RISK");
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
  // M3.7: + ไทม์ไลน์ POINTS_EARNED / POINTS_BURNED / POINTS_EXPIRED (recordOnce ต่อ lot/event · แต้มของบิล/ออเดอร์
  //   แสดงบนแถวซื้ออยู่แล้ว ไม่ซ้ำอีกบรรทัด)
  "point.earned": withAutomation(compose(async (evt) => {
    const p = evt.payload as { customerId?: unknown; points?: unknown } | null;
    const customerId = p && typeof p.customerId === "string" ? p.customerId : null;
    const points = p && typeof p.points === "number" ? p.points : null;
    if (customerId && points) await notifyMember(evt, customerId, "POINTS_EARNED", { แต้ม: points });
  }, memberBridge("onPointEvent"))),
  "point.burned": withAutomation(memberBridge("onPointEvent")),
  "point.expiring": withAutomation(async (evt) => {
    const p = evt.payload as { customerId?: unknown; points?: unknown; expiresAt?: unknown; lotId?: unknown; daysLeft?: unknown } | null;
    const customerId = p && typeof p.customerId === "string" ? p.customerId : null;
    const points = p && typeof p.points === "number" ? p.points : null;
    const expiresAt = p && typeof p.expiresAt === "string" ? p.expiresAt : null;
    if (!customerId || !points) return;
    const vars: Record<string, string | number> = { แต้มที่จะหมด: points, วันหมดอายุ: expiresAt ? formatThaiDate(expiresAt) : "" };
    // idempotent ต่อ (ล็อต, วันที่เหลือ) — refId กันแจ้งซ้ำถ้า event ถูกยิงซ้ำ (drain retry / ผู้ดูแลกดรันเอง)
    const refId = `point.expiring:${typeof p?.lotId === "string" ? p.lotId : ""}:${typeof p?.daysLeft === "number" ? p.daysLeft : ""}`;
    await notifyMember(evt, customerId, "POINTS_EXPIRING", vars, refId);
  }),
  "point.expired": withAutomation(memberBridge("onPointEvent")),
  "point.transferred": withAutomation(async () => {}),
  // ── บัตรกำนัล (M2.6 · §7.1) ──
  // ของจริง (ตัวบัตร/รายการบนบัตร/บิล POS/เอกสารบัญชี) ถูกเขียนครบใน transaction ของ `giftcard/service.ts`
  // แล้ว — consumer นี้ทำงานจริง 1 อย่าง: **เขียนไทม์ไลน์ของเจ้าของบัตร** (บัตรที่ยังไม่มีเจ้าของในระบบ
  // = ไม่มีใครให้บันทึก จบเงียบ ๆ) + ปิด event เป็น DONE + เป็นจุดให้กฎอัตโนมัติ/เว็บฮุคยิงต่อ
  // M3.7 — ตัวเขียนย้ายไปสะพาน (recordOnce: ขาย = 1 แถวต่อบัตร · ใช้ = 1 แถวต่อการใช้ครั้งนั้น — replay ไม่ซ้ำ)
  "giftcard.sold": withAutomation(memberBridge("onLoyaltyEvent")),
  "giftcard.used": withAutomation(memberBridge("onLoyaltyEvent")),
  // ── สแตมป์การ์ด (M2.3 · §7.1) ──
  // 🔴 no-op เหมือนกลุ่มแต้ม/สมาชิก: ใบสะสม · รายการตรา · รางวัล (แต้ม) ถูกเขียนครบใน transaction
  //    ของ `stamp/service.ts` แล้ว · 3 บรรทัดนี้มีไว้ (1) ปิด event เป็น DONE ไม่ให้คิวตัน
  //    (2) เป็นทริกเกอร์ของกฎอัตโนมัติ/journey ("ครบใบแล้วส่ง LINE บอกลูกค้า" = งานของ M3.x)
  //    (3) ยิงเว็บฮุคออกนอกระบบ
  "stamp.added": withAutomation(async () => {}),
  // M3.7: + ไทม์ไลน์ STAMP_COMPLETED (ต่อท้ายด้วย compose)
  "stamp.completed": withAutomation(compose(async (evt) => {
    const p = evt.payload as { customerId?: unknown } | null;
    if (p && typeof p.customerId === "string") await notifyMember(evt, p.customerId, "STAMP_COMPLETE");
  }, memberBridge("onLoyaltyEvent"))),
  "stamp.expired": withAutomation(async () => {}),
  // ── รางวัล v2 (M2.4 · §7.1) ──
  // 🔴 no-op เหมือนกลุ่มแต้ม/สแตมป์: รายการแลก/สต็อก/แต้ม-สแตมป์ที่หัก ถูกเขียนครบใน transaction
  //    ของ `reward/v2.ts` แล้ว · 2 บรรทัดนี้มีไว้ (1) ปิด event เป็น DONE ไม่ให้คิวตัน
  //    (2) เป็นทริกเกอร์ของกฎอัตโนมัติ/journey ("แลกของรางวัลแล้ว" / "รับของแล้ว") (3) ยิงเว็บฮุคออกนอกระบบ
  "reward.redeemed": withAutomation(memberBridge("onLoyaltyEvent")), // M3.7: + ไทม์ไลน์ REWARD_REDEEMED
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
    await notifyMember(evt, customerId, "VOUCHER_NEW", { voucher: code });
  }),
  // M3.2 — voucher ที่ **แคมเปญแนบไปให้** ถูกใช้ = ผลของแคมเปญใบนั้น (ยกความดี + อัปสถิติ variant)
  //   ใบที่ไม่ได้มาจากแคมเปญ → `trackUseFromVoucher` จบเงียบ ๆ (ไม่มีผู้รับให้ผูก)
  // M3.7: + ไทม์ไลน์ VOUCHER_USED (ตอนออกใบ voucher/service.ts เขียน VOUCHER_ISSUED เองแล้ว — ไม่เขียนซ้ำที่คิว)
  "voucher.used": withAutomation(compose(async (evt) => {
    await marketing.trackUseFromVoucher({ tenantId: evt.tenantId, payload: evt.payload });
  }, memberBridge("onLoyaltyEvent"))),
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
  // ── ไทม์ไลน์สมาชิก: event ใหม่ของ M3.7 (§7.1) ──
  // 🔴 ทั้ง 2 ตัวลงครบ 3 ทะเบียน (ที่นี่ · AUTOMATION_EVENTS · WEBHOOK_EVENTS ผ่าน spread) — ขาด = คิวตันเงียบ
  // `crm.deal.won` ยิงจาก `crm/deals.ts#moveCore` (C1.5) เมื่อดีล "เข้า" WON จากขั้นชนิดอื่น → หา/สมัครสมาชิก + ผูก CrmContact + แถว DEAL_WON
  //   key: ทาง v1 (`service.moveDeal`) = `crm.deal.won#<dealId>` (ครั้งเดียวต่อดีล) · ทาง v2 = `crm.deal.won#<dealId>#<histId>` (ต่อการเข้า WON)
  // CRM C2.2 ▸ + หยุดลำดับการติดตามของดีลนี้ (stopOnWon) เป็นของแถมใต้ compose — ล้ม = WARN · สะพานสมาชิกเดิมวิ่งก่อนเหมือนเดิม ◂
  // CRM C2.7 ▸ + ออกใบแจ้งหนี้อัตโนมัติเมื่อชนะ (pipeline.autoInvoiceOnWon) เป็นของแถมใต้ compose — ออกไม่ได้ = WARN ดีลยังชนะ ◂
  "crm.deal.won": withAutomation(compose(compose(memberBridge("onCrmDealWon"), crmBridge("onDealWonStopSequences")), crmBridge("onDealWonAutoInvoice"))),
  // `shop.order.paid` ยิงจาก `shop/service.ts#confirmOrderPaid` (หน้าร้านเว็บ) / ตัวเชื่อมตลาดออนไลน์ →
  //   หา/สมัครสมาชิก (MARKETPLACE) + ผูกตัวตนช่องทาง + แต้ม (ShopOrder) + แถว PURCHASE
  // CRM C2.9 ▸ + ไทม์ไลน์ CRM ของ Party ที่ผูกออเดอร์ (กิจกรรม VISIT ใบเดียว + ขั้นลูกค้า) — ต่อ **ท้ายสุด** ใต้ compose:
  //   สะพานสมาชิกเดิมวิ่งก่อนเหมือนเดิมทุกประการ · CRM อ่าน **แต่ id** (ไม่แตะ customerName/customerPhone ใน payload — R-E.17) ◂
  "shop.order.paid": withAutomation(compose(memberBridge("onShopOrderPaid"), crmBridge("onBusinessEvent"))),
  // CRM C2.9 ▸ เหตุการณ์ธุรกิจอีก 6 โมดูล (มติ C11) — ยิงใน transaction เดียวกับการเปลี่ยนสถานะของโมดูลนั้น
  //   งานหลัก = **no-op**: โมดูลต้นทางเขียนของมันครบใน tx ของตัวเองแล้ว · บรรทัดพวกนี้มีไว้ (ก) ปิด event เป็น DONE
  //   — ขาดไปแม้ตัวเดียว = แถวค้าง PENDING ตลอดกาลและคิวทั้งระบบตันเงียบ ๆ [[reference_outbox_new_event_needs_consumer]] ·
  //   (ข) เป็นทริกเกอร์ของกฎอัตโนมัติ + เว็บฮุคของร้าน · (ค) ที่แขวน "ของแถม" ของ CRM
  //   ของแถม = `onBusinessEvent` ตัวเดียวทั้ง 6 ชนิด: แถวต้นทาง → Party → ผู้ติดต่อ ⇒ กิจกรรม VISIT ใบเดียว + ขั้นลูกค้า
  //   (ล้ม = WARN ของ compose ไม่ทำให้ event ล้ม · ร้านที่ยังเป็น CRM รุ่น 1 = สะพานไม่เขียนอะไร แต่ event ยัง DONE)
  "ticket.order.paid": withAutomation(compose(async () => {}, crmBridge("onBusinessEvent"))),
  "rental.returned": withAutomation(compose(async () => {}, crmBridge("onBusinessEvent"))),
  "school.enrolled": withAutomation(compose(async () => {}, crmBridge("onBusinessEvent"))),
  "hotel.checked_out": withAutomation(compose(async () => {}, crmBridge("onBusinessEvent"))),
  "clinic.visit.done": withAutomation(compose(async () => {}, crmBridge("onBusinessEvent"))),
  "queue.served": withAutomation(compose(async () => {}, crmBridge("onBusinessEvent"))),
  // ◂ CRM C2.9
  // B1 — ธีม/ตราสินค้าของกิจการเปลี่ยน (ยิงจาก `branding/service.ts#setBranding` ใน tx เดียวกับแถว)
  //   ทำงานจริง 1 อย่าง: ล้างแคชธีมของ **อินสแตนซ์ที่ระบายคิว** (อินสแตนซ์ที่กดบันทึกล้างไปแล้วเอง)
  //   ที่เหลือปล่อยให้ `withWebhooks` ยิงต่อ → แอป/ระบบภายนอกที่แคชโลโก้-สีไว้จะได้รู้ว่าต้องดึงใหม่
  //   🔴 ต้องมีบรรทัดนี้เสมอ ไม่งั้น event ค้าง PENDING แล้วคิวทั้งระบบตันตามไปด้วย (บทเรียน 30 ส.ค. 2026)
  "tenant.branding.updated": withAutomation(async (evt) => {
    invalidateBrandingCache(evt.tenantId);
  }),
  // CRM C1.1 ▸ ทีม (core/teams.ts) — no-op: แถว Team/TeamMember เขียนครบใน tx ของ teams.ts แล้ว
  //   บรรทัดนี้ปิด event เป็น DONE (ขาด = คิวตัน) + ทริกเกอร์กฎ + เว็บฮุค · C1.7/C2.3 ต่อยอด (ล้างแคชการมองเห็น/มอบหมาย)
  "team.updated": withAutomation(async () => {}),
  // ◂ CRM C1.1
  // CRM C1.2b ▸ วัตถุกำหนดเอง (`crm/objects.ts`) — payload: recordId · objectId · objectKey · parentType · parentId? · partyId? (+ changed[]/moved)
  //   ยิงใน tx เดียวกับการเขียนรายการ · idempotencyKey `custom.record.<type>#<recordId>#<seq>` (R-C.8)
  //   created → ไทม์ไลน์สมาชิกของแม่ (1 แถว · recordOnce) เป็น "ของแถม" ใต้ compose: ล้ม = WARN ไม่ทำให้คิวตัน/ไม่ล้มงานหลัก
  //   🔴 dynamic import (crm → member → … → scheduleDrain ที่ไฟล์นี้ = วงกลมถ้า import หัวไฟล์ — เหตุผลเดียวกับ memberBridge)
  //   updated/archived → no-op (ปิด event เป็น DONE — ขาด = คิวตัน) + ทริกเกอร์กฎ + เว็บฮุค
  // CRM C1.8 ▸ ตัวเขียนเดิม (crm.objects.onRecordCreated) ผ่านสะพาน — ประตู uiVersion 2 + bridgesEnabled (มติ C1.2b ข้อ 7) ◂
  "custom.record.created": withAutomation(compose(async () => {}, crmBridge("onCustomRecordCreated"))),
  "custom.record.updated": withAutomation(async () => {}),
  "custom.record.archived": withAutomation(async () => {}),
  // ◂ CRM C1.2b
  // CRM C1.3 ▸ บริษัท (`crm/companies.ts`) — ยิงใน tx เดียวกับการเขียน · idempotencyKey `crm.company.<type>#<id>#<seq>` (R-C.8) · payload id ล้วน
  //   created → ผู้ติดต่อฝั่งบัญชี (`ensureAccountContact` นอก tx · หนึ่ง Party = หนึ่งผู้ติดต่อต่อสมุด) + ไทม์ไลน์ CrmActivity 1 แถว
  //     เป็น "ของแถม" ใต้ compose: ล้ม = WARN ไม่ทำให้คิวตัน/ไม่ล้มงานหลัก · ไม่มีสมุดบัญชีที่เชื่อม = ข้ามส่วนบัญชี
  //   🔴 dynamic import (crm → member/account → … → scheduleDrain ที่ไฟล์นี้ = วงกลมถ้า import หัวไฟล์ — เหตุผลเดียวกับ C1.2b)
  //   updated/merged → no-op (ปิด event เป็น DONE — ขาด = คิวตัน) + ทริกเกอร์กฎ + เว็บฮุค · C1.8 ต่อยอด (re-point เมื่อบัญชีรวมผู้ติดต่อ)
  "crm.company.created": withAutomation(
    compose(async () => {}, async (evt) => {
      const crm = await import("@/lib/modules/crm");
      await crm.companies.onCompanyCreated(evt);
    }),
  ),
  "crm.company.updated": withAutomation(async () => {}),
  "crm.company.merged": withAutomation(async () => {}),
  // ◂ CRM C1.3
  // CRM C1.4 ▸ ผู้ติดต่อ (`crm/contacts.ts` · `crm/consents.ts`) — ยิงใน tx เดียวกับการเขียน · key `crm.contact.<type>#<id>#<seq>` (R-C.8) ·
  //   payload id/คีย์ล้วน: created {contactId, partyId} · updated {contactId, changedKeys[], channel?} ·
  //   assigned {contactId, ownerUserId, previousOwnerUserId} · converted {contactId, customerId, companyId, dealId, partyId} ·
  //   merged {keptId, mergedId}
  //   ทั้ง 5 ตัวเป็น no-op ที่ปิด event เป็น DONE (ขาด consumer = คิวตัน) + ทริกเกอร์กฎ + เว็บฮุค — ส่งซ้ำ/พร้อมกันกี่รอบก็ไม่มีผลข้างเคียง
  //   (AUDIT-CLASS X4) · ผลข้างเคียงจริง (ไทม์ไลน์สมาชิก · คะแนน · สะพานแชท/บัญชี) = ใบ C1.8/C2.8 เติมเป็น "ของแถม" ใต้ compose
  "crm.contact.created": withAutomation(async () => {}),
  "crm.contact.updated": withAutomation(compose(async () => {}, crmBridge("onContactOptOutStopSequences"))), // CRM C2.2 ▸ ขอไม่รับข่าวสาร ⇒ หยุดลำดับการติดตาม ◂
  "crm.contact.assigned": withAutomation(compose(async () => {}, crmBridge("onCrmTimelineEvent"))), // CRM C1.8 ▸ ไทม์ไลน์สมาชิก 1 แถว/event ◂
  "crm.contact.converted": withAutomation(async () => {}),
  "crm.contact.merged": withAutomation(async () => {}),
  // ◂ CRM C1.4
  // CRM C1.5 ▸ ดีล (`crm/deals.ts`) — ยิงใน tx เดียวกับการเขียน · key `crm.deal.<type>#<dealId>#<seq>` (R-C.8) · payload id/คีย์ล้วน:
  //   created {dealId, contactId, companyId, pipelineId, stageId, ownerUserId} · stage.changed {dealId, pipelineId, fromStageId, toStageId, kind} ·
  //   lost {dealId, lostReasonId} · reopened {dealId, fromStageId, toStageId} · reassigned {dealId, ownerUserId, previousOwnerUserId} ·
  //   updated {dealId, changedKeys[], approvalRequestId?/documentId?}
  //   (`crm.deal.won` มีตัวรับเดิมข้างบน — สะพานสมาชิก M3.7 · payload คงรูป v1 ตามมติผู้คุมงาน C1.5 ข้อ 1)
  //   ทั้ง 6 ตัวเป็น no-op ที่ปิด event เป็น DONE (ขาด consumer = คิวตัน) + ทริกเกอร์กฎ + เว็บฮุค — แคชบริษัท/ประวัติขั้น/lifecycle
  //   เขียนครบใน tx ของบริการดีลแล้ว ⇒ ส่งซ้ำ/พร้อมกันกี่รอบก็ไม่มีผลข้างเคียง (AUDIT-CLASS X4) · C1.8 เติม "ของแถม" ใต้ compose
  "crm.deal.created": withAutomation(compose(async () => {}, crmBridge("onCrmTimelineEvent"))), // CRM C1.8 ▸ ไทม์ไลน์สมาชิก 1 แถว/event ◂
  "crm.deal.stage.changed": withAutomation(compose(async () => {}, crmBridge("onCrmTimelineEvent"))), // CRM C1.8 ▸ ไทม์ไลน์สมาชิก 1 แถว/event ◂
  "crm.deal.lost": withAutomation(compose(async () => {}, crmBridge("onDealLostStopSequences"))), // CRM C2.2 ▸ หยุดลำดับการติดตามของดีลนี้ (stopOnLost) ◂
  "crm.deal.reopened": withAutomation(compose(async () => {}, crmBridge("onCrmTimelineEvent"))), // CRM C1.8 ▸ ไทม์ไลน์สมาชิก 1 แถว/event ◂
  "crm.deal.reassigned": withAutomation(compose(async () => {}, crmBridge("onCrmTimelineEvent"))), // CRM C1.8 ▸ ไทม์ไลน์สมาชิก 1 แถว/event ◂
  "crm.deal.updated": withAutomation(async () => {}),
  // ◂ CRM C1.5
  // CRM C1.6 ▸ กิจกรรม (`crm/activities.ts`) — ยิงใน tx เดียวกับการเขียน · key `crm.activity.<type>#<activityId>#<seq>` (R-C.8) ·
  //   payload id/คีย์ล้วน { activityId, type, contactId, dealId, companyId, customRecordId, ownerUserId } — ไม่มีหัวเรื่อง/โน้ต (X8)
  //   ผลข้างเคียง (lastActivityAt · แจ้งเตือน @กล่าวถึง · ปิดงาน) เขียนครบใน tx ของบริการแล้ว ⇒ consumer = no-op ปิด event เป็น DONE
  //   (ขาด = คิวตัน) + ทริกเกอร์กฎ + เว็บฮุค · ส่งซ้ำ/พร้อมกันกี่รอบก็ไม่มีผลข้างเคียง (AUDIT-CLASS X4) · C1.8/C2.8 เติมของแถมใต้ compose
  "crm.activity.logged": withAutomation(compose(async () => {}, crmBridge("onCrmTimelineEvent"))), // CRM C1.8 ▸ ไทม์ไลน์สมาชิก 1 แถว/event ◂
  // CRM C2.8 ▸ + คะแนน ("นัดพบ/โทรคุยเสร็จ" ของกฎเริ่มต้น) — ของแถมใต้ compose: ล้ม = WARN ไม่ทำให้ event ล้ม ◂
  "crm.activity.completed": withAutomation(compose(async () => {}, crmBridge("onScoringEvent"))),
  // ◂ CRM C1.6
  // CRM C2.2 ▸ ลำดับการติดตาม (`crm/sequences.ts`) — ยิงใน tx เดียวกับการเขียน · key `<type>#<enrollmentId>#1` (R-C.8) · payload id/โค้ดล้วน:
  //   enrolled {enrollmentId, sequenceId, contactId, dealId, sequenceVersion} · finished {enrollmentId, sequenceId, contactId, status, reason?}
  //   ทั้งสองเป็น no-op ที่ปิด event เป็น DONE (ขาด consumer = คิวตัน) + ทริกเกอร์กฎ + เว็บฮุค — ส่งซ้ำ/พร้อมกันไม่มีผลข้างเคียง (AUDIT-CLASS X4)
  "crm.sequence.enrolled": withAutomation(async () => {}),
  "crm.sequence.finished": withAutomation(async () => {}),
  // ◂ CRM C2.2
  // CRM C2.4 ▸ เตือนงาน/นัดที่ถึงเวลา (`crm/reminders.ts#remindDue`) — key `crm.activity.reminder#<activityId>#<remindAtMs>`
  //   🔴 แถว event นี้คือ **ธงกันซ้ำ** ของงานรายนาที: มันถูกเขียนใน tx เดียวกับแถว `AppNotification` ⇒ สองรอบทับกัน/รอบถัดไป/
  //      push ที่โยน = แจ้งเตือนใบเดียว ไม่หาย ไม่ซ้ำ ⇒ ผลข้างเคียงทั้งหมดเกิดครบแล้วก่อน event ถูก drain
  //   ⇒ consumer = no-op ที่ปิด event เป็น DONE (ขาด consumer = คิวตัน — บทเรียน 30 ส.ค.) + เป็นจุดให้เว็บฮุคของร้านยิงต่อ
  //   payload = id ล้วน { activityId, activityType, ownerUserId, contactId, dealId, companyId } — ไม่มีหัวเรื่อง/ชื่อ/เบอร์ (X8)
  "crm.activity.reminder": withAutomation(async () => {}),
  // ◂ CRM C2.4
  // CRM C2.5 ▸ อีเมล (`crm/emails.ts`) — ยิงใน tx เดียวกับการเขียนแถว/เหตุการณ์ · key `crm.email.<type>#<emailId>#<seq>`
  //   (R-C.8) · payload **id ล้วน** { emailId, contactId?, dealId?, companyId?, threadKey, sequenceStepId? } —
  //   ไม่มีที่อยู่ หัวเรื่อง เนื้อความ หรือ URL ที่ถูกคลิก (URL อยู่ใน `CrmEmailEvent` เท่านั้น · มติผู้คุมงาน ข้อ 4)
  //   ทั้ง 6 ตัวเป็น no-op ที่ปิด event เป็น DONE (ขาด consumer = คิวตัน) + ทริกเกอร์กฎ + เว็บฮุค —
  //   ผลข้างเคียงจริง (แถวอีเมล · กิจกรรม · `repliedAt` · ธงตีกลับ/ขอไม่รับ · การหยุดลำดับการติดตามผ่าน
  //   `sequences.stopFor`) เขียนครบใน tx/ทางเดินของบริการอีเมลแล้ว ⇒ ส่งซ้ำ/พร้อมกันกี่รอบก็ไม่มีผลข้างเคียงเพิ่ม
  //   (AUDIT-CLASS X4 · ข้อสอบ C2.5-X4.5 บริโภคซ้ำสองครั้งและสองครั้งพร้อมกัน)
  "crm.email.sent": withAutomation(async () => {}),
  // CRM C2.8 ▸ + คะแนน (ตอบอีเมลกลับ · เปิดอีเมล · กดลิงก์ในอีเมล = 3 กฎเริ่มต้น) ◂
  "crm.email.received": withAutomation(compose(async () => {}, crmBridge("onScoringEvent"))),
  "crm.email.opened": withAutomation(compose(async () => {}, crmBridge("onScoringEvent"))),
  "crm.email.clicked": withAutomation(compose(async () => {}, crmBridge("onScoringEvent"))),
  "crm.email.replied": withAutomation(async () => {}),
  "crm.email.bounced": withAutomation(async () => {}),
  // ◂ CRM C2.5
  // CRM C2.6 ▸ ผู้เข้าชมเว็บถูกระบุตัวตนแล้ว (`crm/tracking.ts#identify`) — ยิงใน tx เดียวกับการผูกการเข้าชม + กิจกรรม WEB
  //   key `crm.web.identified#<contactId>#<วันไทย>` (R-C.8 · 1 ใบต่อผู้ติดต่อต่อวัน) · payload **id/ตัวเลขล้วน**
  //   { contactId, systemId, visitorId, sessionCount, pageViews, firstUrl?, by } — ไม่มีชื่อ เบอร์ อีเมล (X8)
  //   no-op ที่ปิด event เป็น DONE (ขาด consumer = คิวตัน — บทเรียน 30 ส.ค.) + ทริกเกอร์กฎ + เว็บฮุคของร้าน ·
  //   ผลข้างเคียงจริง (การผูก session · กิจกรรม 1 รายการ/วันไทย) เขียนครบใน tx ของบริการแล้ว ⇒ ส่งซ้ำ/พร้อมกัน = ผลเดิม (X4)
  //   🔴 ใบ C2.8 (คะแนน) เป็นผู้บริโภคตัวจริงของ event นี้ — ใบ C2.6 แค่ยิง
  // CRM C2.8 ▸ + คะแนน (ใบ C2.6 ส่งต่อให้ใบนี้เป็นผู้บริโภคตัวจริงของ event นี้) ◂
  "crm.web.identified": withAutomation(compose(async () => {}, crmBridge("onScoringEvent"))),
  // ◂ CRM C2.6
  // CRM C2.8 ▸ คะแนนผู้ติดต่อ (`crm/scoring.ts`) — ยิงใน tx เดียวกับแถวแต้ม + การขยับคะแนน
  //   key `crm.score.changed#<contactId>#<logId>` · `crm.score.threshold#<contactId>#<band>#<logId>` (งานรายวันใช้ `#decay#<วันไทย>`)
  //   payload **id/ตัวเลข/ระดับ ล้วน** { contactId, from, to, band, ruleId } · { contactId, band } — ไม่มีชื่อ เบอร์ อีเมล (X8)
  //   🔴 ผลข้างเคียงจริง (แถว `CrmScoreLog` · `CrmContact.score/scoreBand/scoreUpdatedAt`) เขียนครบใน tx ของบริการแล้ว
  //      ⇒ consumer = no-op ที่ปิด event เป็น DONE (ขาด consumer = คิวตันทั้งระบบเงียบ ๆ — บทเรียน 30 ส.ค. 2026)
  //      + เป็นจุดให้ **กฎอัตโนมัติของ C2.1** ("เมื่อคะแนนถึงระดับ ร้อน/อุ่น/เย็น") และเว็บฮุคของร้านยิงต่อ
  //      ส่งซ้ำ/พร้อมกันกี่รอบก็ไม่มีผลข้างเคียงเพิ่ม (AUDIT-CLASS X4 — ตัวกันซ้ำของ `runForCrmEvent` คือแถวหลักต่อ (กฎ, คน, event))
  //   🔴 `crm.score.threshold` ถูกกรองด้วย `trigger.params.band` ใน `automation.ts` (บล็อก C2.8) ⇒ กฎ "เย็น" ไม่ทำงานตอนลูกค้าร้อน
  "crm.score.changed": withAutomation(async () => {}),
  "crm.score.threshold": withAutomation(async () => {}),
  //   🔴 รอบแก้ 25 ก.ย. — `crm.deal.quotation.issued`: ตัวยิงอยู่ที่ `crm/deals.ts` (tx เดียวกับการผูก `quotationDocId`) ·
  //      งานหลักไม่มีอะไรต้องทำ (เอกสารถูกสร้างในบัญชีไปแล้ว) ⇒ no-op ปิด event เป็น DONE (ขาด consumer = คิวตันทั้งระบบ)
  //      + สะพานคะแนนใต้ compose ⇒ กฎเริ่มต้น "ได้รับใบเสนอราคา" (+8) ได้แต้มครั้งเดียวต่อ (ดีล, เอกสาร)
  "crm.deal.quotation.issued": withAutomation(compose(async () => {}, crmBridge("onScoringEvent"))),
  // ◂ CRM C2.8
  // CRM C2.10 ▸ ดีลนิ่ง + งานติดตามเลยกำหนด (ยิงจากงานเบื้องหลัง — `crm/deals.ts#markStale` · `crm/activities.ts#overdueSweep`)
  //   key `crm.deal.stale#<days>#<dealId>#<จุดยึด ISO>` · `crm.activity.overdue#<activityId>` (คีย์เดียวกับตัวตามเก็บของ C2.1)
  //   งานหลักไม่มีอะไรต้องทำ: การแจ้งเตือนคนเกิดที่ตัวงานเองแล้ว (สรุปรายวันของ `markStale`) และการทำงานของ
  //   "กฎอัตโนมัติ" เกิดจาก `withAutomation` ที่ห่อ consumer นี้อยู่ ⇒ no-op ปิด event เป็น DONE
  //   🔴 ขาด consumer = คิวตันทั้งระบบเงียบ ๆ (บทเรียน 30 ส.ค. · [[reference_outbox_new_event_needs_consumer]])
  "crm.deal.stale": withAutomation(async () => {}),
  "crm.activity.overdue": withAutomation(async () => {}),
  // ◂ CRM C2.10
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
