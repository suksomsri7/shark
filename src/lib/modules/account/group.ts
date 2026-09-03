import type { AccountDocType, AccountPayChannel, AccountWhtIncomeType } from "@prisma/client";
import {
  DOC_LABEL,
  STATUS_LABEL,
  baht,
  createGroupDocument,
  findGroupChildPayments,
  getGroupDocHead,
  groupCandidateDocs,
  groupChildDocs,
  issueDocument,
  openGroupOfChild,
  recordPayment,
  updateGroupProgress,
  voidPayment,
  type GroupChildDoc,
  type GroupRelType,
} from "./service";
import { EXP_DOC_LABEL, issueExpenseDoc, recordVendorPayment, voidVendorPayment } from "./expense";
import { listPaymentChannels, type FinanceOption } from "./payment";
import { createCheque } from "./cheque";
import { formatDateTh } from "@/lib/ui/date";

// ─────────────────────────────────────────────────────────────────────────
// group.ts — WO 1.7 · "ใบวางบิลรวม (BN)" + "ใบรวมจ่าย (CP)"
// DESIGN-SPEC-V2 §5.2 K + §3 (แถว BN / CP) · relation BILL / PAY_GROUP ที่ประกาศไว้ตั้งแต่ schema เดิม
//
// แนวคิด: เอกสารกลุ่ม = **ใบสรุปยอด** ไม่ใช่รายการบัญชีใหม่
//   • สร้าง BN/CP → ไม่มี JV เลย (ลูกหนี้/เจ้าหนี้ตั้งไว้ที่ใบลูกแล้ว — gl.ts NO_GL ทั้ง 2 ชนิด)
//   • รับ/จ่าย 1 ครั้งที่กลุ่ม → กระจายเป็นการชำระของ "ใบลูก" ทีละใบ ผ่านบริการเดิมของ WO 1.4
//     (service.recordPayment / expense.recordVendorPayment) ⇒ ใบลูกได้ JV/WHT/50 ทวิ/สถานะของตัวเอง ครบ
//   • ผลรวม JV จึงเป็น: BN → Dr เงิน Σ · Cr 1100 แยกตามใบแจ้งหนี้ · CP → Dr 2100 Σ · Cr เงิน + Cr 2130
//   • สถานะกลุ่มเป็น **ค่าที่คำนวณจากใบลูก** (updateGroupProgress) — ไม่ใช่ตัวนับแยกที่หลุดจากความจริงได้
//
// 🔴 ไฟล์นี้ไม่ import prisma (fitness F5) — ทุกการแตะ DB ผ่าน service/expense/cheque
// 🔴 ไฟล์นี้ไม่เขียน posting เอง — posting อยู่ที่ gl.ts ผ่านบริการชำระเงินของใบลูกเท่านั้น
// ─────────────────────────────────────────────────────────────────────────

export type GroupSide = "revenue" | "expense";

export type GroupDefinition = {
  docType: AccountDocType;
  side: GroupSide;
  direction: "IN" | "OUT";
  relType: GroupRelType;
  /** ชนิดใบลูกที่หยิบเข้ากลุ่มได้ (§5.2 K) */
  childTypes: readonly AccountDocType[];
  label: string;
  /** ป้ายบนหน้าจอของฝั่งนั้น */
  texts: {
    payAction: string;
    childrenTitle: string;
    memberChip: string;
    contactLabel: string;
    outstandingLabel: string;
    totalLabel: string;
    dueLabel: string;
  };
};

