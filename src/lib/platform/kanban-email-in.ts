// kanban-email-in.ts — "อีเมลเข้าบอร์ด" (K3.9 · พิมพ์เขียว `docs/modules/13-kanban-v2.md` §9.2)
//
// 🔴 ทำไมไฟล์นี้อยู่ `src/lib/platform/` ไม่ใช่ในโมดูลบอร์ดงาน: ตัวรับอีเมลต้องอ่านของหลายฝั่ง
//    (ทะเบียนสวิตช์ของระบบ · ผู้ใช้/สมาชิกของร้าน · ที่เก็บไฟล์กลาง) แล้วขอให้บอร์ดงานเปิดการ์ดให้
//    ⇒ วางในโมดูลจะกลายเป็นเส้น import ข้ามโมดูลที่ผิดกติกา (F2) · composition root อ่านได้ทุกฝั่ง
//    เขียนบอร์ดงานผ่าน facade `links.createCardFromExternal` เท่านั้น (ห้ามเรียก `kanban/service` ตรง)
//
// 🔴 อีเมลขาเข้า = ข้อมูลจาก **คนนอกที่ยังพิสูจน์ตัวไม่ได้** — ปลอมช่อง From ได้ฟรี ⇒ ถือทุกกติกานี้ทั้งไฟล์:
//  1. **ห้าม throw** — ผู้เรียกคือ webhook ของผู้ให้บริการอีเมล · โยน error ออกไป = ผู้ให้บริการ retry
//     ไม่รู้จบ หรือปิด endpoint ทิ้ง ⇒ ทุกทางออกคือ `{ ok, reason }` และมี try/catch คลุมทั้งก้อน
//  2. **ไม่รู้จักกุญแจ / สวิตช์ปิด = ตอบเงียบ** — ห้ามบอกว่ามีบอร์ดใบนี้อยู่หรือไม่ (ผู้ถามคือคนนอก
//     ที่ยิงสุ่มที่อยู่ได้ไม่จำกัด) · reason มีไว้ให้ log ฝั่งเราอ่าน ไม่ใช่ให้ผู้ส่งเห็น
//  3. **หัวข้อ/เนื้อหา/ชื่อไฟล์ ถูก escape/sanitize ก่อนลงรายละเอียดการ์ดเสมอ** (§11.6 เดียวกับหลังการ์ด)
//  4. **ยิงซ้ำได้** — ผู้ให้บริการส่งซ้ำเป็นเรื่องปกติ ⇒ `sourceKey = email:{messageId}` กันซ้ำ
//     และต้องเช็ค "เคยมีการ์ดใบนี้แล้วหรือยัง" **ก่อนอัปโหลดไฟล์แนบ** ไม่งั้นยิงซ้ำ 3 ครั้ง = จ่ายค่าอัปโหลด 3 รอบ
//  5. **เพดานชัดเจน** — ไฟล์แนบ ≤ 20 ชิ้น/ฉบับ ชิ้นละ ≤ 10MB · หัวข้อ ≤ 120 ตัวอักษร (ชื่อการ์ดต้องอ่านออกบนบอร์ด)

import { prisma } from "@/lib/core/db";
import { findBoardByEmailKey, boardEmailKeyFromRecipients } from "@/lib/modules/kanban/boards-email";
import { getIntegrations } from "@/lib/modules/kanban/integrations";
import { createCardFromExternal } from "@/lib/modules/kanban/links";
import { renderDescription, sanitizeDescription } from "@/lib/modules/kanban/sanitize";
import { ALLOWED_UPLOAD_TYPES, normalizeUploadType, uploadFile } from "@/lib/storage/service";

