import { createHash } from "node:crypto";
import type { AccountDocType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { writeAudit } from "./access";
import { editorDefOf, sideOf } from "./doc-editor-config";
import { docTypeLabel } from "./dashboard";
import type { AttachmentStatus, AttachmentSource } from "./attachment-shared";
// re-export ให้ผู้เรียกเดิมที่ import ค่าเหล่านี้จาก "./attachment" ยังใช้ได้ (ของจริงอยู่ attachment-shared.ts
// ซึ่งบริสุทธิ์ ไม่แตะ prisma — client component ต้อง import จากไฟล์นั้นตรง ๆ ห้าม import จากไฟล์นี้)
export type { AttachmentStatus, AttachmentSource } from "./attachment-shared";
export { ATTACHMENT_MAX_BYTES, ATTACHMENT_ALLOWED_MIME, DOC_TYPE_HINT_OPTIONS, validateAttachmentUpload } from "./attachment-shared";

// ─────────────────────────────────────────────────────────────
// attachment.ts — คลังเอกสาร (§3.7 · V2 WO 7.1 · DESIGN-SPEC-V2 §12)
// จัดการ AccountAttachment: แนบไฟล์กับเอกสาร + คลังกลาง (ไฟล์ลอย documentId=null)
// v1 (WO 0.x): รับ URL (วาง URL ไฟล์) — v2 (WO 1.3/7.1): อัปโหลดจริงผ่าน storage service (uploadFile())
//   ทั้งสองทางยังใช้ createAttachment ร่วมกัน (URL ก็ถือเป็น "ไฟล์" เหมือนกัน — แค่ที่มาต่างกัน)
// จัดโฟลเดอร์ (string) + ค้นหา (ชื่อไฟล์/ผู้อัปโหลด) + กรองโฟลเดอร์/ประเภท/ผู้อัปโหลด/ช่วงวันที่
// สถานะ (WO 7.1): UNLINKED (ไฟล์ลอย ยังไม่ผูก) · LINKED (ผูกกับเอกสารแล้ว) · NOT_ACCOUNTING (ไม่ใช่เอกสารบัญชี)
//   · ARCHIVED (ลบนุ่ม — ไม่มี hard delete ไฟล์คลังเอกสาร)
// เงิน N/A · scope = tenantId + systemId
// ─────────────────────────────────────────────────────────────

export type AttachmentInput = {
  tenantId: string;
  systemId: string;
  documentId?: string | null;
  folder?: string | null;
  fileName: string;
  fileUrl: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  uploadedById?: string | null;
  // ── WO 7.1 (ทั้งหมด optional — ผู้เรียกเดิม (editor-actions.ts) ไม่ส่งก็ยังทำงานเหมือนเดิม) ──
  docTypeHint?: string | null;
  source?: AttachmentSource;
  sha256?: string | null;
};

// เดา mimeType จากนามสกุลไฟล์/URL (v1 ไม่มี upload จริง)
function guessMime(fileName: string, url: string): string {
  const ext = (fileName || url).split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    csv: "text/csv",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    zip: "application/zip",
  };
  return map[ext] ?? "application/octet-stream";
}

export function isImageMime(m: string): boolean {
  return m.startsWith("image/");
}

// ─────────────────── WO 7.1 — ชนิด/ค่าคงที่ (ดู re-export ที่หัวไฟล์) ───────────────────

