"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AccountDocType } from "@prisma/client";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, writeAudit } from "./access";
// 🔴 ไม่ import prisma — ทุกการแตะ DB ผ่านชั้น group/service/expense (fitness F5)
import {
  createGroupDoc,
  groupPanelData,
  groupRoute,
  isGroupDocType,
  listGroupCandidates,
  recordGroupPayment,
  voidGroupPayment,
  type GroupCandidate,
  type GroupPanelData,
  type GroupPaymentDraft,
} from "./group";
import { DOC_LABEL } from "./service";
import { EXP_DOC_LABEL } from "./expense";

// ─────────────────────────────────────────────────────────────
// group-actions.ts — server actions ของ §5.2 K (ใบวางบิลรวม BN / ใบรวมจ่าย CP) · WO 1.7
//
// ลำดับความปลอดภัยเหมือน payment-actions.ts เป๊ะ:
//   1) loadAccountSystem(systemId)  → ผูก tenant + ยืนยันว่าระบบนี้เป็น ACCOUNT ของ tenant ที่ล็อกอิน
//   2) assertAccountCan(auth, …)    → สิทธิ์ (`account.doc.create` / `account.payment.record` / `.void`)
//   3) ทุก query ผูก { tenantId, systemId } — id จาก browser เป็นแค่ "คำขอ"
//   4) ยอดเงิน/ยอดค้าง/ความมีสิทธิ์ของใบลูก คำนวณใหม่ฝั่ง server เสมอ (ไม่เชื่อค่าจากฟอร์ม)
// ─────────────────────────────────────────────────────────────

const trim = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export type GroupCandidateRow = {
  id: string;
  docType: AccountDocType;
  docLabel: string;
  docNo: string | null;
  issueDate: string;
  dueDate: string | null;
  grandTotal: number;
  outstanding: number;
  statusLabel: string;
  eligible: boolean;
  blockedReason: string | null;
};

function toRow(c: GroupCandidate, labels: Record<string, string>): GroupCandidateRow {
  return {
    id: c.id,
    docType: c.docType,
    docLabel: labels[c.docType] ?? c.docType,
    docNo: c.docNo,
    issueDate: c.issueDate.toISOString().slice(0, 10),
    dueDate: c.dueDate ? c.dueDate.toISOString().slice(0, 10) : null,
    grandTotal: c.grandTotal,
    outstanding: c.outstanding,
    statusLabel: c.statusLabel,
    eligible: c.eligible,
    blockedReason: c.blockedReason,
  };
}

/** ตารางเอกสารที่เลือกได้ของผู้ติดต่อรายนี้ (§5.2 K — โหลดใหม่ทุกครั้งที่เปลี่ยนผู้ติดต่อ) */
export async function listGroupCandidatesAction(
  systemId: string,
  docType: string,
  contactId: string,
): Promise<GroupCandidateRow[]> {
  const sys = trim(systemId, 40);
  const { auth, tenantId } = await loadAccountSystem(sys);
  assertAccountCan(auth, "account.doc.create");
  const dt = trim(docType, 40) as AccountDocType;
  if (!isGroupDocType(dt)) return [];
  const cid = trim(contactId, 40);
  if (!cid) return [];
  const labels = { ...EXP_DOC_LABEL, ...DOC_LABEL } as Record<string, string>;
  const rows = await listGroupCandidates(tenantId, sys, dt, cid);
  return rows.map((r) => toRow(r, labels));
}

export type CreateGroupActionResult =
  | { ok: true; id: string; docNo: string; total: number; href: string }
  | { ok: false; reason: string };

/** §5.2 K — สร้าง+ออกเอกสารกลุ่ม (BN/CP) จากใบลูกที่ติ๊กไว้ */
export async function createGroupDocAction(
  systemId: string,
  input: {
    docType: string;
    contactId: string;
    issueDate: string;
    dueDate: string | null;
    note: string | null;
    childIds: string[];
  },
): Promise<CreateGroupActionResult> {
  const sys = trim(systemId, 40);
  const { auth, tenantId, userId } = await loadAccountSystem(sys);
  assertAccountCan(auth, "account.doc.create");
  assertAccountCan(auth, "account.doc.issue");
  const dt = trim(input.docType, 40) as AccountDocType;
  if (!isGroupDocType(dt)) return { ok: false, reason: "ชนิดเอกสารไม่ถูกต้อง" };

  const res = await createGroupDoc(tenantId, sys, {
    docType: dt,
    contactId: trim(input.contactId, 40),
    issueDate: trim(input.issueDate, 10),
    dueDate: input.dueDate ? trim(input.dueDate, 10) : null,
    note: input.note ? trim(input.note, 500) : null,
    childIds: (Array.isArray(input.childIds) ? input.childIds : []).slice(0, 200).map((v) => trim(v, 40)),
    createdById: userId,
  });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.issue",
    targetType: "AccountDocument",
    targetId: res.ok ? res.id : dt,
    after: res.ok ? { docNo: res.docNo, total: res.total, children: input.childIds.length } : { error: res.reason },
  });
  if (!res.ok) return res;
  revalidatePath(`/app/sys/${sys}/account`, "layout");
  return {
    ok: true,
    id: res.id,
    docNo: res.docNo,
    total: res.total,
    href: `${groupRoute(`/app/sys/${sys}/account`, dt)}/${res.id}`,
  };
}

