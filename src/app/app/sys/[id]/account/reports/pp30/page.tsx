import { pp30, type Pp30Side } from "@/lib/modules/account/reports";
import type { SalesTaxReport } from "@/lib/modules/account/sales-tax-report";
import {
  buyerBranchLabelTh,
  isSalesTaxAbbMode,
  SALES_TAX_ABB_MODE_LABEL_TH,
  SALES_TAX_ABB_MODES,
  type SalesTaxRow,
} from "@/lib/modules/account/sales-tax-shared";
import { saveSalesTaxAbbModeAction } from "@/lib/modules/account/sales-tax-actions";
import { editorDetailPath } from "@/lib/modules/account/doc-editor-config";
import { AccountIcon } from "@/components/account-v2/AccountIcon";
import Link from "next/link";
import type { AccountDocType } from "@prisma/client";
import { MoneyText } from "@/components/ui/MoneyText";
import { loadReport, currentPeriodKey, ReportHeader, TableWrap } from "../_shared";
import ReportToolbar from "../ReportToolbar";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import { markVatFiled, unmarkVatFiled, listVatFilings } from "@/lib/modules/account/period-close";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

function sideBlock(title: string, s: Pp30Side) {
  return (
    <TableWrap>
      <thead>
        <tr className="border-b bg-[color:var(--color-surface-2)] text-left">
          <th className="sticky left-0 z-20 bg-[color:var(--color-surface-2)] px-3 py-2" colSpan={4}>{title}</th>
        </tr>
        <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
          <th className="sticky left-0 z-20 bg-[color:var(--color-surface-2)] px-3 py-1.5">เลขที่</th>
          <th className="px-3 py-1.5">คู่ค้า</th>
          <th className="px-3 py-1.5 text-right">ฐานภาษี</th>
          <th className="px-3 py-1.5 text-right">ภาษี</th>
        </tr>
      </thead>
      <tbody>
        {s.byRate.map((g) => (
          <tr key={g.rateBp} className="border-b bg-[color:var(--color-surface-2)] text-xs font-medium">
            <td className="sticky left-0 z-10 bg-[color:var(--color-surface-2)] px-3 py-1" colSpan={2}>อัตรา {g.rateBp / 100}%</td>
            <td className="px-3 py-1 text-right"><MoneyText satang={g.base} decimals /></td>
            <td className="px-3 py-1 text-right"><MoneyText satang={g.vat} decimals /></td>
          </tr>
        ))}
        {s.rows.map((r, i) => (
          <tr key={`${r.docNo}-${i}`} className="border-b last:border-0">
            <td className="sticky left-0 z-10 bg-[color:var(--color-surface)] px-3 py-1.5 font-mono text-xs">{r.docNo}</td>
            <td className="px-3 py-1.5">{r.contactName || "—"}<span className="text-xs text-[color:var(--color-muted)]"> {r.taxId}</span>{r.note && <div className="text-xs text-[color:var(--color-muted)]" data-testid="pp30-row-note">{r.note}</div>}</td>
            <td className="px-3 py-1.5 text-right"><MoneyText satang={r.base} decimals /></td>
            <td className="px-3 py-1.5 text-right"><MoneyText satang={r.vat} decimals /></td>
          </tr>
        ))}
        <tr className="border-t-2 font-semibold">
          <td className="sticky left-0 z-10 bg-[color:var(--color-surface)] px-3 py-2" colSpan={2}>รวม</td>
          <td className="px-3 py-2 text-right"><MoneyText satang={s.base} decimals /></td>
          <td className="px-3 py-2 text-right"><MoneyText satang={s.total} decimals /></td>
        </tr>
      </tbody>
    </TableWrap>
  );
}

