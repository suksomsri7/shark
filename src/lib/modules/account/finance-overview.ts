import { randomUUID } from "node:crypto";
import { tenantDb } from "@/lib/core/db";

// ─────────────────────────────────────────────────────────────
// finance-overview.ts — ภาพรวมการเงิน + ปฏิทินเงินเข้า-ออก + สำรองรับ/จ่าย (WO 5.2)
// อ้าง DESIGN-SPEC-V2 §10.2–§10.3 · เฟรม f7-finance-overview.png (+ -menu.png)
// checklist parity เต็มใน ledger/wo-notes/5.2.md
//
// นโยบายไฟล์นี้:
//   - อ่านล้วน (financeOverview/financeDayDetail/pettyCashList/listReimbursableExpensePayments) REUSE
//     dashboard.ts (cashCalendar/cashPosition) + cheque.ts (chequeSummary) — ไม่คำนวณยอดซ้ำเอง
//   - เขียน (topUpPettyCash/reimbursePettyCash) REUSE finance.ts (pettyCashReplenish/transferBetweenFinance)
//     — ไม่โพสต์ GL เองในไฟล์นี้เลย (gl.ts เป็นเจ้าของการโพสต์ทั้งหมด)
//   - เงิน satang integer ทุกจุด · scope = tenantId + systemId เสมอ
// ─────────────────────────────────────────────────────────────

import {
  type DashCtx,
  type QueryMeter,
  cashCalendar,
  cashPosition,
  periodKeyBkk,
  type CashCalendar,
  type CashPosition,
  type CashAccount,
} from "./dashboard";
import { chequeSummary } from "./cheque";
import { pettyCashReplenish, financeMonthChanges, type FinanceAccountBalance } from "./finance";

// ─────────────────── เดือน (YYYY-MM) ± 1 — ใช้ปุ่ม ‹ › ในปฏิทิน ───────────────────

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

// ─────────────────── บล็อก "บัญชีเงินที่ติดตาม" (§10.2 — ปักหมุด ≤4 เหมือนหน้าหลัก §4 ข้อ 9) ───────────────────

export type TrackedFinanceCard = {
  id: string;
  code: string | null;
  name: string;
  type: string;
  subtitle: string;
  balanceSatang: number;
  monthDeltaSatang: number;
  monthText: string; // "เดือนนี้ +฿…" | "เดือนนี้ เติมแล้ว N ครั้ง" (ยังไม่รู้จำนวนครั้งที่นี่ — ดู hint ด้านล่าง)
};

/** บรรทัดรองของการ์ด "บัญชีเงินที่ติดตาม" (f7) — ต่างจาก subtitle ของ FinancePanel (g9/WO 5.1)
 * f7 นำ "รหัส" ขึ้นก่อนเสมอ: เงินสด "CSH001" · ธนาคาร "123-4-56789 · BSV001" · เงินสดย่อย "PTY001 · วงเงิน ฿20,000" */
function trackedSubtitleOf(a: CashAccount): string {
  const code = a.code ?? "—";
  if (a.type === "BANK") return a.accountNo ? `${a.accountNo} · ${code}` : code;
  if (a.type === "PETTY_CASH") return a.limitSatang != null ? `${code} · วงเงิน ${bahtFmt(a.limitSatang)}` : code;
  return code;
}

