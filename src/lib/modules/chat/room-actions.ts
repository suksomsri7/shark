"use server";

// room-actions.ts — server action ของ "ห้องแชท" (WO-CV4/CV5 · แบบร่างจอ 2–4)
//
// 🔴 ทำไมแยกไฟล์
//    รอบนี้ `inbox-actions.ts` เป็นของสาย F (คอลัมน์บริบท) และถูกสั่งห้ามแตะ
//    ⇒ ของที่หัวห้อง/กล่องพิมพ์ต้องใช้เพิ่มมาอยู่ที่นี่ · ย้ายไปรวมทีหลังได้ทั้งก้อน
//       (ไม่มีอะไรผูกกับชื่อไฟล์ — ผู้เรียกมีแค่ `inbox-client.tsx` กับ `composer.tsx`)
//
// 🔴 กติกาของไฟล์นี้ (เหมือน inbox-actions.ts เป๊ะ — ตรรกะความปลอดภัยต้องหน้าตาเดียวกันทุกไฟล์)
//    1. ทุกเส้นเรียกด่านสิทธิ์ `assertChatCan` **ก่อน** แตะข้อมูล
//    2. ทุกเส้นตรวจ "ห้องนี้อยู่ใน unit ที่คนนี้เข้าถึงได้ไหม" ด้วย `canAccessConvUnit` จาก service.ts
//       (ตัวเดียวกับที่ inbox ใช้ — ห้ามเขียนเงื่อนไข unit เองซ้ำ)
//    3. คืนค่าที่ serialize ได้ล้วน (เวลา = epoch ms) ห้ามคืน Date/Prisma object ข้ามเส้น
//    4. **ห้าม `revalidatePath`** — จอนี้ poll ทุก 5 วิ การสั่ง revalidate = ล้างร่างที่ทีมกำลังพิมพ์

import { Prisma } from "@prisma/client";
import { requireTenant } from "@/lib/core/context";
import { guardTranslateEnabled } from "./translate";
import { tenantDb } from "@/lib/core/db";
import { assertChatCan } from "./guard";
import { canAccessConvUnit } from "./service";
import { parseTags } from "./labels";
// ชั้นกลาง realtime (WO-CV9) — ไม่มีกุญแจ = คืนทันที ไม่ยิงเน็ต ไม่ throw
import { publishChat, EV_CHAT_TYPING, TYPING_TTL_MS } from "@/lib/realtime";

type Auth = Awaited<ReturnType<typeof requireTenant>>;

const db = (tenantId: string, systemId: string) => tenantDb({ tenantId, systemId });

/** จำนวนผลค้นหาในห้องต่อครั้ง — พอให้กระโดดไปหาของเก่าได้ ไม่ถึงกับลากทั้งห้องมาบนจอ */
const SEARCH_TAKE = 30;
/** ความยาวชิ้นข้อความที่โชว์ในผลค้นหา (ตัดหัวท้ายรอบคำที่เจอ) */
const SNIPPET_PAD = 40;

/**
 * หาห้อง + ตรวจว่าคนนี้เข้าถึง unit ของห้องได้ไหม
 * 🔴 คืนแถวออกมาด้วยเลย (ไม่ใช่แค่ boolean) เพราะทุกเส้นในไฟล์นี้ต้องใช้ค่าจากแถวนี้ต่ออยู่แล้ว
 *    ⇒ ไม่มีการยิง query ซ้ำเพื่อ "ตรวจก่อนแล้วค่อยอ่าน"
 */
async function openRoom(auth: Auth, systemId: string, conversationId: string) {
  const conv = await db(auth.active.tenantId, systemId).chatConversation.findFirst({
    where: { id: conversationId },
    select: { id: true, unitId: true, tags: true, meta: true },
  });
  if (!conv) return { ok: false as const, reason: "ไม่พบบทสนทนานี้" };
  if (!canAccessConvUnit(auth.active.unitAccess as string[], conv.unitId)) {
    return { ok: false as const, reason: "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" };
  }
  return { ok: true as const, conv };
}

/** meta ของห้องเป็น Json อิสระ — อ่านเป็น object เสมอ ไม่งั้น spread ตอนเขียนกลับจะพัง */
function metaObject(meta: unknown): Record<string, unknown> {
  return meta !== null && typeof meta === "object" && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {};
}

