"use server";

import { revalidatePath } from "next/cache";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import {
  createAttachment,
  deleteAttachment,
  moveAttachment,
  moveAttachmentsBulk,
  archiveAttachment,
  archiveAttachmentsBulk,
  restoreAttachment,
  linkAttachment,
  unlinkAttachment,
  setDocTypeHint,
  markNotAccounting,
  searchDocumentsForAttach,
  validateAttachmentUpload,
  hashBytes,
  findAttachmentBySha256,
} from "@/lib/modules/account/attachment";
import { uploadFile, storageEnabled } from "@/lib/storage/service";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => {
  const v = Number(fd.get(k));
  return Number.isFinite(v) ? v : 0;
};
const base = (systemId: string) => `/app/sys/${systemId}/account/documents`;

// ─────────────────── V1 (ยังเก็บไว้ — DocAttachments/editor-actions ยังอ้างอิง createAttachment/deleteAttachment/moveAttachment ตรง ๆ) ───────────────────

export async function addAttachmentAction(fd: FormData) {
  const systemId = str(fd, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const res = await createAttachment({
    tenantId,
    systemId,
    documentId: str(fd, "documentId") || null,
    folder: str(fd, "folder") || null,
    fileName: str(fd, "fileName"),
    fileUrl: str(fd, "fileUrl"),
    mimeType: str(fd, "mimeType") || null,
    sizeBytes: Math.round(num(fd, "sizeBytes") * 1024), // ฟอร์มกรอกเป็น KB
    uploadedById: userId,
  });
  revalidatePath(base(systemId));
  return res;
}

// ─────────────────── WO 7.1 — อัปโหลดจริงหลายไฟล์ (dropzone banner + modal) ───────────────────

export type UploadAttachmentResult =
  | { ok: true; id: string; fileName: string; fileUrl: string; mimeType: string; sizeBytes: number; duplicate?: boolean }
  | { ok: false; fileName: string; reason: string };

/** อัปโหลดหลายไฟล์พร้อมกัน — คืนผลลัพธ์ต่อไฟล์ (ไฟล์ที่ผิดชนิด/ใหญ่เกิน = ok:false เฉพาะไฟล์นั้น ไฟล์อื่นในชุดยังอัปต่อ) */
export async function uploadAttachmentsAction(formData: FormData): Promise<UploadAttachmentResult[]> {
  const systemId = str(formData, "systemId");
  const folder = str(formData, "folder") || null;
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return [];

  if (!storageEnabled()) {
    return files.map((f) => ({ ok: false, fileName: f.name, reason: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (storage) — ติดต่อผู้ดูแลระบบ" }));
  }

  const results: UploadAttachmentResult[] = [];
  for (const file of files) {
    const data = new Uint8Array(await file.arrayBuffer());
    const validate = validateAttachmentUpload(file.type, data.length);
    if (!validate.ok) {
      results.push({ ok: false, fileName: file.name, reason: validate.reason });
      continue;
    }
    const sha256 = hashBytes(data);
    const dup = await findAttachmentBySha256(tenantId, systemId, sha256);
    if (dup) {
      results.push({
        ok: true,
        id: dup.id,
        fileName: dup.fileName,
        fileUrl: dup.fileUrl,
        mimeType: dup.mimeType,
        sizeBytes: dup.sizeBytes,
        duplicate: true,
      });
      continue;
    }
    const up = await uploadFile({ tenantId }, { kind: "ATTACHMENT", filename: file.name, contentType: file.type, data });
    if (!up.ok) {
      results.push({ ok: false, fileName: file.name, reason: up.error });
      continue;
    }
    const att = await createAttachment({
      tenantId,
      systemId,
      folder,
      fileName: file.name.slice(0, 200),
      fileUrl: up.cdnUrl,
      mimeType: file.type,
      sizeBytes: data.length,
      uploadedById: userId,
      sha256,
      source: "UPLOAD",
    });
    if (!att.ok) {
      results.push({ ok: false, fileName: file.name, reason: att.reason });
      continue;
    }
    results.push({ ok: true, id: att.id, fileName: file.name, fileUrl: up.cdnUrl, mimeType: file.type, sizeBytes: data.length });
  }
  revalidatePath(base(systemId));
  return results;
}

// ─────────────────── ผูก/แยก/เปลี่ยนประเภท/ไม่ใช่เอกสารบัญชี ───────────────────

export async function linkAttachmentAction(systemId: string, id: string, documentId: string) {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const r = await linkAttachment(tenantId, systemId, id, documentId, userId);
  if (r.ok) revalidatePath(base(systemId));
  return r;
}

export async function unlinkAttachmentAction(systemId: string, id: string) {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const r = await unlinkAttachment(tenantId, systemId, id, userId);
  if (r.ok) revalidatePath(base(systemId));
  return r;
}

export async function setDocTypeHintAction(systemId: string, id: string, hint: string | null) {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const r = await setDocTypeHint(tenantId, systemId, id, hint, userId);
  if (r.ok) revalidatePath(base(systemId));
  return r;
}

export async function markNotAccountingAction(systemId: string, id: string) {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const r = await markNotAccounting(tenantId, systemId, id, userId);
  if (r.ok) revalidatePath(base(systemId));
  return r;
}

export async function searchDocumentsForAttachAction(systemId: string, q: string) {
  const { auth, tenantId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  return searchDocumentsForAttach(tenantId, systemId, q);
}

// ─────────────────── ย้ายโฟลเดอร์ (เดี่ยว/หลายไฟล์) ───────────────────

export async function moveAttachmentAction(systemId: string, id: string, folder: string | null) {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const r = await moveAttachment(tenantId, systemId, id, folder);
  if (r.ok) revalidatePath(base(systemId));
  void userId; // ยังไม่มี audit ต่อการย้ายโฟลเดอร์เดี่ยว (ของเดิม V1 ก็ไม่มี) — bulk มี writeAudit อยู่แล้ว
  return r;
}

export async function moveAttachmentsBulkAction(systemId: string, ids: string[], folder: string | null) {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const r = await moveAttachmentsBulk(tenantId, systemId, ids, folder, userId);
  revalidatePath(base(systemId));
  return r;
}

// ─────────────────── ลบ (ลบนุ่ม) / กู้คืน ───────────────────

/** ConfirmDialog action signature (formData) — ใช้กับปุ่ม "ลบไฟล์" ต่อแถว */
export async function archiveAttachmentAction(fd: FormData) {
  const systemId = str(fd, "systemId");
  const id = str(fd, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  await archiveAttachment(tenantId, systemId, id, userId);
  revalidatePath(base(systemId));
}

export async function archiveAttachmentsBulkAction(systemId: string, ids: string[]) {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const r = await archiveAttachmentsBulk(tenantId, systemId, ids, userId);
  revalidatePath(base(systemId));
  return r;
}

export async function restoreAttachmentAction(systemId: string, id: string) {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const r = await restoreAttachment(tenantId, systemId, id, userId);
  if (r.ok) revalidatePath(base(systemId));
  return r;
}

// ─────────────────── V1 เดิม (ยังใช้ได้ — เผื่อลิงก์เก่า/ที่อื่นอ้างอิง) ───────────────────

export async function deleteAttachmentAction(fd: FormData) {
  const systemId = str(fd, "systemId");
  const id = str(fd, "id");
  const { auth, tenantId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  await deleteAttachment(tenantId, systemId, id);
  revalidatePath(base(systemId));
}
