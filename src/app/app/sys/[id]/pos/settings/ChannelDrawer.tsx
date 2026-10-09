"use client";

// ChannelDrawer.tsx — ลิ้นชักแก้/สร้างช่องทางขาย (POS P2.1U · มติ 2) — โครงเดียวกับลิ้นชักบิลที่พัก (HeldBillsDrawer):
//   จอ ≥ md = แผงขวา 474px เต็มสูง · จอ < md = แผ่นล่าง · ปิดด้วย ✕ / แตะม่าน / Esc
//   ช่อง: ชื่อ · รหัส (สร้างเท่านั้น · A–Z 0–9 _ · datalist รหัสแพลตฟอร์มสำเร็จรูป) · การรับเงิน 3 แบบ
//   (แพลตฟอร์มเก็บเงินแล้วโอนให้ร้าน = PLATFORM · ร้านเก็บเงินเอง = DIRECT · ไม่มีค่าคอมฯ = DIRECT + ค่าคอมฯ 0 ทั้งหมด) ·
//   ค่าคอมฯ % (ทศนิยม 2 ตำแหน่ง ↔ bp) · ค่าคอมฯ คงที่ต่อออเดอร์ ฿ (↔ สตางค์) · VAT ค่าคอมฯ 0 % | 7 % · ลำดับ ·
//   การ์ดตัวอย่างสด "ยอด ฿420 → ค่าคอมฯ … · รับจริง …" (channelCommission ของ channel-shared — สูตรเดียวกับเซิร์ฟเวอร์)
//   ปุ่ม บันทึก · เก็บช่องทาง (ยืนยันในบรรทัด) · ปิด
// 🔴 ตรวจด้วย parseChannelInput ก่อนเรียก action · แก้ = ส่ง id + ชื่อ (ตัวแกะบังคับ) + เฉพาะคีย์ที่เปลี่ยน
// 🔴 คำปฏิเสธ: CHANNEL_CODE_TAKEN ที่ช่องรหัส · VALIDATION {field} ที่ช่องนั้น · CHANNEL_BUILTIN_LOCKED / CHANNEL_LIMIT / อื่น = แถบบน
// 🔴 หน้าร้าน (STORE) ล็อกทั้งหมด · QR โต๊ะ/เว็บร้าน/แชท แก้ได้เฉพาะชื่อ · ไม่มีสิทธิ์ / เก็บแล้ว = อ่านอย่างเดียว
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม/ช่อง ≥ 44px

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RegisterDialog, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { hundredthsText, parseHundredths } from "@/components/pos/register/LineEditor";
import { archiveChannelAction, saveChannelAction } from "@/lib/modules/pos/channel-actions";
import {
  CHANNEL_BP_MAX,
  CHANNEL_EXTERNAL_PRESETS,
  CHANNEL_FIXED_MAX_SATANG,
  CHANNEL_LIMIT_PER_UNIT,
  CHANNEL_NAME_MAX,
  channelCommission,
  isChannelExternalPreset,
  parseChannelInput,
  type ChannelInput,
  type ChannelItem,
  type ChannelPayout,
} from "@/lib/modules/pos/channel-shared";
import { moneyText, refusalMessageKey } from "@/lib/modules/pos/register-shared";
import { CHANNEL_PRESET_BRAND, channelDisplayName, type ChannelT } from "@/components/pos/settings/channel-text";

export type ChannelDrawerMode = { kind: "edit"; item: ChannelItem } | { kind: "create" };
type PayoutChoice = "PLATFORM" | "DIRECT" | "NONE";
type Field = "name" | "code" | "commissionBp" | "commissionFixedSatang" | "commissionVatBp" | "sortOrder";
const FIELDS: readonly Field[] = ["name", "code", "commissionBp", "commissionFixedSatang", "commissionVatBp", "sortOrder"];
/** ยอดตัวอย่างของการ์ดสด (ภาพ 09: ฿420) */
const EXAMPLE_GROSS = 42_000;
/** รหัสช่องทางยาวได้ไม่เกิน (มติ 2) — ตัวแกะของเซิร์ฟเวอร์รับ ≤ 24 */
const CODE_MAX = 20;
const VAT_CHOICES = [0, 700] as const;

