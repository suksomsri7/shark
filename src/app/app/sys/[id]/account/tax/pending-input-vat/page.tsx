import Link from "next/link";
import { loadAccountSystem, accountPermFlags } from "@/lib/modules/account/guard";
import { pendingInputVat, type PendingInputVatRow } from "@/lib/modules/account/input-vat";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { DataTable } from "@/components/ui/DataList";
import MoneyText from "@/components/ui/MoneyText";
import { formatThaiDate as fmtDate } from "@/lib/ui/date";
import { editorDetailPath } from "@/lib/modules/account/doc-editor-config";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import type { AccountDocType } from "@prisma/client";

// ACC T1.5 §6 — ใบกำกับภาษีซื้อรอรับ (ภาษีซื้อที่พักไว้ที่ 1155 รอใบกำกับจากผู้ขาย) · mirror ของหน้า "ภาษีขายที่ค้างพัก" (T1.2)
//   อายุ + เดือนสุดท้ายที่ยังเคลมได้ (เพดานจากตารางค่ากฎหมาย · ประกาศ VAT ฉ.4 ข้อ 2) · บันทึกรับ/เคลมไม่ได้ที่หน้าใบกำกับภาษีซื้อ

export default async function PendingInputVatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; msg?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.tax.view" });
  const perm = await accountPermFlags(id);
  const base = `/app/sys/${id}/account`;
  const r = await pendingInputVat({ tenantId, systemId });

  return (
    <div className="flex max-w-5xl flex-col gap-6" data-testid="pending-input-vat-page">
      <PageHeader title="ใบกำกับภาษีซื้อรอรับ" back={{ href: `${base}/reports`, label: "รายงาน" }} />
      {sp.err && <p className="text-sm text-[color:var(--color-danger)]" data-testid="pending-input-err">{sp.err}</p>}
      {sp.msg && <p className="text-sm font-medium">{sp.msg}</p>}

      <p className="text-sm text-[color:var(--color-muted)]">
        ภาษีซื้อที่พักไว้ (บัญชี 1155) เพราะยังไม่ได้รับใบกำกับภาษีเต็มรูปจากผู้ขาย — ยังไม่เข้า ภ.พ.30 ·
        เคลมข้ามเดือนได้ไม่เกิน {r.limitMonths ?? "—"} เดือนนับแต่เดือนถัดจากเดือนที่ออกใบกำกับ (ระบบนับจากเดือนของเอกสารต้นทางจนกว่าจะรู้วันที่ในใบ)
      </p>

      {r.warning && <LegalWarnings warnings={[r.warning]} testId="pending-input-warning" />}

      <div className="flex flex-wrap gap-6 text-sm" data-testid="pending-input-totals">
        <span>รอใบกำกับ {r.total.count} ใบ · <MoneyText satang={r.total.vat} decimals /></span>
        <span>เลยเพดานเดือน {r.total.pastWindowCount} ใบ · <MoneyText satang={r.total.pastWindowVat} decimals /></span>
      </div>

      <Section title={`ภาษีซื้อรอใบกำกับ (${r.rows.length} ใบ)`}>
        <DataTable<PendingInputVatRow>
          cols={[
            {
              key: "src",
              header: "เอกสารต้นทาง",
              render: (x) => (
                <Link href={editorDetailPath(base, x.sourceDocType as AccountDocType, x.sourceId)} className="underline">
                  {x.sourceDocNo ?? "—"}
                </Link>
              ),
            },
            { key: "date", header: "วันที่", render: (x) => fmtDate(x.sourceDate) },
            { key: "contact", header: "ผู้ขาย", render: (x) => <span>{x.contactName ?? "—"}<span className="block text-xs text-[color:var(--color-muted)]">{x.contactTaxId || "ไม่มีเลขผู้เสียภาษี"}</span></span> },
            { key: "vat", header: "ภาษีซื้อรอ", align: "right", render: (x) => <MoneyText satang={x.vat} decimals /> },
            { key: "age", header: "อายุ (วัน)", align: "right", render: (x) => x.ageDays },
            {
              key: "window",
              header: "เคลมได้ถึง",
              render: (x) =>
                x.pastWindow ? (
                  <span className="text-[color:var(--color-danger)]" data-testid={`pending-input-flag-${x.sourceDocNo}`}>เลย {x.lastClaimMonthTh}</span>
                ) : (
                  <span>
                    {x.lastClaimMonthTh ?? "—"}
                    {x.monthsLeft !== null && <span className="block text-xs text-[color:var(--color-muted)]">เหลือ {x.monthsLeft} เดือน</span>}
                  </span>
                ),
            },
            {
              key: "act",
              header: "",
              render: (x) =>
                perm.recordPayment ? (
                  <Link href={`${editorDetailPath(base, "PURCHASE_TAX_INVOICE", x.ptxId)}#input-vat-panel`} className="btn btn-sm" data-testid={`pending-input-open-${x.sourceDocNo}`}>
                    บันทึกรับ / เคลมไม่ได้
                  </Link>
                ) : null,
            },
          ]}
          rows={r.rows}
          minWidth={820}
          empty="ไม่มีภาษีซื้อรอใบกำกับ"
          rowKey={(x) => x.ptxId}
        />
      </Section>
    </div>
  );
}
