// GET /api/files/[id]?exp=<unix>&sig=<hmac> — ทางออกทางเดียวของไฟล์ส่วนตัว (ใบ CRM v2 C0.4 · มติ C17)
//
// AUDIT-CLASS X10 (ความลับและไฟล์): เสียงบันทึกการโทร · ไฟล์แนบอีเมลขาเข้า · สัญญา · สลิปโอนเงิน
//   เข้าถึงได้ผ่าน route ที่ตรวจสิทธิ์ + ลิงก์หมดอายุเท่านั้น · ไม่มี URL CDN ถาวรที่ไหนเลย
//   route นี้ **สตรีมไบต์เอง** ไม่ redirect ไป CDN (redirect = ยื่น URL ถาวรทางอ้อม)
// AUDIT-CLASS X7 (endpoint ที่คนนอกยิงได้): จำกัดอัตราด้วย `checkRateLimitDb` ต่อผู้ดู
//   **รวมคำขอที่ลายเซ็นผิด** — ถ้าไม่นับ เลนเดาลายเซ็นจะเป็นเลนเดียวที่ไม่มีเพดาน
// AUDIT-CLASS X1 (ข้ามร้าน): ลายเซ็นถูกแต่ไฟล์เป็นของร้านอื่น = 404 ไม่ใช่ 403
//   (403 บอกคนนอกว่า "รหัสนี้มีอยู่จริง")
//
// 🔴🔴 AUDIT-CLASS X10 — **ขอบเขตการอนุญาตของ endpoint นี้ อ่านให้จบก่อนออกลิงก์**
//   route นี้ปล่อยไบต์ออกไปเมื่อครบแค่ **สองข้อ**: (ก) ผู้ขอเป็นสมาชิกของร้านที่เป็นเจ้าของแถว
//   (ข) ลายเซ็นบนลิงก์ถูกต้องและยังไม่หมดอายุ · **ไม่มีการตรวจ role · ไม่มีการตรวจ permission ·
//   ไม่มีการเรียก `canSee` ใด ๆ ทั้งสิ้น** — พนักงานระดับต่ำสุดของร้านที่ถือลิงก์ที่ออกให้ตัวเอง
//   ก็เปิดไฟล์นั้นได้ แม้จะเป็นไฟล์ของดีลที่เขาไม่มีสิทธิ์เห็น
//   ⇒ ลิงก์ = ใบผ่าน · **ผู้ที่ออกใบคือผู้ที่ตัดสินสิทธิ์** ⇒ ทุกใบงานที่จะเรียก `privateFileUrl`
//     (C2.4 เสียงบันทึกการโทร · C2.5 ไฟล์แนบอีเมล · C3.5 พอร์ทัลลูกค้า · C3.9 ลบตาม PDPA)
//     **ต้องรัน `canSee`/visibleWhere ของโมดูลตัวเองให้ผ่านก่อนออกลิงก์เสมอ** ห้ามถือว่า route นี้
//     กันให้แล้ว · จะเพิ่มการตรวจสิทธิ์ที่นี่แทนไม่ได้ เพราะ route ไม่รู้ว่าไฟล์ผูกกับเอนทิตีอะไร
//
// 🔴 ลำดับด่านสำคัญมาก และเรียงแบบนี้โดยตั้งใจ:
//     1) หาว่าใครเป็นคนขอ (พนักงาน/ลูกค้า) — ไม่รู้ว่าใคร = 403 และนับไม่ได้
//     2) เพดานอัตราต่อผู้ดู (ก่อนตรวจลายเซ็น จึงนับคำขอที่เดาลายเซ็นด้วย)
//     3) รูปของ `id` — `id` คือ "รหัสแถว" ไม่ใช่ "ที่อยู่ไฟล์": อะไรที่มี `/` หรือ `..` = 404
//        ตั้งแต่ก่อนแตะลายเซ็นและก่อนแตะฐานข้อมูล
//     4) ลายเซ็น + อายุ (เพดาน 15 นาทีถูกตรวจซ้ำที่นี่ ไม่เชื่อผู้ออกใบ)
//     5) แถวจริง + ร้านของผู้ดู
// 🔴 ทุกคำตอบ (200 / 403 / 404 / 429) ต้องมี `Cache-Control: private, no-store`
//    ⇒ ห้ามใช้ `notFound()` ที่นี่ (มันไม่พกหัวไปด้วย) — คืน `Response` ตรง ๆ ทุกทาง
//    403/404 ที่ถูกแคชได้ = ทั้งช่องวางยาแคชและช่องรั่วข้อมูลข้ามผู้ใช้

