"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AccountJournalBook } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import {
  approveJournalEntry,
  createManualEntry,
  JV_DRAFT_FLAG_NOTE,
  reverseJournalEntry,
  toggleNeedsReview,
  type ManualJvLineInput,
} from "@/lib/modules/account/journal-v2";
import { screenAck, withScreenLegal } from "@/lib/modules/account/legal-gate";
import { createAttachment, findAttachmentBySha256, hashBytes, validateAttachmentBytes } from "@/lib/modules/account/attachment";
import { storageEnabled, uploadFile } from "@/lib/storage/service";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
/** ค่าจาก MoneyInput เป็น "สตางค์" (integer) อยู่แล้ว — ห้ามคูณ 100 ซ้ำ */
const satang = (v: FormDataEntryValue | undefined) => {
  const n = Number(String(v ?? "0").trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
};

function jvBase(systemId: string) {
  return `/app/sys/${systemId}/account/journal`;
}

/**
 * ACC T4.1 ▸ ไฟล์แนบของ JV จากฟอร์ม (ช่อง `files`) — ตรวจไบต์จริง · ไฟล์เดิม (sha256) ใช้แถวเดิม · คืน id ที่จะผูกกับ JV
 *   ไม่มีที่เก็บไฟล์ / ไฟล์ผิดชนิด = ข้อความไทย (ไม่บันทึก JV ครึ่ง ๆ) ◂
 */
async function uploadJvFiles(fd: FormData, tenantId: string, systemId: string, userId: string): Promise<{ ok: true; ids: string[] } | { ok: false; reason: string }> {
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: true, ids: [] };
  if (!storageEnabled()) return { ok: false, reason: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (storage) — แนบไฟล์ไม่ได้ ลองบันทึกโดยไม่แนบไฟล์แล้วแนบภายหลังที่คลังเอกสาร" };
  const ids: string[] = [];
  for (const file of files.slice(0, 20)) {
    const data = new Uint8Array(await file.arrayBuffer());
    const v = validateAttachmentBytes(file.type, data);
    if (!v.ok) return { ok: false, reason: `${file.name}: ${v.reason}` };
    const sha256 = hashBytes(data);
    const dup = await findAttachmentBySha256(tenantId, systemId, sha256);
    if (dup) {
      ids.push(dup.id);
      continue;
    }
    const up = await uploadFile({ tenantId }, { kind: "ATTACHMENT", filename: file.name, contentType: v.mimeType, data });
    if (!up.ok) return { ok: false, reason: `${file.name}: ${up.error}` };
    const att = await createAttachment({ tenantId, systemId, fileName: file.name.slice(0, 200), fileUrl: up.cdnUrl, mimeType: v.mimeType, sizeBytes: data.length, uploadedById: userId, sha256, source: "UPLOAD" });
    if (!att.ok) return { ok: false, reason: `${file.name}: ${att.reason}` };
    ids.push(att.id);
  }
  return { ok: true, ids };
}

/**
 * สร้าง JV ด้วยมือ (§11.2 · g16-journal-modal.png) — `account.journal.adjust`
 * mode = "POST" (อนุมัติ) | "DRAFT" (บันทึกร่าง)
 * 🔴 ทำไม "บันทึกร่าง" ถึงลงบัญชีจริงแต่ติดธง ⚑: สมุดรายวันเป็น ledger ที่แก้ไม่ได้ (immutable — BLUEPRINT §0.1)
 *    สคีมาไม่มีสถานะ "ร่าง" และ WO นี้ห้ามเพิ่มสถานะใหม่ ⇒ ความหมายที่ใกล้ที่สุดและ "มีผลจริง" คือ
 *    ติดธงต้องตรวจ ซึ่ง **บล็อกการปิดงวด** จนกว่าจะมีคนตรวจแล้วปลดธง (ดู closePeriod ข้อ 2)
 */
export async function createJvAction(fd: FormData): Promise<void> {
  const systemId = str(fd, "systemId");
  const { auth, tenantId, systemId: sid, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.journal.adjust");
  const ctx = { tenantId, systemId: sid };

  const accountIds = fd.getAll("accountId").map(String);
  const debits = fd.getAll("debit");
  const credits = fd.getAll("credit");
  const contactIds = fd.getAll("contactId").map(String);
  const notes = fd.getAll("note").map(String);

  const lines: ManualJvLineInput[] = accountIds.map((accountId, i) => ({
    accountId,
    debit: satang(debits[i]),
    credit: satang(credits[i]),
    contactId: contactIds[i] || null,
    note: notes[i] || null,
  }));

  const draft = str(fd, "mode") === "DRAFT";
  // ACC T4.1 ▸ ไฟล์แนบ (เอกสารประกอบ ข้อ 13) — อัปโหลดก่อนลงบัญชี ◂
  const up = await uploadJvFiles(fd, tenantId, sid, userId);
  if (!up.ok) redirect(`${jvBase(systemId)}?err=${encodeURIComponent(up.reason)}&new=1`);
  // ACC T1.7 ▸ บริบทการยืนยัน: ลงเดือนที่ยื่นแล้ว = ต้องติ๊กยืนยันในฟอร์ม (ack) · ไม่ติ๊ก = กลับมาพร้อมคำเตือน ◂
  // ACC T4.1 ▸ คำอธิบายว่าง = ต้องติ๊กยืนยัน · ปุ่ม "อนุมัติ" = บันทึกผู้กดเป็นผู้อนุมัติ · "บันทึกร่าง" = ยังไม่อนุมัติ + ธงร่าง ◂
  const res = await withScreenLegal(screenAck(fd.getAll("ack"), userId), () =>
    createManualEntry(ctx, {
      dateKey: str(fd, "date"),
      book: (str(fd, "book") || "GENERAL") as AccountJournalBook,
      memo: str(fd, "memo") || null,
      lines,
      postedById: userId,
      attachmentIds: up.ids,
      approvedById: draft ? null : userId,
    }),
  );

  if (!res.ok) redirect(`${jvBase(systemId)}?err=${encodeURIComponent(res.reason)}&new=1`);

  if (draft) await toggleNeedsReview(ctx, res.entryId, JV_DRAFT_FLAG_NOTE);

  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.journal.adjust",
    targetType: "AccountJournalEntry",
    targetId: res.entryId,
    after: { docNo: res.docNo, lineCount: lines.filter((l) => l.accountId).length, draft, approved: res.approved, attachments: up.ids.length },
  });
  revalidatePath(jvBase(systemId));
  // ACC T4.1 ▸ ไปหน้ารายการใบที่เพิ่งบันทึก — คำเตือนแจ้งให้ทราบ (ลงช้า · ไม่มีเอกสารประกอบ · ยังไม่อนุมัติ) แสดงที่นั่น ◂
  redirect(`${jvBase(systemId)}/${res.entryId}?ok=${encodeURIComponent(`บันทึก ${res.docNo} แล้ว`)}`);
}

