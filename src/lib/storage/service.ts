// Object storage (WO-0024) — โลโก้/ไฟล์แนบของร้าน เก็บบน Bunny (env SHARK_BUNNY_*)
//
// หลักการ: เปิดเฉพาะเมื่อมี env ครบ · ไม่มี env = ปิดอย่างสุภาพ (คืน ok:false ข้อความไทย)
// ห้าม throw ทุกทาง — คืน { ok:false, error:ไทย } เสมอ เพื่อให้ UI จัดการต่อได้
//
// การเก็บไฟล์: PUT https://sg.storage.bunnycdn.com/<zone>/<path> header AccessKey
// (ข้อสอบฉีด deps.put แทน เพื่อไม่ยิงจริง) · cdnUrl = <SHARK_BUNNY_CDN>/<path>

import { tenantDb } from "@/lib/core/db";
import type { FileKind } from "@prisma/client";

// ชนิดไฟล์ที่อนุญาต → นามสกุลไฟล์ (ext) ที่ใช้ประกอบ path
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

const BUNNY_HOST = "https://sg.storage.bunnycdn.com";

type StorageCtx = { tenantId: string };

export type UploadInput = {
  kind: FileKind;
  filename: string;
  contentType: string;
  data: Uint8Array;
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

    // ตรวจชนิดไฟล์
    const ext = ALLOWED_TYPES[input.contentType];
    if (!ext) {
      return { ok: false, error: "ชนิดไฟล์นี้อัปโหลดไม่ได้ — รองรับเฉพาะรูป (jpg/png/webp/gif) และ PDF" };
    }

    // ตรวจขนาด
    if (input.data.length > MAX_BYTES) {
      return { ok: false, error: "ไฟล์ใหญ่เกิน 5MB — กรุณาย่อขนาดก่อนอัปโหลด" };
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
  } catch {
    // เน็ตหลุด/DB ล่ม — ปิดสุภาพ ไม่ให้ throw ทะลุขึ้น UI
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
