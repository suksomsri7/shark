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

/** รายการไฟล์ของร้าน (ใหม่→เก่า) — กรองตาม kind ได้ */
export async function listAssets(ctx: StorageCtx, kind?: FileKind, take = 50) {
  return tenantDb(ctx).fileAsset.findMany({
    where: kind ? { kind } : {},
    orderBy: { createdAt: "desc" },
    take,
  });
}