/** ข้อมูลตั้งต้นของแผง "รับชำระ/บันทึกจ่าย" ของเอกสารกลุ่ม */
export async function groupPanelDataAction(systemId: string, docId: string): Promise<GroupPanelData | null> {
  const sys = trim(systemId, 40);
  const { auth, tenantId } = await loadAccountSystem(sys);
  assertAccountCan(auth, "account.doc.view");
  return groupPanelData(tenantId, sys, trim(docId, 40));
}

export type RecordGroupPaymentActionResult =
  | {
      ok: true;
      recorded: number;
      status: string;
      outstanding: number;
      certNos: string[];
      allocations: { docNo: string | null; tieOff: number; wht: number; cash: number }[];
    }
  | { ok: false; reason: string };

/** §5.2 K — รับ/จ่าย 1 ครั้งที่กลุ่ม → กระจายลงใบลูกแบบ FIFO ตามวันครบกำหนด */
export async function recordGroupPaymentAction(
  systemId: string,
  docId: string,
  draft: GroupPaymentDraft,
  idempotencyKey: string,
): Promise<RecordGroupPaymentActionResult> {
  const sys = trim(systemId, 40);
  const { auth, tenantId, userId } = await loadAccountSystem(sys);
  assertAccountCan(auth, "account.payment.record");
  const id = trim(docId, 40);
  const res = await recordGroupPayment(
    tenantId,
    sys,
    id,
    {
      paidAt: trim(draft?.paidAt, 10),
      financeAccountId: draft?.financeAccountId ? trim(draft.financeAccountId, 40) : null,
      tieOffSatang: Math.round(Number(draft?.tieOffSatang) || 0),
      note: trim(draft?.note, 20),
      feeSatang: Math.round(Number(draft?.feeSatang) || 0),
      wht: (Array.isArray(draft?.wht) ? draft.wht : []).slice(0, 200),
      cheque: draft?.cheque ?? null,
    },
    { userId, clientKey: trim(idempotencyKey, 60) || `grp-${Date.now()}` },
  );
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.payment.record",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok
      ? { recorded: res.recorded, status: res.status, certNos: res.certNos, batch: res.batchKey }
      : { error: res.reason },
  });
  if (!res.ok) return res;
  revalidatePath(`/app/sys/${sys}/account`, "layout");
  return {
    ok: true,
    recorded: res.recorded,
    status: res.status,
    outstanding: res.outstanding,
    certNos: res.certNos,
    allocations: res.allocations.map((a) => ({ docNo: a.docNo, tieOff: a.tieOff, wht: a.wht, cash: a.cash })),
  };
}

/** §5.2 K — ยกเลิกการชำระ 1 ครั้งของกลุ่ม (กลับรายการของใบลูกทุกใบในครั้งนั้น) */
export async function voidGroupPaymentAction(
  systemId: string,
  docId: string,
  batchKey: string,
  reason: string,
): Promise<{ ok: true; voided: number } | { ok: false; reason: string }> {
  const sys = trim(systemId, 40);
  const { auth, tenantId, userId } = await loadAccountSystem(sys);
  assertAccountCan(auth, "account.payment.void");
  const id = trim(docId, 40);
  const why = trim(reason, 200) || "ยกเลิกการชำระ";
  const res = await voidGroupPayment(tenantId, sys, id, trim(batchKey, 160), why);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.payment.void",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok ? { voided: res.voided, reason: why } : { error: res.reason },
  });
  if (res.ok) revalidatePath(`/app/sys/${sys}/account`, "layout");
  return res;
}

/** ปุ่ม bulk บนหน้ารายการ (form action) — ส่ง id ที่ติ๊กไว้ไปเปิดฟอร์มกลุ่มแบบเติมให้แล้ว */
export async function openGroupFormAction(formData: FormData) {
  const systemId = trim(formData.get("systemId"), 40);
  const docType = trim(formData.get("docType"), 40) as AccountDocType;
  const ids = trim(formData.get("ids"), 4000);
  const { auth } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.create");
  const base = `/app/sys/${systemId}/account`;
  if (!isGroupDocType(docType)) redirect(base);
  redirect(`${groupRoute(base, docType)}/new?ids=${encodeURIComponent(ids)}`);
}
