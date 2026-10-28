// line-flex.ts — ส่ง Flex Message ของ LINE (push ถึง Party · reply ด้วย replyToken) · SVC R0.7 · ใบสั่ง §3.1
//
// 🔴 ผู้รับ = `ChatContact` ของร้าน (`tenantId` ผูกตรง) ช่องทาง LINE ที่ไม่ถูกบล็อก · LINE userId ผูกกับ OA
//    ⇒ ส่ง `connectionId` มา = เฉพาะผู้ติดต่อของ OA นั้น (ไม่ถอยไป OA อื่น) · ไม่ส่ง = ผู้ติดต่อล่าสุด แล้วใช้ OA ของผู้ติดต่อนั้น
// 🔴 connection ต้องเป็นของร้านนี้ · type LINE · ไม่ DISABLED — ของร้านอื่น = NO_CONNECTION ไม่ยิงอะไรเลย
// 🔴 ไม่ throw · reason ไม่มีโทเคน/เนื้อ response ดิบ · ไม่ log อะไรที่มีข้อมูลลูกค้า
// 🔴 ไฟล์แชท: ห้าม import platform (ข้อสอบ F-4) · prisma ผ่าน ./db

import { decryptCreds } from "./crypto";
import { prisma } from "./db";
import { lineApiBase } from "./line";
import type { ChatPartyCtx } from "./party-bridge";

export type FlexFailCode = "NO_LINE_IDENTITY" | "NO_CONNECTION" | "VALIDATION" | "SEND_FAILED";
export type FlexFail = { ok: false; code: FlexFailCode; reason: string };
export type FlexContents = Record<string, unknown>;
export type PushFlexToPartyInput = { partyId: string; connectionId?: string | null; altText: string; contents: FlexContents };
export type PushFlexResult = { ok: true; externalMessageId?: string } | FlexFail;
export type ReplyFlexInput = { replyToken: string; connectionId: string; altText: string; contents: FlexContents };
export type ReplyFlexResult = { ok: true } | FlexFail;
/** ข้อความ LINE หนึ่งชิ้น (text / flex) — ผู้เรียกประกอบเอง */
export type LineMessage = { type: "text"; text: string } | { type: "flex"; altText: string; contents: FlexContents };

const REASON: Record<FlexFailCode, string> = {
  NO_LINE_IDENTITY: "ลูกค้ารายนี้ยังไม่ได้ผูกบัญชี LINE กับ OA นี้ — ให้ลูกค้าทักเข้ามาหรือพิมพ์รหัสผูกก่อน",
  NO_CONNECTION: "ไม่พบการเชื่อมต่อ LINE OA ที่ใช้งานได้ของร้าน — ตรวจที่หน้าตั้งค่าแชท",
  VALIDATION: "ข้อความไม่ครบหรือผิดรูปแบบ (altText 1–400 ตัว · contents เป็น bubble หรือ carousel)",
  SEND_FAILED: "ส่งข้อความเข้า LINE ไม่สำเร็จ — ลองใหม่อีกครั้งภายหลัง",
};
export const flexFail = (code: FlexFailCode): FlexFail => ({ ok: false, code, reason: REASON[code] });

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** ตรวจ altText + contents ก่อนยิง */
export function validFlex(altText: unknown, contents: unknown): boolean {
  if (typeof altText !== "string") return false;
  const n = Array.from(altText).length;
  if (n < 1 || n > 400 || !altText.trim()) return false;
  return isRec(contents) && (contents.type === "bubble" || contents.type === "carousel");
}

function validMessages(messages: unknown): messages is LineMessage[] {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 5) return false;
  return messages.every((m) => {
    if (!isRec(m)) return false;
    if (m.type === "text") return typeof m.text === "string" && m.text.trim().length > 0 && m.text.length <= 5000;
    if (m.type === "flex") return validFlex(m.altText, m.contents);
    return false;
  });
}

/** connection LINE ของร้านนี้ที่ใช้งานได้ + โทเคน (ไม่พบ/ร้านอื่น/DISABLED/ไม่มีโทเคน = null) */
export async function lineConnectionOf(tenantId: string, connectionId: string): Promise<{ id: string; token: string; meta: unknown } | null> {
  const tid = str(tenantId);
  const cid = str(connectionId);
  if (!tid || !cid) return null;
  const conn = await prisma.chatChannelConnection.findFirst({
    where: { id: cid, tenantId: tid, type: "LINE", status: { not: "DISABLED" } },
    select: { id: true, credentials: true, meta: true },
  });
  if (!conn) return null;
  const token = str(decryptCreds<{ channelAccessToken?: string }>(conn.credentials).channelAccessToken);
  if (!token) return null;
  return { id: conn.id, token, meta: conn.meta };
}

export type LineCallResult = { ok: boolean; status: number; json: unknown };

/**
 * เรียก Messaging API หนึ่งครั้ง — ไม่ throw (เครือข่ายล่ม = status 0) · ไม่คืน/ไม่ log เนื้อ response ดิบเมื่อผิด
 * `base` ปกติ = `lineApiBase()` (อ่าน env ตอนเรียก) · `body` เป็น object ⇒ JSON · เป็นไบต์ ⇒ ส่งตรงตาม contentType
 */
