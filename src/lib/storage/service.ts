// Object storage (WO-0024) — โลโก้/ไฟล์แนบของร้าน เก็บบน Bunny (env SHARK_BUNNY_*)
//
// หลักการ: เปิดเฉพาะเมื่อมี env ครบ · ไม่มี env = ปิดอย่างสุภาพ (คืน ok:false ข้อความไทย)
// ห้าม throw ทุกทาง — คืน { ok:false, error:ไทย } เสมอ เพื่อให้ UI จัดการต่อได้
//
// การเก็บไฟล์: PUT https://sg.storage.bunnycdn.com/<zone>/<path> header AccessKey
// (ข้อสอบฉีด deps.put แทน เพื่อไม่ยิงจริง) · cdnUrl = <SHARK_BUNNY_CDN>/<path>

import { randomBytes } from "node:crypto";
import { tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import type { FileKind } from "@prisma/client";
import {
  parseStoragePath,
  storageLogRef,
  storagePathForTenant,
  STORAGE_PRIVATE_FOLDER,
} from "./paths";

// ตัวตรวจที่อยู่ไฟล์ = ชุดเดียวของทั้งระบบ (ดูเหตุผลเต็มใน `paths.ts`)
export {
  parseStoragePath,
  storagePathForTenant,
  STORAGE_PRIVATE_FOLDER,
} from "./paths";
export type { ParsedStoragePath } from "./paths";

// ── ไฟล์ส่วนตัว (ใบ CRM v2 C0.4 · มติ C17) — ทางออกทางเดียวคือ route ที่ตรวจสิทธิ์ ──
export {
  FILE_ASSET_ID_RE,
  PRIVATE_FILE_MAX_TTL_SEC,
  PRIVATE_FILE_ROUTE,
  privateFileSignatureOk,
  privateFileUrl,
  privateFileViewerKey,
  signPrivateFile,
} from "./private-links";
export type { PrivateFileViewer } from "./private-links";

// ชนิดไฟล์ที่อนุญาต → นามสกุลไฟล์ (ext) ที่ใช้ประกอบ path
//
// 🔴 ตารางนี้เป็น **ตัวเดียวกัน**กับด่านอนุญาต: mime ที่ไม่มีในนี้ = ปฏิเสธ ⇒ ไม่มีทางตกเป็น `.bin`
//    (ต่างจาก `siamdive2/src/lib/bunny.ts:46` ที่ `|| "bin"` ทำให้ไฟล์ที่รับแล้วได้นามสกุลผิด
//     แล้ว CDN เสิร์ฟเป็น octet-stream → ผู้ใช้กดแล้วดาวน์โหลดแทนที่จะเปิด)
//    เพิ่ม mime ใหม่เมื่อไหร่ **ต้องใส่ ext จริง** — ข้อสอบ qc-chat-api-v1 (CA-7) คอยจับ
//
// ชุดที่รองรับ = ของเดิมของ SHARK + ของที่ SiamDive ใช้อยู่จริง (support-chat/upload/route.ts:17)
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  // โลโก้กิจการ (ธีม B2) รับ SVG ได้ — validateLogoFile กรอง <script>/onXXX=/javascript: ไปแล้วก่อนถึงนี่
  "image/svg+xml": "svg",
  "image/heic": "heic", // รูปจาก iPhone (ค่าเริ่มต้นของกล้อง iOS)
  "image/heif": "heif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
  // ── เสียง (WO-CV8 ข้อความเสียง) ──
  // 🔴 นามสกุลต้องถูกจริง ไม่ใช่แค่ผ่านด่านอนุญาต: Bunny เสิร์ฟ Content-Type จาก **นามสกุล**
  //    ไฟล์ที่ลงท้าย .bin กลายเป็น octet-stream ⇒ ลูกค้ากดฟองเสียงแล้วได้หน้าต่างดาวน์โหลดแทนการเล่น
  // 🔴 ต้องมีทั้ง 2 ฝั่งของโลกเบราว์เซอร์ ไม่ใช่แค่ webm:
  //    · Chrome/Android อัดออกมาเป็น `audio/webm;codecs=opus`
  //    · Safari/iOS อัด webm ไม่ได้เลย ได้แค่ `audio/mp4` (คอนเทนเนอร์ m4a) — ครึ่งหนึ่งของผู้ใช้ไทย
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  // WAV = ทางลงที่ "เล่นได้ทุกเครื่อง" ของตัวอัด (2 ก.ย. — iOS เล่น webm ไม่ได้ ดู PLAN-CHAT-V2 D29)
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

/**
 * ตัดพารามิเตอร์ท้าย mime ให้เทียบกับตารางได้ (`audio/webm;codecs=opus` → `audio/webm`)
 *
 * 🔴 MediaRecorder คืน mime **พร้อม codec เสมอ** ⇒ เทียบดิบ ๆ จะไม่มีวันตรงตาราง
 *    แล้วเสียงที่อัดสำเร็จจะถูกปฏิเสธที่ด่านอัปโหลดโดยที่ผู้ใช้ไม่รู้ว่าทำอะไรผิด
 *    (ประกาศที่นี่ที่เดียว — ชั้น action/route ต้องเรียกตัวนี้ ห้ามเขียน `split(";")` ซ้ำเอง)
 */
export function normalizeUploadType(raw: string | null | undefined): string {
  return (raw ?? "").split(";")[0]!.trim().toLowerCase();
}

/** ชนิดนี้เป็น "เสียง" ไหม (ใช้ตัดสินว่าเป็นข้อความเสียงได้) */
export function isAudioUploadType(raw: string | null | undefined): boolean {
  const t = normalizeUploadType(raw);
  return t.startsWith("audio/") && t in ALLOWED_TYPES;
}

export const ALLOWED_UPLOAD_TYPES = Object.freeze({ ...ALLOWED_TYPES });

const MAX_BYTES = 5 * 1024 * 1024; // 5MB — ค่าตั้งต้นของทั้งระบบ (โลโก้/รูปสินค้า)
/** เพดานไฟล์แนบในแชท — SiamDive ใช้ 10MB อยู่แล้ว ลดลงมา = ผู้ใช้เดิมส่งไฟล์ไม่ผ่าน */
export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

const BUNNY_HOST = "https://sg.storage.bunnycdn.com";

type StorageCtx = { tenantId: string };

// ═══════════════════════════════════════════════════════════════
// ไฟล์ส่วนตัว (ใบ CRM v2 C0.4 · มติ C17 · ภาคผนวกผู้คุมงาน 17 ก.ย.)
//
// AUDIT-CLASS X10: CRM จะเก็บเสียงบันทึกการโทร · ไฟล์แนบอีเมลขาเข้า · สัญญา · สลิปโอนเงิน
//   ของพวกนี้ **ห้ามมี URL CDN ถาวร** — ไม่ว่าใน DTO ใน DB หรือใน log
//
// 🔴 ความเป็นส่วนตัวถูกแบกด้วย **path** ไม่ใช่ `kind`
//    (`FileAsset.kind` เป็น enum `FileKind` → เก็บ `"private:xxx"` ไม่ได้ และใบนี้ไม่ใช่ใบ migration
//     ⇒ ข้อเสนอ "kind ขึ้นต้น private:" ใน RESOLUTIONS R-E 2 ทำไม่ได้จริง — ผู้คุมงานตัดสินใหม่แล้ว)
//    · สาธารณะ: `t/<tenantId>/<kind ตัวเล็ก>/<32 hex>.<ext>`   (ของเดิม ห้ามขยับแม้แต่ไบต์เดียว)
//    · ส่วนตัว : `t/<tenantId>/private/<40 hex จาก CSPRNG>.<ext>`
//
// 🔴 `cdnUrl` เป็น NOT NULL ⇒ แถวส่วนตัวเก็บ **ค่าหมายที่ไม่ใช่ URL** (`private://<path>`)
//    เหตุผล: ไม่มีทางที่โค้ดตรงไหนจะ "เผลอ" ส่ง URL ที่ใช้ได้ออกไป และ grep หาโดเมน CDN
//    ทั้งตารางจะไม่เจอแถวส่วนตัวเลยสักแถว
//
// ⚠️ ความเสี่ยงที่ **ยังปิดไม่ได้ในรอบนี้** (บันทึกเป็นหนี้ ไม่ใช่ของที่ใบนี้ต้องแก้):
//    pull zone ของ Bunny เสิร์ฟทั้ง storage zone และการตั้ง zone rule / token auth ต้องใช้
//    `BUNNY_ACCOUNT_KEY` ซึ่ง RUN นี้ยังไม่มี ⇒ วัตถุส่วนตัวยัง "โหลดได้ถ้ารู้ URL เป๊ะ ๆ"
//    เกราะของเราคือ URL นั้นไม่เคยถูกสร้าง ไม่เคยถูกเก็บ และไม่เคยถูกคืนออกไป
// ═══════════════════════════════════════════════════════════════

/** ระดับการเข้าถึงของไฟล์ที่อัป — ไม่ส่ง = `"public"` (พฤติกรรมเดิมทุกประการ) */
export type FileVisibility = "public" | "private";

/** ส่วนของ path ที่เป็นเครื่องหมายว่า "ส่วนตัว" */
export const PRIVATE_PATH_SEGMENT = STORAGE_PRIVATE_FOLDER;

/** คำนำหน้าของค่าหมายใน `cdnUrl` ของแถวส่วนตัว — จงใจ **ไม่ใช่** http(s) */
export const PRIVATE_URL_PREFIX = "private://";

/**
 * path นี้เป็นไฟล์ส่วนตัวไหม
 * 🔴 ตัดสินจากตัวแยกบัญชีขาวตัวเดียวกับทุกด่าน — ไม่ใช่ regex ของตัวเอง:
 *    `t/A/private/%2e%2e/%2e%2e/t/B/x` เคยผ่าน regex เก่าเพราะมันดูแค่คำนำหน้า
 */
export function isPrivateStoragePath(path: string | null | undefined): boolean {
  return parseStoragePath(path)?.isPrivate === true;
}

/** ค่าใน `cdnUrl` นี้เป็นค่าหมายของไฟล์ส่วนตัวไหม (ไม่ใช่ URL) */
export function isPrivateFileUrl(cdnUrl: string | null | undefined): boolean {
  return (cdnUrl ?? "").trim().startsWith(PRIVATE_URL_PREFIX);
}

export type UploadInput = {
  kind: FileKind;
  filename: string;
  contentType: string;
  data: Uint8Array;
  /** เพดานขนาดเฉพาะงานนี้ (ไม่ส่ง = 5MB ตามค่าตั้งต้นของระบบ) — แชทส่ง 10MB */
  maxBytes?: number;
  /**
   * `"private"` = เก็บใต้ `t/<tenantId>/private/…` และ **ไม่คืน URL ที่ใช้ได้**
   * ไม่ส่ง = `"public"` ⇒ ผู้เรียกเดิมทุกรายได้ผลลัพธ์เดิมเป๊ะ (โลโก้ · แชท · บัญชี · บอร์ดงาน)
   */
  visibility?: FileVisibility;
};

export type UploadDeps = {
  // ฉีดได้ (ข้อสอบ/เทส) — แทนการยิง Bunny จริง
  put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>;
};

export type UploadResult =
  | { ok: true; cdnUrl: string; assetId: string }
  | { ok: false; error: string };

// env ครบทั้ง 3 ตัว = storage เปิด
export function storageEnabled(): boolean {
  return Boolean(
    process.env.SHARK_BUNNY_ZONE &&
      process.env.SHARK_BUNNY_KEY &&
      process.env.SHARK_BUNNY_CDN,
  );
}

// ตัด trailing slash ของ CDN host กันเกิด // ซ้อน
function cdnBase(): string {
  return (process.env.SHARK_BUNNY_CDN ?? "").replace(/\/+$/, "");
}

// สร้าง id สั้น ๆ สำหรับชื่อไฟล์ (ไม่พึ่ง default cuid เพราะต้องรู้ path ก่อน create)
function newId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "");
}

