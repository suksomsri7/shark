// ตัวช่วยสร้างคอลัมน์ของหน้ารายการ V2 (DocListPage) ต่อชนิดเอกสาร — DESIGN-SPEC-V2.md §5.1
// ใช้ร่วมทั้งฝั่งรายรับ (docs/[docType]/page.tsx) และฝั่งรายจ่าย (expense-page.tsx) — โครงแถวจาก
// AccountDocument เหมือนกันทั้งคู่ (structural typing กันไม่ต้อง generic ซ้อน)
import Link from "next/link";
import type { AccountDocStatus, AccountPayChannel } from "@prisma/client";
import { MoneyText } from "@/components/ui/MoneyText";
import { StatusChip } from "@/components/ui/StatusChip";
import { DateText } from "@/lib/ui/DateText";
import type { DocColumn } from "@/components/account-v2/DocTable";
import { STATUS_LABEL, isOverdue } from "./service";
import { accountTone } from "./ui";

export type ListRow = {
  id: string;
  docNo: string | null;
  issueDate: Date;
  dueDate: Date | null;
  validUntil: Date | null;
  grandTotal: number;
  paidTotal: number;
  subTotal: number;
  vatAmount: number;
  sourceDocId: string | null;
  status: AccountDocStatus;
  contact: { id: string; name: string } | null;
  payments?: { channel: AccountPayChannel }[];
};

// f3 mockup ใช้ป้ายสั้นกว่า STATUS_LABEL กลาง (ซึ่งหลายที่อื่นในแอปยังใช้ "รอชำระเงิน"/"ชำระเงินแล้ว" อยู่ —
// ไม่แตะ STATUS_LABEL กลางเพื่อกันแตกวงกว้าง) — override เฉพาะคอลัมน์ "สถานะ" ของหน้ารายการ V2 เท่านั้น
const ROW_STATUS_LABEL: Partial<Record<AccountDocStatus, string>> = {
  AWAITING_PAYMENT: "รอชำระ",
  PAID: "ชำระแล้ว",
};

export const PAY_CHANNEL_LABEL: Record<AccountPayChannel, string> = {
  CASH: "เงินสด",
  TRANSFER: "โอนเงิน",
  PROMPTPAY: "พร้อมเพย์",
  CARD: "บัตร",
  E_WALLET: "e-Wallet",
  CHEQUE: "เช็ค",
  DEPOSIT_APPLY: "หักมัดจำ",
  CREDIT_APPLY: "หักเครดิต",
  OTHER: "อื่น ๆ",
};

export function rowStatusLabel(status: AccountDocStatus): string {
  return ROW_STATUS_LABEL[status] ?? STATUS_LABEL[status];
}

export function StatusCell({ row }: { row: ListRow }) {
  if (isOverdue(row)) return <StatusChip value="พ้นกำหนด" tone="danger" />;
  return <StatusChip value={row.status} map={ROW_STATUS_LABEL_FULL()} toneOf={accountTone} />;
}
// StatusChip เตือน console.warn เมื่อ value ไม่อยู่ใน map — ต้องส่ง map ครบทุก enum (ผสาน override เข้ากับ STATUS_LABEL เต็ม)
function ROW_STATUS_LABEL_FULL(): Record<AccountDocStatus, string> {
  return { ...STATUS_LABEL, ...ROW_STATUS_LABEL };
}

export function docNoCol(docHref: (row: ListRow) => string, rowTestPrefix?: string): DocColumn<ListRow> {
  return {
    key: "docNo",
    header: "เลขที่",
    sort: "docNo",
    render: (r) => (
      <Link href={docHref(r)} className="text-[color:var(--color-accent)] hover:underline" data-testid={rowTestPrefix ? `${rowTestPrefix}-link` : undefined}>
        {r.docNo ?? "(ร่าง)"}
      </Link>
    ),
  };
}

export const contactCol: DocColumn<ListRow> = {
  key: "contact",
  header: "ผู้ติดต่อ",
  render: (r) => r.contact?.name ?? "—",
};

export const issueDateCol: DocColumn<ListRow> = {
  key: "issueDate",
  header: "วันที่",
  sort: "issueDate",
  render: (r) => <DateText value={r.issueDate} />,
};

export const dueDateCol: DocColumn<ListRow> = {
  key: "dueDate",
  header: "ครบกำหนด",
  render: (r) =>
    r.dueDate ? (
      <span style={isOverdue(r) ? { color: "var(--color-danger)", fontWeight: 600 } : undefined}>
        <DateText value={r.dueDate} />
      </span>
    ) : (
      "—"
    ),
};

export const validUntilCol: DocColumn<ListRow> = {
  key: "validUntil",
  header: "ใช้ได้ถึง",
  render: (r) =>
    r.validUntil ? (
      <span style={isOverdue(r) ? { color: "var(--color-danger)", fontWeight: 600 } : undefined}>
        <DateText value={r.validUntil} />
      </span>
    ) : (
      "—"
    ),
};

export const netCol: DocColumn<ListRow> = {
  key: "net",
  header: "มูลค่าสุทธิ",
  align: "right",
  sort: "amount",
  render: (r) => <MoneyText satang={r.grandTotal} decimals />,
};

export const outstandingCol: DocColumn<ListRow> = {
  key: "outstanding",
  header: "ค้างชำระ",
  align: "right",
  render: (r) => <MoneyText satang={Math.max(r.grandTotal - r.paidTotal, 0)} decimals />,
};

export const subTotalCol: DocColumn<ListRow> = {
  key: "subTotal",
  header: "ยอดก่อน VAT",
  align: "right",
  render: (r) => <MoneyText satang={r.subTotal} decimals />,
};

export const vatCol: DocColumn<ListRow> = {
  key: "vat",
  header: "VAT",
  align: "right",
  render: (r) => <MoneyText satang={r.vatAmount} decimals />,
};

export const paymentChannelCol: DocColumn<ListRow> = {
  key: "channel",
  header: "ช่องทางรับเงิน",
  render: (r) => (r.payments?.[0] ? PAY_CHANNEL_LABEL[r.payments[0].channel] : "—"),
};

export const statusCol: DocColumn<ListRow> = {
  key: "status",
  header: "สถานะ",
  render: (r) => <StatusCell row={r} />,
};

// ─── ฝั่งรายจ่าย (§5.1 "PUR/EXP/AP/DP/CP") — คอลัมน์ชื่อต่างจากฝั่งรายรับแต่ render เหมือนกัน ───
export const vendorCol: DocColumn<ListRow> = { ...contactCol, header: "ผู้ขาย" };
export const dueDateExpenseCol: DocColumn<ListRow> = { ...dueDateCol, header: "กำหนดชำระ" };
export const payableCol: DocColumn<ListRow> = { ...outstandingCol, header: "มูลค่าที่ต้องชำระ" };

// "ใบกำกับ (รอรับ/รับแล้ว)" — เฉพาะ docType ที่โมเดลจริงมีสถานะ AWAITING_RECEIVE/RECEIVED (ASSET_PURCHASE/PURCHASE_TAX_INVOICE)
export const invoiceReceivedCol: DocColumn<ListRow> = {
  key: "invoiceReceived",
  header: "ใบกำกับ",
  render: (r) => (r.status === "RECEIVED" ? "✓ รับแล้ว" : "รอรับ"),
};
