// push.ts — ส่งข้อความ "ขาออกก่อน" (proactive push) ถึงลูกค้าผ่านช่องทางแชท (M3.2)
//
// 🔴 ต่างจาก `sendReply()` ตรงที่ **ไม่มีห้องแชทเป็นจุดตั้งต้น**: แคมเปญรู้แค่ว่า "สมาชิกคนนี้ผูก
//    ไลน์ไว้ด้วย id นี้" (MemberChannelIdentity) แล้วอยากส่งข้อความหาเขา ⇒ ต้องเข้าทาง push API
//    ของช่องทางตรง ๆ ผ่าน adapter เดียวกับที่ทีมใช้ตอบแชท (ความสามารถ/รูปแบบเดียวกันเสมอ)
//
// 🔴 ไม่เขียนข้อความลงกล่องแชทของทีม: แคมเปญ 1 ใบ = หลายพันข้อความ · ยัดลงห้องแชท = กล่องงานของ
//    ทีมถูกกลบด้วยข้อความที่ไม่มีใครต้องตอบ (ผลการส่งอยู่ที่หน้าแคมเปญ ซึ่งเป็นที่ที่คนไปดูอยู่แล้ว)
//    วันไหนอยากให้ขึ้นในห้องด้วย ให้ทำเป็นสวิตช์ของร้าน ไม่ใช่พฤติกรรมเงียบ ๆ ที่นี่
//
// 🔴 ห้าม throw — ผู้เรียกคือ "ตัวส่งแคมเปญ" ที่ต้องไปต่อให้ครบทุกคน · ล้ม = คืนเหตุผลไทย

import type { ChatChannelType } from "@prisma/client";
import { prisma } from "./db";
import { getAdapter, isSupported, type ChannelCreds } from "./adapter";
import { credsOf } from "./service";

export type PushToContactInput = {
  tenantId: string;
  /** key ช่องทางกลาง (D19) เช่น "LINE" — ช่องทางที่ยังไม่มี adapter = ตอบเหตุผลไทย ไม่ throw */
  channel: string;
  /** id ฝั่งผู้ให้บริการ (LINE userId) — มาจาก `MemberChannelIdentity.externalId` */
  externalUserId: string;
  text: string;
  /** ระบบแชทที่จะใช้ส่ง (ไม่ระบุ = ใช้การเชื่อมต่อที่ใช้งานอยู่ของร้าน) */
  systemId?: string | null;
  /** ใช้ในบันทึกผลของผู้เรียก (แคมเปญเก็บว่าส่งให้สมาชิกคนไหน) — ที่นี่ไม่ได้ใช้ตัดสินใจอะไร */
  customerId?: string | null;
};

export type PushToContactResult = { ok: boolean; reason?: string; externalMessageId?: string };

/** key ช่องทางกลาง → ชนิดช่องทางของโมดูลแชท (ตัวที่ยังไม่มี adapter คืน null) */
function chatTypeOf(channel: string): ChatChannelType | null {
  const key = String(channel ?? "").trim().toUpperCase();
  const known: Record<string, ChatChannelType> = {
    LINE: "LINE",
    WEBCHAT: "WEBCHAT",
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    WHATSAPP: "WHATSAPP",
  };
  const type = known[key];
  if (!type || !isSupported(type)) return null;
  return type;
}

/**
 * ส่งข้อความถึงลูกค้าคนหนึ่งผ่านช่องทางแชท (ร้านเป็นฝ่ายเริ่ม)
 * ใช้การเชื่อมต่อ (`ChatChannelConnection`) ที่ยัง CONNECTED ของร้าน · ไม่มี = ช่องทางนี้ปิด
 */
export async function pushToContact(input: PushToContactInput): Promise<PushToContactResult> {
  const externalUserId = String(input?.externalUserId ?? "").trim();
  const text = String(input?.text ?? "").trim();
  if (!externalUserId) return { ok: false, reason: "ยังไม่รู้บัญชีปลายทางของช่องทางนี้" };
  if (!text) return { ok: false, reason: "ข้อความว่าง — ไม่มีอะไรให้ส่ง" };

  const type = chatTypeOf(input.channel);
  if (!type) return { ok: false, reason: `ระบบยังส่งข้อความออกช่องทาง ${input.channel} ไม่ได้` };

  const conn = await prisma.chatChannelConnection.findFirst({
    where: {
      tenantId: input.tenantId,
      type,
      status: "CONNECTED",
      ...(input.systemId ? { systemId: input.systemId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  if (!conn) {
    return { ok: false, reason: "ร้านยังไม่ได้เชื่อมบัญชีทางการของช่องทางนี้ — เชื่อมที่หน้าตั้งค่าแชทก่อน" };
  }

  let creds: ChannelCreds;
  try {
    creds = credsOf(conn);
  } catch {
    return { ok: false, reason: "อ่านกุญแจของการเชื่อมต่อไม่ได้ — เชื่อมบัญชีใหม่ที่หน้าตั้งค่าแชท" };
  }

  try {
    const res = await getAdapter(type).sendMessage({
      creds,
      externalUserId,
      message: { type: "TEXT", body: text },
    });
    return { ok: true, externalMessageId: res.externalMessageId };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: reason.slice(0, 200) };
  }
}
