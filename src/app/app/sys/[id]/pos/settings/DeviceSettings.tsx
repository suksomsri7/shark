"use client";

// DeviceSettings.tsx — POS P1.10 U แท็บ "เครื่องและเครื่องพิมพ์" (ภาพ 17B · brief §3)
//   หัว: ชื่อ · คำอธิบาย · "ลงทะเบียนเครื่องนี้" (รหัสเครื่องของเบราว์เซอร์นี้ = deviceCode · ลงแล้ว = ปุ่มปิด · ครบเพดาน = ข้อความในบรรทัด)
//   ซ้าย: การ์ดเครื่อง (ชื่อ · เลขเครื่อง POS · "เครื่อง <รหัสย่อ>" · ออนไลน์ · กะที่เปิด · ชิปวิธีพิมพ์/ลิ้นชัก) — เพิกถอนแล้ว = จาง + ชิป
//   ขวา: ตั้งค่าเครื่องที่เลือก (ชื่อ · เลขเครื่อง POS · กระดาษ 58/80 · วิธีเชื่อม Bluetooth/USB/เบราว์เซอร์ · จับคู่ (เบราว์เซอร์นี้) ·
//        ภาษาไทยบนเครื่องพิมพ์ · พิมพ์อัตโนมัติ · ลิ้นชัก · สำเนาให้ร้าน · ทดสอบพิมพ์ · เพิกถอน (กล่องยืนยัน))
// 🔴 printerConfig ส่ง "ทั้งก้อน" ทุกครั้ง (เซิร์ฟเวอร์รวมให้ก็จริง แต่จอไม่พึ่ง) · คีย์ = เฉพาะที่ parsePrinterConfig รับ (mode ไม่ใช่ transport)
// 🔴 ข้อมูลจับคู่ฮาร์ดแวร์อยู่ใน localStorage ต่อรหัสเครื่อง (มติ CD2) — จับคู่ได้เฉพาะเครื่องของเบราว์เซอร์นี้
// 🔴 คำปฏิเสธแสดงผ่านคีย์ pos.device.errors.* · ไม่ทำในใบนี้: ชิป/ตั้งจอลูกค้า (P1.x) · ใบครัวพิมพ์ที่ (P2) · QR ลงทะเบียนเครื่องอื่น (P1.18)

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { pairingMatches, readPairing } from "@/components/pos/print/pairing";
import { PrinterPairDialog } from "@/components/pos/print/PrinterPairDialog";
import { PrintStatus } from "@/components/pos/print/PrintStatus";
import { printReceipt } from "@/components/pos/print/printReceipt";
import { samplePayload } from "@/components/pos/print/sample-payload";
import type { PrinterPairing, PrintResult } from "@/components/pos/print/types";
import { listDevicesAction, registerDeviceAction, revokeDeviceAction, updateDeviceAction } from "@/lib/modules/pos/device-actions";
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
import { POS_DEVICE_NAME_MAX, POS_REG_NO_MAX, type PosDeviceListItem, type PosPrinterConfig } from "@/lib/modules/pos/device-shared";
import { Chip, InlineNote, SwitchKnob, TabHead } from "./settings-ui";

type Props = { systemId: string; unitId: string; shopName: string };
type ListOk = { items: PosDeviceListItem[]; limit: number; activeCount: number };

const ERROR_KEY: Record<string, string> = {
  NOT_FOUND: "notFound",
  PERMISSION_DENIED: "permissionDenied",
  VALIDATION: "validation",
  DEVICE_REVOKED: "deviceRevoked",
  DEVICE_LIMIT: "deviceLimit",
  DEVICE_NOT_FOUND: "deviceNotFound",
  INTERNAL: "internal",
};
const errKey = (code: string | undefined) => `errors.${ERROR_KEY[code ?? "INTERNAL"] ?? "internal"}`;
const MODE_CHIP: Record<PosPrinterConfig["mode"], string> = { browser: "modeBrowser", "escpos-usb": "modeUsb", "escpos-bt": "modeBt" };

