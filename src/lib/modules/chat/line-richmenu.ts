// line-richmenu.ts — ตั้ง rich menu ของ LINE OA ร้าน (idempotent) · SVC R0.7 · ใบสั่ง §3.2
//
// ลำดับเมื่อ spec เปลี่ยน: POST /richmenu → POST /richmenu/{id}/content (ไบต์รูป) → POST /user/all/richmenu/{id}
//   → จด `{ id, hash }` ใน `ChatChannelConnection.meta.richMenu` → DELETE ตัวเก่า
// spec เดิม (hash ตรง) ⇒ ไม่สร้างใหม่ (`created:false`)
// 🔴 ตรวจ spec ครบก่อนยิงคำขอแรก (ไม่ผ่าน = VALIDATION ไม่ยิงเลย) · connection ของร้านอื่น/DISABLED = NO_CONNECTION
// 🔴 รูปแบบ postback data ตรวจในไฟล์นี้เอง (แชท import platform ไม่ได้) — ต้องตรงกับ `platform/postback-routes.ts`
// 🔴 ไม่ throw · ไม่คืน/ไม่ log โทเคนหรือเนื้อ response ดิบ

import { createHash } from "node:crypto";
import { prisma } from "./db";
import { lineApiBase } from "./line";
import { flexFail, lineCall, lineConnectionOf } from "./line-flex";
import type { ChatPartyCtx } from "./party-bridge";

export type RichMenuArea = {
  bounds: { x: number; y: number; width: number; height: number };
  action: { type: "postback"; data: string; displayText?: string } | { type: "uri"; uri: string } | { type: "message"; text: string };
};
export type RichMenuSpec = {
  name: string;
  chatBarText: string;
  size: { width: number; height: number };
  areas: RichMenuArea[];
  image: { contentType: "image/png" | "image/jpeg"; data: Uint8Array };
  selected?: boolean;
};
export type SyncRichMenuResult =
  | { ok: true; richMenuId: string; created: boolean }
  | { ok: false; code: "NO_CONNECTION" | "VALIDATION" | "SEND_FAILED"; reason: string };

type RichFailCode = "NO_CONNECTION" | "VALIDATION" | "SEND_FAILED";
const fail = (code: RichFailCode): SyncRichMenuResult => {
  const reason = code === "VALIDATION" ? "ข้อมูลเมนูไม่ครบหรือผิดรูปแบบ (ขนาด · พื้นที่ปุ่ม · รูป PNG/JPEG ไม่เกิน 1 MB)" : flexFail(code).reason;
  return { ok: false, code, reason };
};

const IMAGE_MAX_BYTES = 1_048_576;
/** รูป postback data เดียวกับ `parsePostbackData` (platform/postback-routes.ts) */
const POSTBACK_RE = /^(booking|dorm|hotel)\.[a-z][A-Za-z0-9_]*(\.[a-z][A-Za-z0-9_]*)*(\?.*)?$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const len = (s: string) => Array.from(s).length;
const textOk = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && len(v) <= max;

/** postback data ใช้ได้ไหม (รูป + ไม่มีอักขระควบคุม + query ไม่มีคีย์อันตราย/ซ้ำ + ค่าไม่เกิน 200) */
export function isPostbackData(data: unknown): data is string {
  if (typeof data !== "string" || data.length > 300 || CONTROL_RE.test(data) || !POSTBACK_RE.test(data)) return false;
  const q = data.indexOf("?");
  if (q < 0) return true;
  const seen = new Set<string>();
  for (const [k, v] of new URLSearchParams(data.slice(q + 1))) {
    if (k === "__proto__" || k === "constructor" || k === "prototype" || seen.has(k) || v.length > 200) return false;
    seen.add(k);
  }
  return true;
}

