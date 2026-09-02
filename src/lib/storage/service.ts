// Object storage (WO-0024) — โลโก้/ไฟล์แนบของร้าน เก็บบน Bunny (env SHARK_BUNNY_*)
//
// หลักการ: เปิดเฉพาะเมื่อมี env ครบ · ไม่มี env = ปิดอย่างสุภาพ (คืน ok:false ข้อความไทย)
// ห้าม throw ทุกทาง — คืน { ok:false, error:ไทย } เสมอ เพื่อให้ UI จัดการต่อได้
//
// การเก็บไฟล์: PUT https://sg.storage.bunnycdn.com/<zone>/<path> header AccessKey
// (ข้อสอบฉีด deps.put แทน เพื่อไม่ยิงจริง) · cdnUrl = <SHARK_BUNNY_CDN>/<path>

import { tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import type { FileKind } from "@prisma/client";

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

export type UploadInput = {
  kind: FileKind;
  filename: string;
  contentType: string;
  data: Uint8Array;
  /** เพดานขนาดเฉพาะงานนี้ (ไม่ส่ง = 5MB ตามค่าตั้งต้นของระบบ) — แชทส่ง 10MB */
  maxBytes?: number;
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
          "ชนิดไฟล์นี้อัปโหลดไม่ได้ — รองรับรูป (jpg/png/webp/gif/heic), เสียง (webm/m4a/mp3/ogg), PDF, Word, Excel และ txt",
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

    // ประกอบ path: t/<tenantId>/<kind ตัวเล็ก>/<id>.<ext>
    const id = newId();
    const path = `t/${ctx.tenantId}/${input.kind.toLowerCase()}/${id}.${ext}`;
    const cdnUrl = `${cdnBase()}/${path}`;

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
  const base = cdnBase();
  if (!base) return null;
  if (!url.startsWith(`${base}/`)) return null;
  // ตัด query/hash ออกก่อน (ลิงก์ที่มี ?v= ติดมาต้องไม่กลายเป็นชื่อไฟล์คนละตัว)
  const path = url.slice(base.length + 1).split(/[?#]/)[0] ?? "";
  // กัน path traversal: ".." ที่หลุดเข้ามาแปลว่า url ถูกประกอบผิด → ไม่ลบดีกว่าลบผิดไฟล์
  if (!path || path.includes("..")) return null;
  return path;
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

  const del = deps?.del;
  if (!del && !storageEnabled()) {
    return { ok: false, reason: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (storage)" };
  }

  const path = storagePathFromCdnUrl(url);
  if (!path) return { ok: false, reason: "ไม่ใช่ไฟล์บนที่เก็บของเราเอง — ไม่แตะ" };

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
      detail: `${path} · ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`,
    });
    return { ok: false, reason: "ต่อที่เก็บไฟล์ไม่ได้" };
  }

  // 404 = ไม่มีไฟล์นั้นแล้ว → ปลายทางเดียวกับลบสำเร็จ (รันซ้ำแล้วต้องไม่แดง)
  if (!((status >= 200 && status < 300) || status === 404)) {
    await logOps("ERROR", "storage.delete", "ลบไฟล์บนที่เก็บไม่สำเร็จ", {
      tenantId: opts?.tenantId,
      detail: `${path} · HTTP ${status}`,
    });
    return { ok: false, reason: `ที่เก็บไฟล์ตอบ HTTP ${status}` };
  }

  // ── purge edge cache (เผื่อไว้ · ไม่มี account key = ข้าม ไม่ถือว่าล้มเหลว) ──
  try {
    const purge = deps?.purge;
    if (purge) {
      await purge(url);
    } else if (process.env.BUNNY_ACCOUNT_KEY) {
      await fetch(`https://api.bunny.net/purge?url=${encodeURIComponent(url)}&async=false`, {
        method: "POST",
        headers: { AccessKey: process.env.BUNNY_ACCOUNT_KEY },
      });
    }
  } catch {
    // purge ล้มไม่ทำให้การลบล้มเหลว — วัตถุต้นทางหายไปแล้ว เหลือแค่ edge ที่จะหมดอายุเอง
  }

  return { ok: true };
}

/** รายการไฟล์ของร้าน (ใหม่→เก่า) — กรองตาม kind ได้ */
export async function listAssets(ctx: StorageCtx, kind?: FileKind, take = 50) {
  return tenantDb(ctx).fileAsset.findMany({
    where: kind ? { kind } : {},
    orderBy: { createdAt: "desc" },
    take,
  });
}
