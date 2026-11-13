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
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import Link from "next/link";
import type { AccountDocType } from "@prisma/client";
import { MoneyText } from "@/components/ui/MoneyText";
import { loadReport, currentPeriodKey, ReportHeader, TableWrap } from "../_shared";
import ReportToolbar from "../ReportToolbar";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import { markVatFiled, unmarkVatFiled } from "@/lib/modules/account/period-close";
import { fileVatAdditional, setVatCreditCarry } from "@/lib/modules/account/pp30-filing";
import type { Pp30Return } from "@/lib/modules/account/pp30-return";
import {
  isPp30ExcessChoice,
  PP30_AMOUNT_KEYS,
  PP30_CARRY_SOURCE_LABEL_TH,
  PP30_EXCESS_CHOICE_LABEL_TH,
  PP30_EXCESS_CHOICES,
  PP30_LINE_KEYS,
  PP30_LINE_LABEL_TH,
  type Pp30LineKey,
} from "@/lib/modules/account/pp30-shared";
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
            <td className="px-3 py-1.5">{r.contactName || "—"}<span className="text-xs text-[color:var(--color-muted)]"> {r.taxId}</span></td>
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
      {h.warnings.length > 0 && (
        <div className="mt-2">
          <LegalWarnings warnings={h.warnings} testId="salestax-header-warn" compact />
        </div>
      )}
    </section>
  );
}