export const GROUP_DEFS: Record<string, GroupDefinition> = {
  BILLING_NOTE: {
    docType: "BILLING_NOTE",
    side: "revenue",
    direction: "OUT",
    relType: "BILL",
    childTypes: ["INVOICE"],
    label: "ใบวางบิล",
    texts: {
      payAction: "รับชำระ",
      childrenTitle: "เอกสารในใบวางบิล",
      memberChip: "อยู่ในใบวางบิล",
      contactLabel: "ลูกค้า",
      outstandingLabel: "ค้างชำระ",
      totalLabel: "รวมยอดที่เลือก",
      dueLabel: "กำหนดชำระ",
    },
  },
  COMBINED_PAYMENT: {
    docType: "COMBINED_PAYMENT",
    side: "expense",
    direction: "IN",
    relType: "PAY_GROUP",
    // §5.2 K: บิลค้างจ่ายของผู้ขายรายเดียวกัน — บันทึกซื้อ · ค่าใช้จ่าย · รับใบเพิ่มหนี้ · ใบจ่ายเงินมัดจำ
    childTypes: ["PURCHASE", "EXPENSE", "DEBIT_NOTE_RECEIVED", "DEPOSIT_PAYMENT"],
    label: "ใบรวมจ่าย",
    texts: {
      payAction: "บันทึกจ่าย",
      childrenTitle: "เอกสารในใบรวมจ่าย",
      memberChip: "อยู่ในใบรวมจ่าย",
      contactLabel: "ผู้ขาย",
      outstandingLabel: "ค้างจ่าย",
      totalLabel: "รวมยอดที่เลือก",
      dueLabel: "กำหนดชำระ",
    },
  },
};

export const GROUP_DOC_TYPES: readonly AccountDocType[] = ["BILLING_NOTE", "COMBINED_PAYMENT"];

export function isGroupDocType(docType: AccountDocType | string): boolean {
  return docType === "BILLING_NOTE" || docType === "COMBINED_PAYMENT";
}

export function groupDefOf(docType: AccountDocType | string): GroupDefinition | undefined {
  return GROUP_DEFS[docType];
}

export function groupRoute(base: string, docType: AccountDocType): string {
  return docType === "BILLING_NOTE" ? `${base}/docs/BILLING_NOTE` : `${base}/combined-payment`;
}

const childLabelOf = (dt: AccountDocType) => DOC_LABEL[dt] ?? EXP_DOC_LABEL[dt] ?? dt;

// ─────────────────── ① ฟอร์มสร้าง: ใบลูกที่หยิบได้ ───────────────────

export type GroupCandidate = GroupChildDoc & { eligible: boolean; blockedReason: string | null };

/**
 * รายการเอกสารที่ผู้ใช้ติ๊กเลือกได้ในฟอร์มกลุ่ม
 * เกณฑ์ (§5.2 K): ผู้ติดต่อรายเดียวกัน · ชนิดตามฝั่ง · ยังค้างชำระจริง · ยังไม่อยู่ในกลุ่มที่เปิดอยู่
 * ⇒ ใบที่อยู่ในกลุ่มอื่นแล้วยัง "คืนมา" ด้วย แต่ติดธง eligible:false + เหตุผล (ผู้ใช้ต้องเห็นว่าทำไมหาย)
 */
export async function listGroupCandidates(
  tenantId: string,
  systemId: string,
  docType: AccountDocType,
  contactId: string,
  opts?: { ids?: string[]; ignoreGroupId?: string },
): Promise<GroupCandidate[]> {
  const def = groupDefOf(docType);
  if (!def || !contactId) return [];
  const rows = await groupCandidateDocs(tenantId, systemId, {
    docTypes: def.childTypes,
    relType: def.relType,
    contactId,
    ids: opts?.ids,
    ignoreGroupId: opts?.ignoreGroupId,
  });
  return rows
    .filter((r) => r.outstanding > 0)
    .map((r) => ({
      ...r,
      eligible: r.groupDocId === null,
      blockedReason: r.groupDocId
        ? `อยู่ใน${childLabelOf(r.groupDocType ?? docType)} ${r.groupDocNo ?? "(ร่าง)"} แล้ว`
        : null,
    }));
}

/**
 * เติมฟอร์มจากปุ่ม bulk บนหน้ารายการ (`?ids=…`) — หา "ผู้ติดต่อร่วม" ของ id ที่ส่งมา
 * id ที่ไม่ตรงเงื่อนไข/คนละผู้ติดต่อ จะถูกตัดออก (ผู้ติดต่อ = รายที่พบมากที่สุดในชุดที่ส่งมา)
 */
