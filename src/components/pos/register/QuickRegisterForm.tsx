"use client";

// QuickRegisterForm.tsx — สมัครสมาชิกด่วนในแผงสมาชิก (POS P1.12U มติ 4 · ภาพ 14A ครึ่งล่าง)
//   เบอร์โทร (เติมจากคำค้นที่เป็นตัวเลขล้วน จนกว่าจะแก้เอง) · ชื่อ · วันเกิด (ไม่บังคับ · พิมพ์ "วว / ดด / ปปปป" → YYYY-MM-DD ·
//   ปี พ.ศ. แปลงให้) · ยินยอมรับข่าวสาร (PDPA · ปริยายปิด) · ที่มา (หน้าร้าน ปริยาย · LINE · บอกต่อ · โฆษณา) · ปุ่มดำ "+ สมัครและผูกกับบิลนี้"
//   ปุ่มเปิดเมื่อเบอร์ 9–10 หลัก + ชื่อ ≥ 1 ตัว · วันเกิดผิด = บรรทัดแดงใต้ช่อง ไม่ส่ง
//   idempotencyKey = คีย์ของการเปิดฟอร์มครั้งนี้ (RegisterScreen สร้าง — S5.21 ห้ามสร้างคีย์ในไฟล์อื่น) · กดซ้ำ = คนเดิม
//   ผล: ok (created true/false) ⇒ onDone (ผูก + ปิด + ข้อความลอย) · ปฏิเสธ ⇒ บรรทัดแดงใต้ฟอร์มด้วย refusalMessageKey
// 🔴 เบอร์เต็มอยู่ในช่องที่แคชเชียร์พิมพ์เท่านั้น (CD8) · ไม่มีข้อความไทยนอกคอมเมนต์

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { refusalMessageKey, REGISTER_HEARD_FROM, type RegisterHeardFrom, type RegisterMemberItem } from "@/lib/modules/pos/register-shared";
import { maskBirthDateInput, parseBirthDateInput, quickPhoneReady } from "@/lib/modules/pos/register-member-shared";
import { registerQuickMemberAction } from "@/lib/modules/pos/register-actions";
import { RegisterIcon } from "./RegisterIcon";

const HEARD_KEY: Record<RegisterHeardFrom, string> = { WALK_IN: "heardWalkIn", LINE: "heardLine", REFERRAL: "heardReferral", ADS: "heardAds" };

