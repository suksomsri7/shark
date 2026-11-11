// ─────────────────────────────────────────────────────────────
// platform/postback-routes.ts — ทะเบียนตัวจัดการ postback ของ LINE + การผูกรหัส · SVC R0.7 · ใบสั่ง §3.4
//
// โดเมน (booking · dorm · hotel) เพิ่มบรรทัดของตัวเองใน `POSTBACK_ROUTES` (B.9/D.9) — ใบ R0.7 ปล่อยว่าง
// 🔴 ctx มาจากแถว connection เสมอ (webhook) — ห้ามอ่าน tenant/party จาก postback data
// 🔴 parse: params ใส่ object ไม่มี prototype · คีย์อันตราย/ซ้ำ/ค่ายาว ⇒ null ทั้งก้อน
// 🔴 ตัวจัดการของโดเมนพัง ⇒ จับไว้ ไม่ลามออก · ไม่ log ข้อความ error ดิบ (อาจมี PII)
// 🔴 แชทผ่าน facade `@/lib/modules/chat` เท่านั้น
// ─────────────────────────────────────────────────────────────
import { consumeLinkCode, normalizeLinkCode } from "@/lib/modules/chat";

export type PostbackDomain = "booking" | "dorm" | "hotel";
export type PostbackCtx = { tenantId: string; connectionId: string; chatContactId: string; partyId: string | null; replyToken: string | null };
export type PostbackEvent = { data: string; domain: PostbackDomain; action: string; params: Record<string, string> };
export type PostbackReply = { text?: string; flex?: { altText: string; contents: Record<string, unknown> } };
/**
 * 🔴 สัญญาบังคับของตัวจัดการโดเมน (R0.7 fix A1/A2 — ผู้ตรวจจะอ่านทุก route ที่เพิ่ม):
 *  1. ref ใน `evt.params` (เช่น id นัด/สัญญา) ต้องตรวจในฐานว่าเป็นของ `ctx.tenantId` **และ** ของลูกค้าคนที่กด
 *     (`ctx.partyId` / `ctx.chatContactId`) ก่อนอ่าน/เขียนอะไร — ไม่ใช่ = ตอบข้อความกลาง ไม่บอกว่ามี ref นี้อยู่
 *  2. ห้ามอ่าน tenant/party/connection จาก `evt.params` หรือ data — ctx มาจากแถว connection ของ webhook เสมอ
 *  3. `onLinked`: ห้ามใช้ `partyId` ยืนยันความเป็นเจ้าของ ref (ผู้ติดต่ออาจผูก Party อื่นไว้ก่อน) — ใช้ `resolvedPartyId`
 *     ที่โดเมนตอบเอง · `partyMismatch: true` ⇒ อย่าเปิดข้อมูลของ ref ให้อัตโนมัติ (ส่งให้พนักงานตรวจ)
 *  4. throw ได้ (ตัวแจกจับไว้) แต่ห้าม log ข้อความลูกค้า/เบอร์/ชื่อ
 */
export type LinkedInfo = { purpose: string; refId: string; partyId: string | null; resolvedPartyId: string | null; partyMismatch: boolean };
export type PostbackRoute = {
  prefix: "booking." | "dorm." | "hotel.";
  resolveParty?: (ctx: { tenantId: string }, a: { purpose: string; refId: string }) => Promise<string | null>;
  onPostback?: (ctx: PostbackCtx, evt: PostbackEvent) => Promise<PostbackReply | void>;
  onLinked?: (ctx: PostbackCtx, a: LinkedInfo) => Promise<PostbackReply | void>;
};

/** ทะเบียน (แก้ได้ · ตัวแจกอ่านตอนเรียก) — ใบนี้ว่าง · B.9/D.9 เพิ่มบรรทัด */
export const POSTBACK_ROUTES: PostbackRoute[] = [];
// SVC B.9 ▸ จองคิว: ปุ่มในข้อความแจ้งเตือน (เช็กอิน · ไปไม่ทัน · เลื่อนคิว · เลื่อนนัด) + ผูกรหัส APPOINTMENT/QUEUE_TICKET — โหลดตอนเรียก ◂
POSTBACK_ROUTES.push({
  prefix: "booking.",
  resolveParty: async (ctx, a) => (await import("@/lib/platform/booking-line-link")).resolveBookingParty(ctx, a),
  onPostback: async (ctx, evt) => (await import("@/lib/platform/booking-line-link")).onBookingPostback(ctx, evt),
  onLinked: async (ctx, a) => (await import("@/lib/platform/booking-line-link")).onBookingLinked(ctx, a),
});
// SVC D.9 ▸ หอพัก: เมนูล่าง LINE (บิลของฉัน · แจ้งซ่อม · ประกาศ · สัญญา · พัสดุ · ติดต่อหอ) + ผูกรหัส DORM_LEASE — โหลดตอนเรียก ◂
POSTBACK_ROUTES.push({
  prefix: "dorm.",
  resolveParty: async (ctx, a) => (await import("@/lib/platform/dorm-line")).resolveDormParty(ctx, a),
  onPostback: async (ctx, evt) => (await import("@/lib/platform/dorm-line")).onDormPostback(ctx, evt),
  onLinked: async (ctx, a) => (await import("@/lib/platform/dorm-line")).onDormLinked(ctx, a),
});