/**
 * ชื่อไฟล์ของวัตถุส่วนตัว — 20 ไบต์จาก CSPRNG = 160 บิต (เพดานของใบนี้คือ ≥128)
 *
 * 🔴 ห้ามมาจาก `FileAsset.id`: ใครเคยเห็น id (DTO · log · URL) จะเดาที่อยู่ไฟล์ได้ทันที
 * 🔴 ห้ามเรียงตามเวลา (cuid/ULID/timestamp): รู้ชื่อหนึ่งใบ = รู้ว่าเพื่อนบ้านอยู่แถวไหน
 * 🔴 ห้าม `Math.random()` — V8 ใช้ xorshift128+ ดูผลไม่กี่ค่าก็คำนวณค่าถัดไปได้
 *    (กติกาเดียวกับ `core/hash.randomCode`) ชื่อไฟล์คือเกราะทั้งหมดของวัตถุส่วนตัว
 */
function newPrivateObjectName(): string {
  return randomBytes(20).toString("hex");
}

/**
 * อัปโหลดไฟล์ 1 ชิ้น → เก็บบน storage + บันทึก FileAsset (tenant-scoped)
 * ห้าม throw — ทุก error คืน { ok:false, error:ไทย }
 */
export async function uploadFile(
  ctx: StorageCtx,
  input: UploadInput,
  deps?: UploadDeps,
): Promise<UploadResult> {
  try {
    const put = deps?.put;

    // ปิดอยู่: ไม่มี env และไม่มี deps.put ฉีดมา
    if (!put && !storageEnabled()) {
      return { ok: false, error: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (storage) — ติดต่อผู้ดูแลระบบ" };
    }

    // ตรวจชนิดไฟล์ (ตารางเดียวกับที่ใช้เลือกนามสกุล — ไม่มีในตาราง = ไม่รับ)
    // 🔴 normalize ก่อนเทียบ — `audio/webm;codecs=opus` ที่ MediaRecorder ส่งมาต้องหาตารางเจอ
    const ext = ALLOWED_TYPES[normalizeUploadType(input.contentType)];
    if (!ext) {
      return {
        ok: false,
        error:
          `ชนิดไฟล์นี้อัปโหลดไม่ได้ — ชนิดที่รับตอนนี้คือ ${[...new Set(Object.values(ALLOWED_TYPES))].join("/")}`, // ลิสต์จากทะเบียน ไม่พิมพ์มือ (ของเดิมตกยุค ไม่มี wav)
      };
    }

    // ตรวจขนาด
    const maxBytes = input.maxBytes ?? MAX_BYTES;
    if (input.data.length > maxBytes) {
      return {
        ok: false,
        error: `ไฟล์ใหญ่เกิน ${Math.round(maxBytes / (1024 * 1024))}MB — กรุณาย่อขนาดก่อนอัปโหลด`,
      };
    }

    // ประกอบ path
    //  · สาธารณะ (ค่าตั้งต้น): t/<tenantId>/<kind ตัวเล็ก>/<id>.<ext>  ← ของเดิม ห้ามเปลี่ยน
    //  · ส่วนตัว           : t/<tenantId>/private/<ชื่อสุ่ม>.<ext> + cdnUrl เป็นค่าหมาย ไม่ใช่ URL
    const isPrivate = input.visibility === "private";
    const path = isPrivate
      ? `t/${ctx.tenantId}/${PRIVATE_PATH_SEGMENT}/${newPrivateObjectName()}.${ext}`
      : `t/${ctx.tenantId}/${input.kind.toLowerCase()}/${newId()}.${ext}`;
    const cdnUrl = isPrivate ? `${PRIVATE_URL_PREFIX}${path}` : `${cdnBase()}/${path}`;

    // อัปขึ้น storage — ฉีด deps.put ได้ (เทส) มิฉะนั้นยิง Bunny จริง
    if (put) {
      await put(path, input.data, input.contentType);
    } else {
      const res = await fetch(`${BUNNY_HOST}/${process.env.SHARK_BUNNY_ZONE}/${path}`, {
        method: "PUT",
        headers: {
          AccessKey: process.env.SHARK_BUNNY_KEY ?? "",
          "Content-Type": input.contentType,
        },
        // Uint8Array ใช้เป็น body ได้จริง แต่ TS DOM lib ไม่รับ view type ตรง ๆ — ส่ง ArrayBuffer ก้อนที่ copy แล้ว
        body: input.data.slice().buffer as ArrayBuffer,
      });
      if (!res.ok) {
        return { ok: false, error: "อัปโหลดไปที่เก็บไฟล์ไม่สำเร็จ — กรุณาลองใหม่" };
      }
    }

    // บันทึก FileAsset (tenantDb inject tenantId ให้อัตโนมัติ — ใส่ตรง ๆ ให้ type ผ่าน)
    const asset = await tenantDb(ctx).fileAsset.create({
      data: {
        tenantId: ctx.tenantId,
        kind: input.kind,
        path,
        cdnUrl,
        contentType: input.contentType,
        bytes: input.data.length,
      },
    });

    return { ok: true, cdnUrl, assetId: asset.id };
  } catch (e) {
    // เน็ตหลุด/DB ล่ม — ปิดสุภาพ ไม่ให้ throw ทะลุขึ้น UI
    // 🔴 แต่ต้อง "เงียบต่อผู้ใช้ ไม่เงียบต่อเรา": catch เปล่า ๆ ทำให้ 27 ส.ค. ไล่หาสาเหตุอยู่นาน
    //    ทั้งที่ FileAsset ในระบบจริงเป็น 0 แถวมาตลอด = อัปโหลดไม่เคยสำเร็จเลยสักครั้ง
    await logOps("ERROR", "storage.upload", "อัปโหลดไฟล์ไม่สำเร็จ", {
      tenantId: ctx.tenantId,
      detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    });
    return { ok: false, error: "อัปโหลดไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง" };
  }
}

// ═══════════════════════════════════════════════════════════════
// ลบไฟล์จริงบน storage (WO-CV9 · ปิดหนี้ PDPA ที่ retention.ts ประกาศไว้)
//
// เหตุ: `purgeExpiredChatMessages` ล้างแค่ `url`/`fileName` ในฐานข้อมูล
//       แต่ **วัตถุจริงบน Bunny ยังเสิร์ฟได้ตามเดิม** — ใครมี url เก่าอยู่ในมือก็ยังเปิดฟัง/ดูรูปได้ตลอดกาล
//       ⇒ "ลบตามอายุเก็บ" ที่ประกาศไว้หน้า /privacy ยังไม่จริงจนกว่าไฟล์จะหายด้วย
//
// 🔴 best-effort โดยเจตนา: ห้าม throw · ห้ามทำให้การล้างฟิลด์ในฐานข้อมูลไม่เกิด
//    ความเป็นส่วนตัวระดับ DB ต้องเกิดเสมอ แม้ CDN จะลบไม่สำเร็จ (ผู้เรียกล้างฟิลด์ต่อได้ทันที)
//    แต่ "เงียบต่อผู้ใช้ ≠ เงียบต่อเรา" — ลบไม่สำเร็จต้องลง OpsEvent (แพตเทิร์นเดียวกับ uploadFile)
//
// ⚠️ ข้อจำกัดที่ยังปิดไม่ได้ในรอบนี้ — **CDN edge cache**
//    Bunny ลบวัตถุที่ Storage Zone ทันที แต่ edge ที่เคยแคชไฟล์ไว้ยังเสิร์ฟต่อได้จนกว่าจะหมดอายุ
//    (ของจริงตอนนี้ `cache-control: public, max-age=2592000` = 30 วัน)
//    การ purge ราย URL ต้องยิง https://api.bunny.net/purge ด้วย **account key** (คีย์ระดับบัญชี)
//    ซึ่ง `SHARK_BUNNY_KEY` ไม่ใช่ (นั่นคือ storage-zone password) ⇒ ต้องตั้ง env `BUNNY_ACCOUNT_KEY` เพิ่ม
//    โค้ดข้างล่างเผื่อไว้แล้ว: มี env → ยิง purge ให้ · ไม่มี → ข้ามเงียบ ๆ (ไม่ถือว่าลบล้มเหลว)
// ═══════════════════════════════════════════════════════════════

export type DeleteResult = { ok: true; skipped?: false } | { ok: false; reason: string };

export type DeleteDeps = {
  /** ฉีดได้ (ข้อสอบ) — คืน status code ที่ storage ตอบกลับ */
  del?: (path: string) => Promise<number>;
  /** ฉีดได้ (ข้อสอบ) — purge edge cache ราย URL */
  purge?: (cdnUrl: string) => Promise<void>;
};

/**
 * แปลง cdnUrl → path บน storage zone (ส่วนหลัง `SHARK_BUNNY_CDN/`)
 * คืน null เมื่อ url ไม่ได้อยู่ใต้ CDN ของเรา (ไฟล์ของ provider อื่น เช่นรูปจาก LINE — ห้ามไปยุ่ง)
 */
export function storagePathFromCdnUrl(cdnUrl: string | null | undefined): string | null {
  const url = (cdnUrl ?? "").trim();
  if (!url) return null;

  // ── แถวส่วนตัว (C0.4): `cdnUrl` เก็บค่าหมาย `private://<path>` ไม่ใช่ URL ──
  // 🔴 ต้องเข้าใจค่าหมายด้วย ไม่ใช่แค่ URL ของ CDN: เส้นทางลบตาม PDPA (C3.9) ยื่น "อะไรก็ตาม
  //    ที่อยู่ในคอลัมน์ cdnUrl" มาให้ — เข้าใจไม่ได้ = ข้ามแถวส่วนตัวเงียบ ๆ = ไฟล์ค้างตลอดกาล
  if (url.startsWith(PRIVATE_URL_PREFIX)) {
    const raw = url.slice(PRIVATE_URL_PREFIX.length).split(/[?#]/)[0] ?? "";
    // บัญชีขาว + บังคับว่าต้องเป็นโฟลเดอร์ `private` จริง (ค่าหมายที่ถูกแต่งมาต้องออกนอกกรุไม่ได้)
    const parsed = parseStoragePath(raw);
    return parsed?.isPrivate === true ? parsed.path : null;
  }

  const base = cdnBase();
  if (!base) return null;
  if (!url.startsWith(`${base}/`)) return null;
  // ตัด query/hash ออกก่อน (ลิงก์ที่มี ?v= ติดมาต้องไม่กลายเป็นชื่อไฟล์คนละตัว)
  const raw = url.slice(base.length + 1).split(/[?#]/)[0] ?? "";
  // 🔴 บัญชีขาว ไม่ใช่บัญชีดำ `..`: `%2e%2e` ไม่มี `..` อยู่ในสตริง แต่ `fetch()` คลายให้ทีหลัง
  //    ⇒ เทียบกับรูปที่อนุญาตเท่านั้น และคืน "เส้นทางที่ประกอบใหม่" ไม่ใช่สตริงดิบของผู้เรียก
  return parseStoragePath(raw)?.path ?? null;
}

/**
 * ลบไฟล์ 1 ชิ้นออกจาก storage จริง — ห้าม throw ทุกทาง
 *
 * - ไม่มี env (และไม่ได้ฉีด deps) → `{ ok:false, reason }` **เงียบ ๆ** ไม่ลง OpsEvent
 *   (สภาพแวดล้อมที่ไม่ได้ตั้ง storage เช่น dev/CI ไม่ควรทำให้ log เต็มไปด้วย error ที่ไม่มีใครแก้ได้)
 * - 404 = ถือว่าสำเร็จ: ไฟล์ไม่อยู่แล้วคือปลายทางที่เราต้องการ ⇒ **รันซ้ำได้ (idempotent)**
 * - ลบไม่สำเร็จจริง ๆ (5xx/403/เน็ตหลุด) → ok:false + OpsEvent ERROR (มีคนต้องตามเก็บ)
 */
export async function deleteStoredFile(
  cdnUrl: string | null | undefined,
  opts?: { tenantId?: string },
  deps?: DeleteDeps,
): Promise<DeleteResult> {
  const url = (cdnUrl ?? "").trim();
  if (!url) return { ok: false, reason: "ไม่มี url ของไฟล์" };

  const path = storagePathFromCdnUrl(url);
  if (!path) {
    // ไม่มี env และไม่ได้ฉีด deps → ตอบเหมือนเดิม (ลำดับคำตอบของของเดิมต้องไม่สลับ)
    if (!deps?.del && !storageEnabled()) {
      return { ok: false, reason: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (storage)" };
    }
    return { ok: false, reason: "ไม่ใช่ไฟล์บนที่เก็บของเราเอง — ไม่แตะ" };
  }

  // แถวส่วนตัวไม่เคยมี URL บน edge ⇒ ไม่ต้อง purge (และค่าหมายก็ purge ไม่ได้อยู่แล้ว)
  return deleteStoredPath(
    path,
    { tenantId: opts?.tenantId, purgeUrl: isPrivateFileUrl(url) ? null : url },
    deps,
  );
}

/**
 * ลบวัตถุจริงจาก path ที่รู้แน่ ๆ แล้ว (ใช้ภายใน + จาก `deleteFileAsset`)
 *
 * 🔴 ยื่น **path จริงของแถว** เท่านั้น ห้ามยื่นค่าหมายหรือ id — และกัน `..` อีกชั้นที่นี่
 *    เผื่อผู้เรียกในอนาคตประกอบ path เอง (ด่านเดียวไม่พอเมื่อมีทางเข้าสองทาง)
 */
async function deleteStoredPath(
  rawPath: string,
  opts?: { tenantId?: string; purgeUrl?: string | null; logRef?: string },
  deps?: DeleteDeps,
): Promise<DeleteResult> {
  // 🔴 ด่านข้ามร้าน (BLOCKER 2 ของการตรวจ 18 ก.ย. — เกิดได้จริงบน production วันนี้):
  //    ของเดิมรับ `^t/<อะไรก็ได้>/` แล้วเอา `tenantId` ไปใส่แค่บรรทัด log
  //    ⇒ ร้าน A เอา URL โลโก้ของร้าน B (พิมพ์อยู่บนหน้าร้านสาธารณะ) มาแปะเป็นไฟล์แนบในแชท
  //      พอ `chat/retention.ts` กวาดตามอายุเก็บ วัตถุของร้าน B ก็หายไปจากที่เก็บ — ไม่ต้องใช้ `..`
  //    ตอนนี้ tenantId เป็น **ด่าน**: ไม่ส่งมา หรือส่งมาไม่ตรงกับ path = ไม่แตะไฟล์
  const path = storagePathForTenant(rawPath, opts?.tenantId);
  if (!path) {
    return { ok: false, reason: "ที่อยู่ไฟล์ไม่ตรงกับร้านเจ้าของ — ไม่แตะ" };
  }
  // สิ่งที่เขียนลง log: ไฟล์ส่วนตัวตัดชื่อไฟล์ทิ้งเสมอ (ชื่อสุ่ม = เกราะทั้งหมดของมัน)
  const ref = opts?.logRef ?? storageLogRef(parseStoragePath(path)!);

  const del = deps?.del;
  if (!del && !storageEnabled()) {
    return { ok: false, reason: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (storage)" };
  }

  let status = 0;
  try {
    if (del) {
      status = await del(path);
    } else {
      const res = await fetch(`${BUNNY_HOST}/${process.env.SHARK_BUNNY_ZONE}/${path}`, {
        method: "DELETE",
        headers: { AccessKey: process.env.SHARK_BUNNY_KEY ?? "" },
      });
      status = res.status;
    }
  } catch (e) {
    await logOps("ERROR", "storage.delete", "ลบไฟล์บนที่เก็บไม่สำเร็จ (เน็ตเวิร์ก)", {
      tenantId: opts?.tenantId,
      detail: `${ref} · ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`,
    });
    return { ok: false, reason: "ต่อที่เก็บไฟล์ไม่ได้" };
  }

  // 404 = ไม่มีไฟล์นั้นแล้ว → ปลายทางเดียวกับลบสำเร็จ (รันซ้ำแล้วต้องไม่แดง)
  if (!((status >= 200 && status < 300) || status === 404)) {
    await logOps("ERROR", "storage.delete", "ลบไฟล์บนที่เก็บไม่สำเร็จ", {
      tenantId: opts?.tenantId,
      detail: `${ref} · HTTP ${status}`,
    });
    return { ok: false, reason: `ที่เก็บไฟล์ตอบ HTTP ${status}` };
  }

  // ── purge edge cache (เผื่อไว้ · ไม่มี account key = ข้าม ไม่ถือว่าล้มเหลว) ──
  // ไฟล์ส่วนตัวไม่เคยถูกเสิร์ฟผ่าน CDN (เราอ่านจาก storage host ตรง ๆ) → `purgeUrl` เป็น null
  const purgeUrl = opts?.purgeUrl ?? null;
  try {
    const purge = deps?.purge;
    if (purge && purgeUrl) {
      await purge(purgeUrl);
    } else if (purgeUrl && process.env.BUNNY_ACCOUNT_KEY) {
      await fetch(`https://api.bunny.net/purge?url=${encodeURIComponent(purgeUrl)}&async=false`, {
        method: "POST",
        headers: { AccessKey: process.env.BUNNY_ACCOUNT_KEY },
      });
    }
  } catch {
    // purge ล้มไม่ทำให้การลบล้มเหลว — วัตถุต้นทางหายไปแล้ว เหลือแค่ edge ที่จะหมดอายุเอง
  }

  return { ok: true };
}

/**
 * ลบไฟล์ 1 ใบ **ทั้งสองซีก**: แถว `FileAsset` และวัตถุจริงบนที่เก็บ (ใบ C0.4 · ข้อ 2 ของภาคผนวก)
 *
 * 🔴 นี่คือฟังก์ชันเดียวที่เส้นทางลบตาม PDPA (C3.9) และงานล้างตามอายุเก็บต้องเรียก:
 *    ลบแถวอย่างเดียว = เสียงบันทึกการโทรยังนอนอยู่ในถังตลอดกาล (หนี้ที่ใบนี้มาปิด)
 * 🔴 ที่อยู่ที่ยื่นให้ที่เก็บคือ `path` **ของแถว** ไม่ใช่ค่าหมายใน `cdnUrl` และไม่ใช่ `id`
 * 🔴 ร้านถูก re-resolve จาก `ctx` ผ่าน `tenantDb` (AUDIT-CLASS X1): ร้านอื่นสั่งลบไม่ได้
 *    และไม่ได้คำตอบที่บอกว่า "มีไฟล์นี้อยู่จริง" (ไม่พบในร้านตัวเอง = จบแบบเดียวกับลบแล้ว)
 * 🔴 เรียกซ้ำได้ (งานลบ/งาน retry รันซ้ำโดยออกแบบ) — ไม่มีแถว = `ok:true`
 */
export async function deleteFileAsset(
  ctx: StorageCtx,
  assetId: string,
  deps?: DeleteDeps,
): Promise<DeleteResult> {
  const id = typeof assetId === "string" ? assetId.trim() : "";
  if (!id) return { ok: false, reason: "ไม่ได้ระบุไฟล์ที่จะลบ" };

  let asset: { id: string; path: string; cdnUrl: string } | null = null;
  try {
    asset = await tenantDb(ctx).fileAsset.findFirst({
      where: { id },
      select: { id: true, path: true, cdnUrl: true },
    });
  } catch (e) {
    await logOps("ERROR", "storage.delete", "อ่านทะเบียนไฟล์ไม่สำเร็จก่อนลบ", {
      tenantId: ctx.tenantId,
      detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    });
    return { ok: false, reason: "อ่านทะเบียนไฟล์ไม่ได้" };
  }
  if (!asset) return { ok: true }; // ไม่มี/ไม่ใช่ของร้านนี้ = ปลายทางเดียวกับลบแล้ว

  // 🔴 ผู้ใช้ร่วมวัตถุเดียวกัน — `modules/kanban/links.ts:370` สร้าง `FileAsset` **แถวที่สอง**
  //    ที่ชี้ไป path เดิมโดยเจตนา (แนบไฟล์เดิมซ้ำในการ์ดอื่น) · `chat/retention.ts:211` กันเคสนี้
  //    อยู่แล้วฝั่งแชท ⇒ ที่นี่ต้องกันด้วย ไม่งั้นลบการ์ดใบเดียว = รูปหายจากอีกสิบการ์ด
  //    เจอผู้ใช้ร่วม → ลบแค่แถวนี้ ไม่แตะวัตถุ
  const sharers = await tenantDb(ctx).fileAsset.count({
    where: { path: asset.path, id: { not: asset.id } },
  });
  if (sharers > 0) {
    try {
      await tenantDb(ctx).fileAsset.deleteMany({ where: { id: asset.id } });
    } catch (e) {
      await logOps("ERROR", "storage.delete", "ลบทะเบียนไฟล์ไม่สำเร็จ", {
        tenantId: ctx.tenantId,
        detail: `fileAsset:${asset.id} · ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`,
      });
      return { ok: false, reason: "ลบทะเบียนไฟล์ไม่สำเร็จ" };
    }
    return { ok: true };
  }

  // 🔴 ลำดับ: วัตถุก่อน **แล้วค่อย**แถว และลบแถวเฉพาะเมื่อวัตถุหายจริง (รวม 404 = หายอยู่แล้ว)
  //    เหตุผลที่ต่างจาก `purgeExpiredChatMessages` (ซึ่งล้างฟิลด์เสมอแม้ CDN ล้ม): ที่นั่นข้อมูล
  //    ส่วนบุคคลอยู่ใน **ฟิลด์** ⇒ ล้างฟิลด์คือเป้าหมายในตัวเอง · ที่นี่ข้อมูลส่วนบุคคลอยู่ใน
  //    **วัตถุ** และแถวคือ *ที่จับ* อันเดียวที่เหลืออยู่ ⇒ ลบแถวทิ้งตอนที่เก็บล้มเหลว = เสียงบันทึก
  //    การโทรนอนอยู่ในถังตลอดกาลโดยไม่มีใครตามเก็บได้อีกเลย (หนี้ที่ใบนี้มาปิดพอดี)
  //    ⇒ ที่เก็บล้มเหลวจริง = คงแถวไว้ + OpsEvent + `ok:false` ให้รอบถัดไป/ผู้เรียกลองใหม่ได้
  const storage = await deleteStoredPath(
    asset.path,
    {
      tenantId: ctx.tenantId,
      purgeUrl: isPrivateFileUrl(asset.cdnUrl) ? null : asset.cdnUrl,
      logRef: `fileAsset:${asset.id}`,
    },
    deps,
  );
  if (!storage.ok) return storage;
  try {
    await tenantDb(ctx).fileAsset.deleteMany({ where: { id: asset.id } });
  } catch (e) {
    await logOps("ERROR", "storage.delete", "ลบทะเบียนไฟล์ไม่สำเร็จ", {
      tenantId: ctx.tenantId,
      detail: `fileAsset:${asset.id} · ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`,
    });
    return { ok: false, reason: "ลบทะเบียนไฟล์ไม่สำเร็จ" };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════
// อ่านวัตถุจากที่เก็บฝั่งเซิร์ฟเวอร์ (ใบ C0.4) — ให้ route `/api/files/[id]` สตรีมต่อ
//
// 🔴 ไคลเอนต์ไม่เคยคุยกับ storage zone เอง: AccessKey อยู่ฝั่งเราเท่านั้น
//    (ถ้า redirect ไป CDN แทน = คืน URL ถาวรทางอ้อม ซึ่งคือสิ่งที่ X10 ห้ามไว้ทั้งใบ)
// ═══════════════════════════════════════════════════════════════

export type OpenStoredFileResult =
  | { ok: true; body: ReadableStream<Uint8Array> | null; bytes: Uint8Array | null }
  | { ok: false; status: number; reason: string };

export async function openStoredFile(
  path: string,
  tenantId: string,
): Promise<OpenStoredFileResult> {
  // 🔴 ด่านข้ามร้าน (BLOCKER 1 ของการตรวจ 18 ก.ย.): ผู้เรียกพิสูจน์สิทธิ์บน **แถว** แล้วเอา
  //    **path** ของแถวนั้นมาอ่าน — แต่ `FileAsset.path` ไม่ได้ถูกสร้างโดยเซิร์ฟเวอร์เสมอ
  //    (`kanban/links.ts:373` เขียนค่าจาก body ของ chat API v1 ตรง ๆ) ⇒ ปลูกแถวในร้านตัวเอง
  //    ที่ path ชี้เข้าร้านอื่นได้ · ที่นี่บังคับว่า path ต้องอยู่ใต้ `t/<ร้านเจ้าของแถว>/` เท่านั้น
  const p = storagePathForTenant(path, tenantId);
  if (!p) {
    return { ok: false, status: 404, reason: "ที่อยู่ไฟล์ไม่ตรงกับร้านเจ้าของ" };
  }
  if (!storageEnabled()) {
    return { ok: false, status: 503, reason: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (storage)" };
  }
  let res: Response;
  try {
    res = await fetch(`${BUNNY_HOST}/${process.env.SHARK_BUNNY_ZONE}/${p}`, {
      headers: { AccessKey: process.env.SHARK_BUNNY_KEY ?? "" },
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 502, reason: "ต่อที่เก็บไฟล์ไม่ได้" };
  }
  if (!res.ok) return { ok: false, status: res.status === 404 ? 404 : 502, reason: "อ่านไฟล์ไม่สำเร็จ" };
  if (res.body) return { ok: true, body: res.body, bytes: null };
  return { ok: true, body: null, bytes: new Uint8Array(await res.arrayBuffer()) };
}

/** นามสกุลไฟล์ของ mime นี้ (ไม่มีในทะเบียน = null) — route ใช้ตั้งชื่อไฟล์ตอนดาวน์โหลด */
export function extensionForUploadType(contentType: string | null | undefined): string | null {
  return ALLOWED_TYPES[normalizeUploadType(contentType)] ?? null;
}

/** หนึ่งแถวของ `listAssets` — คอลัมน์ที่ยอมให้ออกจากชั้น storage */
export type FileAssetRow = {
  id: string;
  kind: FileKind;
  path: string;
  contentType: string;
  bytes: number;
  createdAt: Date;
  visibility: FileVisibility;
  /** URL สาธารณะ — **null เสมอสำหรับไฟล์ส่วนตัว** (ไม่ใช่ค่าหมาย ไม่ใช่สตริงว่าง) */
  cdnUrl: string | null;
};

/**
 * รายการไฟล์ของร้าน (ใหม่→เก่า) — กรองตาม kind ได้
 *
 * 🔴 AUDIT-CLASS X10: ห้ามคืนแถวดิบ ๆ ออกไป
 *    · `select` แบบระบุชื่อ ⇒ คอลัมน์ใหม่ในอนาคตจะไม่ไหลออกไปเองโดยไม่มีใครตัดสินใจ
 *    · ค่าหมาย `private://…` **ไม่เคยออกจากฟังก์ชันนี้**: แถวส่วนตัวได้ `cdnUrl: null`
 *      เหตุผล: ค่าหมายต่างจาก URL จริงแค่คำนำหน้า — โค้ด DTO บรรทัดเดียวที่ `.replace()`
 *      หรือต่อสตริงผิด ก็กลายเป็น URL สาธารณะที่ใบงานนี้ทั้งใบมีไว้เพื่อป้องกัน
 *    · `path` ยังคืนอยู่ เพราะงานลบ/งานกวาดต้องใช้ — แต่มันไม่ใช่ URL และผู้ที่จะอ่านไฟล์ได้
 *      ต้องผ่าน `/api/files/[id]` ที่ตรวจลายเซ็นเท่านั้น
 */
export async function listAssets(
  ctx: StorageCtx,
  kind?: FileKind,
  take = 50,
): Promise<FileAssetRow[]> {
  const rows = await tenantDb(ctx).fileAsset.findMany({
    where: kind ? { kind } : {},
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      kind: true,
      path: true,
      cdnUrl: true,
      contentType: true,
      bytes: true,
      createdAt: true,
    },
  });
  return rows.map((r) => {
    const isPrivate = isPrivateFileUrl(r.cdnUrl) || isPrivateStoragePath(r.path);
    return {
      id: r.id,
      kind: r.kind,
      path: r.path,
      contentType: r.contentType,
      bytes: r.bytes,
      createdAt: r.createdAt,
      visibility: isPrivate ? ("private" as const) : ("public" as const),
      cdnUrl: isPrivate ? null : r.cdnUrl,
    };
  });
}
