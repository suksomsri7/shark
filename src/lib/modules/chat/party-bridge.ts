// party-bridge.ts — ทางเชื่อม "ตัวตนกลางของลูกค้า (Party)" ↔ โมดูลแชท (ใบ CRM v2 · C0.3 ส่วน B)
//
// ผู้เรียกคือโมดูลอื่น (CRM) ที่รู้จักลูกค้าในนาม `partyId` เท่านั้น — ไม่รู้จัก `ChatContact`/ห้องแชท
// ทั้งสองฟังก์ชันออกทาง facade `chat/index.ts` และ **ห้าม throw**: ผู้เรียกคือหน้าจอ 360 องศา และ
// ตัวส่งข้อความเป็นชุด ซึ่งต้องเดินต่อให้ครบทุกคนแม้ลูกค้าบางรายจะไม่มีไลน์
//
// 🔴 prisma เข้าทาง `./db` (chokepoint ของโมดูล · fitness F5.1) และ **ทุก where ผูก `tenantId` ตรง ๆ**
// 🔴 PDPA (กลุ่ม X8): ไฟล์นี้ไม่พิมพ์เบอร์/อีเมล/เนื้อข้อความลง log เลย

import { prisma } from "./db";
import { pushToContact } from "./push";
import { canAccessConvUnit, unitAccessWhere } from "./service";

export type ChatPartyCtx = {
  tenantId: string;
  /** ระบบแชทของผู้เรียก (ถ้ามี) — ใช้เป็นค่าตั้งต้นของ "จะส่งออกด้วยการเชื่อมต่อของระบบไหน" เท่านั้น */
  systemId?: string | null;
  actorUserId?: string | null;
};

export type SendLineToPartyInput = {
  partyId: string;
  text: string;
  /** บังคับระบบแชทที่ใช้ส่ง (ไม่ระบุ = ระบบของผู้ติดต่อไลน์ที่หาเจอ) */
  systemId?: string | null;
};

export type SendLineToPartyResult = { ok: boolean; reason?: string; externalMessageId?: string };

/** ไม่มีตัวตนไลน์ของลูกค้ารายนี้เลย — คนละเรื่องกับ "ร้านยังไม่ได้เชื่อมไลน์" (ข้อสอบ C0.3-SB.4) */
const NO_LINE_IDENTITY = "ผู้ติดต่อรายนี้ยังไม่มีบัญชีไลน์ที่ผูกไว้ — ให้ลูกค้าทักเข้ามาทางไลน์ก่อน จึงจะส่งหาได้";

/**
 * ส่งข้อความไลน์ถึง "ตัวตนกลาง" หนึ่งราย (ร้านเป็นฝ่ายเริ่ม) — หา `ChatContact` ช่องทาง LINE
 * ล่าสุดของ Party รายนั้น **ในร้านนี้** แล้วส่งผ่านเส้นเดียวกับที่แคมเปญใช้ (`pushToContact`)
 *
 * 🔴 **ไม่มีตรรกะความยินยอมที่นี่** (ใบสั่ง C0.3 ส่วน B): ผู้เรียกเป็นคนตัดสินว่าส่งได้ไหม
 *    — ที่นี่ตัดสินใจแทนเมื่อไหร่ = มีด่าน PDPA สองชุดที่จะค่อย ๆ ไม่ตรงกัน
 * 🔴 เหตุผลที่ปฏิเสธต้อง**แยกกรณีกัน** (มติผู้คุมงาน ข้อ 3): "ลูกค้าไม่มีไลน์" ≠ "ร้านยังไม่ได้เชื่อมไลน์"
 *    ข้อความกลาง ๆ อันเดียวจะกลบการตั้งค่าที่ผิดของร้านไว้เงียบ ๆ จนไม่มีใครรู้ว่าส่งไม่ออกเพราะอะไร
 * 🔴 ไม่ throw ไม่ว่ากรณีใด
 */
