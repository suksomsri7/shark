import Link from "next/link";
import type { AccountDocType } from "@prisma/client";
import { baht, isOverdue } from "./service";
import { StatusBadge } from "./ui";
import { EXP_DOC_LABEL, WHT_INCOME_LABEL } from "./expense";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  issueExpenseDocAction,
  recordVendorPaymentAction,
  voidVendorPaymentAction,
  voidExpenseDocAction,
  receivePtxAction,
  markAssetReceivedAction,
  submitApprovalAction,
  approvePOAction,
  rejectPOAction,
  convertPOAction,
} from "./expense-actions";

const fmtDate = (d: Date) =>
  d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

type LoadedDoc = {
  id: string;
  docType: AccountDocType;
  docNo: string | null;
  status: string;
  issueDate: Date;
  dueDate: Date | null;
  validUntil: Date | null;
  vatMode: string;
  subTotal: number;
  discountAmount: number;
  vatAmount: number;
  grandTotal: number;
  paidTotal: number;
  note: string | null;
  contact: { name: string; taxId: string | null } | null;
  lines: { id: string; description: string; qty: unknown; unitName: string | null; amount: number; account: { code: string; name: string } | null }[];
  payments: { id: string; paidAt: Date; channel: string; amount: number; whtAmountSatang: number }[];
  relationsFrom: { id: string; to: { id: string; docType: AccountDocType; docNo: string | null } }[];
  relationsTo: { id: string; from: { id: string; docType: AccountDocType; docNo: string | null } }[];
};