function bahtFmt(satang: number): string {
  return "฿" + (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─────────────────── financeOverview — ก้อนเดียวจบของหน้า "ดูภาพรวม" (§10.2) ───────────────────

export type FinanceOverview = {
  monthKey: string;
  asOf: Date;
  tracked: TrackedFinanceCard[];
  calendar: CashCalendar;
  cash: CashPosition; // "เงินคุณอยู่ไหน" — ทุกบัญชี (ไม่กรอง pinned) เรียงยอดมาก→น้อย
  reconcile: {
    channelOptions: { id: string; label: string }[];
    selectedChannelId: string | null;
    selectedChannelLabel: string | null;
    systemBalanceSatang: number | null;
  };
  reconciledCount: number; // 0 เสมอในเฟสนี้ (ยังไม่มี AccountBankStatementLine — WO 5.3 ทำจริง)
  chequeBadges: { inCount: number; outCount: number };
  queryCount: number;
};

export async function financeOverview(
  ctx: DashCtx,
  opts: { month?: string; now?: Date; reconcileChannelId?: string } = {},
): Promise<FinanceOverview> {
  const meter: QueryMeter = { count: 0 };
  const now = opts.now ?? new Date();
  const monthKey = opts.month ?? periodKeyBkk(now);

  const [cash, calendar, chq, monthChanges] = await Promise.all([
    cashPosition(ctx, { now }, meter),
    cashCalendar(ctx, monthKey, { now }, meter),
    chequeSummary(ctx.tenantId, ctx.systemId),
    financeMonthChanges(ctx.tenantId, ctx.systemId, now),
  ]);
  meter.count += 1 + 3; // chequeSummary (1) + financeMonthChanges (3) ยิง query ของตัวเอง (ไม่ผ่าน meter ของ dashboard.ts)

  const sortedAll = [...cash.accounts].sort((a, b) => b.balance - a.balance);
  // g9 (5.1)/f7 (5.2): เงินสดย่อยโชว์ "เติมแล้ว N ครั้ง" แทน ±บาท — ใช้ inCount จาก financeMonthChanges (5.1 pattern)
  const tracked: TrackedFinanceCard[] = cash.accounts
    .filter((a) => a.pinned)
    .map((a) => {
      const inCount = monthChanges.get(a.id)?.inCount ?? 0;
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        subtitle: trackedSubtitleOf(a),
        balanceSatang: a.balance,
        monthDeltaSatang: a.monthDelta,
        monthText:
          a.type === "PETTY_CASH"
            ? `เดือนนี้ เติมแล้ว ${inCount} ครั้ง`
            : `เดือนนี้ ${a.monthDelta >= 0 ? "+" : "−"}${bahtFmt(Math.abs(a.monthDelta))}`,
      };
    });

  // กระทบยอดธนาคาร (สรุป/ลิงก์เท่านั้น — WO 5.3 ทำหน้าจับคู่จริง) — เลือกช่องทางธนาคารตัวแรกเป็นค่าเริ่มต้น
  const bankOptions = sortedAll.filter((a) => a.type === "BANK");
  const selected = opts.reconcileChannelId
    ? bankOptions.find((a) => a.id === opts.reconcileChannelId)
    : bankOptions[0];

  return {
    monthKey,
    asOf: now,
    tracked,
    calendar,
    cash: { ...cash, accounts: sortedAll },
    reconcile: {
      channelOptions: bankOptions.map((a) => ({ id: a.id, label: a.code ? `${a.name} · ${a.code}` : a.name })),
      selectedChannelId: selected?.id ?? null,
      selectedChannelLabel: selected ? (selected.code ? `${selected.name} · ${selected.code}` : selected.name) : null,
      systemBalanceSatang: selected?.balance ?? null,
    },
    reconciledCount: 0,
    chequeBadges: { inCount: chq.inCount, outCount: chq.outCount },
    queryCount: meter.count,
  };
}

// ─────────────────── รายละเอียดวันเดียว (คลิกวันในปฏิทิน) ───────────────────

export type FinanceDayRow = {
  id: string;
  docNo: string | null;
  docType: string;
  direction: "IN" | "OUT";
  contactName: string | null;
  financeAccountName: string | null;
  amountSatang: number;
};

export type FinanceDayDetail = { date: string; rows: FinanceDayRow[]; totalIn: number; totalOut: number };

/** รายการเงินเข้า-ออกของวันเดียว (≤50 แถว) — แหล่งเดียวกับ dashboard.cashCalendar (AccountDocumentPayment)
 * ⇒ ผลรวมของวันนี้ต้องตรงกับตัวเลขในช่องปฏิทินของวันนั้นเป๊ะ (ข้อสอบ qc-acc-v2-finance-overview เช็คข้อนี้) */
export async function financeDayDetail(ctx: DashCtx, dateIso: string): Promise<FinanceDayDetail> {
  const db = tenantDb(ctx);
  const from = new Date(`${dateIso}T00:00:00+07:00`);
  const to = new Date(`${dateIso}T00:00:00+07:00`);
  to.setUTCDate(to.getUTCDate() + 1);

  const payments = await db.accountDocumentPayment.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      voidedAt: null,
      financeAccountId: { not: null },
      paidAt: { gte: from, lt: to },
    },
    select: {
      id: true,
      amount: true,
      document: { select: { docNo: true, docType: true, direction: true, contactSnapshot: true } },
      financeAccount: { select: { name: true } },
    },
    orderBy: { paidAt: "asc" },
    take: 50,
  });

  const rows: FinanceDayRow[] = payments.map((p) => {
    const snap = p.document.contactSnapshot as { name?: string } | null;
    return {
      id: p.id,
      docNo: p.document.docNo,
      docType: p.document.docType,
      direction: p.document.direction as "IN" | "OUT",
      contactName: snap?.name ?? null,
      financeAccountName: p.financeAccount?.name ?? null,
      amountSatang: p.amount,
    };
  });
  // direction OUT (รายรับ) = เงินเข้า · direction IN (รายจ่าย) = เงินออก (นิยามเดียวกับ cashCalendar)
  const totalIn = rows.filter((r) => r.direction === "OUT").reduce((s, r) => s + r.amountSatang, 0);
  const totalOut = rows.filter((r) => r.direction === "IN").reduce((s, r) => s + r.amountSatang, 0);
  return { date: dateIso, rows, totalIn, totalOut };
}

