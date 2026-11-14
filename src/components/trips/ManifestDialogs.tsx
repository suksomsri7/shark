"use client";
// TRIPS T1.4 ▸ กล่องเปิดดูข้อมูลสุขภาพของรอบ (ใบสั่ง T1.4 §5.2): คำเตือน → เลือกวัตถุประสงค์ → ยืนยัน ⇒ รายการ (ชื่อ · แพ้ · โรค/ข้อควรระวัง)
//   🔴 ผลอยู่ใน state ของกล่องนี้เท่านั้น — ไม่ใส่ URL · ไม่เก็บในที่เก็บของเบราว์เซอร์ · ปิดกล่อง = ทิ้ง (คอมโพเนนต์ถูกถอดออก) · กล่องทั้งใบไม่ถูกพิมพ์
//   🔴 การเปิดดูทุกครั้งถูกบันทึกรายคนที่เซิร์ฟเวอร์ (revealManifestHealthAction) · ผิดพลาด = ข้อความในกล่อง สีอันตราย + role="alert" (ไม่แสดงข้อมูลบางส่วน)
import { useState } from "react";
import { useTranslations } from "next-intl";
import { MANIFEST_HEALTH_PURPOSES, type ManifestHealthPurpose } from "@/lib/modules/trips/manifest-core";
import { revealManifestHealthAction } from "@/lib/modules/trips/manifest-actions";
import { BTN, BTN_PRIMARY, Dialog, ErrorLine, Field, INPUT } from "./ProductsScreenParts";

type Revealed = Extract<Awaited<ReturnType<typeof revealManifestHealthAction>>, { ok: true }>["value"];

export function HealthDialog({ unitSlug, departureId, onClose }: { unitSlug: string; departureId: string; onClose: () => void }) {
  const t = useTranslations("trips");
  const [purpose, setPurpose] = useState<ManifestHealthPurpose>("SAFETY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Revealed | null>(null);
  const failText = (code: string | undefined) => (code === "FORBIDDEN" ? t("manifest.healthDialog.forbidden") : code === "BUSY" ? t("manifest.healthDialog.busy") : code === "NOT_FOUND" ? t("errors.NOT_FOUND") : t("manifest.healthDialog.failed"));
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await revealManifestHealthAction(unitSlug, { departureId, purpose });
      if (r.ok) setData(r.value);
      else setError(failText(r.code));
    } catch {
      setError(t("manifest.healthDialog.failed"));
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <div className="print:hidden">
      <Dialog title={t("manifest.healthDialog.title")} onClose={close} closeLabel={t("common.close")} busy={busy} wide>
        <div data-testid="trips-health-dialog" className="flex min-w-0 flex-col gap-3">
          <p data-testid="trips-health-warning" role="note" className="rounded-lg border-2 border-[color:var(--color-danger)] px-3 py-2 text-sm font-medium text-[color:var(--color-danger)] [overflow-wrap:anywhere]">
            <span aria-hidden="true">⚠ </span>
            {t("manifest.healthDialog.warning")}
          </p>
          {data === null ? (
            <>
              <Field label={t("manifest.healthDialog.purpose")}>
                <select data-testid="trips-health-purpose" className={INPUT} value={purpose} disabled={busy} onChange={(e) => setPurpose(MANIFEST_HEALTH_PURPOSES.find((p) => p === e.target.value) ?? "SAFETY")}>
                  {MANIFEST_HEALTH_PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {t(`manifest.purpose.${p}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <ErrorLine text={error} />
              <div className="flex min-w-0 flex-wrap gap-2">
                <button type="button" data-testid="trips-health-confirm" className={BTN_PRIMARY} disabled={busy} onClick={confirm}>
                  {busy ? t("manifest.actions.working") : t("manifest.healthDialog.confirm")}
                </button>
                <button type="button" className={BTN} disabled={busy} onClick={close}>
                  {t("common.cancel")}
                </button>
              </div>
            </>
          ) : (
            <>
              {data.items.length === 0 ? (
                <p data-testid="trips-health-empty" role="status" className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-3 text-sm text-[color:var(--color-ink-soft)]">
                  {t("manifest.healthDialog.empty")}
                </p>
              ) : (
                <>
                  <p role="status" className="text-sm text-[color:var(--color-ink-soft)]">
                    {t("manifest.healthDialog.opened", { n: data.count })}
                  </p>
                  {data.truncated ? (
                    <p role="alert" className="text-sm font-medium text-[color:var(--color-danger)]">
                      {t("manifest.healthDialog.truncated", { n: data.count })}
                    </p>
                  ) : null}
                  <ul data-testid="trips-health-list" className="flex min-w-0 flex-col gap-2">
                    {data.items.map((it) => (
                      <li key={it.passengerId} className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm text-[color:var(--color-ink)]">
                        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                          <b className="min-w-0 [overflow-wrap:anywhere]">{it.fullName ?? t("manifest.pax.noName")}</b>
                          <span className="whitespace-nowrap text-[color:var(--color-muted)]">{t("manifest.healthDialog.booking", { code: it.code })}</span>
                        </span>
                        <span className="[overflow-wrap:anywhere]">
                          {t("manifest.healthDialog.allergies")}: {it.allergies ?? t("manifest.healthDialog.none")}
                        </span>
                        <span className="[overflow-wrap:anywhere]">
                          {t("manifest.healthDialog.conditions")}: {it.conditions ?? t("manifest.healthDialog.none")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="flex min-w-0 flex-wrap gap-2">
                <button type="button" className={BTN_PRIMARY} onClick={close}>
                  {t("manifest.healthDialog.close")}
                </button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