import { cookies } from "next/headers";
import { prisma } from "@/lib/core/db";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { getSessionUser } from "@/lib/core/session";
import { customerCookieName, getCustomerSession } from "@/lib/modules/member/customer-session";
import {
  extensionForUploadType,
  FILE_ASSET_ID_RE,
  normalizeUploadType,
  openStoredFile,
  privateFileSignatureOk,
  type PrivateFileViewer,
} from "@/lib/storage/service";

export const dynamic = "force-dynamic";

/**
 * เพดานอัตราต่อผู้ดู (มติผู้คุมงาน 17 ก.ย. ข้อ 6): 60 ครั้ง / 60 วินาที
 * · สูงพอให้หน้า CRM ที่มีไฟล์แนบหลายใบเปิดรวดเดียวได้โดยไม่สะดุด
 * · ต่ำพอที่ route นี้จะไม่ถูกใช้เป็นท่อดูดไฟล์ออกทั้งร้าน
 */
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

/**
 * เพดานก่อนรู้ว่าใครขอ — ต่อ IP (AUDIT 18 ก.ย. ข้อ 5)
 *
 * 🔴 ของเดิมตอบ 403 ให้คนที่ไม่มี session **ก่อน**จะถึงตัวจำกัดอัตรา ⇒ เลนที่ถูกที่สุดในการถล่ม
 *    (ไม่ต้องมี cookie เลย) คือเลนเดียวที่ไม่มีเพดาน และแต่ละคำขอยังเสีย DB round trip ไป 2 ครั้ง
 *    (`getSessionUser` + `getCustomerSession`) ฟรี ๆ ⇒ นับต่อ IP **ก่อน** แตะฐานข้อมูลใด ๆ
 * 🔴 ตัวเลขสูงกว่าเพดานต่อผู้ดูโดยตั้งใจ: IP เดียวคือทั้งออฟฟิศ/ทั้งเครือข่ายมือถือ (NAT)
 *    เพดานนี้มีไว้ตัดการถล่ม ไม่ใช่มาแทนเพดานต่อผู้ดู (ซึ่งยังเป็น 60/นาที ตามมติข้อ 6)
 */
const IP_RATE_LIMIT = 300;