export async function sendLineToParty(
  ctx: ChatPartyCtx,
  input: SendLineToPartyInput,
): Promise<SendLineToPartyResult> {
  try {
    const tenantId = (ctx?.tenantId ?? "").trim();
    const partyId = (input?.partyId ?? "").trim();
    const text = String(input?.text ?? "").trim();
    if (!tenantId || !partyId) return { ok: false, reason: NO_LINE_IDENTITY };
    if (!text) return { ok: false, reason: "ข้อความว่าง — ไม่มีอะไรให้ส่ง" };

    // ผู้ติดต่อไลน์ล่าสุดของ Party รายนี้ — ทั่วทั้งร้าน (ลูกค้าอาจทักเข้ามาที่ระบบแชทไหนก็ได้)
    // `blockedAt` = ลูกค้าบล็อกร้าน/ร้านบล็อกลูกค้า ⇒ ไม่ใช่ปลายทางที่ส่งได้
    const contact = await prisma.chatContact.findFirst({
      where: { tenantId, partyId, channel: "LINE", blockedAt: null },
      orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, systemId: true, externalUserId: true, customerId: true },
    });
    if (!contact) return { ok: false, reason: NO_LINE_IDENTITY };

    return await pushToContact({
      tenantId,
      channel: "LINE",
      externalUserId: contact.externalUserId,
      text,
      systemId: input.systemId ?? contact.systemId,
      customerId: contact.customerId,
    });
  } catch {
    // ห้าม throw — ผู้เรียกเป็นตัวส่งเป็นชุด · ไม่พิมพ์รายละเอียด (อาจมีข้อมูลลูกค้าติดมา)
    return { ok: false, reason: "ส่งข้อความไม่สำเร็จ — ลองใหม่อีกครั้ง หรือตรวจการเชื่อมต่อที่หน้าตั้งค่าแชท" };
  }
}

export type ConversationByPartyRow = {
  conversationId: string;
  /** ระบบแชทที่ห้องนี้อยู่ — รายการนี้เป็น "ทั้งร้าน" ไม่ใช่ระบบเดียว จึงต้องติดมากับทุกแถว */
  systemId: string;
  channel: string;
  lastMessageAt: Date | null;
  status: string;
  href: string;
};

const MAX_CONVERSATIONS = 50;

