// ─────────────────────────────────────────────────────────────
// ParkedVatPanel — ภาษีขายที่ค้างพัก (ACC T1.2)
//   ParkedVatReleaseForm: ฟอร์มปล่อย VAT ที่พัก (ทีละใบ/เป็นชุด) — เลือกวันที่ (ไม่มีค่าเริ่ม) + ติ๊กยืนยันคำเตือน [U]
//   ParkedVatInvoicePanel: แผงบนหน้าใบแจ้งหนี้ที่ยังมี VAT พัก — ยอด · คำเตือนข้ามเดือน (LegalWarnings ตัวกลาง) · ฟอร์มปล่อย
// server component (ฟอร์มส่ง server action ตรง) · ไอคอน AccountIcon เท่านั้น ไม่มี emoji
// ─────────────────────────────────────────────────────────────
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import { releaseParkedVatAction } from "@/lib/modules/account/actions";
import MoneyText from "@/components/ui/MoneyText";
import { LegalWarnings } from "./LegalWarnings";

export function ParkedVatReleaseForm({
  systemId,
  ids,
  back,
  hasService,
  testId = "parked-release",
  submitLabel = "ออกใบกำกับเพื่อปล่อยภาษีขาย",
}: {
  systemId: string;
  /** ใบเดียว = ส่ง id ตรง · หลายใบ = ไม่ส่ง (ช่องติ๊กของแต่ละแถวอยู่ในตาราง ใช้ form="<testId>") */
  ids?: string[];
  back: string;
  hasService: boolean;
  testId?: string;
  submitLabel?: string;
}) {
  const w = legalWarning("TAX_INVOICE_LATE_DATE_CHOICE", { choice: "เลือกด้านล่าง" });
  return (
    <form action={releaseParkedVatAction} id={testId} className="flex flex-col gap-3" data-testid={testId}>
      <input type="hidden" name="systemId" value={systemId} />
      <input type="hidden" name="back" value={back} />
      {(ids ?? []).map((id) => (
        <input key={id} type="hidden" name="id" value={id} />
      ))}
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1 text-xs text-[color:var(--color-muted)]">วันที่ของใบกำกับ (ร้านต้องเลือก)</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="date" value="INVOICE_DATE" required data-testid={`${testId}-date-invoice`} />
          ลงวันที่ใบแจ้งหนี้ — ภาษีเข้าเดือนเดิม (ถ้ายื่น ภ.พ.30 เดือนนั้นแล้วอาจต้องยื่นเพิ่มเติม)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="date" value="TODAY" required data-testid={`${testId}-date-today`} />
          ลงวันที่วันนี้ — ภาษีเข้าเดือนนี้
        </label>
      </fieldset>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="goods" defaultChecked data-testid={`${testId}-goods`} />
          ภาษีของสินค้า
        </label>
        {hasService && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="services" data-testid={`${testId}-services`} />
            ภาษีของบริการ (ปกติออกเมื่อรับชำระ)
          </label>
        )}
      </div>
      <LegalWarnings warnings={[w]} ackName="ack" testId={`${testId}-warning`} compact />
      <div>
        <button type="submit" className="btn btn-primary btn-sm" data-testid={`${testId}-submit`}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

export function ParkedVatInvoicePanel({
  systemId,
  docId,
  back,
  goods,
  service,
  warning,
  hint,
  canRelease,
}: {
  systemId: string;
  docId: string;
  back: string;
  goods: number;
  service: number;
  warning: LegalWarning | null;
  hint: string;
  canRelease: boolean;
}) {
  return (
    <div className="card flex flex-col gap-3 p-4" data-testid="parked-vat-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">ภาษีขายที่ยังพัก (ยังไม่เข้า ภ.พ.30)</h3>
        <span className="flex gap-4 text-sm tabular-nums">
          <span data-testid="parked-vat-goods">
            สินค้า <MoneyText satang={goods} decimals />
          </span>
          <span data-testid="parked-vat-service">
            บริการ <MoneyText satang={service} decimals />
          </span>
        </span>
      </div>
      {hint && <p className="text-xs text-[color:var(--color-muted)]">{hint}</p>}
      {warning && <LegalWarnings warnings={[warning]} testId="parked-vat-warning" />}
      {canRelease && goods + service > 0 && <ParkedVatReleaseForm systemId={systemId} ids={[docId]} back={back} hasService={service > 0} />}
    </div>
  );
}

export default ParkedVatInvoicePanel;
