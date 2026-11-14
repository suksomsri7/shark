// attachments.ts — ไฟล์แนบของคำสั่งในห้องเลขา (14 พ.ย. 2026 · ปุ่ม + ของจอเริ่มงานใหม่/ห้องงาน: รูปภาพ · ถ่ายรูป · ไฟล์)
//
// ชนิดที่รับ: รูป JPG/PNG/WEBP/GIF (ชนิดที่โมเดล vision อ่านได้ — HEIC แอปแปลงเป็น JPEG ก่อนส่ง) · PDF · Excel (.xlsx) · CSV
//   ไม่รับ .xls (ไฟล์ Excel รุ่นเก่า แบบ OLE) — ในระบบไม่มีตัวอ่าน และไม่คุ้มเพิ่ม dependency ⇒ ข้อความไทยให้บันทึกเป็น .xlsx/CSV
// เพดาน: ≤ 5 ไฟล์ต่อข้อความ · ≤ 4 MB ต่อไฟล์ (คำขอของ Vercel ≤ 4.5 MB · ฐานเดียวกับ support/upload) ⇒ 5 ไฟล์ × base64 ≈ 27 MB < 32 MB ของ Messages API
// ที่เก็บ = `uploadFile` ตัวกลาง (kind ATTACHMENT · **visibility private** — สลิป/ใบเสร็จ = AUDIT-CLASS X10 ห้ามมี URL CDN ถาวร)
//   CSV เก็บเป็น contentType `text/plain` (ทะเบียนชนิดไฟล์กลางไม่มี csv · ไม่ขยายทะเบียนที่ทุกโมดูลใช้ร่วม) — ชนิดจริงจดใน JSON ของข้อความ
// ผูกกับข้อความ: `AiMessage.attachments` = [{fileId,name,mimeType,size,kind}] (เขียนใน tx เดียวกับข้อความ USER — startRoom/sendRoomMessage)
// ป้อนโมเดล (worker → sendMessage): รูป = image block (data URL base64) · PDF = document block · Excel/CSV = ข้อความ CSV ต่อท้ายคำสั่ง
//   (xlsx อ่านด้วยตัวอ่านเล็กบน node:zlib ของ `modules/dorm/import-parse` — มีเพดานกันไฟล์ระเบิดอยู่แล้ว) · ตัดยาวเกิน = บอกโมเดลว่าตัด
//   ประวัติเก่าที่มีไฟล์แนบ = ป้ายข้อความ "[แนบ: …]" (ไม่ส่งไบต์ซ้ำทุกเทิร์น — คุมต้นทุน)
// 🔴 ไม่ throw ในทางอ่านไฟล์ (เปิดไม่ได้ = บอกโมเดลว่าเปิดไม่ได้ งานยังเดินต่อ) · ตรวจไฟล์จาก magic bytes ไม่เชื่อหัวของผู้ส่ง
import { tenantDb } from "@/lib/core/db";
import { sniffedAttachmentType } from "@/lib/storage/sniff";
import { isPrivateStoragePath, normalizeUploadType, openStoredFile } from "@/lib/storage/service";
import { parseImportFile } from "@/lib/modules/dorm/import-parse";
import { CSV_MIME, IMAGE_TYPES, SEC_ATTACH_MAX_BYTES, SEC_ATTACH_MAX_FILES, XLSX_MIME, cleanAttachName, type SecAttachKind, type SecAttachment } from "./attachments-shared";

export * from "./attachments-shared";
/** ไฟล์ที่อัปแล้วต้องแนบภายในเวลานี้ (กันหยิบไฟล์เก่าของร้านมาแนบด้วยรหัส) */
const ATTACH_MAX_AGE_MS = 24 * 3600_000;
/** ข้อความ CSV ต่อไฟล์ที่ป้อนโมเดล (≈ 10k token) · รวมทุกไฟล์ */
const SHEET_TEXT_MAX = 40_000;
const SHEET_TEXT_TOTAL_MAX = 120_000;
const SHEET_MAX_SHEETS = 5;

export const MSG_ATTACH_TYPE = "แนบได้เฉพาะรูป (JPG · PNG · WEBP · GIF) · PDF · Excel (.xlsx) · CSV — ไฟล์ Excel รุ่นเก่า (.xls) ให้บันทึกเป็น .xlsx ก่อน";
export const MSG_ATTACH_TOO_BIG = "ไฟล์ใหญ่เกิน 4 MB — ลดขนาดหรือแบ่งไฟล์ก่อนแนบ";
const MSG_ATTACH_MAX = `แนบได้ครั้งละไม่เกิน ${SEC_ATTACH_MAX_FILES} ไฟล์`;
const MSG_ATTACH_GONE = "ไม่พบไฟล์แนบ หรือไฟล์หมดอายุแล้ว — แนบใหม่อีกครั้ง";

const extOf = (name: string) => (/\.([a-z0-9]{1,8})$/i.exec(name.trim())?.[1] ?? "").toLowerCase();

