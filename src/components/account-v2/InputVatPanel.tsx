// ─────────────────────────────────────────────────────────────
// InputVatPanel — แผงภาษีซื้อบนหน้าเอกสารซื้อ / ใบกำกับภาษีซื้อ (ACC T1.4 · T1.5)
//   ใบซื้อ: ยอดภาษีซื้อแยก เคลม / รอใบกำกับ / เคลมไม่ได้ (+ เหตุ) · ลิงก์ใบกำกับภาษีซื้อที่รอรับ
//   ใบกำกับภาษีซื้อ: วันที่ในใบ · วันที่ลงภาษีซื้อ · "ถือเป็นภาษีซื้อในเดือนภาษี…" · เพดานเดือน · ฟอร์มรับ/เคลมไม่ได้
// server component · ไอคอน AccountIcon เท่านั้น ไม่มี emoji
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import MoneyText from "@/components/ui/MoneyText";
import { INPUT_VAT_STATUS_SHORT_TH } from "@/lib/modules/account/input-vat-shared";
import { nonClaimReasonOf } from "@/lib/modules/account/input-vat-shared";
import type { InputVatDocView } from "@/lib/modules/account/input-vat";
import { notClaimablePtxAction, receivePtxAction } from "@/lib/modules/account/expense-actions";
import { PtxReceiveForm } from "./PtxReceiveForm";

const fmt = (d: Date | null | undefined) => {
  if (!d) return "—";
  const t = new Date(d.getTime() + 7 * 3_600_000);
  return `${t.getUTCDate()}/${t.getUTCMonth() + 1}/${t.getUTCFullYear() + 543}`;
};

export function InputVatPanel({
  view,
  systemId,
  docId,
  docType,
  status,
  base,
  today,
  canReceive,
  filedVatMonths = [],
  ptxHref,
  sourceHref,
}: {
  view: InputVatDocView;
  systemId: string;
  docId: string;
  docType: string;
  status: string;
  base: string;
  today: string;
  canReceive: boolean;
  /** ACC T1.7 — เดือนที่ยื่น ภ.พ.30 แล้ว (ฟอร์มรับเตือน + ช่องยืนยันเมื่อวันที่ลงภาษีซื้อตกเดือนนั้น) */
  filedVatMonths?: string[];
  ptxHref?: string | null;
  sourceHref?: string | null;
}) {
  if (view.ptx) {
    const p = view.ptx;
    return (
      <div className="card flex flex-col gap-3 p-4" data-testid="input-vat-panel">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">ใบกำกับภาษีซื้อ</h3>
          {p.source && sourceHref && (
            <Link href={sourceHref} className="text-xs underline" data-testid="input-vat-source">
              เอกสารต้นทาง {p.source.docNo ?? "-"} ({fmt(p.source.issueDate)})
            </Link>
          )}
        </div>
        {status === "AWAITING_RECEIVE" ? (
          <>
            <p className="text-sm" data-testid="input-vat-ptx-pending">
              ภาษีซื้อรอใบกำกับ <MoneyText satang={p.pendingVat ?? 0} decimals /> · เคลมได้ถึงเดือนภาษี {p.lastClaimMonthTh ?? "—"} (ไม่เกิน 6 เดือนนับแต่เดือนถัดจากเดือนที่ออกใบ — นับจากเดือนของเอกสารต้นทางจนกว่าจะรู้วันที่ในใบ)
            </p>
            {canReceive && (
              <PtxReceiveForm
                systemId={systemId}
                docId={docId}
                docType={docType}
                today={today}
                filedVatMonths={filedVatMonths}
                pendingVat={p.pendingVat ?? 0}
                docRef={`ใบกำกับภาษีซื้อ${p.source?.docNo ? ` ของ ${p.source.docNo}` : ""}`}
                receiveAction={receivePtxAction}
                notClaimableAction={notClaimablePtxAction}
              />
            )}
          </>
        ) : (
          <dl className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
            <div>
              <dt className="text-xs text-[color:var(--color-muted)]">{p.notClaimable ? "สถานะ" : "วันที่ในใบกำกับ"}</dt>
              <dd data-testid="input-vat-invoice-date">{p.notClaimable ? `เคลมไม่ได้ — ${nonClaimReasonOf(p.reason)?.labelTh ?? "ไม่ระบุเหตุ"}` : fmt(p.vendorInvoiceDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[color:var(--color-muted)]">วันที่ลงบัญชี</dt>
              <dd data-testid="input-vat-claim-date">{fmt(p.claimDate)}</dd>
            </div>
            {p.lateNote && (
              <div>
                <dt className="text-xs text-[color:var(--color-muted)]">ข้อความบนใบ (เคลมข้ามเดือน)</dt>
                <dd className="font-medium" data-testid="input-vat-late-note">
                  {p.lateNote}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
    );
  }
  if (!view.split) return null;
  const s = view.split;
  return (
    <div className="card flex flex-col gap-2 p-4" data-testid="input-vat-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">
          ภาษีซื้อ{view.summary ? ` — ${view.summary === "MIXED" ? "หลายสถานะ" : INPUT_VAT_STATUS_SHORT_TH[view.summary]}` : ""}
        </h3>
        <span className="flex flex-wrap gap-4 text-sm tabular-nums">
          <span data-testid="input-vat-claim">
            เคลม <MoneyText satang={s.claim} decimals />
          </span>
          <span data-testid="input-vat-pending">
            รอใบกำกับ <MoneyText satang={s.pending} decimals />
          </span>
          <span data-testid="input-vat-noclaim">
            เคลมไม่ได้ <MoneyText satang={s.noClaim} decimals />
          </span>
        </span>
      </div>
      {view.noClaimReasons.length > 0 && <p className="text-xs text-[color:var(--color-muted)]">เหตุที่เคลมไม่ได้: {view.noClaimReasons.join(" · ")}</p>}
      {view.pendingPtx && (
        <p className="text-xs" data-testid="input-vat-pending-ptx">
          รอใบกำกับภาษีซื้อ <MoneyText satang={view.pendingPtx.vat} decimals /> —{" "}
          {ptxHref ? (
            <Link href={ptxHref} className="underline">
              บันทึกรับใบกำกับ {view.pendingPtx.docNo ?? ""}
            </Link>
          ) : (
            view.pendingPtx.docNo
          )}{" "}
          · <Link href={`${base}/tax/pending-input-vat`} className="underline">รายการรอใบกำกับทั้งหมด</Link>
        </p>
      )}
      <p className="text-xs text-[color:var(--color-muted)]">ยอดลงบัญชีจริงดูที่แท็บบัญชี</p>
    </div>
  );
}

export default InputVatPanel;
