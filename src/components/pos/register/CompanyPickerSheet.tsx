"use client";

// CompanyPickerSheet.tsx — แผ่นเลือกบริษัทของบิล (POS P3.6U ▸ CD-P36U-3 · CD-P36U-11 ◂)
//   เปิด = เรียก registerCompanySearchAction {q:""} ครั้งเดียว (บริษัทที่แก้ล่าสุด) · พิมพ์ ≥ 2 ตัวอักษร = ค้น (หน่วง 300ms · ครั้งละคำขอ · ผลล่าสุดชนะ)
//   มีสมาชิกในบิล = ส่วน "บริษัทของสมาชิกนี้" (registerMemberCompaniesAction ครั้งเดียวต่อการเปิด) · แถว pos-reg-company-row-<n> · ว่าง = credit.noCompany
//   ปฏิเสธ = credit.errors.customerInvalid (VALIDATION/NOT_FOUND) หรือคีย์ปฏิเสธทั่วไป — ไม่แสดง message ของเซิร์ฟเวอร์
// 🔴 แถว = ชื่อ · เลขภาษี · สาขา เท่านั้น (R14) · ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { registerCompanySearchAction, registerMemberCompaniesAction } from "@/lib/modules/pos/credit-actions";
import { refusalMessageKey } from "@/lib/modules/pos/register-shared";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";
import { companySubText, type BillCompany } from "./CompanyChip";

const SEARCH_MIN = 2;
type Look = { state: "loading" } | { state: "ok"; items: BillCompany[] } | { state: "error"; key: string };
const errKeyOf = (code: string) => (code === "VALIDATION" || code === "NOT_FOUND" ? "credit.errors.customerInvalid" : refusalMessageKey(code));
const rowsOf = (items: { partyId: string; name: string; taxId: string | null; branchCode: string | null }[]): BillCompany[] =>
  items.map((x) => ({ partyId: x.partyId, name: x.name, taxId: x.taxId, branchCode: x.branchCode }));

