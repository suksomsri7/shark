import Link from "next/link";
import type { AccountWhtIncomeType } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { pnd, pnd1kAnnual, pndFormCounts, listWhtCredits, markFiled } from "@/lib/modules/account/wht";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import FormField from "@/components/ui/FormField";
import { DataTable } from "@/components/ui/DataList";
import MoneyText from "@/components/ui/MoneyText";
import { formatThaiDate as fmtDate } from "@/lib/ui/date";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accountCan, assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import { namesOf } from "@/lib/modules/account/filed-differences";
import { filingHistory } from "@/lib/modules/account/filing-history";
import { whtFilingState, recordWhtAdditionalFiling, whtAdditionalWarnings } from "@/lib/modules/account/wht-filing";
import { PND_FORM_LABEL_TH, isPndFormNumber, type PndFormNumber } from "@/lib/modules/account/wht-forms";
import { screenAck } from "@/lib/modules/account/legal-gate";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import { legalWarning } from "@/lib/core/settings/legal/warnings";
import { unmarkFiledAction as unmarkPndAction, issueWhtCertAction } from "../wht/actions";

const pct = (bp: number | null) => (bp != null ? `${(bp / 100).toFixed(bp % 100 ? 2 : 0)}%` : "—");

// ตัวช่วยระดับโมดูล (ไม่ใช่ closure ของหน้า) — server action แบบ inline จับได้เฉพาะค่าที่ serialize ได้ ห้ามจับฟังก์ชัน
function backHref(self: string, r: { ok: boolean; reason?: string }, okText: string): string {
  return `${self}&${r.ok ? `ok=${encodeURIComponent(okText)}` : `err=${encodeURIComponent(r.reason ?? "")}`}`;
}

function defaultPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ACC T3.4 — แบบ ภ.ง.ด. แยกตาม ประเภทเงินได้ × ผู้รับ (ตาราง SYSTEM_WHT_FORM_ROWS) · 1ก = ภ.ง.ด.1 รายปีรวมต่อผู้รับ
const FORM_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "ภ.ง.ด.1 (เงินเดือน/ค่านายหน้า ให้บุคคลธรรมดา — ม.50(1))" },
  { value: "1k", label: "ภ.ง.ด.1ก (สรุปรายปีของ ภ.ง.ด.1)" },
  { value: "2", label: "ภ.ง.ด.2 (ดอกเบี้ย/ปันผล/ลิขสิทธิ์ ให้บุคคลธรรมดา)" },
  { value: "3", label: "ภ.ง.ด.3 (บุคคลธรรมดา — คำสั่ง ม.3 เตรส)" },
  { value: "53", label: "ภ.ง.ด.53 (นิติบุคคล)" },
  { value: "54", label: "ภ.ง.ด.54 (จ่ายไปต่างประเทศ — ม.70)" },
];

