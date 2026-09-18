// ลิงก์ไฟล์ส่วนตัว — มีลายเซ็น ผูกผู้ดู และหมดอายุ (ใบ CRM v2 · C0.4 · มติ C17)
//
// AUDIT-CLASS X10: ไฟล์ส่วนตัว (เสียงบันทึกการโทร · ไฟล์แนบอีเมลขาเข้า · สัญญา · สลิปโอนเงิน)
//   ต้องเข้าถึงได้ผ่าน route ที่ตรวจสิทธิ์ + ลิงก์หมดอายุเท่านั้น — **ห้ามมี URL CDN ถาวรใน DTO**
//   ไฟล์นี้คือที่เดียวที่ "ออกใบผ่าน" และที่เดียวที่ "ตรวจใบผ่าน" ⇒ สูตรลายเซ็นมีชุดเดียวในระบบ
//
// 🔴 ลายเซ็น = HMAC-SHA256( `${fileId}.${exp}.${viewerKey}` ) ด้วย `SESSION_SECRET`
//    · `fileId` อยู่ในลายเซ็น ⇒ ลิงก์ใบเดียวเปิดได้ไฟล์เดียว (ย้ายไปชี้ไฟล์อื่นไม่ผ่าน)
//    · `exp` อยู่ในลายเซ็น ⇒ ยืดอายุเองไม่ได้ (ไม่ใช่แค่เอาไปเทียบนาฬิกาเฉย ๆ)
//    · `viewerKey` อยู่ในลายเซ็น ⇒ ลิงก์ที่หลุดออกไป ใช้กับคนอื่นไม่ได้ (พนักงานคนอื่น/ลูกค้า)
// 🔴 ห้ามมีค่าเริ่มต้นของกุญแจ: ไม่มี `?? ""` / `|| "dev"` — ไม่มี `SESSION_SECRET` = โยนทิ้ง
//    (กุญแจที่เดาได้แม้แต่การตั้งค่าเดียว = ใครก็ปลอมลิงก์เปิดไฟล์ของทุกร้านได้)
// 🔴 ไฟล์นี้อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น — ห้ามมี `'use client'` และห้าม import จากคอมโพเนนต์ไคลเอนต์

import { createHmac } from "node:crypto";
import { safeEqualHex } from "@/lib/core/hash";

/**
 * ป้ายแยกโดเมนของกุญแจ (AUDIT 18 ก.ย. ข้อ 6)
 *
 * 🔴 `SESSION_SECRET` เป็นกุญแจ **ร่วม** ของทั้งระบบ และ RESOLUTIONS R-C.7 ผูกใบ C2.5/C3.5 ให้สร้าง
 *    เส้นทางที่มี token อีก 4 เส้น (`/u/[token]` · `/t/o/[token].gif` · `/t/c/[token]` · `/l/[code]`)
 *    ซึ่งจะเอื้อมมาหยิบกุญแจตัวเดียวกันนี้แน่นอน · ถ้าทุกเส้นเซ็นด้วยกุญแจดิบตัวเดียว ลายเซ็นที่ออก
 *    เพื่องานหนึ่งอาจถูกนำไปใช้กับอีกงานหนึ่งได้เมื่อรูปข้อความบังเอิญชนกัน
 *    ⇒ กุญแจจริง = HMAC key ที่ติดป้ายไว้แล้ว (แบบเดียวกับ `modules/member/me.ts:336` `member-card:`)
 *    มี `:v1` ไว้ให้หมุนสูตรได้ในอนาคตโดยไม่ต้องเปลี่ยน `SESSION_SECRET`
 */
const HMAC_KEY_LABEL = "private-file:v1:";

/** เพดานอายุลิงก์ — 15 นาที (บังคับทั้งตอนออกใบและตอนตรวจใบ) */
export const PRIVATE_FILE_MAX_TTL_SEC = 900;

/** ที่อยู่ของ route ที่สตรีมไฟล์ — ประกาศที่เดียว ผู้ออกใบและด่านตรวจใช้ค่าเดียวกัน */
export const PRIVATE_FILE_ROUTE = "/api/files";

/**
 * รูปของ `FileAsset.id` (cuid) — ใช้เป็นด่านแรกของ route
 * 🔴 `id` เป็น "รหัสแถว" ไม่ใช่ "ที่อยู่ไฟล์": อะไรที่ไม่ใช่รูปนี้ (มี `/` · มี `..` · มี `%2F`)
 *    ต้องตกที่ 404 ตั้งแต่ก่อนแตะลายเซ็นหรือฐานข้อมูล
 */
export const FILE_ASSET_ID_RE = /^[a-z0-9]{16,40}$/i;

/** ผู้ดูที่ลิงก์ผูกไว้ — พนักงาน (User.id) หรือ session ลูกค้า (Customer.id) */
export type PrivateFileViewer = { kind: "STAFF" | "CUSTOMER"; id: string };

/** คีย์ของผู้ดูที่เข้าไปอยู่ในลายเซ็น (`STAFF:<userId>` / `CUSTOMER:<customerId>`) */
export function privateFileViewerKey(viewer: PrivateFileViewer): string {
  const kind = viewer?.kind;
  const id = typeof viewer?.id === "string" ? viewer.id.trim() : "";
  if ((kind !== "STAFF" && kind !== "CUSTOMER") || !id) {
    throw new Error("ผู้ดูไฟล์ไม่ถูกต้อง — ต้องระบุ { kind: 'STAFF' | 'CUSTOMER', id }");
  }
  return `${kind}:${id}`;
}

