"use client";
// TRIPS T1.1 ▸ จอค่าตั้งทัวร์ (ภาพ 17 · ใบสั่ง T1.1 §6) — ห่อ SettingsForm กลาง (แบบ HotelSettings: การ์ดต่อหมวด → "แก้" เปิดฟอร์มเครื่องยนต์เฉพาะช่องของหมวด)
//   • ช่อง/ป้าย/ค่า/สิทธิ์ต่อช่องมาจากโมเดลของเครื่องยนต์ (loadSettingsForm) — ไฟล์นี้ไม่มีคีย์ค่าตั้งพิมพ์เอง ไม่วาดช่องค่าตั้งเอง
//   • ส่วนเฉพาะ trips อยู่ใน view model: เมนู 9 หมวด · แถบลำดับชั้น · ค่าที่ตั้งรายสินค้า · คำเตือนค้างของค่าที่บันทึกแล้ว (standingWarnings · HIGH/HIGHEST บนสุด)
//   • ไม่เปลี่ยนพฤติกรรม SettingsForm ของโดเมนอื่น · ป้ายใช้คำของแอปจริง "ต่างจากแม่แบบ" (OQ4) · รับทราบคำเตือนไม่บังคับเหตุผล (OQ3 · ฟอร์มกลางตัดสินจากโดเมน)
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { RemoveResult, SetResult } from "@/lib/core/settings/types";
import type { TripsSettingsVM } from "@/lib/modules/trips";
import SettingsForm from "@/components/settings/SettingsForm";
import { formatFieldValue, reviewHintTh, type SettingsField } from "@/components/settings/settings-shared";
import type { TripsSettingsSectionKey } from "./trips-shared";
import { Dialog } from "./ProductsScreenParts";
import { ViewValue, viewText } from "./TripsSettingsValues";

type Actions = {
  save(changes: unknown, opts?: { ackLegalWarn?: boolean }): Promise<SetResult>;
  reset(t: { key: string; scope: string; scopeId: string }): Promise<RemoveResult>;
};
type Props = { vm: TripsSettingsVM; unitSlug: string; actions: Actions };

const BTN = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)]";
const CHIP = "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-sm";