/** ความยาวสูงสุดของชื่อการ์ดที่ตัดจากหัวข้ออีเมล (ยาวกว่านี้บนบอร์ดอ่านไม่ออกอยู่ดี) */
const SUBJECT_MAX = 120;
/** ไฟล์แนบสูงสุดต่ออีเมล 1 ฉบับ (= เพดานไฟล์แนบต่อการ์ดของ D4) — เกินมาเก็บ 20 ชิ้นแรก */
const ATTACHMENTS_MAX = 20;
/** ขนาดสูงสุดต่อไฟล์ (D4 — เท่ากับไฟล์แนบในแชท) */
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** ความยาวสูงสุดของเนื้อความที่แปลงเป็นรายละเอียด (อีเมลลูกโซ่ยาวเป็นหมื่นบรรทัดไม่ใช่ "งาน") */
const BODY_MAX = 20_000;

export type InboundEmailAttachment = {
  filename?: string | null;
  contentType?: string | null;
  /** เนื้อไฟล์แบบ base64 (Resend / Cloudflare Email Worker ส่งแบบนี้) */
  content?: string | null;
  /** หรือผู้ให้บริการเก็บไฟล์ให้แล้วส่งแต่ลิงก์มา — ใช้ตรง ๆ ไม่ต้องอัปซ้ำ */
  url?: string | null;
  size?: number | null;
};

export type InboundEmailPayload = {
  messageId: string;
  to: string[];
  from: string;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  attachments?: InboundEmailAttachment[];
};

/** ตัวอัปโหลดที่ฉีดได้ (ข้อสอบ) — ไม่ส่งมา = ใช้ที่เก็บไฟล์จริงของ core (`storage/service#uploadFile`) */
export type IngestEmailDeps = {
  upload?: (
    data: Buffer,
    meta: { fileName: string; contentType: string; tenantId: string },
  ) => Promise<{ storageKey: string; url: string; bytes: number }>;
};

export type IngestEmailResult = {
  ok: boolean;
  created?: boolean;
  cardId?: string;
  /** เหตุผลสำหรับ log ฝั่งเรา — **ห้ามส่งต่อให้ผู้ส่งอีเมลเห็น** (ดูกติกาข้อ 2 หัวไฟล์) */
  reason?: "disabled" | "unknown_board" | "invalid";
};

/** escape ก่อนประกอบเป็น HTML — ข้อความพวกนี้คนนอกร้านเป็นคนพิมพ์ (แบบเดียวกับ `kanban-bridges.ts`) */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** ดึงอีเมลล้วนออกจาก `"ชื่อ คนส่ง" <a@b.com>` — ไม่มีวงเล็บก็คืนของเดิมที่ตัดช่องว่างแล้ว */
function bareEmail(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m?.[1] ?? raw).trim().toLowerCase();
}

/** ชื่อไฟล์ที่ปลอดภัยพอจะเก็บ/แสดง (ตัด path traversal + อักขระควบคุม · ว่าง = ตั้งชื่อกลาง ๆ ให้) */
function safeFileName(raw: string | null | undefined): string {
  const banned = '<>:"|?*';
  const base = (raw ?? "")
    .replace(/[\\/]+/g, "-")
    // อักขระควบคุม (< 0x20) และตัวที่ระบบไฟล์/URL ตีความพิเศษ — คัดออกทีละตัว
    // (regex ของ control char ติดกฎ eslint `no-control-regex` และอ่านยากกว่าเงื่อนไขตรง ๆ แบบนี้)
    .split("")
    .filter((c) => c.charCodeAt(0) >= 0x20 && !banned.includes(c))
    .join("")
    .trim()
    .slice(0, 180);
  return base || "ไฟล์แนบจากอีเมล";
}

/** ผู้ส่งเป็นพนักงานของร้านนี้ไหม (ด่าน `acceptedAt` เดียวกับ `cards.assertMembers`) → userId หรือ null */
async function senderMemberId(tenantId: string, fromEmail: string): Promise<string | null> {
  if (!fromEmail) return null;
  const user = await prisma.user.findFirst({
    where: { email: { equals: fromEmail, mode: "insensitive" } },
    select: { id: true },
  });
  if (!user) return null;
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId: user.id, acceptedAt: { not: null } },
    select: { userId: true },
  });
  return membership?.userId ?? null;
}