function kindOf(mime: string): SecAttachKind | null {
  if ((IMAGE_TYPES as readonly string[]).includes(mime)) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime === XLSX_MIME || mime === CSV_MIME) return "sheet";
  return null;
}

/** ข้อความ (ไม่ใช่ไบนารี): ไม่มี NUL และไม่ใช่ลายเซ็นไฟล์ที่รู้จัก */
function looksText(b: Uint8Array): boolean {
  if (b.length === 0) return false;
  const head = String.fromCharCode(...b.slice(0, 5));
  if (head.startsWith("PK") || head.startsWith("%PDF") || (b[0] === 0xd0 && b[1] === 0xcf)) return false;
  const n = Math.min(b.length, 64 * 1024);
  for (let i = 0; i < n; i++) if (b[i] === 0) return b[0] === 0xff && b[1] === 0xfe; // UTF-16LE มี NUL ได้ (BOM)
  return true;
}

/**
 * ตัดสินชนิดไฟล์ที่อัปมา (route อัปโหลด) — คืนชนิดจริง + contentType ที่ใช้เก็บ · ไม่รับ = error ไทย
 *   ชนิดที่ประกาศว่างเปล่า/octet-stream (ตัวเลือกไฟล์บางเครื่อง) ⇒ เดาจากนามสกุล แล้วยังต้องผ่าน magic bytes
 */
export function classifyUpload(data: Uint8Array, declaredRaw: string, filename: string): { ok: true; mimeType: string; storeType: string; kind: SecAttachKind } | { ok: false; error: string } {
  let declared = normalizeUploadType(declaredRaw);
  const ext = extOf(filename);
  if (!declared || declared === "application/octet-stream" || declared === "application/vnd.ms-excel" || declared === "text/plain" || declared === "text/comma-separated-values") {
    declared = ext === "csv" ? CSV_MIME : ext === "xlsx" ? XLSX_MIME : ext === "pdf" ? "application/pdf" : declared;
  }
  if (declared === CSV_MIME) {
    return looksText(data) ? { ok: true, mimeType: CSV_MIME, storeType: "text/plain", kind: "sheet" } : { ok: false, error: MSG_ATTACH_TYPE };
  }
  const real = sniffedAttachmentType(data, declared);
  const kind = real ? kindOf(real) : null;
  if (!real || !kind) return { ok: false, error: MSG_ATTACH_TYPE };
  return { ok: true, mimeType: real, storeType: real, kind };
}

type Ref = { id: string; name?: string | null };

/**
 * รหัสไฟล์ที่แอปส่งมากับคำสั่ง → รายการที่เก็บลงข้อความ (ตรวจกับ FileAsset ของร้านนี้: ATTACHMENT · ส่วนตัว · ชนิดที่รับ · อายุ ≤ 24 ชม.)
 *   ว่าง = [] · รหัสไหนไม่ผ่าน = ไม่รับทั้งชุด (ข้อความไทย) — ไม่ส่งคำสั่งที่ไฟล์หายไปบางส่วนโดยผู้ใช้ไม่รู้
 */
