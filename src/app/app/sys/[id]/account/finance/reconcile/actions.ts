"use server";

// server actions ของหน้า "กระทบยอดธนาคาร" (WO 5.3 · DESIGN-SPEC-V2 §10.2 · เฟรม g10)
// เรียกตรงจาก client component แบบเดียวกับ petty-cash/actions.ts (WO 5.2) — คืน object ให้โชว์ error inline
//
// สิทธิ์: ทุก action ที่ "เขียน" ต้องมี `account.reconcile`
//   (คนที่มี `account.finance.manage` ได้สิทธิ์นี้ตามตาราง IMPLIES ใน access.ts — สิทธิ์เดิมไม่หาย)
//   เปิดกลับเดือนที่ยืนยันแล้ว = `account.period.reopen` (สิทธิ์ระดับเจ้าของ)

import { revalidatePath } from "next/cache";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import {
  previewStatementImport,
  importStatement,
  autoMatch,
  manualMatch,
  unmatch,
  skipLine,
  createEntryFromLine,
  confirmMonth,
  reopenMonth,
  type ImportPreview,
  type CreateEntryKind,
} from "@/lib/modules/account/reconcile";
import type { BankSource } from "@/lib/modules/account/bank-statement-csv";

export type SimpleResult = { ok: true } | { ok: false; reason: string };

/** เพดานขนาดไฟล์ statement ที่รับผ่าน server action (ตัวอักษร ≈ ไบต์ของ UTF-8 ส่วนใหญ่) */
const MAX_TEXT_LENGTH = 4 * 1024 * 1024;

function revalidate(systemId: string) {
  revalidatePath(`/app/sys/${systemId}/account/finance/reconcile`);
  revalidatePath(`/app/sys/${systemId}/account/finance/overview`);
}

export type ImportPayload = {
  financeId: string;
  periodKey: string;
  source: BankSource;
  fileName: string;
  text: string;
};

export async function previewStatementAction(
  systemId: string,
  payload: ImportPayload,
): Promise<{ ok: true; preview: ImportPreview } | { ok: false; reason: string }> {
  const { auth, tenantId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.reconcile");
  if (payload.text.length > MAX_TEXT_LENGTH) return { ok: false, reason: "ไฟล์ใหญ่เกิน 4 MB — แบ่งไฟล์ก่อนนำเข้า" };
  const res = await previewStatementImport({ tenantId, systemId }, payload);
  if ("ok" in res) return res;
  return { ok: true, preview: res };
}

export async function importStatementAction(
  systemId: string,
  payload: ImportPayload,
): Promise<{ ok: true; imported: number; duplicates: number; matched: number; suggested: number; unmatched: number } | { ok: false; reason: string }> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.reconcile");
  if (payload.text.length > MAX_TEXT_LENGTH) return { ok: false, reason: "ไฟล์ใหญ่เกิน 4 MB — แบ่งไฟล์ก่อนนำเข้า" };

  const res = await importStatement({ tenantId, systemId }, { ...payload, userId });
  if ("ok" in res && res.ok === false) return res;
  if (!("statementId" in res)) return { ok: false, reason: "นำเข้าไม่สำเร็จ" };

  // นำเข้าเสร็จ จับคู่อัตโนมัติให้ทันที (§10.2 — ผู้ใช้เห็นผลรอบเดียว)
  const auto = await autoMatch({ tenantId, systemId }, res.statementId, userId);
  revalidate(systemId);
  if ("ok" in auto && auto.ok === true) {
    return { ok: true, imported: res.imported, duplicates: res.duplicates, matched: auto.matched + auto.created, suggested: auto.suggested, unmatched: auto.unmatched };
  }
  return { ok: true, imported: res.imported, duplicates: res.duplicates, matched: 0, suggested: 0, unmatched: 0 };
}

export async function autoMatchAction(systemId: string, statementId: string): Promise<SimpleResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.reconcile");
  const res = await autoMatch({ tenantId, systemId }, statementId, userId);
  revalidate(systemId);
  return "ok" in res && res.ok === true ? { ok: true } : (res as SimpleResult);
}

export async function manualMatchAction(systemId: string, lineId: string, journalLineId: string): Promise<SimpleResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.reconcile");
  const res = await manualMatch({ tenantId, systemId }, { lineId, journalLineId, userId });
  revalidate(systemId);
  return res;
}

export async function unmatchAction(systemId: string, lineId: string): Promise<SimpleResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.reconcile");
  const res = await unmatch({ tenantId, systemId }, { lineId, userId });
  revalidate(systemId);
  return res;
}

export async function skipLineAction(systemId: string, lineId: string, reason?: string): Promise<SimpleResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.reconcile");
  const res = await skipLine({ tenantId, systemId }, { lineId, reason, userId });
  revalidate(systemId);
  return res;
}

export type CreateEntryPayload = { lineId: string; kind: CreateEntryKind; accountCode?: string; note?: string };

export async function createEntryFromLineAction(systemId: string, payload: CreateEntryPayload): Promise<SimpleResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.reconcile");
  const res = await createEntryFromLine({ tenantId, systemId }, { ...payload, userId });
  revalidate(systemId);
  return "ok" in res && res.ok === true ? { ok: true } : (res as SimpleResult);
}

export async function confirmMonthAction(systemId: string, financeId: string, periodKey: string): Promise<SimpleResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.reconcile");
  const res = await confirmMonth({ tenantId, systemId }, { financeId, periodKey, userId });
  revalidate(systemId);
  return "ok" in res && res.ok === true ? { ok: true } : (res as SimpleResult);
}

export async function reopenMonthAction(systemId: string, financeId: string, periodKey: string, reason?: string): Promise<SimpleResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  // เปิดกลับ = ปลดล็อกงานที่ปิดไปแล้ว → ใช้สิทธิ์เดียวกับ "เปิดงวดบัญชีที่ปิดไปแล้ว"
  assertAccountCan(auth, "account.period.reopen");
  const res = await reopenMonth({ tenantId, systemId }, { financeId, periodKey, reason, userId });
  revalidate(systemId);
  return res;
}
