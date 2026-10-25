"use client";

// DeviceSettings.tsx — POS P1.10 U แท็บ "เครื่องและเครื่องพิมพ์" (ภาพ 17B · brief §3)
//   หัว: ชื่อ · คำอธิบาย · "ลงทะเบียนเครื่องนี้" (รหัสเครื่องของเบราว์เซอร์นี้ = deviceCode · ลงแล้ว = ปุ่มปิด · ครบเพดาน = ข้อความในบรรทัด)
//   ซ้าย: การ์ดเครื่อง (ชื่อ · เลขเครื่อง POS · "เครื่อง <รหัสย่อ>" · ออนไลน์ · กะที่เปิด · ชิปวิธีพิมพ์/ลิ้นชัก) — เพิกถอนแล้ว = จาง + ชิป
//   ขวา: ตั้งค่าเครื่องที่เลือก (ชื่อ · เลขเครื่อง POS · กระดาษ 58/80 · วิธีเชื่อม Bluetooth/USB/เบราว์เซอร์ · จับคู่ (เบราว์เซอร์นี้) ·
//        ภาษาไทยบนเครื่องพิมพ์ · พิมพ์อัตโนมัติ · ลิ้นชัก · สำเนาให้ร้าน · ทดสอบพิมพ์ · เพิกถอน (กล่องยืนยัน))
// 🔴 printerConfig ส่ง "ทั้งก้อน" ทุกครั้ง (เซิร์ฟเวอร์รวมให้ก็จริง แต่จอไม่พึ่ง) · คีย์ = เฉพาะที่ parsePrinterConfig รับ (mode ไม่ใช่ transport)
// 🔴 ข้อมูลจับคู่ฮาร์ดแวร์อยู่ใน localStorage ต่อรหัสเครื่อง (มติ CD2) — จับคู่ได้เฉพาะเครื่องของเบราว์เซอร์นี้
// 🔴 คำปฏิเสธแสดงผ่านคีย์ pos.device.errors.* · ไม่ทำในใบนี้: ใบครัวพิมพ์ที่ (P2) · QR ลงทะเบียนเครื่องอื่น (P1.18)
// POS P2.10 ▸ ตั้งจอลูกค้า = CustomerDisplayBlock ท้ายไฟล์ (คีย์ pos.display.settings.* · pos.display.errors.*) ◂

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"; // POS P2.10 ▸ fix2 G2: useRef (ตัวนับคำขอของจอลูกค้า) ◂
import { useLocale, useTranslations } from "next-intl";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { pairingMatches, readPairing } from "@/components/pos/print/pairing";
import { PrinterPairDialog } from "@/components/pos/print/PrinterPairDialog";
import { PrintStatus } from "@/components/pos/print/PrintStatus";
import { printReceipt } from "@/components/pos/print/printReceipt";
import { samplePayload } from "@/components/pos/print/sample-payload";
import type { PrinterPairing, PrintResult } from "@/components/pos/print/types";
import { devicePairingAction, listDevicesAction, registerDeviceAction, revokeDeviceAction, updateDeviceAction } from "@/lib/modules/pos/device-actions"; // POS P5.2 ▸ + devicePairingAction (D1) ◂
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
import { POS_DEVICE_NAME_MAX, POS_REG_NO_MAX, type PosDeviceListItem, type PosPrinterConfig } from "@/lib/modules/pos/device-shared";
// POS P2.6U ▸ มติ 9e (ภาพ 17B): ใบครัวของเครื่อง (kitchenSlipSettings · ตัวเขียน = updateDeviceAction เดิม) + สถานีจาก kdsStationsAction (fix1 F3) · ลิงก์จอครัว (มติ 1) ◂
import Link from "next/link";
import { kitchenSlipSettings } from "@/lib/modules/pos/device-shared";
import { kdsStationsAction } from "@/lib/modules/pos/kds-actions"; // fix1 F3: ตัวอ่านสถานีเฉย ๆ (ไม่ heal/ไม่คิดบอร์ด)
import { Chip, InlineNote, SwitchKnob, TabHead } from "./settings-ui";
// POS P2.10 ▸ บล็อก "จอลูกค้า" ของเครื่องที่เลือก (สถานะ · รหัส + QR + เวลาเหลือ · เปิด/ยกเลิก · แสดงแต้ม · ข้อความหน้าพัก · ภาษา) ◂
import QRCode from "qrcode";
import { customerDisplayStatusAction, enableCustomerDisplayAction, revokeCustomerDisplayAction, updateCustomerDisplaySettingsAction } from "@/lib/modules/pos/display-actions";
import { DISPLAY_IDLE_TEXT_MAX, displayErrorKey, type CustomerDisplayStatusView, type DisplayLocale } from "@/lib/modules/pos/display-shared";
// POS P3-SKEL U ▸ CD-SKELU-9: การ์ดตัวช่วยพิมพ์ LAN + โหมด escpos-lan + วิทยุใบครัว LAN (ชื่อเรียกเดิม · สถานะจาก lanStateOf กติกาเดียวกับทางพิมพ์) ◂
import { POS_PRINTER_MODE_LAN } from "@/lib/modules/pos/device-shared";
import type { PrintAgentView } from "@/lib/modules/pos/print-relay";
import { lanStateOf } from "@/components/pos/print/lan";
import { LanAgentsCard } from "./LanAgentsCard";

