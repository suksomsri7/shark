// ComplianceValuesSection — ค่ากฎหมายอื่น (ระยะเก็บเอกสาร · เงินประกันหอ) + วิธีลงทิป · ACC T4.5 · T4.7 · T4.8 (server component)
//   ค่าที่มีผล = แถวร้าน (ถ้ามี) ไม่งั้นแถวระบบ · ที่มาที่ผู้ใช้เห็น = มาตราภาษาไทยล้วน (publicCitationTh) · ค่าต่างจากค่าเริ่มต้นทางการ = คำเตือน ไม่บล็อก
import { LegalWarnings } from "./LegalWarnings";
import { publicCitationTh, publicNoteTh } from "@/lib/core/settings/legal/warnings";
import { saveComplianceValueAction, saveTipTreatmentAction } from "@/lib/modules/account/compliance-actions";
import { TIP_TREATMENTS, TIP_TREATMENT_LABEL_TH, type TipTreatment } from "@/lib/core/settings/defs/account";
import type { complianceViewFrom } from "@/lib/modules/account/legal-values";
import type { LegalWarning } from "@/lib/core/settings/legal/warnings";

type View = ReturnType<typeof complianceViewFrom>;

export function ComplianceValuesSection({ systemId, view, tip, tipWarning, msg, err }: { systemId: string; view: View; tip: TipTreatment; tipWarning: LegalWarning; msg?: string; err?: string }) {
  return (
    <section id="compliance" className="card flex flex-col gap-3" data-testid="compliance-values">
      <h2 className="text-base font-semibold">ค่ากฎหมายอื่น</h2>
      <p className="text-xs text-[color:var(--color-muted)]">ระยะเก็บบัญชีและเอกสาร และเงื่อนไขเงินประกันหอพัก — ร้านตั้งค่าของตัวเองได้ (เช่น ตามคำแนะนำของนักบัญชี) ระบบจะเตือนเมื่อต่างจากค่าเริ่มต้น</p>
      {msg ? <p className="text-sm text-[color:var(--color-success,inherit)]" data-testid="compliance-msg">{msg}</p> : null}
      {err ? <p className="text-sm text-[color:var(--color-danger)]" data-testid="compliance-err">{err}</p> : null}
      <ul className="flex flex-col gap-3">
        {view.effective.map((r) => (
          <li key={r.key} className="rounded-xl border border-[color:var(--color-line)] p-3" data-testid={`compliance-row-${r.key}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{r.label}</span>
              <span className="tabular-nums" data-testid={`compliance-value-${r.key}`}>
                {r.value ?? "—"} {r.unit} <span className="text-xs text-[color:var(--color-muted)]">{r.origin === "SHOP" ? "(ค่าของร้าน)" : "(ค่าเริ่มต้นของระบบ)"}</span>
              </span>
            </div>
            <div className="text-xs text-[color:var(--color-muted)]">
              {publicCitationTh(r.source) || (r.origin === "SHOP" ? r.source : "")}
              {r.tag === "S" || r.tag === "U" ? " · ค่าเริ่มต้นของระบบ — โปรดตรวจกับนักบัญชีของร้าน" : ""}
              {r.note ? ` · ${publicNoteTh(r.note)}` : ""}
            </div>
            {r.warnings.length > 0 && (
              <div className="mt-2">
                <LegalWarnings warnings={r.warnings} compact testId={`compliance-warn-${r.key}`} />
              </div>
            )}
            <form action={saveComplianceValueAction} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="systemId" value={systemId} />
              <input type="hidden" name="key" value={r.key} />
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                ค่าของร้าน ({r.unit})
                <input name="value" inputMode="numeric" defaultValue={r.origin === "SHOP" ? String(r.value ?? "") : ""} placeholder="ว่าง = ค่าเริ่มต้น" className="input h-9 w-28" data-testid={`compliance-input-${r.key}`} />
              </label>
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                ที่มา (เช่น คำแนะนำของนักบัญชี)
                <input name="source" maxLength={500} defaultValue={r.origin === "SHOP" ? r.source : ""} className="input h-9" />
              </label>
              <button type="submit" className="btn btn-ghost btn-sm h-9" data-testid={`compliance-save-${r.key}`}>
                บันทึก
              </button>
            </form>
          </li>
        ))}
      </ul>
      <h3 className="mt-2 text-sm font-semibold">ทิปที่รับผ่านจุดขาย</h3>
      <form action={saveTipTreatmentAction} className="flex flex-wrap items-end gap-2" data-testid="tip-treatment-form">
        <input type="hidden" name="systemId" value={systemId} />
        <input type="hidden" name="back" value={`/app/sys/${systemId}/account/settings/tax`} />
        <select name="tipTreatment" defaultValue={tip} className="input h-9 w-auto max-w-full" data-testid="tip-treatment-select">
          {TIP_TREATMENTS.map((t) => (
            <option key={t} value={t}>
              {TIP_TREATMENT_LABEL_TH[t]}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-ghost btn-sm h-9" data-testid="tip-treatment-save">
          บันทึก
        </button>
      </form>
      <LegalWarnings warnings={[tipWarning]} compact collapsible testId="tip-treatment-warning" />
    </section>
  );
}