type PreparedAttachment = { storageKey: string | null; url: string; fileName: string; mimeType: string; sizeBytes: number };

/**
 * แปลงไฟล์แนบของอีเมล → รูปที่ `createCardFromExternal` รับ (ของที่อยู่บน CDN แล้ว)
 *
 * 🔴 ชิ้นเดียวพัง ต้องไม่ทำให้ "อีเมลกลายเป็นการ์ดไม่ได้" — งานสำคัญกว่าไฟล์แนบเสมอ ⇒ ข้ามชิ้นนั้นเงียบ
 * 🔴 ชนิดไฟล์ต้องอยู่ในทะเบียนของ storage (`ALLOWED_UPLOAD_TYPES`) — ชนิดนอกทะเบียนไม่มีนามสกุลจริง
 *    ⇒ CDN จะเสิร์ฟเป็น octet-stream และเราจะเก็บของที่ไม่มีใครเปิดได้ไว้เฉย ๆ
 */
async function prepareAttachments(
  tenantId: string,
  raw: InboundEmailAttachment[],
  deps: IngestEmailDeps | undefined,
): Promise<PreparedAttachment[]> {
  const out: PreparedAttachment[] = [];
  for (const a of raw.slice(0, ATTACHMENTS_MAX)) {
    try {
      const fileName = safeFileName(a.filename);
      const mimeType = normalizeUploadType(a.contentType) || "application/octet-stream";
      if (!(mimeType in ALLOWED_UPLOAD_TYPES)) continue;

      // (ก) ผู้ให้บริการเก็บไฟล์ให้แล้ว — ใช้ลิงก์เดิม ไม่ดาวน์โหลดกลับมาอัปซ้ำ (เหมือน K3.2 ฝั่งแชท)
      const url = (a.url ?? "").trim();
      if (!a.content && /^https?:\/\/\S+$/i.test(url)) {
        out.push({ storageKey: null, url, fileName, mimeType, sizeBytes: Math.max(0, Math.trunc(a.size ?? 0)) });
        continue;
      }
      if (!a.content) continue;

      const data = Buffer.from(a.content, "base64");
      if (data.length === 0 || data.length > ATTACHMENT_MAX_BYTES) continue;

      if (deps?.upload) {
        const r = await deps.upload(data, { fileName, contentType: mimeType, tenantId });
        out.push({ storageKey: r.storageKey, url: r.url, fileName, mimeType, sizeBytes: r.bytes });
        continue;
      }
      const r = await uploadFile(
        { tenantId },
        { kind: "ATTACHMENT", filename: fileName, contentType: mimeType, data, maxBytes: ATTACHMENT_MAX_BYTES },
      );
      if (!r.ok) continue;
      out.push({ storageKey: null, url: r.cdnUrl, fileName, mimeType, sizeBytes: data.length });
    } catch {
      // ไฟล์ชิ้นเดียวพัง — ข้ามไปชิ้นถัดไป (การ์ดยังต้องเกิด)
    }
  }
  return out;
}

/** รายละเอียดการ์ดจากเนื้ออีเมล — html มีก่อน (sanitize ตัวเดิมของโมดูล) ไม่มีก็แปลง text ทีละบรรทัด */
function buildDescription(payload: InboundEmailPayload, fromIsOutsider: boolean): string | null {
  const html = (payload.html ?? "").trim().slice(0, BODY_MAX);
  const text = (payload.text ?? "").trim().slice(0, BODY_MAX);
  const body = html ? sanitizeDescription(html) : renderDescription(text);
  // ผู้ส่งนอกร้าน: ต้องเห็นตั้งแต่บรรทัดแรกว่าใครส่งมา (ในร้านมี "ผู้รับผิดชอบ" บอกอยู่แล้ว)
  const head = fromIsOutsider ? `<p>จาก: ${esc(bareEmail(payload.from))}</p>` : "";
  const full = `${head}${body}`.trim();
  return full || null;
}