export default async function TaxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; type?: string; ok?: string; err?: string; year?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const period = sp.period || defaultPeriod();
  const annual = sp.type === "1k";
  const rawType = Number(sp.type);
  const type: PndFormNumber = isPndFormNumber(rawType) ? rawType : 53;
  const year = (annual && sp.year) || period.slice(0, 4);
  const { tenantId, systemId, auth } = await loadAccountSystem(id, { can: "account.tax.view" });
  const base = `/app/sys/${id}/account`;
  const ctx = { tenantId, systemId };
  const label = PND_FORM_LABEL_TH[type];

  const [report, counts, annualRep, creditYear, st, hist] = await Promise.all([
    pnd(tenantId, systemId, { type, period }),
    pndFormCounts(tenantId, systemId, period),
    annual ? pnd1kAnnual(tenantId, systemId, { year: Number(year) }) : Promise.resolve(null),
    listWhtCredits(tenantId, systemId, { year }),
    whtFilingState(ctx, type, period),
    filingHistory(ctx, type, period),
  ]);
  const filing = st.filed;
  const names = await namesOf(ctx, [...hist.map((h) => h.actorId), filing?.filedById ?? null, ...st.additional.map((a) => a.filedById)]);
  const canUnmark = accountCan(auth, "account.wht.unmark");
  const canManage = accountCan(auth, "account.wht.manage");
  const self = `${base}/tax?type=${type}&period=${period}`;

  async function unmarkAction(fd: FormData) {
    "use server";
    // ตัวเดียวกับหน้า 50 ทวิ (สิทธิ์ account.wht.unmark · ไม่ลบแถว · เก็บเหตุผล) — ด่านสิทธิ์ในตัว action นี้ด้วย
    const { auth: a } = await loadAccountSystem(id);
    assertAccountCan(a, "account.wht.unmark");
    const r = await unmarkPndAction(id, { form: type, periodKey: period, reason: String(fd.get("reason") ?? "") });
    revalidatePath(`${base}/tax`);
    redirect(backHref(self, r, "ยกเลิกเครื่องหมายนำส่งแล้ว"));
  }

  async function markAction() {
    "use server";
    const { auth: a, userId } = await loadAccountSystem(id);
    assertAccountCan(a, "account.wht.manage");
    const r = await markFiled(tenantId, systemId, { form: type, periodKey: period, filedById: userId });
    if (r.ok) await writeAudit({ tenantId, actorId: userId, action: "account.wht.manage", targetType: "AccountWhtFiling", targetId: `${systemId}:${type}:${period}`, after: { form: type, periodKey: period, certCount: r.certCount } });
    revalidatePath(`${base}/tax`);
    redirect(backHref(self, r.ok ? { ok: true } : r, `ทำเครื่องหมายนำส่ง ${label} งวด ${period} แล้ว`));
  }

  async function additionalAction(fd: FormData) {
    "use server";
    const { auth: a, userId } = await loadAccountSystem(id);
    assertAccountCan(a, "account.wht.manage");
    const r = await recordWhtAdditionalFiling(ctx, { form: type, periodKey: period, note: String(fd.get("note") ?? ""), actorId: userId, ack: screenAck(fd.getAll("ack"), userId) });
    revalidatePath(`${base}/tax`);
    redirect(backHref(self, r.ok ? { ok: true } : r, r.ok ? `บันทึกแบบยื่นเพิ่มเติมครั้งที่ ${r.seq} แล้ว` : ""));
  }

  type SummaryRow = { key: string; label: string; count: number; base: number; wht: number; total?: boolean };
  const summaryRows: SummaryRow[] =
    report.byIncomeType.length === 0 && report.rows.length === 0
      ? []
      : [
          ...report.byIncomeType.map((b) => ({ key: String(b.incomeType), label: b.label, count: b.count, base: b.base, wht: b.wht })),
          ...(report.rows.some((r) => !r.incomeType)
            ? [
                {
                  key: "__none__",
                  label: "ยังไม่ระบุประเภทเงินได้",
                  count: report.rows.filter((r) => !r.incomeType).length,
                  base: report.rows.filter((r) => !r.incomeType).reduce((s, r) => s + r.base, 0),
                  wht: report.rows.filter((r) => !r.incomeType).reduce((s, r) => s + r.whtAmount, 0),
                },
              ]
            : []),
          { key: "__total__", label: "รวม", count: report.rows.length, base: report.grandBase, wht: report.grandWht, total: true },
        ];

  type DetailRow = (typeof report.rows)[number];
  type CreditRow = (typeof creditYear.rows)[number];
  type AnnualRow = NonNullable<typeof annualRep>["rows"][number];
  const nextSeq = (st.additional.at(-1)?.seq ?? 0) + 1;

  return (
    <div className="flex max-w-4xl flex-col gap-6" data-testid="pnd-page">
      <PageHeader title="ภาษี — ภ.ง.ด. · เครดิตภาษีถูกหัก" back={{ href: `${base}/wht`, label: "หัก ณ ที่จ่าย (50 ทวิ)" }} />

      {/* ตัวกรอง */}
      <form className="flex flex-wrap items-end gap-2" data-testid="pnd-filter">
        <FormField label="แบบ">
          <select name="type" defaultValue={annual ? "1k" : String(type)} className="input" data-testid="pnd-type">
            {FORM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
                {o.value !== "1k" && counts[Number(o.value) as PndFormNumber] ? ` · ${counts[Number(o.value) as PndFormNumber]} รายการ` : ""}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={annual ? "ปี (เลือกเดือนใดก็ได้ของปี)" : "งวด (เดือนที่จ่าย)"}>
          <input name="period" type="month" defaultValue={period} className="input" />
        </FormField>
        <button className="btn btn-primary text-sm">ดู</button>
        <a
          href={annual ? `${base}/tax/export?kind=pnd1k&year=${year}` : `${base}/tax/export?kind=pnd&type=${type}&period=${period}`}
          className="btn btn-ghost text-sm"
          data-testid="pnd-csv"
        >
          ดาวน์โหลดรายการ {annual ? "ภ.ง.ด.1ก" : label} (CSV ช่วยกรอกแบบ)
        </a>
      </form>

      {sp.ok && <p className="text-sm font-medium" data-testid="pnd-ok">{sp.ok}</p>}
      {sp.err && <p className="text-sm text-[color:var(--color-danger)]" data-testid="pnd-err">{sp.err}</p>}

      {annual && annualRep ? (
        <Section title={`ภ.ง.ด.1ก — ปี ${year} · รวมต่อผู้มีเงินได้`}>
          <DataTable<AnnualRow>
            cols={[
              { key: "seq", header: "ลำดับ", render: (r) => r.seq },
              { key: "name", header: "ผู้มีเงินได้", render: (r) => r.recipientName },
              { key: "tax", header: "เลขภาษี", render: (r) => r.recipientTaxId ?? "—" },
              { key: "n", header: "ครั้ง", align: "right", render: (r) => r.count },
              { key: "base", header: "เงินได้ทั้งปี", align: "right", render: (r) => <MoneyText satang={r.base} decimals /> },
              { key: "wht", header: "ภาษีทั้งปี", align: "right", render: (r) => <span className="font-medium"><MoneyText satang={r.whtAmount} decimals /></span> },
              { key: "nc", header: "ยังไม่ออก 50 ทวิ", align: "right", render: (r) => (r.uncertified ? r.uncertified : "—") },
            ]}
            rows={annualRep.rows}
            minWidth={680}
            empty="ไม่มีรายการ ภ.ง.ด.1 ในปีนี้"
            rowKey={(r) => `${r.recipientTaxId ?? ""}:${r.recipientName}`}
          />
          <p className="text-xs text-[color:var(--color-muted)]">
            เงินได้ ม.50(1) ออกหนังสือรับรอง (50 ทวิ) ภายใน 15 ก.พ. ของปีถัดไป (ม.50 ทวิ (2)) — รวมทั้งปี <MoneyText satang={annualRep.grandBase} decimals /> · ภาษี{" "}
            <MoneyText satang={annualRep.grandWht} decimals />
          </p>
        </Section>
      ) : (
        <>
          {report.warnings.length > 0 && <LegalWarnings warnings={report.warnings} testId="pnd-warnings" />}

          {/* ACC T1.7 + T3.4 — สถานะนำส่ง · รายการปรับหลังยื่น · แบบยื่นเพิ่มเติม */}
          <section className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm" data-testid="pnd-filed">
            {filing ? (
              <div className="flex flex-wrap items-center gap-3">
                <span data-testid="pnd-filed-state">
                  ทำเครื่องหมายนำส่ง {label} งวด {period} แล้ว เมื่อ {fmtDate(filing.filedAt)}
                  {filing.filedById ? ` โดย ${names.get(filing.filedById) ?? "ผู้ใช้"}` : ""} · {filing.certCount} รายการ · ภาษี <MoneyText satang={filing.totalTaxSatang} decimals />
                </span>
                {canUnmark && st.additional.length === 0 && (
                  <ConfirmDialog
                    action={unmarkAction}
                    reasonField={{ name: "reason", label: "เหตุผลที่ยกเลิกเครื่องหมาย (เก็บในประวัติ)", required: true }}
                    triggerLabel="ยกเลิกเครื่องหมาย"
                    triggerClassName="text-sm text-[color:var(--color-muted)] hover:underline"
                    title={`ยกเลิกเครื่องหมายนำส่ง ${label} งวด ${period}?`}
                    detail="50 ทวิ ของงวดนี้จะกลับไปเป็น “ยังไม่นำส่ง” · ตัวเลขที่นำส่งและประวัติยังเก็บไว้"
                    confirmLabel="ยืนยัน"
                    danger
                    testId="pnd-unmark"
                  />
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span data-testid="pnd-filed-state">
                  ยังไม่ได้ทำเครื่องหมายนำส่ง {label} งวด {period}
                </span>
                {canManage && report.rows.length > 0 && (
                  <ConfirmDialog
                    action={markAction}
                    triggerLabel={`ทำเครื่องหมายนำส่ง ${label} งวดนี้`}
                    triggerClassName="btn btn-ghost text-sm"
                    title={`ทำเครื่องหมายนำส่ง ${label} งวด ${period}?`}
                    detail={`${report.rows.length} รายการ · ภาษี ${(report.grandWht / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} บาท${report.uncertifiedCount ? ` · ในนี้ ${report.uncertifiedCount} รายการยังไม่ออก 50 ทวิ` : ""}`}
                    confirmLabel="ยืนยัน"
                    testId="pnd-mark"
                  />
                )}
              </div>
            )}
            {filing && (
              <div className="flex flex-col gap-2" data-testid="pnd-filed-diffs">
                <h3 className="font-medium">
                  รายการปรับหลังนำส่ง ({st.changes.length} รายการ) · ยื่นล่าสุด <MoneyText satang={st.latestTaxSatang ?? 0} decimals /> · รายงานตอนนี้{" "}
                  <MoneyText satang={st.currentTaxSatang} decimals /> · ส่วนต่าง <span data-testid="pnd-delta"><MoneyText satang={st.deltaTaxSatang} decimals /></span>
                </h3>
                {st.changes.length === 0 ? (
                  <p className="text-xs text-[color:var(--color-muted)]" data-testid="pnd-filed-diffs-empty">ไม่มี 50 ทวิ ที่ออกหรือยกเลิกในงวดนี้หลังทำเครื่องหมาย</p>
                ) : (
                  <DataTable<(typeof st.changes)[number]>
                    cols={[
                      { key: "at", header: "เมื่อ", render: (r) => fmtDate(r.at) },
                      { key: "cert", header: "50 ทวิ", render: (r) => <Link href={`${base}/wht/${r.certId}/print`} className="underline">{r.certNo ?? "—"}</Link> },
                      { key: "who", header: "ผู้รับเงิน", render: (r) => r.contactName },
                      { key: "change", header: "เปลี่ยน", render: (r) => (r.change === "ISSUED_AFTER" ? "ออกหลังนำส่ง" : "ยกเลิกหลังนำส่ง") },
                      { key: "wht", header: "ภาษี", align: "right", render: (r) => <MoneyText satang={r.whtDelta} decimals /> },
                      { key: "filed", header: "ยื่นเพิ่มเติมแล้ว", render: (r) => (st.pending.includes(r) ? "ยัง" : "แล้ว") },
                      { key: "ack", header: "สถานะ", render: (r) => (r.acknowledged ? "ยืนยันคำเตือนแล้ว" : "ไม่มีการยืนยัน") },
                    ]}
                    rows={st.changes}
                    minWidth={720}
                    empty="ไม่มีรายการ"
                    rowKey={(r) => `${r.certId}:${r.change}`}
                  />
                )}
                {st.additional.length > 0 && (
                  <ul className="flex flex-col gap-0.5 text-xs" data-testid="pnd-additional-list">
                    {st.additional.map((a) => (
                      <li key={a.id} data-testid="pnd-additional-row">
                        แบบยื่นเพิ่มเติมครั้งที่ {a.seq} · {fmtDate(a.filedAt)} · ภาษีรวม <MoneyText satang={a.totalTaxSatang} decimals /> · ส่วนต่าง{" "}
                        <MoneyText satang={a.deltaTaxSatang} decimals />
                        {a.filedById ? ` · โดย ${names.get(a.filedById) ?? "ผู้ใช้"}` : ""}
                        {a.note ? ` · ${a.note}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {canManage && (st.pending.length > 0 || st.deltaTaxSatang !== 0) && (
                  <form action={additionalAction} className="flex flex-col gap-2 rounded-lg border border-dashed p-2" data-testid="pnd-additional-form">
                    <LegalWarnings warnings={whtAdditionalWarnings(type, period, nextSeq, st.deltaTaxSatang)} ackName="ack" compact testId="pnd-additional-warn" />
                    <input name="note" className="input text-sm" placeholder="หมายเหตุ (เช่น ยื่นทางอินเทอร์เน็ต)" maxLength={200} />
                    <button className="btn btn-primary self-start text-sm" data-testid="pnd-additional-submit">
                      บันทึกแบบยื่นเพิ่มเติมครั้งที่ {nextSeq}
                    </button>
                  </form>
                )}
              </div>
            )}
          </section>

          {hist.length > 0 && (
            <section className="flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs print:hidden" data-testid="pnd-filing-history">
              <h3 className="text-sm font-medium">
                ประวัติการทำเครื่องหมายนำส่ง {label} งวด {period}
              </h3>
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
          <Section title={`${label} — งวด ${period} · สรุปตามประเภทเงินได้`}>
            <DataTable<SummaryRow>
              cols={[
                { key: "label", header: "ประเภทเงินได้", render: (r) => (r.total ? <span className="font-semibold">{r.label}</span> : r.label) },
                { key: "count", header: "ราย", align: "right", render: (r) => (r.total ? <span className="font-semibold">{r.count}</span> : r.count) },
                { key: "base", header: "ฐานเงินได้", align: "right", render: (r) => <span className={r.total ? "font-semibold" : undefined}><MoneyText satang={r.base} decimals /></span> },
                { key: "wht", header: "ภาษีที่หัก", align: "right", render: (r) => <span className={r.total ? "font-semibold" : "font-medium"}><MoneyText satang={r.wht} decimals /></span> },
              ]}
              rows={summaryRows}
              minWidth={520}
              empty={`ไม่มีรายการ ${label} ในงวดนี้`}
              rowKey={(r) => r.key}
            />
            {/* ACC T3 merge ▸ หักแล้วแต่นำส่งทางอื่น — ไม่อยู่ในแบบนี้ ไม่ต้องออก 50 ทวิ (skill WHT §14 · §16) ◂ */}
            {(report.otherChannels.EWHT.count > 0 || report.otherChannels.AGENT.count > 0) && (
              <ul className="mt-2 flex flex-col gap-0.5 text-xs text-[color:var(--color-muted)]" data-testid="pnd-other-channels">
                {report.otherChannels.EWHT.count > 0 && (
                  <li data-testid="pnd-other-ewht">
                    ไม่รวมในแบบนี้: นำส่งผ่าน e-WHT ของธนาคาร {report.otherChannels.EWHT.count} รายการ · ฐาน <MoneyText satang={report.otherChannels.EWHT.base} decimals /> · ภาษี{" "}
                    <MoneyText satang={report.otherChannels.EWHT.wht} decimals /> (หลักฐานธนาคารใช้แทน 50 ทวิ)
                  </li>
                )}
                {report.otherChannels.AGENT.count > 0 && (
                  <li data-testid="pnd-other-agent">
                    ไม่รวมในแบบนี้: ผู้ขายเป็นตัวแทนหักภาษี {report.otherChannels.AGENT.count} รายการ · ฐาน <MoneyText satang={report.otherChannels.AGENT.base} decimals /> · ภาษี{" "}
                    <MoneyText satang={report.otherChannels.AGENT.wht} decimals /> (ผู้ขายยื่นแทน · ไม่ออก 50 ทวิ)
                  </li>
                )}
              </ul>
            )}
          </Section>

          {/* รายการ (ใบแนบ) — รวมการจ่ายที่หักแล้วแต่ยังไม่มีใบ */}
          {report.rows.length > 0 && (
            <Section title="รายการ (ลำดับเดียวกับที่พิมพ์บน 50 ทวิ และ CSV)">
              {filing && report.uncertifiedCount > 0 && canManage ? (
                <LegalWarnings
                  testId="pnd-issue-filed-warn"
                  compact
                  warnings={[legalWarning("FILED_PERIOD_PND_CHANGE", { period, forms: label, ref: "50 ทวิ ของรายการที่ยังไม่ออก", what: "ออก 50 ทวิ ลงวันที่ในเดือนนั้น", amount: "ภาษีของเดือนไม่เปลี่ยน (นับไว้ตอนยื่นแล้ว)" })]}
                />
              ) : null}
              <DataTable<DetailRow>
                cols={[
                  { key: "seq", header: "#", render: (r) => r.seq },
                  {
                    key: "certNo",
                    header: "เลขที่ 50 ทวิ",
                    render: (r) =>
                      r.certId ? (
                        <Link href={`${base}/wht/${r.certId}/print`} className="underline">
                          {r.certNo}
                        </Link>
                      ) : canManage && r.paymentId ? (
                        <form action={issueWhtCertAction} className="flex items-center gap-1" data-testid={`pnd-issue-${r.paymentId}`}>
                          <input type="hidden" name="systemId" value={systemId} />
                          <input type="hidden" name="paymentId" value={r.paymentId} />
                          <input type="hidden" name="whtIncomeType" value={(r.incomeType as AccountWhtIncomeType | null) ?? "M40_8"} />
                          {r.whtRateBp ? <input type="hidden" name="whtRateBp" value={r.whtRateBp} /> : null}
                          <span className="text-xs text-[color:var(--color-danger)]">ยังไม่ออก</span>
                          {filing ? (
                            // เดือนที่นำส่งแล้ว: ออกใบลงเดือนนั้น = คำเตือน FILED_PERIOD_PND_CHANGE (กล่องคำเตือนเหนือตาราง) — ติ๊กยืนยันต่อแถว
                            <label className="flex items-center gap-1 text-xs">
                              <input type="checkbox" name="ack" value="FILED_PERIOD_PND_CHANGE" required data-testid={`pnd-issue-ack-${r.paymentId}`} />
                              รับทราบ
                            </label>
                          ) : null}
                          <button className="text-xs underline">ออก 50 ทวิ</button>
                        </form>
                      ) : (
                        <span className="text-xs text-[color:var(--color-danger)]">ยังไม่ออก 50 ทวิ</span>
                      ),
                  },
                  { key: "date", header: "วันที่จ่าย", render: (r) => fmtDate(r.paidAt) },
                  { key: "recipient", header: "ผู้รับเงิน", render: (r) => r.recipientName },
                  { key: "taxId", header: "เลขภาษี", render: (r) => r.recipientTaxId ?? "—" },
                  { key: "income", header: "ประเภท", render: (r) => r.incomeLabel },
                  { key: "base", header: "ฐาน", align: "right", render: (r) => <MoneyText satang={r.base} decimals /> },
                  { key: "rate", header: "อัตรา", align: "right", render: (r) => pct(r.whtRateBp) },
                  { key: "wht", header: "ภาษี", align: "right", render: (r) => <span className="font-medium"><MoneyText satang={r.whtAmount} decimals /></span> },
                ]}
                rows={report.rows}
                minWidth={860}
                empty="ไม่มีรายการ"
                rowKey={(r) => r.certId ?? `p:${r.paymentId}`}
              />
            </Section>
          )}
        </>
      )}

      {/* เครดิตภาษีถูกหัก สะสมทั้งปี — ACC T3.5: สถานะรับ 50 ทวิ = ธงจริง */}
      <Section
        title={`เครดิตภาษีถูกหัก (สะสม 1160) — ปี ${year}`}
        actions={
          <div className="flex items-center gap-3">
            <span className="text-sm text-[color:var(--color-muted)]">
              รวม <MoneyText satang={creditYear.totalWht} decimals />
            </span>
            <Link href={`${base}/wht?tab=credit&owed=1`} className="btn btn-ghost whitespace-nowrap text-sm" data-testid="pnd-credits-owed-link">
              ค้างรับ 50 ทวิ
            </Link>
            <a href={`${base}/tax/export?kind=credits&year=${year}`} className="btn btn-ghost text-sm">
              ดาวน์โหลด CSV
            </a>
          </div>
        }
      >
        <DataTable<CreditRow>
          cols={[
            { key: "date", header: "วันที่", render: (r) => fmtDate(r.paidAt) },
            { key: "doc", header: "เอกสาร", render: (r) => r.docNo ?? "—" },
            { key: "payer", header: "ผู้หัก", render: (r) => r.contactName },
            { key: "wht", header: "ภาษีถูกหัก", align: "right", render: (r) => <span className="font-medium"><MoneyText satang={r.whtAmount} decimals /></span> },
            { key: "recv", header: "50 ทวิ", render: (r) => (r.certReceivedAt ? `ได้รับแล้ว ${fmtDate(r.certReceivedAt)}` : "ยังไม่ได้รับ") },
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