/** IP ของผู้ขอหลัง proxy — เอาตัวหน้าสุดของ `x-forwarded-for` (ตัวที่ edge ของเราเขียน) */
function clientIp(headers: Headers): string {
  const fwd = (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  const ip = fwd || (headers.get("x-real-ip") ?? "").trim();
  // ตัดให้สั้นและเหลือเฉพาะอักขระของ IP — คีย์ของถังต้องไม่ถูกผู้ขอกำหนดรูปได้ตามใจ
  return (ip || "unknown").slice(0, 45).replace(/[^0-9a-fA-F.:]/g, "") || "unknown";
}

/** mime ที่ยอมให้แสดงในที่ (เสียงบันทึกการโทรต้องกดฟังได้เลย) — นอกจากนี้บังคับดาวน์โหลดทั้งหมด */
function isInlineMime(mime: string): boolean {
  return mime === "image/png" || mime === "image/jpeg" || mime.startsWith("audio/");
}

/** `id` ที่พยายามทำตัวเป็นที่อยู่ไฟล์ (รวมรูป encode) — ตอบ 404 ตั้งแต่ด่านแรก */
const ID_LOOKS_LIKE_PATH = /[/\\]|\.\.|%2f|%5c/i;

const NO_STORE: Record<string, string> = { "cache-control": "private, no-store" };

function deny(status: number, extra?: Record<string, string>): Response {
  return new Response(null, { status, headers: { ...NO_STORE, ...extra } });
}

type Viewer = PrivateFileViewer & { tenantId?: string };

/**
 * ผู้ดูที่คำขอนี้เป็นได้ — พนักงานก่อน แล้วค่อย session ลูกค้า
 *
 * 🔴 ไม่เชื่อ id ใด ๆ จาก query/หัวคำขอ: ตัวตนมาจาก cookie session ที่ตรวจแล้วเท่านั้น
 * 🔴 ยอมมีได้ทั้งสองใบพร้อมกัน (พนักงานที่เปิดหน้าลูกค้าในเบราว์เซอร์เดียวกัน) แล้วให้ลายเซ็น
 *    เป็นตัวชี้ว่าลิงก์ใบนี้ออกให้ "ตัวตนไหน" — แต่เพดานอัตรานับที่ตัวตนหลักเสมอ
 */
async function resolveViewers(): Promise<Viewer[]> {
  const out: Viewer[] = [];
  try {
    const user = await getSessionUser();
    if (user) out.push({ kind: "STAFF", id: user.id });
  } catch {
    // อ่าน session พนักงานไม่ได้ = ถือว่าไม่ใช่พนักงาน (ยังลองฝั่งลูกค้าต่อ)
  }
  try {
    const token = (await cookies()).get(customerCookieName())?.value ?? "";
    if (token) {
      const session = await getCustomerSession(token);
      if (session) out.push({ kind: "CUSTOMER", id: session.customerId, tenantId: session.tenantId });
    }
  } catch {
    // ไม่มี session ลูกค้า
  }
  return out;
}

/** ผู้ดูคนนี้อยู่ร้านเดียวกับไฟล์ไหม (ไม่ใช่ = 404) */
async function viewerBelongsToTenant(viewer: Viewer, tenantId: string): Promise<boolean> {
  if (viewer.kind === "CUSTOMER") return viewer.tenantId === tenantId;
  const membership = await prisma.membership.findFirst({
    where: { userId: viewer.id, tenantId, acceptedAt: { not: null } },
    select: { id: true },
  });
  return membership !== null;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  // 🔴 ห่อทั้งก้อน: คำตอบทุกใบของ route นี้ต้องมี `private, no-store` (มติผู้คุมงาน ข้อ 4 · MAJOR)
  //    error ที่หลุดขึ้นไปให้ Next จัดการ = 500 ที่ **ไม่มีหัวนั้น** ⇒ แคชได้ = รั่วข้ามผู้ใช้
  //    (แถวที่ถูกปลูกด้วยค่าประหลาดต้องทำให้เราตอบ 500 แบบไม่มีหัวไม่ได้)
  try {
    return await handle(req, ctx);
  } catch {
    return deny(500);
  }
}

async function handle(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // ── 0) เพดานก่อนรู้ว่าใครขอ (X7) — ต้องมาก่อน `resolveViewers()` ──
  // 🔴 ลำดับนี้คือทั้งหมดของข้อ 5: เลนที่ไม่ต้องมี cookie เลยคือเลนที่ถูกที่สุดในการถล่ม
  //    มันจึงต้องไม่ใช่เลนที่ "ออกก่อนถึงตัวนับ" และต้องไม่เสีย DB round trip ก่อนถูกนับ
  const ip = clientIp(req.headers);
  const ipVerdict = await checkRateLimitDb(
    `files:private:ip:${ip}`,
    { limit: IP_RATE_LIMIT, windowMs: RATE_WINDOW_MS },
  );
  if (!ipVerdict.ok) {
    return deny(429, { "retry-after": String(ipVerdict.retryAfterSec ?? 60) });
  }

  const { id: rawId } = await params;

  // ── 1) ใครขอ ──
  const viewers = await resolveViewers();
  const primary = viewers[0];
  if (!primary) return deny(403);

  // ── 2) เพดานอัตราต่อผู้ดู (X7) — นับก่อนตรวจลายเซ็น จึงครอบคลุมคำขอที่เดาลายเซ็น ──
  const verdict = await checkRateLimitDb(
    `files:private:${primary.kind}:${primary.id}`,
    { limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS },
  );
  if (!verdict.ok) {
    return deny(429, { "retry-after": String(verdict.retryAfterSec ?? 60) });
  }

  // ── 3) `id` ต้องไม่ใช่ "ที่อยู่ไฟล์" ──
  // 🔴 อะไรที่มี `/` `\` `..` หรือรูป encode ของมัน = คนกำลังลองเดินออกนอกโฟลเดอร์ของร้าน
  //    → 404 ทันที **ก่อน**แตะลายเซ็น ฐานข้อมูล หรือที่เก็บไฟล์ (ไม่ยืนยันว่ามีอะไรอยู่ตรงไหน)
  //    ส่วน `id` ที่เพี้ยนเฉย ๆ (พารามิเตอร์หาย/ต่อกันมั่ว) ปล่อยให้ตกที่ด่านลายเซ็น = 403
  //    เหมือนลายเซ็นผิดทุกกรณี — คำตอบชุดเดียว ไม่แยกแยะให้คนเดา
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (ID_LOOKS_LIKE_PATH.test(id)) return deny(404);

  // ── 4) ลายเซ็น + อายุ (ผูกกับ id · exp · ตัวตนผู้ดู) ──
  const url = new URL(req.url);
  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  const viewer = viewers.find((v) => privateFileSignatureOk(id, exp, sig, v));
  if (!viewer) return deny(403);

  // ── 5) แถวจริง + ร้านของผู้ดู ──
  // กันชั้นสุดท้ายก่อนแตะฐานข้อมูล: ลายเซ็นผ่านแล้วแปลว่าเราเป็นคนออก `id` นี้เอง
  // แต่ถ้าวันหนึ่งกุญแจรั่ว รูปของ `id` ยังต้องเป็นรหัสแถวอยู่ดี
  if (!FILE_ASSET_ID_RE.test(id)) return deny(404);
  const asset = await prisma.fileAsset.findFirst({
    where: { id },
    select: { id: true, tenantId: true, path: true, contentType: true },
  });
  if (!asset) return deny(404);
  if (!(await viewerBelongsToTenant(viewer, asset.tenantId))) return deny(404);

  // ── 6) สตรีมไบต์จากที่เก็บด้วยกุญแจฝั่งเซิร์ฟเวอร์ ──
  // 🔴 อ่านด้วย **ร้านเจ้าของแถว** ไม่ใช่ path เปล่า ๆ: `FileAsset.path` ไม่ได้ถูกสร้างโดย
  //    เซิร์ฟเวอร์เสมอ (`kanban/links.ts:373` รับค่าจาก body ของ chat API v1) ⇒ แถวในร้านเรา
  //    ที่ path ชี้เข้าร้านอื่น ต้องอ่านไม่ได้ (BLOCKER 1 ของการตรวจ 18 ก.ย.)
  const opened = await openStoredFile(asset.path, asset.tenantId);
  if (!opened.ok) return deny(opened.status === 503 ? 503 : 404);

  // 🔴 ชนิดที่ประกาศออกไปต้องมาจาก **ทะเบียนของเราเอง** ไม่ใช่สตริงดิบในแถว:
  //    · แถวที่ถูกปลูกด้วย contentType ตามใจ (`kanban/links.ts:375`) ต้องไม่ทำให้เราประกาศ
  //      `text/html` แล้วเปิดช่อง stored-XSS บนโดเมนของเราเอง
  //    · ต้องเป็นค่าเดียวกับที่ใช้ตัดสิน inline/attachment เป๊ะ ๆ — สองค่านี้แยกกันเมื่อไหร่
  //      หมายถึงเราตัดสินจากอย่างหนึ่งแล้วบอกเบราว์เซอร์อีกอย่างหนึ่ง
  //    · ไม่รู้จัก = `application/octet-stream` + บังคับดาวน์โหลด
  const ext = extensionForUploadType(asset.contentType);
  const mime = ext === null ? "application/octet-stream" : normalizeUploadType(asset.contentType);
  const filename = `${asset.id}${ext ? `.${ext}` : ""}`.replace(/[^A-Za-z0-9._-]/g, "");
  // 🔴 หัวคำตอบห้ามพกที่อยู่จริงของวัตถุหรือโดเมน CDN ออกไป (X10) — ชื่อไฟล์มาจาก id เท่านั้น
  // 🔴 ห้ามมี CR/LF ในหัว (ช่อง response splitting) — id/นามสกุลถูกกรองให้เหลือ [A-Za-z0-9._-]
  const disposition = isInlineMime(mime) ? "inline" : `attachment; filename="${filename}"`;

  const headers: Record<string, string> = {
    ...NO_STORE,
    "content-type": mime,
    "content-disposition": disposition,
    // เบราว์เซอร์ต้องไม่เดาชนิดเอง — ไฟล์แนบจากคนนอกที่ถูกเดาเป็น HTML = ช่อง stored-XSS
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };

  const body: BodyInit | null =
    opened.body ?? (opened.bytes ? (opened.bytes.slice().buffer as ArrayBuffer) : null);
  return new Response(body, { status: 200, headers });
}
