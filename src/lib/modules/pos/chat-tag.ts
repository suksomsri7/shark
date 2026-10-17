// chat-tag.ts — แท็กห้องแชทบนลิงก์สั่งล่วงหน้า `/q/<linkToken>?c=<tag>` (POS P3.7 S · R8 · มติผู้คุม 3 ประตู B)
//
// แท็ก = base64url(JSON {c: conversationId, e: หมดอายุ ms}) + "." + HMAC-SHA256(tenantId|linkToken|conversationId|e) · อายุ 24 ชม.
// 🔴 กุญแจมาจาก SESSION_SECRET แยก namespace ของ POS (แบบโทเคนผู้ขาย staff-pin.ts · ไม่มี env ใหม่) · ไม่มี SESSION_SECRET (≥ 32) = ออก/ตรวจไม่ได้
// 🔴 ตรวจไม่ผ่าน (แก้ · หมดอายุ · ร้าน/ลิงก์อื่น · ขยะ) = null — ผู้เรียก (placePreorder) "ไม่สนใจแท็ก" ไม่ปฏิเสธลูกค้าที่กำลังจ่ายเงิน
// 🔴 เทียบลายเซ็นเป็นสตริงตรงตัว (ตัวท้ายของ base64url มีบิตเติม — เทียบไบต์ที่ถอดแล้วจะยอมให้แท็กที่ถูกแก้ตัวท้ายผ่าน)
import { createHmac, timingSafeEqual } from "node:crypto";

export const CHAT_TAG_TTL_MS = 24 * 3_600_000;
const TAG_MAX = 400;
const CONV_RE = /^[A-Za-z0-9_-]{8,64}$/;

function tagKey(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? `pos-chat-tag:v1:${s}` : null;
}
const macOf = (key: string, tenantId: string, linkToken: string, conversationId: string, exp: number) =>
  createHmac("sha256", key).update(`${tenantId}|${linkToken}|${conversationId}|${exp}`).digest("base64url");

/** ออกแท็กของห้อง (ผู้เรียกตรวจแล้วว่าห้อง/ลิงก์เป็นของร้านนี้) — ไม่มีกุญแจ = null */
export function mintChatTag(i: { tenantId: string; linkToken: string; conversationId: string; now?: Date }): { tag: string; expiresAt: Date } | null {
  const key = tagKey();
  if (!key || !CONV_RE.test(i.conversationId)) return null;
  const exp = (i.now ?? new Date()).getTime() + CHAT_TAG_TTL_MS;
  const body = Buffer.from(JSON.stringify({ c: i.conversationId, e: exp })).toString("base64url");
  return { tag: `${body}.${macOf(key, i.tenantId, i.linkToken, i.conversationId, exp)}`, expiresAt: new Date(exp) };
}

/** ตรวจแท็ก → conversationId · ไม่ผ่านทุกกรณี = null (ไม่ throw) */
export function verifyChatTag(tag: unknown, i: { tenantId: string; linkToken: string; now?: Date }): string | null {
  try {
    const key = tagKey();
    if (!key || typeof tag !== "string" || !tag || tag.length > TAG_MAX) return null;
    const dot = tag.indexOf(".");
    if (dot <= 0 || dot !== tag.lastIndexOf(".")) return null;
    const body = tag.slice(0, dot);
    const mac = tag.slice(dot + 1);
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { c?: unknown; e?: unknown };
    if (typeof p?.c !== "string" || !CONV_RE.test(p.c) || typeof p.e !== "number" || !Number.isFinite(p.e)) return null;
    if (p.e <= (i.now ?? new Date()).getTime()) return null;
    const want = macOf(key, i.tenantId, i.linkToken, p.c, p.e);
    const a = Buffer.from(mac, "utf8");
    const b = Buffer.from(want, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return p.c;
  } catch {
    return null;
  }
}
