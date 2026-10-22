"use client";

// CreditSettingsCard.tsx — POS P3.6U ▸ การ์ด "ลูกค้าเครดิต (วางบิล)" ในแท็บวิธีรับเงิน (CD-P36U-10 · CD-P36U-11) ◂
//   สวิตช์ enabled / requireBuyer = settings.pos.credit (เจ้าของร้าน · บันทึกทันทีผ่าน updatePosCreditSettingsAction · สถานะจากผลของตัวเขียน) ·
//   คนอื่นเห็นสถานะ (aria-disabled) + "เจ้าของร้านเท่านั้น" · ปิดอยู่ = บรรทัดเส้นประ allOff (โหลดหน้าไม่เขียนอะไร)
//   บัญชีเครดิต (ผู้ถือ pos.credit.manage เท่านั้น — หน้าเพจอ่าน listCreditAccounts + ชื่อจาก companyOptionsByPartyIds):
//     แถว = ชื่อ · วงเงิน · เทอม (ว่าง = ตามสมุดบัญชี) · ใช้งาน · แก้ในแถว · เพิ่ม = ค้นบริษัท (registerCompanySearchAction ด้วยสาขาของหน้า) ·
//     ฟอร์ม: วงเงินบาทเต็ม (×100) · เทอม (ว่าง = null) · ใช้งาน · หมายเหตุ → saveCreditAccountAction · คำปฏิเสธ = ข้อความตามรหัสในฟอร์ม · ผล = แทนแถว
// 🔴 ไม่มีตัวเลขคิดวงเงินฝั่งจอ (ตัวตัดสิน = เซิร์ฟเวอร์) · ไม่มีเบอร์/อีเมล/ผู้ติดต่อของบริษัท (ชื่อ/เลขภาษี/สาขาเท่านั้น) · ไม่แสดง message ไทยของเซิร์ฟเวอร์
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ (ST7) · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { registerCompanySearchAction, saveCreditAccountAction } from "@/lib/modules/pos/credit-actions";
import { updatePosCreditSettingsAction } from "@/lib/modules/pos/credit-settings-actions";
import { POS_CREDIT_LIMIT_MAX, POS_CREDIT_NOTE_MAX, POS_CREDIT_TERM_MAX, type PosCreditAccountView } from "@/lib/modules/pos/credit-shared";
import type { PosCreditSettings } from "@/lib/modules/pos/settings-shared";
import type { CompanyOption } from "@/lib/modules/pos/crm-link";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { CardHead, InlineNote, SettingsCard, SwitchKnob } from "./settings-ui";

type Co = Pick<CompanyOption, "partyId" | "name" | "taxId" | "branchCode">;
type Form = { partyId: string; limit: string; term: string; active: boolean; note: string; isNew: boolean };
const ERR_CODES = new Set(["PERMISSION_DENIED", "VALIDATION", "NOT_FOUND", "CUSTOMER_INVALID", "INTERNAL", "UNKNOWN"]);
const errKey = (code: string) => `credit.errors.${ERR_CODES.has(code) ? code : "UNKNOWN"}`;
const SEARCH_MIN = 2;