export async function resolveAttachmentRefs(tenantId: string, refs: readonly Ref[] | undefined, now: Date = new Date()): Promise<{ ok: true; items: SecAttachment[] } | { ok: false; message: string }> {
  const list = Array.isArray(refs) ? refs : [];
  if (list.length === 0) return { ok: true, items: [] };
  const seen = new Set<string>();
  const uniq = list.filter((r) => r && typeof r.id === "string" && r.id && !seen.has(r.id) && seen.add(r.id));
  if (uniq.length > SEC_ATTACH_MAX_FILES) return { ok: false, message: MSG_ATTACH_MAX };
  const rows = await tenantDb({ tenantId }).fileAsset.findMany({
    where: { id: { in: uniq.map((r) => r.id) }, kind: "ATTACHMENT", createdAt: { gt: new Date(now.getTime() - ATTACH_MAX_AGE_MS) } },
    select: { id: true, path: true, contentType: true, bytes: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items: SecAttachment[] = [];
  for (const r of uniq) {
    const row = byId.get(r.id);
    if (!row || !isPrivateStoragePath(row.path)) return { ok: false, message: MSG_ATTACH_GONE };
    const stored = normalizeUploadType(row.contentType);
    const mimeType = stored === "text/plain" ? CSV_MIME : stored;
    const kind = kindOf(mimeType);
    if (!kind) return { ok: false, message: MSG_ATTACH_GONE };
    items.push({ fileId: row.id, name: cleanAttachName(r.name, kind === "image" ? "image" : "file"), mimeType, size: row.bytes, kind });
  }
  return { ok: true, items };
}



async function readAll(opened: { body: ReadableStream<Uint8Array> | null; bytes: Uint8Array | null }, cap: number): Promise<Uint8Array | null> {
  if (opened.bytes) return opened.bytes.length <= cap ? opened.bytes : null;
  if (!opened.body) return null;
  const reader = opened.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > cap) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** อ่านไบต์ของไฟล์แนบ (ร้านเจ้าของ · ไฟล์ส่วนตัว) — ไม่ได้ = null (ไม่ throw) */
export async function readAttachmentBytes(tenantId: string, fileId: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const row = await tenantDb({ tenantId }).fileAsset.findFirst({ where: { id: fileId, kind: "ATTACHMENT" }, select: { path: true, contentType: true } });
    if (!row || !isPrivateStoragePath(row.path)) return null;
    const opened = await openStoredFile(row.path, tenantId);
    if (!opened.ok) return null;
    const bytes = await readAll(opened, SEC_ATTACH_MAX_BYTES + 1024);
    return bytes ? { bytes, contentType: normalizeUploadType(row.contentType) } : null;
  } catch {
    return null;
  }
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csvOf = (headers: string[], rows: string[][]) => [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");

/** ตาราง (xlsx/csv) → ข้อความ CSV สำหรับโมเดล · ตัดเกินเพดานพร้อมบอกว่าตัด */
function sheetText(a: SecAttachment, bytes: Uint8Array): string {
  const clip = (s: string) => (s.length > SHEET_TEXT_MAX ? `${s.slice(0, SHEET_TEXT_MAX)}\n…(ตัดเหลือ ${SHEET_TEXT_MAX.toLocaleString("en-US")} ตัวอักษรแรก — ไฟล์ยาวกว่านี้)` : s);
  if (a.mimeType === CSV_MIME) {
    const p = parseImportFile(bytes, { maxRows: 5000 });
    // อ่านด้วยตัวอ่านกลางได้ (ถอดรหัส UTF-8/UTF-16/windows-874 ให้แล้ว) ⇒ CSV ที่จัดใหม่ · ไม่ได้ (เช่น แถวเกิน) ⇒ ข้อความดิบตามที่แนบ
    const text = p.ok ? csvOf(p.headers, p.rows) : new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
    return `ไฟล์ CSV "${a.name}":\n${clip(text)}`;
  }
  const first = parseImportFile(bytes, { maxRows: 5000 });
  if (!first.ok) return `ไฟล์ Excel "${a.name}" เปิดอ่านไม่ได้ (${first.reason})`;
  const blocks: string[] = [];
  for (const s of first.sheets.slice(0, SHEET_MAX_SHEETS)) {
    const p = s.name === first.sheet ? first : parseImportFile(bytes, { sheet: s.name, maxRows: 5000 });
    blocks.push(p.ok ? `ชีต "${s.name}":\n${csvOf(p.headers, p.rows)}` : `ชีต "${s.name}": อ่านไม่ได้ (${p.reason})`);
  }
  if (first.sheets.length > SHEET_MAX_SHEETS) blocks.push(`…(มีอีก ${first.sheets.length - SHEET_MAX_SHEETS} ชีตที่ไม่ได้ส่งมา)`);
  return `ไฟล์ Excel "${a.name}" (แปลงเป็น CSV):\n${clip(blocks.join("\n\n"))}`;
}

export type TurnAttachments = { imageUrls: string[]; documents: { name: string; mediaType: "application/pdf"; data: string }[]; text: string };

/**
 * ไฟล์แนบของเทิร์นปัจจุบัน → ส่วนที่ป้อนโมเดล (worker) · เปิดไม่ได้ = บรรทัดบอกโมเดลแทน (ไม่ throw)
 */
export async function turnAttachments(tenantId: string, atts: readonly SecAttachment[]): Promise<TurnAttachments> {
  const out: TurnAttachments = { imageUrls: [], documents: [], text: "" };
  const notes: string[] = [];
  let sheetBudget = SHEET_TEXT_TOTAL_MAX;
  for (const a of atts.slice(0, SEC_ATTACH_MAX_FILES)) {
    const got = await readAttachmentBytes(tenantId, a.fileId);
    if (!got) {
      notes.push(`ไฟล์แนบ "${a.name}" เปิดไม่ได้ (ไฟล์หายหรือที่เก็บไฟล์ขัดข้อง) — บอกผู้ใช้ให้แนบใหม่`);
      continue;
    }
    const b64 = Buffer.from(got.bytes).toString("base64");
    if (a.kind === "image") out.imageUrls.push(`data:${a.mimeType};base64,${b64}`);
    else if (a.kind === "pdf") out.documents.push({ name: a.name, mediaType: "application/pdf", data: b64 });
    else {
      let t = "";
      try {
        t = sheetText(a, got.bytes);
      } catch {
        t = `ไฟล์ตาราง "${a.name}" เปิดอ่านไม่ได้`;
      }
      if (t.length > sheetBudget) t = `${t.slice(0, Math.max(0, sheetBudget))}\n…(ตัด — ไฟล์แนบรวมยาวเกินที่ส่งได้ในครั้งเดียว)`;
      sheetBudget -= t.length;
      notes.push(t);
    }
  }
  out.text = notes.join("\n\n");
  return out;
}
