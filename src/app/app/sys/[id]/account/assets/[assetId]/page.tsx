import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assetDetail } from "@/lib/modules/account/asset-v2";
import { listFinanceAccounts } from "@/lib/modules/account/asset";
import { disposeAssetAction } from "../actions";
import { formatDateTh } from "@/lib/ui/date";
import MoneyText from "@/components/ui/MoneyText";
import StatusChip from "@/components/ui/StatusChip";
import FormField from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { DateInput } from "@/components/account-v2/DateInput";
import { ASSET_STATUS_LABEL } from "@/lib/modules/account/asset-v2";

// หน้าสินทรัพย์ 1 ตัว — DESIGN-SPEC-V2 §11.5
// 🔴 ของหลักของหน้านี้ = **ตารางค่าเสื่อมรายงวด** (AccountDepreciation มีข้อมูลมาตลอดแต่ไม่เคยแสดง)
//    ทุกงวดคลิกทะลุไปใบสำคัญที่ลงบัญชีให้ได้ (drill-down เดียวกับรายงาน)

const assetTone = (v: string): "muted" | "strong" | "danger" =>
  v === "ACTIVE" ? "strong" : v === "WRITTEN_OFF" ? "danger" : "muted";

export default async function AssetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; assetId: string }>;
  searchParams: Promise<{ dispose?: string; err?: string; ok?: string }>;
}) {
  const { id, assetId } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.asset.manage" });
  const ctx = { tenantId, systemId };
  const base = `/app/sys/${id}/account`;
  const path = `${base}/assets`;

  const a = await assetDetail(ctx, assetId);
  if (!a) notFound();
  const financeAccts = await listFinanceAccounts(ctx);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const canDispose = a.status === "ACTIVE" || a.status === "FULLY_DEPRECIATED";

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <Link href={path} className="text-sm text-[color:var(--color-muted)]">
          ← ทะเบียนสินทรัพย์
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold">
          <span className="font-mono text-lg text-[color:var(--color-muted)]">{a.code}</span> {a.name}
          <StatusChip value={a.status} map={ASSET_STATUS_LABEL} toneOf={assetTone} />
        </h1>
        {a.category && <p className="text-sm text-[color:var(--color-muted)]">หมวด {a.category}</p>}
      </div>

      {sp.err && <p className="text-sm text-[color:var(--color-danger)]">{sp.err}</p>}
      {sp.ok && <p className="text-sm font-medium">{sp.ok}</p>}

      {/* สรุปตัวเลข */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Box label="ต้นทุน" value={<MoneyText satang={a.cost} decimals />} />
        <Box label="ค่าเสื่อมสะสม" value={<MoneyText satang={a.accumDepreciation} decimals />} testId="asset-accum" />
        <Box label="มูลค่าสุทธิ" value={<MoneyText satang={a.netBookValue} decimals />} testId="asset-nbv" />
        <Box label="มูลค่าซาก" value={<MoneyText satang={a.salvageValue} decimals />} />
      </div>

      {/* ข้อมูลทะเบียน */}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border p-4 text-sm sm:grid-cols-2" style={{ borderColor: "var(--color-line)" }}>
        <Field k="วันที่ได้มา" v={formatDateTh(a.acquiredDate)} />
        <Field k="วันเริ่มคิดค่าเสื่อม" v={formatDateTh(a.startDepDate)} />
        <Field k="อายุการใช้งาน" v={`${a.usefulLifeMonths} เดือน (คิดแล้ว ${a.monthsDepreciated} งวด)`} />
        <Field k="ค่าเสื่อมงวดถัดไป" v={a.nextAmount > 0 ? <MoneyText satang={a.nextAmount} decimals /> : "— (ครบแล้ว/ยังไม่ถึงงวด)"} />
        <Field k="บัญชีสินทรัพย์" v={a.accounts.asset ? `${a.accounts.asset.code} ${a.accounts.asset.name}` : "—"} />
        <Field k="บัญชีค่าเสื่อมสะสม" v={a.accounts.accum ? `${a.accounts.accum.code} ${a.accounts.accum.name}` : "—"} />
        <Field k="บัญชีค่าใช้จ่ายค่าเสื่อม" v={a.accounts.expense ? `${a.accounts.expense.code} ${a.accounts.expense.name}` : "—"} />
        {a.disposedAt && (
          <Field
            k={a.disposalMethodLabel ?? "จำหน่าย"}
            v={`${formatDateTh(a.disposedAt)}${a.disposalAmount ? ` · ได้รับ ${(a.disposalAmount / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท` : ""}`}
          />
        )}
        {a.note && <Field k="หมายเหตุ" v={a.note} />}
      </dl>

      {/* 🔴 ตารางค่าเสื่อมรายงวด — ของที่ §11.5 บอกว่า "มีข้อมูลแล้วแต่ไม่เคยแสดง" */}
      <section>
        <h2 className="mb-2 font-semibold">ตารางค่าเสื่อมรายงวด</h2>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--color-line)" }} data-testid="dep-table">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                <th className="px-3 py-2 font-medium">งวด</th>
                <th className="px-3 py-2 text-right font-medium">ค่าเสื่อมงวดนี้</th>
                <th className="px-3 py-2 text-right font-medium">ค่าเสื่อมสะสม</th>
                <th className="px-3 py-2 text-right font-medium">มูลค่าสุทธิ</th>
                <th className="px-3 py-2 font-medium">ใบสำคัญ</th>
              </tr>
            </thead>
            <tbody>
              {a.rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0" style={{ borderColor: "var(--color-line)" }} data-testid={`dep-row-${r.periodKey}`}>
                  <td className="px-3 py-2">{r.periodKey}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <MoneyText satang={r.amount} decimals />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <MoneyText satang={r.accumAfter} decimals />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <MoneyText satang={r.netBookAfter} decimals />
                  </td>
                  <td className="px-3 py-2">
                    {r.entryId ? (
                      <Link href={`${base}/journal/${r.entryId}`} className="text-[color:var(--color-accent)] hover:underline">
                        {r.entryDocNo ?? "ดูใบสำคัญ"}
                      </Link>
                    ) : (
                      <span className="text-[color:var(--color-muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {a.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-[color:var(--color-muted)]">
                    ยังไม่เคยคิดค่าเสื่อมให้สินทรัพย์นี้
                  </td>
                </tr>
              )}
            </tbody>
            {a.rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 font-semibold" style={{ borderColor: "var(--color-line)" }}>
                  <td className="px-3 py-2">รวม {a.rows.length} งวด</td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="dep-total">
                    <MoneyText satang={a.accumDepreciation} decimals />
                  </td>
                  <td className="px-3 py-2" colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* ขาย / ตัดจำหน่าย */}
      {canDispose && (
        <section className="rounded-xl border p-4" style={{ borderColor: "var(--color-line)" }} data-testid="dispose-form">
          <h2 className="mb-1 font-semibold">ขาย / ตัดจำหน่าย</h2>
          <p className="mb-3 text-xs text-[color:var(--color-muted)]">
            ระบบจะลงบัญชีให้อัตโนมัติ: Dr เงินที่ได้รับ + Dr ค่าเสื่อมสะสม · Cr ต้นทุนสินทรัพย์ · ผลต่างเข้ากำไร/ขาดทุนจากการจำหน่าย
          </p>
          <form action={disposeAssetAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input type="hidden" name="systemId" value={systemId} />
            <input type="hidden" name="assetId" value={a.id} />
            <FormField label="วิธีจำหน่าย">
              <select name="mode" defaultValue="SELL" className="input" data-testid="dispose-mode">
                <option value="SELL">ขาย (มีเงินรับ)</option>
                <option value="WRITE_OFF">ตัดจำหน่าย (ไม่มีเงินรับ)</option>
              </select>
            </FormField>
            <FormField label="วันที่" required>
              {/* 🔴 ใช้ DateInput ไม่ใช่ <input type="date"> เปล่า — เบราว์เซอร์โชว์ "09/04/2026" ซึ่งไม่ตรงแบบไทย */}
              <DateInput name="date" defaultValue={today} required testId="dispose-date" />
            </FormField>
            <FormField label="เงินที่ได้รับ (บาท)" hint="สำหรับการขาย">
              <input name="proceeds" type="number" step="0.01" min="0" className="input" />
            </FormField>
            <FormField label="บัญชีเงินรับ" hint="สำหรับการขาย">
              <select name="financeAccountId" defaultValue="" className="input">
                <option value="">ไม่ระบุ</option>
                {financeAccts.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="หมายเหตุ">
                <input name="note" className="input" />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <SubmitButton variant="ghost" className="sm:justify-self-start">
                ยืนยันจำหน่าย
              </SubmitButton>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

function Box({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--color-line)" }}>
      <div className="text-xs text-[color:var(--color-muted)]">{label}</div>
      <div className="text-lg font-semibold" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b pb-1.5 last:border-0" style={{ borderColor: "var(--color-line)" }}>
      <dt className="text-[color:var(--color-muted)]">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
