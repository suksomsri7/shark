import Link from "next/link";
import { agingReport, type AgingRow } from "@/lib/modules/account/reports";
import { MoneyText } from "@/components/ui/MoneyText";
import { loadReport, TableWrap } from "../reports/_shared";
import ReportToolbar from "../reports/ReportToolbar";

// รายงานอายุหนี้ (Aging) — สลับ ลูกหนี้ (AR/OUT) / เจ้าหนี้ (AP/IN) · ไทยล้วน
export default async function AgingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ direction?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;

  const direction: "OUT" | "IN" = sp.direction === "IN" ? "IN" : "OUT";
  const isAR = direction === "OUT";
  const rep = await agingReport({ tenantId, systemId }, { direction });

  const title = isAR ? "ลูกหนี้ค้างชำระ (AR)" : "เจ้าหนี้ค้างชำระ (AP)";
  const partyLabel = isAR ? "ลูกค้า" : "ผู้ขาย";

  const tab = (dir: "OUT" | "IN", label: string) => (
    <Link
      href={`${base}/aging?direction=${dir}`}
      className={`rounded-lg border px-3 py-1.5 text-sm ${
        direction === dir
          ? "bg-[color:var(--color-ink)] font-medium text-[color:var(--color-surface)]"
          : "text-[color:var(--color-muted)]"
      }`}
    >
      {label}
    </Link>
  );

  const cell = (satang: number) => (
    <td className="px-3 py-1.5 text-right">
      {satang > 0 ? <MoneyText satang={satang} decimals /> : <span className="text-[color:var(--color-muted)]">–</span>}
    </td>
  );

  // WO 6.2 (§11.3): อายุหนี้ใช้แถบเครื่องมือร่วมเหมือนรายงานอื่น — CSV มี BOM · พิมพ์/PDF ผ่าน print CSS
  const csv = {
    headers: [partyLabel, "ยังไม่ครบกำหนด", "1-30 วัน", "31-60 วัน", "61-90 วัน", "เกิน 90 วัน", "รวมค้าง"],
    rows: [
      ...rep.rows.map((r) => [
        r.contactName,
        (r.notDueSatang / 100).toFixed(2),
        (r.d1_30Satang / 100).toFixed(2),
        (r.d31_60Satang / 100).toFixed(2),
        (r.d61_90Satang / 100).toFixed(2),
        (r.d90plusSatang / 100).toFixed(2),
        (r.totalSatang / 100).toFixed(2),
      ]),
      [
        "รวมทั้งหมด",
        (rep.grand.notDueSatang / 100).toFixed(2),
        (rep.grand.d1_30Satang / 100).toFixed(2),
        (rep.grand.d31_60Satang / 100).toFixed(2),
        (rep.grand.d61_90Satang / 100).toFixed(2),
        (rep.grand.d90plusSatang / 100).toFixed(2),
        (rep.grand.totalSatang / 100).toFixed(2),
      ],
    ],
  };

  // คลิกชื่อคู่ค้า = ไปหน้าเอกสารค้างของรายนั้น (drill-down ของรายงานที่จัดกลุ่มตาม "คน" ไม่ใช่ "บัญชี")
  const bucketRow = (r: AgingRow) => (
    <tr key={r.contactId ?? "__none__"} className="border-b last:border-0" data-testid={`aging-row-${r.contactId ?? "none"}`}>
      <td className="px-3 py-1.5">
        {r.contactId ? (
          <Link href={`${base}/contacts/${r.contactId}`} className="text-[color:var(--color-accent)] hover:underline">
            {r.contactName}
          </Link>
        ) : (
          r.contactName
        )}
      </td>
      {cell(r.notDueSatang)}
      {cell(r.d1_30Satang)}
      {cell(r.d31_60Satang)}
      {cell(r.d61_90Satang)}
      {cell(r.d90plusSatang)}
      <td className="px-3 py-1.5 text-right font-medium">
        <MoneyText satang={r.totalSatang} decimals />
      </td>
    </tr>
  );

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div>
        <Link href={base} className="text-sm text-[color:var(--color-muted)]">
          ← บัญชี
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-[color:var(--color-muted)]">
          ยอดค้างชำระแยกตามช่วงเวลาเกินกำหนด (ณ วันนี้)
        </p>
      </div>

      <div className="flex gap-2 print:hidden">
        {tab("OUT", "ลูกหนี้ (AR)")}
        {tab("IN", "เจ้าหนี้ (AP)")}
      </div>

      {/* อายุหนี้คิด "ณ วันนี้" เสมอ (ไม่มีช่วงเวลาให้เลือก) และเทียบงวดก่อนไม่ได้ */}
      <ReportToolbar filename={`อายุหนี้-${isAR ? "ลูกหนี้" : "เจ้าหนี้"}`} csv={csv} mode="none" showCompare={false} />

      <TableWrap>
        <thead>
          <tr className="border-b bg-[color:var(--color-surface-2)] text-left">
            <th className="px-3 py-2 font-medium">{partyLabel}</th>
            <th className="px-3 py-2 text-right font-medium">ยังไม่ครบกำหนด</th>
            <th className="px-3 py-2 text-right font-medium">เกิน 1-30 วัน</th>
            <th className="px-3 py-2 text-right font-medium">31-60 วัน</th>
            <th className="px-3 py-2 text-right font-medium">61-90 วัน</th>
            <th className="px-3 py-2 text-right font-medium">เกิน 90 วัน</th>
            <th className="px-3 py-2 text-right font-medium">รวมค้าง</th>
          </tr>
        </thead>
        <tbody>
          {rep.rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-[color:var(--color-muted)]">
                ไม่มียอดค้างชำระ
              </td>
            </tr>
          ) : (
            rep.rows.map(bucketRow)
          )}
        </tbody>
        {rep.rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 font-bold">
              <td className="px-3 py-2">รวมทั้งหมด</td>
              {cell(rep.grand.notDueSatang)}
              {cell(rep.grand.d1_30Satang)}
              {cell(rep.grand.d31_60Satang)}
              {cell(rep.grand.d61_90Satang)}
              {cell(rep.grand.d90plusSatang)}
              <td className="px-3 py-2 text-right">
                <MoneyText satang={rep.grand.totalSatang} decimals />
              </td>
            </tr>
          </tfoot>
        )}
      </TableWrap>
    </div>
  );
}