export async function groupSeedFromIds(
  tenantId: string,
  systemId: string,
  docType: AccountDocType,
  ids: string[],
): Promise<{ contactId: string; contactName: string; selectedIds: string[] } | null> {
  const def = groupDefOf(docType);
  const clean = [...new Set(ids.filter(Boolean))].slice(0, 200);
  if (!def || clean.length === 0) return null;
  const rows = await groupCandidateDocs(tenantId, systemId, {
    docTypes: def.childTypes,
    relType: def.relType,
    ids: clean,
  });
  const usable = rows.filter((r) => r.outstanding > 0 && r.groupDocId === null && r.contactId);
  if (usable.length === 0) return null;
  const count = new Map<string, number>();
  for (const r of usable) count.set(r.contactId!, (count.get(r.contactId!) ?? 0) + 1);
  const contactId = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const picked = usable.filter((r) => r.contactId === contactId);
  return {
    contactId,
    contactName: picked[0]?.contactName ?? "",
    selectedIds: picked.map((r) => r.id),
  };
}

// ─────────────────── ② สร้าง + ออกเอกสารกลุ่ม ───────────────────

export type CreateGroupInput = {
  docType: AccountDocType;
  contactId: string;
  issueDate: string; // ISO yyyy-mm-dd
  dueDate: string | null;
  note: string | null;
  childIds: string[];
  createdById: string | null;
};

const dateOf = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isIsoDay = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""));

export async function createGroupDoc(
  tenantId: string,
  systemId: string,
  input: CreateGroupInput,
): Promise<{ ok: true; id: string; docNo: string; total: number } | { ok: false; reason: string }> {
  const def = groupDefOf(input.docType);
  if (!def) return { ok: false, reason: "ชนิดเอกสารไม่ถูกต้อง" };
  if (!input.contactId) return { ok: false, reason: `กรุณาเลือก${def.texts.contactLabel}` };
  const ids = [...new Set(input.childIds.filter(Boolean))].slice(0, 200);
  if (ids.length === 0) return { ok: false, reason: "กรุณาเลือกเอกสารอย่างน้อย 1 ใบ" };

  // 🔴 ตรวจใหม่ฝั่ง server ทุกใบ (id จาก browser เป็นแค่ "คำขอ"): ต้องเป็นของ tenant/system/ผู้ติดต่อรายนี้
  //    ชนิดถูกต้อง ยังค้างชำระจริง และยังไม่อยู่ในกลุ่มอื่น — ยอดที่ใช้ = ยอดค้างที่ server คำนวณเอง
  const candidates = await listGroupCandidates(tenantId, systemId, input.docType, input.contactId, { ids });
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const children: { id: string; description: string; amount: number }[] = [];
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) return { ok: false, reason: "มีเอกสารที่เลือกไม่ตรงเงื่อนไข (คนละผู้ติดต่อ/ชำระแล้ว/คนละระบบ)" };
    if (!c.eligible) return { ok: false, reason: `${c.docNo ?? "(ร่าง)"}: ${c.blockedReason}` };
    // ป้ายบรรทัดเป็น "ภาพนิ่ง" ที่จะไปโผล่บนใบพิมพ์ ⇒ ต้องอ่านออกแบบไทย ค.ศ. ไม่ใช่ ISO ดิบ
    const due = c.dueDate ? ` · ครบกำหนด ${formatDateTh(c.dueDate)}` : "";
    children.push({
      id: c.id,
      description: `${childLabelOf(c.docType)} ${c.docNo ?? "(ร่าง)"}${due}`,
      amount: c.outstanding,
    });
  }

  const issueDate = isIsoDay(input.issueDate) ? dateOf(input.issueDate) : new Date();
  const dueDate = input.dueDate && isIsoDay(input.dueDate) ? dateOf(input.dueDate) : null;

  const created = await createGroupDocument({
    tenantId,
    systemId,
    docType: def.docType,
    direction: def.direction,
    relType: def.relType,
    contactId: input.contactId,
    issueDate,
    dueDate,
    note: input.note?.trim() ? input.note.trim().slice(0, 500) : null,
    createdById: input.createdById,
    children,
  });
  if (!created.ok) return created;

  // ออกเอกสารทันที (ฟอร์มกลุ่มไม่มีขั้น "ร่าง" ให้แก้บรรทัด — บรรทัด = ใบลูกที่เลือกไว้แล้ว)
  const issued =
    def.side === "revenue"
      ? await issueDocument(tenantId, systemId, created.id)
      : await issueExpenseDoc(tenantId, systemId, created.id);
  if (!issued.ok) return { ok: false, reason: issued.reason };

  return { ok: true, id: created.id, docNo: issued.docNo, total: children.reduce((s, c) => s + c.amount, 0) };
}

