"use client";

// GeneralSettings.tsx — POS P1.18U แท็บ "ทั่วไป" (มติ 2 · ไม่มีภาพ — สไตล์การ์ดแบบ 17A)
//   การ์ดตามลำดับ: หน้าขาย (ล็อกจอ · บิลพักหมดอายุ · ภาษาใบเสร็จ) · กะและลิ้นชัก · รายงาน (เวลาตัดวัน) · สต็อกของสาขา · บาร์โค้ดสินค้าชั่ง ·
//   พร้อมเพย์ของสาขา (เจ้าของเท่านั้น) · ค่าบริการ (อ่านอย่างเดียว) · ภาษาของแอป (TH | EN)
//   ข้อมูล = posSettingsOverviewAction (คำขอเดียว) · การ์ดละปุ่ม "บันทึก" ส่งเฉพาะคีย์ที่เปลี่ยน → updatePosGeneralSettingsAction /
//   updatePosUnitStockPolicyAction / updatePosUnitPromptpayAction · VALIDATION {field} = ข้อความใต้ช่องนั้น · SETTINGS_SECTION_LOCKED /
//   PERMISSION_DENIED = การ์ดอ่านอย่างเดียวพร้อมข้อความ · บันทึกแล้ว = "บันทึกแล้ว" 3 วินาที
//   แคชเชียร์ (canEdit.general = false) = อ่านอย่างเดียวทั้งแท็บ ไม่มีปุ่ม · เพดานส่วนลดอยู่แท็บพนักงานและสิทธิ์ (17C)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม/ช่อง ≥ 44px · เลขพร้อมเพย์แสดงแบบปิดบังเสมอ

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { posSettingsOverviewAction, updatePosGeneralSettingsAction, updatePosUnitPromptpayAction, updatePosUnitStockPolicyAction } from "@/lib/modules/pos/settings-actions";
import { POS_GENERAL_LIMITS, settingsRefusalMessageKey, type PosGeneralSettings, type PosGeneralSettingsPatch, type PosOversellPolicy } from "@/lib/modules/pos/settings-shared";
import type { PosSettingsOverviewResult } from "@/lib/modules/pos/settings-overview";
import type { WeighedBarcodeKind, WeighedBarcodeRule } from "@/lib/modules/pos/scan-shared";
import { isValidPromptPayId } from "@/lib/payment/promptpay";
import { LocaleChooser } from "@/components/pos/LocaleChooser";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { CardHead, Chip, InlineNote, SettingsCard, SwitchKnob, TabHead } from "./settings-ui";

type Overview = Extract<PosSettingsOverviewResult, { ok: true }>;
type CardKey = "register" | "shift" | "reports" | "stock" | "weighed" | "promptpay";
type CardState = { saving: boolean; saved: boolean; error: string | null; locked: string | null; fields: Record<string, string> };
const IDLE: CardState = { saving: false, saved: false, error: null, locked: null, fields: {} };
const PREFIXES = ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"] as const;
const CUTOFF_STEP = 15;
/** field ของ VALIDATION ที่มีข้อความใต้ช่อง (อื่น = ข้อความรวมของการ์ด) */
const FIELD_KEYS = new Set(["autoLockMinutes", "heldCartExpireDays", "receiptLocale", "shift.overShortReasonSatang", "shift.forceCloseAfterHours", "dayCutoffMinutes", "weighedBarcode.rules", "oversellPolicy", "promptpayId"]);

type Props = {
  systemId: string;
  unitId: string;
  unitName: string;
  multiUnit: boolean;
  /** เลขพร้อมเพย์ของสาขานี้แบบปิดบัง (••••1234) · null = ยังไม่ตั้ง (ใช้ของร้าน) */
  unitPromptpayMasked: string | null;
  /** เลขพร้อมเพย์ของร้าน (PaymentProfile) แบบปิดบัง · null = ยังไม่ตั้ง */
  shopPromptpayMasked: string | null;
};

const intIn = (s: string, min: number, max: number): number | null => {
  const v = s.trim();
  if (!/^\d{1,6}$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
};
/** บาท (สูงสุด 2 ตำแหน่ง) → สตางค์ · ผิดรูป/นอกช่วง = null */
const satangOf = (s: string): number | null => {
  const v = s.trim().replace(/,/g, "");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(v)) return null;
  const n = Math.round(Number(v) * 100);
  return n >= POS_GENERAL_LIMITS.overShortReasonSatang.min && n <= POS_GENERAL_LIMITS.overShortReasonSatang.max ? n : null;
};
const bahtText = (satang: number) => (satang % 100 === 0 ? String(satang / 100) : (satang / 100).toFixed(2));
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const sameRules = (a: WeighedBarcodeRule[], b: WeighedBarcodeRule[]) => a.length === b.length && a.every((r, i) => r.prefix === b[i]!.prefix && r.kind === b[i]!.kind);

