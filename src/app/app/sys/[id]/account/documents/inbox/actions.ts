"use server";

// WO 7.2 — server actions ของกล่องขาเข้า (§12 · g15/g20)
// ทุกตัวผ่าน `loadAccountSystem` + `assertAccountCan` ก่อนแตะข้อมูล (กติกาเดียวกับ documents/actions.ts)

import { revalidatePath } from "next/cache";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { readBill, readPendingInbox } from "@/lib/modules/account/inbox-ai";
import { createExpenseFromAttachment, type CreateExpenseOverrides } from "@/lib/modules/account/inbox";
import { archiveAttachment } from "@/lib/modules/account/attachment";

const inboxPath = (systemId: string) => `/app/sys/${systemId}/account/documents/inbox`;

/** อ่านบิลใบเดียว (ปุ่ม "อ่านด้วย AI" / "อ่านใหม่") — force = อ่านซ้ำแม้เคยอ่านสำเร็จแล้ว */
export async function readBillAction(systemId: string, attachmentId: string, force?: boolean) {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const res = await readBill({ tenantId, systemId }, attachmentId, { force: !!force, userId });
  revalidatePath(inboxPath(systemId));
  return { status: res.status, reason: res.reason };
}

/** ปุ่ม "อ่านด้วย AI ทั้งหมด" — ครั้งละไม่เกิน 10 ใบ (กันเครดิตหมดรวดเดียว) */
export async function readAllPendingAction(systemId: string) {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const res = await readPendingInbox({ tenantId, systemId }, { userId });
  revalidatePath(inboxPath(systemId));
  return res;
}

/** ยืนยันแผ่น "สร้างบันทึกค่าใช้จ่าย" → ได้ร่าง EXP + ผูกไฟล์ (คืน docId ให้หน้าจอพาไปหน้าแก้ไข) */
export async function createExpenseFromAttachmentAction(
  systemId: string,
  attachmentId: string,
  overrides: CreateExpenseOverrides,
) {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.create");
  const res = await createExpenseFromAttachment({ tenantId, systemId }, attachmentId, overrides, userId);
  if (res.ok) {
    revalidatePath(inboxPath(systemId));
    revalidatePath(`/app/sys/${systemId}/account/documents`);
  }
  return res;
}

/** ปุ่ม "ลบ" บนการ์ดที่ AI อ่านไม่ได้ (g20 มือถือ) — ลบนุ่มเสมอ (กู้คืนได้) */
export async function archiveInboxFileAction(systemId: string, attachmentId: string) {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const r = await archiveAttachment(tenantId, systemId, attachmentId, userId);
  if (r.ok) revalidatePath(inboxPath(systemId));
  return r;
}
