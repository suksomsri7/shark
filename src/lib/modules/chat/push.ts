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
  /**
   * CRM C3.6 ▸ ระบบแชท "ที่อยากใช้ก่อน" (ปลายทางแชทของ CRM) — **ไม่บังคับ**: บัญชี LINE userId ผูกกับ OA ที่ลูกค้าคุยด้วย
   *   ⇒ หาผู้ติดต่อแชทของ externalUserId นี้ในระบบที่อยากใช้ก่อน · ไม่มี = ผู้ติดต่อล่าสุดของระบบใดก็ได้ · ส่งด้วยระบบของผู้ติดต่อนั้น
   *   (ไม่พบผู้ติดต่อเลย = ใช้การเชื่อมต่อของระบบที่อยากใช้ถ้ามี ไม่งั้นแบบเดิม) · `systemId` ที่ระบุตรง ๆ ชนะเสมอ ◂
   */
  preferSystemId?: string | null;
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

/** ร้านยังไม่มีการเชื่อมต่อของช่องทางนี้ (ข้อความเดิม) */
export const NO_CONNECTION_MSG = "ร้านยังไม่ได้เชื่อมบัญชีทางการของช่องทางนี้ — เชื่อมที่หน้าตั้งค่าแชทก่อน";
/** CRM C3.6 ▸ ระบบแชทที่ลูกค้าคุยด้วยยังไม่มีการเชื่อมต่อ (ส่งผ่าน OA อื่นไม่ได้ — LINE userId ผูกกับ OA) ◂ */
export const CUSTOMER_CHAT_NOT_CONNECTED = "ระบบแชทที่ลูกค้าคุยด้วยยังไม่ได้เชื่อมบัญชีทางการ — เชื่อมบัญชีของระบบแชทนั้นที่หน้าตั้งค่าแชทก่อน";

// CRM C3.6 ▸ ระบบแชทของ externalUserId (ผู้ติดต่อที่ไม่ถูกบล็อก) — ระบบที่อยากใช้ก่อน → ผู้ติดต่อล่าสุดของระบบใดก็ได้ →
//   ไม่พบผู้ติดต่อ = null (ผู้เรียกลองการเชื่อมต่อของระบบที่อยากใช้ก่อน แล้วการเชื่อมต่อใดก็ได้ = แบบเดิม) · AUDIT-CLASS X1: ผูก tenantId เสมอ
async function systemOfExternalUser(tenantId: string, type: ChatChannelType, externalUserId: string, preferSystemId: string | null): Promise<string | null> {
  if (!preferSystemId) return null; // ผู้เรียกเดิม (แคมเปญ) — พฤติกรรมเดิมทุกตัวอักษร
  const base = { tenantId, channel: type, externalUserId, blockedAt: null };
  const hit =
    (await prisma.chatContact.findFirst({ where: { ...base, systemId: preferSystemId }, select: { systemId: true } })) ??
    (await prisma.chatContact.findFirst({ where: base, orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }], select: { systemId: true } }));
  return hit?.systemId ?? null;
}
// ◂ CRM C3.6

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

  // CRM C3.6 ▸ ระบบที่ใช้ส่ง: `systemId` ตรง ๆ ชนะ · ไม่มี = ระบบของผู้ติดต่อแชท (ชอบระบบ `preferSystemId` ก่อน) ◂
  const sendSystemId = input.systemId ?? (await systemOfExternalUser(input.tenantId, type, externalUserId, input.preferSystemId ?? null));
  const connWhere = { tenantId: input.tenantId, type, status: "CONNECTED" as const };
  const conn =
    // ไม่รู้ระบบของผู้ติดต่อ แต่มีระบบที่อยากใช้ ⇒ ลองการเชื่อมต่อของระบบนั้นก่อน แล้วค่อยใดก็ได้ (แบบเดิม)
    (!sendSystemId && input.preferSystemId
      ? await prisma.chatChannelConnection.findFirst({ where: { ...connWhere, systemId: input.preferSystemId }, orderBy: { createdAt: "asc" } })
      : null) ??
    (await prisma.chatChannelConnection.findFirst({
      where: { ...connWhere, ...(sendSystemId ? { systemId: sendSystemId } : {}) },
      orderBy: { createdAt: "asc" },
    }));
  if (!conn) {
    // CRM C3.6 ▸ ระบบมาจากผู้ติดต่อของลูกค้า (ทาง preferSystemId) = บอกตรง ๆ ว่า "ระบบแชทที่ลูกค้าคุยด้วย" ยังไม่ได้เชื่อม
    //   (ไม่ใช่ "ร้านยังไม่ได้เชื่อม" — ร้านอาจเชื่อม OA อื่นไว้แล้ว) · ผู้เรียกเดิมได้ข้อความเดิมทุกตัวอักษร ◂
    return { ok: false, reason: input.preferSystemId && !input.systemId && sendSystemId ? CUSTOMER_CHAT_NOT_CONNECTED : NO_CONNECTION_MSG };
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
