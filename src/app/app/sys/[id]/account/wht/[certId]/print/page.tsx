import { notFound } from "next/navigation";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { getSettings, baht } from "@/lib/modules/account/service";
import { getWhtCert, WHT_INCOME_LABEL } from "@/lib/modules/account/wht";

const fmtDate = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

// หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) — ฟอร์มราชการ B&W A4 · พิมพ์ด้วย Ctrl+P
export default async function WhtCertPrintPage({ params }: { params: Promise<{ id: string; certId: string }> }) {
  const { id, certId } = await params;
  const { tenantId, systemId } = await loadAccountSystem(id);
  const [cert, s] = await Promise.all([
    getWhtCert(tenantId, systemId, certId),
    getSettings(tenantId, systemId),
  ]);
  if (!cert) notFound();

  const snap = (cert.contactSnapshot as Record<string, unknown> | null) ?? null;
  const payeeName = (snap?.name as string) ?? cert.contact?.name ?? "";
  const payeeTax = (snap?.taxId as string) ?? cert.contact?.taxId ?? "";
  const payeeAddr = (snap?.address as string) ?? cert.contact?.address ?? "";
  const incomeLabel = cert.whtIncomeType ? WHT_INCOME_LABEL[cert.whtIncomeType] : "—";

  const Cell = ({ label, value }: { label: string; value: string }) => (
    <div className="flex gap-2">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-sm text-black">
      <div className="text-center">
        <div className="text-base font-bold">หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
        <div className="text-xs">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
        <div className="mt-1 text-xs">เลขที่ {cert.docNo ?? "—"}</div>
      </div>

      {/* ผู้มีหน้าที่หักภาษี ณ ที่จ่าย (ผู้จ่าย = กิจการ) */}
      <div className="mt-5 border-t pt-3">
        <div className="mb-1 text-xs font-semibold">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย (ผู้จ่ายเงิน)</div>
        <Cell label="ชื่อ" value={s.orgName || "กิจการของคุณ"} />
        <Cell label="เลขประจำตัวผู้เสียภาษี" value={s.taxId ?? ""} />
        {s.address && <Cell label="ที่อยู่" value={s.address} />}
      </div>

      {/* ผู้ถูกหักภาษี ณ ที่จ่าย (ผู้รับ = vendor) */}
      <div className="mt-3 border-t pt-3">
        <div className="mb-1 text-xs font-semibold">ผู้ถูกหักภาษี ณ ที่จ่าย (ผู้รับเงิน)</div>
        <Cell label="ชื่อ" value={payeeName} />
        <Cell label="เลขประจำตัวผู้เสียภาษี" value={payeeTax} />
        {payeeAddr && <Cell label="ที่อยู่" value={payeeAddr} />}
      </div>

      {/* รายการเงินได้ */}
      <table className="mt-4 w-full border-collapse text-xs">
        <thead>
          <tr className="border-y">
            <th className="py-1.5 text-left">ประเภทเงินได้พึงประเมินที่จ่าย</th>
            <th className="py-1.5 text-right">วันเดือนปีที่จ่าย</th>
            <th className="py-1.5 text-right">จำนวนเงินที่จ่าย</th>
            <th className="py-1.5 text-right">ภาษีที่หักและนำส่ง</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2">
              {incomeLabel}
              {cert.whtRateBp != null && ` (หัก ${(cert.whtRateBp / 100).toFixed(cert.whtRateBp % 100 ? 2 : 0)}%)`}
            </td>
            <td className="py-2 text-right">{fmtDate(cert.issueDate)}</td>
            <td className="py-2 text-right">{baht(cert.subTotal)}</td>
            <td className="py-2 text-right">{baht(cert.whtAmount)}</td>
          </tr>
          <tr className="border-b font-semibold">
            <td className="py-2" colSpan={2}>รวม</td>
            <td className="py-2 text-right">{baht(cert.subTotal)}</td>
            <td className="py-2 text-right">{baht(cert.whtAmount)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 text-xs">
        รวมเงินภาษีที่หักนำส่ง (ตัวอักษร): <span className="font-medium">{baht(cert.whtAmount)} บาท</span>
      </div>

      <div className="mt-6 flex justify-between text-xs">
        <div>
          <div>ผู้จ่ายเงิน (☑) หัก ณ ที่จ่าย</div>
        </div>
        <div className="text-center">
          <div className="mt-8 border-t border-neutral-400 px-8 pt-1">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</div>
          <div>วันที่ {fmtDate(cert.issueDate)}</div>
        </div>
      </div>

      <div className="mt-6 text-center text-[10px] text-neutral-400 print:hidden">
        กด Ctrl+P เพื่อพิมพ์ / บันทึกเป็น PDF
      </div>
    </div>
  );
}