// ─────────────────── ③ แผงรับ/จ่ายของกลุ่ม ───────────────────

/** คีย์กันซ้ำของการชำระที่กระจายจากกลุ่ม — `GRP#<groupId>#<clientKey>#<childId>` */
const GROUP_KEY_SEP = "#";
export function groupKeyPrefix(groupId: string): string {
  return `GRP${GROUP_KEY_SEP}${groupId}${GROUP_KEY_SEP}`;
}
export function groupBatchKey(groupId: string, clientKey: string): string {
  return `${groupKeyPrefix(groupId)}${clientKey.replace(/#/g, "-").slice(0, 60)}`;
}
export function groupChildKey(batchKey: string, childId: string): string {
  return `${batchKey}${GROUP_KEY_SEP}${childId}`;
}
const batchKeyOf = (childKey: string) => childKey.slice(0, childKey.lastIndexOf(GROUP_KEY_SEP));

export type GroupChildView = {
  id: string;
  docType: AccountDocType;
  docLabel: string;
  docNo: string | null;
  issueDate: string;
  dueDate: string | null;
  grandTotal: number;
  outstanding: number;
  status: string;
  statusLabel: string;
  /** ฐานคำนวณหัก ณ ที่จ่ายโดยประมาณของใบนี้ (ยอดค้างก่อน VAT ตามสัดส่วน) */
  whtBaseSatang: number;
};

export type GroupBatchView = {
  batchKey: string;
  paidAt: string;
  channel: string;
  financeName: string | null;
  /** เงินสด/โอนจริงรวมทุกใบลูกในครั้งนี้ */
  amount: number;
  whtAmount: number;
  feeAmount: number;
  note: string | null;
  voided: boolean;
  children: { docNo: string | null; amount: number; whtAmount: number }[];
};

export type GroupPanelData = {
  docId: string;
  docType: AccountDocType;
  docNo: string | null;
  docLabel: string;
  side: GroupSide;
  direction: "IN" | "OUT";
  contactName: string;
  grandTotal: number;
  paidTotal: number;
  outstanding: number;
  status: string;
  statusLabel: string;
  dueDate: string | null;
  canRecord: boolean;
  children: GroupChildView[];
  batches: GroupBatchView[];
  channels: FinanceOption[];
  texts: GroupDefinition["texts"];
};

function toChildView(c: GroupChildDoc): GroupChildView {
  // ฐาน WHT โดยประมาณ = ยอดค้าง ÷ (1 + 7%) เมื่อใบนั้นมี VAT — ใช้เติมค่าอัตโนมัติในฟอร์มเท่านั้น
  // (ตัวเลขจริงที่ลงบัญชีคือค่าที่ผู้ใช้ยืนยัน + service ตรวจซ้ำ)
  return {
    id: c.id,
    docType: c.docType,
    docLabel: childLabelOf(c.docType),
    docNo: c.docNo,
    issueDate: c.issueDate.toISOString().slice(0, 10),
    dueDate: c.dueDate ? c.dueDate.toISOString().slice(0, 10) : null,
    grandTotal: c.grandTotal,
    outstanding: c.outstanding,
    status: c.status,
    statusLabel: c.statusLabel,
    whtBaseSatang: c.outstanding,
  };
}

