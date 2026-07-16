import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { getSettings, DOC_LABEL, CONFIGURABLE_DOC_TYPES } from "@/lib/modules/account/service";
import { saveSettingsAction } from "@/lib/modules/account/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { LogoUploader } from "@/components/logo-uploader";
import { storageEnabled } from "@/lib/storage/service";

const inputCls = "rounded-lg border px-2 py-1.5 text-sm";
const labelCls = "flex flex-col gap-1 text-xs text-[color:var(--color-muted)]";

export default async function AccountSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id);
  const s = await getSettings(tenantId, systemId);
  const base = `/app/sys/${id}/account`;

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <Link href={base} className="text-sm text-[color:var(--color-muted)]">← ระบบบัญชี</Link>
        <h1 className="mt-1 text-2xl font-semibold">ตั้งค่าเอกสาร</h1>
      </div>

      {saved === "1" && <p className="text-sm text-[color:var(--color-ink)]">บันทึกแล้ว ✓</p>}

      <form action={saveSettingsAction} className="card grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input type="hidden" name="systemId" value={systemId} />
        <h2 className="text-sm font-medium sm:col-span-2">ข้อมูลกิจการ</h2>
        <label className={`${labelCls} sm:col-span-2`}>
          ชื่อกิจการ
          <input name="orgName" defaultValue={s.orgName} required className={inputCls} />
        </label>
        <label className={labelCls}>
          ชื่อ (อังกฤษ)
          <input name="orgNameEn" defaultValue={s.orgNameEn ?? ""} className={inputCls} />
        </label>
        <label className={labelCls}>
          เลขผู้เสียภาษี
          <input name="taxId" defaultValue={s.taxId ?? ""} className={inputCls} />
        </label>
        <label className={labelCls}>
          รหัสสาขา
          <input name="branchCode" defaultValue={s.branchCode ?? "00000"} className={inputCls} />
        </label>
        <label className={labelCls}>
          ชื่อสาขา
          <input name="branchName" defaultValue={s.branchName ?? ""} className={inputCls} />
        </label>
        <label className={`${labelCls} sm:col-span-2`}>
          ที่อยู่
          <textarea name="address" defaultValue={s.address ?? ""} rows={2} className={inputCls} />
        </label>
        <label className={labelCls}>
          เบอร์โทร
          <input name="phone" defaultValue={s.phone ?? ""} className={inputCls} />
        </label>
        <label className={labelCls}>
          อีเมล
          <input name="email" type="email" defaultValue={s.email ?? ""} className={inputCls} />
        </label>
        <label className={labelCls}>
          เว็บไซต์
          <input name="website" defaultValue={s.website ?? ""} className={inputCls} />
        </label>

        <h2 className="mt-2 text-sm font-medium sm:col-span-2">ภาษีและเอกสาร</h2>
        <label className={labelCls}>
          จดทะเบียน VAT
          <select name="vatRegistered" defaultValue={s.vatRegistered ? "1" : "0"} className={inputCls}>
            <option value="1">จดทะเบียน VAT</option>
            <option value="0">ไม่จด VAT</option>
          </select>
        </label>
        <label className={labelCls}>
          อัตรา VAT (basis point, 700 = 7%)
          <input name="vatRateBp" type="number" defaultValue={s.vatRateBp} className={inputCls} />
        </label>
        <label className={`${labelCls} sm:col-span-2`}>
          จุดรับรู้ภาษีเริ่มต้น (ประเภทกิจการ)
          <select name="taxPointBasis" defaultValue={s.taxPointBasis} className={inputCls}>
            <option value="ON_ISSUE">ขายสินค้า — ออกใบกำกับตอนแจ้งหนี้/ส่งมอบ</option>
            <option value="ON_PAYMENT">บริการ — ออกใบกำกับตอนรับเงิน</option>
          </select>
        </label>
        <label className={labelCls}>
          ครบกำหนดชำระ default (วัน)
          <input name="defaultDueDays" type="number" defaultValue={s.defaultDueDays} className={inputCls} />
        </label>
        <label className={labelCls}>
          ยืนราคา default (วัน)
          <input name="defaultValidDays" type="number" defaultValue={s.defaultValidDays} className={inputCls} />
        </label>
        <label className={`${labelCls} sm:col-span-2`}>
          หมายเหตุท้ายเอกสาร
          <textarea name="footerNote" defaultValue={s.footerNote ?? ""} rows={2} className={inputCls} />
        </label>

        <h2 className="mt-2 text-sm font-medium sm:col-span-2">โลโก้ / ตราประทับ / ลายเซ็น</h2>
        <p className="text-[11px] text-[color:var(--color-muted)] sm:col-span-2">
          {storageEnabled()
            ? "อัปโหลดโลโก้ได้ในตัว หรือวาง URL รูปเอง · ตราประทับ/ลายเซ็นยังใช้วาง URL · รูปจะแสดงบนใบกำกับภาษี/เอกสารพิมพ์"
            : "ยังไม่มีระบบอัปโหลดไฟล์ในตัว — วาง URL รูป (โฮสต์ไว้ที่อื่น) รูปจะแสดงบนใบกำกับภาษี/เอกสารพิมพ์"}
        </p>
        <LogoUploader defaultUrl={s.logoUrl ?? ""} enabled={storageEnabled()} />
        <label className={labelCls}>
          ตราประทับบริษัท (URL)
          <input name="stampUrl" defaultValue={s.stampUrl ?? ""} placeholder="https://…" className={inputCls} />
        </label>
        <label className={labelCls}>
          ลายเซ็นผู้มีอำนาจ (URL)
          <input name="signatureUrl" defaultValue={s.signatureUrl ?? ""} placeholder="https://…" className={inputCls} />
        </label>

        <h2 className="mt-2 text-sm font-medium sm:col-span-2">ตั้งค่ารายเอกสาร</h2>
        <p className="text-[11px] text-[color:var(--color-muted)] sm:col-span-2">
          คำนำหน้าเลขที่ (prefix) · ออกใบกำกับภาษีอัตโนมัติเมื่อออกใบเสร็จ · เปิดลิงก์/QR ให้ลูกค้าขอใบกำกับเอง
        </p>
        <div className="sm:col-span-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-[color:var(--color-muted)]">
                <th className="py-1 pr-2">เอกสาร</th>
                <th className="py-1 pr-2">prefix</th>
                <th className="py-1 pr-2 text-center">ออกใบกำกับอัตโนมัติ</th>
                <th className="py-1 text-center">ลิงก์สาธารณะ</th>
              </tr>
            </thead>
            <tbody>
              {CONFIGURABLE_DOC_TYPES.map((dt) => {
                const c = s.docTypes[dt] ?? {};
                return (
                  <tr key={dt} className="border-b">
                    <td className="py-1 pr-2">{DOC_LABEL[dt] ?? dt}</td>
                    <td className="py-1 pr-2">
                      <input name={`dt_${dt}_prefix`} defaultValue={c.prefix ?? ""} className={`${inputCls} w-20`} />
                    </td>
                    <td className="py-1 pr-2 text-center">
                      {(dt === "RECEIPT" || dt === "INVOICE") ? (
                        <input type="checkbox" name={`dt_${dt}_auto`} defaultChecked={c.autoTaxInvoice} />
                      ) : (
                        <span className="text-[color:var(--color-muted)]">—</span>
                      )}
                    </td>
                    <td className="py-1 text-center">
                      {(dt === "RECEIPT" || dt === "TAX_INVOICE") ? (
                        <input type="checkbox" name={`dt_${dt}_public`} defaultChecked={c.publicLink} />
                      ) : (
                        <span className="text-[color:var(--color-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <SubmitButton className="sm:col-span-2 sm:justify-self-start">บันทึกการตั้งค่า</SubmitButton>
      </form>
    </div>
  );
}
