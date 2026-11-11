"use client";

// AiBriefSheet.tsx — POS P3.9U แผ่น "ตั้งค่าสรุปเช้า" ของการ์ดผู้ช่วย AI (ภาพ 10 · มติ 4 · CD-P39U-3)
//   ช่อง: ส่งสรุปเช้า (brief.enabled) · เวลา 0–23 น. เวลาไทย (brief.hourBkk · ค่าปริยาย 6) · ส่งทางอีเมล (brief.email) · จุดผิดปกติในสรุป (anomalyInBrief) ·
//     ผู้จัดการที่รับ (brief.managerUserIds ≤ 50 · ตัวเลือก = ผู้จัดการที่รับคำเชิญแล้ว จากหน้า server)
//   บันทึก = ส่งเฉพาะคีย์ที่เปลี่ยน → updatePosAiSettingsAction · ปฏิเสธ = ข้อความใต้ช่องตาม field (managerUserIds = settings.ai.invalidManager)
// 🔴 เจ้าของร้านเท่านั้นที่เปิดแผ่นนี้ได้ (การ์ดซ่อนปุ่มสำหรับคนอื่น · ตัวเขียนตรวจซ้ำ) · ไม่มีข้อความไทยนอก t() · ปุ่ม ≥ 44px

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { updatePosAiSettingsAction } from "@/lib/modules/pos/ai-settings-actions";
import { POS_AI_MANAGERS_MAX, settingsRefusalMessageKey, type PosAiSettings } from "@/lib/modules/pos/settings-shared";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { MiniKnob } from "./shark-ui";

export type AiManagerOption = { userId: string; name: string };
type Patch = { anomalyInBrief?: boolean; brief?: Partial<PosAiSettings["brief"]> };

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const pad2 = (n: number) => String(n).padStart(2, "0");
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** แถวสวิตช์ของแผ่น (ปุ่มเขียนตรงที่จุดใช้ — testid ตรงตัวให้ด่าน F15.3 อ่านได้) */
const ROW = "flex min-h-11 items-center gap-3 border-t py-1 text-[14px] first:border-t-0";
const ROW_SWITCH = "grid min-h-11 min-w-11 shrink-0 place-items-center disabled:opacity-50";

