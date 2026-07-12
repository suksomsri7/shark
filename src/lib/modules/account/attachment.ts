import { prisma } from "@/lib/core/db";

// ─────────────────────────────────────────────────────────────
// attachment.ts — คลังเอกสาร (§3.7)
// จัดการ AccountAttachment: แนบไฟล์กับเอกสาร + คลังกลาง (ไฟล์ลอย documentId=null)
// v1: ยังไม่มี upload service → รับ URL (วาง URL ไฟล์) + ชื่อ/ชนิด/ขนาด
//     (dependency: object storage ยังไม่มี — เก็บ fileUrl เป็นลิงก์ภายนอก)
// จัดโฟลเดอร์ (string) + ค้นหา (ชื่อไฟล์) + กรองโฟลเดอร์
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

// ─────────────────── อ่าน ───────────────────

export function listAttachments(
  tenantId: string,
  systemId: string,
  opts?: { folder?: string | null; q?: string; documentId?: string | null; centralOnly?: boolean },
) {
  return prisma.accountAttachment.findMany({
    where: {
      tenantId,
      systemId,
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
    where: { tenantId, systemId },
    _count: { _all: true },
  });
  return rows
    .filter((r): r is typeof r & { folder: string } => !!r.folder)
    .map((r) => ({ folder: r.folder, count: r._count._all }))
    .sort((a, b) => a.folder.localeCompare(b.folder, "th"));
}

// ─────────────────── เขียน ───────────────────

export async function createAttachment(
  input: AttachmentInput,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const fileName = input.fileName.trim();
  const fileUrl = input.fileUrl.trim();
  if (!fileName) return { ok: false, reason: "กรุณากรอกชื่อไฟล์" };
  if (!/^https?:\/\//i.test(fileUrl))
    return { ok: false, reason: "กรุณาวาง URL ไฟล์ที่ขึ้นต้นด้วย http(s)://" };
  // ผูกกับเอกสาร (ถ้าระบุ) ต้องเป็นเอกสารของระบบนี้
  if (input.documentId) {
    const doc = await prisma.accountDocument.findFirst({
      where: { id: input.documentId, tenantId: input.tenantId, systemId: input.systemId },
      select: { id: true },
    });
    if (!doc) return { ok: false, reason: "ไม่พบเอกสารที่จะแนบ" };
  }
  const a = await prisma.accountAttachment.create({
    data: {
      tenantId: input.tenantId,
      systemId: input.systemId,
      documentId: input.documentId || null,
      folder: input.folder?.trim() || null,
      fileName,
      fileUrl,
      mimeType: input.mimeType?.trim() || guessMime(fileName, fileUrl),
      sizeBytes: Math.max(0, Math.round(input.sizeBytes ?? 0)),
      uploadedById: input.uploadedById || null,
    },
    select: { id: true },
  });
  return { ok: true, id: a.id };
}

export async function deleteAttachment(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const a = await prisma.accountAttachment.findFirst({ where: { id, tenantId, systemId } });
  if (!a) return { ok: false, reason: "ไม่พบไฟล์" };
  await prisma.accountAttachment.delete({ where: { id } });
  return { ok: true };
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