/**
 * 🔴 **ประตูเดียว** ของอีเมลขาเข้า → การ์ด (route `/api/email/inbound` เป็นแค่เปลือกที่ตรวจ secret)
 *
 * ลำดับด่าน (สลับไม่ได้):
 *   1. รูปของ payload ถูกต้อง (`invalid`)
 *   2. มีที่อยู่ `งาน+{key}@` ในผู้รับ และกุญแจนั้นชี้ไปบอร์ด ACTIVE ใบเดียว (`unknown_board`)
 *   3. สวิตช์ `cardFromEmail` ของ **ระบบที่บอร์ดนั้นสังกัด** เปิดอยู่ (`disabled` · ปริยาย = ปิด · D6)
 *   4. เคยรับฉบับนี้แล้วหรือยัง (`sourceKey`) — เคยแล้วคืนใบเดิม `created:false` ก่อนอัปโหลดอะไรทั้งสิ้น
 *   5. สร้างการ์ดผ่าน facade
 */
export async function ingestInboundEmail(
  payload: InboundEmailPayload,
  deps?: IngestEmailDeps,
): Promise<IngestEmailResult> {
  try {
    const messageId = (payload?.messageId ?? "").trim();
    const recipients = Array.isArray(payload?.to) ? payload.to : [];
    if (!messageId || messageId.length > 300 || recipients.length === 0) return { ok: false, reason: "invalid" };

    const key = boardEmailKeyFromRecipients(recipients);
    if (!key) return { ok: false, reason: "unknown_board" };
    const board = await findBoardByEmailKey(key);
    if (!board) return { ok: false, reason: "unknown_board" };

    const integrations = await getIntegrations(board.tenantId, board.systemId);
    if (!integrations.cardFromEmail.enabled) return { ok: false, reason: "disabled" };

    const ctx = { tenantId: board.tenantId, systemId: board.systemId, actorUserId: null };
    const sourceKey = `email:${messageId}`;

    // กันซ้ำก่อนจ่ายค่าอัปโหลด (กติกาข้อ 4 หัวไฟล์) — ประตูของโมดูลกันซ้ำอีกชั้นตอนเขียนจริง
    const existing = await prisma.kanbanCard.findFirst({
      where: { tenantId: board.tenantId, sourceKey },
      select: { id: true },
    });
    if (existing) return { ok: true, created: false, cardId: existing.id };

    const fromEmail = bareEmail(payload.from ?? "");
    const memberId = await senderMemberId(board.tenantId, fromEmail);
    const title = (payload.subject ?? "").trim().slice(0, SUBJECT_MAX) || "(อีเมลไม่มีหัวข้อ)";
    const attachments = await prepareAttachments(board.tenantId, payload.attachments ?? [], deps);

    const res = await createCardFromExternal(ctx, {
      boardId: board.boardId,
      title,
      description: buildDescription(payload, memberId === null),
      assigneeUserIds: memberId ? [memberId] : [],
      sourceType: "EMAIL",
      sourceKey,
      attachments: attachments.map((a) => ({
        storageKey: a.storageKey,
        url: a.url,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
      })),
    });
    return { ok: true, created: res.created, cardId: res.cardId };
  } catch (e) {
    // ห้ามโยนออกไปหา webhook ของผู้ให้บริการ (กติกาข้อ 1) — จดไว้ให้เราเองอ่าน แล้วตอบว่าไม่สำเร็จ
    try {
      const { logOps } = await import("@/lib/core/ops");
      await logOps("ERROR", "kanban", "รับอีเมลเข้าบอร์ดไม่สำเร็จ", {
        detail: String(e).slice(0, 500),
      }).catch(() => {});
    } catch {
      // ops เองพัง → เงียบ
    }
    return { ok: false, reason: "invalid" };
  }
}