// ── ACC T1.1 ▸ รายงานภาษีขาย: หัวรายงาน · กลุ่มอัตรา (หัวกลุ่ม → แถว → รวมกลุ่ม) · ใบย่อรวมรายวัน + กดดูรายใบ · หมายเหตุยกเลิก · ข้อตรวจ ◂
const thDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${Number(d)}/${Number(m)}/${Number(y) + 543}`;
};
const cellCls = "px-2 py-1.5 align-top";

function docLink(base: string, r: SalesTaxRow): string | null {
  if (!r.docId || !r.docType || r.docType === "TAX_INVOICE_ABB" || r.docType.startsWith("POS_")) return null;
  return editorDetailPath(base, r.docType as AccountDocType, r.docId);
}

function SalesTaxHeaderBox({ st }: { st: SalesTaxReport }) {
  const h = st.header;
  return (
    <section className="rounded-lg border p-3 text-sm print:border-black" data-testid="salestax-header">
      <h2 className="text-base font-semibold">รายงานภาษีขาย</h2>
      <dl className="mt-1 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
        <div><dt className="inline text-[color:var(--color-muted)]">ชื่อผู้ประกอบการ </dt><dd className="inline font-medium" data-testid="salestax-org">{h.orgName || "—"}</dd></div>
        <div><dt className="inline text-[color:var(--color-muted)]">เลขประจำตัวผู้เสียภาษีอากร </dt><dd className="inline font-mono" data-testid="salestax-taxid">{h.taxId || "—"}</dd></div>
        <div><dt className="inline text-[color:var(--color-muted)]">สถานประกอบการ </dt><dd className="inline" data-testid="salestax-branch">{h.branchLabel}</dd></div>
        <div><dt className="inline text-[color:var(--color-muted)]">เดือนภาษี </dt><dd className="inline" data-testid="salestax-month">{h.monthLabel}</dd></div>
      </dl>
      {h.warnings.map((w) => (
        <p key={w} className="mt-1 flex items-start gap-1 text-[color:var(--color-danger)]" data-testid="salestax-header-warn">
          <AccountIcon name="warn" className="mt-0.5 h-4 w-4 shrink-0" />
          {w}
        </p>
      ))}
    </section>
  );
}

function SalesTaxTable({ st, base }: { st: SalesTaxReport; base: string }) {
  return (
    <TableWrap>
      <thead>
        <tr className="border-b bg-[color:var(--color-surface-2)] text-left">
          <th className="px-3 py-2" colSpan={9}>รายงานภาษีขาย (2200)</th>
        </tr>
        <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
          <th className="px-2 py-1.5 text-right">ลำดับ</th>
          <th className="px-2 py-1.5">วันที่</th>
          <th className="px-2 py-1.5">เลขที่</th>
          <th className="px-2 py-1.5">ชื่อผู้ซื้อ</th>
          <th className="px-2 py-1.5">เลขผู้เสียภาษี</th>
          <th className="px-2 py-1.5">สาขา</th>
          <th className="px-2 py-1.5 text-right">มูลค่า</th>
          <th className="px-2 py-1.5 text-right">ภาษี</th>
          <th className="px-2 py-1.5">หมายเหตุ</th>
        </tr>
      </thead>
      {st.groups.length === 0 && (
        <tbody>
          <tr><td className="px-3 py-3 text-[color:var(--color-muted)]" colSpan={9}>ไม่มีรายการภาษีขายในเดือนนี้</td></tr>
        </tbody>
      )}
      {st.groups.map((g) => (
        <tbody key={g.rateBp} data-testid={`salestax-group-${g.rateBp}`}>
          <tr className="border-b bg-[color:var(--color-surface-2)] text-xs font-semibold">
            <td className="px-3 py-1.5" colSpan={9} data-testid="salestax-group-head">{g.label}</td>
          </tr>
          {g.rows.map(({ row: r, part, seq }) => {
            const href = docLink(base, r);
            return (
              <tr key={`${g.rateBp}-${r.key}`} className={`border-b ${r.cancelled ? "text-[color:var(--color-muted)]" : ""}`} data-testid="salestax-row" data-kind={r.kind}>
                <td className={`${cellCls} text-right tabular-nums`}>{seq}</td>
                <td className={`${cellCls} whitespace-nowrap`}>{thDate(r.date)}</td>
                <td className={`${cellCls} font-mono text-xs`}>
                  {href ? <Link href={href} className="hover:underline">{r.docNo}</Link> : r.docNo}
                  {r.docNoTo && (
                    <span className="block font-sans text-[11px] text-[color:var(--color-muted)]">
                      ถึง <span className="font-mono">{r.docNoTo}</span> · {r.count} ใบ
                    </span>
                  )}
                </td>
                <td className={cellCls}>{r.buyerName || "—"}</td>
                <td className={`${cellCls} font-mono text-xs`}>{r.buyerTaxId}</td>
                <td className={`${cellCls} text-xs`}>{buyerBranchLabelTh(r.buyerBranchCode)}</td>
                <td className={`${cellCls} text-right`}><MoneyText satang={part.base} decimals /></td>
                <td className={`${cellCls} text-right`}><MoneyText satang={part.vat} decimals /></td>
                <td className={`${cellCls} text-xs`}>
                  {r.cancelled && <span className="mr-1 rounded border px-1 font-semibold" data-testid="salestax-cancel">ยกเลิก</span>}
                  {r.notes.join(" · ")}
                  {r.flag && (
                    <span className="mt-0.5 flex items-center gap-1 text-[color:var(--color-danger)]">
                      <AccountIcon name="warn" className="h-3.5 w-3.5" />{r.flag}
                    </span>
                  )}
                  {r.bills && r.bills.length > 0 && (
                    <details className="mt-1 print:hidden" data-testid="salestax-drill">
                      <summary className="cursor-pointer text-[color:var(--color-muted)]">ดูรายใบ ({r.bills.length})</summary>
                      <table className="mt-1 w-full text-[11px]">
                        <tbody>
                          {r.bills.map((b) => (
                            <tr key={b.key} className={b.cancelled ? "text-[color:var(--color-muted)] line-through" : ""}>
                              <td className="pr-2 font-mono">{b.docNo}</td>
                              <td className="pr-2 text-right"><MoneyText satang={b.base} decimals /></td>
                              <td className="text-right"><MoneyText satang={b.vat} decimals /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
          <tr className="border-b text-xs font-semibold" data-testid="salestax-group-total">
            <td className="px-3 py-1.5" colSpan={6}>รวม{g.label}</td>
            <td className="px-2 py-1.5 text-right"><MoneyText satang={g.base} decimals /></td>
            <td className="px-2 py-1.5 text-right"><MoneyText satang={g.vat} decimals /></td>
            <td />
          </tr>
        </tbody>
      ))}
      <tfoot>
        <tr className="border-t-2 font-semibold" data-testid="salestax-total">
          <td className="px-3 py-2" colSpan={6}>รวมทั้งสิ้น</td>
          <td className="px-2 py-2 text-right"><MoneyText satang={st.total.base} decimals /></td>
          <td className="px-2 py-2 text-right"><MoneyText satang={st.total.vat} decimals /></td>
          <td />
        </tr>
      </tfoot>
    </TableWrap>
  );
}

function SalesTaxChecks({ st }: { st: SalesTaxReport }) {
  const money = (n: number) => (n / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <section className="rounded-lg border p-3 text-sm" data-testid="salestax-checks">
      <h3 className="mb-1 font-medium">ข้อตรวจกระทบยอดรายงานภาษีขาย</h3>
      <ul className="flex flex-col gap-1">
        {st.checks.map((c) => (
          <li key={c.key} className="flex items-start gap-1.5" data-testid={`salestax-check-${c.key}`} data-ok={c.ok ? "1" : "0"}>
            <AccountIcon name={c.ok ? "check" : "warn"} className={`mt-0.5 h-4 w-4 shrink-0 ${c.ok ? "" : "text-[color:var(--color-danger)]"}`} />
            <span>
              {c.label} — {c.ok ? "ตรง" : "ไม่ตรง"}
              {!c.ok && (
                <span className="text-[color:var(--color-danger)]">
                  {" "}(ควรเป็น {c.key === "BASE_VAT" ? c.expected : money(c.expected)} · ได้ {c.key === "BASE_VAT" ? `${c.actual} แถว` : money(c.actual)}{c.detail ? ` · ${c.detail}` : ""})
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function Pp30Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; carry?: string; to?: string; err?: string; ok?: string; abb?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;
  const period = sp.period || sp.to || currentPeriodKey();
  const carryForward = Math.round((Number(sp.carry) || 0) * 100);
  const abbView = isSalesTaxAbbMode(sp.abb) ? sp.abb : null;
  const pp = await pp30({ tenantId, systemId }, period, { carryForward, abbMode: abbView });
  const st = pp.salesTax;
  // WO 6.2 (§11.4 เช็กลิสต์ข้อ 4): งวดนี้ทำเครื่องหมาย "ยื่น ภ.พ.30 แล้ว" หรือยัง
  const filings = await listVatFilings({ tenantId, systemId });
  const filed = filings.find((f) => f.periodKey === period) ?? null;
  const path = `${base}/reports/pp30`;

  async function markFiledAction(fd: FormData) {
    "use server";
    const { auth, tenantId } = await loadAccountSystem(id);
    // ยื่นภาษี = การกระทำเชิงบัญชี ไม่ใช่แค่การอ่านรายงาน ⇒ ใช้สิทธิ์ระดับปิดงวด
    assertAccountCan(auth, "account.period.close");
    const key = String(fd.get("periodKey") ?? "");
    const r = await markVatFiled(
      { tenantId, systemId: id },
      {
        periodKey: key,
        salesVat: Number(fd.get("salesVat") ?? 0),
        inputVat: Number(fd.get("inputVat") ?? 0),
        userId: auth.user.id,
        note: String(fd.get("note") ?? "") || null,
      },
    );
    await writeAudit({
      tenantId,
      actorId: auth.user.id,
      action: "account.vat.file",
      targetType: "AccountVatFiling",
      targetId: key,
      after: { ok: r.ok },
    });
    revalidatePath(path);
    redirect(
      r.ok
        ? `${path}?period=${key}&ok=${encodeURIComponent(`ทำเครื่องหมายยื่น ภ.พ.30 งวด ${key} แล้ว`)}`
        : `${path}?period=${key}&err=${encodeURIComponent(r.reason)}`,
    );
  }

  async function unmarkFiledAction(fd: FormData) {
    "use server";
    const { auth, tenantId } = await loadAccountSystem(id);
    // ยกเลิกเครื่องหมายยื่น = สิทธิ์ระดับเจ้าของ (แบบเดียวกับ account.period.reopen / wht unfile)
    assertAccountCan(auth, "account.period.reopen");
    const key = String(fd.get("periodKey") ?? "");
    const r = await unmarkVatFiled({ tenantId, systemId: id }, key);
    await writeAudit({
      tenantId,
      actorId: auth.user.id,
      action: "account.vat.unfile",
      targetType: "AccountVatFiling",
      targetId: key,
      after: { ok: r.ok },
    });
    revalidatePath(path);
    redirect(
      r.ok
        ? `${path}?period=${key}&ok=${encodeURIComponent("ยกเลิกเครื่องหมายยื่นแล้ว")}`
        : `${path}?period=${key}&err=${encodeURIComponent(r.reason)}`,
    );
  }

  // ACC T1.1 ▸ Excel บนจอ: หัวรายงาน + แถวภาษีขายตามกลุ่มอัตรา (วันที่ · สาขา · หมายเหตุ) แล้วตามด้วยภาษีซื้อ ◂
  const headRow = (label: string, value: string): (string | number)[] => [label, value, "", "", "", "", "", "", "", "", ""];
  const csv = {
    headers: ["ประเภท", "ลำดับ", "วันที่", "เลขที่", "ถึงเลขที่", "คู่ค้า/ผู้ซื้อ", "เลขภาษี", "สาขา", "อัตรา%", "ฐาน (บาท)", "ภาษี (บาท)", "หมายเหตุ"],
    rows: [
      headRow("รายงานภาษีขาย", st.header.orgName),
      headRow("เลขประจำตัวผู้เสียภาษีอากร", st.header.taxId),
      headRow("สถานประกอบการ", `${st.header.branchLabel} (${st.header.branchCode})`),
      headRow("เดือนภาษี", st.header.monthLabel),
      ...st.groups.flatMap((g) =>
        g.rows.map(({ row: r, part, seq }) => ["ภาษีขาย", seq, r.date, r.docNo, r.docNoTo ?? "", r.buyerName, r.buyerTaxId, r.buyerBranchCode, part.rateBp < 0 ? "ยกเว้น" : part.rateBp / 100, part.base / 100, part.vat / 100, r.notes.join(" · ")] as (string | number)[]),
      ),
      ...pp.input.rows.map((r) => ["ภาษีซื้อ", "", r.date.toISOString().slice(0, 10), r.docNo, "", r.contactName, r.taxId, r.branchCode, r.rateBp / 100, r.base / 100, r.vat / 100, ""] as (string | number)[]),
    ],
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <ReportHeader base={base} title="ภ.พ.30 + รายงานภาษีขาย/ซื้อ" subtitle={`เดือนภาษี ${st.header.monthLabel} (${period})`} />
      </div>
      {/* ภ.พ.30 ยื่นเป็น "งวด" ⇒ ใช้แถบเครื่องมือโหมด ณ สิ้นเดือน · ไม่มีตัวเลือกเทียบงวดก่อน (แบบยื่นไม่เทียบ) */}
      <ReportToolbar filename={`ภพ30-${period}`} csv={csv} mode="asof" to={period} showCompare={false} />

      {sp.err && <p className="text-sm text-[color:var(--color-danger)]">{sp.err}</p>}
      {sp.ok && <p className="text-sm font-medium">{sp.ok}</p>}

      <form className="flex flex-wrap items-center gap-2 print:hidden">
        <input type="hidden" name="period" value={period} />
        <input name="carry" defaultValue={sp.carry ?? ""} placeholder="เครดิตยกมา (บาท)" className="rounded-lg border px-2 py-1.5 text-sm" />
        <button className="btn btn-ghost text-sm">คำนวณ</button>
        <a
          href={`${base}/tax/export?kind=pp30&period=${period}&carry=${carryForward}`}
          className="btn-sm"
          download
        >
          ดาวน์โหลด CSV ยื่น
        </a>
      </form>

      {/* เครื่องหมาย "ยื่นแล้ว" — เช็กลิสต์ก่อนปิดงวด (§11.4) อ่านจากตรงนี้ */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm print:hidden" data-testid="pp30-filed-box">
        {filed ? (
          <>
            <span data-testid="pp30-filed-state">✓ ทำเครื่องหมายยื่น ภ.พ.30 งวด {period} แล้ว</span>
            <ConfirmDialog
              action={unmarkFiledAction}
              fields={{ periodKey: period }}
              triggerLabel="ยกเลิกเครื่องหมาย"
              triggerClassName="text-sm text-[color:var(--color-muted)] hover:underline"
              title="ยกเลิกเครื่องหมายยื่น ภ.พ.30?"
              detail="เช็กลิสต์ก่อนปิดงวดจะกลับไปเป็น “ยังไม่ได้ยื่น”"
              confirmLabel="ยืนยัน"
              danger
            />
          </>
        ) : (
          <>
            <span data-testid="pp30-filed-state">ยังไม่ได้ทำเครื่องหมายยื่นสำหรับงวด {period}</span>
            <ConfirmDialog
              action={markFiledAction}
              fields={{
                periodKey: period,
                salesVat: String(pp.output.total),
                inputVat: String(pp.input.total),
              }}
              reasonField={{ name: "note", label: "หมายเหตุ (ไม่บังคับ)", required: false }}
              triggerLabel="ทำเครื่องหมายยื่นแล้ว"
              triggerClassName="btn btn-ghost text-sm"
              title={`ทำเครื่องหมายยื่น ภ.พ.30 งวด ${period}?`}
              detail="ระบบจะบันทึกยอดภาษีขาย/ซื้อของงวดนี้ไว้เป็นหลักฐาน และเช็กลิสต์ก่อนปิดงวดจะผ่านข้อนี้"
              confirmLabel="ยืนยัน"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-3">
        <div><div className="text-xs text-[color:var(--color-muted)]">ภาษีขาย</div><div className="text-lg font-semibold"><MoneyText satang={pp.output.total} decimals /></div></div>
        <div><div className="text-xs text-[color:var(--color-muted)]">ภาษีซื้อ</div><div className="text-lg font-semibold"><MoneyText satang={pp.input.total} decimals /></div></div>
        <div>
          <div className="text-xs text-[color:var(--color-muted)]">{pp.netPayable >= 0 ? "ต้องชำระ" : "เครดิตยกไป"}</div>
          <div className="text-lg font-bold"><MoneyText satang={Math.abs(pp.netPayable)} decimals /></div>
        </div>
      </div>
      {pp.carryForward > 0 && (
        <div className="text-xs text-[color:var(--color-muted)]">หักเครดิตภาษียกมา <MoneyText satang={pp.carryForward} decimals /> · เครดิตยกไปเดือนถัดไป <MoneyText satang={pp.creditCarry} decimals /></div>
      )}

      <SalesTaxHeaderBox st={st} />

      {/* วิธีลงใบกำกับภาษีอย่างย่อ: ดูชั่วคราวด้วย ?abb= · ตั้งเป็นค่าเริ่มต้นของสมุดได้ (สิทธิ์ตั้งค่าบัญชี) */}
      <div className="flex flex-wrap items-center gap-2 text-sm print:hidden" data-testid="salestax-abb-mode">
        <span className="text-[color:var(--color-muted)]">ใบกำกับภาษีอย่างย่อ:</span>
        {SALES_TAX_ABB_MODES.map((m) => (
          <Link
            key={m}
            href={`${path}?period=${period}${sp.carry ? `&carry=${encodeURIComponent(sp.carry)}` : ""}&abb=${m}`}
            className={`rounded-full border px-2.5 py-0.5 ${st.abbMode === m ? "border-[color:var(--color-ink)] font-semibold" : "text-[color:var(--color-muted)]"}`}
            data-testid={`salestax-abb-${m}`}
            aria-current={st.abbMode === m ? "true" : undefined}
          >
            {SALES_TAX_ABB_MODE_LABEL_TH[m]}
          </Link>
        ))}
        {st.abbMode !== st.abbModeSetting && (
          <form action={saveSalesTaxAbbModeAction} className="inline">
            <input type="hidden" name="systemId" value={id} />
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="abbMode" value={st.abbMode} />
            <button className="text-xs underline" data-testid="salestax-abb-save">ตั้งเป็นค่าเริ่มต้นของสมุด</button>
          </form>
        )}
      </div>
      <p className="hidden text-xs print:block">ใบกำกับภาษีอย่างย่อ: {SALES_TAX_ABB_MODE_LABEL_TH[st.abbMode]}</p>

      <div className="flex flex-col gap-4">
        <SalesTaxTable st={st} base={base} />
        <SalesTaxChecks st={st} />
        {sideBlock("รายงานภาษีซื้อ (1150)", pp.input)}
      </div>
    </div>
  );
}