/** ชนิดรหัสผูก → route ที่รู้ว่า ref เป็นของใคร */
export const LINK_PURPOSE_PREFIX: Record<"DORM_LEASE" | "QUEUE_TICKET" | "APPOINTMENT", PostbackRoute["prefix"]> = {
  DORM_LEASE: "dorm.",
  QUEUE_TICKET: "booking.",
  APPOINTMENT: "booking.",
};

/** ข้อความกลางเมื่อผูกไม่สำเร็จ — เหมือนกันทุกกรณี (รหัสผิด/หมดอายุ/ใช้แล้ว/ร้านอื่น/เกินโควตา · X7) */
export const LINK_FAILED_TEXT = "ใช้รหัสนี้ผูกบัญชีไม่ได้ ตรวจรหัสอีกครั้ง หรือขอรหัสใหม่จากร้าน";
export const LINK_OK_TEXT = "ผูกบัญชี LINE เรียบร้อยแล้ว";

const DATA_RE = /^(booking|dorm|hotel)\.[a-z][A-Za-z0-9_]*(\.[a-z][A-Za-z0-9_]*)*(\?.*)?$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** แยก postback data · ผิดรูป ⇒ null */
export function parsePostbackData(data: unknown): PostbackEvent | null {
  if (typeof data !== "string" || data.length === 0 || data.length > 300) return null;
  if (CONTROL_RE.test(data) || !DATA_RE.test(data)) return null;
  const q = data.indexOf("?");
  const path = q < 0 ? data : data.slice(0, q);
  const dot = path.indexOf(".");
  const domain = path.slice(0, dot) as PostbackDomain;
  const action = path.slice(dot + 1);
  const params = Object.create(null) as Record<string, string>;
  if (q >= 0) {
    for (const [k, v] of new URLSearchParams(data.slice(q + 1))) {
      if (BAD_KEYS.has(k) || Object.prototype.hasOwnProperty.call(params, k) || v.length > 200) return null;
      params[k] = v;
    }
  }
  return { data, domain, action, params };
}

const routeFor = (prefix: string, need: "onPostback" | "onLinked" | "resolveParty"): PostbackRoute | undefined =>
  POSTBACK_ROUTES.find((r) => r.prefix === prefix && typeof r[need] === "function");

const replyOf = (v: unknown): PostbackReply | undefined => {
  if (!v || typeof v !== "object") return undefined;
  const r = v as PostbackReply;
  const out: PostbackReply = {};
  if (typeof r.text === "string" && r.text.trim()) out.text = r.text;
  if (r.flex && typeof r.flex === "object" && typeof r.flex.altText === "string" && r.flex.contents && typeof r.flex.contents === "object") out.flex = r.flex;
  return out.text || out.flex ? out : undefined;
};

/** แจก postback ให้ route แรกของโดเมน · ไม่มี route/ผิดรูป/ตัวจัดการพัง ⇒ handled:false (ไม่ throw) */
export async function dispatchPostback(ctx: PostbackCtx, data: string): Promise<{ handled: boolean; reply?: PostbackReply }> {
  const evt = parsePostbackData(data);
  if (!evt) return { handled: false };
  const route = routeFor(`${evt.domain}.`, "onPostback");
  if (!route?.onPostback) return { handled: false };
  try {
    const reply = replyOf(await route.onPostback(ctx, evt));
    return reply ? { handled: true, reply } : { handled: true };
  } catch {
    return { handled: false };
  }
}

/**
 * ข้อความแชทที่อาจเป็นรหัสผูก · ไม่ใช่รูปรหัส ⇒ matched:false (ไม่แตะฐาน)
 * รูปรหัส ⇒ consumeLinkCode (resolveParty ของ route ตามชนิดรหัส) → onLinked
 */
export async function handleLinkCodeText(
  ctx: Omit<PostbackCtx, "partyId">,
  text: string,
): Promise<{ matched: boolean; linked: boolean; reply?: PostbackReply }> {
  if (!normalizeLinkCode(text)) return { matched: false, linked: false };
  const failed = { matched: true, linked: false, reply: { text: LINK_FAILED_TEXT } };
  try {
    const tenantId = ctx.tenantId;
    const res = await consumeLinkCode(
      { tenantId },
      {
        connectionId: ctx.connectionId,
        chatContactId: ctx.chatContactId,
        text,
        resolveParty: async (a) => {
          const prefix = LINK_PURPOSE_PREFIX[a.purpose as keyof typeof LINK_PURPOSE_PREFIX];
          const route = prefix ? routeFor(prefix, "resolveParty") : undefined;
          return route?.resolveParty ? route.resolveParty({ tenantId }, a) : null;
        },
      },
    );
    if (!res) return failed;
    let reply: PostbackReply | undefined;
    const prefix = LINK_PURPOSE_PREFIX[res.purpose as keyof typeof LINK_PURPOSE_PREFIX];
    const route = prefix ? routeFor(prefix, "onLinked") : undefined;
    if (route?.onLinked) {
      try {
        reply = replyOf(await route.onLinked({ ...ctx, partyId: res.partyId }, res));
      } catch {
        reply = undefined; // ผูกสำเร็จแล้ว — ตัวจัดการของโดเมนพังไม่ย้อนการผูก
      }
    }
    return { matched: true, linked: true, reply: reply ?? { text: LINK_OK_TEXT } };
  } catch {
    return failed;
  }
}