type RT = (key: string, values?: Record<string, string | number>) => string;
/** รหัสปฏิเสธของ action ช่องทาง → ข้อความตามภาษาจอ (สิทธิ์/ขอบเขต/ข้อมูลผิด ใช้คีย์ของช่องทาง · CHANNEL_* ใช้ pos.register.errors.*) */
export function channelErrorText(code: string, t: ChannelT, tr: RT): string {
  if (code === "PERMISSION_DENIED") return t("drawer.denied");
  if (code === "NOT_FOUND") return t("drawer.notFound");
  if (code === "VALIDATION") return t("drawer.invalid.generic");
  return tr(refusalMessageKey(code));
}

const choiceOf = (c: Pick<ChannelItem, "payout" | "commissionBp" | "commissionFixedSatang" | "commissionVatBp">): PayoutChoice =>
  c.payout === "PLATFORM" ? "PLATFORM" : c.commissionBp > 0 || c.commissionFixedSatang > 0 || c.commissionVatBp > 0 ? "DIRECT" : "NONE";

type Props = {
  systemId: string;
  unitId: string;
  mode: ChannelDrawerMode;
  canManage: boolean;
  /** รหัสที่สาขานี้ใช้แล้ว (รวมที่เก็บแล้ว) — ตัด datalist + เตือนก่อนส่ง */
  takenCodes: ReadonlySet<string>;
  atLimit: boolean;
  onClose: () => void;
  onSaved: (c: ChannelItem) => void;
};

