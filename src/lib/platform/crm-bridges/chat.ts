// crm-bridges/chat.ts — แชท → ตัวตนกลาง (Party) → ผู้ติดต่อ CRM / lead / กิจกรรมแชท (ใบ C1.8 → ใบ C2.4 · พิมพ์เขียว §7.2 · §9 แถว CHAT)
//
// `chat.message.received` { conversationId, channel } (ไม่มี messageId/ข้อความ — id ล้วน) → ห้อง (ร้านเดียวกัน) → ChatContact → Party:
//   มี `ChatContact.partyId` ⇒ ใช้เลย · ไม่มี ⇒ Party ชนิดคนจากเบอร์/อีเมล (`crm.contacts.personPartyFor`) แล้วผูกผ่าน `chat.linkChatContactParty`
//   → ใบ C2.4: ผู้ติดต่อของ Party นั้นใน **ทุกระบบ CRM ที่เปิดสะพาน** ⇒ แตะ `lastActivityAt` + หยุดลำดับที่รอคำตอบ (`sequences.stopFor` "REPLY")
//   → ระบบ CRM ใบแรกของร้าน (ประตู uiVersion 2 + bridgesEnabled) · มีผู้ติดต่อของ Party แล้ว ⇒ ไม่มีอะไรใหม่ ·
//     ไม่มี และ `settings.crm.chatToLead` เปิด ⇒ lead ใหม่ 1 ราย (source CHAT · partyId)
//   ❌ ไม่สร้างกิจกรรมต่อข้อความ · ไม่ยิง event (กิจกรรมแชท = 1 รายการต่อห้อง ตอนห้องถูกปิด — ด้านล่าง)
//
// `chat.conversation.status` { conversationId, status } — สนใจเฉพาะ `RESOLVED` (ใบ C2.4 · มติผู้คุมงาน C2.4 ข้อ 7)
//   → กิจกรรมชนิด CHAT **ใบเดียวต่อห้อง ทั้งร้าน** ในระบบ CRM ใบแรกที่มีผู้ติดต่อของ Party นั้น (ธง = `sourceRef` = conversationId)
//   → ถ้าเจ้าของร้านเปิด `settings.crm.ai.chatSummary` และมีเครดิต ⇒ สรุปห้องด้วย AI ลง `aiSummary` ของกิจกรรมใบนั้น
//     (ไม่ใช่ข้อเสนอ: ไม่มีคนในลูป · ล้ม/ไม่มีเครดิต = กิจกรรมยังเกิดตามปกติ แค่ไม่มีสรุป)

import { prisma } from "@/lib/core/db";
import * as crm from "@/lib/modules/crm";
import * as chat from "@/lib/modules/chat";
import { canSpend, chargeUsageSafe } from "@/lib/ai/credit";
import { resolveProvider, type AiProvider } from "@/lib/ai/provider";
import { logOps } from "@/lib/core/ops";
import { notifyNewLeadInApp } from "@/lib/platform/crm-outbound";
import { bridgeOpen, crmGates, payloadOf, str, type BridgeEvent } from "./core";

