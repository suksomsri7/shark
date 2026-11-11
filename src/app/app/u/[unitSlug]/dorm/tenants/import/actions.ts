"use server";
// SVC D.4 ▸ action นำเข้า Excel/CSV ของหอ — ร้าน/ผู้กระทำมาจาก session เท่านั้น (ไม่รับรหัสร้าน/ผู้ใช้จากอินพุต)
//   ด่าน: requireUnit + หน่วย DORM + สิทธิ์ dorm.import (evaluate) — สร้าง/ย้อนกลับตรวจ dorm.lease.manage + ขอบเขตอาคารซ้ำใน facade
//   ไฟล์รับเป็น dataURL/base64 — ตรวจขนาดจากความยาวข้อความ "ก่อนถอด" (≤ rooms.import.maxFileBytes เพดานบน 10 MB) · facade ตรวจค่าตั้งสดซ้ำ
//   ไม่ throw ให้ผู้ใช้เห็น stack: ไม่มีสิทธิ์/ข้อมูลผิด ⇒ { ok:false, code, reason (ไทย) }
import { revalidatePath } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { createImport, guessColumns, previewImport, undoImport, uploadImport, type ImportDecision, type ImportMapping, type ImportOptions } from "@/lib/modules/dorm";

const HARD_MAX_BYTES = 10_000_000;
const DATA_URL = /^data:([a-z0-9.+/;=-]*);base64,([A-Za-z0-9+/=\s]+)$/i;
type Rec = Record<string, unknown>;
type Res = {
  ok: boolean;
  code?: string;
  reason?: string;
  batchId?: string;
  previewHash?: string;
  blockers?: { code: string; room: string }[];
  mustFix?: number;
  failedRowNo?: number;
  failedCode?: string;
  done?: number;
};
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const refuse = (code: string, reason: string): Res => ({ ok: false, code, reason });
const NO_ACCESS = refuse("NOT_FOUND", "ไม่พบหอนี้ หรือบัญชีนี้ไม่มีสิทธิ์นำเข้าข้อมูล");
const BAD_INPUT = refuse("INVALID_INPUT", "ข้อมูลที่ส่งมาไม่ถูกต้อง");

async function gate(unitSlug: unknown) {
  if (typeof unitSlug !== "string" || !unitSlug) return null;
  const { auth, unit } = await requireUnit(unitSlug);
  const m = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (unit.type !== "DORM" || !evaluate(m, { module: "dorm", action: "dorm.import", unitId: unit.id })) return null;
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, unitId: unit.id, path: `/app/u/${unitSlug}/dorm/tenants/import` };
}
const pick = (r: Rec): Res => ({
  ok: r.ok === true,
  ...(typeof r.code === "string" ? { code: r.code } : {}),
  ...(typeof r.reason === "string" ? { reason: r.reason } : {}),
  ...(typeof r.batchId === "string" ? { batchId: r.batchId } : {}),
  ...(typeof r.previewHash === "string" ? { previewHash: r.previewHash } : {}),
  ...(Array.isArray(r.blockers) ? { blockers: (r.blockers as unknown[]).filter(isRec).slice(0, 50).map((b) => ({ code: String(b.code ?? ""), room: String(b.room ?? "") })) } : {}),
  ...(typeof r.mustFix === "number" ? { mustFix: r.mustFix } : {}),
  ...(typeof r.failedRowNo === "number" ? { failedRowNo: r.failedRowNo } : {}),
  ...(typeof r.failedCode === "string" ? { failedCode: r.failedCode } : {}),
  ...(typeof r.done === "number" ? { done: r.done } : {}),
});

export async function uploadImportAction(unitSlug: string, input: unknown): Promise<Res> {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input) || typeof input.dataUrl !== "string") return BAD_INPUT;
  // ขนาดก่อนถอด: base64 4 ตัวอักษร = 3 ไบต์
  if (input.dataUrl.length > Math.ceil(HARD_MAX_BYTES / 3) * 4 + 200) return refuse("FILE_TOO_LARGE", "ไฟล์ใหญ่เกินกำหนด — แบ่งเป็นหลายไฟล์");
  const m = DATA_URL.exec(input.dataUrl);
  if (!m) return refuse("INVALID_FILE", "อ่านไฟล์ไม่ได้ — เลือกไฟล์ใหม่");
  const data = new Uint8Array(Buffer.from(m[2].replace(/\s+/g, ""), "base64"));
  const fileName = typeof input.fileName === "string" ? input.fileName.slice(0, 200) : "import";
  const sheet = typeof input.sheet === "string" ? input.sheet.slice(0, 80) : null;
  const r = await uploadImport(g.ctx, { unitId: g.unitId, fileName, contentType: m[1] || null, data, sheet });
  revalidatePath(g.path);
  return pick(r as unknown as Rec);
}

export async function guessColumnsAction(unitSlug: string, input: unknown): Promise<Res> {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input) || typeof input.batchId !== "string") return BAD_INPUT;
  const r = await guessColumns(g.ctx, { unitId: g.unitId, batchId: input.batchId });
  return pick(r as unknown as Rec);
}

export async function previewImportAction(unitSlug: string, input: unknown): Promise<Res> {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input) || typeof input.batchId !== "string") return BAD_INPUT;
  const r = await previewImport(g.ctx, {
    unitId: g.unitId,
    batchId: input.batchId,
    ...(isRec(input.mapping) ? { mapping: input.mapping as ImportMapping } : {}),
    ...(isRec(input.options) ? { options: input.options as ImportOptions } : {}),
    ...(isRec(input.decisions) ? { decisions: input.decisions as Record<string, ImportDecision[]> } : {}),
  });
  revalidatePath(g.path);
  return pick(r as unknown as Rec);
}

export async function createImportAction(unitSlug: string, input: unknown): Promise<Res> {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input) || typeof input.batchId !== "string" || typeof input.previewHash !== "string") return BAD_INPUT;
  const reason = typeof input.legalAckReason === "string" && input.legalAckReason.trim() ? input.legalAckReason.trim().slice(0, 500) : null;
  const skipRows = Array.isArray(input.skipRows) ? input.skipRows.filter((x): x is number => typeof x === "number" && Number.isInteger(x)).slice(0, 100) : undefined;
  const r = await createImport(g.ctx, { unitId: g.unitId, batchId: input.batchId, previewHash: input.previewHash, legalAck: reason ? { reason } : null, ...(skipRows?.length ? { skipRows } : {}) });
  revalidatePath(g.path);
  return pick(r as unknown as Rec);
}

export async function undoImportAction(unitSlug: string, input: unknown): Promise<Res> {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input) || typeof input.batchId !== "string" || typeof input.reason !== "string") return BAD_INPUT;
  const r = await undoImport(g.ctx, { unitId: g.unitId, batchId: input.batchId, reason: input.reason.slice(0, 500) });
  revalidatePath(g.path);
  return pick(r as unknown as Rec);
}
