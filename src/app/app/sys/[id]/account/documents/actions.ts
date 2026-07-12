"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import { createAttachment, deleteAttachment, moveAttachment } from "@/lib/modules/account/attachment";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => {
  const v = Number(fd.get(k));
  return Number.isFinite(v) ? v : 0;
};
const base = (systemId: string) => `/app/sys/${systemId}/account/documents`;

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
  if (!res.ok) redirect(`${base(systemId)}?err=${encodeURIComponent(res.reason)}`);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.document.manage",
    targetType: "AccountAttachment",
    targetId: res.id,
    after: { fileName: str(fd, "fileName"), folder: str(fd, "folder") },
  });
  revalidatePath(base(systemId));
  redirect(`${base(systemId)}?ok=1`);
}

export async function deleteAttachmentAction(fd: FormData) {
  const systemId = str(fd, "systemId");
  const id = str(fd, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  await deleteAttachment(tenantId, systemId, id);
  await writeAudit({ tenantId, actorId: userId, action: "account.document.manage", targetType: "AccountAttachment", targetId: id, after: { deleted: true } });
  revalidatePath(base(systemId));
  redirect(base(systemId));
}

export async function moveAttachmentAction(fd: FormData) {
  const systemId = str(fd, "systemId");
  const id = str(fd, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  await moveAttachment(tenantId, systemId, id, str(fd, "folder") || null);
  await writeAudit({ tenantId, actorId: userId, action: "account.document.manage", targetType: "AccountAttachment", targetId: id });
  revalidatePath(base(systemId));
  redirect(base(systemId));
}
