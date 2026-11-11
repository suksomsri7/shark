// line-content.ts — ดึงเนื้อไฟล์ของข้อความ LINE (รูปที่ลูกค้าส่งในแชท) · SVC D.9 §3.6 (มติผู้คุม Q1: เพิ่มอย่างเดียว)
//
// GET <data base>/v2/bot/message/<messageId>/content ด้วยโทเคนของ OA นั้น (data base = api-data.line.me · ตัวจำลองเมื่อ LINE_API_BASE ชี้เครื่องตัวเอง)
// 🔴 connection ต้องเป็น LINE ของร้านนี้ ไม่ DISABLED (lineConnectionOf) — ของร้านอื่น = NOT_FOUND ไม่ยิงอะไรเลย
// 🔴 messageId ตัวเลขล้วน ≤ 32 หลัก · อ่านไม่เกิน 5 MB (เกิน = TOO_LARGE ตัดสายทันที) · ไม่ throw · ไม่ log เนื้อ/โทเคน
// 🔴 ไฟล์แชท: ห้าม import platform · prisma ผ่าน ./db (ทางเดียวกับ line-flex)
import { lineApiBase } from "./line";
import { LINE_TIMEOUT_MS, lineConnectionOf } from "./line-flex";
import type { ChatPartyCtx } from "./party-bridge";

export const LINE_CONTENT_MAX_BYTES = 5 * 1024 * 1024;
const MESSAGE_ID_RE = /^\d{1,32}$/;
const REAL_API = "https://api.line.me";
const REAL_DATA = "https://api-data.line.me";

export type FetchLineContentResult = { ok: true; contentType: string; data: Uint8Array } | { ok: false; code: "NOT_FOUND" | "TOO_LARGE" | "FAILED" };

export async function fetchLineMessageContent(ctx: ChatPartyCtx, i: { connectionId: string; messageId: string }): Promise<FetchLineContentResult> {
  try {
    const tenantId = typeof ctx?.tenantId === "string" ? ctx.tenantId.trim() : "";
    const messageId = typeof i?.messageId === "string" ? i.messageId.trim() : "";
    if (!tenantId || !MESSAGE_ID_RE.test(messageId)) return { ok: false, code: "NOT_FOUND" };
    const conn = await lineConnectionOf(tenantId, typeof i?.connectionId === "string" ? i.connectionId : "");
    if (!conn) return { ok: false, code: "NOT_FOUND" };
    const api = lineApiBase();
    const base = api === REAL_API ? REAL_DATA : api;
    const res = await fetch(`${base}/v2/bot/message/${messageId}/content`, {
      method: "GET",
      headers: { Authorization: `Bearer ${conn.token}` },
      signal: AbortSignal.timeout(LINE_TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, code: res.status === 404 ? "NOT_FOUND" : "FAILED" };
    }
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > LINE_CONTENT_MAX_BYTES) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, code: "TOO_LARGE" };
    }
    const contentType = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0]!.trim().toLowerCase();
    if (!res.body) return { ok: false, code: "FAILED" };
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > LINE_CONTENT_MAX_BYTES) {
        await reader.cancel().catch(() => {});
        return { ok: false, code: "TOO_LARGE" };
      }
      parts.push(value);
    }
    const data = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      data.set(p, off);
      off += p.byteLength;
    }
    return { ok: true, contentType, data };
  } catch {
    return { ok: false, code: "FAILED" };
  }
}