function validSpec(spec: unknown): spec is RichMenuSpec {
  if (!isRec(spec)) return false;
  if (!textOk(spec.name, 300) || !textOk(spec.chatBarText, 14)) return false;
  if (spec.selected !== undefined && typeof spec.selected !== "boolean") return false;
  const size = spec.size;
  if (!isRec(size) || !nInt(size.width) || !nInt(size.height)) return false;
  const W = size.width;
  const H = size.height;
  if (W < 800 || W > 2500 || H < 250 || W / H < 1.45) return false;
  const areas = spec.areas;
  if (!Array.isArray(areas) || areas.length < 1 || areas.length > 20) return false;
  for (const a of areas) {
    if (!isRec(a) || !isRec(a.bounds) || !isRec(a.action)) return false;
    const { x, y, width, height } = a.bounds;
    if (!nInt(x) || !nInt(y) || !nInt(width) || !nInt(height)) return false;
    if (x < 0 || y < 0 || width < 1 || height < 1 || x + width > W || y + height > H) return false;
    const act = a.action;
    if (act.type === "postback") {
      if (!isPostbackData(act.data)) return false;
      if (act.displayText !== undefined && !textOk(act.displayText, 300)) return false;
    } else if (act.type === "uri") {
      if (typeof act.uri !== "string" || !act.uri.startsWith("https://") || act.uri.length > 1000 || CONTROL_RE.test(act.uri)) return false;
    } else if (act.type === "message") {
      if (!textOk(act.text, 300)) return false;
    } else return false;
  }
  const img = spec.image;
  if (!isRec(img) || (img.contentType !== "image/png" && img.contentType !== "image/jpeg")) return false;
  if (!(img.data instanceof Uint8Array) || img.data.length < 1 || img.data.length > IMAGE_MAX_BYTES) return false;
  return true;
}

/** ส่วน JSON ที่ส่งให้ LINE (ไม่มีรูป) — ตัดคีย์แปลกปลอมทิ้ง */
function menuBody(spec: RichMenuSpec) {
  return {
    size: { width: spec.size.width, height: spec.size.height },
    selected: spec.selected ?? false,
    name: spec.name,
    chatBarText: spec.chatBarText,
    areas: spec.areas.map((a) => ({
      bounds: { x: a.bounds.x, y: a.bounds.y, width: a.bounds.width, height: a.bounds.height },
      action:
        a.action.type === "postback"
          ? { type: "postback", data: a.action.data, ...(a.action.displayText ? { displayText: a.action.displayText } : {}) }
          : a.action.type === "uri"
            ? { type: "uri", uri: a.action.uri }
            : { type: "message", text: a.action.text },
    })),
  };
}

function specHash(spec: RichMenuSpec): string {
  return createHash("sha256")
    .update(JSON.stringify(menuBody(spec)))
    .update(`|${spec.image.contentType}|`)
    .update(spec.image.data)
    .digest("hex");
}

/** อัปโหลดรูป: โหมดจำลอง = origin เดียวกับ API · ของจริง = api-data.line.me */
function dataBaseOf(apiBase: string): string {
  return apiBase === "https://api.line.me" ? "https://api-data.line.me" : apiBase;
}