// รายการเอกสาร + แท็บ filter (§3.0.3) — ใช้ร่วมทุก route ฝั่งจ่าย
export function ExpenseList({
  rows,
  tabs,
  activeTab,
  tabHref,
  itemHref,
  emptyText,
}: {
  rows: { id: string; docNo: string | null; issueDate: Date; grandTotal: number; status: string; dueDate: Date | null; validUntil: Date | null }[];
  tabs: { key: string; label: string }[];
  activeTab: string;
  tabHref: (key: string) => string;
  itemHref: (id: string) => string;
  emptyText: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className="rounded-full border px-3 py-1 text-xs"
            style={t.key === activeTab ? { background: "var(--color-ink)", color: "var(--color-surface)" } : undefined}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">{emptyText}</p>
        ) : (
          rows.map((d) => (
            <Link
              key={d.id}
              href={itemHref(d.id)}
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-[color:var(--color-surface-2)]"
            >
              <span>
                {d.docNo ?? "(ร่าง)"} ·{" "}
                {d.issueDate.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}
              </span>
              <span className="flex items-center gap-2">
                ฿{baht(d.grandTotal)}
                <StatusBadge status={d.status as never} overdue={isOverdue(d)} />
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function Hidden({ systemId, docType, id }: { systemId: string; docType: string; id: string }) {
  return (
    <>
      <input type="hidden" name="systemId" value={systemId} />
      <input type="hidden" name="docType" value={docType} />
      <input type="hidden" name="id" value={id} />
    </>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex w-full max-w-xs justify-between text-[color:var(--color-muted)]">
      <span>{label}</span>
      <span>฿{baht(value)}</span>
    </div>
  );
}

// route slug ต่อ docType (ต้องตรงกับ ROUTE_FOR ใน expense-actions)
const ROUTE_FOR: Partial<Record<AccountDocType, string>> = {
  PURCHASE: "purchase",
  EXPENSE: "expense",
  PURCHASE_ORDER: "po",
  ASSET_PURCHASE_ORDER: "po",
  ASSET_PURCHASE: "asset-buy",
  PURCHASE_TAX_INVOICE: "asset-buy",
};

export function ExpenseDetail({
  doc,
  systemId,
  label,
  editHref,
  listHref,
  err,
}: {
  doc: LoadedDoc;
  systemId: string;
  label: string;
  editHref: string;
  listHref: string;
  err?: string;
}) {
  const base = `/app/sys/${systemId}/account`;
  const dt = doc.docType;
  const overdue = isOverdue(doc);
  const remain = Math.max(0, doc.grandTotal - doc.paidTotal);
  const active = doc.status !== "VOIDED" && doc.status !== "CANCELLED" && doc.status !== "REJECTED";
  const isPO = dt === "PURCHASE_ORDER" || dt === "ASSET_PURCHASE_ORDER";
  const isPayable = ["PURCHASE", "EXPENSE", "ASSET_PURCHASE", "DEPOSIT_PAYMENT"].includes(dt);
  const isAdjust = dt === "CREDIT_NOTE_RECEIVED" || dt === "DEBIT_NOTE_RECEIVED";
  const canPay = (doc.status === "AWAITING_PAYMENT" || doc.status === "PARTIAL") && isPayable;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={listHref} className="text-sm text-[color:var(--color-muted)]">← {label}</Link>
        <h1 className="mt-1 text-2xl font-semibold">{doc.docNo ?? "(ร่าง)"}</h1>
        <div className="mt-1 flex items-center gap-2 text-sm text-[color:var(--color-muted)]">
          {label} · {fmtDate(doc.issueDate)}
          <StatusBadge status={doc.status as never} overdue={overdue} />
        </div>
      </div>

      {err && <p className="text-sm text-[color:var(--color-danger)]">{decodeURIComponent(err)}</p>}

      {/* ผู้ขาย */}
      <div className="card text-sm">
        <div className="text-xs text-[color:var(--color-muted)]">ผู้ขาย / ผู้รับเงิน</div>
        <div className="font-medium">{doc.contact?.name ?? "ไม่ระบุ"}</div>
        {doc.contact?.taxId && (
          <div className="text-xs text-[color:var(--color-muted)]">เลขภาษี {doc.contact.taxId}</div>
        )}
        {doc.dueDate && (
          <div className="mt-1 text-xs text-[color:var(--color-muted)]">ครบกำหนด {fmtDate(doc.dueDate)}</div>
        )}
      </div>

      {/* รายการ */}
      <div className="card flex flex-col gap-2 text-sm">
        {doc.lines.map((l) => (
          <div key={l.id} className="flex justify-between border-b pb-1 last:border-0">
            <span>
              {l.description}
              {l.account && (
                <span className="text-xs text-[color:var(--color-muted)]"> · {l.account.code} {l.account.name}</span>
              )}
              <span className="text-xs text-[color:var(--color-muted)]"> × {Number(l.qty)} {l.unitName ?? ""}</span>
            </span>
            <span>฿{baht(l.amount)}</span>
          </div>
        ))}
        <div className="mt-1 flex flex-col items-end gap-0.5">
          <Row label="รวมเป็นเงิน" value={doc.subTotal} />
          {doc.discountAmount > 0 && <Row label="ส่วนลดท้ายบิล" value={-doc.discountAmount} />}
          {doc.vatMode !== "NONE" && <Row label="ภาษีซื้อ" value={doc.vatAmount} />}
          <div className="flex w-full max-w-xs justify-between font-semibold">
            <span>ยอดสุทธิ</span>
            <span>฿{baht(doc.grandTotal)}</span>
          </div>
          {doc.paidTotal > 0 && (
            <>
              <Row label="จ่ายแล้ว" value={doc.paidTotal} />
              <div className="flex w-full max-w-xs justify-between text-[color:var(--color-muted)]">
                <span>คงเหลือ</span>
                <span>฿{baht(remain)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {doc.note && <div className="text-sm text-[color:var(--color-muted)]">หมายเหตุ: {doc.note}</div>}

      {/* ประวัติการจ่าย */}
      {doc.payments.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <h2 className="text-sm font-medium">ประวัติการจ่ายเงิน</h2>
          {doc.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs">
              <span>
                {fmtDate(p.paidAt)} · {p.channel}
                {p.whtAmountSatang > 0 && ` · หัก ณ ที่จ่าย ฿${baht(p.whtAmountSatang)}`}
              </span>
              <span className="flex items-center gap-2">
                ฿{baht(p.amount)}
                {active && (
                  <ConfirmDialog
                    action={voidVendorPaymentAction}
                    fields={{ systemId, docType: dt, id: doc.id, paymentId: p.id, reason: "ยกเลิกการจ่าย" }}
                    triggerLabel="ยกเลิก"
                    triggerClassName="text-[color:var(--color-danger)] underline"
                    title="ยกเลิกการจ่ายนี้?"
                    detail="ยอดที่จ่ายจะถูกยกเลิก และสถานะเจ้าหนี้ของเอกสารจะถูกคำนวณใหม่"
                    confirmLabel="ยืนยันยกเลิก"
                    danger
                  />
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* เอกสารที่เกี่ยวข้อง */}
      {(doc.relationsFrom.length > 0 || doc.relationsTo.length > 0) && (
        <div className="flex flex-col gap-1 text-sm">
          <h2 className="text-sm font-medium">เอกสารที่เกี่ยวข้อง</h2>
          {doc.relationsTo.map((r) => (
            <Link key={r.id} href={`${base}/${ROUTE_FOR[r.from.docType] ?? "purchase"}/${r.from.id}`} className="text-xs underline">
              ← จาก {EXP_DOC_LABEL[r.from.docType] ?? r.from.docType} {r.from.docNo ?? "(ร่าง)"}
            </Link>
          ))}
          {doc.relationsFrom.map((r) => (
            <Link key={r.id} href={`${base}/${ROUTE_FOR[r.to.docType] ?? "purchase"}/${r.to.id}`} className="text-xs underline">
              → {EXP_DOC_LABEL[r.to.docType] ?? r.to.docType} {r.to.docNo ?? "(ร่าง)"}
            </Link>
          ))}
        </div>
      )}

      {/* การกระทำ */}
      <div className="flex flex-col gap-3 border-t pt-4">
        {doc.status === "DRAFT" && (
          <div className="flex flex-wrap gap-2">
            <Link href={editHref} className="btn btn-ghost text-sm">แก้ไข</Link>
            {isPO ? (
              <form action={submitApprovalAction}>
                <Hidden systemId={systemId} docType={dt} id={doc.id} />
                <SubmitButton>ส่งอนุมัติ</SubmitButton>
              </form>
            ) : (
              <form action={issueExpenseDocAction}>
                <Hidden systemId={systemId} docType={dt} id={doc.id} />
                <SubmitButton>{isAdjust ? "บันทึก" : "บันทึก/ตั้งเจ้าหนี้"}</SubmitButton>
              </form>
            )}
            <ConfirmDialog
              action={voidExpenseDocAction}
              fields={{ systemId, docType: dt, id: doc.id, reason: "ยกเลิกร่าง" }}
              triggerLabel="ยกเลิก"
              triggerClassName="btn btn-ghost text-sm text-[color:var(--color-danger)]"
              title="ยกเลิกร่างนี้?"
              detail="ร่างเอกสารจะถูกยกเลิกและแก้ไขไม่ได้อีก"
              confirmLabel="ยืนยันยกเลิก"
              danger
            />
          </div>
        )}

        {/* อนุมัติ PO */}
        {isPO && doc.status === "AWAITING_APPROVAL" && (
          <div className="flex flex-wrap items-center gap-2">
            <form action={approvePOAction}>
              <Hidden systemId={systemId} docType={dt} id={doc.id} />
              <SubmitButton>อนุมัติ</SubmitButton>
            </form>
            <ConfirmDialog
              action={rejectPOAction}
              fields={{ systemId, docType: dt, id: doc.id }}
              reasonField={{ name: "reason", label: "เหตุผลไม่อนุมัติ" }}
              triggerLabel="ไม่อนุมัติ"
              triggerClassName="btn btn-ghost text-sm text-[color:var(--color-danger)]"
              title="ไม่อนุมัติใบสั่งซื้อนี้?"
              detail="ใบสั่งซื้อจะถูกปฏิเสธและนำไปทำรายการต่อไม่ได้"
              confirmLabel="ยืนยันไม่อนุมัติ"
              danger
            />
          </div>
        )}

        {/* แปลง PO → บันทึกซื้อ/ซื้อสินทรัพย์ */}
        {isPO && doc.status === "APPROVED" && (
          <form action={convertPOAction}>
            <Hidden systemId={systemId} docType={dt} id={doc.id} />
            <SubmitButton>
              แปลงเป็น{dt === "ASSET_PURCHASE_ORDER" ? "ซื้อสินทรัพย์" : "บันทึกซื้อ"}
            </SubmitButton>
          </form>
        )}

        {/* ใบกำกับภาษีซื้อ: รับแล้ว */}
        {dt === "PURCHASE_TAX_INVOICE" && doc.status === "AWAITING_RECEIVE" && (
          <form action={receivePtxAction}>
            <Hidden systemId={systemId} docType={dt} id={doc.id} />
            <SubmitButton>รับใบกำกับแล้ว (โอนเข้าเคลม VAT)</SubmitButton>
          </form>
        )}

        {/* ซื้อสินทรัพย์: รับใบเสร็จแล้ว */}
        {dt === "ASSET_PURCHASE" && (doc.status === "AWAITING_PAYMENT" || doc.status === "PARTIAL" || doc.status === "PAID") && (
          <form action={markAssetReceivedAction}>
            <Hidden systemId={systemId} docType={dt} id={doc.id} />
            <SubmitButton variant="ghost">รับใบเสร็จแล้ว</SubmitButton>
          </form>
        )}

        {/* จ่ายชำระ (+ WHT) */}
        {canPay && (
          <form action={recordVendorPaymentAction} className="card flex flex-col gap-2">
            <Hidden systemId={systemId} docType={dt} id={doc.id} />
            <h2 className="text-sm font-medium">บันทึกจ่ายชำระ</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input type="date" name="paidAt" className="rounded-lg border px-2 py-1.5 text-sm" />
              <select name="channel" className="rounded-lg border px-2 py-1.5 text-sm" defaultValue="TRANSFER">
                <option value="CASH">เงินสด</option>
                <option value="TRANSFER">โอน</option>
                <option value="PROMPTPAY">พร้อมเพย์</option>
                <option value="CARD">บัตร</option>
                <option value="E_WALLET">e-Wallet</option>
                <option value="OTHER">อื่นๆ</option>
              </select>
              <input name="amount" type="number" step="0.01" defaultValue={(remain / 100).toFixed(2)} placeholder="เงินจ่าย (บาท)" className="rounded-lg border px-2 py-1.5 text-sm" />
              <SubmitButton>บันทึก</SubmitButton>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input name="whtAmount" type="number" step="0.01" placeholder="หัก ณ ที่จ่าย (บาท)" className="rounded-lg border px-2 py-1.5 text-sm" />
              <select name="whtIncomeType" className="rounded-lg border px-2 py-1.5 text-sm" defaultValue="">
                <option value="">ประเภทเงินได้ (ถ้าหัก)</option>
                {Object.entries(WHT_INCOME_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <input name="whtRateBp" type="number" step="1" placeholder="อัตรา WHT (bp เช่น 300=3%)" className="rounded-lg border px-2 py-1.5 text-sm" />
              <input name="feeAmount" type="number" step="0.01" placeholder="ค่าธรรมเนียม (บาท)" className="rounded-lg border px-2 py-1.5 text-sm" />
            </div>
            <p className="text-xs text-[color:var(--color-muted)]">
              ยอดที่ตัดเจ้าหนี้ = เงินจ่าย + หัก ณ ที่จ่าย · ระบุประเภทเงินได้ → ออก 50 ทวิอัตโนมัติ
            </p>
          </form>
        )}

        {/* void เอกสารมีผล */}
        {active && doc.status !== "DRAFT" && (
          <ConfirmDialog
            action={voidExpenseDocAction}
            fields={{ systemId, docType: dt, id: doc.id }}
            reasonField={{ name: "reason", label: "เหตุผลการยกเลิก" }}
            triggerLabel="ยกเลิกเอกสาร"
            triggerClassName="btn btn-ghost text-sm text-[color:var(--color-danger)]"
            title="ยกเลิกเอกสารนี้?"
            detail="เอกสารจะถูกยกเลิก แก้ไขไม่ได้ และต้องออกใหม่เท่านั้น"
            confirmLabel="ยืนยันยกเลิก"
            danger
          />
        )}
      </div>
    </div>
  );
}