export async function groupPanelData(
  tenantId: string,
  systemId: string,
  groupId: string,
): Promise<GroupPanelData | null> {
  const head = await getGroupDocHead(tenantId, systemId, groupId);
  if (!head) return null;
  const def = groupDefOf(head.docType);
  if (!def) return null;
  const [children, payments, channels] = await Promise.all([
    groupChildDocs(tenantId, systemId, groupId, def.relType),
    findGroupChildPayments(tenantId, systemId, groupKeyPrefix(groupId)),
    listPaymentChannels(tenantId, systemId),
  ]);

  const batchMap = new Map<string, GroupBatchView>();
  for (const p of payments) {
    if (!p.idempotencyKey) continue;
    const bk = batchKeyOf(p.idempotencyKey);
    const cur = batchMap.get(bk);
    if (!cur) {
      batchMap.set(bk, {
        batchKey: bk,
        paidAt: p.paidAt.toISOString().slice(0, 10),
        channel: p.channel,
        financeName: p.financeName,
        amount: p.amount,
        whtAmount: p.whtAmount,
        feeAmount: p.feeAmount,
        note: p.note,
        voided: !!p.voidedAt,
        children: [{ docNo: p.docNo, amount: p.amount, whtAmount: p.whtAmount }],
      });
    } else {
      cur.amount += p.amount;
      cur.whtAmount += p.whtAmount;
      cur.feeAmount += p.feeAmount;
      cur.voided = cur.voided && !!p.voidedAt; // ยกเลิกทั้งชุดเท่านั้นถึงนับว่ายกเลิก
      cur.children.push({ docNo: p.docNo, amount: p.amount, whtAmount: p.whtAmount });
    }
  }

  const outstanding = children.reduce((s, c) => s + c.outstanding, 0);
  return {
    docId: head.id,
    docType: head.docType,
    docNo: head.docNo,
    docLabel: def.label,
    side: def.side,
    direction: def.direction,
    contactName: head.contactName ?? "—",
    grandTotal: head.grandTotal,
    paidTotal: Math.max(0, head.grandTotal - outstanding),
    outstanding,
    status: head.status,
    statusLabel: STATUS_LABEL[head.status] ?? head.status,
    dueDate: head.dueDate ? head.dueDate.toISOString().slice(0, 10) : null,
    canRecord: ["AWAITING_PAYMENT", "PARTIAL"].includes(head.status) && outstanding > 0,
    children: children.map(toChildView),
    batches: [...batchMap.values()],
    channels,
    texts: def.texts,
  };
}

// ─────────────────── ④ กระจายการชำระให้ใบลูก (FIFO) ───────────────────

export type GroupChildWht = {
  childDocId: string;
  incomeType: AccountWhtIncomeType;
  rateBp: number | null;
  amountSatang: number;
};

export type GroupPaymentDraft = {
  paidAt: string;
  financeAccountId: string | null;
  /** ยอด "ตัดหนี้" ทั้งหมดของครั้งนี้ (เงินจริง + ภาษีหัก ณ ที่จ่ายรวมทุกใบ) */
  tieOffSatang: number;
  note: string;
  feeSatang: number;
  wht: GroupChildWht[];
  cheque: { chequeNo: string; bankName: string; chequeDate: string } | null;
};

export type GroupAllocation = { childDocId: string; docNo: string | null; tieOff: number; wht: number; cash: number };

/**
 * จัดสรรยอดตัดหนี้ให้ใบลูกแบบ **FIFO ตามวันครบกำหนด** (ใบที่ครบกำหนดก่อนได้เงินก่อนจนเต็มยอดค้าง
 * แล้วค่อยไหลไปใบถัดไป) — เลือก FIFO ไม่ใช่เฉลี่ยตามสัดส่วน เพราะ (1) ตรงกับวิธีตัดหนี้จริงของ AR/AP
 * (2) ทำให้ใบเก่าปิดเป็น "ชำระแล้ว" จริง ไม่ค้างเศษทุกใบ (3) ผลลัพธ์คาดเดาได้ ตรวจสอบย้อนหลังง่าย
 * ฟังก์ชันบริสุทธิ์ — ทดสอบตรงได้ใน qc-acc-v2-groups.mts
 */
export function allocateFifo(
  children: { id: string; docNo: string | null; outstanding: number }[],
  tieOffTotal: number,
): { childDocId: string; docNo: string | null; tieOff: number }[] {
  let left = Math.max(0, Math.round(tieOffTotal));
  const out: { childDocId: string; docNo: string | null; tieOff: number }[] = [];
  for (const c of children) {
    if (left <= 0) break;
    const take = Math.min(left, c.outstanding);
    if (take <= 0) continue;
    out.push({ childDocId: c.id, docNo: c.docNo, tieOff: take });
    left -= take;
  }
  return out;
}