export default function TripsSettings({ vm, unitSlug, actions }: Props) {
  const t = useTranslations("trips");
  const router = useRouter();
  const base = `/app/u/${unitSlug}/trips/settings`;
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState<TripsSettingsSectionKey | null>(vm.section);
  // ระหว่างบันทึก/คืนค่า (ฟอร์มกลางไม่บอกสถานะออกมา) ⇒ ห่อ action เพื่อรู้ว่ากำลังทำงาน · Escape ไม่ปิดกล่องระหว่างนี้
  const [saving, setSaving] = useState(0);
  const tracked = useMemo(
    () => ({
      save: async (changes: unknown, opts?: { ackLegalWarn?: boolean }) => {
        setSaving((n) => n + 1);
        try {
          return await actions.save(changes, opts);
        } finally {
          setSaving((n) => n - 1);
        }
      },
      reset: async (target: { key: string; scope: string; scopeId: string }) => {
        setSaving((n) => n + 1);
        try {
          return await actions.reset(target);
        } finally {
          setSaving((n) => n - 1);
        }
      },
    }),
    [actions],
  );
  const fields = useMemo(() => vm.form.groups.flatMap((g) => g.fields), [vm.form]);
  const productName = vm.productId ? (vm.products.find((p) => p.id === vm.productId)?.titleTh ?? "") : null;

  const editModel = useMemo(() => {
    if (!editing) return null;
    const sec = vm.sections.find((s) => s.key === editing);
    if (!sec) return null;
    const groups = vm.form.groups.filter((g) => sec.groups.includes(g.key));
    const keys = new Set(groups.flatMap((g) => g.fields.map((f) => f.key)));
    return { ...vm.form, groups, history: vm.form.history.filter((h) => keys.has(h.key)) };
  }, [editing, vm]);
  const editingLabel = editing ? t(`settings.sections.${editing}`) : "";

  const scopeHref = (productId: string | null) => (productId ? `${base}?scope=PRODUCT&id=${encodeURIComponent(productId)}` : base);
  const steps = [
    { key: "template", label: vm.header.templateLabelTh ? t("settings.stepTemplate", { name: vm.header.templateLabelTh }) : t("settings.stepTemplateNone"), sub: t("settings.stepTemplateSub"), on: false },
    { key: "unit", label: t("settings.stepUnit"), sub: t("settings.stepUnitSub"), on: vm.scope === "UNIT" },
    { key: "product", label: productName ? t("settings.stepProductName", { name: productName }) : t("settings.stepProduct"), sub: t("settings.stepProductSub"), on: vm.scope === "PRODUCT" },
    { key: "booking", label: t("settings.stepBooking"), sub: t("settings.stepBookingSub"), on: false },
  ];

  return (
    <div data-testid="trips-settings" data-scope={vm.scope} className="flex w-full min-w-0 flex-col gap-5 lg:flex-row lg:items-start">
      {/* ── เมนูหมวด (ภาพ 17 ซ้าย) ── */}
      <nav aria-label={t("settings.sectionsAria")} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-3 lg:w-64 lg:flex-none">
        <span className="px-3 pt-1 text-sm text-[color:var(--color-muted)]">{t("settings.menuHead")}</span>
        <span className="flex min-h-11 items-center justify-between rounded-xl bg-[color:var(--color-surface-2)] px-3 text-sm font-bold">
          {t("settings.title")}
          {vm.header.differsCount ? <span className="text-sm text-[color:var(--color-accent)]">{vm.header.differsCount}</span> : null}
        </span>
        {vm.sections.map((s) =>
          s.fieldCount === 0 ? (
            // หมวดที่ชั้นนี้ไม่มีช่อง (ไม่มีการ์ดให้ไป) — ไม่ใช่ลิงก์ ไม่มี anchor ตาย
            <span key={s.key} data-testid={`trips-settings-section-${s.key}`} aria-disabled="true" className="flex min-h-11 items-center rounded-xl px-5 text-sm text-[color:var(--color-muted)]">
              {t(`settings.sections.${s.key}`)}
            </span>
          ) : (
            <a
              key={s.key}
              href={`#sec-${s.key}`}
              data-testid={`trips-settings-section-${s.key}`}
              onClick={(e) => {
                // "ดูเฉพาะที่ปรับ" อาจซ่อนการ์ดนี้อยู่ ⇒ ปิดตัวกรองก่อน แล้วเลื่อนไปการ์ดหลังวาดใหม่
                if (!onlyChanged) return;
                e.preventDefault();
                setOnlyChanged(false);
                requestAnimationFrame(() => document.getElementById(`sec-${s.key}`)?.scrollIntoView());
              }}
              className="flex min-h-11 items-center justify-between gap-2 rounded-xl px-5 text-sm text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
            >
              {t(`settings.sections.${s.key}`)}
              {s.warningCount ? <span className={`${CHIP} border border-dashed border-[color:var(--color-danger)] text-[color:var(--color-danger)]`}>{s.warningCount}</span> : null}
            </a>
          ),
        )}
        <p className="px-3 pt-2 text-sm text-[color:var(--color-muted)]">{t("settings.otherDomains")}</p>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* ── หัว + ลำดับชั้น ── */}
        <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-[color:var(--color-ink)]">{t("settings.title")}</h1>
              <p className="text-sm text-[color:var(--color-ink-soft)]">{productName ? t("settings.subProduct", { name: productName }) : t("settings.subUnit", { name: vm.unitName })}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">
                {[
                  vm.header.templateLabelTh ? t("settings.templateUsed", { name: vm.header.templateLabelTh }) : null,
                  t("settings.differsN", { n: vm.header.differsCount }),
                  vm.scope === "UNIT" ? t("settings.perProductN", { n: vm.header.productOverrideCount }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2">
                <input data-testid="trips-settings-only-changed" type="checkbox" className="h-5 w-5" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
                {t("settings.onlyChanged")}
              </label>
              <button type="button" data-testid="trips-settings-history" className={BTN} aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
                {t("settings.history")}
              </button>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-stretch gap-2">
            <span className="self-center text-sm text-[color:var(--color-muted)]">{t("settings.chainLead")}</span>
            {steps.map((s, i) => (
              <span key={s.key} className="flex items-stretch gap-2">
                <span data-step={s.key} aria-current={s.on ? "step" : undefined} className={`flex min-h-11 min-w-0 flex-col justify-center rounded-xl px-3 py-1 text-sm ${s.on ? "border-2 border-[color:var(--color-accent)]" : s.key === "booking" ? "border border-dashed border-[color:var(--color-line)]" : "border border-[color:var(--color-line)]"}`}>
                  <span className="font-bold">{s.label}</span>
                  <span className="text-[color:var(--color-muted)]">{s.sub}</span>
                </span>
                {i < steps.length - 1 ? <span aria-hidden="true" className="self-center text-[color:var(--color-muted)]">›</span> : null}
              </span>
            ))}
            <label className="ml-auto flex items-center gap-2 text-sm">
              {t("settings.viewLevel")}
              <select data-testid="trips-settings-scope" className="input min-h-11 text-sm" value={vm.productId ?? ""} onChange={(e) => router.push(scopeHref(e.target.value || null))}>
                <option value="">{t("settings.stepUnit")}</option>
                {vm.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.titleTh}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm text-[color:var(--color-muted)]">{t("settings.pickProduct")}</span>
            {vm.products.map((p) => (
              <a
                key={p.id}
                data-testid={`trips-settings-product-${p.id}`}
                href={scopeHref(p.id)}
                aria-current={vm.productId === p.id ? "page" : undefined}
                className={`${CHIP} min-h-11 border ${vm.productId === p.id ? "border-2 border-[color:var(--color-ink)] font-bold" : "border-[color:var(--color-line)]"}`}
              >
                {p.titleTh}
                {p.overrideCount ? ` · ${p.overrideCount}` : ""}
              </a>
            ))}
          </div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--color-ink-soft)]">
            <span className={`${CHIP} border border-[color:var(--color-line)]`}>{t("settings.badgeDefault")}</span>
            {t("settings.legendDefault")}
            <span className={`${CHIP} border border-[color:var(--color-accent)] text-[color:var(--color-accent)]`}>{t("settings.badgeDiffers")}</span>
            {t("settings.legendDiffers")}
            <span className={`${CHIP} border border-dashed border-[color:var(--color-note-line)] text-[color:var(--color-note-ink)]`}>{t("settings.badgeAccountant")}</span>
            {t("settings.legendAccountant")}
            <span className={`${CHIP} border border-dashed border-[color:var(--color-danger)] text-[color:var(--color-danger)]`}>{t("settings.badgeWarning")}</span>
            {t("settings.legendWarning")}
          </p>
          {showHistory ? (
            <div className="flex flex-col gap-2 border-t border-[color:var(--color-line)] pt-3">
              {vm.form.history.length ? (
                <ul className="flex flex-col gap-2">
                  {vm.form.history.map((h) => (
                    <li key={h.id} className="flex min-w-0 flex-col rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-sm">
                      <span className="font-medium">{h.labelTh}</span>
                      <span className="break-words">{h.masked ? t("settings.hidden") : `${h.beforeTh} → ${h.afterTh}`}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[color:var(--color-muted)]">{t("settings.noHistory")}</p>
              )}
            </div>
          ) : null}
        </section>

        {/* ── การ์ดต่อหมวด ── */}
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
          {vm.sections.map((s) => {
            const fs = fields.filter((f) => s.groups.includes(f.group)).filter((f) => !onlyChanged || f.differsFromTemplate || f.hasOwn || vm.productOverrides.some((o) => o.key === f.key));
            if (!fs.length) return null;
            const editable = fs.some((f) => f.editable);
            return (
              <section key={s.key} id={`sec-${s.key}`} data-section={s.key} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5">
                <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                  <h2 className="min-w-0 text-base font-bold text-[color:var(--color-ink)]">{t(`settings.sections.${s.key}`)}</h2>
                  {editable ? (
                    <button type="button" onClick={() => setEditing(s.key)} className="min-h-11 px-2 text-sm font-bold text-[color:var(--color-accent)]">
                      {t("common.edit")}
                    </button>
                  ) : (
                    <span className="text-sm text-[color:var(--color-muted)]">{t("settings.readOnly")}</span>
                  )}
                </div>
                {fs.map((f) => (
                  <FieldRow key={f.key} f={f} vm={vm} t={t} />
                ))}
              </section>
            );
          })}
        </div>
      </div>

      {editing && editModel ? (
        <Dialog title={t("settings.editTitle", { name: editingLabel })} onClose={() => setEditing(null)} closeLabel={t("common.close")} wide flushBottom busy={saving > 0}>
          <SettingsForm model={editModel} actions={tracked} />
        </Dialog>
      ) : null}
    </div>
  );
}

type T = ReturnType<typeof useTranslations>;
function FieldRow({ f, vm, t }: { f: SettingsField; vm: TripsSettingsVM; t: T }) {
  // ค่าที่ทะเบียนจัดรูปได้ (tableTh/enum/หน่วย) ใช้ formatFieldValue · ชนิดที่ทะเบียนไม่รองรับ (vm.fieldViews) จอ trips จัดรูปเอง
  const view = vm.fieldViews[f.key];
  const fmt = (v: unknown): string => (view ? viewText(t, view, f, v) : formatFieldValue(f, v));
  const hint = reviewHintTh(f);
  const perProduct = vm.scope === "UNIT" ? vm.productOverrides.filter((o) => o.key === f.key) : [];
  const warns = vm.standingWarnings.filter((w) => w.key === f.key);
  const value = f.masked ? t("settings.hidden") : fmt(f.value);
  return (
    <div data-setting-row={f.key} className="flex min-w-0 flex-col gap-1 border-b border-[color:var(--color-line)] py-2 text-sm last:border-b-0">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 font-medium text-[color:var(--color-ink)]">{f.labelTh}</span>
        <span className="flex flex-wrap items-center gap-1">
          {f.differsFromTemplate ? (
            <span className={`${CHIP} border border-[color:var(--color-accent)] text-[color:var(--color-accent)]`}>{t("settings.badgeDiffers")}</span>
          ) : (
            <span className={`${CHIP} border border-[color:var(--color-line)] text-[color:var(--color-ink-soft)]`}>{t("settings.badgeDefault")}</span>
          )}
          {perProduct.length ? <span className={`${CHIP} border border-[color:var(--color-line)]`}>{t("settings.perProductBadge", { n: perProduct.length })}</span> : null}
          {warns.length ? <span className={`${CHIP} border border-dashed border-[color:var(--color-danger)] text-[color:var(--color-danger)]`}>{warns.map((w) => w.code).join(" · ")}</span> : null}
        </span>
      </div>
      {view && !f.masked ? <ViewValue view={view} f={f} v={f.value} warn={warns.length > 0} /> : <span className="break-words text-[color:var(--color-ink)]">{value}</span>}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[color:var(--color-muted)]">
        <span>{f.sourceLabelTh}</span>
        {f.differsFromTemplate && !f.masked ? <span>{t("settings.templateValue", { v: fmt(f.templateValue) })}</span> : null}
        {hint ? <span className={`${CHIP} border border-dashed border-[color:var(--color-note-line)] text-[color:var(--color-note-ink)]`}>{hint}</span> : null}
      </div>
      {perProduct.length ? (
        <ul className="flex flex-col gap-1 rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2">
          {perProduct.map((o) => (
            <li key={o.productId} className="flex min-w-0 items-start justify-between gap-2">
              <span>{o.titleTh}</span>
              <span className="text-right font-medium">{f.masked || o.masked ? t("settings.hidden") : fmt(o.value)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {warns.map((w) => (
        <p
          key={w.code}
          data-testid={`trips-settings-warning-${w.key}`}
          data-severity={w.severity}
          role="note"
          className={`rounded-lg border border-dashed px-3 py-2 ${w.severity === "NORMAL" ? "border-[color:var(--color-note-line)] text-[color:var(--color-note-ink)]" : "border-2 border-[color:var(--color-danger)] font-medium text-[color:var(--color-danger)]"}`}
        >
          {`${w.code} · ${w.messageTh}`}
        </p>
      ))}
      {!f.editable && f.lockedReasonTh ? <p className="text-sm text-[color:var(--color-ink-soft)]">{`🔒 ${f.lockedReasonTh}`}</p> : null}
    </div>
  );
}
