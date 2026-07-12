import Link from "next/link";
import { notFound } from "next/navigation";
import type { AccountDocType } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import {
  getDocument,
  listContacts,
  getSettings,
  visibleConvertTargets,
  isVisibleDocType,
  DOC_LABEL,
  baht,
  isOverdue,
} from "@/lib/modules/account/service";
import { StatusBadge } from "@/lib/modules/account/ui";
import DocEditor from "@/lib/modules/account/DocEditor";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  issueDocumentAction,
  convertDocumentAction,
  recordPaymentAction,
  voidPaymentAction,
  quotationResponseAction,
  voidDocumentAction,
} from "@/lib/modules/account/actions";

const fmtDate = (d: Date) =>
  d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
const toInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function DocDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docType: string; docId: string }>;
  searchParams: Promise<{ err?: string; edit?: string }>;
}) {
  const { id, docType, docId } = await params;
  const { err, edit } = await searchParams;
  if (!(docType in DOC_LABEL)) notFound();
  const dt = docType as AccountDocType;
  if (!isVisibleDocType(dt)) notFound();
  const { tenantId, systemId } = await loadAccountSystem(id);

  const [doc, contacts, settings] = await Promise.all([
    getDocument(tenantId, systemId, docId),
    listContacts(tenantId, systemId),
    getSettings(tenantId, systemId),
  ]);
  if (!doc || doc.docType !== dt) notFound();

  const base = `/app/sys/${id}/account`;
  const listPath = `${base}/docs/${dt}`;
  const overdue = isOverdue(doc);
  const remain = Math.max(0, doc.grandTotal - doc.paidTotal);
  const isEditing = edit === "1" && doc.status === "DRAFT";
  const canPay =
    (doc.status === "AWAITING_PAYMENT" || doc.status === "PARTIAL") &&
    (dt === "INVOICE" || dt === "DEPOSIT_RECEIPT");
  // A5/A3: เป้าหมายแปลง = ตัด docType ที่ซ่อน + gate ใบกำกับภาษีตาม vatRegistered
  const targets =
    doc.status !== "DRAFT" && doc.status !== "VOIDED" && doc.status !== "CANCELLED"
      ? visibleConvertTargets(dt, settings.vatRegistered)
      : [];

  if (isEditing) {
    return (
      <div className="flex max-w-3xl flex-col gap-5">
        <Link href={listPath} className="text-sm text-[color:var(--color-muted)]">← {DOC_LABEL[dt]}</Link>
        <DocEditor
          systemId={systemId}
          docType={dt}
          docLabel={DOC_LABEL[dt] ?? dt}
          contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
          vatRateBp={settings.vatRateBp}
          vatRegistered={settings.vatRegistered}
          defaultVatTiming={settings.taxPointBasis}
          editId={doc.id}
          initial={{
            contactId: doc.contactId,
            issueDate: toInput(doc.issueDate),
            dueDate: toInput(doc.dueDate),
            validUntil: toInput(doc.validUntil),
            vatMode: doc.vatMode,
            vatTiming: doc.vatTiming,
            discountAmount: doc.discountAmount,
            note: doc.note,
            lines: doc.lines.map((l) => ({
              description: l.description,
              qty: Number(l.qty),
              unitName: l.unitName,
              unitPrice: l.unitPrice,
              discount: l.discount,
            })),
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={listPath} className="text-sm text-[color:var(--color-muted)]">← {DOC_LABEL[dt]}</Link>
          <h1 className="mt-1 text-2xl font-semibold">{doc.docNo ?? "(ร่าง)"}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-[color:var(--color-muted)]">
            {DOC_LABEL[dt]} · {fmtDate(doc.issueDate)}
            <StatusBadge status={doc.status} overdue={overdue} />
          </div>
        </div>
        <Link href={`${base}/print/${doc.id}`} className="btn btn-ghost text-sm" target="_blank">
          พิมพ์ / PDF
        </Link>
      </div>

      {err && <p className="text-sm text-[color:var(--color-danger)]">{decodeURIComponent(err)}</p>}

      {/* ผู้ติดต่อ */}
      <div className="card text-sm">
        <div className="text-xs text-[color:var(--color-muted)]">ผู้ติดต่อ</div>
        <div className="font-medium">{doc.contact?.name ?? "ไม่ระบุ"}</div>
        {doc.contact?.taxId && (
          <div className="text-xs text-[color:var(--color-muted)]">เลขภาษี {doc.contact.taxId}</div>
        )}
        {doc.dueDate && dt !== "QUOTATION" && (
          <div className="mt-1 text-xs text-[color:var(--color-muted)]">ครบกำหนด {fmtDate(doc.dueDate)}</div>
        )}
        {doc.validUntil && dt === "QUOTATION" && (
          <div className="mt-1 text-xs text-[color:var(--color-muted)]">ยืนราคาถึง {fmtDate(doc.validUntil)}</div>
        )}
      </div>

      {/* รายการ */}
      <div className="card flex flex-col gap-2 text-sm">
        {doc.lines.map((l) => (
          <div key={l.id} className="flex justify-between border-b pb-1 last:border-0">
            <span>
              {l.description}
              <span className="text-xs text-[color:var(--color-muted)]">
                {" "}× {Number(l.qty)} {l.unitName ?? ""}
              </span>
            </span>
            <span>฿{baht(l.amount)}</span>
          </div>
        ))}
        <div className="mt-1 flex flex-col items-end gap-0.5">
          <Row label="รวมเป็นเงิน" value={doc.subTotal} />
          {doc.discountAmount > 0 && <Row label="ส่วนลดท้ายบิล" value={-doc.discountAmount} />}
          {settings.vatRegistered && <Row label="ภาษีมูลค่าเพิ่ม" value={doc.vatAmount} />}
          <div className="flex w-full max-w-xs justify-between font-semibold">
            <span>ยอดสุทธิ</span>
            <span>฿{baht(doc.grandTotal)}</span>
          </div>
          {doc.paidTotal > 0 && (
            <>
              <Row label="ชำระแล้ว" value={doc.paidTotal} />
              <div className="flex w-full max-w-xs justify-between text-[color:var(--color-muted)]">
                <span>คงเหลือ</span>
                <span>฿{baht(remain)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {doc.note && (
        <div className="text-sm text-[color:var(--color-muted)]">หมายเหตุ: {doc.note}</div>
      )}

      {/* การชำระเงิน */}
      {doc.payments.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <h2 className="text-sm font-medium">ประวัติการรับชำระ</h2>
          {doc.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs">
              <span>
                {fmtDate(p.paidAt)} · {p.channel}
                {p.whtAmountSatang > 0 && ` · หัก ณ ที่จ่าย ฿${baht(p.whtAmountSatang)}`}
              </span>
              <span className="flex items-center gap-2">
                ฿{baht(p.amount)}
                {doc.status !== "VOIDED" && doc.status !== "CANCELLED" && (
                  <ConfirmDialog
                    action={voidPaymentAction}
                    fields={{ systemId, docType: dt, id: doc.id, paymentId: p.id, reason: "ยกเลิกการรับชำระ" }}
                    triggerLabel="ยกเลิก"
                    triggerClassName="text-[color:var(--color-danger)] underline"
                    title="ยกเลิกการรับชำระนี้?"
                    detail="ยอดที่รับจะถูกยกเลิก และสถานะการชำระของเอกสารจะถูกคำนวณใหม่"
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
            <Link key={r.id} href={`${base}/docs/${r.from.docType}/${r.from.id}`} className="text-xs underline">
              ← จาก {DOC_LABEL[r.from.docType]} {r.from.docNo ?? "(ร่าง)"}
            </Link>
          ))}
          {doc.relationsFrom.map((r) => (
            <Link key={r.id} href={`${base}/docs/${r.to.docType}/${r.to.id}`} className="text-xs underline">
              → {DOC_LABEL[r.to.docType]} {r.to.docNo ?? "(ร่าง)"}
            </Link>
          ))}
        </div>
      )}

      {/* การกระทำ */}
      <div className="flex flex-col gap-3 border-t pt-4">
        {doc.status === "DRAFT" && (
          <div className="flex flex-wrap gap-2">
            <Link href={`${listPath}/${doc.id}?edit=1`} className="btn btn-ghost text-sm">แก้ไข</Link>
            <form action={issueDocumentAction}>
              <Hidden systemId={systemId} docType={dt} id={doc.id} />
              <SubmitButton pendingText="กำลังออกเอกสาร…">ออกเอกสาร</SubmitButton>
            </form>
            <ConfirmDialog
              action={voidDocumentAction}
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

        {dt === "QUOTATION" && doc.status === "AWAITING_ACCEPT" && (
          <div className="flex flex-wrap gap-2">
            <form action={quotationResponseAction}>
              <Hidden systemId={systemId} docType={dt} id={doc.id} />
              <input type="hidden" name="accepted" value="1" />
              <SubmitButton>ลูกค้ายอมรับ</SubmitButton>
            </form>
            <form action={quotationResponseAction}>
              <Hidden systemId={systemId} docType={dt} id={doc.id} />
              <input type="hidden" name="accepted" value="0" />
              <SubmitButton variant="ghost">ปฏิเสธ</SubmitButton>
            </form>
          </div>
        )}

        {/* แปลงเอกสาร */}
        {targets.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[color:var(--color-muted)]">แปลงเป็น:</span>
            {targets.map((t) => (
              <form key={t} action={convertDocumentAction}>
                <Hidden systemId={systemId} docType={dt} id={doc.id} />
                <input type="hidden" name="toDocType" value={t} />
                <SubmitButton variant="ghost">{DOC_LABEL[t]}</SubmitButton>
              </form>
            ))}
          </div>
        )}

        {/* รับชำระ */}
        {canPay && (
          <form action={recordPaymentAction} className="card flex flex-col gap-2">
            <Hidden systemId={systemId} docType={dt} id={doc.id} />
            <h2 className="text-sm font-medium">บันทึกรับชำระ</h2>
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
              <input
                name="amount"
                type="number"
                step="0.01"
                defaultValue={(remain / 100).toFixed(2)}
                placeholder="เงินเข้า (บาท)"
                className="rounded-lg border px-2 py-1.5 text-sm"
              />
              <SubmitButton>บันทึก</SubmitButton>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input
                name="whtAmount"
                type="number"
                step="0.01"
                placeholder="หัก ณ ที่จ่าย (บาท)"
                className="rounded-lg border px-2 py-1.5 text-sm"
              />
              <input
                name="feeAmount"
                type="number"
                step="0.01"
                placeholder="ค่าธรรมเนียม (บาท)"
                className="rounded-lg border px-2 py-1.5 text-sm"
              />
            </div>
            <p className="text-xs text-[color:var(--color-muted)]">
              ยอดที่ตัดหนี้ = เงินเข้า + หัก ณ ที่จ่าย
            </p>
          </form>
        )}

        {/* void เอกสารมีผล */}
        {doc.status !== "DRAFT" && doc.status !== "VOIDED" && doc.status !== "CANCELLED" && (
          <ConfirmDialog
            action={voidDocumentAction}
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