export function QuickRegisterForm(p: {
  systemId: string;
  unitId: string;
  /** ตัวเลขจากช่องค้น (null = คำค้นไม่ใช่ตัวเลขล้วน) — เติมช่องเบอร์จนกว่าผู้ใช้แก้ช่องเบอร์เอง */
  prefillPhone: string | null;
  formKey: string;
  frozen: boolean;
  onDone: (r: { created: boolean; member: RegisterMemberItem }) => void;
}) {
  const t = useTranslations("pos.member.register");
  const tr = useTranslations("pos.register");
  const [phone, setPhone] = useState(p.prefillPhone ?? "");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [birthErr, setBirthErr] = useState(false);
  const [consent, setConsent] = useState(false);
  const [heard, setHeard] = useState<RegisterHeardFrom>("WALK_IN");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!phoneTouched) setPhone(p.prefillPhone ?? "");
  }, [p.prefillPhone, phoneTouched]);

  const ready = quickPhoneReady(phone) && name.trim().length >= 1 && !busy && !p.frozen;
  const submit = async () => {
    if (!ready) return;
    const b = parseBirthDateInput(birth);
    if (!b.ok) {
      setBirthErr(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await registerQuickMemberAction({
        systemId: p.systemId,
        unitId: p.unitId,
        input: {
          phone: phone.replace(/[\s-]/g, ""),
          name: name.trim(),
          ...(b.ymd ? { birthDate: b.ymd } : {}),
          marketingConsent: consent,
          heardFrom: heard,
          idempotencyKey: p.formKey,
        },
      });
      if (r.ok) {
        setPhone("");
        setPhoneTouched(false);
        setName("");
        setBirth("");
        setConsent(false);
        setHeard("WALK_IN");
        p.onDone({ created: r.created, member: r.member });
      } else setErr(tr(refusalMessageKey(r.code)));
    } catch {
      setErr(tr("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  const label = "flex flex-col gap-1.5 text-[13px] font-bold text-[color:var(--color-ink)]";
  const input = "input h-12 rounded-[12px] text-[15px] font-normal";
  return (
    <form
      data-testid="pos-member-register"
      className="flex flex-col gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <label className={label}>
          {t("phone")}
          <input
            data-testid="pos-member-register-phone"
            className={input}
            inputMode="tel"
            autoComplete="off"
            maxLength={14}
            placeholder={t("phonePlaceholder")}
            value={phone}
            disabled={busy || p.frozen}
            onChange={(e) => {
              setPhoneTouched(true);
              setPhone(e.target.value.replace(/[^\d\s-]/g, ""));
            }}
          />
        </label>
        <label className={label}>
          {t("name")}
          <input
            data-testid="pos-member-register-name"
            className={input}
            autoComplete="off"
            maxLength={80}
            placeholder={t("namePlaceholder")}
            value={name}
            disabled={busy || p.frozen}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>
      <div className="grid grid-cols-1 items-end gap-3.5 sm:grid-cols-2">
        <label className={label}>
          <span>
            {t("birthDate")}
          </span>
          <span className="relative">
            <input
              data-testid="pos-member-register-birthdate"
              className={`${input} w-full pr-10`}
              inputMode="numeric"
              autoComplete="off"
              placeholder={t("birthDatePlaceholder")}
              value={birth}
              aria-invalid={birthErr || undefined}
              disabled={busy || p.frozen}
              onChange={(e) => {
                setBirth(maskBirthDateInput(e.target.value));
                setBirthErr(false);
              }}
              onBlur={() => setBirthErr(!parseBirthDateInput(birth).ok)}
            />
            <RegisterIcon name="cal" size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[color:var(--color-muted)]" />
          </span>
        </label>
        <label className="flex min-h-12 items-center gap-2.5 text-[14px] text-[color:var(--color-ink)]">
          <input
            data-testid="pos-member-register-consent"
            className="size-5 shrink-0 accent-[color:var(--color-ink)]"
            type="checkbox"
            checked={consent}
            disabled={busy || p.frozen}
            onChange={(e) => setConsent(e.target.checked)}
          />
          {t("consent")}
        </label>
      </div>
      {birthErr && (
        <p data-testid="pos-member-register-birthdate-error" className="-mt-2 text-[13px] text-[color:var(--color-danger)]" role="alert">
          {t("birthDateInvalid")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("heardFrom")}>
        <span className="mr-1 text-[13px] font-bold">{t("heardFrom")}</span>
        {REGISTER_HEARD_FROM.map((h) => (
          <button
            key={h}
            data-testid={`pos-member-register-heard-${h.toLowerCase()}`}
            className={`h-11 rounded-[12px] border px-4 text-[14px] disabled:opacity-60 ${heard === h ? "border-[color:var(--color-ink)] font-bold shadow-[inset_0_0_0_1px_var(--color-ink)]" : "text-[color:var(--color-ink-soft)]"}`}
            type="button"
            aria-pressed={heard === h}
            disabled={busy || p.frozen}
            onClick={() => setHeard(h)}
          >
            {t(HEARD_KEY[h])}
          </button>
        ))}
      </div>
      <button
        data-testid="pos-member-register-submit"
        className="btn btn-primary h-[52px] rounded-[14px] text-[15.5px] font-bold disabled:cursor-not-allowed disabled:border disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-muted)]"
        type="submit"
        disabled={!ready}
      >
        {busy ? t("submitting") : t("submit")}
      </button>
      {err && (
        <p data-testid="pos-member-register-error" className="text-[13.5px] font-semibold text-[color:var(--color-danger)]" role="alert">
          {err}
        </p>
      )}
      <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-[color:var(--color-muted)]">
        <RegisterIcon name="link" size={13} />
        {t("footnote")}
      </p>
    </form>
  );
}
