import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { emailInboundSecret } from "@/lib/env";
import { ingestInboundEmail, type InboundEmailAttachment, type InboundEmailPayload } from "@/lib/platform/kanban-email-in";

// POST /api/email/inbound — อีเมลเข้าบอร์ดงาน (K3.9 · สัญญา `ledger/KANBAN-RUN.md` §K3.9)
//
// 🔴 endpoint สาธารณะที่ **เขียนข้อมูลของร้าน** ⇒ ด่านเรียงแบบ fail-closed:
//    1. ไม่ได้ตั้ง `EMAIL_INBOUND_SECRET` = ยังไม่ได้เปิดบริการ → **503** (ไม่ใช่ปล่อยผ่าน)
//    2. header `X-Inbound-Secret` ไม่ตรง → **401** (เทียบแบบ timing-safe: เทียบสตริงตรง ๆ
//       บอกความยาว/คำนำหน้าที่ถูกออกไปทีละไบต์ผ่านเวลาตอบ)
//    3. body ใหญ่เกิน 10MB → **413** (อีเมลแนบไฟล์ใหญ่กว่านี้ไม่ใช่ "งาน" และเป็นวิธีถล่มหน่วยความจำ)
// 🔴 ผ่านด่านแล้ว **ตอบ 200 เสมอ** แม้ประมวลผลไม่สำเร็จ (แบบเดียวกับ webhook LINE ของแชท):
//    ผู้ให้บริการอีเมลเห็น 4xx/5xx = retry ไม่รู้จบ หรือปิด endpoint ทิ้ง ⇒ อีเมลจริงของลูกค้าหายทั้งสาย
//    เพราะอีเมลขยะฉบับเดียวรูปแบบแปลก · ตัวประมวลผลจึงคืน `{ ok:false, reason }` ไม่ throw
// 🔴 คำตอบ **ไม่บอกว่ามีบอร์ดอยู่หรือไม่** — ผู้ยิงคือคนนอกที่สุ่มที่อยู่ได้ไม่จำกัด (ดู kanban-email-in.ts)

/** เพดาน body (สัญญา §K3.9) — ตรงกับเพดานไฟล์แนบ 10MB ของ D4 */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/** เทียบความลับแบบไม่รั่วเวลา — hash ก่อนเพื่อให้สองฝั่งยาวเท่ากันเสมอ (timingSafeEqual ต้องยาวเท่ากัน) */
function secretMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** ผู้รับ: ผู้ให้บริการส่งมาได้ทั้งสตริงเดียว, อาร์เรย์สตริง หรืออาร์เรย์ออบเจกต์ `{ address }` */
function toRecipients(v: unknown): string[] {
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string") out.push(item);
    else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const one = asString(o.address) || asString(o.email) || asString(o.value);
      if (one) out.push(one);
    }
  }
  return out;
}

function toAttachments(v: unknown): InboundEmailAttachment[] {
  if (!Array.isArray(v)) return [];
  const out: InboundEmailAttachment[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    out.push({
      filename: asString(o.filename) || asString(o.name) || null,
      // Resend ใช้ `content_type` · Cloudflare Worker ที่เราเขียนเองส่ง `contentType`
      contentType: asString(o.content_type) || asString(o.contentType) || asString(o.type) || null,
      content: asString(o.content) || asString(o.content_base64) || null,
      url: asString(o.url) || asString(o.downloadUrl) || null,
      size: typeof o.size === "number" ? o.size : null,
    });
  }
  return out;
}

/**
 * ปรับรูปของผู้ให้บริการให้เป็นรูปเดียว (Resend inbound ห่อของจริงไว้ใน `data` · Cloudflare Email Worker
 * และตัวทดสอบส่งแบน ๆ ที่ราก) — ที่นี่รับทั้งสองแบบโดยไม่ต้องรู้ว่าใครส่ง
 */
function normalizeProviderPayload(raw: unknown): InboundEmailPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
  const headers = data.headers && typeof data.headers === "object" ? (data.headers as Record<string, unknown>) : {};

  const messageId =
    asString(data.messageId) ||
    asString(data.message_id) ||
    asString(headers["message-id"]) ||
    asString(headers["Message-ID"]);
  const to = toRecipients(data.to ?? data.recipients ?? data.envelope_to);
  if (!messageId || to.length === 0) return null;

  return {
    messageId,
    to,
    from: asString(data.from) || asString(data.sender) || asString(data.envelope_from),
    subject: asString(data.subject) || null,
    text: asString(data.text) || asString(data.plain) || null,
    html: asString(data.html) || null,
    attachments: toAttachments(data.attachments),
  };
}

export async function POST(req: Request): Promise<Response> {
  // ── ด่าน 1: เปิดบริการหรือยัง ──
  if (!emailInboundSecret) {
    return NextResponse.json({ ok: false, error: "ยังไม่ได้เปิดบริการรับอีเมลเข้าบอร์ด" }, { status: 503 });
  }

  // ── ด่าน 2: ความลับ ──
  const given = req.headers.get("x-inbound-secret") ?? "";
  if (!given || !secretMatches(given, emailInboundSecret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // ── ด่าน 3: ขนาด ── (เช็คจาก header ก่อน เพื่อไม่ต้องอ่านทั้งก้อนเข้าหน่วยความจำ)
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "อีเมลใหญ่เกินกำหนด" }, { status: 413 });
  }
  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ ok: true, created: false });
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "อีเมลใหญ่เกินกำหนด" }, { status: 413 });
  }

  // ── ผ่านด่านแล้ว: ตอบ 200 เสมอ (ดูหัวไฟล์) ──
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const payload = normalizeProviderPayload(parsed);
    if (!payload) return NextResponse.json({ ok: false, created: false });
    const res = await ingestInboundEmail(payload);
    return NextResponse.json({ ok: res.ok, created: res.created ?? false });
  } catch {
    // JSON เพี้ยน/ตัวประมวลผลพังแบบไม่คาดคิด — ไม่ใช่เหตุให้ผู้ให้บริการปิดสายอีเมลของทั้งระบบ
    return NextResponse.json({ ok: false, created: false });
  }
}

/** health check ของผู้ให้บริการ — ไม่บอกอะไรเกินว่าเปิดบริการอยู่ไหม */
export async function GET(): Promise<Response> {
  return emailInboundSecret
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false }, { status: 503 });
}
