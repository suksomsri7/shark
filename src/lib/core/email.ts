import { env, emailEnabled } from "@/lib/env";

// ส่งอีเมล — dev fallback: log ออก console (ยังไม่มี Resend key)
// เมื่อเสียบ RESEND_API_KEY จะส่งจริงผ่าน Resend (verify domain shark.in.th)
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!emailEnabled) {
    console.log(
      `\n┌─ [email:dev] ────────────────────────────────\n│ to:      ${to}\n│ subject: ${subject}\n│ ${text.replace(/\n/g, "\n│ ")}\n└──────────────────────────────────────────────\n`,
    );
    return;
  }
  // resilient: ไม่ throw ถ้าส่งพลาด (เช่น domain ยังไม่ verify → ส่งได้เฉพาะเจ้าของบัญชี)
  // login ยังทำงานผ่าน on-screen OTP ใน preview
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[email] Resend ส่งไม่สำเร็จ (${res.status}): ${body}`);
      // เมลคือเส้นเลือด login — ล้มเงียบไม่ได้อีกแล้ว (เคส OTP หายเงียบ 23 ก.ค.) → ลง OpsEvent ให้ตรวจย้อนได้
      const { logOps } = await import("@/lib/core/ops");
      await logOps("ERROR", "email", `Resend ${res.status} ถึง ${to}`, { detail: body.slice(0, 500) });
    }
  } catch (e) {
    console.warn("[email] Resend error:", e);
    const { logOps } = await import("@/lib/core/ops");
    await logOps("ERROR", "email", `Resend exception ถึง ${to}`, { detail: String(e).slice(0, 500) }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// sendEmailRich — ตัวส่งอีเมลเต็มรูป (ใบ CRM v2 · C2.5 · สัญญา A ของข้อสอบ qc-crm-c2.5)
//
// 🔴 `sendEmail` ข้างบน **ห้ามแตะแม้แต่ไบต์เดียว** (ผู้เรียกหลายสิบราย: OTP · บอร์ดงาน · สมาชิก · ฟอร์ม ·
//    รายงาน) — ข้อสอบตรึง sha256 ของบล็อกฟังก์ชันนั้นไว้ · ของใหม่ต่อท้ายเท่านั้น
// 🔴 ไม่เคย throw: ทุกความล้มเหลวคืน `{ ok:false, error }` (อีเมลคือเส้นเลือดของ login/ใบเสนอราคา —
//    ตัวส่งที่โยนขึ้นไปทำให้ tx ของผู้เรียกพังทั้งก้อน)
// AUDIT-CLASS X6: CR/LF ในหัวจดหมายทุกช่อง (subject · fromName · from · replyTo · ผู้รับทุกคน ·
//    ชื่อ/ค่าของ header ที่ส่งมาเอง · ชื่อไฟล์แนบ) = **ปฏิเสธก่อนยิง** (`INVALID_HEADER`) — การฉีด
//    `\r\nBcc:` คือวิธีส่งสำเนาลับไปหาคนนอกผ่านฟอร์มของร้านเอง · ผู้รับว่าง = ไม่ยิงเช่นกัน
// AUDIT-CLASS X8: บันทึกความล้มเหลวลง OpsEvent ได้ แต่ **ห้ามมีที่อยู่ หัวเรื่อง หรือเนื้อความ** ในนั้น
//    (OpsEvent เปิดอ่านจากหน้าผู้ดูแลแพลตฟอร์มข้ามร้าน) — เก็บแค่สถานะของผู้ให้บริการ
// 🔴 `deps.fetch` ฉีดแทน `fetch` ได้ (ข้อสอบ/เทส) ⇒ ไม่มีทางที่ QC จะยิงถึง Resend จริง
// ═══════════════════════════════════════════════════════════════════════════════════════════

export type RichEmailAttachment = {
  filename: string;
  /** ไบต์ของไฟล์ หรือ base64 ที่เตรียมมาแล้ว */
  content: Uint8Array | string;
  contentType?: string;
};

export type RichEmail = {
  from?: string;
  fromName?: string;
  replyTo?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: RichEmailAttachment[];
  /** กุญแจกันซ้ำของผู้ให้บริการ (Resend รับ `Idempotency-Key`) */
  idempotencyKey?: string;
};

export type RichEmailResult = { ok: boolean; providerId?: string; error?: string };

export type RichEmailDeps = { fetch?: typeof fetch };

/** AUDIT-CLASS X6: ตัวแบ่งบรรทัดทุกรูปที่ตัวประกอบหัวจดหมายอาจถือเป็นบรรทัดใหม่ (รวม NUL) */
const HEADER_BREAK_RE = /[\r\n\u0085\u2028\u2029\u0000]/;

function hasHeaderBreak(v: unknown): boolean {
  return typeof v === "string" && HEADER_BREAK_RE.test(v);
}

const RICH_ADDR_RE = /^[^\s<>@,;"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** `"ชื่อ" <addr>` หรือ `addr` — คืนส่วนที่เป็นที่อยู่ล้วน (ใช้ตรวจรูปแบบอย่างเดียว) */
function bareAddr(v: string): string {
  const m = v.match(/<([^>]*)>\s*$/);
  return (m ? (m[1] ?? "") : v).trim();
}

function richAddrOk(v: unknown): boolean {
  return typeof v === "string" && !hasHeaderBreak(v) && RICH_ADDR_RE.test(bareAddr(v));
}

function toBase64(content: Uint8Array | string): string {
  return typeof content === "string" ? content : Buffer.from(content).toString("base64");
}

/**
 * ส่งอีเมล 1 ฉบับผ่าน Resend (HTML + สำเนา + ไฟล์แนบ + header เอง) — ไม่ throw
 * คืน `providerId` = `id` ที่ผู้ให้บริการตอบ (webhook ของ C2.5 ใช้ค่านี้ผูกกลับมาที่แถวอีเมล)
 */
export async function sendEmailRich(msg: RichEmail, deps?: RichEmailDeps): Promise<RichEmailResult> {
  const doFetch = deps?.fetch ?? fetch;
  try {
    const to = (msg?.to ?? []).filter((x) => typeof x === "string" && x.trim().length > 0);
    if (to.length === 0) return { ok: false, error: "NO_RECIPIENT" };
    const cc = msg.cc ?? [];
    const bcc = msg.bcc ?? [];
    const headers = msg.headers ?? {};
    // AUDIT-CLASS X6 — ด่านเดียวที่ตรวจทุกช่องที่จะกลายเป็นหัวจดหมาย (ตรวจก่อนแตะเครือข่าย)
    const headerish: unknown[] = [msg.subject, msg.fromName, msg.from, msg.replyTo, ...to, ...cc, ...bcc];
    for (const [k, v] of Object.entries(headers)) headerish.push(k, v);
    for (const a of msg.attachments ?? []) headerish.push(a?.filename);
    if (headerish.some(hasHeaderBreak)) return { ok: false, error: "INVALID_HEADER" };
    if (![...to, ...cc, ...bcc].every(richAddrOk)) return { ok: false, error: "INVALID_HEADER" };
    if (msg.from !== undefined && !richAddrOk(msg.from)) return { ok: false, error: "INVALID_HEADER" };
    if (msg.replyTo !== undefined && !richAddrOk(msg.replyTo)) return { ok: false, error: "INVALID_HEADER" };
    if (Object.keys(headers).some((k) => !/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(k))) return { ok: false, error: "INVALID_HEADER" };

    const fromAddr = (msg.from ?? env.EMAIL_FROM).trim();
    const from = msg.fromName ? `${msg.fromName} <${bareAddr(fromAddr)}>` : fromAddr;
    const body: Record<string, unknown> = { from, to, subject: msg.subject, html: msg.html };
    if (msg.text) body.text = msg.text;
    if (cc.length) body.cc = cc;
    if (bcc.length) body.bcc = bcc;
    if (msg.replyTo) body.reply_to = msg.replyTo;
    if (Object.keys(headers).length) body.headers = headers;
    if (msg.attachments?.length) {
      body.attachments = msg.attachments.map((a) => ({ filename: a.filename, content: toBase64(a.content) }));
    }

    const res = await doFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(msg.idempotencyKey ? { "Idempotency-Key": msg.idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // AUDIT-CLASS X8: สถานะเท่านั้น — ไม่มีที่อยู่/หัวเรื่อง/เนื้อความในบันทึกที่ข้ามร้านได้
      const { logOps } = await import("@/lib/core/ops");
      await logOps("WARN", "email.rich", `Resend ตอบ ${res.status}`, {}).catch(() => {});
      return { ok: false, error: `PROVIDER_${res.status}` };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: unknown };
    return { ok: true, providerId: typeof json?.id === "string" ? json.id : undefined };
  } catch (e) {
    // AUDIT-CLASS X8: ชื่อชนิด error ล้วน (ข้อความของ fetch มีโฮสต์ได้ แต่ต้องไม่มีที่อยู่ผู้รับ)
    const { logOps } = await import("@/lib/core/ops");
    await logOps("WARN", "email.rich", "ส่งอีเมลผ่าน Resend ไม่สำเร็จ", {
      detail: (e instanceof Error ? e.name : "Error").slice(0, 80),
    }).catch(() => {});
    return { ok: false, error: "TRANSPORT_ERROR" };
  }
}