/** ผู้ติดต่อของ Party นี้ในระบบ CRM ใบหนึ่ง (ที่ยังใช้งาน) — เรียงคงที่เพื่อให้ผลซ้ำได้ */
async function contactsOfParty(tenantId: string, systemId: string, partyId: string, take = 50): Promise<{ id: string }[]> {
  return prisma.crmContact.findMany({
    where: { tenantId, systemId, partyId, archivedAt: null, mergedIntoId: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
    take,
  });
}

/**
 * AUDIT-CLASS X1: ห้องค้นด้วย id + tenantId ของ event (ห้องของร้านอื่น = ไม่ทำอะไร) · ผู้ติดต่อแชทค้นด้วยร้านเดียวกัน
 * AUDIT-CLASS X3: หลายข้อความของคนใหม่คนเดียวยิงพร้อมกัน ⇒ บริการผู้ติดต่อล็อกต่อ (ระบบ, Party canonical) ⇒ lead 1 ราย ·
 *   Party ของห้องเขียนแบบมีเงื่อนไข (ยังว่าง) แล้วอ่านกลับ ⇒ ทุกทางใช้ Party เดียวกัน · `lastActivityAt` = GREATEST คำสั่งเดียว
 * AUDIT-CLASS X4: ส่งซ้ำ = ผู้ติดต่อของ Party มีแล้ว ⇒ ไม่เขียนอะไร (ธง = ผู้ติดต่อเอง ตรวจใต้ล็อกในบริการผู้ติดต่อ) ·
 *   การหยุดลำดับเป็น conditional update ใน `stopFor` ⇒ ส่งซ้ำ/พร้อมกันกี่รอบ = หยุดครั้งเดียว · `crm.sequence.finished` ใบเดียว
 * AUDIT-CLASS X8: ไม่ log ชื่อที่แชทแสดง/เบอร์/อีเมล · event ที่เกิดต่อเป็น id ล้วน
 */
export async function onChatMessage(evt: BridgeEvent): Promise<void> {
  const conversationId = str(payloadOf(evt.payload).conversationId);
  if (!conversationId) return;
  /**
   * ประตูก่อนอ่านอะไรของแชท: ต้องมีระบบ CRM ที่ **เปิดสะพาน v2** อย่างน้อยหนึ่งใบ
   * 🔴 ใบ C2.4 รอบ 2 (ข้อ F10): ของเดิมดูแค่ `gates[0]` (ระบบที่เก่าที่สุด) ⇒ ร้านที่มีระบบ CRM เดิมค้างอยู่ที่รุ่น 1
   *    แล้วเปิดรุ่น 2 ที่ระบบใบใหม่ จะถูกปิดประตูทั้งร้าน: ลูกค้าตอบแชทแล้วไม่มีอะไรขยับ (lastActivityAt ไม่ขึ้น ·
   *    ลำดับติดตามที่ตั้ง "หยุดเมื่อตอบกลับ" ไม่หยุด แล้วยิงอีเมลตามไปทั้งที่ลูกค้าตอบแล้ว) — เงียบสนิท หาสาเหตุไม่เจอ
   *    ⇒ ใช้ `filter(bridgeOpen)` แบบเดียวกับ `onChatConversationStatus`
   */
  const gates = await crmGates(evt.tenantId);
  const open = gates.filter(bridgeOpen);
  if (open.length === 0) return;
  /** ปลายทางของ "แชท → lead" = ระบบที่เปิดสะพานใบแรก (ลำดับ crmGates) — ไม่ใช่ระบบใบแรกของร้านที่อาจยังเป็นรุ่น 1 */
  const target = open[0]!;
  // CRM C2.3 ▸ `meta` ของห้อง (`{ lang }` ของเว็บแชท) มาด้วย — ใช้เป็นภาษาของลูกค้าเมื่อ ChatContact.lang ว่าง ◂
  const conv = await prisma.chatConversation.findFirst({ where: { id: conversationId, tenantId: evt.tenantId }, select: { contactId: true, meta: true } });
  if (!conv?.contactId) return;
  const cc = await prisma.chatContact.findFirst({
    where: { id: conv.contactId, tenantId: evt.tenantId },
    // CRM C2.3 ▸ `lang` = ภาษาที่ลูกค้าใช้ (ช่องของแชทเอง) → ส่งต่อเป็น `locale` ของลีด ◂
    select: { id: true, partyId: true, displayName: true, phone: true, email: true, lang: true },
  });
  if (!cc) return;

  let partyId = cc.partyId;
  if (!partyId) {
    const phone = str(cc.phone);
    const email = str(cc.email);
    if (!phone && !email) return; // ไม่มีอะไรบอกว่าเป็นใคร = ระบบไม่เดา
    // Party ชนิด "คน" เท่านั้น (ตรรกะเดียวกับการสร้างผู้ติดต่อ — ไม่มีวันผูกห้องแชทกับ Party บริษัท) · ล็อก Party ระดับร้านในบริการผู้ติดต่อ
    const found = await crm.contacts.personPartyFor(evt.tenantId, { name: str(cc.displayName), phone, email });
    if (!found) return;
    // เขียน ChatContact.partyId ผ่าน facade แชท (ครั้งเดียว · มี audit) แล้วใช้ค่าที่อยู่ในแถวจริง (คนก่อนหน้าผูกไว้แล้ว = ค่านั้นชนะ)
    partyId = await chat.linkChatContactParty({ tenantId: evt.tenantId, actorUserId: null }, { chatContactId: cc.id, partyId: found });
    if (!partyId) return;
  }

  // CRM C2.4 ▸ ลูกค้าตอบกลับแล้ว (พิมพ์เขียว §5.5 · §5.7) — ทำ **ก่อน** ทางของ lead เพราะไม่เกี่ยวกับสวิตช์ `chatToLead`:
  //   1) `CrmContact.lastActivityAt := now` ⇒ ดีล/ผู้ติดต่อไม่ถูกนับว่า "นิ่ง" ทั้งที่ลูกค้าเพิ่งคุยด้วย
  //   2) หยุดลำดับการติดตามที่ตั้ง "หยุดเมื่อตอบกลับ" ผ่าน `sequences.stopFor(…, "REPLY")` — ทางเข้าเดียวของ C2.2 (R-A)
  //   ❌ ไม่สร้างกิจกรรมต่อข้อความ และไม่ยิง event (กิจกรรมแชทเกิดตอนห้องปิดเท่านั้น)
  //   ประตู: เฉพาะระบบที่ `bridgeOpen` (uiVersion 2 + bridgesEnabled) — ระบบที่ยังเป็นรุ่น 1 ไม่ถูกแตะเลย (R-E.14)
  {
    const at = new Date();
    for (const g of open) {
      const cs = await contactsOfParty(evt.tenantId, g.systemId, partyId);
      if (cs.length === 0) continue;
      const scope = { tenantId: evt.tenantId, systemId: g.systemId };
      await crm.activities.touchContactsFromChat(scope, cs.map((c) => c.id), at);
      for (const c of cs) await crm.sequences.stopFor(scope, c.id, "REPLY");
    }
  }

  /**
   * ใบ C2.4 รอบ 2 (ข้อ F11): "ห้องที่ปิดไปก่อนที่ใครจะเป็นผู้ติดต่อ" ต้องไม่หาย
   * 🔴 ลำดับที่เกิดจริงบ่อยมาก: ลูกค้าใหม่คุยจนจบเรื่อง → พนักงานกดปิดห้อง (`RESOLVED` → ยังไม่มีผู้ติดต่อ ⇒ ไม่มีกิจกรรม)
   *    แล้ววันหลังจึงมีผู้ติดต่อของ Party นั้น (สะพานเปิด lead จากข้อความถัดไป · พนักงานสร้างเอง · นำเข้า)
   *    ⇒ ของเดิม "การคุยทั้งห้อง" ไม่เคยกลายเป็นกิจกรรมเลย ไม่มีอะไรตามเก็บให้
   *    ⇒ ทุกครั้งที่มีข้อความเข้ามาในห้องที่สถานะเป็น RESOLVED อยู่แล้ว ให้ตามเก็บผ่าน **ทางกันซ้ำเดียวกัน**
   *      (`createChatActivityOnce` — ล็อกต่อห้อง + ธง `sourceRef` ทั้งร้าน) ⇒ ยังได้ใบเดียวต่อห้องเสมอ
   */
  await catchUpResolvedChat(evt.tenantId, conversationId, open, partyId);
  // ◂ CRM C2.4

  if (!target.chatToLead) return; // ร้านไม่ได้เปิด "แชท → lead" = ผูก Party อย่างเดียว

  // CRM C2.3 ▸ ภาษาของลูกค้า: ช่อง `lang` ของผู้ติดต่อแชท (ที่ช่องทางบันทึกไว้) · ไม่มี = `meta.lang` ของห้อง (เว็บแชทส่งมาใน §3.3)
  //   เงื่อนไข "ภาษา" ของกฎมอบหมายอ่านค่านี้ ⇒ ร้านที่ตั้งกฎ "ลูกค้าอังกฤษ → เซลส์ที่พูดอังกฤษ" ทำงานได้จริงบนแชท
  //   ค่าที่อ่านไม่ออกถูกทิ้งเงียบ ๆ ในบริการผู้ติดต่อ (ลีดไม่หล่นเพราะภาษาเพี้ยน) ◂
  const lang = str(cc.lang) ?? str(payloadOf(conv.meta).lang);
  const res = await crm.contacts.leadFromBridge(
    { tenantId: evt.tenantId, systemId: target.systemId, actorUserId: null },
    { kind: "CHAT", name: str(cc.displayName), phone: str(cc.phone), email: str(cc.email), partyId, sourceDetail: { chatContactId: cc.id }, locale: lang /* CRM C2.3 ◂ */ },
  );
  if (res.created) await notifyNewLeadInApp({ tenantId: evt.tenantId, systemId: target.systemId, contactId: res.contactId, via: "CHAT" });
  // ผู้ติดต่อเพิ่งเกิดเดี๋ยวนี้ (chatToLead) ⇒ ตามเก็บห้องที่ปิดไปแล้วอีกครั้ง (ทางกันซ้ำเดิม ⇒ ไม่มีทางได้สองใบ)
  if (res.created) await catchUpResolvedChat(evt.tenantId, conversationId, open, partyId);
}

/**
 * ห้องที่ **ปิดแล้ว** (RESOLVED) แต่ยังไม่มีกิจกรรม CHAT ⇒ สร้างให้หนึ่งใบ ผ่านทางกันซ้ำเดียวกับ `onChatConversationStatus`
 * 🔴 ไม่มีสรุป AI ที่นี่โดยเจตนา: ตัวสรุปเป็นของเส้นทาง "ห้องถูกปิด" (มีเครดิต/สวิตช์ของร้านเป็นเงื่อนไข) — ที่นี่คือการ
 *    "ตามเก็บของที่ตกหล่น" ให้ประวัติลูกค้าครบก่อน · ถ้าร้านปิดห้องอีกครั้งภายหลัง เส้นทางนั้นจะเห็นว่ามีใบอยู่แล้วและไม่ทำซ้ำ
 * AUDIT-CLASS X1: ทุกคิวรีผูก `tenantId` ของ event · เป้าหมาย = ระบบที่เปิดสะพานใบแรกที่มีผู้ติดต่อของ Party นี้ (กติกาข้อ 7)
 */
async function catchUpResolvedChat(tenantId: string, conversationId: string, open: { systemId: string }[], partyId: string): Promise<void> {
  const conv = await prisma.chatConversation.findFirst({ where: { id: conversationId, tenantId }, select: { status: true, channel: true } });
  if (String(conv?.status ?? "").trim().toUpperCase() !== "RESOLVED") return;
  const prior = await prisma.crmActivity.findFirst({ where: { tenantId, source: "CHAT", sourceRef: conversationId }, select: { id: true } });
  if (prior) return; // มีใบแล้ว = ไม่ต้องทำอะไร (ไม่ต้องล็อก ไม่ต้องเขียน)
  for (const g of open) {
    const [c] = await contactsOfParty(tenantId, g.systemId, partyId, 1);
    if (!c) continue;
    await crm.activities.createChatActivityOnce(
      { tenantId, systemId: g.systemId },
      { conversationId, contactId: c.id, title: CHAT_ACTIVITY_TITLE, channel: str(conv?.channel) },
    );
    return;
  }
}

// CRM C2.4 ▸ ห้องแชทถูกปิด (RESOLVED) → กิจกรรมชนิด CHAT ใบเดียวต่อห้อง (+ สรุป AI ถ้าร้านเปิด)

/** หัวเรื่องคงที่ — AUDIT-CLASS X8: ไม่มีชื่อ เบอร์ อีเมล หรือข้อความของลูกค้าเลย (ข้อความอยู่ในห้องแชทที่มีด่านสิทธิ์ของตัวเอง) */
const CHAT_ACTIVITY_TITLE = "คุยกับลูกค้าในแชทจนจบเรื่องแล้ว";

const CHAT_SUMMARY_PROMPT = [
  "คุณเป็นผู้ช่วยของทีมขาย อ่านบทสนทนาในแชทด้านล่าง แล้วตอบเป็น JSON เท่านั้น",
  'รูปแบบ: {"summary": "สรุปสิ่งที่ลูกค้าต้องการและผลการคุย ไม่เกิน 3 บรรทัด"}',
  "เขียนเป็นภาษาไทย · ห้ามใส่เบอร์โทรหรืออีเมล · ห้ามเดาข้อมูลที่ไม่ได้อยู่ในบทสนทนา",
].join("\n");

/** อ่าน JSON จากคำตอบของโมเดล (มักห่อด้วย ```json … ```) — อ่านไม่ได้ = ว่าง */
function summaryOf(text: unknown): string {
  const s = String(text ?? "");
  const m = /\{[\s\S]*\}/.exec(s);
  if (m) {
    try {
      const v: unknown = JSON.parse(m[0]);
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const got = (v as Record<string, unknown>).summary;
        if (typeof got === "string" && got.trim()) return got.trim().slice(0, 4000);
      }
    } catch {
      /* อ่านไม่ออก = ไม่มีสรุป (กิจกรรมยังอยู่ครบ) */
    }
  }
  return "";
}