export function CreditSettingsCard(p: {
  systemId: string;
  unitId: string;
  isOwner: boolean;
  initial: PosCreditSettings;
  /** ผู้ถือ pos.credit.manage — ไม่ใช่ = ไม่มีส่วนบัญชี (ข้อความ noPermission) */
  canManage: boolean;
  /** ร้านมีระบบ CRM — ไม่มี = noCrm (ซ่อนบัญชี) */
  hasCrm: boolean;
  /** บัญชีเครดิต (null = ไม่ได้อ่าน/อ่านไม่ได้) */
  accounts: PosCreditAccountView[] | null;
  /** ชื่อบริษัทของแถว (partyId → ชื่อ/เลขภาษี/สาขา) */
  names: Record<string, Co>;
}) {
  const t = useTranslations("pos.settings");
  const [cs, setCs] = useState<PosCreditSettings>(p.initial);
  const [busy, setBusy] = useState<"enabled" | "requireBuyer" | null>(null);
  const [swErr, setSwErr] = useState<string | null>(null);
  const [rows, setRows] = useState<PosCreditAccountView[]>(p.accounts ?? []);
  const [names, setNames] = useState<Record<string, Co>>(p.names);
  const [form, setForm] = useState<Form | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Co[] | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const seq = useRef(0);

  const toggle = async (key: "enabled" | "requireBuyer") => {
    if (!p.isOwner || busy) return;
    setBusy(key);
    setSwErr(null);
    try {
      const r = await updatePosCreditSettingsAction({ systemId: p.systemId, patch: { credit: { [key]: !cs[key] } } });
      if (r.ok) setCs(r.credit);
      else setSwErr(r.code === "PERMISSION_DENIED" ? "credit.ownerOnly" : errKey(r.code));
    } catch {
      setSwErr(errKey("UNKNOWN"));
    } finally {
      setBusy(null);
    }
  };

  // ค้นบริษัท: ≥ 2 ตัวอักษร · หน่วง 300ms · คำตอบเก่าทิ้ง (ตัวนับ)
  useEffect(() => {
    if (!adding) return;
    const term = q.trim();
    if (term.length < SEARCH_MIN) {
      setFound(null);
      return;
    }
    const my = ++seq.current;
    const h = setTimeout(() => {
      void registerCompanySearchAction({ systemId: p.systemId, unitId: p.unitId, q: term })
        .then((r) => {
          if (my !== seq.current) return;
          if (r.ok) {
            setSearchErr(null);
            setFound(r.items.map((x) => ({ partyId: x.partyId, name: x.name, taxId: x.taxId, branchCode: x.branchCode })));
          } else {
            setFound(null);
            setSearchErr(r.code === "PERMISSION_DENIED" ? "credit.searchDenied" : errKey(r.code));
          }
        })
        .catch(() => my === seq.current && setSearchErr(errKey("UNKNOWN")));
    }, 300);
    return () => clearTimeout(h);
  }, [q, adding, p.systemId, p.unitId]);

  const openEdit = (r: PosCreditAccountView) => {
    setAdding(false);
    setFormErr(null);
    setSavedId(null);
    setForm({ partyId: r.partyId, limit: String(Math.floor(r.limitSatang / 100)), term: r.termDays === null ? "" : String(r.termDays), active: r.active, note: r.note ?? "", isNew: false });
  };
  const pickNew = (c: Co) => {
    setNames((m) => ({ ...m, [c.partyId]: c }));
    const cur = rows.find((r) => r.partyId === c.partyId);
    setAdding(false);
    setQ("");
    setFound(null);
    if (cur) return openEdit(cur);
    setFormErr(null);
    setSavedId(null);
    setForm({ partyId: c.partyId, limit: "", term: "", active: true, note: "", isNew: true });
  };
  const save = async () => {
    if (!form || saving) return;
    const limitBaht = Number(form.limit.trim());
    const termRaw = form.term.trim();
    const termDays = termRaw === "" ? null : Number(termRaw);
    // รูปตัวเลขเท่านั้น (ช่วงจริงตัดสินที่เซิร์ฟเวอร์ — คำปฏิเสธ VALIDATION แสดงในฟอร์ม)
    if (!form.limit.trim() || !Number.isInteger(limitBaht) || limitBaht < 1 || limitBaht * 100 > POS_CREDIT_LIMIT_MAX || (termDays !== null && !Number.isInteger(termDays)) || form.note.length > POS_CREDIT_NOTE_MAX) {
      setFormErr(errKey("VALIDATION"));
      return;
    }
    setSaving(true);
    setFormErr(null);
    try {
      const r = await saveCreditAccountAction({ systemId: p.systemId, partyId: form.partyId, limitSatang: limitBaht * 100, termDays, active: form.active, note: form.note.trim() ? form.note : null });
      if (!r.ok) return setFormErr(errKey(r.code));
      setRows((s) => [r.account, ...s.filter((x) => x.partyId !== r.account.partyId)]);
      setSavedId(r.account.partyId);
      setForm(null);
    } catch {
      setFormErr(errKey("UNKNOWN"));
    } finally {
      setSaving(false);
    }
  };

  const swCls = "grid min-h-11 min-w-11 place-items-center";
  const swOff = !p.isOwner || busy !== null;
  const coName = (partyId: string) => names[partyId]?.name ?? null;
  const field = "h-11 w-full rounded-[11px] border bg-[color:var(--color-surface)] px-3 text-[14px]";

  const formNode = form && (
    <div data-testid="pos-settings-credit-form" className="flex flex-col gap-3 rounded-[14px] border bg-[color:var(--color-surface-2)] p-3">
      <b className="text-[14px]">{coName(form.partyId) ?? t("credit.unknownCompany")}</b>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12.5px] text-[color:var(--color-muted)]">
          {`${t("credit.limit")} (${t("credit.limitUnit")})`}
          <input data-testid="pos-settings-credit-limit" className={field} inputMode="numeric" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value.replace(/[^\d]/g, "") })} />
          <small>{t("credit.limitRange", { max: (POS_CREDIT_LIMIT_MAX / 100).toLocaleString("en-US") })}</small>
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-[color:var(--color-muted)]">
          {t("credit.termDays")}
          <input data-testid="pos-settings-credit-term" className={field} inputMode="numeric" placeholder={t("credit.termDefault")} value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value.replace(/[^\d]/g, "") })} />
          <small>{form.term.trim() === "0" ? t("credit.termZeroHint") : t("credit.termRange", { max: POS_CREDIT_TERM_MAX })}</small>
        </label>
      </div>
      <div className="flex items-center gap-4 text-[14px]">
        <span className="min-w-0 flex-1">{t("credit.active")}</span>
        <button data-testid="pos-settings-credit-active" type="button" role="switch" aria-checked={form.active} aria-label={t("credit.active")} className="grid min-h-11 min-w-11 place-items-center" onClick={() => setForm({ ...form, active: !form.active })}>
          <SwitchKnob on={form.active} />
        </button>
      </div>
      <label className="flex flex-col gap-1 text-[12.5px] text-[color:var(--color-muted)]">
        {t("credit.note")}
        <textarea data-testid="pos-settings-credit-note" className="min-h-[64px] w-full rounded-[11px] border bg-[color:var(--color-surface)] px-3 py-2 text-[14px]" maxLength={POS_CREDIT_NOTE_MAX} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <small>{t("credit.noteRange", { max: POS_CREDIT_NOTE_MAX })}</small>
      </label>
      {formErr && (
        <InlineNote tone="error" testid="pos-settings-credit-error">
          {t(formErr)}
        </InlineNote>
      )}
      <div className="flex flex-wrap gap-2">
        <button data-testid="pos-settings-credit-save" type="button" className="btn btn-primary min-h-11 rounded-[11px] px-5 text-[14px] disabled:opacity-50" disabled={saving} onClick={() => void save()}>
          {t("credit.save")}
        </button>
        <button data-testid="pos-settings-credit-cancel" type="button" className="btn btn-ghost min-h-11 rounded-[11px] px-4 text-[14px]" disabled={saving} onClick={() => setForm(null)}>
          {t("credit.cancel")}
        </button>
      </div>
    </div>
  );

  return (
    <SettingsCard testid="pos-settings-credit-card">
      <CardHead icon="doc" title={t("credit.title")} />
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-[color:var(--color-muted)]">{t("credit.desc")}</p>
        <div className="flex items-center gap-4 text-[15px]">
          <b className="min-w-0 flex-1 font-semibold">{t("credit.enabled")}</b>
          <button data-testid="pos-settings-credit-enabled" type="button" role="switch" aria-checked={cs.enabled} aria-label={t("credit.enabled")} aria-disabled={swOff} disabled={busy !== null} className={swCls} onClick={() => void toggle("enabled")}>
            <SwitchKnob on={cs.enabled} disabled={swOff} />
          </button>
        </div>
        <div className="flex items-center gap-4 text-[15px]">
          <b className="min-w-0 flex-1 font-semibold">{t("credit.requireBuyer")}</b>
          <button data-testid="pos-settings-credit-require-buyer" type="button" role="switch" aria-checked={cs.requireBuyer} aria-label={t("credit.requireBuyer")} aria-disabled={swOff} disabled={busy !== null} className={swCls} onClick={() => void toggle("requireBuyer")}>
            <SwitchKnob on={cs.requireBuyer} disabled={swOff} />
          </button>
        </div>
        {!p.isOwner && (
          <InlineNote tone="ok" testid="pos-settings-credit-owner-only">
            {t("credit.ownerOnly")}
          </InlineNote>
        )}
        {!cs.enabled && (
          <p data-testid="pos-settings-credit-all-off" className="rounded-[12px] border border-dashed px-3 py-2.5 text-[13px] text-[color:var(--color-muted)]">
            {t("credit.allOff")}
          </p>
        )}
        {swErr && (
          <InlineNote tone="error" testid="pos-settings-credit-switch-error">
            {t(swErr)}
          </InlineNote>
        )}
        <div className="mt-2 border-t pt-4">
          <h3 className="mb-3 text-[15px] font-bold">{t("credit.accounts")}</h3>
          {!p.canManage ? (
            <InlineNote tone="ok" testid="pos-settings-credit-no-permission">
              {t("credit.noPermission")}
            </InlineNote>
          ) : !p.hasCrm ? (
            <InlineNote tone="ok" testid="pos-settings-credit-no-crm">
              {t("credit.noCrm")}
            </InlineNote>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.length === 0 && !form && <p className="text-[13px] text-[color:var(--color-muted)]">{t("credit.empty")}</p>}
              {rows.map((r) =>
                form && !form.isNew && form.partyId === r.partyId ? (
                  <div key={r.partyId} data-testid={`pos-settings-credit-row-${r.partyId}`}>
                    {formNode}
                  </div>
                ) : (
                  <div key={r.partyId} data-testid={`pos-settings-credit-row-${r.partyId}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[12px] border px-3 py-2 text-[14px]">
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{coName(r.partyId) ?? t("credit.unknownCompany")}</b>
                      <small className="block text-[12.5px] text-[color:var(--color-muted)]">
                        {[`${t("credit.limit")} ${moneyText(r.limitSatang)}`, r.termDays === null ? t("credit.termDefault") : t("credit.termValue", { days: r.termDays }), r.active ? t("credit.active") : t("credit.inactive")].join(" · ")}
                      </small>
                    </span>
                    {savedId === r.partyId && (
                      <span data-testid="pos-settings-credit-saved" role="status" className="text-[12.5px] text-[color:var(--color-ink-soft)]">
                        {t("credit.saved")}
                      </span>
                    )}
                    <button data-testid={`pos-settings-credit-edit-${r.partyId}`} type="button" className="btn btn-ghost min-h-11 rounded-[11px] px-3 text-[13px]" onClick={() => openEdit(r)}>
                      {t("credit.edit")}
                    </button>
                  </div>
                ),
              )}
              {form?.isNew && formNode}
              {adding ? (
                <div className="flex flex-col gap-2">
                  <input data-testid="pos-settings-credit-search" className={field} autoFocus placeholder={t("credit.search")} value={q} onChange={(e) => setQ(e.target.value)} />
                  {searchErr && (
                    <InlineNote tone="error" testid="pos-settings-credit-search-error">
                      {t(searchErr)}
                    </InlineNote>
                  )}
                  {(found ?? []).map((c, i) => (
                    <button key={c.partyId} data-testid={`pos-settings-credit-found-${i}`} type="button" className="flex min-h-11 flex-col items-start rounded-[11px] border px-3 py-2 text-left text-[14px]" onClick={() => pickNew(c)}>
                      <b>{c.name}</b>
                      {c.taxId && <small className="text-[12px] text-[color:var(--color-muted)]">{c.taxId}</small>}
                    </button>
                  ))}
                </div>
              ) : (
                !form && (
                  <button data-testid="pos-settings-credit-add" type="button" className="btn btn-ghost min-h-11 self-start rounded-[11px] px-4 text-[14px]" onClick={() => setAdding(true)}>
                    {t("credit.add")}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}