// ── ACC T1.3 ▸ ภ.พ.30 ครบช่อง: มูลค่า + ภาษีต่อช่อง · เครดิตยกมา (ที่มา + ประวัติ) · กำหนดยื่น · กระทบ GL ผ่าน mapping · ยื่นแล้ว/แบบเพิ่มเติม ◂
const bahtTh = (n: number) => (n / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STRONG_KEYS: readonly Pp30LineKey[] = ["salesTaxable", "outputVat", "inputVat", "netPayable", "netExcess", "creditCarriedForward"];

function Pp30ReturnBox({ ret, diff }: { ret: Pp30Return; diff: Record<Pp30LineKey, number> | null }) {
  const l = ret.lines;
  return (
    <section className="rounded-lg border p-3 text-sm print:border-black" data-testid="pp30-return">
      <h2 className="text-base font-semibold">แบบ ภ.พ.30 — สรุปตามช่อง</h2>
      <table className="mt-2 w-full">
        <thead>
          <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
            <th className="py-1 pr-2">รายการ</th>
            <th className="py-1 pr-2 text-right">มูลค่า</th>
            <th className="py-1 pr-2 text-right">ภาษี</th>
            {diff && <th className="py-1 text-right">ต่างจากที่ยื่น</th>}
          </tr>
        </thead>
        <tbody>
          {PP30_LINE_KEYS.map((k) => {
            const amount = PP30_AMOUNT_KEYS.includes(k);
            return (
              <tr key={k} className={`border-b last:border-0 ${STRONG_KEYS.includes(k) ? "font-semibold" : ""}`} data-testid={`pp30-line-${k}`}>
                <td className="py-1 pr-2">{PP30_LINE_LABEL_TH[k]}</td>
                <td className="whitespace-nowrap py-1 pr-2 text-right">{amount ? <MoneyText satang={l[k]} decimals /> : ""}</td>
                <td className="whitespace-nowrap py-1 pr-2 text-right">{amount ? "" : <MoneyText satang={l[k]} decimals />}</td>
                {diff && (
                  <td className={`whitespace-nowrap py-1 text-right ${diff[k] !== 0 ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-muted)]"}`}>
                    {diff[k] === 0 ? "—" : `${diff[k] > 0 ? "+" : "−"}${bahtTh(Math.abs(diff[k]))}`}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-[color:var(--color-muted)]" data-testid="pp30-carry-source">
        เครดิตยกมา: {PP30_CARRY_SOURCE_LABEL_TH[ret.carry.source]} (เดือน {ret.carry.fromPeriod})
        {ret.carry.source === "OVERRIDE" && <> · ระบบคิดได้ {bahtTh(ret.carry.systemAmount)} บาท</>}
        {" · "}ภาษีที่ชำระเกินสุทธิ: {PP30_EXCESS_CHOICE_LABEL_TH[l.excessChoice]}
      </p>
    </section>
  );
}

function Pp30DeadlineBox({ ret }: { ret: Pp30Return }) {
  const d = ret.deadline;
  return (
    <section className="rounded-lg border p-3 text-sm" data-testid="pp30-deadline">
      <h3 className="mb-1 font-medium">กำหนดยื่น</h3>
      <ul className="flex flex-col gap-0.5">
        <li data-testid="pp30-deadline-paper">ยื่นแบบกระดาษ: {d.paper ? thDate(d.paper.date) : "ไม่มีค่าในตารางค่ากฎหมาย"}</li>
        <li data-testid="pp30-deadline-online">ยื่นทางอินเทอร์เน็ต: {d.online ? thDate(d.online.date) : "ไม่มีแถวที่มีผลสำหรับเดือนนี้"}</li>
      </ul>
      <p className="mt-1 text-xs text-[color:var(--color-muted)]">จากตารางค่ากฎหมาย (ตั้งค่า › ตารางค่ากฎหมาย) · {d.online?.source ?? d.paper?.source ?? ""}</p>
    </section>
  );
}

function Pp30ReconcileBox({ ret }: { ret: Pp30Return }) {
  return (
    <section className="rounded-lg border p-3 text-sm" data-testid="pp30-reconcile">
      <h3 className="mb-1 font-medium">กระทบยอดกับบัญชีแยกประเภท (ตามการผูกบัญชี)</h3>
      <ul className="flex flex-col gap-1">
        {ret.reconcile.map((c) => (
          <li key={c.key} className="flex items-start gap-1.5" data-testid={`pp30-reconcile-${c.key}`} data-ok={c.ok === null ? "" : c.ok ? "1" : "0"}>
            <AccountIcon name={c.ok === false ? "warn" : "check"} className={`mt-0.5 h-4 w-4 shrink-0 ${c.ok === false ? "text-[color:var(--color-danger)]" : c.ok === null ? "opacity-40" : ""}`} />
            <span>
              {c.label} — {c.ledger ? `บัญชี ${c.ledger.code} ${c.ledger.name}${c.ledger.viaMapping ? "" : " (ยังไม่ได้ผูกบัญชี ใช้รหัสเริ่มต้น)"}` : "ยังไม่ได้ผูกบัญชี"}
              {c.onReturn !== null ? (
                <> · ยอดในบัญชี {bahtTh(c.movement)} · ในแบบ {bahtTh(c.onReturn)} — {c.ok ? "ตรง" : "ไม่ตรง"}</>
              ) : (
                <> · ยอดค้างสิ้นเดือน {bahtTh(c.balance ?? 0)} (บัญชีพัก ไม่เข้า ภ.พ.30)</>
              )}
            </span>
          </li>
        ))}
      </ul>
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
                <td className={`${cellCls} whitespace-nowrap font-mono text-xs`}>
                  {href ? <Link href={href} className="hover:underline">{r.docNo}</Link> : r.docNo}
                  {r.docNoTo && (
                    <span className="block font-sans text-[11px] text-[color:var(--color-muted)]">
                      ถึง <span className="font-mono">{r.docNoTo}</span> · {r.count} ใบ
                    </span>
                  )}
                </td>
                <td className={`${cellCls} min-w-[9rem]`}>{r.buyerName || "—"}</td>
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
                      <table className="mt-1 text-[11px]">
                        <tbody>
                          {r.bills.map((b) => (
                            <tr key={b.key} className={b.cancelled ? "text-[color:var(--color-muted)] line-through" : ""}>
                              <td className="pr-2 font-mono">{b.docNo}</td>
                              <td className="whitespace-nowrap pr-2 text-right"><MoneyText satang={b.base} decimals /></td>
                              <td className="whitespace-nowrap text-right"><MoneyText satang={b.vat} decimals /></td>
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
      {/* ACC T1.1 ▸ รวมทั้งสิ้นเป็นแถวท้ายตาราง ไม่ใช่ <tfoot> — เบราว์เซอร์พิมพ์ <tfoot> ซ้ำทุกหน้า (ใบพิมพ์หน้า 1 ขึ้น "รวมทั้งสิ้น" ก่อนแถวหน้า 2) ◂ */}
      <tbody>
        <tr className="border-t-2 font-semibold" data-testid="salestax-total">
          <td className="px-3 py-2" colSpan={6}>รวมทั้งสิ้น</td>
          <td className="px-2 py-2 text-right"><MoneyText satang={st.total.base} decimals /></td>
          <td className="px-2 py-2 text-right"><MoneyText satang={st.total.vat} decimals /></td>
          <td />
        </tr>
      </tbody>
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
  searchParams: Promise<{ period?: string; carry?: string; to?: string; err?: string; ok?: string; abb?: string; excess?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;
  const period = sp.period || sp.to || currentPeriodKey();
  // ?carry= (บาท) = ค่าลองดูชั่วคราว ไม่บันทึก (ACC T1.3: ค่าจริงจำจากเดือนก่อน / ร้านแก้ในกล่องเครดิตยกมา)
  const carryTry = sp.carry !== undefined && sp.carry !== "" && Number.isFinite(Number(sp.carry)) ? Math.round(Number(sp.carry) * 100) : null;
  const abbView = isSalesTaxAbbMode(sp.abb) ? sp.abb : null;
  const excessView = isPp30ExcessChoice(sp.excess) ? sp.excess : null;
  const pp = await pp30({ tenantId, systemId }, period, { carryForward: carryTry, abbMode: abbView, excessChoice: excessView });
  const st = pp.salesTax;
  const ret = pp.ret;
  const L = ret.lines;
  const filed = ret.filed.filed;
  const path = `${base}/reports/pp30`;
  const back = (key: string, q: string) => `${path}?period=${key}&${q}`;

  async function markFiledAction(fd: FormData) {
    "use server";
    const { auth, tenantId } = await loadAccountSystem(id);
    // ยื่นภาษี = การกระทำเชิงบัญชี ไม่ใช่แค่การอ่านรายงาน ⇒ ใช้สิทธิ์ระดับปิดงวด
    assertAccountCan(auth, "account.period.close");
    const key = String(fd.get("periodKey") ?? "");
    const ex = String(fd.get("excessChoice") ?? "");
    // ACC T1.3 ▸ ตัวเลขที่เก็บ = ทุกช่องจากสมุด ณ ตอนกด (ไม่รับยอดจากฟอร์ม) ◂
    const r = await markVatFiled(
      { tenantId, systemId: id },
      { periodKey: key, userId: auth.user.id, note: String(fd.get("note") ?? "") || null, excessChoice: isPp30ExcessChoice(ex) ? ex : null },
    );
    await writeAudit({
      tenantId,
      actorId: auth.user.id,
      action: "account.vat.file",
      targetType: "AccountVatFiling",
      targetId: key,
      after: r.ok ? { ok: true, lines: r.lines, warnings: r.warnings.map((w) => w.code) } : { ok: false },
    });
    revalidatePath(path);
    redirect(r.ok ? back(key, `ok=${encodeURIComponent(`ทำเครื่องหมายยื่น ภ.พ.30 งวด ${key} แล้ว`)}`) : back(key, `err=${encodeURIComponent(r.reason)}`));
  }

  async function additionalAction(fd: FormData) {
    "use server";
    const { auth, tenantId } = await loadAccountSystem(id);
    assertAccountCan(auth, "account.period.close");
    const key = String(fd.get("periodKey") ?? "");
    const ex = String(fd.get("excessChoice") ?? "");
    const r = await fileVatAdditional({ tenantId, systemId: id }, { periodKey: key, userId: auth.user.id, note: String(fd.get("note") ?? "") || null, excessChoice: isPp30ExcessChoice(ex) ? ex : null });
    await writeAudit({
      tenantId,
      actorId: auth.user.id,
      action: "account.vat.file-additional",
      targetType: "AccountVatFiling",
      targetId: key,
      after: r.ok ? { ok: true, seq: r.seq, diff: r.diff, warnings: r.warnings.map((w) => w.code) } : { ok: false },
    });
    revalidatePath(path);
    redirect(r.ok ? back(key, `ok=${encodeURIComponent(`บันทึกแบบยื่นเพิ่มเติมครั้งที่ ${r.seq} ของงวด ${key} แล้ว`)}`) : back(key, `err=${encodeURIComponent(r.reason)}`));
  }

  async function carryAction(fd: FormData) {
    "use server";
    const { auth, tenantId } = await loadAccountSystem(id);
    assertAccountCan(auth, "account.period.close");
    const key = String(fd.get("periodKey") ?? "");
    const reset = fd.get("reset") === "1";
    const raw = String(fd.get("amount") ?? "").replace(/,/g, "").trim();
    const amount = reset ? null : Math.round(Number(raw) * 100);
    if (!reset && (!raw || !Number.isFinite(amount as number))) redirect(back(key, `err=${encodeURIComponent("กรอกเครดิตยกมาเป็นตัวเลข (บาท)")}`));
    const r = await setVatCreditCarry({ tenantId, systemId: id }, { periodKey: key, amountSatang: amount, reason: String(fd.get("reason") ?? ""), userId: auth.user.id });
    await writeAudit({ tenantId, actorId: auth.user.id, action: "account.vat.credit-carry", targetType: "AccountVatCreditCarry", targetId: key, after: { amountSatang: amount, ok: r.ok } });
    revalidatePath(path);
    redirect(r.ok ? back(key, `ok=${encodeURIComponent(reset ? "กลับไปใช้เครดิตยกมาที่ระบบคิดแล้ว" : "บันทึกเครดิตยกมาแล้ว")}`) : back(key, `err=${encodeURIComponent(r.reason)}`));
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
    redirect(r.ok ? back(key, `ok=${encodeURIComponent("ยกเลิกเครื่องหมายยื่นแล้ว")}`) : back(key, `err=${encodeURIComponent(r.reason)}`));
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
      // ACC T1.3 ▸ ช่อง ภ.พ.30 ครบ ◂
      ...PP30_LINE_KEYS.map((k) => ["ภ.พ.30", "", "", "", "", PP30_LINE_LABEL_TH[k], "", "", "", PP30_AMOUNT_KEYS.includes(k) ? L[k] / 100 : "", PP30_AMOUNT_KEYS.includes(k) ? "" : L[k] / 100, ""] as (string | number)[]),
    ],
  };

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <ReportHeader base={base} title="ภ.พ.30 + รายงานภาษีขาย/ซื้อ" subtitle={`เดือนภาษี ${st.header.monthLabel} (${period})`} />
      </div>
      {/* ภ.พ.30 ยื่นเป็น "งวด" ⇒ ใช้แถบเครื่องมือโหมด ณ สิ้นเดือน · ไม่มีตัวเลือกเทียบงวดก่อน (แบบยื่นไม่เทียบ) */}
      <ReportToolbar filename={`ภพ30-${period}`} csv={csv} mode="asof" to={period} showCompare={false} />

      {sp.err && <p className="text-sm text-[color:var(--color-danger)]">{sp.err}</p>}
      {sp.ok && <p className="text-sm font-medium">{sp.ok}</p>}

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <a href={`${base}/tax/export?kind=pp30&period=${period}${carryTry !== null ? `&carry=${carryTry}` : ""}`} className="btn-sm" download>
          ดาวน์โหลด CSV ยื่น
        </a>
        {carryTry !== null && (
          <span className="text-xs text-[color:var(--color-muted)]">
            กำลังลองดูด้วยเครดิตยกมา {bahtTh(carryTry)} บาท (ไม่บันทึก) · <Link href={`${path}?period=${period}`} className="underline">กลับค่าที่บันทึก</Link>
          </span>
        )}
      </div>

      {/* ACC T1.1 หัวรายงาน (ชื่อ · เลข 13 หลัก · สาขา · เดือนภาษี) อยู่บนสุดของใบพิมพ์ */}
      <SalesTaxHeaderBox st={st} />

      <LegalWarnings warnings={ret.warnings} testId="pp30-warnings" />

      <Pp30ReturnBox ret={ret} diff={filed ? ret.diffFromFiled : null} />

      {/* เครดิตยกมา: ร้านแก้ได้ (เก็บประวัติ) */}
      <section className="rounded-lg border p-3 text-sm print:hidden" data-testid="pp30-carry-box">
        <h3 className="font-medium">เครดิตภาษียกมา {bahtTh(L.creditBroughtForward)} บาท</h3>
        <p className="text-xs text-[color:var(--color-muted)]">{PP30_CARRY_SOURCE_LABEL_TH[ret.carry.source]} · ระบบคิดจากเดือน {ret.carry.fromPeriod} ได้ {bahtTh(ret.carry.systemAmount)} บาท</p>
        <form action={carryAction} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="periodKey" value={period} />
          <input name="amount" inputMode="decimal" placeholder="เครดิตยกมา (บาท)" className="w-40 rounded-lg border px-2 py-1.5" data-testid="pp30-carry-amount" />
          <input name="reason" placeholder="เหตุผล (บังคับ)" className="min-w-[14rem] flex-1 rounded-lg border px-2 py-1.5" data-testid="pp30-carry-reason" />
          <button className="btn btn-ghost text-sm" data-testid="pp30-carry-save">บันทึกเครดิตยกมา</button>
          {ret.carry.source === "OVERRIDE" && (
            <button name="reset" value="1" className="text-xs underline" data-testid="pp30-carry-reset">กลับไปใช้ค่าที่ระบบคิด</button>
          )}
        </form>
        {ret.carry.history.length > 0 && (
          <ul className="mt-2 flex flex-col gap-0.5 text-xs text-[color:var(--color-muted)]" data-testid="pp30-carry-history">
            {ret.carry.history.map((h, i) => (
              <li key={i}>
                {h.createdAt.toISOString().slice(0, 10)} · {h.amountSatang === null ? "กลับไปใช้ค่าที่ระบบคิด" : `${bahtTh(h.amountSatang)} บาท`} · {h.reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Pp30DeadlineBox ret={ret} />
        <Pp30ReconcileBox ret={ret} />
      </div>

      {/* ยื่นแล้ว: ภาพตัวเลขที่ยื่น · แบบเพิ่มเติม — เช็กลิสต์ก่อนปิดงวด (§11.4) อ่านสถานะจากตรงนี้ */}
      <section className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm print:hidden" data-testid="pp30-filed-box">
        {L.netExcess > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="pp30-excess-choice">
            <span className="text-[color:var(--color-muted)]">ภาษีที่ชำระเกินสุทธิ:</span>
            {PP30_EXCESS_CHOICES.map((c) => (
              <Link
                key={c}
                href={`${path}?period=${period}&excess=${c}`}
                className={`rounded-full border px-2.5 py-0.5 ${L.excessChoice === c ? "border-[color:var(--color-ink)] font-semibold" : "text-[color:var(--color-muted)]"}`}
                aria-current={L.excessChoice === c ? "true" : undefined}
              >
                {PP30_EXCESS_CHOICE_LABEL_TH[c]}
              </Link>
            ))}
          </div>
        )}
        {filed ? (
          <>
            <span className="flex items-center gap-1.5" data-testid="pp30-filed-state">
              <AccountIcon name="check" className="h-4 w-4" />
              ทำเครื่องหมายยื่น ภ.พ.30 งวด {period} แล้ว ({ret.filed.records.length} ครั้ง)
            </span>
            <ul className="flex flex-col gap-0.5 text-xs" data-testid="pp30-filings">
              {ret.filed.records.map((x) => (
                <li key={`${x.kind}-${x.seq}`}>
                  {x.kind === "ORIGINAL" ? "แบบปกติ" : `แบบเพิ่มเติมครั้งที่ ${x.seq}`} · {x.filedAt.toISOString().slice(0, 10)} · ภาษีสุทธิ{" "}
                  {(() => {
                    const n = (x.lines.netPayable ?? 0) - (x.lines.netExcess ?? 0);
                    return n >= 0 ? `ต้องชำระ ${bahtTh(n)}` : `ชำระเกิน ${bahtTh(-n)}`;
                  })()}
                  {x.diff && x.diff.netPayable ? ` · ต้องชำระเพิ่ม ${bahtTh(x.diff.netPayable)}` : ""}
                  {x.legacy ? " · (บันทึกก่อนระบบเก็บครบทุกช่อง)" : ""}
                  {x.note ? ` · ${x.note}` : ""}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              {ret.amendmentNeeded && (
                <ConfirmDialog
                  action={additionalAction}
                  fields={{ periodKey: period, excessChoice: L.excessChoice }}
                  reasonField={{ name: "note", label: "หมายเหตุ (ไม่บังคับ)", required: false }}
                  triggerLabel="ยื่นแบบเพิ่มเติม"
                  triggerClassName="btn btn-ghost text-sm"
                  title={`บันทึกแบบยื่นเพิ่มเติม ภ.พ.30 งวด ${period}?`}
                  detail="ระบบเก็บตัวเลขจากสมุดตอนนี้เป็นแบบยื่นเพิ่มเติม พร้อมผลต่างกับยอดที่ยื่นล่าสุด (ดูคอลัมน์ ต่างจากที่ยื่น)"
                  confirmLabel="บันทึก"
                  testId="pp30-additional"
                />
              )}
              <ConfirmDialog
                action={unmarkFiledAction}
                fields={{ periodKey: period }}
                triggerLabel="ยกเลิกเครื่องหมาย"
                triggerClassName="text-sm text-[color:var(--color-muted)] hover:underline"
                title="ยกเลิกเครื่องหมายยื่น ภ.พ.30?"
                detail="เช็กลิสต์ก่อนปิดงวดจะกลับไปเป็น “ยังไม่ได้ยื่น” (เดือนที่มีแบบเพิ่มเติมแล้วยกเลิกไม่ได้)"
                confirmLabel="ยืนยัน"
                danger
              />
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span data-testid="pp30-filed-state">ยังไม่ได้ทำเครื่องหมายยื่นสำหรับงวด {period}</span>
            <ConfirmDialog
              action={markFiledAction}
              fields={{ periodKey: period, excessChoice: L.excessChoice }}
              reasonField={{ name: "note", label: "หมายเหตุ (ไม่บังคับ)", required: false }}
              triggerLabel="ทำเครื่องหมายยื่นแล้ว"
              triggerClassName="btn btn-ghost text-sm"
              title={`ทำเครื่องหมายยื่น ภ.พ.30 งวด ${period}?`}
              detail={`ระบบจะเก็บทุกช่องของแบบจากสมุดตอนนี้เป็นยอดที่ยื่น (ภาษีสุทธิ ${L.netPayable > 0 ? `ต้องชำระ ${bahtTh(L.netPayable)}` : `ชำระเกิน ${bahtTh(L.netExcess)} — ${PP30_EXCESS_CHOICE_LABEL_TH[L.excessChoice]}`} บาท) และเช็กลิสต์ก่อนปิดงวดจะผ่านข้อนี้`}
              confirmLabel="ยืนยัน"
            />
          </div>
        )}
      </section>


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