export type RoomContext = {
  /**
   * path ที่ลูกค้ากำลังดูตอนทักมา — ค่าดิบจาก `meta.pageUrl` (มติ D1)
   * 🔴 ส่ง **ค่าดิบ** ไม่ใช่ชื่อที่แปลแล้ว เพราะทะเบียนชื่อหน้าอยู่ `page-label.ts` ซึ่งเป็น pure
   *    ⇒ หัวห้อง (จอ) กับคอลัมน์บริบท (สาย F) แปลด้วยทะเบียนเดียวกัน ไม่มีวันเพี้ยนคนละแบบ
   */
  pageUrl: string | null;
  /** ป้ายกำกับของห้อง (เมนู ⋮ → "ติดป้ายกำกับ") */
  tags: string[];
  /** เปิด "แปลอัตโนมัติในห้องนี้" ไว้ไหม — **ค่าเริ่มต้นคือปิด** (มติ D2) */
  autoTranslate: boolean;
  /**
   * ความยาวคลิปเสียงต่อข้อความ (ms) — คีย์คือ `messageId`
   * 🔴 มาจาก `ChatAttachment.durationMs` ที่ WO-CV2 เพิ่มไว้ ⇒ ฟองเสียงขึ้น "0:12" ได้
   *    **โดยไม่ต้องโหลดไฟล์เสียงมาวัดเอง** (ห้องละ 20 คลิป = 20 ดาวน์โหลดที่ไม่จำเป็น)
   * ⚠️ ควรย้ายไปอยู่ใน `ThreadAttachment` ของ `loadThreadAction` (ไฟล์ของสาย F) จะได้ไม่ต้องยิงแยก
   *    — เขียนไว้ในรายงานส่งมอบแล้ว
   */
  audioMs: Record<string, number>;
};

/**
 * ของที่หัวห้อง/ฟองเสียงต้องใช้ แต่ `loadThreadAction` ยังไม่ได้ส่งมา
 * เรียกตอนเปิดห้อง + เมื่อจำนวนข้อความเปลี่ยน (ไม่ใช่ทุกรอบ poll — ค่าพวกนี้แทบไม่ขยับ)
 */
export async function loadRoomContextAction(
  systemId: string,
  conversationId: string,
): Promise<RoomContext | null> {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.conversation.read");
  if (!systemId || !conversationId) return null;

  const room = await openRoom(auth, systemId, conversationId);
  if (!room.ok) return null;
  const meta = metaObject(room.conv.meta);
  const pageUrl = typeof meta.pageUrl === "string" && meta.pageUrl.trim() !== "" ? meta.pageUrl : null;

  const atts = await db(auth.active.tenantId, systemId).chatAttachment.findMany({
    where: { message: { conversationId }, durationMs: { not: null } },
    select: { messageId: true, durationMs: true },
  });
  const audioMs: Record<string, number> = {};
  for (const a of atts) if (a.durationMs !== null) audioMs[a.messageId] = a.durationMs;

  return {
    pageUrl,
    tags: parseTags(room.conv.tags),
    autoTranslate: meta.autoTranslate === true,
    audioMs,
  };
}

export type RoomSearchHit = {
  messageId: string;
  /** ชิ้นข้อความรอบคำที่เจอ (ไม่ส่งทั้งก้อน — ผลค้นหา 30 รายการจะกลายเป็นหลายหมื่นตัวอักษร) */
  snippet: string;
  direction: string;
  isInternal: boolean;
  createdAt: number;
};

/**
 * ค้นหาข้อความ "ในห้องนี้" — 🔴 ค้นที่ **ชั้นข้อมูล** ไม่ใช่กรองของที่โหลดมาบนจอแล้ว
 *
 * ห้องที่คุยกันมา 500 ข้อความ จอถือไว้แค่ท้าย ๆ ⇒ กรองบนจอ = "ค้นหาปลอม" ที่หาของเก่าไม่เจอเลย
 * และผู้ใช้จะสรุปว่า "ไม่มีข้อความนี้" ทั้งที่มี (ผิดกว่าไม่มีปุ่มค้นหาเสียอีก)
 *
 * 🔴 รวมโน้ตภายในด้วยโดยตั้งใจ — นี่คือช่องค้นหา **ของทีม** ที่ผ่านด่าน `chat.conversation.read`
 *    แล้ว (ลูกค้าไม่มีทางเรียกเส้นนี้) · โน้ตคือที่ที่ทีมจดว่า "เช็คกับพี่เอกแล้ว" ซึ่งเป็นของที่ต้องหาเจอ
 */
