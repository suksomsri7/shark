// HR H2.12 ▸ F1 + F5 (server components) — ส่วน "เพิ่มประเภทลาตามกฎหมาย" ใต้ฟอร์มประเภทการลา + บรรทัดคำเตือนใต้แต่ละประเภท ·
//   รายการพับไว้ (ไม่สร้างอะไรจนกว่าผู้ตั้งค่าจะกดเพิ่มทีละรายการ) · ทุกช่องแก้ได้ก่อนเพิ่ม · มีแล้ว = แสดงชื่อที่ตรง ไม่มีปุ่ม ·
//   ยังไม่รองรับ (ลาเลี้ยงดูบุตร 50%) = แสดงแบบปิด + หมายเหตุ · คำเตือนไม่บล็อก · ปุ่ม ≥ 44 px · tokens ล้วน ◂
import { getTranslations } from "next-intl/server";
import { leavePolicyWarnings, leavePresetRows, presetShowsRef, type LeaveWarning, type PolicyLike } from "./leave-presets";

type FormFn = (fd: FormData) => Promise<void>;
const btn = "btn btn-primary min-h-[44px] text-sm";
const muted = "text-[color:var(--color-muted)]";
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export async function LeavePresetSection({ systemId, policies, onAdd, canAdd }: { systemId: string; policies: readonly PolicyLike[]; onAdd: FormFn; canAdd: boolean }) {
  const t = await getTranslations("hr.settings.lawPresets");
  const tp = await getTranslations("hr.settings.policies");
  const rows = leavePresetRows(policies);
  return (
    <details data-testid="hr-settings-law-presets" className="rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
      <summary data-testid="hr-settings-law-presets-open" className="flex min-h-[44px] cursor-pointer list-none items-center px-4 text-sm font-medium">
        {t("open")}
      </summary>
      <div className="flex flex-col gap-3 border-t border-[color:var(--color-line)] p-4">
        <p className={`text-xs ${muted}`}>{t("desc")}</p>
        <ul className="flex flex-col gap-3">
          {rows.map((r) => {
            const name = t(`k.${r.key}`);
            const values = t("values", {
              quota: r.quotaDays === null ? t("noQuota") : t("quotaN", { n: fmt(r.quotaDays) }),
              paid: r.paid ? tp("paid") : tp("unpaid"),
              service: r.minServiceDays > 0 ? t("serviceN", { n: r.minServiceDays }) : "",
              attach: r.attachmentAfterDays ? t("attachN", { n: r.attachmentAfterDays }) : "",
            });
            return (
              <li key={r.key} data-testid={`hr-settings-law-preset-${r.key}`} className="flex flex-col gap-2 rounded-xl border border-[color:var(--color-line)] p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <b className="text-sm">{name}</b>
                  <span className={`text-xs ${muted}`}>{values}</span>
                </div>
                <p className={`text-xs ${muted}`}>{presetShowsRef(r) ? t("ref", { ref: r.ref ?? "" }) : t("neutral")}</p>
                {r.perEvent && <p className={`text-xs ${muted}`}>{t("perEvent")}</p>}
                {!r.supported ? (
                  <>
                    <button type="button" disabled aria-disabled="true" className={`${btn} self-start opacity-50`} data-testid={`hr-settings-law-preset-off-${r.key}`}>
                      {t("unsupported")}
                    </button>
                    <p className={`text-xs ${muted}`}>{t("unsupportedNote")}</p>
                  </>
                ) : r.existing ? (
                  <p className="text-sm" data-testid={`hr-settings-law-preset-has-${r.key}`}>
                    {t("exists", { name: r.existing.name })}
                  </p>
                ) : canAdd ? (
                  <form action={onAdd} className="flex flex-wrap items-end gap-2" data-testid={`hr-settings-law-preset-form-${r.key}`}>
                    <input type="hidden" name="systemId" value={systemId} />
                    <input type="hidden" name="preset" value={r.key} />
                    <label className="flex flex-col gap-1 text-xs">
                      {tp("name")}
                      <input name="name" required maxLength={60} defaultValue={name} className="input min-h-[44px]" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      {tp("quotaDays")}
                      <input name="quotaDays" type="number" min={0} max={365} step={0.5} defaultValue={r.quotaDays ?? ""} placeholder={tp("noQuota")} className="input min-h-[44px] w-24" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      {tp("paid")}
                      <select name="paid" defaultValue={r.paid ? "true" : "false"} className="input min-h-[44px]">
                        <option value="true">{tp("paid")}</option>
                        <option value="false">{tp("unpaid")}</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      {tp("minServiceDays")}
                      <input name="minServiceDays" type="number" min={0} max={3650} defaultValue={r.minServiceDays} className="input min-h-[44px] w-24" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      {tp("attachmentAfterDays")}
                      <input name="attachmentAfterDays" type="number" min={1} max={365} defaultValue={r.attachmentAfterDays ?? ""} className="input min-h-[44px] w-24" />
                    </label>
                    <button type="submit" className={btn} data-testid={`hr-settings-law-preset-add-${r.key}`}>
                      {t("add")}
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}

/** F5 — คำเตือนใต้ประเภทการลาที่ตั้งต่ำกว่าค่าตามกฎหมาย (ไม่บล็อก · บันทึกไปแล้ว) */
export async function LeavePolicyWarningLines({ policies, id }: { policies: readonly PolicyLike[]; id: string }) {
  const ws = leavePolicyWarnings(policies).get(id) ?? [];
  if (!ws.length) return null;
  const t = await getTranslations("hr.settings.lawWarn");
  const tk = await getTranslations("hr.settings.lawPresets.k");
  const line = (w: LeaveWarning) => {
    const kind = tk(w.kind);
    if (w.code === "fewerV") return t("fewerV", { kind, law: fmt(w.law), set: fmt(w.set), ref: w.ref });
    if (w.code === "unpaidV") return t("unpaidV", { kind, ref: w.ref });
    if (w.code === "fewerN") return t("fewerN", { kind, law: fmt(w.law), set: fmt(w.set) });
    if (w.code === "unpaidN") return t("unpaidN", { kind });
    if (w.code === "serviceN") return t("serviceN", { kind, law: fmt(w.law), set: fmt(w.set) });
    if (w.code === "maternityTotal") return t("maternityTotal", { law: fmt(w.law), set: fmt(w.set), ref: w.ref });
    return t("maternityPaidDays", { law: fmt(w.law), set: fmt(w.set), ref: w.ref });
  };
  return (
    <ul data-testid={`hr-settings-policy-warn-${id}`} role="note" className="flex w-full flex-col gap-0.5">
      {ws.map((w, i) => (
        <li key={i} className="text-xs text-[color:var(--color-danger)]">
          ⚠ {line(w)}
        </li>
      ))}
    </ul>
  );
}
// ◂ HR H2.12
