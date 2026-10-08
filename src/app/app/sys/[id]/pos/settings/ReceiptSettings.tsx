"use client";

// ReceiptSettings.tsx — POS P1.10 U แท็บ "ใบเสร็จและภาษี" (ภาพ 17A · brief §2)
//   ซ้าย: หัวใบเสร็จ (โลโก้ลิงก์ https · ชื่อร้าน · โทร · ที่อยู่ — ว่าง = ใช้จากสมุดบัญชี) · ท้ายใบเสร็จ (ข้อความ · แต้ม · QR ปิดไว้ · ชื่อแคชเชียร์) ·
//         เลขเครื่องและเลขเอกสาร (เลขเครื่อง POS ต่อเครื่องแก้ในบรรทัด · รูปแบบเลขรันอ่านอย่างเดียวตามที่เซิร์ฟเวอร์ออกจริง · e-Tax รอผู้ให้บริการ)
//   ขวา: ตัวอย่างสด (renderReceiptHtml ของ payload ตัวอย่างจากฟอร์ม · iframe srcdoc · อัปเดตทันที) · การ์ดภาษี (อ่านอย่างเดียวจากสมุดบัญชี)
// 🔴 โหลดหน้า = receiptSettingsPageDataAction คำขอเดียว · บันทึก = updatePosReceiptSettingsAction (patch เฉพาะคีย์ของฟอร์มนี้)
// 🔴 คำปฏิเสธแสดงผ่านคีย์ pos.settings.errors.* / fieldErrors.* (ไม่แสดงข้อความไทยของเซิร์ฟเวอร์) · ผู้อ่านอย่างเดียว = ช่องปิด + "เฉพาะผู้จัดการแก้ได้"
// ไม่ทำในใบนี้: อัปโหลดโลโก้ (P1.18/media) · สมัคร e-Tax (รอผู้ให้บริการ) · QR ใบเสร็จออนไลน์ (P1.11) · ตั้งรูปแบบเลขเอกสาร (ระบบกำหนด · O2)

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { thisDevicePrinter } from "@/components/pos/print/device-printer";
import { PrintStatus } from "@/components/pos/print/PrintStatus";
import { printReceipt } from "@/components/pos/print/printReceipt";
import { samplePayload } from "@/components/pos/print/sample-payload";
import type { PrintResult } from "@/components/pos/print/types";
import { updateDeviceAction } from "@/lib/modules/pos/device-actions";
import type { PosDeviceListItem } from "@/lib/modules/pos/device-shared";
import { renderReceiptHtml } from "@/lib/modules/pos/receipt-render";
import { receiptSettingsPageDataAction, updatePosReceiptSettingsAction } from "@/lib/modules/pos/receipt-settings-actions";
import { CardHead, Chip, InlineNote, SettingsCard, SwitchKnob, TabHead } from "./settings-ui";

type PageData = Awaited<ReturnType<typeof receiptSettingsPageDataAction>>;
type PageOk = Extract<PageData, { ok: true }>;
type Form = { name: string; phone: string; address: string; logoUrl: string; footer: string; showPoints: boolean; showCashier: boolean };
type Props = { systemId: string; unitId: string; branchName: string; canEdit: boolean; canManageDevices: boolean };

const FIELD_KEYS = new Set(["name", "phone", "address", "logoUrl", "footer"]);
const ERROR_KEY: Record<string, string> = { NOT_FOUND: "notFound", PERMISSION_DENIED: "permissionDenied", VALIDATION: "validation", UNKNOWN: "unknown" };
const DEVICE_ERROR_KEY: Record<string, string> = {
  NOT_FOUND: "notFound",
  PERMISSION_DENIED: "permissionDenied",
  VALIDATION: "validation",
  DEVICE_REVOKED: "deviceRevoked",
  DEVICE_LIMIT: "deviceLimit",
  DEVICE_NOT_FOUND: "deviceNotFound",
  INTERNAL: "internal",
};