export function CompanyPickerSheet(p: { systemId: string; unitId: string; memberId: string | null; selectedPartyId: string | null; onPick: (c: BillCompany) => void; onClose: () => void }) {
  const t = useTranslations("pos.register");
  const [q, setQ] = useState("");
  const [list, setList] = useState<Look>({ state: "loading" });
  const [member, setMember] = useState<Look | null>(p.memberId ? { state: "loading" } : null);
  const seq = useRef(0);
  const inflight = useRef(false);
  const queued = useRef<string | null>(null);

  // ครั้งละคำขอ — ระหว่างทางมีคำค้นใหม่ = เก็บคำล่าสุดไว้ ยิงต่อเมื่อคำขอเดิมจบ (ผลเก่าทิ้งด้วยตัวนับ)
  const run = async (term: string) => {
    if (inflight.current) {
      queued.current = term;
      return;
    }
    inflight.current = true;
    const my = ++seq.current;
    setList({ state: "loading" });
    try {
      const r = await registerCompanySearchAction({ systemId: p.systemId, unitId: p.unitId, q: term });
      if (my === seq.current && queued.current === null) setList(r.ok ? { state: "ok", items: rowsOf(r.items) } : { state: "error", key: errKeyOf(r.code) });
    } catch {
      if (my === seq.current && queued.current === null) setList({ state: "error", key: "errors.unknown" });
    } finally {
      inflight.current = false;
      const next = queued.current;
      queued.current = null;
      if (next !== null) void run(next);
    }
  };
  // เปิดแผ่น: รายการล่าสุด (q "") ครั้งเดียว + บริษัทของสมาชิกในบิลครั้งเดียว
  useEffect(() => {
    void run("");
    if (p.memberId) {
      void registerMemberCompaniesAction({ systemId: p.systemId, unitId: p.unitId, memberId: p.memberId })
        .then((r) => setMember(r.ok ? { state: "ok", items: rowsOf(r.items) } : { state: "error", key: errKeyOf(r.code) }))
        .catch(() => setMember({ state: "error", key: "errors.unknown" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งเดียวต่อการเปิดแผ่น
  }, []);
  // พิมพ์ค้น: ≥ 2 ตัวอักษร · หน่วง 300ms · ล้างคำค้น = กลับไปรายการล่าสุด
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const term = q.trim();
    if (term.length > 0 && term.length < SEARCH_MIN) return;
    const h = setTimeout(() => void run(term), 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวกระตุ้นคือคำค้น
  }, [q]);

  let n = 0;
  const row = (c: BillCompany) => {
    const i = n++;
    const on = c.partyId === p.selectedPartyId;
    return (
      <button
        key={`${i}-${c.partyId}`}
        data-testid={`pos-reg-company-row-${i}`}
        type="button"
        aria-pressed={on}
        className={`flex min-h-12 w-full items-center gap-3 rounded-[13px] border px-3 py-2 text-left ${on ? "border-2 border-[color:var(--color-ink)]" : ""}`}
        onClick={() => p.onPick(c)}
      >
        <RegisterIcon name="shop" size={16} className="shrink-0 text-[color:var(--color-muted)]" />
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="truncate text-[14.5px]">{c.name}</b>
          {companySubText(c, t) && <small className="truncate text-[12px] text-[color:var(--color-muted)]">{companySubText(c, t)}</small>}
        </span>
        {on && <RegisterIcon name="check" size={16} />}
      </button>
    );
  };
  const body = (l: Look) =>
    l.state === "loading" ? (
      <p className="text-[13px] text-[color:var(--color-muted)]">{t("credit.loading")}</p>
    ) : l.state === "error" ? (
      <p data-testid="pos-reg-company-error" role="alert" className="text-[13px] font-semibold text-[color:var(--color-danger)]">
        {t(l.key)}
      </p>
    ) : l.items.length === 0 ? (
      <p data-testid="pos-reg-company-empty" className="text-[13px] text-[color:var(--color-muted)]">
        {t("credit.noCompany")}
      </p>
    ) : (
      <div className="flex flex-col gap-2">{l.items.map(row)}</div>
    );
  const short = q.trim().length > 0 && q.trim().length < SEARCH_MIN;

  return (
    <RegisterDialog onDismiss={p.onClose}>
      <div data-testid="pos-reg-company-sheet" className={`${REG_DIALOG_PANEL} md:w-[480px]`} role="dialog" aria-modal="true" aria-label={t("credit.pickCompany")}>
        <SheetGrab />
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[10px] border">
            <RegisterIcon name="shop" size={16} />
          </span>
          <h2 className="flex-1 text-[19px] font-bold">{t("credit.pickCompany")}</h2>
          <button data-testid="pos-reg-company-close" type="button" className="grid size-11 place-items-center rounded-[11px]" aria-label={t("taxInvoice.close")} onClick={p.onClose}>
            <RegisterIcon name="x" size={16} />
          </button>
        </div>
        <label className="flex h-12 items-center gap-2 rounded-[13px] border px-3">
          <RegisterIcon name="search" size={16} className="text-[color:var(--color-muted)]" />
          <input data-testid="pos-reg-company-search" className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none" placeholder={t("credit.searchCompany")} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {short && <p className="text-[12.5px] text-[color:var(--color-muted)]">{t("credit.searchMin")}</p>}
        {member && (
          <section data-testid="pos-reg-company-member" className="flex flex-col gap-2">
            <h3 className="text-[13px] font-bold text-[color:var(--color-ink-soft)]">{t("credit.fromMember")}</h3>
            {body(member)}
          </section>
        )}
        <section className="flex flex-col gap-2">
          <h3 className="text-[13px] font-bold text-[color:var(--color-ink-soft)]">{q.trim().length >= SEARCH_MIN ? t("credit.company") : t("credit.recent")}</h3>
          {body(list)}
        </section>
      </div>
    </RegisterDialog>
  );
}