/** hash เนื้อไฟล์ (dedupe ต่อระบบ — ไม่ข้าม tenant/system) */
export function hashBytes(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** ไฟล์เดิมที่เคยอัปโหลด (เนื้อไฟล์เหมือนกัน สโคปเดียวกัน ยังไม่ถูกลบ) — ใช้ dedupe ก่อนอัปจริง */
export async function findAttachmentBySha256(tenantId: string, systemId: string, sha256: string) {
  return prisma.accountAttachment.findFirst({
    where: { tenantId, systemId, sha256, archivedAt: null },
    select: { id: true, fileName: true, fileUrl: true, mimeType: true, sizeBytes: true, status: true },
  });
}

/** ป้ายประเภทที่ใช้แสดงในตาราง — ผูกเอกสารแล้ว = คำนวณจากชนิดเอกสารจริงเสมอ (ไม่ใช้ hint ที่ตั้งไว้ก่อนผูก) */
export function attachmentTypeLabel(row: {
  docTypeHint: string | null;
  document: { docType: AccountDocType } | null;
}): string {
  if (row.document) {
    const side = sideOf(row.document.docType) === "expense" ? "รายจ่าย" : "รายรับ";
    return `${side} › ${docTypeLabel(row.document.docType)}`;
  }
  const hint = row.docTypeHint;
  if (!hint) return "ยังไม่ระบุประเภท";
  if (hint === "REVENUE_ANY") return "รายรับ";
  if (hint === "EXPENSE_ANY") return "รายจ่าย";
  if (hint === "GENERAL") return "เอกสารทั่วไป";
  const def = editorDefOf(hint);
  if (def) return `${def.side === "expense" ? "รายจ่าย" : "รายรับ"} › ${def.label}`;
  return hint;
}

// ─────────────────── อ่าน (V1 — ไม่มีสถานะ/แท็บ ยังใช้โดยหน้าอื่นที่ยังไม่ได้ย้าย) ───────────────────

export function listAttachments(
  tenantId: string,
  systemId: string,
  opts?: { folder?: string | null; q?: string; documentId?: string | null; centralOnly?: boolean },
) {
  return prisma.accountAttachment.findMany({
    where: {
      tenantId,
      systemId,
      archivedAt: null,
      ...(opts?.documentId !== undefined ? { documentId: opts.documentId } : {}),
      ...(opts?.centralOnly ? { documentId: null } : {}),
      ...(opts?.folder ? { folder: opts.folder } : {}),
      ...(opts?.q ? { fileName: { contains: opts.q, mode: "insensitive" } } : {}),
    },
    include: {
      document: { select: { id: true, docType: true, docNo: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** โฟลเดอร์ที่มีอยู่ (distinct) + จำนวนไฟล์ต่อโฟลเดอร์ */
export async function listFolders(
  tenantId: string,
  systemId: string,
): Promise<Array<{ folder: string; count: number }>> {
  const rows = await prisma.accountAttachment.groupBy({
    by: ["folder"],
    where: { tenantId, systemId, archivedAt: null },
    _count: { _all: true },
  });
  return rows
    .filter((r): r is typeof r & { folder: string } => !!r.folder)
    .map((r) => ({ folder: r.folder, count: r._count._all }))
    .sort((a, b) => a.folder.localeCompare(b.folder, "th"));
}

// ─────────────────── เขียน (V1 — ยังใช้โดย DocAttachments/editor-actions) ───────────────────

export async function createAttachment(
  input: AttachmentInput,
): Promise<{ ok: true; id: string; duplicate?: boolean } | { ok: false; reason: string }> {
  const fileName = input.fileName.trim();
  const fileUrl = input.fileUrl.trim();
  if (!fileName) return { ok: false, reason: "กรุณากรอกชื่อไฟล์" };
  if (!/^https?:\/\//i.test(fileUrl))
    return { ok: false, reason: "กรุณาวาง URL ไฟล์ที่ขึ้นต้นด้วย http(s)://" };
  // ผูกกับเอกสาร (ถ้าระบุ) ต้องเป็นเอกสารของระบบนี้
  let linkedDocType: AccountDocType | null = null;
  if (input.documentId) {
    const doc = await prisma.accountDocument.findFirst({
      where: { id: input.documentId, tenantId: input.tenantId, systemId: input.systemId },
      select: { id: true, docType: true },
    });
    if (!doc) return { ok: false, reason: "ไม่พบเอกสารที่จะแนบ" };
    linkedDocType = doc.docType;
  }
  // dedupe (WO 7.1): ไฟล์เนื้อเดียวกัน (sha256) ที่ยังไม่ถูกลบในระบบนี้ → คืนของเดิม ไม่สร้างซ้ำ
  if (input.sha256) {
    const dup = await findAttachmentBySha256(input.tenantId, input.systemId, input.sha256);
    if (dup) return { ok: true, id: dup.id, duplicate: true };
  }
  const mimeType = input.mimeType?.trim() || guessMime(fileName, fileUrl);
  const status: AttachmentStatus = input.documentId ? "LINKED" : "UNLINKED";
  const a = await prisma.accountAttachment.create({
    data: {
      tenantId: input.tenantId,
      systemId: input.systemId,
      documentId: input.documentId || null,
      folder: input.folder?.trim() || null,
      fileName,
      fileUrl,
      mimeType,
      sizeBytes: Math.max(0, Math.round(input.sizeBytes ?? 0)),
      uploadedById: input.uploadedById || null,
      // ── WO 7.1 ──
      docTypeHint: linkedDocType ?? (input.docTypeHint?.trim() || null),
      status,
      source: input.source ?? "UPLOAD",
      thumbUrl: isImageMime(mimeType) ? fileUrl : null,
      sha256: input.sha256 || null,
    },
    select: { id: true },
  });
  return { ok: true, id: a.id };
}

/** "ลบ" ไฟล์แนบ — WO 7.1: ลบนุ่มเสมอ (archivedAt) ไม่มี hard delete จาก UI อีกต่อไป
 *  (เดิม `.delete()` จริง — เปลี่ยนพฤติกรรมเพราะ WO 7.1 กำหนดว่าไฟล์คลังเอกสารต้องกู้คืนได้เสมอ ·
 *  ผู้เรียกเดิม (editor-actions.ts ตอนลบไฟล์ระหว่างร่างเอกสาร) ยังทำงานเหมือนเดิมทุกประการ เพราะ
 *  `listAttachments`/`DocAttachments` กรอง `archivedAt: null` อยู่แล้ว — ไฟล์ที่ลบยังหายจากหน้าจอทันที) */
export async function deleteAttachment(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return archiveAttachment(tenantId, systemId, id);
}

/** ย้ายไฟล์ไปโฟลเดอร์อื่น */
export async function moveAttachment(
  tenantId: string,
  systemId: string,
  id: string,
  folder: string | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const a = await prisma.accountAttachment.findFirst({ where: { id, tenantId, systemId } });
  if (!a) return { ok: false, reason: "ไม่พบไฟล์" };
  await prisma.accountAttachment.update({
    where: { id },
    data: { folder: folder?.trim() || null },
  });
  return { ok: true };
}

// ─────────────────── สรุปขนาด (kB/MB) ───────────────────
export function humanSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ═══════════════════════════════════════════════════════════════
// WO 7.1 — คลังเอกสาร V2 (DESIGN-SPEC-V2 §12 · เฟรม f9)
// ═══════════════════════════════════════════════════════════════

export type AttachmentRowView = {
  id: string;
  fileName: string;
  fileUrl: string;
  thumbUrl: string | null;
  mimeType: string;
  sizeBytes: number;
  folder: string | null;
  docTypeHint: string | null;
  status: AttachmentStatus;
  source: AttachmentSource | null;
  note: string | null;
  createdAt: Date;
  uploadedById: string | null;
  uploaderName: string | null;
  document: { id: string; docType: AccountDocType; docNo: string | null } | null;
  typeLabel: string;
};

export type AttachmentTab = "all" | "unlinked" | "linked";

export type AttachmentListFilters = {
  tab: AttachmentTab;
  from?: Date;
  to?: Date;
  docTypeHint?: string;
  uploaderId?: string;
  folder?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  sortDir?: "asc" | "desc";
};

export type AttachmentListResult = {
  rows: AttachmentRowView[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counts: { all: number; unlinked: number; linked: number };
};

async function resolveUploaderNames(tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const clean = [...new Set(ids)].filter(Boolean);
  if (clean.length === 0) return out;
  const members = await prisma.membership.findMany({
    where: { tenantId, userId: { in: clean } },
    include: { user: true },
  });
  for (const m of members) out.set(m.userId, m.user.name ?? m.user.email);
  return out;
}

/** ผู้ใช้ที่ชื่อ/อีเมลตรงกับคำค้น (ในร้านนี้) — ใช้ประกอบตัวกรองค้นหา "ชื่อไฟล์, ผู้นำเข้า" */
async function uploaderIdsMatching(tenantId: string, q: string): Promise<string[]> {
  const members = await prisma.membership.findMany({
    where: {
      tenantId,
      OR: [
        { user: { is: { name: { contains: q, mode: "insensitive" } } } },
        { user: { is: { email: { contains: q, mode: "insensitive" } } } },
      ],
    },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

/** ผู้อัปโหลดที่มีจริงในระบบนี้ — ตัวเลือกของตัวกรอง "ผู้อัปโหลด ▾" */
export async function listAttachmentUploaders(
  tenantId: string,
  systemId: string,
): Promise<Array<{ id: string; name: string }>> {
  const rows = await prisma.accountAttachment.groupBy({
    by: ["uploadedById"],
    where: { tenantId, systemId, archivedAt: null },
  });
  const ids = rows.map((r) => r.uploadedById).filter((x): x is string => !!x);
  const names = await resolveUploaderNames(tenantId, ids);
  return ids
    .map((id) => ({ id, name: names.get(id) ?? "ไม่ทราบชื่อ" }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
}

/** base where ของคลังเอกสาร — ทุกตัวกรอง "ยกเว้นแท็บ" (ใช้ทั้งนับแท็บและนับ total ให้บวกกันลงตัว
 *  แบบเดียวกับ `listDocumentsPaged` ใน service.ts) */
async function attachmentsBaseWhere(
  tenantId: string,
  systemId: string,
  f: Omit<AttachmentListFilters, "tab" | "page" | "pageSize" | "sortDir">,
): Promise<Prisma.AccountAttachmentWhereInput> {
  const q = f.q?.trim();
  const uploaderIds = q ? await uploaderIdsMatching(tenantId, q) : [];
  return {
    tenantId,
    systemId,
    archivedAt: null,
    ...(f.from || f.to
      ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } }
      : {}),
    ...(f.docTypeHint ? { docTypeHint: f.docTypeHint } : {}),
    ...(f.uploaderId ? { uploadedById: f.uploaderId } : {}),
    ...(f.folder ? { folder: f.folder } : {}),
    ...(q
      ? {
          OR: [
            { fileName: { contains: q, mode: "insensitive" as const } },
            ...(uploaderIds.length ? [{ uploadedById: { in: uploaderIds } }] : []),
          ],
        }
      : {}),
  };
}

/** รายการคลังเอกสาร + แบ่งหน้า + ตัวนับแท็บ — ใช้ร่วมกันทั้งหน้า "คลังเอกสาร" (WO 7.1) และ
 *  "กล่องขาเข้า" (WO 7.2, tab="unlinked") ตามที่ BLUEPRINT สั่งให้ทำ data function เดียวใช้ร่วม */
export async function listAttachmentsPaged(
  tenantId: string,
  systemId: string,
  f: AttachmentListFilters,
): Promise<AttachmentListResult> {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, f.pageSize ?? 20));
  const base = await attachmentsBaseWhere(tenantId, systemId, f);
  const tabWhere: Prisma.AccountAttachmentWhereInput =
    f.tab === "unlinked" ? { status: "UNLINKED" } : f.tab === "linked" ? { status: "LINKED" } : {};
  const where: Prisma.AccountAttachmentWhereInput = { AND: [base, tabWhere] };

  const [rows, total, grouped] = await Promise.all([
    prisma.accountAttachment.findMany({
      where,
      include: { document: { select: { id: true, docType: true, docNo: true } } },
      orderBy: { createdAt: f.sortDir ?? "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.accountAttachment.count({ where }),
    prisma.accountAttachment.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
  ]);

  const counts = { all: 0, unlinked: 0, linked: 0 };
  for (const g of grouped) {
    counts.all += g._count._all;
    if (g.status === "UNLINKED") counts.unlinked += g._count._all;
    if (g.status === "LINKED") counts.linked += g._count._all;
  }

  const names = await resolveUploaderNames(tenantId, rows.map((r) => r.uploadedById ?? "").filter(Boolean));

  return {
    rows: rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      fileUrl: r.fileUrl,
      thumbUrl: r.thumbUrl,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      folder: r.folder,
      docTypeHint: r.docTypeHint,
      status: (r.status as AttachmentStatus | null) ?? (r.documentId ? "LINKED" : "UNLINKED"),
      source: r.source as AttachmentSource | null,
      note: r.note,
      createdAt: r.createdAt,
      uploadedById: r.uploadedById,
      uploaderName: r.uploadedById ? (names.get(r.uploadedById) ?? "ไม่ทราบชื่อ") : null,
      document: r.document ? { id: r.document.id, docType: r.document.docType, docNo: r.document.docNo } : null,
      typeLabel: attachmentTypeLabel({ docTypeHint: r.docTypeHint, document: r.document }),
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(Math.ceil(total / pageSize), 1),
    counts,
  };
}

/** ค้นหาเอกสารที่จะแนบไฟล์ด้วย (modal "แนบกับเอกสารที่มีอยู่") — เลขที่ หรือชื่อผู้ติดต่อ */
export async function searchDocumentsForAttach(
  tenantId: string,
  systemId: string,
  q: string,
): Promise<Array<{ id: string; docType: AccountDocType; docNo: string | null; contactName: string | null }>> {
  const query = q.trim();
  if (!query) return [];
  const rows = await prisma.accountDocument.findMany({
    where: {
      tenantId,
      systemId,
      OR: [
        { docNo: { contains: query, mode: "insensitive" } },
        { contact: { is: { name: { contains: query, mode: "insensitive" } } } },
      ],
    },
    select: { id: true, docType: true, docNo: true, contact: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return rows.map((r) => ({ id: r.id, docType: r.docType, docNo: r.docNo, contactName: r.contact?.name ?? null }));
}

/** ผูกไฟล์กับเอกสาร — ป้ายประเภทอัปเดตตามชนิดเอกสารจริงทันที (WO 7.1) */
export async function linkAttachment(
  tenantId: string,
  systemId: string,
  id: string,
  documentId: string,
  actorId?: string | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const a = await prisma.accountAttachment.findFirst({ where: { id, tenantId, systemId } });
  if (!a) return { ok: false, reason: "ไม่พบไฟล์" };
  if (a.archivedAt) return { ok: false, reason: "ไฟล์นี้ถูกลบไปแล้ว — กู้คืนก่อนจึงจะผูกเอกสารได้" };
  const doc = await prisma.accountDocument.findFirst({
    where: { id: documentId, tenantId, systemId },
    select: { id: true, docType: true },
  });
  if (!doc) return { ok: false, reason: "ไม่พบเอกสารที่จะผูก" };
  await prisma.accountAttachment.update({
    where: { id },
    data: { documentId: doc.id, status: "LINKED", docTypeHint: doc.docType },
  });
  await writeAudit({
    tenantId,
    actorId,
    action: "account.document.manage",
    targetType: "AccountAttachment",
    targetId: id,
    after: { linkedTo: documentId },
  });
  return { ok: true };
}

/** แยกไฟล์ออกจากเอกสาร (กลับเป็นไฟล์ลอย) */
export async function unlinkAttachment(
  tenantId: string,
  systemId: string,
  id: string,
  actorId?: string | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const a = await prisma.accountAttachment.findFirst({ where: { id, tenantId, systemId } });
  if (!a) return { ok: false, reason: "ไม่พบไฟล์" };
  await prisma.accountAttachment.update({
    where: { id },
    data: { documentId: null, status: "UNLINKED" },
  });
  await writeAudit({
    tenantId,
    actorId,
    action: "account.document.manage",
    targetType: "AccountAttachment",
    targetId: id,
    after: { unlinked: true },
  });
  return { ok: true };
}

/** เปลี่ยนประเภท (ปุ่มดินสอ ✏ ในตาราง) — กดได้เฉพาะไฟล์ที่ยังไม่ผูกเอกสาร (ผูกแล้วป้ายมาจากเอกสารจริงเสมอ) */
export async function setDocTypeHint(
  tenantId: string,
  systemId: string,
  id: string,
  docTypeHint: string | null,
  actorId?: string | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const a = await prisma.accountAttachment.findFirst({ where: { id, tenantId, systemId } });
  if (!a) return { ok: false, reason: "ไม่พบไฟล์" };
  if (a.documentId) return { ok: false, reason: "ไฟล์นี้ผูกกับเอกสารแล้ว — ประเภทมาจากเอกสารที่ผูกโดยอัตโนมัติ" };
  await prisma.accountAttachment.update({
    where: { id },
    data: {
      docTypeHint: docTypeHint?.trim() || null,
      // เปลี่ยนประเภทออกจาก "ไม่ใช่เอกสารบัญชี" กลับมาเป็นไฟล์ลอยปกติ
      status: a.status === "NOT_ACCOUNTING" ? "UNLINKED" : (a.status as AttachmentStatus | null) ?? "UNLINKED",
    },
  });
  await writeAudit({
    tenantId,
    actorId,
    action: "account.document.manage",
    targetType: "AccountAttachment",
    targetId: id,
    after: { docTypeHint },
  });
  return { ok: true };
}

/** ทำเครื่องหมาย "ไม่ใช่เอกสารบัญชี" (f9-menu) — เฉพาะไฟล์ที่ยังไม่ผูกเอกสาร */
export async function markNotAccounting(
  tenantId: string,
  systemId: string,
  id: string,
  actorId?: string | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const a = await prisma.accountAttachment.findFirst({ where: { id, tenantId, systemId } });
  if (!a) return { ok: false, reason: "ไม่พบไฟล์" };
  if (a.documentId) return { ok: false, reason: "ไฟล์นี้ผูกกับเอกสารอยู่ — แยกออกก่อนจึงจะทำเครื่องหมายนี้ได้" };
  await prisma.accountAttachment.update({ where: { id }, data: { status: "NOT_ACCOUNTING" } });
  await writeAudit({
    tenantId,
    actorId,
    action: "account.document.manage",
    targetType: "AccountAttachment",
    targetId: id,
    after: { notAccounting: true },
  });
  return { ok: true };
}

/** ย้ายโฟลเดอร์หลายไฟล์พร้อมกัน (bulk) */
export async function moveAttachmentsBulk(
  tenantId: string,
  systemId: string,
  ids: string[],
  folder: string | null,
  actorId?: string | null,
): Promise<{ ok: true; count: number }> {
  const clean = [...new Set(ids)].filter(Boolean);
  if (clean.length === 0) return { ok: true, count: 0 };
  const r = await prisma.accountAttachment.updateMany({
    where: { id: { in: clean }, tenantId, systemId },
    data: { folder: folder?.trim() || null },
  });
  await writeAudit({
    tenantId,
    actorId,
    action: "account.document.manage",
    targetType: "AccountAttachment",
    after: { movedIds: clean, folder },
  });
  return { ok: true, count: r.count };
}

/** ลบ (=ลบนุ่ม เสมอ) — ไม่มีทาง hard delete ไฟล์คลังเอกสารจาก UI */
export async function archiveAttachment(
  tenantId: string,
  systemId: string,
  id: string,
  actorId?: string | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const a = await prisma.accountAttachment.findFirst({ where: { id, tenantId, systemId } });
  if (!a) return { ok: false, reason: "ไม่พบไฟล์" };
  await prisma.accountAttachment.update({
    where: { id },
    data: { archivedAt: new Date(), status: "ARCHIVED" },
  });
  await writeAudit({
    tenantId,
    actorId,
    action: "account.document.manage",
    targetType: "AccountAttachment",
    targetId: id,
    after: { archived: true },
  });
  return { ok: true };
}

export async function archiveAttachmentsBulk(
  tenantId: string,
  systemId: string,
  ids: string[],
  actorId?: string | null,
): Promise<{ ok: true; count: number }> {
  const clean = [...new Set(ids)].filter(Boolean);
  if (clean.length === 0) return { ok: true, count: 0 };
  const r = await prisma.accountAttachment.updateMany({
    where: { id: { in: clean }, tenantId, systemId, archivedAt: null },
    data: { archivedAt: new Date(), status: "ARCHIVED" },
  });
  await writeAudit({
    tenantId,
    actorId,
    action: "account.document.manage",
    targetType: "AccountAttachment",
    after: { archivedIds: clean },
  });
  return { ok: true, count: r.count };
}

/** กู้คืนไฟล์ที่ลบไว้ — สถานะกลับตามที่ผูกเอกสารอยู่จริง (ไม่ใช่เดา) */
export async function restoreAttachment(
  tenantId: string,
  systemId: string,
  id: string,
  actorId?: string | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const a = await prisma.accountAttachment.findFirst({ where: { id, tenantId, systemId } });
  if (!a) return { ok: false, reason: "ไม่พบไฟล์" };
  await prisma.accountAttachment.update({
    where: { id },
    data: { archivedAt: null, status: a.documentId ? "LINKED" : "UNLINKED" },
  });
  await writeAudit({
    tenantId,
    actorId,
    action: "account.document.manage",
    targetType: "AccountAttachment",
    targetId: id,
    after: { restored: true },
  });
  return { ok: true };
}