/** ACC T4.1 ▸ อนุมัติ JV มือ — ผู้กด = ผู้อนุมัติ (ข้อ 11) · สิทธิ์เดียวกับแก้สมุด ◂ */
export async function approveJvAction(fd: FormData): Promise<void> {
  const systemId = str(fd, "systemId");
  const { auth, tenantId, systemId: sid, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.journal.adjust");
  const entryId = str(fd, "entryId");
  const res = await approveJournalEntry({ tenantId, systemId: sid }, entryId, userId);
  const back = `${jvBase(systemId)}/${entryId}`;
  if (!res.ok) redirect(`${back}?err=${encodeURIComponent(res.reason)}`);
  await writeAudit({ tenantId, actorId: userId, action: "account.journal.approve", targetType: "AccountJournalEntry", targetId: entryId, after: { docNo: res.docNo, flagCleared: res.flagCleared } });
  revalidatePath(jvBase(systemId));
  redirect(`${back}?ok=${encodeURIComponent(`อนุมัติ ${res.docNo} แล้ว${res.flagCleared ? " · ปลดธงร่างแล้ว" : ""}`)}`);
}

/** กลับรายการใบสำคัญ (§11.2) — สิทธิ์เดียวกับ JV มือ (แก้ตัวเลขในสมุด) */
export async function reverseJvAction(fd: FormData): Promise<void> {
  const systemId = str(fd, "systemId");
  const { auth, tenantId, systemId: sid, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.journal.adjust");
  const entryId = str(fd, "entryId");
  const reason = str(fd, "reason");

  const res = await reverseJournalEntry({ tenantId, systemId: sid }, entryId, reason);
  const back = `${jvBase(systemId)}/${entryId}`;
  if (!res.ok) redirect(`${back}?err=${encodeURIComponent(res.reason)}`);

  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.journal.reverse",
    targetType: "AccountJournalEntry",
    targetId: entryId,
    after: { reversalDocNo: res.docNo, reason },
  });
  revalidatePath(jvBase(systemId));
  redirect(`${jvBase(systemId)}/${res.entryId}?ok=${encodeURIComponent(`กลับรายการแล้ว (${res.docNo})`)}`);
}

/** ติด/ปลดธง ⚑ ต้องตรวจ (§11.2) — ธงนี้บล็อกการปิดงวด จึงต้องมีสิทธิ์ระดับแก้สมุด */
export async function toggleFlagAction(fd: FormData): Promise<void> {
  const systemId = str(fd, "systemId");
  const { auth, tenantId, systemId: sid, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.journal.adjust");
  const entryId = str(fd, "entryId");

  const res = await toggleNeedsReview({ tenantId, systemId: sid }, entryId, str(fd, "note") || null);
  const back = `${jvBase(systemId)}/${entryId}`;
  if (!res.ok) redirect(`${back}?err=${encodeURIComponent(res.reason)}`);

  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.journal.flag",
    targetType: "AccountJournalEntry",
    targetId: entryId,
    after: { needsReview: res.needsReview },
  });
  revalidatePath(jvBase(systemId));
  redirect(`${back}?ok=${encodeURIComponent(res.needsReview ? "ติดธงต้องตรวจแล้ว" : "ปลดธงแล้ว")}`);
}