export function GeneralSettings({ systemId, unitId, unitName, multiUnit, unitPromptpayMasked, shopPromptpayMasked }: Props) {
  const t = useTranslations("pos.settings");
  const tg = useTranslations("pos.settings.general");
  const [data, setData] = useState<Overview | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<CardKey, CardState>>({ register: IDLE, shift: IDLE, reports: IDLE, stock: IDLE, weighed: IDLE, promptpay: IDLE });
  const timers = useRef<Partial<Record<CardKey, ReturnType<typeof setTimeout>>>>({});

  // ── ร่างของแต่ละการ์ด ──
  const [autoLock, setAutoLock] = useState("");
  const [heldDays, setHeldDays] = useState("");
  const [receiptLocale, setReceiptLocale] = useState<"th" | "en">("th");
  const [reqRegister, setReqRegister] = useState(false);
  const [reqOther, setReqOther] = useState(false);
  const [blind, setBlind] = useState(false);
  const [overShort, setOverShort] = useState("");
  const [forceClose, setForceClose] = useState("");
  const [cutoff, setCutoff] = useState(0);
  const [oversell, setOversell] = useState<PosOversellPolicy>("ALLOW_NEGATIVE");
  const [wbOn, setWbOn] = useState(false);
  const [rules, setRules] = useState<WeighedBarcodeRule[]>([]);
  const [ppInput, setPpInput] = useState("");
  const [ppMasked, setPpMasked] = useState<string | null>(unitPromptpayMasked);

  /** ร่างจากค่าที่บันทึก — part = เฉพาะการ์ดนั้น (บันทึกการ์ดหนึ่งไม่ล้างร่างที่ยังไม่บันทึกของการ์ดอื่น) · ไม่ส่ง = ทุกการ์ด */
  const fill = useCallback((g: PosGeneralSettings, part?: "register" | "shift" | "reports" | "weighed") => {
    if (!part || part === "register") {
      setAutoLock(String(g.autoLockMinutes));
      setHeldDays(String(g.heldCartExpireDays));
      setReceiptLocale(g.receiptLocale);
    }
    if (!part || part === "shift") {
      setReqRegister(g.shift.requiredRegister);
      setReqOther(g.shift.requiredOtherSources);
      setBlind(g.shift.blindClose);
      setOverShort(bahtText(g.shift.overShortReasonSatang));
      setForceClose(String(g.shift.forceCloseAfterHours));
    }
    if (!part || part === "reports") setCutoff(g.dayCutoffMinutes);
    if (!part || part === "weighed") {
      setWbOn(g.weighedBarcode.enabled);
      setRules(g.weighedBarcode.rules.map((r) => ({ ...r })));
    }
  }, []);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const r = await posSettingsOverviewAction({ systemId, unitId });
      if (!r.ok) return setLoadErr(settingsRefusalMessageKey(r.code));
      setData(r);
      fill(r.general);
      setOversell(r.unitStock.oversellPolicy);
    } catch {
      setLoadErr("loadFailed");
    }
  }, [systemId, unitId, fill]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const ts = timers.current;
    return () => Object.values(ts).forEach((x) => x && clearTimeout(x));
  }, []);

  const patchCard = (k: CardKey, s: Partial<CardState>) => setCards((c) => ({ ...c, [k]: { ...c[k], ...s } }));
  const touch = (k: CardKey) => setCards((c) => (c[k].saved || c[k].error || Object.keys(c[k].fields).length ? { ...c, [k]: { ...c[k], saved: false, error: null, fields: {} } } : c));
  const savedFor3s = (k: CardKey) => {
    patchCard(k, { saving: false, saved: true, error: null, fields: {} });
    if (timers.current[k]) clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(() => patchCard(k, { saved: false }), 3000);
  };
  /** คำปฏิเสธ → การ์ด: VALIDATION + field = ใต้ช่อง · ล็อก/ไม่มีสิทธิ์ = การ์ดอ่านอย่างเดียว · อื่น = ข้อความท้ายการ์ด */
  const refuse = (k: CardKey, r: { code: string; field?: string }) => {
    if (r.code === "VALIDATION" && r.field) {
      if (FIELD_KEYS.has(r.field)) return patchCard(k, { saving: false, fields: { [r.field]: `general.fieldErrors.${r.field}` } });
      return patchCard(k, { saving: false, error: "errors.validation" });
    }
    if (r.code === "SETTINGS_SECTION_LOCKED" || r.code === "PERMISSION_DENIED")
      return patchCard(k, { saving: false, locked: r.code === "PERMISSION_DENIED" ? "general.permissionDenied" : settingsRefusalMessageKey(r.code) });
    patchCard(k, { saving: false, error: settingsRefusalMessageKey(r.code) });
  };

  const g = data?.general ?? null;
  const editGeneral = !!data?.canEdit.general;
  const editStock = !!data?.canEdit.unitStock;
  const editPay = !!data?.canEdit.payment;

  // ── บันทึกค่าทั่วไป (เฉพาะคีย์ที่เปลี่ยน) ──
  const saveGeneral = async (k: "register" | "shift" | "reports" | "weighed") => {
    if (!g || !editGeneral || cards[k].saving || cards[k].locked) return;
    const patch: PosGeneralSettingsPatch = {};
    const fields: Record<string, string> = {};
    if (k === "register") {
      const al = intIn(autoLock, POS_GENERAL_LIMITS.autoLockMinutes.min, POS_GENERAL_LIMITS.autoLockMinutes.max);
      const hd = intIn(heldDays, POS_GENERAL_LIMITS.heldCartExpireDays.min, POS_GENERAL_LIMITS.heldCartExpireDays.max);
      if (al === null) fields.autoLockMinutes = "general.fieldErrors.autoLockMinutes";
      if (hd === null) fields.heldCartExpireDays = "general.fieldErrors.heldCartExpireDays";
      if (al !== null && al !== g.autoLockMinutes) patch.autoLockMinutes = al;
      if (hd !== null && hd !== g.heldCartExpireDays) patch.heldCartExpireDays = hd;
      if (receiptLocale !== g.receiptLocale) patch.receiptLocale = receiptLocale;
    } else if (k === "shift") {
      const os = satangOf(overShort);
      const fc = intIn(forceClose, POS_GENERAL_LIMITS.forceCloseAfterHours.min, POS_GENERAL_LIMITS.forceCloseAfterHours.max);
      if (os === null) fields["shift.overShortReasonSatang"] = "general.fieldErrors.shift.overShortReasonSatang";
      if (fc === null) fields["shift.forceCloseAfterHours"] = "general.fieldErrors.shift.forceCloseAfterHours";
      const sh: NonNullable<PosGeneralSettingsPatch["shift"]> = {};
      if (reqRegister !== g.shift.requiredRegister) sh.requiredRegister = reqRegister;
      if (reqOther !== g.shift.requiredOtherSources) sh.requiredOtherSources = reqOther;
      if (blind !== g.shift.blindClose) sh.blindClose = blind;
      if (os !== null && os !== g.shift.overShortReasonSatang) sh.overShortReasonSatang = os;
      if (fc !== null && fc !== g.shift.forceCloseAfterHours) sh.forceCloseAfterHours = fc;
      if (Object.keys(sh).length) patch.shift = sh;
    } else if (k === "reports") {
      if (cutoff !== g.dayCutoffMinutes) patch.dayCutoffMinutes = cutoff;
    } else {
      if (new Set(rules.map((r) => r.prefix)).size !== rules.length) fields["weighedBarcode.rules"] = "general.fieldErrors.weighedBarcode.rules";
      if (wbOn !== g.weighedBarcode.enabled || !sameRules(rules, g.weighedBarcode.rules)) patch.weighedBarcode = { enabled: wbOn, rules: rules.map((r) => ({ prefix: r.prefix, kind: r.kind })) };
    }
    if (Object.keys(fields).length) return patchCard(k, { fields, saved: false, error: null });
    if (!Object.keys(patch).length) return savedFor3s(k);
    patchCard(k, { saving: true, saved: false, error: null, fields: {} });
    try {
      const r = await updatePosGeneralSettingsAction({ systemId, patch });
      if (!r.ok) return refuse(k, r);
      setData((d) => (d ? { ...d, general: r.general } : d));
      fill(r.general, k);
      savedFor3s(k);
    } catch {
      patchCard(k, { saving: false, error: "errors.unknown" });
    }
  };

  const saveStock = async () => {
    if (!data || !editStock || cards.stock.saving || cards.stock.locked) return;
    if (oversell === data.unitStock.oversellPolicy) return savedFor3s("stock");
    patchCard("stock", { saving: true, saved: false, error: null, fields: {} });
    try {
      const r = await updatePosUnitStockPolicyAction({ systemId, unitId, oversellPolicy: oversell });
      if (!r.ok) return refuse("stock", r);
      setData((d) => (d ? { ...d, unitStock: r.unitStock } : d));
      setOversell(r.unitStock.oversellPolicy);
      savedFor3s("stock");
    } catch {
      patchCard("stock", { saving: false, error: "errors.unknown" });
    }
  };

  const savePromptpay = async (remove: boolean) => {
    if (!editPay || cards.promptpay.saving || cards.promptpay.locked) return;
    const raw = ppInput.trim().replace(/[\s-]/g, "");
    if (!remove && !isValidPromptPayId(raw)) return patchCard("promptpay", { fields: { promptpayId: "general.fieldErrors.promptpayId" }, saved: false, error: null });
    patchCard("promptpay", { saving: true, saved: false, error: null, fields: {} });
    try {
      const r = await updatePosUnitPromptpayAction({ systemId, unitId, promptpayId: remove ? null : raw });
      if (!r.ok) return refuse("promptpay", r);
      setPpMasked(r.promptpayMasked);
      setPpInput("");
      savedFor3s("promptpay");
    } catch {
      patchCard("promptpay", { saving: false, error: "errors.unknown" });
    }
  };

  const cutoffOptions = useMemo(() => {
    const list: number[] = [];
    for (let m = 0; m <= POS_GENERAL_LIMITS.dayCutoffMinutes.max; m += CUTOFF_STEP) list.push(m);
    if (!list.includes(cutoff)) list.push(cutoff);
    return list.sort((a, b) => a - b);
  }, [cutoff]);

  if (loadErr)
    return (
      <div data-testid="pos-settings-general" className="flex min-w-0 flex-col gap-4">
        <TabHead title={tg("title")} desc={tg("subtitle")} />
        <InlineNote tone="error" testid="pos-settings-load-error">
          {t(loadErr)}
        </InlineNote>
        <button data-testid="pos-settings-general-retry" type="button" className="btn btn-ghost h-11 self-start rounded-[11px] px-5 text-[14px]" onClick={() => void load()}>
          {t("retry")}
        </button>
      </div>
    );
  if (!data || !g)
    return (
      <div data-testid="pos-settings-general" className="flex min-w-0 flex-col gap-4">
        <TabHead title={tg("title")} desc={tg("subtitle")} />
        <p className="text-[14px] text-[color:var(--color-muted)]">{t("loading")}</p>
      </div>
    );

  // ── ชิ้นส่วน ──
  const inp = "input h-12 w-[120px] rounded-[13px] px-4 text-right text-[15px] font-semibold tabular-nums disabled:opacity-70";
  const seg = (on: boolean) =>
    `inline-flex min-h-11 items-center justify-center rounded-[10px] px-4 text-[14.5px] ${on ? "bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]" : "text-[color:var(--color-ink-soft)]"} disabled:opacity-60`;
  const fieldErr = (k: CardKey, field: string) =>
    cards[k].fields[field] ? (
      <span data-testid="pos-settings-general-field-error" data-field={field} role="alert" className="text-[12.5px] text-[color:var(--color-danger)]">
        {t(cards[k].fields[field]!)}
      </span>
    ) : null;
  const row = (label: string, hint: string | null, node: ReactNode, err?: ReactNode) => (
    <div className="flex flex-col gap-1 border-t py-[14px] first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <b className="block text-[15px] font-semibold">{label}</b>
          {hint && <small className="block text-[12.5px] text-[color:var(--color-muted)]">{hint}</small>}
        </div>
        {node}
      </div>
      {err}
    </div>
  );
  const suffix = (node: ReactNode, unit: string) => (
    <span className="inline-flex items-center gap-2">
      {node}
      <span className="text-[14px] text-[color:var(--color-muted)]">{unit}</span>
    </span>
  );
  /** ท้ายการ์ด: ข้อความ (ล็อก · ผิดพลาด · บันทึกแล้ว) + ปุ่มบันทึก (เฉพาะคนที่แก้ได้) */
  const foot = (k: CardKey, can: boolean, button: ReactNode) => {
    const c = cards[k];
    return (
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t pt-4 empty:hidden">
        {c.locked && (
          <InlineNote tone="error" testid="pos-settings-general-locked">
            {t(c.locked)}
          </InlineNote>
        )}
        {c.error && (
          <InlineNote tone="error" testid="pos-settings-general-error">
            {t(c.error)}
          </InlineNote>
        )}
        {c.saved && (
          <span data-testid="pos-settings-general-saved" role="status" className="text-[13.5px] text-[color:var(--color-muted)]">
            {t("saved")}
          </span>
        )}
        {can && !c.locked && button}
      </div>
    );
  };
  const saveCls = "btn btn-primary h-11 rounded-[11px] px-5 text-[14px] font-semibold disabled:opacity-50";
  const ro = (k: CardKey, can: boolean) => !can || !!cards[k].locked || cards[k].saving;

  const regRo = ro("register", editGeneral);
  const shiftRo = ro("shift", editGeneral);
  const repRo = ro("reports", editGeneral);
  const stockRo = ro("stock", editStock);
  const wbRo = ro("weighed", editGeneral);
  const ppRo = ro("promptpay", editPay);
  const sc = data.serviceCharge;
  const usedPrefixes = new Set(rules.map((r) => r.prefix));
  const nextPrefix = PREFIXES.find((p) => !usedPrefixes.has(p)) ?? null;

  return (
    <div data-testid="pos-settings-general" className="flex min-w-0 flex-col gap-6 md:gap-8">
      <TabHead title={tg("title")} desc={tg("subtitle")} />
      {!editGeneral && (
        <InlineNote tone="ok" testid="pos-settings-readonly">
          {t("readOnly")}
        </InlineNote>
      )}
      <div className="min-w-0 xl:columns-2 xl:gap-7 [&>*]:mb-6 [&>*]:break-inside-avoid xl:[&>*]:mb-7">
        {/* ── หน้าขาย ── */}
        <SettingsCard testid="pos-settings-general-register">
          <CardHead icon="shop" title={tg("register.title")} />
          {row(
            tg("register.autoLock"),
            tg("register.autoLockHint"),
            suffix(
              <input
                data-testid="pos-settings-general-autolock"
                className={inp}
                inputMode="numeric"
                autoComplete="off"
                aria-label={tg("register.autoLock")}
                value={autoLock}
                disabled={regRo}
                aria-invalid={!!cards.register.fields.autoLockMinutes}
                onChange={(e) => {
                  setAutoLock(e.target.value);
                  touch("register");
                }}
              />,
              tg("unitMinutes"),
            ),
            fieldErr("register", "autoLockMinutes"),
          )}
          {row(
            tg("register.heldDays"),
            tg("register.heldDaysHint"),
            suffix(
              <input
                data-testid="pos-settings-general-held-days"
                className={inp}
                inputMode="numeric"
                autoComplete="off"
                aria-label={tg("register.heldDays")}
                value={heldDays}
                disabled={regRo}
                aria-invalid={!!cards.register.fields.heldCartExpireDays}
                onChange={(e) => {
                  setHeldDays(e.target.value);
                  touch("register");
                }}
              />,
              tg("unitDays"),
            ),
            fieldErr("register", "heldCartExpireDays"),
          )}
          {row(
            tg("register.receiptLocale"),
            tg("register.receiptLocaleHint"),
            <span role="radiogroup" aria-label={tg("register.receiptLocale")} className="inline-flex gap-0.5 rounded-[12px] border p-0.5">
              <button data-testid="pos-settings-general-receipt-th" type="button" role="radio" aria-checked={receiptLocale === "th"} disabled={regRo} className={seg(receiptLocale === "th")} onClick={() => {
                setReceiptLocale("th");
                touch("register");
              }}>
                {tg("localeTh")}
              </button>
              <button data-testid="pos-settings-general-receipt-en" type="button" role="radio" aria-checked={receiptLocale === "en"} disabled={regRo} className={seg(receiptLocale === "en")} onClick={() => {
                setReceiptLocale("en");
                touch("register");
              }}>
                {tg("localeEn")}
              </button>
            </span>,
            fieldErr("register", "receiptLocale"),
          )}
          {foot(
            "register",
            editGeneral,
            <button data-testid="pos-settings-general-save-register" type="button" className={saveCls} disabled={regRo} onClick={() => void saveGeneral("register")}>
              {cards.register.saving ? t("saving") : t("save")}
            </button>,
          )}
        </SettingsCard>

        {/* ── กะและลิ้นชัก ── */}
        <SettingsCard testid="pos-settings-general-shift">
          <CardHead icon="clock" title={tg("shift.title")} />
          {row(
            tg("shift.requiredRegister"),
            tg("shift.requiredRegisterHint"),
            <button data-testid="pos-settings-general-shift-required-register" type="button" role="switch" aria-checked={reqRegister} aria-label={tg("shift.requiredRegister")} disabled={shiftRo} className="grid min-h-11 min-w-11 place-items-center" onClick={() => {
                setReqRegister((v) => !v);
                touch("shift");
              }}>
              <SwitchKnob on={reqRegister} disabled={shiftRo} />
            </button>,
          )}
          {row(
            tg("shift.requiredOther"),
            tg("shift.requiredOtherHint"),
            <button data-testid="pos-settings-general-shift-required-other" type="button" role="switch" aria-checked={reqOther} aria-label={tg("shift.requiredOther")} disabled={shiftRo} className="grid min-h-11 min-w-11 place-items-center" onClick={() => {
                setReqOther((v) => !v);
                touch("shift");
              }}>
              <SwitchKnob on={reqOther} disabled={shiftRo} />
            </button>,
          )}
          {row(
            tg("shift.blindClose"),
            tg("shift.blindCloseHint"),
            <button data-testid="pos-settings-general-shift-blind" type="button" role="switch" aria-checked={blind} aria-label={tg("shift.blindClose")} disabled={shiftRo} className="grid min-h-11 min-w-11 place-items-center" onClick={() => {
                setBlind((v) => !v);
                touch("shift");
              }}>
              <SwitchKnob on={blind} disabled={shiftRo} />
            </button>,
          )}
          {row(
            tg("shift.overShort"),
            tg("shift.overShortHint"),
            suffix(
              <input
                data-testid="pos-settings-general-shift-overshort"
                className={inp}
                inputMode="decimal"
                autoComplete="off"
                aria-label={tg("shift.overShort")}
                value={overShort}
                disabled={shiftRo}
                aria-invalid={!!cards.shift.fields["shift.overShortReasonSatang"]}
                onChange={(e) => {
                  setOverShort(e.target.value);
                  touch("shift");
                }}
              />,
              tg("unitBaht"),
            ),
            fieldErr("shift", "shift.overShortReasonSatang"),
          )}
          {row(
            tg("shift.forceClose"),
            tg("shift.forceCloseHint"),
            suffix(
              <input
                data-testid="pos-settings-general-shift-force-close"
                className={inp}
                inputMode="numeric"
                autoComplete="off"
                aria-label={tg("shift.forceClose")}
                value={forceClose}
                disabled={shiftRo}
                aria-invalid={!!cards.shift.fields["shift.forceCloseAfterHours"]}
                onChange={(e) => {
                  setForceClose(e.target.value);
                  touch("shift");
                }}
              />,
              tg("unitHours"),
            ),
            fieldErr("shift", "shift.forceCloseAfterHours"),
          )}
          {foot(
            "shift",
            editGeneral,
            <button data-testid="pos-settings-general-save-shift" type="button" className={saveCls} disabled={shiftRo} onClick={() => void saveGeneral("shift")}>
              {cards.shift.saving ? t("saving") : t("save")}
            </button>,
          )}
        </SettingsCard>

        {/* ── รายงาน ── */}
        <SettingsCard testid="pos-settings-general-reports">
          <CardHead icon="chart" title={tg("reports.title")} />
          {row(
            tg("reports.cutoff"),
            tg("reports.cutoffHint"),
            <select
              data-testid="pos-settings-general-day-cutoff"
              className="input h-12 w-[120px] rounded-[13px] px-3 text-[15px] font-semibold tabular-nums disabled:opacity-70"
              aria-label={tg("reports.cutoff")}
              value={cutoff}
              disabled={repRo}
              onChange={(e) => {
                setCutoff(Number(e.target.value));
                touch("reports");
              }}
            >
              {cutoffOptions.map((m) => (
                <option key={m} value={m}>
                  {hhmm(m)}
                </option>
              ))}
            </select>,
            fieldErr("reports", "dayCutoffMinutes"),
          )}
          {foot(
            "reports",
            editGeneral,
            <button data-testid="pos-settings-general-save-reports" type="button" className={saveCls} disabled={repRo} onClick={() => void saveGeneral("reports")}>
              {cards.reports.saving ? t("saving") : t("save")}
            </button>,
          )}
        </SettingsCard>

        {/* ── สต็อกของสาขา ── */}
        <SettingsCard testid="pos-settings-general-stock">
          <CardHead icon="box" title={tg("stock.title")} right={<Chip tone="muted">{unitName}</Chip>} />
          {multiUnit && <p className="-mt-2 mb-3 text-[12.5px] text-[color:var(--color-muted)]">{tg("stock.unitHint")}</p>}
          {row(
            tg("stock.oversell"),
            oversell === "BLOCK" ? tg("stock.blockHint") : tg("stock.allowHint"),
            <span role="radiogroup" aria-label={tg("stock.oversell")} className="inline-flex flex-wrap gap-0.5 rounded-[12px] border p-0.5">
              <button data-testid="pos-settings-general-oversell-allow" type="button" role="radio" aria-checked={oversell === "ALLOW_NEGATIVE"} disabled={stockRo} className={seg(oversell === "ALLOW_NEGATIVE")} onClick={() => {
                setOversell("ALLOW_NEGATIVE");
                touch("stock");
              }}>
                {tg("stock.allow")}
              </button>
              <button data-testid="pos-settings-general-oversell-block" type="button" role="radio" aria-checked={oversell === "BLOCK"} disabled={stockRo} className={seg(oversell === "BLOCK")} onClick={() => {
                setOversell("BLOCK");
                touch("stock");
              }}>
                {tg("stock.block")}
              </button>
            </span>,
            fieldErr("stock", "oversellPolicy"),
          )}
          {foot(
            "stock",
            editStock,
            <button data-testid="pos-settings-general-save-stock" type="button" className={saveCls} disabled={stockRo} onClick={() => void saveStock()}>
              {cards.stock.saving ? t("saving") : t("save")}
            </button>,
          )}
        </SettingsCard>

        {/* ── บาร์โค้ดสินค้าชั่ง ── */}
        <SettingsCard testid="pos-settings-general-weighed">
          <CardHead icon="tag" title={tg("weighed.title")} />
          {row(
            tg("weighed.enabled"),
            tg("weighed.hint"),
            <button data-testid="pos-settings-general-weighed-enabled" type="button" role="switch" aria-checked={wbOn} aria-label={tg("weighed.enabled")} disabled={wbRo} className="grid min-h-11 min-w-11 place-items-center" onClick={() => {
                setWbOn((v) => !v);
                touch("weighed");
              }}>
              <SwitchKnob on={wbOn} disabled={wbRo} />
            </button>,
          )}
          {rules.length === 0 ? (
            <p data-testid="pos-settings-general-weighed-empty" className="border-t py-[14px] text-[14px] text-[color:var(--color-muted)]">
              {tg("weighed.empty")}
            </p>
          ) : (
            rules.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 border-t py-3">
                <label className="inline-flex items-center gap-2 text-[14px] text-[color:var(--color-ink-soft)]">
                  {tg("weighed.prefix")}
                  <select
                    data-testid={`pos-settings-general-weighed-prefix-${i}`}
                    className="input h-11 w-[86px] rounded-[10px] px-3 font-mono text-[15px] font-semibold disabled:opacity-70"
                    value={r.prefix}
                    disabled={wbRo}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRules((list) => list.map((x, j) => (j === i ? { ...x, prefix: v } : x)));
                      touch("weighed");
                    }}
                  >
                    {PREFIXES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <span role="radiogroup" aria-label={tg("weighed.kind")} className="inline-flex gap-0.5 rounded-[12px] border p-0.5">
                  {(["WEIGHT", "PRICE"] as WeighedBarcodeKind[]).map((k) => (
                    <button
                      key={k}
                      data-testid={`pos-settings-general-weighed-kind-${i}-${k}`}
                      type="button"
                      role="radio"
                      aria-checked={r.kind === k}
                      disabled={wbRo}
                      className={seg(r.kind === k)}
                      onClick={() => {
                        setRules((list) => list.map((x, j) => (j === i ? { ...x, kind: k } : x)));
                        touch("weighed");
                      }}
                    >
                      {k === "WEIGHT" ? tg("weighed.kindWeight") : tg("weighed.kindPrice")}
                    </button>
                  ))}
                </span>
                <span className="flex-1" />
                {!wbRo && (
                  <button
                    data-testid={`pos-settings-general-weighed-remove-${i}`}
                    type="button"
                    className="grid size-11 place-items-center rounded-[10px] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]"
                    aria-label={tg("weighed.remove", { prefix: r.prefix })}
                    onClick={() => {
                      setRules((list) => list.filter((_, j) => j !== i));
                      touch("weighed");
                    }}
                  >
                    <RegisterIcon name="x" size={16} />
                  </button>
                )}
              </div>
            ))
          )}
          {fieldErr("weighed", "weighedBarcode.rules")}
          {!wbRo && nextPrefix && (
            <button
              data-testid="pos-settings-general-weighed-add"
              type="button"
              className="btn btn-ghost mt-2 h-11 self-start rounded-[11px] px-4 text-[14px]"
              onClick={() => {
                setRules((list) => [...list, { prefix: nextPrefix, kind: "WEIGHT" }]);
                touch("weighed");
              }}
            >
              {tg("weighed.add")}
            </button>
          )}
          {foot(
            "weighed",
            editGeneral,
            <button data-testid="pos-settings-general-save-weighed" type="button" className={saveCls} disabled={wbRo} onClick={() => void saveGeneral("weighed")}>
              {cards.weighed.saving ? t("saving") : t("save")}
            </button>,
          )}
        </SettingsCard>

        {/* ── พร้อมเพย์ของสาขา (เจ้าของเท่านั้น) ── */}
        <SettingsCard testid="pos-settings-general-promptpay">
          <CardHead icon="qr" title={tg("promptpay.title")} right={<Chip tone="muted">{unitName}</Chip>} />
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tg("promptpay.current")}</span>
            <span
              data-testid="pos-settings-general-promptpay-current"
              className={`flex h-12 items-center rounded-[13px] border bg-[color:var(--color-surface-2)] px-4 text-[15px] ${ppMasked ? "font-mono font-semibold tabular-nums" : "text-[color:var(--color-muted)]"}`}
            >
              {ppMasked ?? (shopPromptpayMasked ? tg("promptpay.useShop", { id: shopPromptpayMasked }) : tg("promptpay.none"))}
            </span>
            <small className="text-[12.5px] text-[color:var(--color-muted)]">{tg("promptpay.hint")}</small>
          </div>
          {editPay ? (
            <label className="mt-4 flex flex-col gap-2 border-t pt-4">
              <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tg("promptpay.input")}</span>
              <input
                data-testid="pos-settings-general-promptpay-input"
                className="input h-12 w-full max-w-[320px] rounded-[13px] px-4 font-mono text-[15px] disabled:opacity-70"
                inputMode="numeric"
                autoComplete="off"
                placeholder={tg("promptpay.placeholder")}
                value={ppInput}
                disabled={ppRo}
                aria-invalid={!!cards.promptpay.fields.promptpayId}
                onChange={(e) => {
                  setPpInput(e.target.value);
                  touch("promptpay");
                }}
              />
              {fieldErr("promptpay", "promptpayId")}
            </label>
          ) : (
            <InlineNote tone="ok" testid="pos-settings-general-promptpay-owner-only">
              {tg("promptpay.ownerOnly")}
            </InlineNote>
          )}
          {foot(
            "promptpay",
            editPay,
            <>
              {ppMasked && (
                <button data-testid="pos-settings-general-promptpay-remove" type="button" className="btn btn-ghost h-11 rounded-[11px] px-5 text-[14px] disabled:opacity-50" disabled={ppRo} onClick={() => void savePromptpay(true)}>
                  {tg("promptpay.remove")}
                </button>
              )}
              <button data-testid="pos-settings-general-save-promptpay" type="button" className={saveCls} disabled={ppRo || !ppInput.trim()} onClick={() => void savePromptpay(false)}>
                {cards.promptpay.saving ? t("saving") : t("save")}
              </button>
            </>,
          )}
        </SettingsCard>

        {/* ── ค่าบริการ (อ่านอย่างเดียว — ยังไม่มีหน้าแก้) ── */}
        <SettingsCard testid="pos-settings-general-service">
          <CardHead icon="pct" title={tg("service.title")} />
          <div className="flex items-center gap-4">
            <span data-testid="pos-settings-general-service-value" className="text-[15px] font-semibold">
              {sc.enabled ? tg("service.on", { rate: (sc.rateBp / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) }) : tg("service.off")}
            </span>
          </div>
          <p className="mt-2 text-[12.5px] text-[color:var(--color-muted)]">{tg("service.note")}</p>
        </SettingsCard>

        {/* ── ภาษาของแอป ── */}
        <SettingsCard testid="pos-settings-general-language">
          <CardHead icon="gear" title={tg("language.title")} />
          <LocaleChooser />
          <p className="mt-2 text-[12.5px] text-[color:var(--color-muted)]">{tg("language.hint")}</p>
        </SettingsCard>
      </div>
    </div>
  );
}