export type RecordGroupPaymentResult =
  | {
      ok: true;
      batchKey: string;
      recorded: number;
      allocations: GroupAllocation[];
      status: string;
      outstanding: number;
      certNos: string[];
    }
  | { ok: false; reason: string };

function channelOfFinanceType(type: string | null | undefined): AccountPayChannel {
  switch (type) {
    case "CASH":
    case "PETTY_CASH":
      return "CASH";
    case "E_WALLET":
      return "E_WALLET";
    default:
      return "TRANSFER";
  }
}

/**
 * รับ/จ่าย 1 ครั้งที่เอกสารกลุ่ม → สร้าง "การชำระของใบลูก" ทีละใบผ่านบริการเดิม (WO 1.4)
 *  • ค่าธรรมเนียมธนาคาร = ผูกกับใบลูกใบแรกของครั้งนี้ (ค่าธรรมเนียมเกิดครั้งเดียวต่อการโอน 1 ครั้ง)
 *  • เช็ค: ผูกกับใบลูกใบแรก (ทะเบียนเช็ค 1 ใบต่อ 1 เลขเช็ค) — ยอดเช็ค = เงินสดรวมของครั้งนี้
 *  • idempotent: ยิงคีย์เดิมซ้ำ → บริการของใบลูกคืนรายการเดิม ไม่เกิด JV ใหม่
 */