/**
 * `chat.conversation.status` = RESOLVED ⇒ กิจกรรมชนิด CHAT **ใบเดียวต่อห้อง ทั้งร้าน**
 * AUDIT-CLASS X1: ห้อง/ผู้ติดต่อแชท/ผู้ติดต่อ CRM ค้นด้วย `tenantId` ของ event ทุกคิวรี (event ของร้านอื่นที่ถือ id ของเรา = ไม่ทำอะไร)
 * AUDIT-CLASS X4: ธงก่อนแล้วค่อยเขียน — `createChatActivityOnce` ถือ advisory lock ของห้อง + ตรวจ (tenantId, source CHAT, sourceRef)
 *   ⇒ ส่งซ้ำ · ยิงพร้อมกัน 10 ทาง · วนเปิด–ปิดห้องใหม่ = ใบเดียวและ `crm.activity.logged` ใบเดียวตลอดไป
 *   และ **สรุป AI ทำเฉพาะคนที่สร้างแถวได้** ⇒ เรียกโมเดลครั้งเดียว หักเครดิตครั้งเดียว
 * AUDIT-CLASS X8: prompt ถูกปิดเบอร์/อีเมลก่อนออกนอกเครื่อง · `AiCreditTxn.note` = `crm.chat.summary#<conversationId>` (id ล้วน)
 */