/** เดือนปัจจุบันตามเวลาไทย YYYYMM (เลขรันของ service.ts / refund.ts รันต่อสาขาต่อเดือนไทย) */
function bkkPeriod(now: number): string {
  const d = new Date(now + 7 * 3600000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const formOf = (d: PageOk): Form => ({
  name: d.settings.header.name ?? "",
  phone: d.settings.header.phone ?? "",
  address: d.settings.header.address ?? "",
  logoUrl: d.settings.header.logoUrl ?? "",
  footer: d.settings.footer,
  showPoints: d.settings.showPoints,
  showCashier: d.settings.showCashier,
});

export function ReceiptSettings({ systemId, unitId, branchName, canEdit, canManageDevices }: Props) {
  const t = useTranslations("pos.settings");
  const tr = useTranslations("pos.settings.receipt");
  const td = useTranslations("pos.device");
  const locale: "th" | "en" = useLocale().startsWith("en") ? "en" : "th";
  const [data, setData] = useState<PageOk | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<{ key: string; field?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [devices, setDevices] = useState<PosDeviceListItem[]>([]);
  const [regNo, setRegNo] = useState<Record<string, string>>({});
  const [devErr, setDevErr] = useState<Record<string, string>>({});
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoadErr(false);
    const r = await receiptSettingsPageDataAction({ systemId, unitId }).catch(() => null);
    if (!r || !r.ok) {
      setLoadErr(true);
      return;
    }
    setData(r);
    setForm(formOf(r));
    setDevices(r.devices);
    setRegNo(Object.fromEntries(r.devices.map((d) => [d.id, d.posRegNo ?? ""])));
  }, [systemId, unitId]);
  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setSaved(false);
    if (saveErr?.field === k) setSaveErr(null);
  };

  const book = data?.book ?? null;
  const firstDevice = devices.find((d) => d.status === "ACTIVE");
  const sample = useCallback(
    (copy: boolean, receiptNo: string) =>
      form
        ? samplePayload({
            header: { name: form.name, phone: form.phone, address: form.address, logoUrl: form.logoUrl.trim() || null },
            footer: form.footer,
            showPoints: form.showPoints,
            showCashier: form.showCashier,
            book,
            text: { latte: tr("sampleLatte"), croissant: tr("sampleCroissant"), cashier: tr("sampleCashier"), member: tr("sampleMember") },
            receiptNo,
            issuedAt: new Date(now).toISOString(),
            copy,
            branchName,
            device: firstDevice ? { name: firstDevice.name, posRegNo: firstDevice.posRegNo } : undefined,
          })
        : null,
    [form, book, tr, now, branchName, firstDevice],
  );
  const period = bkkPeriod(now);
  const previewHtml = useMemo(() => {
    const p = sample(false, `${period}-0001`);
    return p ? renderReceiptHtml(p, { paper: "80", locale }) : "";
  }, [sample, period, locale]);

  // ── ตัวอย่างสด: ความสูง iframe ตามเนื้อหา ──
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [frameH, setFrameH] = useState(640);
  const fitFrame = () => {
    try {
      const h = frameRef.current?.contentDocument?.documentElement?.scrollHeight;
      if (h && h > 100) setFrameH(Math.min(h + 8, 2400));
    } catch {
      /* อ่านไม่ได้ = คงความสูงเดิม */
    }
  };

  const save = async () => {
    if (!form || !canEdit || saving) return;
    setSaving(true);
    setSaveErr(null);
    setSaved(false);
    try {
      const r = await updatePosReceiptSettingsAction({
        systemId,
        patch: {
          header: { name: form.name.trim() || null, phone: form.phone.trim() || null, address: form.address.trim() || null, logoUrl: form.logoUrl.trim() || null },
          footer: form.footer,
          showPoints: form.showPoints,
          showCashier: form.showCashier,
        },
      });
      if (r.ok) {
        setData((d) => (d ? { ...d, settings: r.settings } : d));
        setForm((f) => (f && data ? formOf({ ...data, settings: r.settings }) : f));
        setSaved(true);
      } else if (r.code === "VALIDATION" && r.field && FIELD_KEYS.has(r.field)) setSaveErr({ key: `receipt.fieldErrors.${r.field}`, field: r.field });
      else setSaveErr({ key: `errors.${ERROR_KEY[r.code] ?? "unknown"}` });
    } catch {
      setSaveErr({ key: "errors.unknown" });
    } finally {
      setSaving(false);
    }
  };

  // พิมพ์ตัวอย่าง: payload ตัวอย่าง (สำเนา · เลข "ตัวอย่าง") ผ่านวิธีพิมพ์ของเครื่องนี้ (ไม่ลงทะเบียน = เบราว์เซอร์ 80 มม.)
  const [printRes, setPrintRes] = useState<PrintResult | null>(null);
  const [printing, setPrinting] = useState(false);
  const printSample = async (forceBrowser = false) => {
    const p = sample(true, tr("sampleNo"));
    if (!p || printing) return;
    setPrinting(true);
    try {
      const dev = await thisDevicePrinter(systemId, unitId);
      setPrintRes(await printReceipt(p, forceBrowser ? { ...dev.config, mode: "browser" } : dev.config, { locale, deviceCode: dev.deviceCode }));
    } finally {
      setPrinting(false);
    }
  };

  const saveRegNo = async (d: PosDeviceListItem) => {
    const v = (regNo[d.id] ?? "").trim();
    if (v === (d.posRegNo ?? "")) return;
    setDevErr((e) => ({ ...e, [d.id]: "" }));
    const r = await updateDeviceAction({ systemId, unitId, patch: { id: d.id, posRegNo: v || null } }).catch(() => null);
    if (r?.ok) {
      setDevices((list) => list.map((x) => (x.id === d.id ? { ...x, posRegNo: r.device.posRegNo } : x)));
      setRegNo((m) => ({ ...m, [d.id]: r.device.posRegNo ?? "" }));
    } else setDevErr((e) => ({ ...e, [d.id]: td(`errors.${DEVICE_ERROR_KEY[r?.code ?? "INTERNAL"] ?? "internal"}`) }));
  };

  if (loadErr)
    return (
      <div data-testid="pos-settings-load-error" role="alert" className="flex flex-col items-start gap-3 text-[14.5px]">
        <p>{t("loadFailed")}</p>
        <button data-testid="pos-settings-retry" type="button" className="btn btn-ghost h-11 rounded-[13px] px-5" onClick={() => void load()}>
          {t("retry")}
        </button>
      </div>
    );
  if (!data || !form)
    return (
      <p data-testid="pos-settings-loading" className="text-[14px] text-[color:var(--color-muted)]">
        {t("loading")}
      </p>
    );

  const ro = !canEdit;
  const fromBook = (v: string | null | undefined) => (v && v.trim() ? tr("fromBook", { value: v.trim() }) : undefined);
  const inp = "input h-12 w-full rounded-[13px] px-4 text-[15px] disabled:opacity-70";
  const fieldErr = (k: string) =>
    saveErr?.field === k ? (
      <span data-testid="pos-settings-field-error" className="text-[12.5px] text-[color:var(--color-danger)]">
        {t(saveErr.key)}
      </span>
    ) : null;
  const toggleRow = (label: string, hint: string | null, node: ReactNode) => (
    <div className="flex items-center gap-4 border-t py-[14px] text-[15px] first:border-t-0">
      <div className="min-w-0 flex-1">
        <b className="block font-semibold">{label}</b>
        {hint && <small className="block text-[12.5px] text-[color:var(--color-muted)]">{hint}</small>}
      </div>
      {node}
    </div>
  );

  return (
    <div data-testid="pos-settings-receipt" className="flex min-w-0 flex-col gap-6 md:gap-8">
      <TabHead title={tr("title")} desc={tr("subtitle")}>
            <button data-testid="pos-settings-print-sample" type="button" className="btn btn-ghost h-11 gap-2 rounded-[11px] px-4 text-[14px]" disabled={printing} onClick={() => void printSample()}>
              <RegisterIcon name="print" size={15} />
              {tr("printSample")}
            </button>
            <button
              data-testid="pos-settings-save"
              type="button"
              className="btn btn-primary h-11 rounded-[11px] px-5 text-[14px] font-semibold disabled:opacity-50"
              disabled={ro || saving}
              title={ro ? t("readOnly") : undefined}
              onClick={() => void save()}
            >
              {saving ? t("saving") : t("save")}
            </button>
      </TabHead>
      {ro && (
        <InlineNote tone="ok" testid="pos-settings-readonly">
          {t("readOnly")}
        </InlineNote>
      )}
      {saveErr && !saveErr.field && (
        <InlineNote tone="error" testid="pos-settings-error">
          {t(saveErr.key)}
        </InlineNote>
      )}
      <PrintStatus result={printRes} onRetry={() => void printSample()} onBrowser={() => void printSample(true)} />
      {saved && (
        <InlineNote tone="ok" testid="pos-settings-saved">
          {t("saved")}
        </InlineNote>
      )}

      <div className="flex min-w-0 flex-col gap-6 xl:flex-row xl:items-start xl:gap-8">
        {/* ── ซ้าย ── */}
        <div className="flex min-w-0 flex-1 flex-col gap-6 xl:gap-7">
          <SettingsCard testid="pos-settings-header-card">
            <CardHead icon="doc" title={tr("headerCard")} />
            <div className="flex flex-col gap-[18px]">
              <div className="flex items-center gap-[18px]">
                <span className="grid size-[76px] shrink-0 place-items-center overflow-hidden rounded-[14px] border bg-[color:var(--color-surface)]">
                  {form.logoUrl.trim().startsWith("https://") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logoUrl.trim()} alt="" className="max-h-[60px] max-w-[60px] object-contain" />
                  ) : (
                    <span className="text-[11px] text-[color:var(--color-muted)]">{tr("logoNone")}</span>
                  )}
                </span>
                <label className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tr("logo")}</span>
                  <input
                    data-testid="pos-settings-logo-url"
                    className={inp}
                    type="url"
                    inputMode="url"
                    placeholder={fromBook(book?.logoUrl) ?? "https://"}
                    value={form.logoUrl}
                    disabled={ro}
                    onChange={(e) => set("logoUrl", e.target.value)}
                  />
                  <small className="text-[12.5px] text-[color:var(--color-muted)]">{tr("logoHint")}</small>
                  {fieldErr("logoUrl")}
                </label>
              </div>
              <div className="grid grid-cols-1 gap-x-[22px] gap-y-[18px] md:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tr("name")}</span>
                  <input data-testid="pos-settings-name" className={inp} value={form.name} placeholder={fromBook(book?.orgName)} disabled={ro} onChange={(e) => set("name", e.target.value)} />
                  {fieldErr("name")}
                </label>
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tr("phone")}</span>
                  <input data-testid="pos-settings-phone" className={inp} type="tel" value={form.phone} placeholder={fromBook(book?.phone)} disabled={ro} onChange={(e) => set("phone", e.target.value)} />
                  {fieldErr("phone")}
                </label>
                <label className="flex min-w-0 flex-col gap-2 md:col-span-2">
                  <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tr("address")}</span>
                  <input data-testid="pos-settings-address" className={inp} value={form.address} placeholder={fromBook(book?.address)} disabled={ro} onChange={(e) => set("address", e.target.value)} />
                  {fieldErr("address")}
                </label>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard testid="pos-settings-footer-card">
            <CardHead icon="list" title={tr("footerCard")} />
            <label className="flex flex-col gap-2">
              <span className="sr-only">{tr("footerText")}</span>
              <textarea
                data-testid="pos-settings-footer"
                className="input min-h-[76px] w-full rounded-[13px] px-4 py-[13px] text-[15px] disabled:opacity-70"
                rows={2}
                value={form.footer}
                disabled={ro}
                onChange={(e) => set("footer", e.target.value)}
              />
              {fieldErr("footer")}
            </label>
            <div className="mt-3 flex flex-col">
              {toggleRow(
                tr("showPoints"),
                tr("showPointsHint"),
                <button
                  data-testid="pos-settings-show-points"
                  type="button"
                  role="switch"
                  aria-checked={form.showPoints}
                  aria-label={tr("showPoints")}
                  disabled={ro}
                  className="grid min-h-11 min-w-11 place-items-center"
                  onClick={() => set("showPoints", !form.showPoints)}
                >
                  <SwitchKnob on={form.showPoints} disabled={ro} />
                </button>,
              )}
              {toggleRow(
                tr("qrEReceipt"),
                tr("qrEReceiptHint"),
                <button
                  data-testid="pos-settings-qr-ereceipt"
                  type="button"
                  role="switch"
                  aria-checked={data.settings.qrEReceipt}
                  aria-label={tr("qrEReceipt")}
                  disabled
                  className="grid min-h-11 min-w-11 place-items-center"
                >
                  <SwitchKnob on={data.settings.qrEReceipt} disabled />
                </button>,
              )}
              {toggleRow(
                tr("showCashier"),
                null,
                <button
                  data-testid="pos-settings-show-cashier"
                  type="button"
                  role="switch"
                  aria-checked={form.showCashier}
                  aria-label={tr("showCashier")}
                  disabled={ro}
                  className="grid min-h-11 min-w-11 place-items-center"
                  onClick={() => set("showCashier", !form.showCashier)}
                >
                  <SwitchKnob on={form.showCashier} disabled={ro} />
                </button>,
              )}
            </div>
          </SettingsCard>

          <SettingsCard testid="pos-settings-numbers-card">
            <CardHead icon="tag" title={tr("numbersCard")} />
            <div className="flex flex-col gap-[18px]">
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tr("devicesTitle")}</span>
                <div data-testid="pos-settings-device-list" className="rounded-[14px] border px-4 py-1 md:px-5">
                  {!canManageDevices ? (
                    <p className="py-3 text-[14px] text-[color:var(--color-muted)]">{tr("devicesHidden")}</p>
                  ) : devices.length === 0 ? (
                    <p className="py-3 text-[14px] text-[color:var(--color-muted)]">{tr("devicesEmpty")}</p>
                  ) : (
                    devices.map((d) => (
                      <div key={d.id} className={`flex flex-wrap items-center gap-x-[14px] gap-y-1 border-t py-2 text-[14.5px] first:border-t-0 ${d.status === "REVOKED" ? "opacity-60" : ""}`}>
                        <RegisterIcon name="print" size={14} className="text-[color:var(--color-muted)]" />
                        <span className="min-w-0 flex-1 truncate">
                          {d.name}
                          {d.status === "REVOKED" ? ` · ${td("revokedChip")}` : ""}
                        </span>
                        <input
                          data-testid={`pos-settings-device-regno-${d.id}`}
                          aria-label={tr("posRegNoLabel", { name: d.name })}
                          className="input h-11 w-[150px] rounded-[10px] px-3 text-right font-mono text-[14px] font-semibold disabled:opacity-70"
                          value={regNo[d.id] ?? ""}
                          placeholder={tr("posRegNoPlaceholder")}
                          maxLength={40}
                          disabled={d.status === "REVOKED"}
                          onChange={(e) => setRegNo((m) => ({ ...m, [d.id]: e.target.value }))}
                          onBlur={() => void saveRegNo(d)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                        />
                        {devErr[d.id] ? <span className="w-full text-right text-[12.5px] text-[color:var(--color-danger)]">{devErr[d.id]}</span> : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-x-[22px] gap-y-[18px] md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tr("receiptPattern")}</span>
                  <span data-testid="pos-settings-receipt-pattern" className="flex h-12 items-center rounded-[13px] border bg-[color:var(--color-surface-2)] px-4 font-mono text-[14px] font-semibold">
                    {"{YYYY}{MM}-{NNNN}"}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tr("example")}</span>
                  <span className="flex h-12 items-center gap-3">
                    <span className="inline-flex h-[34px] items-center rounded-[9px] bg-[color:var(--color-accent-soft)] px-3 font-bold tabular-nums text-[color:var(--color-accent)]">{`${period}-0001`}</span>
                    <small className="text-[12.5px] text-[color:var(--color-muted)]">{tr("exampleHint")}</small>
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tr("creditPattern")}</span>
                  <span data-testid="pos-settings-credit-pattern" className="flex h-12 items-center rounded-[13px] border bg-[color:var(--color-surface-2)] px-4 font-mono text-[14px] font-semibold">
                    {"CN{YYYY}{MM}-{NNNN}"}
                  </span>
                </div>
                <div className="flex flex-col justify-end gap-2">
                  <span className="flex h-12 items-center gap-[10px] text-[14.5px]" aria-disabled="true">
                    <span aria-hidden className="grid size-5 place-items-center rounded-[6px] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]">
                      <RegisterIcon name="check" size={12} strokeWidth={3} />
                    </span>
                    {tr("resetMonthly")}
                  </span>
                </div>
              </div>
              <small className="text-[12.5px] text-[color:var(--color-muted)]">{tr("patternReadOnly")}</small>
              <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                <div className="min-w-0 flex-1">
                  <b className="block text-[15px] font-semibold">{tr("etax")}</b>
                  <small className="block text-[12.5px] text-[color:var(--color-muted)]">{tr("etaxHint")}</small>
                </div>
                <Chip tone="muted" testid="pos-settings-etax-chip">
                  {tr("etaxChip")}
                </Chip>
              </div>
            </div>
          </SettingsCard>
        </div>

        {/* ── ขวา ── */}
        <div className="flex min-w-0 flex-col gap-6 xl:w-[380px] xl:shrink-0 xl:gap-7">
          <div className="flex flex-col">
            <div className="mb-3 flex items-center gap-2 text-[13px] font-bold text-[color:var(--color-ink-soft)]">
              <RegisterIcon name="doc" size={14} />
              {tr("previewTitle", { paper: "80" })}
              <span className="flex-1" />
              <span className="font-normal text-[color:var(--color-muted)]">{tr("previewHint")}</span>
            </div>
            <div className="flex justify-center rounded-[18px] bg-[color:var(--color-stage)] p-4 md:p-[22px]">
              <iframe
                ref={frameRef}
                data-testid="pos-settings-preview"
                title={tr("previewFrame")}
                className="w-full max-w-[336px] rounded-[4px] border bg-white"
                style={{ height: frameH }}
                srcDoc={previewHtml}
                onLoad={fitFrame}
              />
            </div>
          </div>

          <SettingsCard testid="pos-settings-tax">
            <CardHead icon="pct" title={tr("taxCard")} right={<Chip tone="muted">{tr("taxReadOnly")}</Chip>} />
            {book ? (
              <div className="flex flex-col rounded-[14px] border bg-[color:var(--color-surface-2)] px-5 py-2 text-[14.5px]">
                <div className="flex flex-col gap-[2px] border-b py-[10px]">
                  <span className="text-[13px] text-[color:var(--color-muted)]">{tr("vatLabel")}</span>
                  <span data-testid="pos-settings-tax-vat">{book.vatRegistered ? tr("vatOn") : tr("vatOff")}</span>
                </div>
                <div className="flex flex-col gap-[2px] border-b py-[10px]">
                  <span className="text-[13px] text-[color:var(--color-muted)]">{tr("taxIdLabel")}</span>
                  <span className="tabular-nums">{book.taxId?.trim() ? tr("taxIdValue", { taxId: book.taxId.trim(), branch: book.branchCode?.trim() || "00000" }) : tr("taxIdNone")}</span>
                </div>
                {book.vatRegistered && (
                  <div className="flex flex-col gap-[2px] border-b py-[10px]">
                    <span className="text-[13px] text-[color:var(--color-muted)]">{tr("abbLabel")}</span>
                    <span>{book.posAbbreviatedInvoice ? tr("abbOn") : tr("abbOff")}</span>
                  </div>
                )}
                <Link
                  data-testid="pos-settings-account-link"
                  href={`/app/sys/${book.accountSystemId}/account/settings`}
                  className="flex min-h-11 items-center text-[14px] font-semibold text-[color:var(--color-accent)]"
                >
                  {tr("accountLink")}
                </Link>
              </div>
            ) : (
              <p data-testid="pos-settings-no-book" className="text-[14px] text-[color:var(--color-muted)]">
                {tr("noBook")}
              </p>
            )}
          </SettingsCard>
        </div>
      </div>
    </div>
  );
}
