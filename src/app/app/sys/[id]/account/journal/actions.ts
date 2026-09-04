"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AccountJournalBook } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import {
  createManualEntry,
  reverseJournalEntry,
  toggleNeedsReview,
  type ManualJvLineInput,
} from "@/lib/modules/account/journal-v2";

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
  const res = await createManualEntry(ctx, {
    dateKey: str(fd, "date"),
    book: (str(fd, "book") || "GENERAL") as AccountJournalBook,
    memo: str(fd, "memo") || null,
    lines,
    postedById: userId,
  });

  if (!res.ok) redirect(`${jvBase(systemId)}?err=${encodeURIComponent(res.reason)}&new=1`);

  if (draft) await toggleNeedsReview(ctx, res.entryId, "ร่าง — รอตรวจสอบก่อนปิดงวด");

  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.journal.adjust",
    targetType: "AccountJournalEntry",
    targetId: res.entryId,
    after: { docNo: res.docNo, lineCount: lines.filter((l) => l.accountId).length, draft },
  });
  revalidatePath(jvBase(systemId));
  redirect(`${jvBase(systemId)}?ok=${encodeURIComponent(`บันทึก ${res.docNo} แล้ว`)}`);
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
