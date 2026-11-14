// attachments-shared.ts — ส่วน pure ของไฟล์แนบห้องเลขา (ชนิด · เพดาน · อ่าน JSON ของคอลัมน์ · ป้ายประวัติ) — 14 พ.ย. 2026
//   🔴 pure: ไม่ import ฐาน/ที่เก็บไฟล์ — `dto.ts` (pure) และ `service.ts` ใช้ไฟล์นี้ · ส่วนที่อ่านฐาน/ไฟล์อยู่ใน `./attachments.ts`
export const SEC_ATTACH_MAX_FILES = 5;
export const SEC_ATTACH_MAX_BYTES = 4 * 1024 * 1024;
export const NAME_MAX = 120;

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const CSV_MIME = "text/csv";
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type SecAttachKind = "image" | "pdf" | "sheet";
export type SecAttachment = { fileId: string; name: string; mimeType: string; size: number; kind: SecAttachKind };

/** ชื่อไฟล์ที่แสดง (ไม่มี path · ไม่มีอักขระควบคุม · ≤ 120 ตัว) */
export function cleanAttachName(raw: unknown, fallback = "file"): string {
  const s = (typeof raw === "string" ? raw : "")
    .split(/[\\/]/)
    .pop()!
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>"]/g, "")
    .trim();
  return (s || fallback).slice(0, NAME_MAX);
}

/** JSON ของคอลัมน์ → รายการที่เชื่อได้ (แถวเพี้ยน = ข้าม) */
export function attachmentsOf(v: unknown): SecAttachment[] {
  if (!Array.isArray(v)) return [];
  const out: SecAttachment[] = [];
  for (const x of v) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const kind = o.kind === "image" || o.kind === "pdf" || o.kind === "sheet" ? o.kind : null;
    if (typeof o.fileId !== "string" || !o.fileId || !kind) continue;
    out.push({ fileId: o.fileId, name: cleanAttachName(o.name), mimeType: typeof o.mimeType === "string" ? o.mimeType : "", size: Number(o.size) || 0, kind });
  }
  return out.slice(0, SEC_ATTACH_MAX_FILES);
}

/** ป้ายในประวัติที่ป้อนโมเดล (ไฟล์ของเทิร์นเก่าไม่ส่งไบต์ซ้ำ) */
export function attachmentMarker(atts: readonly SecAttachment[]): string {
  if (atts.length === 0) return "";
  return `[แนบ: ${atts.map((a) => `${a.kind === "image" ? "รูป" : a.kind === "pdf" ? "PDF" : "ตาราง"} ${a.name}`).join(" · ")}]`;
}