// ─────────────────── สำรองรับ/จ่าย (§10.3) ───────────────────

export type PettyCashRow = {
  id: string;
  code: string | null;
  name: string;
  holderUserId: string | null;
  holderName: string | null;
  limitSatang: number | null;
  balanceSatang: number;
  lastTopUpAt: Date | null;
  lastTopUpAmountSatang: number | null;
};

export async function pettyCashList(ctx: DashCtx, holderNames?: Map<string, string>): Promise<PettyCashRow[]> {
  const { financeBalances } = await import("./finance");
  const rows = await financeBalances(ctx.tenantId, ctx.systemId);
  const boxes = rows.filter((r) => r.type === "PETTY_CASH");
  if (boxes.length === 0) return [];
  const ids = boxes.map((b) => b.id);
  const db = tenantDb(ctx);
  // เติมล่าสุด = โอนเข้าล่าสุด (toId = กล่องนี้) — ครอบคลุมทั้งเติมเงินและเบิกชดเชย (ทั้งคู่คือเงินไหลเข้ากล่อง)
  const transfers = await db.accountFinanceTransfer.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, toId: { in: ids }, entryId: { not: null } },
    select: { toId: true, date: true, amountSatang: true },
    orderBy: { date: "desc" },
  });
  const lastByBox = new Map<string, { date: Date; amountSatang: number }>();
  for (const t of transfers) if (!lastByBox.has(t.toId)) lastByBox.set(t.toId, { date: t.date, amountSatang: t.amountSatang });

  return boxes.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    holderUserId: b.holderUserId,
    holderName: b.holderUserId ? holderNames?.get(b.holderUserId) ?? null : null,
    limitSatang: b.limitSatang,
    balanceSatang: b.balance,
    lastTopUpAt: lastByBox.get(b.id)?.date ?? null,
    lastTopUpAmountSatang: lastByBox.get(b.id)?.amountSatang ?? null,
  }));
}

/** เติมเงินสำรองจ่าย = โอนเงินจากช่องทางต้นทาง → กล่อง (reuse finance.pettyCashReplenish/transferBetweenFinance
 * idempotent ต่อ transferId — client ส่ง uuid เดิมซ้ำได้ไม่โพสต์ JV ซ้ำ) */
export async function topUpPettyCash(
  tenantId: string,
  systemId: string,
  input: { pettyId: string; sourceFinanceId: string; amount: number; date?: Date; note?: string | null; transferId?: string },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const res = await pettyCashReplenish(tenantId, systemId, {
    pettyId: input.pettyId,
    counterFinanceId: input.sourceFinanceId,
    amount: input.amount,
    kind: "TOPUP",
    date: input.date,
    note: input.note,
    transferId: input.transferId,
  });
  return res.ok ? { ok: true } : res;
}

// ─────────────────── เบิกชดเชย (§10.3) ───────────────────

export type ReimbursableExpenseRow = {
  paymentId: string;
  docId: string;
  docNo: string | null;
  docType: string;
  description: string | null;
  contactName: string | null;
  amountSatang: number;
  paidAt: Date;
};

/** รายการค่าใช้จ่ายที่จ่ายจากกล่องนี้ (financeAccountId = pettyId) แล้ว "ยังไม่เบิกชดเชย" (reimbursedAt null)
 * ใช้เป็น picker ใน modal "เบิกชดเชย" (§10.3) */