/** ตั้ง rich menu ค่าเริ่มของ OA (idempotent) + ผูกรายคน (เฉพาะผู้ติดต่อของร้านนี้บน connection นี้) */
export async function syncRichMenu(
  ctx: ChatPartyCtx,
  connectionId: string,
  spec: RichMenuSpec,
  opts?: { chatContactIds?: string[] },
): Promise<SyncRichMenuResult> {
  try {
    if (!validSpec(spec)) return fail("VALIDATION");
    if (opts?.chatContactIds !== undefined && !Array.isArray(opts.chatContactIds)) return fail("VALIDATION");
    const tenantId = typeof ctx?.tenantId === "string" ? ctx.tenantId.trim() : "";
    const conn = await lineConnectionOf(tenantId, connectionId);
    if (!conn) return fail("NO_CONNECTION");

    const hash = specHash(spec);
    const meta = isRec(conn.meta) ? conn.meta : {};
    const prev = isRec(meta.richMenu) ? meta.richMenu : null;
    const prevId = prev && typeof prev.id === "string" ? prev.id : null;

    const apiBase = lineApiBase();
    let richMenuId: string;
    let created: boolean;
    if (prevId && prev?.hash === hash) {
      // spec เดิม ⇒ ไม่สร้างใหม่ · ตั้งค่าเริ่มซ้ำ (idempotent — กันกรณีมีคนเปลี่ยนค่าเริ่มที่ LINE Manager)
      const def = await lineCall("POST", `/v2/bot/user/all/richmenu/${encodeURIComponent(prevId)}`, conn.token, undefined, { base: apiBase });
      if (!def.ok) return fail("SEND_FAILED");
      richMenuId = prevId;
      created = false;
    } else {
      const cr = await lineCall("POST", "/v2/bot/richmenu", conn.token, menuBody(spec), { base: apiBase });
      const newId = cr.ok && isRec(cr.json) && typeof cr.json.richMenuId === "string" ? cr.json.richMenuId : "";
      if (!newId || !/^[A-Za-z0-9_-]{1,100}$/.test(newId)) return fail("SEND_FAILED");
      const enc = encodeURIComponent(newId);
      const up = await lineCall("POST", `/v2/bot/richmenu/${enc}/content`, conn.token, spec.image.data, {
        base: dataBaseOf(apiBase),
        contentType: spec.image.contentType,
      });
      const def = up.ok ? await lineCall("POST", `/v2/bot/user/all/richmenu/${enc}`, conn.token, undefined, { base: apiBase }) : up;
      if (!def.ok) {
        await lineCall("DELETE", `/v2/bot/richmenu/${enc}`, conn.token, undefined, { base: apiBase });
        return fail("SEND_FAILED");
      }
      // จด meta แบบมีเงื่อนไข: แตะเฉพาะคีย์ richMenu (merge · คีย์อื่นของ meta คงเดิม) และเฉพาะเมื่อ hash ในฐานยังเป็นค่าที่เราอ่าน
      //   (ซิงก์พร้อมกัน 2 ทาง ⇒ ทางที่แพ้ลบเมนูของตัวเองทิ้ง ไม่ทิ้งเมนูกำพร้าไว้ที่ LINE)
      const prevHash = prev && typeof prev.hash === "string" ? prev.hash : null;
      const n = await prisma.$executeRaw`
        UPDATE "ChatChannelConnection"
        SET "meta" = jsonb_set(COALESCE("meta", '{}'::jsonb), '{richMenu}', ${JSON.stringify({ id: newId, hash })}::jsonb, true),
            "updatedAt" = NOW()
        WHERE "id" = ${conn.id} AND "tenantId" = ${tenantId}
          AND ("meta" -> 'richMenu' ->> 'hash') IS NOT DISTINCT FROM ${prevHash}`;
      if (n !== 1) {
        await lineCall("DELETE", `/v2/bot/richmenu/${enc}`, conn.token, undefined, { base: apiBase });
        return fail("SEND_FAILED");
      }
      if (prevId && prevId !== newId) {
        await lineCall("DELETE", `/v2/bot/richmenu/${encodeURIComponent(prevId)}`, conn.token, undefined, { base: apiBase });
      }
      richMenuId = newId;
      created = true;
    }

    // ผูกรายคน: เฉพาะผู้ติดต่อของร้านนี้บน connection นี้ · ใช้ bulk link (≤ 500 คน/คำขอ)
    const ids = (opts?.chatContactIds ?? []).filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 500);
    if (ids.length) {
      const contacts = await prisma.chatContact.findMany({
        where: { id: { in: ids }, tenantId, channel: "LINE", channelConnectionId: conn.id },
        select: { externalUserId: true },
      });
      const userIds = [...new Set(contacts.map((c) => c.externalUserId))];
      if (userIds.length) {
        const bl = await lineCall("POST", "/v2/bot/richmenu/bulk/link", conn.token, { richMenuId, userIds }, { base: apiBase });
        if (!bl.ok) return fail("SEND_FAILED");
      }
    }
    return { ok: true, richMenuId, created };
  } catch {
    return fail("SEND_FAILED");
  }
}