export function ChannelDrawer({ systemId, unitId, mode, canManage, takenCodes, atLimit, onClose, onSaved }: Props) {
  const t = useTranslations("pos.channel") as ChannelT;
  const tr = useTranslations("pos.register") as RT;
  const item = mode.kind === "edit" ? mode.item : null;
  const isStore = item?.code === "STORE";
  const isBuiltin = item?.kind === "BUILTIN";
  const readOnly = !canManage || !!item?.archived || isStore || (mode.kind === "create" && atLimit);
  const nameOnly = !readOnly && isBuiltin;
  const moneyOff = readOnly || nameOnly;

  const [name, setName] = useState(item?.name ?? "");
  const [code, setCode] = useState("");
  const [choice, setChoice] = useState<PayoutChoice>(item ? choiceOf(item) : "NONE");
  const [choiceTouched, setChoiceTouched] = useState(false);
  const [pctTxt, setPctTxt] = useState(item ? hundredthsText(item.commissionBp) : "0");
  const [fixedTxt, setFixedTxt] = useState(item ? hundredthsText(item.commissionFixedSatang) : "0");
  const [vatBp, setVatBp] = useState(item?.commissionVatBp ?? 0);
  const [sortTxt, setSortTxt] = useState(item ? String(item.sortOrder) : "");
  const [busy, setBusy] = useState(false);
  const [fieldErr, setFieldErr] = useState<{ field: Field; text: string } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Esc = ปิด (ไม่มีตัวจับแป้นของหน้าขายในหน้าตั้งค่า) · ระหว่างบันทึกไม่ปิด
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  useEffect(() => {
    if (!readOnly) nameRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งแรกที่เปิดเท่านั้น
  }, []);

  const none = choice === "NONE";
  const bpParsed = none ? 0 : parseHundredths(pctTxt);
  const fixedParsed = none ? 0 : parseHundredths(fixedTxt);
  const vat = none ? 0 : vatBp;
  const payout: ChannelPayout = choice === "PLATFORM" ? "PLATFORM" : "DIRECT";
  const example = useMemo(() => {
    const r = channelCommission(EXAMPLE_GROSS, { commissionBp: bpParsed ?? 0, commissionFixedSatang: fixedParsed ?? 0, commissionVatBp: vat });
    return { ...r, net: EXAMPLE_GROSS - r.commissionSatang - r.commissionVatSatang };
  }, [bpParsed, fixedParsed, vat]);
  const presetOptions = CHANNEL_EXTERNAL_PRESETS.filter((p) => !takenCodes.has(p));

  const title = mode.kind === "create" ? t("drawer.titleCreate") : readOnly ? t("drawer.titleView") : t("edit");
  const shownName = item ? channelDisplayName(item.code, item.name, t) : "";

  const onCode = (raw: string) => {
    const v = raw.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, CODE_MAX);
    setCode(v);
    if (fieldErr?.field === "code") setFieldErr(null);
    // รหัสแพลตฟอร์มสำเร็จรูป ⇒ ค่าตั้งต้นของเซิร์ฟเวอร์ = แพลตฟอร์มโอนให้ (ยังไม่แตะตัวเลือก) · ชื่อว่าง = ชื่อแบรนด์
    if (isChannelExternalPreset(v)) {
      if (!choiceTouched) setChoice("PLATFORM");
      if (!name.trim()) setName(CHANNEL_PRESET_BRAND[v]?.name ?? v);
    }
  };

  /** ฟอร์ม → ChannelInput (null = ช่องตัวเลขผิดรูป · ตั้ง fieldErr แล้ว) */
  const buildInput = (): ChannelInput | null => {
    if (bpParsed === null || bpParsed > CHANNEL_BP_MAX) {
      setFieldErr({ field: "commissionBp", text: t("drawer.invalid.commissionBp") });
      return null;
    }
    if (fixedParsed === null || fixedParsed > CHANNEL_FIXED_MAX_SATANG) {
      setFieldErr({ field: "commissionFixedSatang", text: t("drawer.invalid.commissionFixedSatang") });
      return null;
    }
    const sortTrim = sortTxt.trim();
    const sort = sortTrim === "" ? undefined : /^\d{1,4}$/.test(sortTrim) ? Number(sortTrim) : NaN;
    if (sort !== undefined && Number.isNaN(sort)) {
      setFieldErr({ field: "sortOrder", text: t("drawer.invalid.sortOrder") });
      return null;
    }
    if (!item) {
      return {
        code,
        name,
        payout,
        commissionBp: bpParsed,
        commissionFixedSatang: fixedParsed,
        commissionVatBp: vat,
        ...(sort !== undefined ? { sortOrder: sort } : {}),
      };
    }
    // แก้: id + ชื่อ (ตัวแกะของเซิร์ฟเวอร์บังคับมีชื่อเสมอ) + เฉพาะคีย์ที่เปลี่ยน · ช่องทางพื้นฐานส่งแค่ชื่อ
    const input: ChannelInput = { id: item.id, name };
    if (nameOnly) return input;
    if (payout !== item.payout) input.payout = payout;
    if (bpParsed !== item.commissionBp) input.commissionBp = bpParsed;
    if (fixedParsed !== item.commissionFixedSatang) input.commissionFixedSatang = fixedParsed;
    if (vat !== item.commissionVatBp) input.commissionVatBp = vat;
    if (sort !== undefined && sort !== item.sortOrder) input.sortOrder = sort;
    return input;
  };

  const fieldOf = (f: string | undefined): Field | null => (f && (FIELDS as readonly string[]).includes(f) ? (f as Field) : null);

  const save = async () => {
    if (readOnly || busy) return;
    setFieldErr(null);
    setBanner(null);
    if (!item && takenCodes.has(code)) {
      setFieldErr({ field: "code", text: tr(refusalMessageKey("CHANNEL_CODE_TAKEN")) });
      return;
    }
    const input = buildInput();
    if (!input) return;
    const parsed = parseChannelInput(input);
    if (!parsed.ok) {
      const f = fieldOf(parsed.field) ?? (!item && !code ? "code" : null);
      if (f) setFieldErr({ field: f, text: t(`drawer.invalid.${f}`) });
      else setBanner(t("drawer.invalid.generic"));
      return;
    }
    if (!item && !parsed.value.code) {
      setFieldErr({ field: "code", text: t("drawer.invalid.code") });
      return;
    }
    setBusy(true);
    try {
      const r = await saveChannelAction({ systemId, unitId, input: parsed.value });
      if (r.ok) return onSaved(r.channel);
      const f = r.code === "CHANNEL_CODE_TAKEN" ? "code" : r.code === "VALIDATION" ? fieldOf(r.field) : null;
      if (f) setFieldErr({ field: f, text: r.code === "CHANNEL_CODE_TAKEN" ? tr(refusalMessageKey(r.code)) : t(`drawer.invalid.${f}`) });
      else setBanner(channelErrorText(r.code, t, tr));
    } catch {
      setBanner(tr("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!item || readOnly || isBuiltin || busy) return;
    setBusy(true);
    setBanner(null);
    try {
      const r = await archiveChannelAction({ systemId, unitId, id: item.id });
      if (r.ok) return onSaved(r.channel);
      setBanner(channelErrorText(r.code, t, tr));
      setConfirmArchive(false);
    } catch {
      setBanner(tr("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  const errFor = (f: Field) =>
    fieldErr?.field === f ? (
      <span data-testid="pos-channel-drawer-field-error" data-field={f} role="alert" className="text-[12.5px] text-[color:var(--color-danger)]">
        {fieldErr.text}
      </span>
    ) : null;
  const label = "flex flex-col gap-1.5 text-[13px] font-semibold";
  const input = "input h-11 w-full text-[15px] font-normal disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-muted)]";
  const payoutChoices: { v: PayoutChoice; key: string }[] = [
    { v: "PLATFORM", key: "payout.PLATFORM" },
    { v: "DIRECT", key: "payout.DIRECT" },
    { v: "NONE", key: "summary.none" },
  ];

  return (
    <RegisterDialog onDismiss={onClose} locked={busy}>
      <aside
        data-testid="pos-channel-drawer"
        className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[16px] bg-[color:var(--color-surface)] shadow-xl md:fixed md:inset-y-0 md:right-0 md:max-h-none md:w-[474px] md:max-w-full md:rounded-none"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="px-5 pt-2 md:hidden">
          <SheetGrab />
        </div>
        <header className="flex shrink-0 items-center gap-3 border-b px-5 py-3 md:px-7 md:py-[18px]">
          <RegisterIcon name="truck" size={20} />
          <span className="flex min-w-0 flex-1 flex-col">
            <h2 className="truncate text-[19px] font-bold">{title}</h2>
            {item && (
              <span className="truncate text-[12.5px] text-[color:var(--color-muted)]">
                {shownName} · {item.code} · {t(`kind.${item.kind}`)}
              </span>
            )}
          </span>
          <button
            data-testid="pos-channel-drawer-close"
            className="grid size-11 shrink-0 place-items-center rounded-[11px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
            type="button"
            aria-label={t("drawer.close")}
            disabled={busy}
            onClick={onClose}
          >
            <RegisterIcon name="x" size={18} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 md:px-7">
          {(isStore || nameOnly || item?.archived || !canManage || (mode.kind === "create" && atLimit)) && (
            <p data-testid="pos-channel-drawer-locked" className="flex items-start gap-2.5 rounded-[12px] bg-[color:var(--color-surface-2)] px-3.5 py-3 text-[13px] text-[color:var(--color-ink-soft)]">
              <RegisterIcon name="lock" size={14} className="mt-[3px] shrink-0" />
              <span>
                {!canManage
                  ? t("drawer.readOnly")
                  : item?.archived
                    ? t("drawer.archivedNote")
                    : isStore
                      ? t("drawer.lockedStore")
                      : nameOnly
                        ? t("drawer.lockedBuiltin")
                        : t("row.limit", { max: CHANNEL_LIMIT_PER_UNIT })}
              </span>
            </p>
          )}
          {banner && (
            <p data-testid="pos-channel-drawer-error" role="alert" className="rounded-[12px] border border-[color:var(--color-danger)] px-3.5 py-3 text-[13px] text-[color:var(--color-danger)]">
              {banner}
            </p>
          )}

          <label className={label}>
            {t("field.name")}
            <input
              ref={nameRef}
              data-testid="pos-channel-drawer-name"
              className={input}
              value={name}
              maxLength={CHANNEL_NAME_MAX}
              disabled={readOnly || busy}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErr?.field === "name") setFieldErr(null);
              }}
            />
            {errFor("name")}
          </label>

          {mode.kind === "create" && (
            <label className={label}>
              {t("field.code")}
              <input
                data-testid="pos-channel-drawer-code"
                className={`${input} font-mono uppercase tracking-wide`}
                value={code}
                maxLength={CODE_MAX}
                list="pos-channel-code-presets"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={readOnly || busy}
                onChange={(e) => onCode(e.target.value)}
              />
              <datalist id="pos-channel-code-presets">
                {presetOptions.map((p) => (
                  <option key={p} value={p}>
                    {CHANNEL_PRESET_BRAND[p]?.name ?? p}
                  </option>
                ))}
              </datalist>
              <span className="text-[12px] font-normal text-[color:var(--color-muted)]">{t("drawer.codeHint")}</span>
              {errFor("code")}
            </label>
          )}

          <fieldset className="flex flex-col gap-2" disabled={moneyOff || busy}>
            <legend className="mb-1.5 text-[13px] font-semibold">{t("field.payout")}</legend>
            {payoutChoices.map((p) => {
              const on = choice === p.v;
              return (
                <button
                  key={p.v}
                  data-testid={`pos-channel-drawer-payout-${p.v.toLowerCase()}`}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`flex min-h-12 items-start gap-3 rounded-[12px] border px-3.5 py-2.5 text-left disabled:cursor-not-allowed ${
                    on ? "border-[color:var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : ""
                  } ${moneyOff ? "opacity-70" : ""}`}
                  onClick={() => {
                    setChoice(p.v);
                    setChoiceTouched(true);
                  }}
                >
                  <span aria-hidden className={`mt-[3px] grid size-[18px] shrink-0 place-items-center rounded-full border-2 ${on ? "border-[color:var(--color-ink)]" : "border-[color:var(--color-line)]"}`}>
                    {on && <span className="size-2 rounded-full bg-[color:var(--color-ink)]" />}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[14px] font-semibold">{t(p.key)}</span>
                    <span className="text-[12px] text-[color:var(--color-muted)]">{t(`drawer.payoutHint.${p.v}`)}</span>
                  </span>
                </button>
              );
            })}
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              {t("field.commissionBp")}
              <input
                data-testid="pos-channel-drawer-commission"
                className={input}
                inputMode="decimal"
                value={none ? "0" : pctTxt}
                disabled={moneyOff || none || busy}
                onChange={(e) => {
                  setPctTxt(e.target.value);
                  if (fieldErr?.field === "commissionBp") setFieldErr(null);
                }}
              />
              {errFor("commissionBp")}
            </label>
            <label className={label}>
              {t("field.commissionFixed")}
              <input
                data-testid="pos-channel-drawer-fixed"
                className={input}
                inputMode="decimal"
                value={none ? "0" : fixedTxt}
                disabled={moneyOff || none || busy}
                onChange={(e) => {
                  setFixedTxt(e.target.value);
                  if (fieldErr?.field === "commissionFixedSatang") setFieldErr(null);
                }}
              />
              {errFor("commissionFixedSatang")}
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">{t("field.commissionVat")}</span>
            <div data-testid="pos-channel-drawer-vat" role="radiogroup" aria-label={t("field.commissionVat")} className="inline-flex w-fit overflow-hidden rounded-[11px] border">
              {VAT_CHOICES.map((v) => {
                const on = vat === v;
                return (
                  <button
                    key={v}
                    data-testid={`pos-channel-drawer-vat-${v / 100}`}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={moneyOff || none || busy}
                    className={`min-h-11 min-w-[72px] px-4 text-[14px] tabular-nums disabled:cursor-not-allowed ${on ? "bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]" : "bg-[color:var(--color-surface)]"} ${
                      moneyOff || none ? "opacity-60" : ""
                    }`}
                    onClick={() => setVatBp(v)}
                  >
                    {`${v / 100} %`}
                  </button>
                );
              })}
            </div>
            {errFor("commissionVatBp")}
          </div>

          <label className={`${label} max-w-[160px]`}>
            {t("drawer.sort")}
            <input
              data-testid="pos-channel-drawer-sort"
              className={input}
              inputMode="numeric"
              value={sortTxt}
              placeholder={item ? undefined : t("drawer.sortAuto")}
              disabled={moneyOff || busy}
              onChange={(e) => {
                setSortTxt(e.target.value);
                if (fieldErr?.field === "sortOrder") setFieldErr(null);
              }}
            />
            {errFor("sortOrder")}
          </label>

          <div data-testid="pos-channel-example" className="flex flex-col gap-1 rounded-[12px] border border-dashed px-3.5 py-3 text-[13px]">
            <span className="text-[12px] font-semibold text-[color:var(--color-muted)]">{t("drawer.exampleTitle")}</span>
            <span className="tabular-nums text-[color:var(--color-ink-soft)]">
              {example.commissionVatSatang > 0
                ? t("drawer.exampleVat", {
                    gross: moneyText(EXAMPLE_GROSS),
                    commission: moneyText(example.commissionSatang),
                    vat: moneyText(example.commissionVatSatang),
                    net: moneyText(example.net),
                  })
                : t("example", { gross: moneyText(EXAMPLE_GROSS), commission: moneyText(example.commissionSatang), net: moneyText(example.net) })}
            </span>
          </div>

          {item && !readOnly && !isBuiltin && (
            <div className="flex flex-col gap-2 border-t pt-4">
              {!confirmArchive ? (
                <button
                  data-testid="pos-channel-drawer-archive"
                  type="button"
                  disabled={busy}
                  className="inline-flex min-h-11 w-fit items-center gap-2 text-[13.5px] font-semibold text-[color:var(--color-danger)]"
                  onClick={() => setConfirmArchive(true)}
                >
                  <RegisterIcon name="box" size={15} />
                  {t("archive")}
                </button>
              ) : (
                <div data-testid="pos-channel-drawer-archive-confirm-box" role="alertdialog" aria-label={t("archive")} className="flex flex-col gap-3 rounded-[12px] border border-[color:var(--color-danger)] px-3.5 py-3">
                  <p className="text-[13px] text-[color:var(--color-ink-soft)]">{t("drawer.archiveNote")}</p>
                  <div className="flex flex-wrap gap-2">
                    <button data-testid="pos-channel-drawer-archive-cancel" type="button" disabled={busy} className="btn btn-ghost h-11 rounded-[11px] px-4 text-[13.5px]" onClick={() => setConfirmArchive(false)}>
                      {t("drawer.cancel")}
                    </button>
                    <button
                      data-testid="pos-channel-drawer-archive-confirm"
                      type="button"
                      disabled={busy}
                      className="btn h-11 rounded-[11px] border-[color:var(--color-danger)] bg-[color:var(--color-danger)] px-4 text-[13.5px] font-semibold text-white disabled:opacity-60"
                      onClick={() => void archive()}
                    >
                      {busy ? t("drawer.saving") : t("drawer.archiveConfirm")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 gap-2.5 border-t px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))] md:px-7 md:py-4">
          <button data-testid="pos-channel-drawer-cancel" type="button" disabled={busy} className="btn btn-ghost h-12 flex-1 rounded-[12px] text-[15px]" onClick={onClose}>
            {t("drawer.close")}
          </button>
          {!readOnly && (
            <button data-testid="pos-channel-drawer-save" type="button" disabled={busy} className="btn btn-primary h-12 flex-[2] rounded-[12px] text-[15px] font-semibold disabled:opacity-60" onClick={() => void save()}>
              {busy ? t("drawer.saving") : t("drawer.save")}
            </button>
          )}
        </footer>
      </aside>
    </RegisterDialog>
  );
}