export async function recordGroupPayment(
  tenantId: string,
  systemId: string,
  groupId: string,
  draft: GroupPaymentDraft,
  opts: { userId?: string | null; clientKey: string },
): Promise<RecordGroupPaymentResult> {
  const panel = await groupPanelData(tenantId, systemId, groupId);
  if (!panel) return { ok: false, reason: "ไม่พบเอกสาร" };
  const def = groupDefOf(panel.docType);
  if (!def) return { ok: false, reason: "ชนิดเอกสารไม่ถูกต้อง" };

  // 🔴 idempotency ต้องมาก่อนด่านสถานะ (บทเรียน WO 1.4): ยิงชุดเดิมซ้ำหลังกลุ่มปิดไปแล้ว
  //    ต้องคืนผลเดิมเงียบ ๆ ไม่ใช่เด้ง "ชำระไม่ได้ในสถานะปัจจุบัน" (ผู้ใช้เน็ตหลุดแล้วกดซ้ำจะไม่รู้ว่าเงินเข้าหรือยัง)
  const batchKey = groupBatchKey(groupId, opts.clientKey);
  const done = await findGroupChildPayments(tenantId, systemId, `${batchKey}${GROUP_KEY_SEP}`);
  if (done.length > 0) {
    return {
      ok: true,
      batchKey,
      recorded: 0,
      allocations: done.map((p) => ({
        childDocId: p.documentId,
        docNo: p.docNo,
        tieOff: p.amount + p.whtAmount,
        wht: p.whtAmount,
        cash: p.amount,
      })),
      status: panel.status,
      outstanding: panel.outstanding,
      certNos: [],
    };
  }

  if (!["AWAITING_PAYMENT", "PARTIAL"].includes(panel.status))
    return { ok: false, reason: `${def.label}นี้${def.texts.payAction}ไม่ได้ในสถานะปัจจุบัน` };

  const tieOffTotal = Math.max(0, Math.round(draft.tieOffSatang));
  if (tieOffTotal <= 0) return { ok: false, reason: "กรุณากรอกจำนวนเงินมากกว่า 0" };
  if (tieOffTotal > panel.outstanding)
    return { ok: false, reason: `ยอดเกินยอดคงค้างของ${def.label} (คงเหลือ ฿${baht(panel.outstanding)})` };

  const channels = await listPaymentChannels(tenantId, systemId);
  const financeTypes = new Map(channels.map((c) => [c.id, c.type]));
  const financeAccountId = draft.financeAccountId ? String(draft.financeAccountId).slice(0, 40) : null;
  if (financeAccountId && !financeTypes.has(financeAccountId))
    return { ok: false, reason: "ช่องทางการเงินไม่ถูกต้อง" };

  const alloc = allocateFifo(
    panel.children.map((c) => ({ id: c.id, docNo: c.docNo, outstanding: c.outstanding })),
    tieOffTotal,
  );
  if (alloc.length === 0) return { ok: false, reason: "ไม่มีเอกสารในกลุ่มที่ยังค้างชำระ" };

  // ภาษีหัก ณ ที่จ่าย "รายใบ" — ต้องไม่เกินยอดที่ใบนั้นได้รับจัดสรร และต้องเหลือเงินจริง > 0
  const whtOf = new Map<string, GroupChildWht>();
  for (const w of draft.wht ?? []) {
    const amount = Math.max(0, Math.round(Number(w.amountSatang) || 0));
    if (amount <= 0) continue;
    whtOf.set(String(w.childDocId), {
      childDocId: String(w.childDocId),
      incomeType: w.incomeType,
      rateBp: w.rateBp == null ? null : Math.min(10000, Math.max(0, Math.round(Number(w.rateBp) || 0))),
      amountSatang: amount,
    });
  }
  const allocIds = new Set(alloc.map((a) => a.childDocId));
  for (const id of whtOf.keys())
    if (!allocIds.has(id))
      return { ok: false, reason: "มีภาษีหัก ณ ที่จ่ายผูกกับเอกสารที่ไม่ได้รับการจัดสรรเงินในครั้งนี้" };

  const rows: GroupAllocation[] = alloc.map((a) => {
    const w = whtOf.get(a.childDocId);
    const wht = w?.amountSatang ?? 0;
    return { childDocId: a.childDocId, docNo: a.docNo, tieOff: a.tieOff, wht, cash: a.tieOff - wht };
  });
  for (const r of rows) {
    if (r.wht > r.tieOff)
      return { ok: false, reason: `${r.docNo ?? "(ร่าง)"}: ภาษีหัก ณ ที่จ่ายมากกว่ายอดที่จัดสรรให้ใบนี้` };
    if (r.cash <= 0)
      return {
        ok: false,
        reason: `${r.docNo ?? "(ร่าง)"}: เงินจริงของใบนี้เป็น 0 — ปรับยอดหรืออัตราภาษีหัก ณ ที่จ่ายใหม่`,
      };
  }
  if (draft.cheque && draft.feeSatang > 0)
    return { ok: false, reason: "การชำระด้วยเช็คยังไม่รองรับค่าธรรมเนียมธนาคาร" };

  const paidAt = isIsoDay(draft.paidAt) ? dateOf(draft.paidAt) : new Date();
  const note = String(draft.note ?? "").trim().slice(0, 20) || null;
  const channel: AccountPayChannel = draft.cheque
    ? "CHEQUE"
    : channelOfFinanceType(financeTypes.get(financeAccountId ?? ""));

  const certNos: string[] = [];
  let recorded = 0;
  let firstPaymentId = "";
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const w = whtOf.get(r.childDocId);
    const common = {
      paidAt,
      channel,
      financeAccountId: draft.cheque ? null : financeAccountId,
      amount: r.cash,
      whtAmountSatang: r.wht,
      whtRateBp: w?.rateBp ?? null,
      whtIncomeType: w?.incomeType ?? null,
      // ค่าธรรมเนียมของ "การโอน 1 ครั้ง" → ลงที่ใบแรกใบเดียว (ไม่ซอยตามใบลูก)
      feeAmount: i === 0 ? Math.max(0, Math.round(draft.feeSatang || 0)) : 0,
      note,
      createdById: opts.userId ?? null,
      idempotencyKey: groupChildKey(batchKey, r.childDocId),
    };
    const res =
      def.side === "expense"
        ? await recordVendorPayment(tenantId, systemId, r.childDocId, common)
        : await recordPayment(tenantId, systemId, r.childDocId, common);
    if (!res.ok) return { ok: false, reason: `${r.docNo ?? "(ร่าง)"}: ${res.reason}` };
    recorded++;
    if (!firstPaymentId && res.paymentId) firstPaymentId = res.paymentId;
    const certNo = (res as { whtCertNo?: string }).whtCertNo;
    if (certNo) certNos.push(certNo);
  }

  if (draft.cheque && firstPaymentId) {
    const cq = await createCheque({
      tenantId,
      systemId,
      direction: def.side === "expense" ? "OUT" : "IN",
      chequeNo: String(draft.cheque.chequeNo).trim().slice(0, 40),
      bankName: String(draft.cheque.bankName ?? "").trim().slice(0, 80),
      chequeDate: isIsoDay(draft.cheque.chequeDate) ? dateOf(draft.cheque.chequeDate) : paidAt,
      amount: rows.reduce((s, r) => s + r.cash, 0),
      financeAccountId,
      documentId: rows[0].childDocId,
      paymentId: firstPaymentId,
      note,
    });
    if (!cq.ok) return { ok: false, reason: cq.reason };
  }

  const after = await syncGroupStatus(tenantId, systemId, groupId);
  return {
    ok: true,
    batchKey,
    recorded,
    allocations: rows,
    status: after.status,
    outstanding: after.outstanding,
    certNos,
  };
}