export async function lineCall(
  method: "GET" | "POST" | "DELETE",
  path: string,
  token: string,
  body?: unknown,
  opts?: { base?: string; contentType?: string },
): Promise<LineCallResult> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let payload: BodyInit | undefined;
  if (body instanceof Uint8Array) {
    headers["content-type"] = opts?.contentType ?? "application/octet-stream";
    payload = new Uint8Array(body);
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  try {
    const res = await fetch(`${opts?.base ?? lineApiBase()}${path}`, { method, headers, body: payload });
    const json: unknown = res.ok ? await res.json().catch(() => ({})) : null;
    if (!res.ok) await res.body?.cancel().catch(() => {});
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

const firstSentId = (json: unknown): string | undefined => {
  const sent = isRec(json) && Array.isArray(json.sentMessages) ? json.sentMessages[0] : undefined;
  return isRec(sent) && typeof sent.id === "string" ? sent.id : undefined;
};

/**
 * ส่ง Flex ถึง Party หนึ่งราย · `connectionId` = เฉพาะผู้ติดต่อของ OA นั้น · ไม่ส่ง = ผู้ติดต่อล่าสุด (lastSeenAt desc)
 */
export async function pushFlexToParty(ctx: ChatPartyCtx, input: PushFlexToPartyInput): Promise<PushFlexResult> {
  try {
    const tenantId = str(ctx?.tenantId);
    const partyId = str(input?.partyId);
    if (!validFlex(input?.altText, input?.contents)) return flexFail("VALIDATION");
    if (!tenantId || !partyId) return flexFail("NO_LINE_IDENTITY");
    const wanted = str(input?.connectionId);
    const base = { tenantId, partyId, channel: "LINE" as const, blockedAt: null };
    const order = [{ lastSeenAt: "desc" as const }, { createdAt: "desc" as const }];

    let conn: Awaited<ReturnType<typeof lineConnectionOf>>;
    let to: string;
    if (wanted) {
      conn = await lineConnectionOf(tenantId, wanted);
      if (!conn) return flexFail("NO_CONNECTION");
      const contact = await prisma.chatContact.findFirst({ where: { ...base, channelConnectionId: conn.id }, orderBy: order, select: { externalUserId: true } });
      if (!contact) return flexFail("NO_LINE_IDENTITY");
      to = contact.externalUserId;
    } else {
      const contact = await prisma.chatContact.findFirst({
        where: { ...base, channelConnectionId: { not: null } },
        orderBy: order,
        select: { externalUserId: true, channelConnectionId: true },
      });
      if (!contact?.channelConnectionId) return flexFail("NO_LINE_IDENTITY");
      conn = await lineConnectionOf(tenantId, contact.channelConnectionId);
      if (!conn) return flexFail("NO_CONNECTION");
      to = contact.externalUserId;
    }
    const r = await lineCall("POST", "/v2/bot/message/push", conn.token, {
      to,
      messages: [{ type: "flex", altText: input.altText, contents: input.contents }],
    });
    if (!r.ok) return flexFail("SEND_FAILED");
    const id = firstSentId(r.json);
    return id ? { ok: true, externalMessageId: id } : { ok: true };
  } catch {
    return flexFail("SEND_FAILED");
  }
}

/** ตอบกลับด้วย Flex (replyToken ของ event) ผ่าน OA ของร้านนี้ */
export async function replyFlex(ctx: ChatPartyCtx, input: ReplyFlexInput): Promise<ReplyFlexResult> {
  if (!validFlex(input?.altText, input?.contents)) return flexFail("VALIDATION");
  return replyLineMessages(ctx, {
    replyToken: input?.replyToken,
    connectionId: input?.connectionId,
    messages: [{ type: "flex", altText: input.altText, contents: input.contents }],
  });
}

/** ตอบกลับด้วยข้อความชุดหนึ่ง (text/flex) — webhook ของแชทใช้ตอบข้อความธรรมดา */
export async function replyLineMessages(
  ctx: ChatPartyCtx,
  input: { replyToken: string; connectionId: string; messages: LineMessage[] },
): Promise<ReplyFlexResult> {
  try {
    const tenantId = str(ctx?.tenantId);
    const replyToken = str(input?.replyToken);
    if (!replyToken || replyToken.length > 200 || !validMessages(input?.messages)) return flexFail("VALIDATION");
    const conn = await lineConnectionOf(tenantId, str(input?.connectionId));
    if (!conn) return flexFail("NO_CONNECTION");
    const r = await lineCall("POST", "/v2/bot/message/reply", conn.token, { replyToken, messages: input.messages });
    return r.ok ? { ok: true } : flexFail("SEND_FAILED");
  } catch {
    return flexFail("SEND_FAILED");
  }
}

/**
 * ส่งข้อความชุดหนึ่งถึงผู้ติดต่อคนหนึ่ง **บน OA ที่ระบุเท่านั้น** (ประตูส่งข้อความบริการ `platform/notify-customer` ใช้)
 * ผู้ติดต่อต้องเป็นของร้านนี้ · LINE · บน connection นี้ · ไม่ถูกบล็อก — ไม่ใช่ = NO_LINE_IDENTITY
 */
export async function pushLineMessagesToContact(
  ctx: ChatPartyCtx,
  input: { chatContactId: string; connectionId: string; messages: LineMessage[] },
): Promise<PushFlexResult> {
  try {
    const tenantId = str(ctx?.tenantId);
    if (!validMessages(input?.messages)) return flexFail("VALIDATION");
    const conn = await lineConnectionOf(tenantId, str(input?.connectionId));
    if (!conn) return flexFail("NO_CONNECTION");
    const contact = await prisma.chatContact.findFirst({
      where: { id: str(input?.chatContactId), tenantId, channel: "LINE", channelConnectionId: conn.id, blockedAt: null },
      select: { externalUserId: true },
    });
    if (!contact) return flexFail("NO_LINE_IDENTITY");
    const r = await lineCall("POST", "/v2/bot/message/push", conn.token, { to: contact.externalUserId, messages: input.messages });
    if (!r.ok) return flexFail("SEND_FAILED");
    const id = firstSentId(r.json);
    return id ? { ok: true, externalMessageId: id } : { ok: true };
  } catch {
    return flexFail("SEND_FAILED");
  }
}