type Props = { systemId: string; unitId: string; shopName: string; /** POS P3-SKEL U ▸ CD-SKELU-9: ตัวช่วยพิมพ์ของสาขา (หน้าเพจอ่าน listPrintAgents) + พอร์ตที่รับ ◂ */ lan?: { agents: PrintAgentView[]; ports: readonly number[] } | null };
type ListOk = { items: PosDeviceListItem[]; limit: number; activeCount: number };

const ERROR_KEY: Record<string, string> = {
  NOT_FOUND: "notFound",
  PERMISSION_DENIED: "permissionDenied",
  VALIDATION: "validation",
  DEVICE_REVOKED: "deviceRevoked",
  DEVICE_LIMIT: "deviceLimit",
  DEVICE_NOT_FOUND: "deviceNotFound",
  DEVICE_KEY_UNSET: "deviceKeyUnset", // POS P5.2 ▸ D1 ◂
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

/** POS P2.6U ▸ fix1 V6: วงกลมของแถวเลือก (radio) ◂ */
function RadioDot({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${on ? "border-[color:var(--color-ink)]" : "border-[color:var(--color-line)]"}`}>
      {on ? <span className="size-2.5 rounded-full bg-[color:var(--color-ink)]" /> : null}
    </span>
  );
}
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

export function DeviceSettings({ systemId, unitId, shopName, lan = null /* POS P3-SKEL U ◂ */ }: Props) {
  const t = useTranslations("pos.settings");
  const td = useTranslations("pos.device");
  // POS P3-SKEL U ▸ CD-SKELU-9: รายการตัวช่วยพิมพ์ (โหลดครั้งเดียวจากหน้าเพจ · ลงทะเบียน/เพิกถอนแก้ในที่) ◂
  const tpl = useTranslations("pos.platform");
  const [lanAgents, setLanAgents] = useState<PrintAgentView[]>(lan?.agents ?? []);
  const lanReceipt = lanStateOf(lanAgents, "receipt");
  const lanKitchen = lanStateOf(lanAgents, "kitchen");
  const tr = useTranslations("pos.settings.receipt");
  const locale: "th" | "en" = useLocale().startsWith("en") ? "en" : "th";
  const [list, setList] = useState<ListOk | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [thisCode, setThisCode] = useState<string | undefined>(undefined);
  const [selId, setSelId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRevoked, setShowRevoked] = useState(false); // POS HF-P1CLOSE ▸ O7 แถวพับเครื่องเพิกถอน ◂
  const [regOpen, setRegOpen] = useState(false);
  const [regName, setRegName] = useState("");
  const [regErr, setRegErr] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [regNoDraft, setRegNoDraft] = useState("");
  const [pairing, setPairing] = useState<PrinterPairing | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  // POS P5.2 ▸ D1 (CD-P52-O2-3): กุญแจคุกกี้เครื่องตั้งแล้วไหม + เบราว์เซอร์นี้จับคู่กับเครื่องไหน (null = ยังไม่รู้) ◂
  const [pairState, setPairState] = useState<{ keyConfigured: boolean; pairedDeviceId: string | null } | null>(null);
  const [printRes, setPrintRes] = useState<PrintResult | null>(null);
  // POS P2.6U ▸ มติ 9e: สถานีครัวของสาขา (สำหรับช่องติ๊กใบครัว) — อ่านไม่ได้/ไม่มีครัว = [] ◂
  const [kStations, setKStations] = useState<{ id: string; name: string; nameEn: string | null }[] | null>(null);
  useEffect(() => {
    let live = true;
    void kdsStationsAction({ systemId, unitId })
      .then((r) => live && setKStations(r && r.ok === true ? r.stations : []))
      .catch(() => live && setKStations([]));
    return () => {
      live = false;
    };
  }, [systemId, unitId]);

  const load = useCallback(
    async (keepSel?: string | null) => {
      setLoadErr(null);
      const r = await listDevicesAction({ systemId, unitId }).catch(() => null);
      if (!r || !r.ok) {
        setLoadErr(td(errKey(r?.code)));
        return;
      }
      setList({ items: r.items, limit: r.limit, activeCount: r.activeCount });
      // POS P5.2 ▸ D1: สถานะจับคู่ (อ่านไม่ได้ = ไม่แสดงการ์ด/ปุ่มจับคู่) ◂
      void devicePairingAction({ systemId, unitId })
        .then((p) => setPairState(p && p.ok ? { keyConfigured: p.keyConfigured, pairedDeviceId: p.pairedDeviceId } : null))
        .catch(() => setPairState(null));
      const code = getPosDeviceId();
      setThisCode(code);
      setPairing(readPairing(code));
      const want = keepSel ?? null;
      // HF-P1CLOSE fix รอบ 1 F6: เลือกเครื่อง ACTIVE ก่อนเสมอ (ที่เลือกไว้ → เครื่องนี้ → ตัวแรก) · เครื่องเพิกถอนแล้ว = เฉพาะเมื่อไม่มี ACTIVE เลย
      //   (แล้วกางแถวพับ "เพิกถอนแล้ว (n)" ให้การ์ดที่เลือกมองเห็น) ◂
      const active = (d: PosDeviceListItem) => d.status === "ACTIVE";
      const pick =
        r.items.find((d) => d.id === want && active(d)) ??
        r.items.find((d) => d.deviceCode === code && active(d)) ??
        r.items.find(active) ??
        r.items.find((d) => d.id === want) ??
        r.items[0] ??
        null;
      setSelId(pick?.id ?? null);
      if (pick && !active(pick)) setShowRevoked(true);
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
  // POS P5.2 ▸ D1: เครื่องนี้ลงทะเบียนแล้วแต่เบราว์เซอร์นี้ยังไม่มีคุกกี้ของมัน (เช่น ลงก่อนมีการจับคู่) ⇒ ปุ่มจับคู่เบราว์เซอร์นี้ (registerDeviceAction รหัสเดิม) ◂
  const needsPair = !!mine && mine.status === "ACTIVE" && !!pairState && pairState.keyConfigured && pairState.pairedDeviceId !== mine.id;

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
  // POS P5.2 ▸ D1: จับคู่เบราว์เซอร์นี้กับเครื่องที่ลงทะเบียนไว้แล้ว (ชื่อเดิม · ได้คุกกี้เครื่องใหม่) ◂
  const pairThis = async () => {
    if (!mine || !thisCode || busy) return;
    setBusy(true);
    setErr(null);
    setNote(null);
    try {
      const r = await registerDeviceAction({ systemId, unitId, name: mine.name, deviceCode: thisCode });
      if (r.ok) {
        setNote(td("pairedHere"));
        await load(r.device.id);
      } else setErr(td(errKey(r.code)));
    } catch {
      setErr(td("errors.internal"));
    } finally {
      setBusy(false);
    }
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
      setPrintRes(await printReceipt(p, forceBrowser ? { ...sel.printerConfig, mode: "browser" } : sel.printerConfig, { locale, deviceCode: sel.deviceCode, kickDrawer: false, lan: { systemId, unitId } /* POS P3-SKEL U ▸ CD-SKELU-9 ◂ */ }));
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
  // POS P3-SKEL U ▸ CD-SKELU-9: เครื่องที่เลือกพิมพ์ผ่านแลน (escpos-lan · ชนิดเดิมไม่มีค่านี้ ⇒ เทียบเป็นสตริง) ◂
  const isLan = !!sel && (sel.printerConfig.mode as string) === POS_PRINTER_MODE_LAN;
  const lanReason = lanReceipt.state === "none" ? tpl("print.agentNone") : lanReceipt.state === "many" ? tpl("print.agentMany") : lanReceipt.state === "noPrinter" ? tpl("print.agentNoPrinter") : null;
  const pairLine = () => {
    if (!sel) return null;
    if (isLan) return lanReceipt.state === "ok" ? tpl("print.viaAgent", { name: lanReceipt.agent.name, printer: `${lanReceipt.printer.host}:${lanReceipt.printer.port}` }) : lanReason; // POS P3-SKEL U ◂
    if (sel.printerConfig.mode === "browser") return td("browserModeHint");
    if (!isMine) return td("pairOnThatDevice");
    return pairingMatches(pairing, sel.printerConfig.mode) && pairing ? td("pairedLine", { name: pairing.productName }) : td("notPaired");
  };
  const activeItems = list.items.filter((d) => d.status !== "REVOKED");
  const revokedItems = list.items.filter((d) => d.status === "REVOKED");
  // POS HF-P1CLOSE ▸ O7: การ์ดเครื่อง 1 ใบ (ใช้ทั้งรายการเครื่องที่ใช้งานและแถวพับ "เพิกถอนแล้ว (n)") ◂
  const deviceCard = (d: PosDeviceListItem) => {
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
              {(d.printerConfig.mode as string) === POS_PRINTER_MODE_LAN ? tpl("print.modeLanChip") : td(MODE_CHIP[d.printerConfig.mode]) /* POS P3-SKEL U ▸ CD-SKELU-9 ◂ */} · {d.printerConfig.paper === "58" ? td("paper58") : td("paper80")}
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
  };

  return (
    <div data-testid="pos-settings-devices" className="flex min-w-0 flex-col gap-6 md:gap-8">
      <TabHead title={td("tabTitle")} desc={td("subtitle")}>
        {/* POS P2.6U ▸ มติ 1: ทางเข้าจอครัวจากหน้าเครื่อง ◂ */}
        <Link data-testid="pos-device-kds-link" href={`/app/sys/${systemId}/pos/kds?unit=${encodeURIComponent(unitId)}`} className="btn btn-ghost h-11 gap-2 rounded-[11px] px-4 text-[14px] font-semibold">
          {td("kitchen.openKds")}
        </Link>
        {needsPair ? (
          <button data-testid="pos-device-pair-this" type="button" className="btn btn-primary h-11 gap-2 rounded-[11px] px-4 text-[14px] font-semibold disabled:opacity-50" disabled={busy} onClick={() => void pairThis()}>
            <RegisterIcon name="plus" size={15} />
            {td("pairThis")}
          </button>
        ) : (
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
        )}
      </TabHead>
      {pairState && !pairState.keyConfigured && (
        <InlineNote tone="error" testid="pos-device-key-unset">
          {td("keyUnset")}
        </InlineNote>
      )}
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

      {/* POS P4.3 fix8 ▸ CD-P43-15 · fix8b ▸ CD-P43-15b: สองคอลัมน์เมื่อช่องเนื้อหา (@container ของ SettingsShell) ≥ 762px = ซ้าย ≥ 300 + ช่องไฟ 32 + แผง 430 ·
          เดิม lg:flex-row + แผง lg:w-[400px] — ที่ 1024 ช่องเหลือ 398px ⇒ คอลัมน์ซ้ายติดลบ (การ์ด LAN เหลือ ~60px คำละบรรทัด · walker owner-ipad) ·
          แถบเมนูกาง: 1024 (398) / 1280 (638, เดิมซ้าย 176) ⇒ ซ้อนบน-ล่าง · 1440 (798) ⇒ สองคอลัมน์ ซ้าย 336 ตามภาพที่อนุมัติ (CD-P43-15b) ◂ */}
      <div className="flex min-w-0 flex-col gap-6 @min-[762px]:flex-row @min-[762px]:items-start @min-[762px]:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-4 md:gap-5">
          {activeItems.length === 0 && (
            <p data-testid="pos-device-empty" className="rounded-[18px] border px-6 py-8 text-center text-[14.5px] text-[color:var(--color-muted)]">
              {td("empty")}
            </p>
          )}
          {activeItems.map(deviceCard)}
          <p data-testid="pos-device-other" className="flex min-h-[64px] items-center justify-center gap-3 rounded-[18px] border border-dashed bg-[color:var(--color-surface-2)] px-5 py-4 text-center text-[14px] font-semibold text-[color:var(--color-ink-soft)]">
            <RegisterIcon name="plus" size={15} />
            {td("otherDevice")}
          </p>
          {/* POS HF-P1CLOSE ▸ O7: เครื่องที่เพิกถอนแล้วพับไว้ใต้แถวเดียว "เพิกถอนแล้ว (n)" — ปิดไว้ก่อน · แตะเพื่อกาง (ข้อมูลคงอยู่ ไม่ลบ) ◂ */}
          {revokedItems.length > 0 && (
            <div className="flex flex-col gap-4 md:gap-5">
              <button
                data-testid="pos-device-revoked-fold"
                type="button"
                aria-expanded={showRevoked}
                className="flex min-h-[48px] w-full items-center gap-3 rounded-[14px] border px-5 text-left text-[14px] font-semibold text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
                onClick={() => setShowRevoked((v) => !v)}
              >
                <RegisterIcon name="x" size={14} />
                <span className="min-w-0 flex-1 truncate">{td("revokedFold", { count: revokedItems.length })}</span>
                <RegisterIcon name="chevron" size={12} className={showRevoked ? "rotate-180" : ""} />
              </button>
              {showRevoked && revokedItems.map(deviceCard)}
            </div>
          )}
          {lan ? <LanAgentsCard systemId={systemId} unitId={unitId} agents={lanAgents} onAgents={setLanAgents} ports={lan.ports} /> /* POS P3-SKEL U ▸ CD-SKELU-9 ◂ */ : null}
        </div>

        <div data-testid="pos-device-panel" className="flex min-w-0 flex-col rounded-[18px] border bg-[color:var(--color-surface)] px-5 py-5 md:px-7 md:py-6 @min-[762px]:w-[430px] @min-[762px]:shrink-0" /* POS P4.3 fix8 ▸ CD-P43-15: กว้าง 430 เฉพาะตอนวางคู่ (เดิม lg 400 · xl 430) ◂ */>
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
                    {/* POS P3-SKEL U ▸ CD-SKELU-9: 4 ตัวเลือก (+ แลน) = ตาราง 2×2 (แถวเดียว 4 ปุ่มล้นกรอบ 400px/390) ◂ */}
                    <div role="radiogroup" aria-label={td("mode")} className="grid grid-cols-2 gap-1 rounded-[13px] border bg-[color:var(--color-surface-2)] p-1">
                      <button data-testid="pos-device-mode-bt" type="button" role="radio" aria-checked={sel.printerConfig.mode === "escpos-bt"} disabled={busy} className={`${seg(sel.printerConfig.mode === "escpos-bt")} flex-1`} onClick={() => cfg("mode", "escpos-bt")}>
                        {td("modeOptBt")}
                      </button>
                      <button data-testid="pos-device-mode-usb" type="button" role="radio" aria-checked={sel.printerConfig.mode === "escpos-usb"} disabled={busy} className={`${seg(sel.printerConfig.mode === "escpos-usb")} flex-1`} onClick={() => cfg("mode", "escpos-usb")}>
                        {td("modeOptUsb")}
                      </button>
                      <button data-testid="pos-device-mode-browser" type="button" role="radio" aria-checked={sel.printerConfig.mode === "browser"} disabled={busy} className={`${seg(sel.printerConfig.mode === "browser")} flex-1`} onClick={() => cfg("mode", "browser")}>
                        {td("modeOptBrowser")}
                      </button>
                      {/* POS P3-SKEL U ▸ CD-SKELU-9: แลน (escpos-lan) — เปิดเมื่อสาขามีตัวช่วยพิมพ์ 1 ตัวพอดีที่มีเครื่องพิมพ์ใบเสร็จ (หรือเครื่องเดียวไม่ระบุงาน) ◂ */}
                      <button
                        data-testid="pos-device-mode-lan"
                        type="button"
                        role="radio"
                        aria-checked={isLan}
                        disabled={busy || (!isLan && lanReceipt.state !== "ok")}
                        title={lanReason ?? undefined}
                        className={`${seg(isLan)} flex-1`}
                        onClick={() => cfg("mode", POS_PRINTER_MODE_LAN as unknown as PosPrinterConfig["mode"])}
                      >
                        {tpl("print.modeLan")}
                      </button>
                    </div>
                    {!isLan && lanReason ? (
                      <small data-testid="pos-device-lan-reason" className="text-[12.5px] text-[color:var(--color-muted)]">
                        {lanReason}
                      </small>
                    ) : null}
                    <span className="flex flex-wrap items-center gap-2">
                      <span data-testid="pos-device-pair-line" className="min-w-0 flex-1 text-[13.5px] text-[color:var(--color-muted)]">
                        {pairLine()}
                      </span>
                      {isMine && sel.printerConfig.mode !== "browser" && !isLan /* POS P3-SKEL U ▸ แลนไม่ต้องจับคู่ในเบราว์เซอร์ ◂ */ && (
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

                  {/* POS P2.6U ▸ มติ 9e (17B): ใบครัว — ไม่พิมพ์ / พิมพ์หลังขายที่เครื่องนี้ / LAN (เร็ว ๆ นี้ P3.11) + สถานีที่พิมพ์ ◂ */}
                  {(() => {
                    const ks = kitchenSlipSettings(sel.printerConfig);
                    return (
                      <div data-testid="pos-device-kitchen" className="flex flex-col gap-2 border-t pt-5">
                        <span className="text-[13px] font-bold text-[color:var(--color-ink-soft)]">{td("kitchen.title")}</span>
                        {/* fix1 V6: แถวเลือกแบบเรียงลง (ป้ายยาวไม่หัก · ชิปเร็ว ๆ นี้อยู่ในบรรทัด) แทน segmented 3 ช่อง */}
                        <div role="radiogroup" aria-label={td("kitchen.title")} className="flex flex-col divide-y rounded-[13px] border">
                          <button data-testid="pos-device-kitchen-off" type="button" role="radio" aria-checked={ks.mode === "off"} disabled={busy} className="flex min-h-12 items-center gap-3 px-4 text-left text-[15px] disabled:opacity-60" onClick={() => cfg("kitchenSlip", "off")}>
                            <RadioDot on={ks.mode === "off"} />
                            <span className={`min-w-0 flex-1 ${ks.mode === "off" ? "font-bold" : ""}`}>{td("kitchen.off")}</span>
                          </button>
                          {/* POS P3-SKEL U ▸ CD-SKELU-9: วิทยุใบครัว 2 ตัว → ค่าเดียว kitchenSlip "after-sale" (ไม่มีคีย์ใหม่) — "หลังขาย" ติ๊กเมื่อโหมด ≠ แลน · "LAN" ติ๊กเมื่อแลน ∧ after-sale (owner-ack) ◂ */}
                          <button data-testid="pos-device-kitchen-after" type="button" role="radio" aria-checked={ks.mode === "after-sale" && !isLan} disabled={busy} className="flex min-h-12 items-center gap-3 px-4 text-left text-[15px] disabled:opacity-60" onClick={() => cfg("kitchenSlip", "after-sale")}>
                            <RadioDot on={ks.mode === "after-sale" && !isLan} />
                            <span className={`min-w-0 flex-1 ${ks.mode === "after-sale" && !isLan ? "font-bold" : ""}`}>{td("kitchen.afterSale")}</span>
                          </button>
                          <button
                            data-testid="pos-device-kitchen-lan"
                            type="button"
                            role="radio"
                            aria-checked={isLan && ks.mode === "after-sale"}
                            disabled={busy || !isLan || lanKitchen.state !== "ok"}
                            title={isLan && lanKitchen.state === "ok" ? undefined : tpl("print.kitchenLanOff")}
                            className="flex min-h-12 items-center gap-3 px-4 text-left text-[15px] disabled:text-[color:var(--color-muted)] disabled:opacity-60"
                            onClick={() => cfg("kitchenSlip", "after-sale")}
                          >
                            <RadioDot on={isLan && ks.mode === "after-sale"} />
                            <span className={`min-w-0 flex-1 ${isLan && ks.mode === "after-sale" ? "font-bold" : ""}`}>
                              {lanKitchen.state === "ok" ? tpl("print.kitchenLan", { printer: `${lanKitchen.printer.host}:${lanKitchen.printer.port}` }) : td("kitchen.lan")}
                            </span>
                          </button>
                        </div>
                        {ks.mode === "after-sale" && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[12.5px] text-[color:var(--color-muted)]">{td("kitchen.stations")}</span>
                            {kStations === null ? null : kStations.length === 0 ? (
                              <span className="text-[13px] text-[color:var(--color-muted)]">{td("kitchen.noStations")}</span>
                            ) : (
                              kStations.map((st) => {
                                const on = ks.stationIds.length === 0 || ks.stationIds.includes(st.id);
                                return (
                                  <label key={st.id} className="flex min-h-11 items-center gap-3 text-[14px]">
                                    <input
                                      data-testid={`pos-device-kitchen-station-${st.id}`}
                                      type="checkbox"
                                      className="size-5"
                                      checked={on}
                                      disabled={busy}
                                      onChange={() => {
                                        const all = kStations.map((x) => x.id);
                                        const cur = ks.stationIds.length ? ks.stationIds : all;
                                        const next = on ? cur.filter((x) => x !== st.id) : [...cur, st.id];
                                        cfg("kitchenStationIds", next.length === all.length ? [] : next);
                                      }}
                                    />
                                    <span className="min-w-0 flex-1 truncate">{locale === "en" && st.nameEn ? st.nameEn : st.name}</span>
                                  </label>
                                );
                              })
                            )}
                            <small className="text-[12px] text-[color:var(--color-muted)]">{td("kitchen.stationsHint")}</small>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <CustomerDisplayBlock key={sel.id} systemId={systemId} unitId={unitId} deviceId={sel.id} /> {/* POS P2.10 ▸ จอลูกค้า (มติ 4 · R7) ◂ */}
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

// ═══════════ POS P2.10 ▸ บล็อก "จอลูกค้า" (R7 · มติ 2 4 7 13.7) ═══════════
//   สถานะ: ยังไม่ได้จับคู่ · รอจับคู่ (รหัส 8 ตัว + QR ของ <origin>/d?c=<รหัส> + เวลาเหลือ) · ออนไลน์/ออฟไลน์ (lastPolledAt ≤ 120 วิ)
//   เปิดจอลูกค้า/ขอรหัสใหม่ (enable — token เดิมยังใช้ได้จนรหัสใหม่ถูกแลก) · ยกเลิกการจับคู่ (กล่องยืนยัน) · สวิตช์แสดงแต้ม · ข้อความหน้าพัก · ภาษา
//   รหัสตัวจริงอยู่ในหน่วยความจำของบล็อกนี้เท่านั้น (สถานะจากเซิร์ฟเวอร์ไม่มีรหัส) · เวลาเหลือ/ลิงก์คำนวณหลัง mount (HF-418)
function DisplayQrImg({ value, alt }: { value: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width: 320, errorCorrectionLevel: "M" })
      .then((u: string) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [value]);
  return (
    <div data-testid="pos-settings-display-qr" className="grid size-[148px] shrink-0 place-items-center rounded-[12px] border bg-[color:var(--color-surface)] p-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={alt} width={136} height={136} /> : null}
    </div>
  );
}

function CustomerDisplayBlock({ systemId, unitId, deviceId }: { systemId: string; unitId: string; deviceId: string }) {
  const t = useTranslations("pos.display");
  const [st, setSt] = useState<CustomerDisplayStatusView | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [idleDraft, setIdleDraft] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  // POS P2.10 ▸ fix2 G2 (มติ fix2 ข้อ 2): ตัวนับคำขอ — เปิด/ยกเลิกเพิ่มเลขทั้งตอนเริ่มและตอนเสร็จ ·
  //    ผลถามสถานะที่เริ่มก่อนการเปิด/ยกเลิกล่าสุดถูกทิ้ง (ไม่ล้างรหัสใหม่ · ไม่ทับสถานะ) ◂
  const mutSeq = useRef(0);

  const refresh = useCallback(async () => {
    const started = mutSeq.current; // POS P2.10 ▸ fix2 G2 ◂
    const r = await customerDisplayStatusAction({ systemId, unitId, deviceId }).catch(() => null);
    if (started !== mutSeq.current) return; // POS P2.10 ▸ fix2 G2: ผลเก่ากว่าการเปิด/ยกเลิกล่าสุด ⇒ ทิ้ง ◂
    if (!r || !r.ok) {
      setErr(t(displayErrorKey(r?.code)));
      return;
    }
    setSt(r.display);
    // POS P2.10 ▸ fix1 F3 (มติ fix1 ข้อ 3): ล้างรหัสเมื่อเซิร์ฟเวอร์ไม่มีรหัสรอแล้วเท่านั้น (แลกแล้ว/ยกเลิก) — จอที่จับคู่อยู่ขอรหัสใหม่ได้ (เปลี่ยนแท็บเล็ต) ·
    //    รหัสที่หมดเวลาแล้วยังถือไว้เพื่อแสดง "รหัสหมดอายุ"
    if (!r.display.pendingCodeExpiresAt) setCode((c) => (c && Date.parse(c.expiresAt) <= Date.now() ? c : null)); // ◂
  }, [systemId, unitId, deviceId, t]);

  useEffect(() => {
    setOrigin(window.location.origin);
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (st) setIdleDraft(st.idleText ?? "");
  }, [st?.idleText]); // eslint-disable-line react-hooks/exhaustive-deps
  // นาฬิกาของเวลาเหลือ + ถามสถานะซ้ำ (รอจับคู่ 5 วิ · อื่น ๆ 30 วิ)
  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => void refresh(), code ? 5_000 : 30_000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [refresh, code]);

  const run = async (fn: () => Promise<{ ok: boolean; code?: string } | null>, ok?: string) => {
    setBusy(true);
    setErr(null);
    setNote(null);
    const r = await fn().catch(() => null);
    setBusy(false);
    if (!r || !r.ok) setErr(t(displayErrorKey(r?.code)));
    else if (ok) setNote(ok);
    return !!r?.ok;
  };
  const enable = () =>
    run(async () => {
      mutSeq.current += 1; // POS P2.10 ▸ fix2 G2: ก่อนเรียก ◂
      const r = await enableCustomerDisplayAction({ systemId, unitId, deviceId }).finally(() => void (mutSeq.current += 1)); // POS P2.10 ▸ fix2 G2: หลังเสร็จ ◂
      if (r.ok) {
        setCode({ code: r.pairCode, expiresAt: r.pairCodeExpiresAt });
        setSt(r.display);
      }
      return r;
    });
  const revoke = () =>
    run(async () => {
      mutSeq.current += 1; // POS P2.10 ▸ fix2 G2: ก่อนเรียก ◂
      const r = await revokeCustomerDisplayAction({ systemId, unitId, deviceId }).finally(() => void (mutSeq.current += 1)); // POS P2.10 ▸ fix2 G2: หลังเสร็จ ◂
      if (r.ok) {
        setCode(null);
        setSt(r.display);
        setConfirmOpen(false);
      }
      return r;
    });
  const save = (patch: { showPoints?: boolean; idleText?: string | null; locale?: DisplayLocale | null }) =>
    run(async () => {
      const r = await updateCustomerDisplaySettingsAction({ systemId, unitId, deviceId, ...patch });
      if (r.ok) setSt(r.display);
      return r;
    }, t("settings.saved"));

  const left = code && now !== null ? Math.max(0, Math.floor((Date.parse(code.expiresAt) - now) / 1000)) : null;
  const mmss = left !== null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "";
  const link = origin ? `${origin}/d` : "/d";
  const statusText = !st
    ? ""
    : st.paired
      ? st.online
        ? t("settings.statusOnline")
        : t("settings.statusOffline")
      : st.pendingCodeExpiresAt
        ? t("settings.statusPending")
        : t("settings.statusUnpaired");
  const dot = st?.paired && st.online ? "bg-[color:var(--color-tag-green)]" : st?.paired ? "bg-[color:var(--color-danger)]" : "bg-[color:var(--color-line)]";

  return (
    <div data-testid="pos-settings-display" className="flex flex-col gap-3 border-t pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] font-bold text-[color:var(--color-ink-soft)]">{t("settings.title")}</span>
        {st && (
          <span data-testid="pos-settings-display-status" data-paired={st.paired ? "1" : "0"} data-online={st.online ? "1" : "0"} className="inline-flex items-center gap-1.5 text-[13px]">
            <span aria-hidden className={`size-2 rounded-full ${dot}`} />
            {statusText}
          </span>
        )}
        {st?.paired && st.lastPolledAt && <span className="text-[12px] text-[color:var(--color-muted)]">{t("settings.lastSeen", { time: bkkHm(st.lastPolledAt) })}</span>}
      </div>
      <p className="text-[13px] text-[color:var(--color-muted)]">{t("settings.hint", { url: link })}</p>

      {code && left !== null && left > 0 && ( // POS P2.10 ▸ fix1 F3: แสดงรหัสแม้จับคู่อยู่ (ขอรหัสใหม่ = ทางเปลี่ยนแท็บเล็ต) ◂
        <div data-testid="pos-settings-display-code" className="flex flex-wrap items-center gap-4 rounded-[13px] border bg-[color:var(--color-surface-2)] p-4">
          <DisplayQrImg value={`${link}?c=${code.code}`} alt={t("settings.codeLabel")} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[12.5px] text-[color:var(--color-muted)]">{t("settings.codeLabel")}</span>
            <b data-testid="pos-settings-display-code-text" className="font-mono text-[30px] tracking-[0.18em]">
              {`${code.code.slice(0, 4)} ${code.code.slice(4)}`}
            </b>
            <span data-testid="pos-settings-display-countdown" className="text-[13px] tabular-nums text-[color:var(--color-ink-soft)]">
              {t("settings.expiresIn", { time: mmss })}
            </span>
            <span className="text-[12.5px] text-[color:var(--color-muted)]">{t("settings.openLink", { url: link })}</span>
          </div>
        </div>
      )}
      {code && left === 0 && <InlineNote tone="error">{t("settings.codeExpired")}</InlineNote>}{/* POS P2.10 ▸ fix1 F3: จับคู่อยู่ก็แจ้งรหัสใหม่หมดอายุ ◂ */}
      {!code && st?.pairLocked && <InlineNote tone="error">{t("settings.statusLocked")}</InlineNote>}

      <div className="flex flex-wrap gap-2">
        <button data-testid="pos-settings-display-enable" type="button" className="btn btn-primary h-11 rounded-[11px] px-5 font-semibold" disabled={busy} onClick={() => void enable()}>
          {st?.enabled ? t("settings.newCode") : t("settings.enable")}
        </button>
        {st?.enabled && (
          <button data-testid="pos-settings-display-revoke" type="button" className="btn btn-ghost h-11 rounded-[11px] px-5 text-[color:var(--color-danger)]" disabled={busy} onClick={() => setConfirmOpen(true)}>
            {t("settings.revoke")}
          </button>
        )}
      </div>

      {st?.enabled && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[14px]">{t("settings.showPoints")}</span>
              <small className="block text-[12px] text-[color:var(--color-muted)]">{t("settings.showPointsHint")}</small>
            </span>
            <button
              data-testid="pos-settings-display-show-points"
              type="button"
              role="switch"
              aria-checked={st.showPoints}
              aria-label={t("settings.showPoints")}
              disabled={busy}
              className="grid min-h-11 min-w-11 place-items-center"
              onClick={() => void save({ showPoints: !st.showPoints })}
            >
              <SwitchKnob on={st.showPoints} />
            </button>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{t("settings.idleText")}</span>
            <input
              data-testid="pos-settings-display-idle-text"
              className="input h-11 rounded-[11px] px-4 text-[15px]"
              value={idleDraft}
              maxLength={DISPLAY_IDLE_TEXT_MAX}
              placeholder={t("settings.idlePlaceholder")}
              disabled={busy}
              onChange={(e) => setIdleDraft(e.target.value)}
              onBlur={() => {
                const v = idleDraft.trim();
                if (v !== (st.idleText ?? "")) void save({ idleText: v || null });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </label>
          <label className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-[14px]">{t("settings.language")}</span>
            <select
              data-testid="pos-settings-display-locale"
              className="input h-11 w-auto rounded-[10px] px-3 text-[14px]"
              value={st.locale ?? ""}
              disabled={busy}
              onChange={(e) => void save({ locale: e.target.value === "th" || e.target.value === "en" ? e.target.value : null })}
            >
              <option value="">{t("settings.langAuto")}</option>
              <option value="th">{t("settings.langTh")}</option>
              <option value="en">{t("settings.langEn")}</option>
            </select>
          </label>
        </div>
      )}
      {err && (
        <InlineNote tone="error" testid="pos-settings-display-error">
          {err}
        </InlineNote>
      )}
      {note && !err && <InlineNote tone="ok">{note}</InlineNote>}

      {confirmOpen && (
        <DialogBox testid="pos-settings-display-revoke-dialog" labelledBy="pos-settings-display-revoke-title" onClose={() => setConfirmOpen(false)}>
          <h2 id="pos-settings-display-revoke-title" className="text-[18px] font-bold">
            {t("settings.revokeTitle")}
          </h2>
          <p className="text-[14.5px] text-[color:var(--color-ink-soft)]">{t("settings.revokeBody")}</p>
          <div className="flex justify-end gap-2">
            <button data-testid="pos-settings-display-revoke-cancel" type="button" className="btn btn-ghost h-11 rounded-[11px] px-5" onClick={() => setConfirmOpen(false)}>
              {t("settings.cancel")}
            </button>
            <button
              data-testid="pos-settings-display-revoke-confirm"
              type="button"
              className="btn h-11 rounded-[11px] bg-[color:var(--color-danger)] px-5 font-semibold text-white"
              disabled={busy}
              onClick={() => void revoke()}
            >
              {t("settings.revokeConfirm")}
            </button>
          </div>
        </DialogBox>
      )}
    </div>
  );
}
// ◂ POS P2.10
