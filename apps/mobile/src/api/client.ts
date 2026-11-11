// API client กลาง — คุยกับ /api/mobile/* (สัญญาดู ledger/MOBILE_PLAN.md + scripts/qc-mobile-*.mts ฝั่ง repo หลัก)
// ทุก request: Authorization Bearer (SecureStore) + X-Tenant-Id (กิจการ active) — server ตรวจ membership สดทุกครั้ง
// SSE ใช้ expo/fetch (รองรับ streaming บน RN — fetch ปกติของ RN อ่าน stream ไม่ได้)
import { fetch as expoFetch } from "expo/fetch";
import { getToken, getTenantId } from "@/src/lib/session";

export const BASE_URL = "https://shark.in.th";

export class ApiError extends Error {
  status: number;
  code: string;
  /** ข้อความไทยจาก server (`{ message }` — M3.11 /api/mobile/member/*) · endpoint เดิมไม่มี = undefined */
  detail?: string;
  constructor(status: number, code: string, detail?: string) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

// แปลง error code ฝั่ง server → ข้อความไทยที่ผู้ใช้เข้าใจ
export function apiErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    // server ส่งข้อความไทยมาเอง (มีอักษรไทย) → ใช้ตามนั้น (ละเอียดกว่ารหัสกลาง)
    if (e.detail && /[฀-๿]/.test(e.detail)) return e.detail;
    if (e.status === 401) return "หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่";
    if (e.code === "suspended") return "กิจการนี้ถูกระงับการใช้งาน";
    if (e.code === "forbidden" || e.code === "missing_tenant") return "ไม่มีสิทธิ์เข้าถึงกิจการนี้";
    return "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง";
  }
  return "เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่";
}

// tenantId: ใส่ X-Tenant-Id ของกิจการที่ระบุแทนกิจการ active (S2.5 กล่องรวมทุกกิจการ — อนุมัติรายการของร้านนั้นโดยไม่ต้องสลับร้าน)
type ApiOpts = { method?: string; body?: unknown; auth?: boolean; tenant?: boolean; tenantId?: string };

// เรียก API แบบ JSON — auth ใส่ Bearer (default true) · tenant ใส่ X-Tenant-Id (default true)
export async function api<T>(path: string, opts: ApiOpts = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.auth !== false) {
    const token = await getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  if (opts.tenant !== false) {
    const tid = opts.tenantId ?? (await getTenantId());
    if (tid) headers["x-tenant-id"] = tid;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (!res.ok) {
    let code = "error";
    let detail: string | undefined;
    try {
      const b = (await res.json()) as { error?: string; message?: string };
      code = b.error ?? "error";
      detail = typeof b.message === "string" ? b.message : undefined;
    } catch { /* body ไม่ใช่ JSON */ }
    throw new ApiError(res.status, code, detail);
  }
  return (await res.json()) as T;
}

// ── SSE: แชท AI แบบสตรีม ──
export type ChatEvent =
  | { type: "status"; label: string }
  | { type: "done"; result: { ok: true; conversationId: string; reply?: string; [k: string]: unknown } }
  // R-Z20/R-Z26 (§Z.4): server ส่ง `{type:"error", error, message}` — message = ข้อความไทยสำหรับผู้ใช้ (ไม่มี e.message ดิบแล้ว)
  | { type: "error"; error: string; message?: string };

/** SSE ส่ง event error แทน done ⇒ sendChat โยนตัวนี้ (detail = message ของ server · ไม่มี = จอใช้ข้อความกลางของ i18n) */
export class ChatStreamError extends ApiError {
  constructor(code: string, detail?: string) {
    super(0, code || "chat_error", detail);
  }
}

// ยิง chat/send แล้ว parse SSE ทีละ event → onEvent · คืน done result (หรือ throw ApiError · event error ไม่มี done ⇒ throw ChatStreamError)
export async function sendChat(
  input: { conversationId?: string; text: string; imageUrls?: string[] },
  onEvent: (ev: ChatEvent) => void,
): Promise<Extract<ChatEvent, { type: "done" }>["result"] | null> {
  const token = await getToken();
  const tid = await getTenantId();
  const res = await expoFetch(`${BASE_URL}/api/mobile/chat/send`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token ?? ""}`,
      "x-tenant-id": tid ?? "",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, "chat_failed");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done: Extract<ChatEvent, { type: "done" }>["result"] | null = null;
  let failed: Extract<ChatEvent, { type: "error" }> | null = null;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += decoder.decode(value, { stream: true });
    // SSE frame คั่นด้วยบรรทัดว่าง — เก็บเศษ frame สุดท้ายไว้รอ chunk ถัดไป
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const f of frames) {
      const line = f.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        const ev = JSON.parse(line.slice(6)) as ChatEvent;
        onEvent(ev);
        if (ev.type === "done") done = ev.result;
        else if (ev.type === "error") failed = ev;
      } catch { /* frame เพี้ยน — ข้าม */ }
    }
  }
  if (!done && failed) throw new ChatStreamError(String(failed.error ?? ""), typeof failed.message === "string" && failed.message.trim() ? failed.message.trim() : undefined);
  return done;
}