export async function searchInRoomAction(
  systemId: string,
  conversationId: string,
  query: string,
): Promise<RoomSearchHit[]> {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.conversation.read");
  const needle = query.trim();
  if (!systemId || !conversationId || needle.length < 2) return [];

  const room = await openRoom(auth, systemId, conversationId);
  if (!room.ok) return [];

  const rows = await db(auth.active.tenantId, systemId).chatMessage.findMany({
    where: {
      conversationId,
      purgedAt: null,
      body: { contains: needle, mode: "insensitive" },
    },
    select: { id: true, body: true, direction: true, isInternal: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: SEARCH_TAKE,
  });

  return rows.map((m) => {
    const body = m.body ?? "";
    const at = body.toLowerCase().indexOf(needle.toLowerCase());
    const from = Math.max(0, at - SNIPPET_PAD);
    const to = Math.min(body.length, at + needle.length + SNIPPET_PAD);
    return {
      messageId: m.id,
      snippet: `${from > 0 ? "…" : ""}${body.slice(from, to)}${to < body.length ? "…" : ""}`,
      direction: m.direction,
      isInternal: m.isInternal,
      createdAt: m.createdAt.getTime(),
    };
  });
}

/**
 * เปิด/ปิด "แปลอัตโนมัติในห้องนี้" (เมนู ⋮ · มติ D2)
 *
 * 🔴 มติ W3 (31 ส.ค.) เคาะว่า **ค่าตั้งต้นของทั้งระบบ** คือ "กดแปลเมื่อต้องการ" เพื่อคุมค่า AI
 *    (~$0.008 ต่อข้อความ) · ตัวนี้ไม่ได้ล้มมติ W3 — มันคือ "ทีมเลือกเปิดเองเป็นรายห้อง"
 *    ⇒ เงื่อนไข 3 ข้อที่ห้ามถอด: ปิดเป็นค่าเริ่มต้น · บอกว่ามีค่าใช้จ่ายก่อนเปิด · ผูกสิทธิ์
 *      `chat.translate.use` (สิทธิ์เดียวกับปุ่มแปล ไม่ใช่ใครก็เปิดของที่กินเงินร้านได้)
 *
 * ⚠️ ตัวที่ "แปลจริง" ตอนข้อความเข้ามาอยู่ในเส้นทางรับข้อความ (`service.ts` — ไฟล์ของสายอื่น)
 *    วันนี้ค่านี้จึงเป็น **ความตั้งใจของทีมที่บันทึกไว้** และหน้าจอบอกตามตรงว่ายังไม่มีผลกับขาเข้า
 *    รายละเอียดสิ่งที่ต้องต่อให้ครบเขียนไว้ในรายงานส่งมอบแล้ว (ห้ามเงียบ)
 */
export async function setRoomAutoTranslateAction(
  systemId: string,
  conversationId: string,
  on: boolean,
): Promise<{ ok: boolean; autoTranslate?: boolean; reason?: string }> {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.translate.use");
  if (!systemId || !conversationId) {
    return { ok: false, reason: "ข้อมูลไม่ครบสำหรับตั้งค่าการแปลของห้องนี้" };
  }
  const room = await openRoom(auth, systemId, conversationId);
  if (!room.ok) return { ok: false, reason: room.reason };

  // 🔴 มติ D19 (สาย G รายงาน): เปิด "แปลอัตโนมัติ" รายห้องได้ทั้งที่ร้านยังไม่เปิดสวิตช์แปลระดับร้าน
  //    = ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้นเงียบ ๆ (translateMessage ถูก guard ข้างในทุกครั้ง) ⇒ บอกตรงนี้ก่อน
  //    ใช้ด่านตัวเดียวกับตัวแปล ไม่พิมพ์เงื่อนไขซ้ำ · ปิด (on=false) ทำได้เสมอ
  if (on) {
    const gate = await guardTranslateEnabled(auth.active.tenantId, systemId);
    if (!gate.ok) return { ok: false, reason: gate.reason };
  }

  const meta = metaObject(room.conv.meta);
  await db(auth.active.tenantId, systemId).chatConversation.updateMany({
    where: { id: conversationId },
    // merge ทั้งก้อน — `meta` เก็บบริบทลูกค้า (pageUrl/country/userAgent) ที่ห้ามหายไปเพราะตั้งค่าแปล
    data: { meta: { ...meta, autoTranslate: on } as Prisma.InputJsonValue },
  });
  return { ok: true, autoTranslate: on };
}

/**
 * บอกคนอื่นในทีมว่า "ฉันกำลังพิมพ์อยู่ในห้องนี้" (WO-CV9)
 *
 * 🔴 สิ่งที่ส่งออกไปมีแค่ **ใคร · ห้องไหน · หมดอายุเมื่อไหร่** — ห้ามมีเนื้อร่างติดไปเด็ดขาด
 *    ร่างที่ยังไม่ได้กดส่งคือข้อความส่วนตัวที่สุดที่มีในระบบนี้ (ทีมพิมพ์แล้วลบทิ้งเป็นเรื่องปกติ)
 * 🔴 มีวันหมดอายุติดไปเสมอ (`TYPING_TTL_MS`) — ไม่มีสัญญาณ "หยุดพิมพ์" ให้พึ่ง
 *    ปิดแท็บกลางคัน/เน็ตหลุด แล้วสามจุดต้องหายเองที่ฝั่งคนดู
 * ⚠️ ฝั่งจอ throttle ไว้ไม่ต่ำกว่า `TYPING_PING_MS` — ทุกตัวอักษร = 1 คำขอ คือการยิงตัวเองรัว ๆ
 *
 * สิทธิ์: `chat.message.send` (คนที่ดูอย่างเดียวไม่มีทางพิมพ์ ⇒ ไม่มีเหตุให้ประกาศว่ากำลังพิมพ์)
 * คืน `{ ok:false }` เงียบ ๆ เมื่อผิดพลาด — ตัวบอกสถานะพังต้องไม่ขึ้นข้อความแดงขวางการทำงาน
 */
export async function typingAction(
  systemId: string,
  conversationId: string,
): Promise<{ ok: boolean }> {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.message.send");
  if (!systemId || !conversationId) return { ok: false };
  const room = await openRoom(auth, systemId, conversationId);
  if (!room.ok) return { ok: false };
  await publishChat(auth.active.tenantId, systemId, EV_CHAT_TYPING, {
    conversationId,
    userId: auth.user.id,
    until: Date.now() + TYPING_TTL_MS,
  });
  return { ok: true };
}

/**
 * ข้อความ "แผนที่ร้าน" สำหรับวางลงกล่องพิมพ์ (แผ่น ＋ ตามแบบร่าง)
 *
 * 🔴 ดึงจากข้อมูลของ **ร้านนั้นจริง** ไม่ใช่ลิงก์ที่พิมพ์ตายตัว — ระบบนี้มีหลายร้าน
 *    ลิงก์ฮาร์ดโค้ดแปลว่าร้าน B จะส่งแผนที่ของร้าน A ให้ลูกค้า (ความเสียหายที่กู้ไม่ได้)
 *
 * ⚠️ **จุดที่แผนกับโค้ดจริงไม่ตรงกัน** (รายงานไว้แล้ว): รีโปนี้ยังไม่มี "ที่อยู่/พิกัดร้าน"
 *    เป็นฟิลด์ของตัวเอง · ที่ใกล้ที่สุดคือ `BusinessUnit.settings` (Json ที่สคีมาตั้งใจให้เก็บ
 *    ค่าประจำสาขา) ⇒ อ่านจากที่นั่น และถ้ายังไม่ได้ตั้ง **บอกตรง ๆ ว่ายังไม่ได้ตั้ง**
 *    ห้ามเดา ห้ามใส่พิกัดตัวอย่าง (ลูกค้าขับรถไปผิดที่ = เสียหายจริง)
 */
export async function shopLocationAction(
  systemId: string,
  conversationId: string,
): Promise<{ ok: boolean; text?: string; reason?: string }> {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.message.send");
  if (!systemId || !conversationId) return { ok: false, reason: "ข้อมูลไม่ครบสำหรับส่งแผนที่ร้าน" };

  const room = await openRoom(auth, systemId, conversationId);
  if (!room.ok) return { ok: false, reason: room.reason };

  const tenantId = auth.active.tenantId;
  // สาขาของห้องนี้ก่อน (ห้องที่ผูก unit) — ไม่ผูกก็ใช้สาขาที่ระบบแชทนี้ติดตั้งอยู่
  let unitId = room.conv.unitId;
  if (!unitId) {
    const link = await db(tenantId, systemId).appSystemUnit.findFirst({
      where: { systemId },
      select: { unitId: true },
    });
    unitId = link?.unitId ?? null;
  }
  if (!unitId) {
    return { ok: false, reason: "ห้องนี้ยังไม่ได้ผูกกับสาขา จึงยังไม่รู้ว่าจะส่งแผนที่ของที่ไหน" };
  }

  const unit = await db(tenantId, systemId).businessUnit.findFirst({
    where: { id: unitId },
    select: { name: true, settings: true },
  });
  if (!unit) return { ok: false, reason: "ไม่พบข้อมูลสาขาของห้องนี้" };

  const s = metaObject(unit.settings);
  const address = typeof s.address === "string" ? s.address.trim() : "";
  const mapUrl = typeof s.mapUrl === "string" ? s.mapUrl.trim() : "";
  const lat = typeof s.lat === "number" ? s.lat : null;
  const lng = typeof s.lng === "number" ? s.lng : null;

  const link =
    mapUrl !== ""
      ? mapUrl
      : lat !== null && lng !== null
        ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        : address !== ""
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
          : "";

  if (link === "" && address === "") {
    return {
      ok: false,
      reason:
        "ยังไม่ได้บันทึกที่อยู่หรือพิกัดของสาขานี้ — เพิ่มที่อยู่ในตั้งค่าสาขาก่อน แล้วปุ่มนี้จะส่งแผนที่ให้ลูกค้าได้ทันที",
    };
  }

  const lines = [`${unit.name}`, address, link].filter((l) => l !== "");
  return { ok: true, text: lines.join("\n") };
}