// กุญแจลายเซ็น — อ่าน **ตอนเรียก** ไม่ใช่ตอน import
// 🔴 ห้าม `import { env } from "@/lib/env"` ที่หัวไฟล์: ไฟล์นี้ถูกดึงต่อจาก `storage/service`
//    ซึ่งทะเบียน op ของบอร์ดงาน import อยู่ ⇒ ด่าน `pnpm fitness` (รันแบบไม่มี env) จะล้มทั้งด่าน
//    (บทเรียนเดิม: reference_shark_precommit_fitness_no_env)
// 🔴 ไม่มีค่าสำรองใด ๆ (`?? ""` / `|| "dev"`) — ตั้งค่าไม่ครบ = ออกลิงก์ไม่ได้ ไม่ใช่ออกลิงก์ที่ปลอมได้
function signingSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("ไม่ได้ตั้งค่า SESSION_SECRET — ออกลิงก์ไฟล์ส่วนตัวไม่ได้");
  }
  return `${HMAC_KEY_LABEL}${secret}`;
}

/**
 * ลายเซ็นดิบ (hex) ของ (fileId, exp, viewer)
 *
 * 🔴 ข้อความที่เซ็นคือ `${fileId}.${exp}.${viewerKey}` และมันอ่านกลับได้ชัดเจนไม่กำกวม
 *    **เพราะชุดอักขระของแต่ละช่องไม่มี `.`**: `fileId` ผ่าน `FILE_ASSET_ID_RE` (a-z0-9 ล้วน) ·
 *    `exp` เป็นตัวเลขล้วน · `viewerKey` เป็น `STAFF:`/`CUSTOMER:` + id ที่เป็น cuid
 *    ⇒ ไม่มีทางย้ายตัวอักษรข้ามช่องให้ได้ข้อความเดียวกันจากคนละ (id, exp, viewer)
 *    ใครจะขยายชุดอักขระของช่องไหนให้มี `.` ได้ ต้องเปลี่ยนมาเป็นแบบนำหน้าด้วยความยาวก่อน
 */
export function signPrivateFile(fileId: string, exp: number, viewer: PrivateFileViewer): string {
  return createHmac("sha256", signingSecret())
    .update(`${fileId}.${exp}.${privateFileViewerKey(viewer)}`)
    .digest("hex");
}

/**
 * ออกลิงก์ชั่วคราวให้ผู้ดูคนหนึ่งเปิดไฟล์ส่วนตัวหนึ่งใบ (ฝั่งเซิร์ฟเวอร์เท่านั้น)
 *
 * 🔴 **ไม่ตรวจสิทธิ์ว่าใครควรได้ลิงก์** — นั่นเป็นหน้าที่ของโมดูลที่เรียก (CRM ใช้ `canSee` ของตัวเอง)
 *    ที่นี่รับประกันแค่ว่า "ใบผ่านนี้ใช้ได้กับไฟล์นี้ · คนนี้ · ภายใน 15 นาที" เท่านั้น
 * 🔴 `ttlSec` ที่ขอมาเกินเพดานถูกตัดลงเงียบ ๆ (ไม่ใช่ error): ผู้เรียกที่ขอ 1 ชั่วโมงต้องไม่ได้ 1 ชั่วโมง
 */
export function privateFileUrl(
  fileId: string,
  viewer: PrivateFileViewer,
  ttlSec?: number,
): string {
  const id = typeof fileId === "string" ? fileId.trim() : "";
  if (!FILE_ASSET_ID_RE.test(id)) throw new Error("รหัสไฟล์ไม่ถูกต้อง");
  const asked =
    typeof ttlSec === "number" && Number.isFinite(ttlSec)
      ? Math.floor(ttlSec)
      : PRIVATE_FILE_MAX_TTL_SEC;
  const ttl = Math.min(Math.max(asked, 1), PRIVATE_FILE_MAX_TTL_SEC);
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const sig = signPrivateFile(id, exp, viewer);
  return `${PRIVATE_FILE_ROUTE}/${encodeURIComponent(id)}?exp=${exp}&sig=${sig}`;
}

/**
 * ตรวจใบผ่านที่ route ได้รับ — ผิดข้อไหนก็ตาม = false (ไม่บอกว่าผิดข้อไหน)
 *
 * 🔴 เพดาน 15 นาทีถูกตรวจ **ซ้ำที่นี่** ไม่ใช่เชื่อว่าผู้ออกใบตัดให้แล้ว:
 *    ใครก็ตามที่เรียก `signPrivateFile` ได้ในอนาคต (บั๊ก · เครื่องมือ AI) ต้องยังออกลิงก์อมตะไม่ได้
 * 🔴 เทียบแบบ timing-safe — เทียบด้วย `===` หรือเทียบแค่ prefix = ปล่อยให้ไล่เดาลายเซ็นทีละตัว
 */
export function privateFileSignatureOk(
  fileId: string,
  expRaw: string | null,
  sigRaw: string | null,
  viewer: PrivateFileViewer,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  const sig = (sigRaw ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sig)) return false;
  const expText = (expRaw ?? "").trim();
  if (!/^\d{1,12}$/.test(expText)) return false;
  const exp = Number(expText);
  if (!Number.isSafeInteger(exp)) return false;
  if (exp <= nowSec) return false; // หมดอายุแล้ว
  if (exp - nowSec > PRIVATE_FILE_MAX_TTL_SEC) return false; // เกินเพดาน = ใบปลอม/ใบที่ยืดเอง
  let want = "";
  try {
    want = signPrivateFile(fileId, exp, viewer);
  } catch {
    return false;
  }
  return safeEqualHex(want, sig);
}
