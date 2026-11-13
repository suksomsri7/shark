import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { pnd, listWhtCredits } from "@/lib/modules/account/wht";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import FormField from "@/components/ui/FormField";
import { DataTable } from "@/components/ui/DataList";
import MoneyText from "@/components/ui/MoneyText";
import { formatThaiDate as fmtDate } from "@/lib/ui/date";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accountCan, assertAccountCan } from "@/lib/modules/account/access";
import { pndFiledDifferences, pndFilingOf, namesOf } from "@/lib/modules/account/filed-differences";
import { filingHistory } from "@/lib/modules/account/filing-history";
import { unmarkFiledAction as unmarkPndAction } from "../wht/actions";

const pct = (bp: number | null) => (bp != null ? `${(bp / 100).toFixed(bp % 100 ? 2 : 0)}%` : "—");

function defaultPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function TaxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; type?: string; ok?: string; err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const period = sp.period || defaultPeriod();
  const type = sp.type === "3" ? 3 : sp.type === "53" ? 53 : 53;
  const year = period.slice(0, 4);
  const { tenantId, systemId, auth } = await loadAccountSystem(id, { can: "account.tax.view" });
  const base = `/app/sys/${id}/account`;
  const ctx = { tenantId, systemId };

  // ACC T1.7 ▸ สถานะนำส่ง ภ.ง.ด. ของงวด/แบบที่ดูอยู่ · ผลต่างหลังนำส่ง · ประวัติทำ/ยกเลิกเครื่องหมาย (mirror หน้า ภ.พ.30) ◂
  const [report, creditYear, filing, diffs, hist] = await Promise.all([
    pnd(tenantId, systemId, { type, period }),
    listWhtCredits(tenantId, systemId, { year }),
    pndFilingOf(ctx, type, period),
    pndFiledDifferences(ctx, period),
    filingHistory(ctx, type, period),
  ]);
  const diffRows = diffs.rows.filter((r) => r.form === type);
  const names = await namesOf(ctx, [...hist.map((h) => h.actorId), filing?.filedById ?? null]);
  const canUnmark = accountCan(auth, "account.wht.unmark");
  const self = `${base}/tax?type=${type}&period=${period}`;

  async function unmarkAction(fd: FormData) {
    "use server";
    // ตัวเดียวกับหน้า 50 ทวิ (สิทธิ์ account.wht.unmark · ไม่ลบแถว · เก็บเหตุผล) — ด่านสิทธิ์ในตัว action นี้ด้วย
    const { auth: a } = await loadAccountSystem(id);
    assertAccountCan(a, "account.wht.unmark");
    const r = await unmarkPndAction(id, { form: type, periodKey: period, reason: String(fd.get("reason") ?? "") });
    revalidatePath(`${base}/tax`);
    redirect(`${self}&${r.ok ? `ok=${encodeURIComponent("ยกเลิกเครื่องหมายนำส่งแล้ว")}` : `err=${encodeURIComponent(r.reason)}`}`);
  }

  type SummaryRow = { key: string; label: string; count: number; base: number; wht: number; total?: boolean };
  const summaryRows: SummaryRow[] =
    report.byIncomeType.length === 0
      ? []
      : [
          ...report.byIncomeType.map((b) => ({
            key: String(b.incomeType),
            label: b.label,
            count: b.count,
            base: b.base,
            wht: b.wht,
          })),
          { key: "__total__", label: "รวม", count: report.rows.length, base: report.grandBase, wht: report.grandWht, total: true },
        ];

  type DetailRow = (typeof report.rows)[number];
  type CreditRow = (typeof creditYear.rows)[number];

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="ภาษี — ภ.ง.ด.3 / 53 · เครดิตภาษีถูกหัก"
        back={{ href: `${base}/wht`, label: "หัก ณ ที่จ่าย (50 ทวิ)" }}
      />

      {/* ตัวกรอง */}
      <form className="flex flex-wrap items-end gap-2">
        <FormField label="แบบ">
          <select name="type" defaultValue={String(type)} className="input">
            <option value="3">ภ.ง.ด.3 (บุคคลธรรมดา)</option>
            <option value="53">ภ.ง.ด.53 (นิติบุคคล)</option>
          </select>
        </FormField>
        <FormField label="งวด">
          <input name="period" type="month" defaultValue={period} className="input" />
        </FormField>
        <button className="btn btn-primary text-sm">ดู</button>
        <a href={`${base}/tax/export?kind=pnd&type=${type}&period=${period}`} className="btn btn-ghost text-sm">ดาวน์โหลดรายการ ภ.ง.ด. (CSV ช่วยกรอกแบบ)</a>
      </form>

      {sp.ok && <p className="text-sm font-medium" data-testid="pnd-ok">{sp.ok}</p>}
      {sp.err && <p className="text-sm text-[color:var(--color-danger)]" data-testid="pnd-err">{sp.err}</p>}

      {/* ACC T1.7 — สถานะนำส่ง + ยกเลิกเครื่องหมาย (ทำเครื่องหมายที่หน้า 50 ทวิ แถบเลือกหลายใบ) */}
      <section className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm" data-testid="pnd-filed">
        {filing ? (
          <div className="flex flex-wrap items-center gap-3">
            <span data-testid="pnd-filed-state">
              ทำเครื่องหมายนำส่ง ภ.ง.ด.{type} งวด {period} แล้ว เมื่อ {fmtDate(filing.filedAt)}
              {filing.filedById ? ` โดย ${names.get(filing.filedById) ?? "ผู้ใช้"}` : ""} · {filing.certCount} ใบ · ภาษี <MoneyText satang={filing.totalTaxSatang} decimals />
            </span>
            {canUnmark && (
              <ConfirmDialog
                action={unmarkAction}
                reasonField={{ name: "reason", label: "เหตุผลที่ยกเลิกเครื่องหมาย (เก็บในประวัติ)", required: true }}
                triggerLabel="ยกเลิกเครื่องหมาย"
                triggerClassName="text-sm text-[color:var(--color-muted)] hover:underline"
                title={`ยกเลิกเครื่องหมายนำส่ง ภ.ง.ด.${type} งวด ${period}?`}
                detail="50 ทวิ ของงวดนี้จะกลับไปเป็น “ยังไม่นำส่ง” · ตัวเลขที่นำส่งและประวัติยังเก็บไว้"
                confirmLabel="ยืนยัน"
                danger
                testId="pnd-unmark"
              />
            )}
          </div>
        ) : (
          <span data-testid="pnd-filed-state">
            ยังไม่ได้ทำเครื่องหมายนำส่ง ภ.ง.ด.{type} งวด {period} —{" "}
            <Link href={`${base}/wht?tab=deduct`} className="underline">
              ทำเครื่องหมายที่หน้าภาษีหัก ณ ที่จ่าย
            </Link>
          </span>
        )}
      </section>

      {/* ACC T1.7 — ผลต่างหลังนำส่ง: 50 ทวิ ที่ออก/ยกเลิกในงวดนี้หลังทำเครื่องหมาย */}
      {filing && (
        <section className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm" data-testid="pnd-filed-diffs">
          <h3 className="font-medium">
            ผลต่างหลังนำส่ง ({diffRows.length} รายการ) · ภาษีที่ต้องนำส่งเพิ่ม/ลด <MoneyText satang={diffs.totals[String(type) as "3" | "53"]} decimals />
          </h3>
          {diffRows.length === 0 ? (
            <p className="text-xs text-[color:var(--color-muted)]" data-testid="pnd-filed-diffs-empty">ไม่มี 50 ทวิ ที่ออกหรือยกเลิกในงวดนี้หลังทำเครื่องหมาย</p>
          ) : (
            <DataTable<(typeof diffRows)[number]>
              cols={[
                { key: "at", header: "เมื่อ", render: (r) => fmtDate(r.at) },
                { key: "cert", header: "50 ทวิ", render: (r) => <Link href={`${base}/wht/${r.certId}/print`} className="underline">{r.certNo ?? "—"}</Link> },
                { key: "who", header: "ผู้รับเงิน", render: (r) => r.contactName },
                { key: "change", header: "เปลี่ยน", render: (r) => (r.change === "ISSUED_AFTER" ? "ออกหลังนำส่ง" : "ยกเลิกหลังนำส่ง") },
                { key: "wht", header: "ภาษี", align: "right", render: (r) => <MoneyText satang={r.whtDelta} decimals /> },
                { key: "by", header: "โดย", render: (r) => r.byName ?? (r.byId ? "ผู้ใช้" : "ระบบ") },
                { key: "ack", header: "สถานะ", render: (r) => (r.acknowledged ? "ยืนยันคำเตือนแล้ว" : "ไม่มีการยืนยัน") },
              ]}
              rows={diffRows}
              minWidth={720}
              empty="ไม่มีรายการ"
              rowKey={(r) => `${r.certId}:${r.change}`}
            />
          )}
        </section>
      )}

      {hist.length > 0 && (
        <section className="flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs print:hidden" data-testid="pnd-filing-history">
          <h3 className="text-sm font-medium">ประวัติการทำเครื่องหมายนำส่ง ภ.ง.ด.{type} งวด {period}</h3>
          <ul className="flex flex-col gap-0.5">
            {hist.map((h, i) => (
              <li key={i} data-testid="pnd-filing-history-row">
                {fmtDate(h.at)} · {h.action === "MARK" ? "ทำเครื่องหมายนำส่ง" : h.action === "REFILE" ? "ทำเครื่องหมายนำส่งใหม่" : "ยกเลิกเครื่องหมาย"} · โดย{" "}
                {h.actorType === "API_KEY" ? "คีย์ API" : h.actorId ? (names.get(h.actorId) ?? "ผู้ใช้") : "ระบบ"}
                {h.reason ? ` · เหตุผล: ${h.reason}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* สรุปตามประเภทเงินได้ */}
      <Section title={`ภ.ง.ด.${type} — งวด ${period} · สรุปตามประเภทเงินได้`}>
        <DataTable<SummaryRow>
          cols={[
            { key: "label", header: "ประเภทเงินได้", render: (r) => (r.total ? <span className="font-semibold">{r.label}</span> : r.label) },
            { key: "count", header: "ราย", align: "right", render: (r) => (r.total ? <span className="font-semibold">{r.count}</span> : r.count) },
            { key: "base", header: "ฐานเงินได้", align: "right", render: (r) => <span className={r.total ? "font-semibold" : undefined}><MoneyText satang={r.base} decimals /></span> },
            { key: "wht", header: "ภาษีที่หัก", align: "right", render: (r) => <span className={r.total ? "font-semibold" : "font-medium"}><MoneyText satang={r.wht} decimals /></span> },
          ]}
          rows={summaryRows}
          minWidth={520}
          empty="ไม่มี 50 ทวิ ในงวดนี้"
          rowKey={(r) => r.key}
        />
      </Section>

      {/* รายตัว 50 ทวิ */}
      {report.rows.length > 0 && (
        <Section title="รายการ 50 ทวิ (รายใบ)">
          <DataTable<DetailRow>
            cols={[
              { key: "seq", header: "#", render: (r) => r.seq },
              { key: "certNo", header: "เลขที่", render: (r) => <Link href={`${base}/wht/${r.certId}/print`} className="underline">{r.certNo}</Link> },
              { key: "recipient", header: "ผู้รับเงิน", render: (r) => r.recipientName },
              { key: "taxId", header: "เลขภาษี", render: (r) => r.recipientTaxId ?? "—" },
              { key: "income", header: "ประเภท", render: (r) => r.incomeLabel },
              { key: "base", header: "ฐาน", align: "right", render: (r) => <MoneyText satang={r.base} decimals /> },
              { key: "rate", header: "อัตรา", align: "right", render: (r) => pct(r.whtRateBp) },
              { key: "wht", header: "ภาษี", align: "right", render: (r) => <span className="font-medium"><MoneyText satang={r.whtAmount} decimals /></span> },
            ]}
            rows={report.rows}
            minWidth={760}
            empty="ไม่มีรายการ"
            rowKey={(r) => r.certId}
          />
        </Section>
      )}

      {/* เครดิตภาษีถูกหัก สะสมทั้งปี */}
      <Section
        title={`เครดิตภาษีถูกหัก (สะสม 1160) — ปี ${year}`}
        actions={
          <div className="flex items-center gap-3">
            <span className="text-sm text-[color:var(--color-muted)]">รวม <MoneyText satang={creditYear.totalWht} decimals /></span>
            <a href={`${base}/tax/export?kind=credits&year=${year}`} className="btn btn-ghost text-sm">ดาวน์โหลด CSV</a>
          </div>
        }
      >
        <DataTable<CreditRow>
          cols={[
            { key: "date", header: "วันที่", render: (r) => fmtDate(r.paidAt) },
            { key: "doc", header: "เอกสาร", render: (r) => r.docNo ?? "—" },
            { key: "payer", header: "ผู้หัก", render: (r) => r.contactName },
            { key: "wht", header: "ภาษีถูกหัก", align: "right", render: (r) => <span className="font-medium"><MoneyText satang={r.whtAmount} decimals /></span> },
            { key: "copy", header: "สำเนา", render: (r) => (r.hasCertCopy ? "✓" : "—") },
          ]}
          rows={creditYear.rows}
          minWidth={560}
          empty="ไม่มีรายการถูกหักในปีนี้"
          rowKey={(r) => r.paymentId}
        />
      </Section>
    </div>
  );
}