/** อ่านยอดค้างของใบลูกใหม่ทั้งหมด แล้วเขียนความคืบหน้า/สถานะกลับที่เอกสารกลุ่ม */
export async function syncGroupStatus(
  tenantId: string,
  systemId: string,
  groupId: string,
): Promise<{ status: string; outstanding: number; paidTotal: number }> {
  const head = await getGroupDocHead(tenantId, systemId, groupId);
  const def = head ? groupDefOf(head.docType) : undefined;
  if (!head || !def) return { status: "", outstanding: 0, paidTotal: 0 };
  const children = await groupChildDocs(tenantId, systemId, groupId, def.relType);
  const res = await updateGroupProgress(
    tenantId,
    systemId,
    groupId,
    children.map((c) => ({ outstanding: c.outstanding, status: c.status })),
  );
  return {
    status: res.status,
    outstanding: children.reduce((s, c) => s + c.outstanding, 0),
    paidTotal: res.paidTotal,
  };
}

/** ยกเลิกการชำระ 1 "ครั้ง" ของกลุ่ม = ยกเลิกการชำระของใบลูกทุกใบในครั้งนั้น (reversal ไม่ลบ) */
export async function voidGroupPayment(
  tenantId: string,
  systemId: string,
  groupId: string,
  batchKey: string,
  reason: string,
): Promise<{ ok: true; voided: number } | { ok: false; reason: string }> {
  if (!batchKey.startsWith(groupKeyPrefix(groupId)))
    return { ok: false, reason: "คีย์การชำระไม่ตรงกับเอกสารนี้" };
  const head = await getGroupDocHead(tenantId, systemId, groupId);
  const def = head ? groupDefOf(head.docType) : undefined;
  if (!head || !def) return { ok: false, reason: "ไม่พบเอกสาร" };

  const payments = await findGroupChildPayments(tenantId, systemId, `${batchKey}${GROUP_KEY_SEP}`);
  if (payments.length === 0) return { ok: false, reason: "ไม่พบรายการชำระของครั้งนี้" };
  let voided = 0;
  for (const p of payments) {
    if (p.voidedAt) continue;
    const res =
      def.side === "expense"
        ? await voidVendorPayment(tenantId, systemId, p.documentId, p.id, reason)
        : await voidPayment(tenantId, systemId, p.documentId, p.id, reason);
    if (!res.ok) return { ok: false, reason: `${p.docNo ?? "(ร่าง)"}: ${res.reason}` };
    voided++;
  }
  await syncGroupStatus(tenantId, systemId, groupId);
  return { ok: true, voided };
}

// ─────────────────── ⑤ ชิปบนหน้าเอกสารลูก ───────────────────

export type GroupMembershipChip = {
  groupId: string;
  docType: AccountDocType;
  docNo: string | null;
  label: string; // "อยู่ในใบวางบิล" / "อยู่ในใบรวมจ่าย"
};

export async function groupChipOfChild(
  tenantId: string,
  systemId: string,
  childId: string,
): Promise<GroupMembershipChip | null> {
  const g = await openGroupOfChild(tenantId, systemId, childId);
  if (!g) return null;
  const def = groupDefOf(g.docType);
  return {
    groupId: g.id,
    docType: g.docType,
    docNo: g.docNo,
    label: def?.texts.memberChip ?? "อยู่ในกลุ่ม",
  };
}
