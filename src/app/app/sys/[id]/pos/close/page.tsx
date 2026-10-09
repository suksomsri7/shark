import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { getLocale, getTranslations } from "next-intl/server";
import { closeDaySummary, closeDayBills, posBusinessToday } from "@/lib/modules/pos/service";
import { posTabs } from "@/lib/modules/pos/tabs";
import { posMembership, posSalesScope, posScopeUnitIds } from "@/lib/modules/pos/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { MoneyText } from "@/components/ui/MoneyText";
import { ModuleTabs } from "@/components/module-tabs";
import { CloseDayTools } from "./CloseDayTools";
import { CloseDateField } from "./CloseDateField";

const fmtTime = (d: Date) =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(d);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// หน้า "ปิดวัน" — สรุปยอดสิ้นวันของระบบ POS (read-only) + export CSV + กระทบยอดเงินสด
// POS P1.18U ▸ มติ 9: ข้อความทั้งหมดผ่าน t (pos.report.closeDay.*) · ชื่อวิธีจ่ายแปลจากชนิด (methodTypes) · วันที่แสดงตามภาษาจอ (ช่องวันที่ซ้อนป้าย) ·
//   มติ 10c: "วันนี้" = วันธุรกิจตามเวลาตัดวันของระบบ (posBusinessToday · deviation 9 ของ P1.18 S) ◂
export default async function PosCloseDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { id } = await params;
  const { date: dateParam } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  // HF-POS-PAGES: เดิม assertCan ไม่ส่ง unit ⇒ คนสาขา A เห็นยอด/เงินสด/บิลของสาขา B — ตอนนี้กรองเฉพาะสาขาที่เข้าได้
  const scope = posSalesScope(posMembership(auth.active));
  if (!scope) notFound();
  const unitIds = posScopeUnitIds(scope);
  const def = systemDef(sys.type);

  const t = await getTranslations("pos.report.closeDay");
  const tPos = await getTranslations("pos");
  const locale = (await getLocale()).startsWith("en") ? "en-GB" : "th-TH";
  const methodText = (types: string[] | undefined, fallback: string) => (types && types.length ? types.map((x) => (t.has(`method.${x}`) ? t(`method.${x}`) : x)).join(" + ") : fallback);
  const dateText = (d: string) => new Intl.DateTimeFormat(locale, { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${d}T12:00:00+07:00`));
  const today = await posBusinessToday({ tenantId, systemId: id, unitIds });
  const businessDate = dateParam && isDate(dateParam) ? dateParam : today;
  const [summary, bills] = await Promise.all([
    closeDaySummary({ tenantId, systemId: id, unitIds }, businessDate),
    closeDayBills({ tenantId, systemId: id, unitIds }, businessDate),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("desc")} />
      <ModuleTabs
        items={posTabs(id, tPos)}
      />

      {/* เลือกวัน */}
      <form method="get" className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-[color:var(--color-muted)]">{t("pickDate")}</span>
          <CloseDateField value={businessDate} max={today} label={t("pickDate")} />
        </label>
        <button type="submit" className="btn btn-ghost min-h-[44px] text-sm">
          {t("view")}
        </button>
      </form>

      {/* การ์ดยอด */}
      <Section title={businessDate === today ? t("summaryTitleToday", { date: dateText(businessDate) }) : t("summaryTitle", { date: dateText(businessDate) })}>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border p-3">
            <div className="text-xs text-[color:var(--color-muted)]">{t("netSales")}</div>
            <div className="text-lg font-semibold">
              <MoneyText satang={summary.netSalesSatang} decimals />
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-[color:var(--color-muted)]">{t("billCount")}</div>
            <div className="text-lg font-semibold tabular-nums">{summary.billCount}</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-[color:var(--color-muted)]">{t("voidCount")}</div>
            <div className="text-lg font-semibold tabular-nums">{summary.voidCount}</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-[color:var(--color-muted)]">{t("voidTotal")}</div>
            <div className="text-lg font-semibold">
              <MoneyText satang={summary.voidTotalSatang} decimals />
            </div>
          </div>
        </div>
      </Section>

      {/* แยกตามชนิดรายการ — ธุรกิจที่มีทั้งสินค้าและบริการต้องรู้ว่ารายได้มาจากทางไหน
          ซ่อนทั้งบล็อกถ้ายังไม่มียอด (ร้านที่ขายอย่างเดียวไม่ต้องเห็นตัวเลข 0 สามช่อง) */}
      {summary.productSalesSatang + summary.serviceSalesSatang + summary.otherSalesSatang > 0 && (
        <Section title={t("byKindTitle")}>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: t("kind.product"), value: summary.productSalesSatang },
              { label: t("kind.service"), value: summary.serviceSalesSatang },
              { label: t("kind.other"), value: summary.otherSalesSatang },
            ].map((r) => (
              <div key={r.label} className="rounded-xl border p-3">
                <div className="text-xs text-[color:var(--color-muted)]">{r.label}</div>
                <div className="text-base font-semibold">
                  <MoneyText satang={r.value} decimals />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-[color:var(--color-muted)]">
            {t("byKindNote")}
          </p>
        </Section>
      )}

      {/* แยกตามวิธีจ่าย */}
      <Section title={t("byMethodTitle")}>
        {summary.byMethod.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">{t("noSales")}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[color:var(--color-surface-2)] text-left text-xs text-[color:var(--color-muted)]">
                  <th className="px-3 py-2 font-medium">{t("colMethod")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("colCount")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("colAmount")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.byMethod.map((m) => (
                  <tr key={m.type} className="border-b last:border-0">
                    <td className="px-3 py-2">{methodText([m.type], m.label)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.count}</td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText satang={m.amountSatang} decimals />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* กระทบยอดเงินสด + ดาวน์โหลด CSV */}
      <Section title={t("cashTitle")}>
        <CloseDayTools systemId={id} businessDate={businessDate} cashInDrawerSatang={summary.cashInDrawerSatang} />
      </Section>

      {/* รายการบิลของวัน */}
      <Section title={t("billsTitle", { count: bills.length })}>
        {bills.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">{t("noBills")}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[color:var(--color-surface-2)] text-left text-xs text-[color:var(--color-muted)]">
                  <th className="px-3 py-2 font-medium">{t("colReceipt")}</th>
                  <th className="px-3 py-2 font-medium">{t("colTime")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("colAmount")}</th>
                  <th className="px-3 py-2 font-medium">{t("colMethod")}</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b, i) => (
                  <tr key={`${b.receiptNo ?? "x"}-${i}`} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      {b.receiptNo ?? "—"}
                      {b.status === "VOIDED" && (
                        <span className="ml-1 text-xs text-[color:var(--color-danger)]">{t("voided")}</span>
                      )}
                      {/* POS P1.8 ▸ ใบคืนเงิน = เงินออก (ติดลบ) ◂ */}
                      {b.docType === "REFUND" && <span className="ml-1 text-xs text-[color:var(--color-danger)]">{t("refund")}</span>}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{fmtTime(b.createdAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText satang={b.docType === "REFUND" ? -b.grandTotalSatang : b.grandTotalSatang} decimals />
                    </td>
                    <td className="px-3 py-2">{methodText(b.methodTypes, b.methodLabel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