/**
 * ห้องแชททั้งหมดของลูกค้ารายนี้ — **ทั่วทั้งร้าน** (มติผู้คุมงาน ข้อ 6)
 *
 * 🔴 ทำไมไม่ผูกกับ `ctx.systemId`: ร้านหนึ่งมีระบบแชทได้หลายระบบ (เช่น แยกสาขา/แยกแบรนด์) คนขายที่เปิด
 *    หน้า 360 องศาถามว่า "เคยคุยอะไรกับบริษัทนี้บ้าง" แล้วได้คำตอบไม่ครบ = แย่กว่าไม่ได้คำตอบเลย
 *    (เขาจะสรุปว่า "ไม่เคยคุย" ทั้งที่อีกระบบคุยอยู่) ⇒ กว้างทั้งร้าน แต่ **ไม่เคยกว้างข้ามร้าน**:
 *    `tenantId` ผูกตรงใน where ทุกคำสั่ง
 * 🔴 ด่าน unit (M11) ยังบังคับเหมือนเดิม และวางไว้ **บนสุดของการกว้างนั้น** — ใช้ตัวกรองกลางของโมดูล
 *    (`unitAccessWhere` ใน SQL เพื่อให้ `take` นับเฉพาะแถวที่เห็นได้จริง + `canAccessConvUnit` ย้ำอีกชั้น
 *     ตอนประกอบผลลัพธ์) ห้ามเขียนเงื่อนไข `unitId` เองที่นี่ — ตรรกะความปลอดภัย 2 ชุดคือวันที่ชุดหนึ่งหลวม
 * 🔴 **`opts.unitAccess` เป็นพารามิเตอร์บังคับ (ทั้ง `opts` เองด้วย)** — ไม่ใช่ `?`:
 *    `unitAccessWhere(undefined)` คืน `{}` (ไม่กรองอะไรเลย) ตามกติกาเดิมของโมดูลแชท ⇒ ถ้าปล่อยให้ไม่ส่งได้
 *    ผู้เรียก CRM ที่ "ลืมส่ง" จะได้ห้องแชททั้งร้านโดยไม่มีด่านสาขาเลย และ **ไม่มีอะไรเตือน** เพราะมันไม่ error
 *    ทำให้บังคับที่ระดับ type แทน: ลืม = คอมไพล์ไม่ผ่าน ไม่ใช่ข้อมูลรั่วเงียบ ๆ
 *
 * ผู้เรียกฝั่ง CRM ส่งอะไร: `unitAccess: auth.active.unitAccess as string[]` ตรง ๆ จาก session ของคนที่เปิดหน้า
 *    (แบบเดียวกับหน้าอื่นทั้งระบบ เช่น `src/app/app/party/[partyId]/page.tsx:68`) — `["*"]` = เห็นทุกสาขา
 *    (คนที่มีสิทธิ์ระดับร้าน) · รายการ id ของ `BusinessUnit` = เห็นเฉพาะสาขานั้น ๆ + ห้องที่ไม่ผูกสาขา
 *    ⚠️ ห้ามส่ง `["*"]` ค้างไว้เพื่อ "ให้มันผ่านไปก่อน" — นั่นคือการปิดด่านด้วยมือ
 *
 * ℹ️ id ของ unit ใช้ร่วมกันข้ามระบบได้จริง: `BusinessUnit` เป็นของ **ร้าน** (สาขา) ส่วน `AppSystemUnit`
 *    แค่จับคู่ระบบหนึ่ง ๆ เข้ากับสาขาเดิมเหล่านั้น ⇒ unitAccess ของคน CRM เทียบกับ `unitId` ของห้องแชทได้ตรง ๆ
 */
export async function listConversationsByParty(
  ctx: ChatPartyCtx,
  partyId: string,
  opts: { take?: number; unitAccess: string[] },
): Promise<ConversationByPartyRow[]> {
  const tenantId = (ctx?.tenantId ?? "").trim();
  const pid = (partyId ?? "").trim();
  if (!tenantId || !pid) return [];
  const take = Math.min(Math.max(1, Math.floor(opts?.take ?? 20) || 1), MAX_CONVERSATIONS);
  // 🔴 ด่าน unit ต้อง "ปิดไว้ก่อน" ตอนรันจริง ไม่ใช่แค่ตอนคอมไพล์: ผู้เรียก CRM ส่ง
  //    `auth.active.unitAccess as string[]` ซึ่งมาจากคอลัมน์ JSON ผ่าน `as` (TypeScript ไม่ได้ตรวจอะไรเลย)
  //    ⇒ ถ้าวันหนึ่งค่านั้นเป็น null/ไม่ใช่อาร์เรย์ `unitAccessWhere(undefined)` จะคืน `{}` = ไม่กรองสาขาเลย
  //    และเงียบสนิท · ไม่ใช่อาร์เรย์ = ไม่มีสิทธิ์ที่พิสูจน์ได้ = ไม่เห็นห้องไหนเลย
  if (!Array.isArray(opts?.unitAccess)) return [];
  const unitAccess = opts.unitAccess;

  const rows = await prisma.chatConversation.findMany({
    where: {
      tenantId,
      contact: { tenantId, partyId: pid },
      ...unitAccessWhere(unitAccess),
    },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take,
    select: { id: true, systemId: true, channel: true, lastMessageAt: true, status: true, unitId: true },
  });

  return rows
    .filter((r) => canAccessConvUnit(unitAccess, r.unitId))
    .map((r) => ({
      conversationId: r.id,
      systemId: r.systemId,
      channel: r.channel as string,
      lastMessageAt: r.lastMessageAt,
      status: r.status as string,
      href: `/app/sys/${r.systemId}/chat?c=${r.id}`,
    }));
}