export function AiBriefSettings({ systemId, initial, managers, onClose, onSaved }: { systemId: string; initial: PosAiSettings; managers: AiManagerOption[]; onClose: () => void; onSaved: (ai: PosAiSettings) => void }) {
  const t = useTranslations("pos.settings");
  const candidateIds = useMemo(() => managers.map((m) => m.userId), [managers]);
  // ค่าที่บันทึกไว้แต่ไม่ใช่ผู้จัดการแล้ว = ไม่แสดง/ไม่ส่ง (ไม่เปลี่ยนรายชื่อ = ไม่ส่งคีย์นี้ — ค่าเดิมคงอยู่)
  const savedPicked = useMemo(() => initial.brief.managerUserIds.filter((id) => candidateIds.includes(id)), [initial, candidateIds]);
  const [briefOn, setBriefOn] = useState(initial.brief.enabled);
  const [hour, setHour] = useState(initial.brief.hourBkk);
  const [email, setEmail] = useState(initial.brief.email);
  const [anomaly, setAnomaly] = useState(initial.anomalyInBrief);
  const [picked, setPicked] = useState<string[]>(savedPicked);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field: string | null; key: string } | null>(null);

  const patch = (): Patch => {
    const brief: Partial<PosAiSettings["brief"]> = {};
    if (briefOn !== initial.brief.enabled) brief.enabled = briefOn;
    if (hour !== initial.brief.hourBkk) brief.hourBkk = hour;
    if (email !== initial.brief.email) brief.email = email;
    if (!sameSet(picked, savedPicked)) brief.managerUserIds = picked;
    return { ...(anomaly !== initial.anomalyInBrief ? { anomalyInBrief: anomaly } : {}), ...(Object.keys(brief).length ? { brief } : {}) };
  };
  const save = async () => {
    if (busy) return;
    const p = patch();
    if (!Object.keys(p).length) return onClose();
    setBusy(true);
    setErr(null);
    try {
      const r = await updatePosAiSettingsAction(systemId, p);
      if (r.ok) return onSaved(r.ai);
      const field = "field" in r && typeof r.field === "string" ? r.field : null;
      setErr({ field, key: field === "brief.managerUserIds" ? "ai.invalidManager" : field ? "ai.invalidField" : r.code === "PERMISSION_DENIED" ? "ai.ownerOnly" : settingsRefusalMessageKey(r.code) });
    } catch {
      setErr({ field: null, key: "ai.saveFailed" });
    } finally {
      setBusy(false);
    }
  };
  const fieldErr = (f: string) =>
    err?.field === f ? (
      <p data-testid="pos-settings-ai-error" role="alert" className="text-[12.5px] text-[color:var(--color-danger)]">
        {t(err.key)}
      </p>
    ) : null;
  const full = picked.length >= POS_AI_MANAGERS_MAX;

  return (
    <RegisterDialog onDismiss={() => !busy && onClose()} locked={busy}>
      <div data-testid="pos-settings-ai-sheet" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("ai.sheetOpen")}>
        <SheetGrab />
        <h2 className="text-[20px] font-bold">{t("ai.sheetOpen")}</h2>
        <p className="text-[13.5px] leading-[1.6] text-[color:var(--color-ink-soft)]">{t("ai.desc")}</p>
        <div className="flex flex-col">
          <div className={ROW}>
            <span className="min-w-0 flex-1">{t("ai.briefEnabled")}</span>
            <button data-testid="pos-settings-ai-brief-enabled" type="button" role="switch" aria-checked={briefOn} aria-label={t("ai.briefEnabled")} disabled={busy} className={ROW_SWITCH} onClick={() => setBriefOn(!briefOn)}>
              <MiniKnob on={briefOn} />
            </button>
          </div>
          <label className="flex min-h-11 items-center gap-3 border-t py-1 text-[14px]">
            <span className="min-w-0 flex-1">{t("ai.briefHour")}</span>
            <select data-testid="pos-settings-ai-hour" className="min-h-11 rounded-[10px] border bg-[color:var(--color-surface)] px-3 text-[14px]" value={hour} disabled={busy} onChange={(e) => setHour(Number(e.target.value))}>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {t("ai.hourValue", { hour: pad2(h) })}
                </option>
              ))}
            </select>
          </label>
          {fieldErr("brief.hourBkk")}
          <div className={ROW}>
            <span className="min-w-0 flex-1">{t("ai.briefEmail")}</span>
            <button data-testid="pos-settings-ai-email" type="button" role="switch" aria-checked={email} aria-label={t("ai.briefEmail")} disabled={busy} className={ROW_SWITCH} onClick={() => setEmail(!email)}>
              <MiniKnob on={email} />
            </button>
          </div>
          {fieldErr("brief.email")}
          <div className={ROW}>
            <span className="min-w-0 flex-1">{t("ai.anomalyInBrief")}</span>
            <button data-testid="pos-settings-ai-anomaly" type="button" role="switch" aria-checked={anomaly} aria-label={t("ai.anomalyInBrief")} disabled={busy} className={ROW_SWITCH} onClick={() => setAnomaly(!anomaly)}>
              <MiniKnob on={anomaly} />
            </button>
          </div>
          {fieldErr("anomalyInBrief")}
        </div>
        <fieldset className="flex flex-col gap-1 border-t pt-3">
          <legend className="text-[14px] font-semibold">{t("ai.managers")}</legend>
          <p className="text-[12px] text-[color:var(--color-muted)]">{t("ai.managersMax", { max: POS_AI_MANAGERS_MAX })}</p>
          {managers.length === 0 ? (
            <p data-testid="pos-settings-ai-managers-empty" className="py-2 text-[13px] text-[color:var(--color-muted)]">
              {t("ai.managersEmpty")}
            </p>
          ) : (
            managers.map((m) => {
              const on = picked.includes(m.userId);
              return (
                <label key={m.userId} className="flex min-h-11 items-center gap-3 text-[14px]">
                  <input
                    data-testid={`pos-settings-ai-manager-${m.userId}`}
                    type="checkbox"
                    className="size-5 shrink-0"
                    checked={on}
                    disabled={busy || (!on && full)}
                    onChange={() => setPicked((xs) => (on ? xs.filter((x) => x !== m.userId) : [...xs, m.userId]))}
                  />
                  <span className="min-w-0 flex-1 break-words">{m.name}</span>
                </label>
              );
            })
          )}
          {fieldErr("brief.managerUserIds")}
        </fieldset>
        {err && err.field === null && (
          <p data-testid="pos-settings-ai-error" role="alert" className="text-[13px] text-[color:var(--color-danger)]">
            {t(err.key)}
          </p>
        )}
        {err && err.field !== null && !["brief.hourBkk", "brief.email", "anomalyInBrief", "brief.managerUserIds"].includes(err.field) && (
          <p data-testid="pos-settings-ai-error" role="alert" className="text-[13px] text-[color:var(--color-danger)]">
            {t(err.key)}
          </p>
        )}
        <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button data-testid="pos-settings-ai-cancel" type="button" className="btn btn-ghost h-12 rounded-[13px] px-5 text-[15px]" disabled={busy} onClick={onClose}>
            {t("ai.cancel")}
          </button>
          <button data-testid="pos-settings-ai-save" type="button" className="btn btn-primary h-12 rounded-[13px] px-5 text-[15px] font-semibold disabled:opacity-60" disabled={busy} onClick={() => void save()}>
            {busy ? t("saving") : t("ai.save")}
          </button>
        </div>
      </div>
    </RegisterDialog>
  );
}