export async function onChatConversationStatus(evt: BridgeEvent, deps?: { ai?: AiProvider }): Promise<void> {
  const p = payloadOf(evt.payload);
  if (String(p.status ?? "").trim().toUpperCase() !== "RESOLVED") return;
  const conversationId = str(p.conversationId);
  if (!conversationId) return;
  // ประตูมาก่อนเสมอ: ต้องมีระบบ CRM ที่เปิดสะพาน v2 อย่างน้อยหนึ่งใบ (อ่านสดทุกครั้ง — uiVersion 1 ⇒ ไม่ทำอะไรเลย)
  const open = (await crmGates(evt.tenantId)).filter(bridgeOpen);
  if (open.length === 0) return;
  const conv = await prisma.chatConversation.findFirst({ where: { id: conversationId, tenantId: evt.tenantId }, select: { contactId: true, channel: true } });
  if (!conv?.contactId) return;
  const cc = await prisma.chatContact.findFirst({ where: { id: conv.contactId, tenantId: evt.tenantId }, select: { partyId: true } });
  const partyId = cc?.partyId ?? null;
  if (!partyId) return; // ห้องที่ยังไม่รู้ว่าเป็นใคร = ไม่มีอะไรให้ผูก (ระบบไม่เดา)
  // เป้าหมาย = ระบบ CRM ใบ **แรก** (ลำดับ crmGates) ที่มีผู้ติดต่อของ Party นี้ ⇒ Party ที่อยู่สองระบบได้กิจกรรมใบเดียว
  let hit: { systemId: string; contactId: string } | null = null;
  for (const g of open) {
    const [c] = await contactsOfParty(evt.tenantId, g.systemId, partyId, 1);
    if (c) {
      hit = { systemId: g.systemId, contactId: c.id };
      break;
    }
  }
  if (!hit) return; // Party ยังไม่มีผู้ติดต่อ CRM = ไม่สร้างอะไร (การเปิด lead เป็นเรื่องของ `chat.message.received`)
  const scope = { tenantId: evt.tenantId, systemId: hit.systemId };
  const res = await crm.activities.createChatActivityOnce(scope, {
    conversationId,
    contactId: hit.contactId,
    title: CHAT_ACTIVITY_TITLE,
    channel: str(conv.channel),
  });
  if (!res.created) return; // ใบนี้มีอยู่แล้ว ⇒ ไม่เรียก AI ไม่หักเครดิต (X4)

  // ── สรุปด้วย AI (ไม่บังคับ · ค่าเริ่มต้นปิด) ──
  const sys = await prisma.appSystem.findFirst({ where: { id: hit.systemId, tenantId: evt.tenantId, type: "CRM" }, select: { settings: true } });
  if (crm.parseCrmSettings(sys?.settings ?? null).ai.chatSummary !== true) return;
  if (!(await canSpend(evt.tenantId))) return; // เครดิตหมด = กิจกรรมยังอยู่ แค่ไม่มีสรุป (ไม่เรียกโมเดล)
  const ai = deps?.ai ?? resolveProvider();
  if (!ai) return;
  try {
    const msgs = await prisma.chatMessage.findMany({
      where: { tenantId: evt.tenantId, conversationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { direction: true, body: true },
      take: 80,
    });
    const text = msgs
      // AUDIT-CLASS X8: ตัวปิดเบอร์/อีเมลตัวเดียวกับที่ `crm/calls.ts` ใช้ — เข้าถึงผ่าน facade (ด่าน F2.3 ห้ามสะพาน import ลึก)
      .map((m) => `${m.direction === "IN" ? "ลูกค้า" : "ร้าน"}: ${crm.calls.redactContactInfo(String(m.body ?? ""))}`)
      .join("\n")
      .slice(0, 12_000);
    if (!text.trim()) return;
    const reply = await ai.chat([{ role: "system", content: CHAT_SUMMARY_PROMPT }, { role: "user", content: text }], { maxTokens: 500 });
    const summary = summaryOf(reply?.text);
    if (summary) await crm.activities.setChatAiSummary(scope, res.id, summary);
    await chargeUsageSafe(
      { tenantId: evt.tenantId },
      {
        source: "CRM_ASSIST",
        model: String(reply?.model ?? "unknown"),
        tokensIn: Number(reply?.tokensIn ?? 0),
        tokensOut: Number(reply?.tokensOut ?? 0),
        note: `crm.chat.summary#${conversationId}`,
      },
    );
  } catch (e) {
    // AUDIT-CLASS X8: log เฉพาะเหตุ ไม่ใส่ข้อความแชท/สรุป · กิจกรรมถูกสร้างแล้วและต้องไม่หายเพราะ AI ล้ม
    await logOps("WARN", "crm.chat.summary", "สรุปห้องแชทด้วย AI ไม่สำเร็จ (กิจกรรมแชทถูกบันทึกแล้ว)", {
      tenantId: evt.tenantId,
      detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    });
  }
}
// ◂ CRM C2.4