/** เวลาไทย HH:MM */
function bkkHm(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 3600000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
const shortCode = (code: string) => (code.length > 10 ? `…${code.slice(-6)}` : code);

/** กล่องกลางจอ (390 = แผ่นล่าง) · Esc ปิด */
function DialogBox({ testid, labelledBy, onClose, children }: { testid: string; labelledBy: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" role="presentation">
      <div
        data-testid={testid}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="flex w-full flex-col gap-4 rounded-t-[18px] bg-[color:var(--color-surface)] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 shadow-xl md:w-[440px] md:rounded-[18px] md:px-7 md:py-6"
      >
        {children}
      </div>
    </div>
  );
}

export function DeviceSettings({ systemId, unitId, shopName }: Props) {
  const t = useTranslations("pos.settings");
  const td = useTranslations("pos.device");
  const tr = useTranslations("pos.settings.receipt");
  const locale: "th" | "en" = useLocale().startsWith("en") ? "en" : "th";
  const [list, setList] = useState<ListOk | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [thisCode, setThisCode] = useState<string | undefined>(undefined);
  const [selId, setSelId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [regOpen, setRegOpen] = useState(false);
  const [regName, setRegName] = useState("");
  const [regErr, setRegErr] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [regNoDraft, setRegNoDraft] = useState("");
  const [pairing, setPairing] = useState<PrinterPairing | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [printRes, setPrintRes] = useState<PrintResult | null>(null);

  const load = useCallback(
    async (keepSel?: string | null) => {
      setLoadErr(null);
      const r = await listDevicesAction({ systemId, unitId }).catch(() => null);
      if (!r || !r.ok) {
        setLoadErr(td(errKey(r?.code)));
        return;
      }
      setList({ items: r.items, limit: r.limit, activeCount: r.activeCount });
      const code = getPosDeviceId();
      setThisCode(code);
      setPairing(readPairing(code));
      const want = keepSel ?? null;
      const pick = r.items.find((d) => d.id === want) ?? r.items.find((d) => d.deviceCode === code && d.status === "ACTIVE") ?? r.items.find((d) => d.status === "ACTIVE") ?? r.items[0] ?? null;
      setSelId(pick?.id ?? null);
    },
    [systemId, unitId, td],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const sel = useMemo(() => list?.items.find((d) => d.id === selId) ?? null, [list, selId]);
  useEffect(() => {
    setNameDraft(sel?.name ?? "");
    setRegNoDraft(sel?.posRegNo ?? "");
  }, [sel?.id, sel?.name, sel?.posRegNo]);

  const mine = list?.items.find((d) => d.deviceCode === thisCode) ?? null;
  const atLimit = !!list && list.activeCount >= list.limit;

  const replace = (d: PosDeviceListItem) => setList((l) => (l ? { ...l, items: l.items.map((x) => (x.id === d.id ? d : x)) } : l));

  /** แก้เครื่องที่เลือก — printerConfig ส่งทั้งก้อน */
  const patch = async (p: { name?: string; posRegNo?: string | null; printerConfig?: PosPrinterConfig }) => {
    if (!sel || sel.status !== "ACTIVE" || busy) return;
    setBusy(true);
    setErr(null);
    setNote(null);
    try {
      const r = await updateDeviceAction({ systemId, unitId, patch: { id: sel.id, ...p } });
      if (r.ok) {
        replace({ ...sel, ...r.device });
        setNote(td("saved"));
      } else setErr(td(errKey(r.code)));
    } catch {
      setErr(td("errors.internal"));
    } finally {
      setBusy(false);
    }
  };
  const cfg = (k: keyof PosPrinterConfig, v: PosPrinterConfig[keyof PosPrinterConfig]) => sel && void patch({ printerConfig: { ...sel.printerConfig, [k]: v } as PosPrinterConfig });

  const openRegister = () => {
    setRegName(td("registerNameDefault", { n: (list?.activeCount ?? 0) + 1 }));
    setRegErr(null);
    setRegOpen(true);
  };
  const submitRegister = async () => {
    const name = regName.trim();
    const code = getPosDeviceId();
    if (!name || [...name].length > POS_DEVICE_NAME_MAX) return setRegErr(td("nameRequired"));
    if (!code) return setRegErr(td("errors.validation"));
    setBusy(true);
    setRegErr(null);
    try {
      const r = await registerDeviceAction({ systemId, unitId, name, deviceCode: code });
      if (r.ok) {
        setRegOpen(false);
        setNote(td("registeredDone"));
        await load(r.device.id);
      } else setRegErr(td(errKey(r.code)));
    } catch {
      setRegErr(td("errors.internal"));
    } finally {
      setBusy(false);
    }
  };
  const closeRegister = useCallback(() => setRegOpen(false), []);
  const closeRevoke = useCallback(() => setRevokeOpen(false), []);
  const submitRevoke = async () => {
    if (!sel) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await revokeDeviceAction({ systemId, unitId, id: sel.id });
      setRevokeOpen(false);
      if (r.ok) {
        setNote(td("revokedDone"));
        await load(sel.id);
      } else setErr(td(errKey(r.code)));
    } catch {
      setErr(td("errors.internal"));
    } finally {
      setBusy(false);
    }
  };

  const closePair = useCallback(() => setPairOpen(false), []);
  // ทดสอบพิมพ์: ใบทดสอบผ่านวิธีพิมพ์ของเครื่องที่เลือก (ESC/POS ใช้ข้อมูลจับคู่ของรหัสเครื่องนั้นในเบราว์เซอร์นี้)
  const testPrint = async (forceBrowser = false) => {
    if (!sel) return;
    setPrintRes(null);
    const p = samplePayload({
      header: { name: shopName },
      footer: td("testPrint"),
      showPoints: false,
      showCashier: false,
      book: null,
      text: { latte: tr("sampleLatte"), croissant: tr("sampleCroissant"), cashier: tr("sampleCashier"), member: tr("sampleMember") },
      receiptNo: td("testPrint"),
      issuedAt: new Date().toISOString(),
      copy: false,
      device: { name: sel.name, posRegNo: sel.posRegNo },
    });
    setBusy(true);
    try {
      setPrintRes(await printReceipt(p, forceBrowser ? { ...sel.printerConfig, mode: "browser" } : sel.printerConfig, { locale, deviceCode: sel.deviceCode }));
    } finally {
      setBusy(false);
    }
  };

  if (loadErr)
    return (
      <div data-testid="pos-device-load-error" role="alert" className="flex flex-col items-start gap-3 text-[14.5px]">
        <p>{loadErr}</p>
        <button data-testid="pos-device-retry" type="button" className="btn btn-ghost h-11 rounded-[13px] px-5" onClick={() => void load(selId)}>
          {t("retry")}
        </button>
      </div>
    );
  if (!list)
    return (
      <p data-testid="pos-device-loading" className="text-[14px] text-[color:var(--color-muted)]">
        {t("loading")}
      </p>
    );

  const isMine = !!sel && sel.deviceCode === thisCode;
  const seg = (on: boolean) =>
    `inline-flex min-h-11 items-center justify-center rounded-[10px] px-4 text-[15px] ${on ? "bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]" : "text-[color:var(--color-ink-soft)]"} disabled:opacity-60`;
  const swRow = (label: string, hint: string | null, node: ReactNode) => (
    <div className="flex items-center gap-4 border-t py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <b className="block text-[15px] font-semibold">{label}</b>
        {hint && <small className="block text-[12.5px] text-[color:var(--color-muted)]">{hint}</small>}
      </div>
      {node}
    </div>
  );
  const pairLine = () => {
    if (!sel) return null;
    if (sel.printerConfig.mode === "browser") return td("browserModeHint");
    if (!isMine) return td("pairOnThatDevice");
    return pairingMatches(pairing, sel.printerConfig.mode) && pairing ? td("pairedLine", { name: pairing.productName }) : td("notPaired");
  };

  return (
    <div data-testid="pos-settings-devices" className="flex min-w-0 flex-col gap-6 md:gap-8">
      <TabHead title={td("tabTitle")} desc={td("subtitle")}>
        <button
          data-testid="pos-device-register"
          type="button"
          className="btn btn-primary h-11 gap-2 rounded-[11px] px-4 text-[14px] font-semibold disabled:opacity-50"
          disabled={!!mine || atLimit || busy || !thisCode}
          onClick={openRegister}
        >
          <RegisterIcon name={mine ? "check" : "plus"} size={15} />
          {mine ? (mine.status === "ACTIVE" ? td("alreadyRegistered") : td("revokedChip")) : td("register")}
        </button>
      </TabHead>
      {!mine && atLimit && (
        <InlineNote tone="error" testid="pos-device-limit">
          {td("limitReached", { limit: list.limit })}
        </InlineNote>
      )}
      {err && (
        <InlineNote tone="error" testid="pos-device-error">
          {err}
        </InlineNote>
      )}
      {note && !err && (
        <InlineNote tone="ok" testid="pos-device-note">
          {note}
        </InlineNote>
      )}

      <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-4 md:gap-5">
          {list.items.length === 0 && (
            <p data-testid="pos-device-empty" className="rounded-[18px] border px-6 py-8 text-center text-[14.5px] text-[color:var(--color-muted)]">
              {td("empty")}
            </p>
          )}
          {list.items.map((d) => {
            const on = d.id === selId;
            const revoked = d.status === "REVOKED";
            return (
              <button
                key={d.id}
                data-testid={`pos-device-card-${d.id}`}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setSelId(d.id);
                  setErr(null);
                  setNote(null);
                  setPrintRes(null);
                }}
                className={`flex w-full flex-col gap-[14px] rounded-[18px] border bg-[color:var(--color-surface)] px-5 py-5 text-left md:px-6 ${
                  on ? "border-[color:var(--color-accent)] shadow-[inset_0_0_0_1px_var(--color-accent)]" : ""
                } ${revoked ? "opacity-60" : ""}`}
              >
                <span className="flex items-center gap-[14px]">
                  <span className="grid size-11 shrink-0 place-items-center rounded-[12px] border bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-soft)]">
                    <RegisterIcon name={revoked ? "x" : "cash"} size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[16.5px] font-bold">{d.name}</b>
                    <small className="block truncate text-[13px] text-[color:var(--color-muted)]">
                      {[d.posRegNo, td("codeShort", { code: shortCode(d.deviceCode) }), d.deviceCode === thisCode ? td("thisDevice") : null].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                  {revoked ? (
                    <Chip tone="danger">{td("revokedChip")}</Chip>
                  ) : d.online ? (
                    <span className="inline-flex items-center gap-[6px] text-[13.5px] font-semibold">
                      <span aria-hidden className="size-2 rounded-full bg-[color:var(--color-ink)]" />
                      {td("online")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-[6px] text-[13px] text-[color:var(--color-muted)]">
                      <span aria-hidden className="size-2 rounded-full bg-[color:var(--color-line)]" />
                      {d.lastSeenAt ? td("lastSeen", { time: bkkHm(d.lastSeenAt) }) : td("neverSeen")}
                    </span>
                  )}
                </span>
                <span className="text-[13.5px] text-[color:var(--color-ink-soft)]">
                  {d.openShift ? td("shiftLine", { no: d.openShift.shiftNo, time: bkkHm(d.openShift.openedAt) }) : td("noShift")}
                </span>
                {!revoked && (
                  <span className="flex flex-wrap gap-2">
                    <Chip>
                      <RegisterIcon name="print" size={13} />
                      {td(MODE_CHIP[d.printerConfig.mode])} · {d.printerConfig.paper === "58" ? td("paper58") : td("paper80")}
                      {d.deviceCode === thisCode && pairingMatches(pairing, d.printerConfig.mode) ? <RegisterIcon name="check" size={12} /> : null}
                    </Chip>
                    <Chip tone={d.printerConfig.drawerKick ? "plain" : "muted"}>
                      <RegisterIcon name="cash" size={13} />
                      {d.printerConfig.drawerKick ? td("drawerOn") : td("drawerOff")}
                      {d.printerConfig.drawerKick ? <RegisterIcon name="check" size={12} /> : null}
                    </Chip>
                  </span>
                )}
              </button>
            );
          })}
          <p data-testid="pos-device-other" className="flex min-h-[64px] items-center justify-center gap-3 rounded-[18px] border border-dashed bg-[color:var(--color-surface-2)] px-5 py-4 text-center text-[14px] font-semibold text-[color:var(--color-ink-soft)]">
            <RegisterIcon name="plus" size={15} />
            {td("otherDevice")}
          </p>
        </div>

        <div data-testid="pos-device-panel" className="flex min-w-0 flex-col rounded-[18px] border bg-[color:var(--color-surface)] px-5 py-5 md:px-7 md:py-6 lg:w-[400px] lg:shrink-0 xl:w-[430px]">
          {!sel ? (
            <p className="text-[14px] text-[color:var(--color-muted)]">{td("selectHint")}</p>
          ) : (
            <>
              <div className="mb-5 flex items-center gap-3">
                <RegisterIcon name="print" size={17} />
                <h2 className="min-w-0 flex-1 truncate text-[17px] font-bold">{td("panelTitle", { name: sel.name })}</h2>
                {sel.posRegNo && <span className="rounded-[8px] border-[1.5px] border-[color:var(--color-ink)] px-[10px] py-[3px] font-mono text-[13px] font-bold">{sel.posRegNo}</span>}
              </div>
              {sel.status === "REVOKED" ? (
                <p data-testid="pos-device-revoked-note" className="text-[14px] text-[color:var(--color-muted)]">
                  {td("errors.deviceRevoked")}
                </p>
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="flex min-w-0 flex-col gap-2">
                      <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{td("name")}</span>
                      <input
                        data-testid="pos-device-name"
                        className="input h-12 w-full rounded-[13px] px-4 text-[15px]"
                        value={nameDraft}
                        maxLength={POS_DEVICE_NAME_MAX}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onBlur={() => {
                          const v = nameDraft.trim();
                          if (v && v !== sel.name) void patch({ name: v });
                          else setNameDraft(sel.name);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-2">
                      <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{td("posRegNo")}</span>
                      <input
                        data-testid="pos-device-regno"
                        className="input h-12 w-full rounded-[13px] px-4 font-mono text-[15px]"
                        value={regNoDraft}
                        maxLength={POS_REG_NO_MAX}
                        placeholder={tr("posRegNoPlaceholder")}
                        onChange={(e) => setRegNoDraft(e.target.value)}
                        onBlur={() => {
                          const v = regNoDraft.trim();
                          if (v !== (sel.posRegNo ?? "")) void patch({ posRegNo: v || null });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                      />
                    </label>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-[13px] font-bold text-[color:var(--color-ink-soft)]">{td("paper")}</span>
                    <div role="radiogroup" aria-label={td("paper")} className="flex gap-1 rounded-[13px] border bg-[color:var(--color-surface-2)] p-1">
                      <button data-testid="pos-device-paper-58" type="button" role="radio" aria-checked={sel.printerConfig.paper === "58"} disabled={busy} className={seg(sel.printerConfig.paper === "58")} onClick={() => cfg("paper", "58")}>
                        {td("paper58")}
                      </button>
                      <button data-testid="pos-device-paper-80" type="button" role="radio" aria-checked={sel.printerConfig.paper === "80"} disabled={busy} className={seg(sel.printerConfig.paper === "80")} onClick={() => cfg("paper", "80")}>
                        {td("paper80")}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 border-t pt-5">
                    <span className="text-[13px] font-bold text-[color:var(--color-ink-soft)]">{td("mode")}</span>
                    <div role="radiogroup" aria-label={td("mode")} className="flex gap-1 rounded-[13px] border bg-[color:var(--color-surface-2)] p-1">
                      <button data-testid="pos-device-mode-bt" type="button" role="radio" aria-checked={sel.printerConfig.mode === "escpos-bt"} disabled={busy} className={`${seg(sel.printerConfig.mode === "escpos-bt")} flex-1`} onClick={() => cfg("mode", "escpos-bt")}>
                        {td("modeOptBt")}
                      </button>
                      <button data-testid="pos-device-mode-usb" type="button" role="radio" aria-checked={sel.printerConfig.mode === "escpos-usb"} disabled={busy} className={`${seg(sel.printerConfig.mode === "escpos-usb")} flex-1`} onClick={() => cfg("mode", "escpos-usb")}>
                        {td("modeOptUsb")}
                      </button>
                      <button data-testid="pos-device-mode-browser" type="button" role="radio" aria-checked={sel.printerConfig.mode === "browser"} disabled={busy} className={`${seg(sel.printerConfig.mode === "browser")} flex-1`} onClick={() => cfg("mode", "browser")}>
                        {td("modeOptBrowser")}
                      </button>
                    </div>
                    <span className="flex flex-wrap items-center gap-2">
                      <span data-testid="pos-device-pair-line" className="min-w-0 flex-1 text-[13.5px] text-[color:var(--color-muted)]">
                        {pairLine()}
                      </span>
                      {isMine && sel.printerConfig.mode !== "browser" && (
                        <button data-testid="pos-device-pair" type="button" className="btn btn-ghost h-11 rounded-[11px] px-4 text-[14px]" onClick={() => setPairOpen(true)}>
                          {td("pair")}
                        </button>
                      )}
                    </span>
                    {sel.printerConfig.mode !== "browser" && (
                      <label className="mt-1 flex items-center gap-3">
                        <span className="min-w-0 flex-1 text-[14px]">{td("thaiText")}</span>
                        <select
                          data-testid="pos-device-thai-text"
                          className="input h-11 w-auto rounded-[10px] px-3 text-[14px]"
                          value={sel.printerConfig.thaiText}
                          disabled={busy}
                          onChange={(e) => cfg("thaiText", e.target.value === "tis620" ? "tis620" : "raster")}
                        >
                          <option value="raster">{td("thaiRaster")}</option>
                          <option value="tis620">{td("thaiTis")}</option>
                        </select>
                      </label>
                    )}
                  </div>

                  <div className="flex flex-col border-t pt-2">
                    {swRow(
                      td("autoPrint"),
                      td("autoPrintHint"),
                      <button data-testid="pos-device-auto-print" type="button" role="switch" aria-checked={sel.printerConfig.autoPrint} aria-label={td("autoPrint")} disabled={busy} className="grid min-h-11 min-w-11 place-items-center" onClick={() => cfg("autoPrint", !sel.printerConfig.autoPrint)}>
                        <SwitchKnob on={sel.printerConfig.autoPrint} />
                      </button>,
                    )}
                    {swRow(
                      td("drawerKick"),
                      null,
                      <button data-testid="pos-device-drawer-kick" type="button" role="switch" aria-checked={sel.printerConfig.drawerKick} aria-label={td("drawerKick")} disabled={busy} className="grid min-h-11 min-w-11 place-items-center" onClick={() => cfg("drawerKick", !sel.printerConfig.drawerKick)}>
                        <SwitchKnob on={sel.printerConfig.drawerKick} />
                      </button>,
                    )}
                    {swRow(
                      td("copies"),
                      td("copiesHint"),
                      <button data-testid="pos-device-copies" type="button" role="switch" aria-checked={sel.printerConfig.copies === 2} aria-label={td("copies")} disabled={busy} className="grid min-h-11 min-w-11 place-items-center" onClick={() => cfg("copies", sel.printerConfig.copies === 2 ? 1 : 2)}>
                        <SwitchKnob on={sel.printerConfig.copies === 2} />
                      </button>,
                    )}
                  </div>

                  <PrintStatus result={printRes} onRetry={() => void testPrint()} onBrowser={() => void testPrint(true)} />
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
                    <button data-testid="pos-device-test-print" type="button" className="btn btn-ghost h-12 gap-2 rounded-[13px] px-5 text-[15px]" disabled={busy} onClick={() => void testPrint()}>
                      <RegisterIcon name="print" size={15} />
                      {td("testPrint")}
                    </button>
                    <button
                      data-testid="pos-device-revoke"
                      type="button"
                      className="btn btn-ghost h-12 rounded-[13px] px-5 text-[15px] text-[color:var(--color-danger)]"
                      disabled={busy}
                      onClick={() => setRevokeOpen(true)}
                    >
                      {td("revoke")}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {regOpen && (
        <DialogBox testid="pos-device-register-dialog" labelledBy="pos-device-register-title" onClose={closeRegister}>
          <h2 id="pos-device-register-title" className="text-[18px] font-bold">
            {td("registerTitle")}
          </h2>
          <p className="text-[13.5px] text-[color:var(--color-muted)]">{td("registerHint")}</p>
          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{td("registerName")}</span>
            <input data-testid="pos-device-register-name" className="input h-12 rounded-[13px] px-4 text-[15px]" value={regName} maxLength={POS_DEVICE_NAME_MAX} autoFocus onChange={(e) => setRegName(e.target.value)} />
          </label>
          {regErr && (
            <InlineNote tone="error" testid="pos-device-register-error">
              {regErr}
            </InlineNote>
          )}
          <div className="flex justify-end gap-2">
            <button data-testid="pos-device-register-cancel" type="button" className="btn btn-ghost h-11 rounded-[11px] px-5" onClick={closeRegister}>
              {td("cancel")}
            </button>
            <button data-testid="pos-device-register-confirm" type="button" className="btn btn-primary h-11 rounded-[11px] px-5 font-semibold" disabled={busy} onClick={() => void submitRegister()}>
              {td("registerConfirm")}
            </button>
          </div>
        </DialogBox>
      )}
      {pairOpen && sel && (
        <PrinterPairDialog mode={sel.printerConfig.mode} deviceCode={sel.deviceCode} onClose={closePair} onPaired={(p) => setPairing(p)} />
      )}
      {revokeOpen && sel && (
        <DialogBox testid="pos-device-revoke-dialog" labelledBy="pos-device-revoke-title" onClose={closeRevoke}>
          <h2 id="pos-device-revoke-title" className="text-[18px] font-bold">
            {td("revokeTitle", { name: sel.name })}
          </h2>
          <p className="text-[14.5px] text-[color:var(--color-ink-soft)]">{td("revokeBody")}</p>
          <div className="flex justify-end gap-2">
            <button data-testid="pos-device-revoke-cancel" type="button" className="btn btn-ghost h-11 rounded-[11px] px-5" onClick={closeRevoke}>
              {td("cancel")}
            </button>
            <button
              data-testid="pos-device-revoke-confirm"
              type="button"
              className="btn h-11 rounded-[11px] bg-[color:var(--color-danger)] px-5 font-semibold text-white"
              disabled={busy}
              onClick={() => void submitRevoke()}
            >
              {td("revokeConfirm")}
            </button>
          </div>
        </DialogBox>
      )}
    </div>
  );
}
