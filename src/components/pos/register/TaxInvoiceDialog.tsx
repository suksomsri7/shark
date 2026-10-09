"use client";

// TaxInvoiceDialog.tsx — กล่อง "ออกใบกำกับภาษีเต็มรูป" (POS P1.13U · ภาพ 15A · มติ 1–4)
//   ใช้สองที่: (ก) หน้าขาย — ปุ่ม "ใบกำกับเต็มรูป" ท้ายตะกร้า / สวิตช์ท้ายจอชำระ (โหมด sale: เก็บผู้ซื้อไว้ในตะกร้า → ส่งไปกับ submit)
//              (ข) ลิ้นชักบิล — ขอใบเต็มรูปทีหลัง / ออกจากคำขอของลูกค้า (โหมด issue: กด "ออกใบกำกับ" = เรียก action แล้วแสดงผลในกล่อง)
//   โครง (15A): หัว (เอกสาร · ชื่อ · ชิปเลขบิล/ยอด · ✕) → แถบชนิด บุคคลธรรมดา | นิติบุคคล → เลขผู้เสียภาษี (✓ เมื่อหลักตรวจถูก) + ค้นจากกรมพัฒน์ (DBD)
//     → การ์ดผลค้น + "ใช้ข้อมูลนี้" → ชื่อผู้ซื้อ · ที่อยู่ → สาขา (สำนักงานใหญ่ | สาขาที่ _____) + อีเมลรับ e-Tax (ไม่บังคับ) → บรรทัดข้อมูล
//     → ท้าย: ติ๊ก "จำไว้กับสมาชิก" (มีสมาชิกเท่านั้น) · ยกเลิก · ปุ่มหลัก
// 🔴 ตรวจฟอร์มด้วยตัวแกะบริสุทธิ์ของเซิร์ฟเวอร์ (tax-invoice-shared) — เซิร์ฟเวอร์ตรวจซ้ำเสมอ · ข้อความจากคีย์เท่านั้น (ไม่แสดง message ของเซิร์ฟเวอร์)
// 🔴 DBD: ปุ่มเฉพาะนิติบุคคลและเลขผ่านหลักตรวจ · DBD_NOT_CONFIGURED = ซ่อนปุ่มทั้งรอบการใช้งาน (พ่อเก็บธง) แล้วบอก "กรอกเอง"
// 🔴 ไม่มีข้อความไทยฮาร์ดโค้ดนอกคอมเมนต์ · testid ขึ้นต้น pos-taxinv- เขียนตรงบนแท็ก

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { buyerProfileForMemberAction, lookupBuyerByTaxIdAction } from "@/lib/modules/pos/tax-invoice-actions";
import {
  HEAD_OFFICE_BRANCH_CODE,
  TAX_INVOICE_ADDRESS_MAX,
  TAX_INVOICE_EMAIL_MAX,
  TAX_INVOICE_NAME_MAX,
  buyerKindFromTaxId,
  isValidThaiTaxIdChecksum,
  parseTaxInvoiceBuyer,
  taxInvoiceRefusalKey,
  type TaxInvoiceBuyerInput,
  type TaxInvoiceBuyerKind,
  type TaxInvoiceBuyerSource,
} from "@/lib/modules/pos/tax-invoice-shared";
import { RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";

type Lookup = Awaited<ReturnType<typeof lookupBuyerByTaxIdAction>>;
type DbdHit = Extract<Lookup, { found: true }>["buyer"];
/** ผลของปุ่มหลักในโหมด issue — errorKey = คีย์ใต้ `pos` (taxInvoiceRefusalKey) · ไม่มี = สำเร็จ (พ่อปิดกล่องเอง) */
export type TaxInvoiceSubmitResult = { errorKey?: string } | void;

type Props = {
  mode: "sale" | "issue";
  systemId: string;
  unitId: string;
  /** ชิปบนหัว เช่น "R2609-000318 · ฿625" (ไม่ส่ง = ไม่มีชิป) */
  chip?: string | null;
  /** ผู้ซื้อที่กรอกไว้แล้ว (แก้) / จากคำขอของลูกค้า — null = ฟอร์มว่าง (มีสมาชิก ⇒ ลองเติมจากที่จำไว้) */
  initial: TaxInvoiceBuyerInput | null;
  /** บิลมีสมาชิก ⇒ ช่อง "จำไว้กับสมาชิก" + เติมจากโปรไฟล์ที่จำไว้ */
  memberId: string | null;
  memberName?: string | null;
  initialRemember?: boolean;
  /** ร้านนี้ไม่มีกุญแจ DBD (รู้แล้วจากครั้งก่อนในรอบนี้) ⇒ ไม่มีปุ่มค้น */
  dbdOff: boolean;
  onDbdOff: () => void;
  /** ข้อความผิดพลาดจากภายนอก (คีย์ใต้ pos · เช่น submit ตอบ TAX_ID_INVALID แล้วเปิดกล่องนี้ซ้ำ) */
  externalErrorKey?: string | null;
  onCancel: () => void;
  onSave: (buyer: TaxInvoiceBuyerInput, remember: boolean) => TaxInvoiceSubmitResult | Promise<TaxInvoiceSubmitResult>;
  /** fix F3: ออกจากคำขอของลูกค้า — เลขที่ลูกค้าขอ (แก้เป็นเลขอื่น = แจ้งก่อนกดว่าคำขอจะถูกปฏิเสธ) */
  requestTaxId?: string | null;
  /** ลิ้นชักบิล: Esc ปิดกล่องเอง (หน้าขายมีตัวจับ Esc กลางอยู่แล้ว) */
  escClose?: boolean;
};

/** ตัดช่องว่าง/ขีดระหว่างพิมพ์ (follow-up 1) · ยาวไม่เกิน 13 */
const cleanTaxId = (v: string) => v.replace(/[\s\-‐-―]/g, "").slice(0, 13);
const cleanBranch = (v: string) => v.replace(/\D/g, "").slice(0, 5);

export function TaxInvoiceDialog(p: Props) {
  const t = useTranslations("pos.register.taxInvoice");
  const tp = useTranslations("pos");
  const init = p.initial;
  const [kind, setKind] = useState<TaxInvoiceBuyerKind>(init?.kind ?? "JURISTIC");
  const kindTouched = useRef(!!init);
  const [taxId, setTaxId] = useState(init ? cleanTaxId(init.taxId) : "");
  const [name, setName] = useState(init?.name ?? "");
  const [address, setAddress] = useState(init?.address ?? "");
  const initBranch = init?.branchCode && init.branchCode !== HEAD_OFFICE_BRANCH_CODE ? init.branchCode : "";
  const [hq, setHq] = useState(!initBranch);
  const [branch, setBranch] = useState(initBranch);
  const [email, setEmail] = useState(init?.email ?? "");
  const [source, setSource] = useState<TaxInvoiceBuyerSource>(init?.source ?? "MANUAL");
  const [remember, setRemember] = useState(!!p.initialRemember);
  const [profileUsed, setProfileUsed] = useState(init?.source === "PROFILE");
  const [dbd, setDbd] = useState<{ state: "idle" | "busy" } | { state: "hit"; buyer: DbdHit } | { state: "miss" } | { state: "manual" } | { state: "err"; key: string }>({ state: "idle" });
  const [busy, setBusy] = useState(false);
  const [errKey, setErrKey] = useState<string | null>(p.externalErrorKey ?? null);
  const [tried, setTried] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  /** F4: ผู้ใช้แตะช่องใดแล้ว ⇒ ไม่เติมจากผู้ซื้อที่จำไว้ทับ (คำตอบโปรไฟล์มาช้า) */
  const touched = useRef(false);

  // ลิ้นชักบิล: Esc ปิด (ไม่ปิดระหว่างส่ง)
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const { escClose, onCancel } = p;
  useEffect(() => {
    if (!escClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing && !busyRef.current) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [escClose, onCancel]);

  // มีสมาชิก + ฟอร์มว่าง ⇒ เติมจากผู้ซื้อที่จำไว้ (source PROFILE) — ผิดพลาด = เงียบ (กรอกเองได้)
  const { systemId, unitId, memberId } = p;
  const hadInitial = !!init;
  useEffect(() => {
    if (hadInitial || !memberId) return;
    let live = true;
    void (async () => {
      try {
        const r = await buyerProfileForMemberAction({ systemId, unitId, memberId });
        if (!live || touched.current || !r.ok || !r.profile) return;
        const pr = r.profile;
        kindTouched.current = true;
        setKind(pr.kind);
        setTaxId(cleanTaxId(pr.taxId));
        setName(pr.name);
        setAddress(pr.address);
        const b = pr.branchCode && pr.branchCode !== HEAD_OFFICE_BRANCH_CODE ? pr.branchCode : "";
        setHq(!b);
        setBranch(b);
        setEmail(pr.email ?? "");
        setSource("PROFILE");
        setProfileUsed(true);
        setRemember(true);
      } catch {
        /* เติมไม่ได้ — กรอกเอง */
      }
    })();
    return () => {
      live = false;
    };
  }, [hadInitial, memberId, systemId, unitId]);

  useEffect(() => {
    if (!hadInitial) firstRef.current?.focus({ preventScroll: true });
  }, [hadInitial]);

  const digits13 = /^\d{13}$/.test(taxId);
  const taxOk = digits13 && isValidThaiTaxIdChecksum(taxId);
  const taxBad = (taxId.length === 13 || /\D/.test(taxId) || (tried && taxId.length > 0)) && !taxOk;
  const branchOk = hq || /^\d{5}$/.test(branch);
  const nameLeft = name.trim().length > 0;
  const addrLeft = address.trim().length > 0;
  const emailBad = email.trim().length > 0 && !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email.trim());
  const ready = taxOk && nameLeft && addrLeft && branchOk && !emailBad;
  const showDbd = kind === "JURISTIC" && !p.dbdOff;

  const edited = () => {
    touched.current = true;
    setErrKey(null);
    if (source !== "MANUAL") {
      setSource("MANUAL");
      setProfileUsed(false);
    }
  };
  const onTaxId = (v: string) => {
    const next = cleanTaxId(v);
    if (next !== taxId) lookupFor.current = null; // F1: คำตอบ DBD ที่ค้างอยู่ใช้ไม่ได้แล้ว
    setTaxId(next);
    edited();
    if (dbd.state !== "idle" && dbd.state !== "manual") setDbd({ state: "idle" });
    // ชนิดตั้งต้นจากหลักแรกเมื่อพิมพ์ครบ 13 หลัก (0 = นิติบุคคล) — ผู้ใช้เลือกเองแล้วไม่ทับ
    if (!kindTouched.current && /^\d{13}$/.test(next)) setKind(buyerKindFromTaxId(next));
  };
  const pickKind = (k: TaxInvoiceBuyerKind) => {
    touched.current = true;
    kindTouched.current = true;
    setKind(k);
    setErrKey(null);
  };

  // F1: คำตอบ DBD ผูกกับเลขที่ส่งไป — ช่องเลขเปลี่ยนระหว่างรอ = ทิ้งคำตอบ (คำตอบช้าห้ามเติมชื่อ/ที่อยู่ของอีกเลข) · ช่องยังแก้ได้ระหว่างรอ
  const taxIdNow = useRef(taxId);
  taxIdNow.current = taxId;
  const lookupFor = useRef<string | null>(null);
  const lookup = async () => {
    if (!taxOk || dbd.state === "busy") return;
    const sent = taxId;
    lookupFor.current = sent;
    setDbd({ state: "busy" });
    const stale = () => lookupFor.current !== sent || taxIdNow.current !== sent;
    try {
      const r = await lookupBuyerByTaxIdAction({ systemId, unitId, taxId: sent });
      if (r.ok === false && r.code === "DBD_NOT_CONFIGURED") p.onDbdOff(); // ไม่มีกุญแจ = ทั้งร้าน ไม่ขึ้นกับเลข
      if (stale()) return;
      if (r.ok) setDbd(r.found ? { state: "hit", buyer: r.buyer } : { state: "miss" });
      else if (r.code === "DBD_NOT_CONFIGURED") setDbd({ state: "manual" }); else setDbd({ state: "err", key: taxInvoiceRefusalKey(r.code) });
    } catch {
      if (!stale()) setDbd({ state: "err", key: taxInvoiceRefusalKey("DBD_UNAVAILABLE") });
    }
  };
  const applyHit = (b: DbdHit) => {
    if (b.taxId !== taxIdNow.current) return; // F1: การ์ดของเลขอื่น
    setKind("JURISTIC");
    kindTouched.current = true;
    setName(b.name);
    setAddress(b.address);
    setHq(true);
    setBranch("");
    setSource("DBD");
    setProfileUsed(false);
    setErrKey(null);
    setDbd({ state: "idle" });
  };

  const submit = async () => {
    if (busy) return;
    setTried(true);
    if (!ready) {
      setErrKey(taxInvoiceRefusalKey(taxOk ? "VALIDATION" : "TAX_ID_INVALID"));
      return;
    }
    const input: TaxInvoiceBuyerInput = {
      kind,
      name,
      taxId,
      branchCode: hq ? HEAD_OFFICE_BRANCH_CODE : branch,
      address,
      email: email.trim() ? email : null,
      source,
    };
    const parsed = parseTaxInvoiceBuyer(input);
    if (!parsed.ok) {
      setErrKey(taxInvoiceRefusalKey(parsed.code));
      return;
    }
    const b = parsed.buyer;
    const out: TaxInvoiceBuyerInput = { kind: b.kind, name: b.name, taxId: b.taxId, branchCode: b.branchCode, address: b.address, email: b.email, source: b.source };
    setBusy(true);
    setErrKey(null);
    try {
      const r = await p.onSave(out, !!p.memberId && remember);
      if (r && r.errorKey) setErrKey(r.errorKey);
    } catch {
      setErrKey(taxInvoiceRefusalKey("INTERNAL"));
    } finally {
      setBusy(false);
    }
  };

  const seg = (on: boolean) =>
    `flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] px-3 text-[14px] transition-colors ${
      on ? "bg-[color:var(--color-surface)] font-bold text-[color:var(--color-ink)] shadow-[0_0_0_1px_var(--color-line)]" : "text-[color:var(--color-ink-soft)]"
    }`;
  const label = "text-[12.5px] font-bold text-[color:var(--color-ink)]";
  const input = "input h-12 w-full rounded-[11px] text-[15px]";

  return (
    <RegisterDialog onDismiss={() => (busy ? undefined : p.onCancel())} locked={busy}>
      <div
        data-testid="pos-taxinv-dialog"
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[16px] bg-[color:var(--color-surface)] shadow-xl md:w-[560px] md:max-w-[calc(100vw-32px)] md:rounded-[18px]"
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
      >
        <SheetGrab />
        {/* ── หัว ── */}
        <div className="flex shrink-0 items-center gap-3 border-b px-5 py-3 md:px-6 md:py-4">
          <RegisterIcon name="doc" size={18} />
          <h2 className="text-[17px] font-bold md:text-[18px]">{t("title")}</h2>
          {p.chip ? (
            <span data-testid="pos-taxinv-chip" className="inline-flex h-7 items-center whitespace-nowrap rounded-[8px] border px-2.5 text-[12.5px] tabular-nums text-[color:var(--color-ink-soft)]">
              {p.chip}
            </span>
          ) : null}
          <span className="flex-1" />
          <button
            data-testid="pos-taxinv-close"
            className="-mr-2 grid size-11 place-items-center rounded-[11px] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
            type="button"
            aria-label={t("close")}
            disabled={busy}
            onClick={p.onCancel}
          >
            <RegisterIcon name="x" size={18} />
          </button>
        </div>

        <form
          data-testid="pos-taxinv-form"
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onInputCapture={() => {
            touched.current = true; // F4: พิมพ์ช่องใดก็ได้ = แตะแล้ว
          }}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 md:px-6">
            {profileUsed ? (
              <p data-testid="pos-taxinv-profile" className="inline-flex items-center gap-2 self-start rounded-[8px] bg-[color:var(--color-surface-2)] px-2.5 py-1 text-[12.5px] text-[color:var(--color-ink-soft)]">
                <RegisterIcon name="check" size={12} />
                {t("profileUsed")}
              </p>
            ) : null}

            {/* ชนิดผู้ซื้อ */}
            <div className="flex gap-1 self-start rounded-[13px] bg-[color:var(--color-surface-2)] p-1" role="radiogroup" aria-label={t("kind")}>
              <button data-testid="pos-taxinv-kind-person" className={seg(kind === "PERSON")} type="button" role="radio" aria-checked={kind === "PERSON"} disabled={busy} onClick={() => pickKind("PERSON")}>
                <RegisterIcon name="users" size={14} />
                {t("kindPerson")}
              </button>
              <button data-testid="pos-taxinv-kind-juristic" className={seg(kind === "JURISTIC")} type="button" role="radio" aria-checked={kind === "JURISTIC"} disabled={busy} onClick={() => pickKind("JURISTIC")}>
                <RegisterIcon name="shop" size={14} />
                {t("kindJuristic")}
              </button>
            </div>

            {/* เลขผู้เสียภาษี + DBD */}
            <div className="flex flex-col gap-1.5">
              <label className={label} htmlFor="pos-taxinv-taxid">
                {t("taxId")} <span className="font-normal text-[color:var(--color-muted)]">· {t("taxIdHint")}</span>
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <input
                    id="pos-taxinv-taxid"
                    data-testid="pos-taxinv-taxid"
                    ref={firstRef}
                    className={`${input} pr-10 font-bold tabular-nums tracking-[0.02em] ${taxBad ? "border-[color:var(--color-danger)]" : taxOk ? "border-[color:var(--color-ink)]" : ""}`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={taxId}
                    placeholder="0000000000000"
                    aria-invalid={taxBad}
                    aria-describedby="pos-taxinv-taxid-state"
                    disabled={busy}
                    onChange={(e) => onTaxId(e.target.value)}
                  />
                  {taxOk ? (
                    <span data-testid="pos-taxinv-taxid-ok" className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--color-ink)]" aria-label={t("taxIdOk")}>
                      <RegisterIcon name="check" size={16} />
                    </span>
                  ) : null}
                </div>
                {showDbd ? (
                  <button
                    data-testid="pos-taxinv-dbd"
                    className="btn btn-ghost h-12 shrink-0 gap-2 rounded-[11px] px-4 text-[14px] disabled:opacity-50"
                    type="button"
                    disabled={!taxOk || busy || dbd.state === "busy"}
                    onClick={() => void lookup()}
                  >
                    <RegisterIcon name="search" size={14} />
                    {dbd.state === "busy" ? t("dbdSearching") : t("dbdSearch")}
                  </button>
                ) : null}
              </div>
              <p id="pos-taxinv-taxid-state" className="min-h-[18px] text-[12.5px]" aria-live="polite">
                {taxBad ? (
                  <span data-testid="pos-taxinv-taxid-bad" className="text-[color:var(--color-danger)]">
                    {t("taxIdBad")}
                  </span>
                ) : null}
              </p>
            </div>

            {dbd.state === "hit" ? (
              <div data-testid="pos-taxinv-dbd-result" className="flex items-start gap-3 rounded-[14px] border-[1.5px] border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft,var(--color-surface-2))] p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[color:var(--color-surface)] text-[color:var(--color-accent)]">
                  <RegisterIcon name="shop" size={16} />
                </span>
                <div className="min-w-0 flex-1 text-[13px] leading-[1.55]">
                  <div className="text-[14.5px] font-bold">{dbd.buyer.name}</div>
                  <div className="break-words text-[color:var(--color-ink-soft)]">
                    {dbd.buyer.address} · {t("headOfficeCode")}
                  </div>
                  <div className="font-semibold text-[color:var(--color-accent)]">{dbd.buyer.status ? t("dbdFoundStatus", { status: dbd.buyer.status }) : t("dbdFound")}</div>
                </div>
                <button data-testid="pos-taxinv-dbd-use" className="btn btn-primary h-11 shrink-0 gap-1.5 rounded-[11px] px-4 text-[13.5px]" type="button" disabled={busy} onClick={() => applyHit(dbd.buyer)}>
                  <RegisterIcon name="check" size={13} />
                  {t("dbdUse")}
                </button>
              </div>
            ) : dbd.state === "miss" || dbd.state === "manual" || dbd.state === "err" ? (
              <p data-testid="pos-taxinv-dbd-note" data-state={dbd.state} className="-mt-2 text-[12.5px] text-[color:var(--color-ink-soft)]" role="status">
                {dbd.state === "miss" ? t("dbdNotFound") : dbd.state === "manual" ? t("dbdManual") : tp(dbd.key)}
              </p>
            ) : kind === "JURISTIC" && p.dbdOff ? (
              <p data-testid="pos-taxinv-dbd-note" data-state="manual" className="-mt-2 text-[12.5px] text-[color:var(--color-muted)]">
                {t("dbdManual")}
              </p>
            ) : null}

            {/* ชื่อ · ที่อยู่ */}
            <div className="flex flex-col gap-1.5">
              <label className={label} htmlFor="pos-taxinv-name">
                {t("name")}
              </label>
              <input
                id="pos-taxinv-name"
                data-testid="pos-taxinv-name"
                className={`${input} ${tried && !nameLeft ? "border-[color:var(--color-danger)]" : ""}`}
                value={name}
                maxLength={TAX_INVOICE_NAME_MAX}
                autoComplete="organization"
                aria-invalid={tried && !nameLeft}
                disabled={busy}
                onChange={(e) => {
                  setName(e.target.value);
                  edited();
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={label} htmlFor="pos-taxinv-address">
                {t("address")}
              </label>
              <textarea
                id="pos-taxinv-address"
                data-testid="pos-taxinv-address"
                className={`input min-h-[48px] w-full resize-y rounded-[11px] py-3 text-[15px] leading-[1.5] ${tried && !addrLeft ? "border-[color:var(--color-danger)]" : ""}`}
                rows={2}
                value={address}
                maxLength={TAX_INVOICE_ADDRESS_MAX}
                autoComplete="street-address"
                aria-invalid={tried && !addrLeft}
                disabled={busy}
                onChange={(e) => {
                  setAddress(e.target.value);
                  edited();
                }}
              />
            </div>

            {/* สาขา · อีเมล */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr]">
              <fieldset
                className="flex min-w-0 flex-col gap-1.5"
                onClickCapture={() => {
                  touched.current = true; // F4: เลือกสาขา = แตะแล้ว
                }}
              >
                <legend className={`${label} mb-1.5`}>{t("branch")}</legend>
                <div className="flex gap-2">
                  <button
                    data-testid="pos-taxinv-branch-hq"
                    className={`flex h-12 flex-1 items-center gap-2 rounded-[11px] border px-3 text-[13.5px] ${hq ? "border-[1.5px] border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-ink-soft)]"}`}
                    type="button"
                    role="radio"
                    aria-checked={hq}
                    disabled={busy}
                    onClick={() => {
                      setHq(true);
                      setErrKey(null);
                    }}
                  >
                    <span className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${hq ? "border-[color:var(--color-ink)]" : "border-[color:var(--color-line)]"}`}>
                      {hq ? <span className="size-2 rounded-full bg-[color:var(--color-ink)]" /> : null}
                    </span>
                    <span className="truncate">{t("headOffice")}</span>
                  </button>
                  <label
                    className={`flex h-12 flex-1 items-center gap-2 rounded-[11px] border px-3 text-[13.5px] ${!hq ? "border-[1.5px] border-[color:var(--color-ink)]" : "text-[color:var(--color-ink-soft)]"} ${!hq && !branchOk && tried ? "border-[color:var(--color-danger)]" : ""}`}
                  >
                    <button
                      data-testid="pos-taxinv-branch-other"
                      className="flex shrink-0 items-center gap-2"
                      type="button"
                      role="radio"
                      aria-checked={!hq}
                      disabled={busy}
                      onClick={() => {
                        setHq(false);
                        setErrKey(null);
                      }}
                    >
                      <span className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${!hq ? "border-[color:var(--color-ink)]" : "border-[color:var(--color-line)]"}`}>
                        {!hq ? <span className="size-2 rounded-full bg-[color:var(--color-ink)]" /> : null}
                      </span>
                      <span className={!hq ? "font-bold" : ""}>{t("branchNo")}</span>
                    </button>
                    <input
                      data-testid="pos-taxinv-branch-code"
                      className="h-9 w-full min-w-0 border-b border-dashed border-[color:var(--color-line)] bg-transparent text-[14px] tabular-nums outline-none"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="_____"
                      value={branch}
                      aria-label={t("branchCode")}
                      disabled={busy}
                      onFocus={() => setHq(false)}
                      onChange={(e) => {
                        setBranch(cleanBranch(e.target.value));
                        setHq(false);
                        setErrKey(null);
                      }}
                    />
                  </label>
                </div>
              </fieldset>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label className={label} htmlFor="pos-taxinv-email">
                  {t("email")} <span className="font-normal text-[color:var(--color-muted)]">{t("optional")}</span>
                </label>
                <input
                  id="pos-taxinv-email"
                  data-testid="pos-taxinv-email"
                  className={`${input} ${emailBad && tried ? "border-[color:var(--color-danger)]" : ""}`}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  maxLength={TAX_INVOICE_EMAIL_MAX}
                  placeholder="account@example.co.th"
                  aria-invalid={emailBad}
                  disabled={busy}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrKey(null);
                  }}
                />
              </div>
            </div>

            <p data-testid="pos-taxinv-info" className="flex items-start gap-2 rounded-[12px] bg-[color:var(--color-surface-2)] px-3.5 py-3 text-[12.5px] leading-[1.55] text-[color:var(--color-ink-soft)]">
              <RegisterIcon name="doc" size={13} className="mt-0.5 shrink-0" />
              <span>{p.mode === "sale" ? t("info") : t("infoIssue")}</span>
            </p>

            {p.requestTaxId && taxId !== p.requestTaxId ? (
              <p data-testid="pos-taxinv-request-changed" className="flex items-start gap-2 rounded-[12px] border border-[color:var(--color-danger)] px-3.5 py-3 text-[12.5px] leading-[1.55] text-[color:var(--color-danger)]" role="status">
                <RegisterIcon name="warn" size={13} className="mt-0.5 shrink-0" />
                <span>{tp("bills.taxInvoice.requestTaxIdChanged")}</span>
              </p>
            ) : null}

            {errKey ? (
              <p data-testid="pos-taxinv-error" className="text-[13.5px] font-semibold text-[color:var(--color-danger)]" role="alert">
                {tp(errKey)}
              </p>
            ) : null}
          </div>

          {/* ── ท้าย ── */}
          <div className="flex shrink-0 flex-col gap-3 border-t px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:items-center md:px-6 md:py-4">
            {p.memberId ? (
              <label className="flex min-h-11 flex-1 items-center gap-2.5 text-[13.5px]">
                <input data-testid="pos-taxinv-remember" type="checkbox" className="size-5 accent-[color:var(--color-ink)]" checked={remember} disabled={busy} onChange={(e) => setRemember(e.target.checked)} />
                <span className="min-w-0">{p.memberName ? t("rememberMember", { name: p.memberName }) : t("rememberMemberNoName")}</span>
              </label>
            ) : (
              <span className="hidden flex-1 sm:block" />
            )}
            <div className="grid grid-cols-2 gap-2.5 sm:flex">
              <button data-testid="pos-taxinv-cancel" className="btn btn-ghost h-12 rounded-[12px] px-5 text-[14.5px]" type="button" disabled={busy} onClick={p.onCancel}>
                {t("cancel")}
              </button>
              <button
                data-testid="pos-taxinv-submit"
                className="btn btn-primary h-12 rounded-[12px] px-5 text-[14.5px] font-bold disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={busy}
                aria-busy={busy}
              >
                {busy ? t("working") : p.mode === "sale" ? t("saveBack") : t("issue")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </RegisterDialog>
  );
}