export async function listReimbursableExpensePayments(
  ctx: DashCtx,
  pettyId: string,
): Promise<ReimbursableExpenseRow[]> {
  const rows = await tenantDb(ctx).accountDocumentPayment.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      financeAccountId: pettyId,
      voidedAt: null,
      reimbursedAt: null,
      document: { direction: "IN" }, // รายจ่ายเท่านั้น (petty cash ไม่รับเงินเข้าแบบ payment)
    },
    select: {
      id: true,
      amount: true,
      paidAt: true,
      document: {
        select: {
          id: true,
          docNo: true,
          docType: true,
          note: true,
          contactSnapshot: true,
          // รายละเอียดจริงของค่าใช้จ่าย (§10.3 picker) มาจากบรรทัดแรก ไม่ใช่ note ของเอกสาร
          // (note มักว่างเปล่า — ผู้ใช้กรอกคำอธิบายไว้ที่บรรทัดรายการตอนสร้างเอกสารเสมอ)
          lines: { select: { description: true }, orderBy: { sortOrder: "asc" }, take: 1 },
        },
      },
    },
    orderBy: { paidAt: "desc" },
    take: 50,
  });
  return rows.map((r) => {
    const snap = r.document.contactSnapshot as { name?: string } | null;
    return {
      paymentId: r.id,
      docId: r.document.id,
      docNo: r.document.docNo,
      docType: r.document.docType,
      description: r.document.lines[0]?.description ?? r.document.note,
      contactName: snap?.name ?? null,
      amountSatang: r.amount,
      paidAt: r.paidAt,
    };
  });
}

/**
 * เบิกชดเชยเงินสำรองจ่าย — ผูก payment ที่จ่ายจากกล่องนี้แล้ว (ยังไม่เคยเบิกชดเชย) เข้ากับการโอนเงิน
 * ต้นทาง → กล่อง จำนวนเท่ากับ payment นั้น (reuse transferBetweenFinance ผ่าน pettyCashReplenish — โพสต์ GL
 * ครั้งเดียวสำหรับการโอนนี้เท่านั้น ไม่แตะ/โพสต์ซ้ำ GL ของ payment ค่าใช้จ่ายเดิม)
 *
 * idempotent 2 ชั้น: (1) transferId กันโพสต์ JV ซ้ำ (เหมือนโอนทั่วไป) (2) reimbursedAt กันเบิกชดเชยรายการเดิมซ้ำ
 * — เรียกครั้งที่ 2 ด้วย paymentId เดิม (ที่ reimbursedAt ถูกตั้งไปแล้ว) จะถูกปฏิเสธทันที ไม่แตะ DB เพิ่ม
 */
export async function reimbursePettyCash(
  tenantId: string,
  systemId: string,
  input: { paymentId: string; sourceFinanceId: string; date?: Date; note?: string | null },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = tenantDb({ tenantId, systemId });
  const payment = await db.accountDocumentPayment.findFirst({
    where: { id: input.paymentId, tenantId, systemId },
    select: { id: true, amount: true, financeAccountId: true, reimbursedAt: true, voidedAt: true },
  });
  if (!payment) return { ok: false, reason: "ไม่พบรายการจ่าย" };
  if (payment.voidedAt) return { ok: false, reason: "รายการจ่ายนี้ถูกยกเลิกแล้ว" };
  if (payment.reimbursedAt) return { ok: false, reason: "รายการนี้เบิกชดเชยไปแล้ว" };
  if (!payment.financeAccountId) return { ok: false, reason: "รายการจ่ายนี้ไม่ได้ผูกช่องทางการเงิน" };

  const petty = await db.accountFinance.findFirst({
    where: { id: payment.financeAccountId, tenantId, systemId },
    select: { type: true },
  });
  if (!petty || petty.type !== "PETTY_CASH") return { ok: false, reason: "รายการนี้ไม่ได้จ่ายจากบัญชีสำรองจ่าย" };

  const transferId = randomUUID();
  const res = await pettyCashReplenish(tenantId, systemId, {
    pettyId: payment.financeAccountId,
    counterFinanceId: input.sourceFinanceId,
    amount: payment.amount,
    kind: "REIMBURSE",
    date: input.date,
    note: input.note,
    transferId,
  });
  if (!res.ok) return res;

  // ผูก payment ↔ transfer — กันเบิกซ้ำ (แข่งกันได้เพราะเช็ค reimbursedAt null ด้านบนแค่ optimistic —
  // ล็อกจริงด้วย updateMany + where reimbursedAt:null ให้ atomic ระดับแถวเดียวกัน)
  const updated = await db.accountDocumentPayment.updateMany({
    where: { id: payment.id, tenantId, systemId, reimbursedAt: null },
    data: { reimbursedAt: new Date(), reimbursedTransferId: transferId },
  });
  if (updated.count === 0) return { ok: false, reason: "รายการนี้เบิกชดเชยไปแล้ว (มีคนกดพร้อมกัน)" };
  return { ok: true };
}

// เก็บ type ไว้ให้ import ใช้ต่อ (finance-ui/actions) โดยไม่ต้องคุ้ยไฟล์อื่น
export type { FinanceAccountBalance };
