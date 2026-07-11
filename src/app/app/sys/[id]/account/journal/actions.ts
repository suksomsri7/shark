"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AccountJournalBook } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import { postManualJV } from "@/lib/modules/account/gl";

const satang = (v: FormDataEntryValue | undefined) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

// บันทึกบัญชีด้วยมือ (JV) — account.journal.adjust (OWNER)
export async function postJvAction(formData: FormData) {
  const systemId = String(formData.get("systemId") ?? "");
  const { auth, tenantId, systemId: sid, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.journal.adjust");
  const ctx = { tenantId, systemId: sid };
  const base = `/app/sys/${systemId}/account/journal`;

  const accountIds = formData.getAll("accountId").map((x) => String(x));
  const debits = formData.getAll("debit");
  const credits = formData.getAll("credit");
  const notes = formData.getAll("note").map((x) => String(x));

  const lines = accountIds
    .map((accountId, i) => ({
      accountId,
      debit: satang(debits[i]),
      credit: satang(credits[i]),
      note: notes[i]?.trim() || undefined,
    }))
    .filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));

  const dateStr = String(formData.get("date") ?? "").trim();
  const date = dateStr ? new Date(dateStr) : new Date();
  const memo = String(formData.get("memo") ?? "").trim() || undefined;
  const book = (String(formData.get("book") ?? "GENERAL") as AccountJournalBook) || "GENERAL";

  let entryId: string;
  try {
    entryId = (await postManualJV(ctx, { date, memo, book, postedById: userId, lines })).entryId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "บันทึก JV ไม่สำเร็จ";
    redirect(`${base}/new?err=${encodeURIComponent(msg)}`);
  }
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.journal.adjust",
    targetType: "AccountJournalEntry",
    targetId: entryId,
    after: { book, lineCount: lines.length },
  });
  revalidatePath(base);
  redirect(`${base}?posted=1`);
}
