// ตัวช่วยกลางของ REST /api/v1/* (WO-0061) — verify Bearer key + rate limit ต่อคีย์ ครั้งเดียว
// ทุก Route Handler เรียก authenticateApiRequest() ตัวเดียว → คืน tenantId หรือ Response (401/429)

import { checkRateLimit } from "@/lib/core/rate-limit";
import { verifyApiKey } from "./service";

// ตอบ JSON มาตรฐาน (public API พูดภาษาเครื่อง → error เป็นข้อความไทยอ่านได้)
export function apiJson(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export type ApiAuth =
  | { ok: true; tenantId: string; keyId: string }
  | { ok: false; response: Response };

const RATE_LIMIT = 60; // ครั้ง/นาที ต่อคีย์
const WINDOW_MS = 60_000;

export async function authenticateApiRequest(req: Request): Promise<ApiAuth> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  const rawKey = m?.[1]?.trim();
  if (!rawKey) {
    return { ok: false, response: apiJson({ error: "ต้องส่งส่วนหัว Authorization: Bearer <API key>" }, 401) };
  }
  const v = await verifyApiKey(rawKey);
  if (!v) {
    return { ok: false, response: apiJson({ error: "API key ไม่ถูกต้องหรือถูกเพิกถอนแล้ว" }, 401) };
  }
  const rl = checkRateLimit(`apiv1:${v.keyId}`, { limit: RATE_LIMIT, windowMs: WINDOW_MS });
  if (!rl.ok) {
    return {
      ok: false,
      response: apiJson(
        { error: `เรียกใช้บ่อยเกินไป — จำกัด ${RATE_LIMIT} ครั้งต่อนาที` },
        429,
        { "retry-after": String(rl.retryAfterSec ?? 60) },
      ),
    };
  }
  return { ok: true, tenantId: v.tenantId, keyId: v.keyId };
}
