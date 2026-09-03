"use client";

// FinanceModal — modal เพิ่ม/แก้ไขช่องทางการเงิน พื้นฐาน|ขั้นสูง (WO 5.1 · DESIGN-SPEC-V2 §10.1)
// เฟรมอ้างอิง: docs/design/account-v2/g9-finance-channels-modal.png (สถานะแท็บ "ขั้นสูง" ประเภทธนาคาร)
// checklist ไล่ทีละองค์ประกอบ อยู่ใน ledger/wo-notes/5.1.md
// pattern เดียวกับ ContactModal.tsx (WO 3.3): เรียก server action ตรง (ไม่ผ่าน <form action>) —
// validation inline ใต้ช่อง + toast รวมท้ายจอ + modal ปิดไม่ได้ถ้ายังไม่บันทึก (ข้อมูลไม่หาย)

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { AccountIcon } from "./AccountIcon";
import { FormField } from "@/components/ui/FormField";
import { DateInput } from "./DateInput";
import { THAI_BANKS } from "./thai-banks";
import {
  saveFinanceAction,
  saveOpeningEntryAction,
  removeOpeningEntryAction,
  type FinanceFormPayload,
} from "@/app/app/sys/[id]/account/finance/actions";

export type FinanceModalOpeningEntry = { seq: number; date: string; amountSatang: number; note: string | null };

export type FinanceModalAccount = {
  id: string;
  code: string | null;
  type: "CASH" | "BANK" | "E_WALLET" | "PETTY_CASH";
  name: string;
  bankSubtype: string | null;
  bankName: string | null;
  bankBranch: string | null;
  accountNo: string | null;
  accountName: string | null;
  promptpayId: string | null;
  note: string | null;
  useForReceive: boolean;
  useForPay: boolean;
  showOnDocuments: boolean;
  holderUserId: string | null;
  limitSatang: number | null;
  openingEntries: FinanceModalOpeningEntry[];
};

const TYPE_OPTS: { value: FinanceModalAccount["type"]; label: string; icon: string }[] = [
  { value: "CASH", label: "เงินสด", icon: "cash" },
  { value: "BANK", label: "ธนาคาร", icon: "bank" },
  { value: "E_WALLET", label: "e-Wallet", icon: "wallet" },
  { value: "PETTY_CASH", label: "สำรองรับ-จ่าย", icon: "swap" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const bahtToSatang = (raw: string) => Math.round((Number(raw.replace(/,/g, "")) || 0) * 100);
const satangToBaht = (v: number) => (v / 100).toString();

type LocalEntry = { seq?: number; date: string; amount: string; note: string; savedSeq?: number };

export function FinanceModal({
  systemId,
  financePath,
  account,
  suggestedCodes,
  previewLedgerCodes,
  holders,
}: {
  systemId: string;
  financePath: string;
  /** null = เพิ่มใหม่ */
  account: FinanceModalAccount | null;
  suggestedCodes: Record<FinanceModalAccount["type"], string>;
  previewLedgerCodes: Record<FinanceModalAccount["type"], string>;
  holders: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"basic" | "advanced">("basic");
  const [pending, start] = useTransition();
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [toast, setToast] = useState<{ text: string; tone: "error" | "success" } | null>(null);

  const [type, setType] = useState<FinanceModalAccount["type"]>(account?.type ?? "BANK");
  const [code, setCode] = useState(account?.code ?? suggestedCodes[account?.type ?? "BANK"]);
  const [name, setName] = useState(account?.name ?? "");
  const [bankSubtype, setBankSubtype] = useState<"SAVINGS" | "CURRENT">((account?.bankSubtype as "SAVINGS" | "CURRENT") ?? "SAVINGS");
  const [bankName, setBankName] = useState(account?.bankName ?? "");
  const [bankBranch, setBankBranch] = useState(account?.bankBranch ?? "");
  const [accountNo, setAccountNo] = useState(account?.accountNo ?? "");
  const [accountName, setAccountName] = useState(account?.accountName ?? "");
  const [promptpayId, setPromptpayId] = useState(account?.promptpayId ?? "");
  const [note, setNote] = useState(account?.note ?? "");
  const [useForReceive, setUseForReceive] = useState(account?.useForReceive ?? true);
  const [useForPay, setUseForPay] = useState(account?.useForPay ?? true);
  const [showOnDocuments, setShowOnDocuments] = useState(account?.showOnDocuments ?? true);
  const [holderUserId, setHolderUserId] = useState(account?.holderUserId ?? "");
  const [limitBaht, setLimitBaht] = useState(account?.limitSatang != null ? satangToBaht(account.limitSatang) : "");

  const [entries, setEntries] = useState<LocalEntry[]>(
    account
      ? account.openingEntries.map((e) => ({ seq: e.seq, savedSeq: e.seq, date: e.date.slice(0, 10), amount: satangToBaht(e.amountSatang), note: e.note ?? "" }))
      : [],
  );

  const close = useCallback(() => router.push(financePath), [router, financePath]);

  const flash = (text: string, tone: "error" | "success") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 3500);
  };

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "จำเป็นต้องกรอก";
    if (name.length > 40) e.name = "ยาวเกิน 40 ตัวอักษร";
    if (limitBaht.trim() && (Number(limitBaht) < 0 || Number.isNaN(Number(limitBaht)))) e.limitSatang = "กรอกเป็นตัวเลข";
    return { ...e, ...serverErrors };
  }, [name, limitBaht, serverErrors]);
  const errOf = (k: string) => (showErrors ? errors[k] : undefined);

  const addEntryRow = () => setEntries((p) => [...p, { date: todayIso(), amount: "", note: "" }]);
  const removeEntryRow = (idx: number) => {
    const row = entries[idx];
    if (row.savedSeq && account) {
      start(async () => {
        const res = await removeOpeningEntryAction(systemId, account.id, row.savedSeq!);
        if (!res.ok) return flash(res.reason, "error");
        setEntries((p) => p.filter((_, i) => i !== idx));
        router.refresh();
      });
      return;
    }
    setEntries((p) => p.filter((_, i) => i !== idx));
  };
  const saveEntryRow = (idx: number) => {
    if (!account) return; // ตอนเพิ่มใหม่ ยอดยกมาถูกส่งไปพร้อมฟอร์มหลักตอนกด "+ เพิ่มช่องทาง"
    const row = entries[idx];
    if (!row.date || !row.amount) return flash("กรอกวันที่และจำนวนเงินยอดยกมา", "error");
    start(async () => {
      const res = await saveOpeningEntryAction(systemId, account.id, {
        seq: row.savedSeq,
        date: row.date,
        amount: bahtToSatang(row.amount),
        note: row.note,
      });
      if (!res.ok) return flash(res.reason, "error");
      flash("บันทึกยอดยกมาแล้ว", "success");
      router.refresh();
    });
  };

  const submit = () => {
    setServerErrors({});
    setShowErrors(true);
    if (!name.trim()) {
      flash("โปรดกรอกช่องที่ไฮไลต์", "error");
      return;
    }
    const payload: FinanceFormPayload = {
      id: account?.id,
      type,
      code,
      name,
      bankSubtype: type === "BANK" ? bankSubtype : undefined,
      bankName: bankName || undefined,
      bankBranch: bankBranch || undefined,
      accountNo: accountNo || undefined,
      accountName: accountName || undefined,
      promptpayId: promptpayId || undefined,
      note: note || undefined,
      useForReceive,
      useForPay,
      showOnDocuments,
      holderUserId: type === "PETTY_CASH" ? holderUserId || undefined : undefined,
      limitSatang: type === "PETTY_CASH" && limitBaht.trim() ? bahtToSatang(limitBaht) : undefined,
      openingEntries: account
        ? undefined
        : entries.filter((e) => e.amount).map((e) => ({ date: e.date, amount: bahtToSatang(e.amount), note: e.note })),
    };
    start(async () => {
      const res = await saveFinanceAction(systemId, payload);
      if (res.ok) {
        flash(account ? "บันทึกช่องทางการเงินแล้ว" : "เพิ่มช่องทางการเงินแล้ว", "success");
        router.push(financePath);
        router.refresh();
        return;
      }
      if (res.error === "validation") {
        setServerErrors(res.fields);
        flash("โปรดกรอกช่องที่ไฮไลต์", "error");
        return;
      }
      setSaveError(res.reason);
      flash(res.reason, "error");
    });
  };

  const isBank = type === "BANK";
  const isPetty = type === "PETTY_CASH";

  return (
    <Modal
      open
      onClose={close}
      title={account ? "แก้ไขช่องทางการเงิน" : "เพิ่มช่องทางการเงิน"}
      size="lg"
      sheetOnMobile
      testId="finance-modal"
      actions={
        <>
          <button type="button" className="btn-sm" onClick={close} data-testid="finance-modal-cancel">
            ยกเลิก
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending} data-testid="finance-modal-submit">
            {pending ? "กำลังบันทึก…" : account ? "บันทึก" : "+ เพิ่มช่องทาง"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {saveError && <p className="text-sm text-[color:var(--color-danger)]">{saveError}</p>}

        {/* แท็บ พื้นฐาน|ขั้นสูง */}
        <div className="flex gap-4 border-b" style={{ borderColor: "var(--color-line)" }}>
          {(["basic", "advanced"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="border-b-2 pb-2 text-sm font-medium"
              style={{ borderColor: tab === t ? "var(--color-ink)" : "transparent", color: tab === t ? "var(--color-ink)" : "var(--color-muted)" }}
              data-testid={`finance-modal-tab-${t === "basic" ? "basic" : "advanced"}`}
            >
              {t === "basic" ? "พื้นฐาน" : "ขั้นสูง"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="รหัส">
            {/* g9-modal: "auto" อยู่ในกล่องช่องกรอกฝั่งขวา (ไม่ใช่บรรทัดใต้ช่อง) */}
            <div className="relative">
              <input value={code} onChange={(e) => setCode(e.target.value)} className="input pr-12" maxLength={12} data-testid="finance-code" />
              {code === suggestedCodes[type] && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[color:var(--color-muted)]" data-testid="finance-code-auto-hint">
                  auto
                </span>
              )}
            </div>
          </FormField>
          <FormField label="ชื่อ" required error={errOf("name")}>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" maxLength={40} data-testid="finance-name" />
          </FormField>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[color:var(--color-muted)]">ประเภท</label>
          <div className="flex flex-wrap gap-4">
            {TYPE_OPTS.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={type === o.value}
                  onChange={() => {
                    setType(o.value);
                    if (!account) setCode(suggestedCodes[o.value]);
                  }}
                  className="h-4 w-4"
                  data-testid={`finance-type-${o.value}`}
                />
                <AccountIcon name={o.icon} className="h-4 w-4" />
                {o.label}
              </label>
            ))}
          </div>
        </div>

        {isBank && (
          <section className="flex flex-col gap-3 rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }} data-testid="finance-bank-section">
            <h3 className="text-xs font-semibold">ข้อมูลธนาคาร</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="ธนาคาร">
                <select value={bankName} onChange={(e) => setBankName(e.target.value)} className="input" data-testid="finance-bank-name">
                  <option value="">— เลือกธนาคาร —</option>
                  {THAI_BANKS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="เลขบัญชี">
                <input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} className="input" maxLength={34} data-testid="finance-account-no" />
              </FormField>
              <FormField label="ชื่อบัญชี">
                <input value={accountName} onChange={(e) => setAccountName(e.target.value)} className="input" maxLength={100} data-testid="finance-account-name" />
              </FormField>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[color:var(--color-muted)]">ประเภทบัญชี</label>
                <div className="flex gap-4 pt-2">
                  {(["SAVINGS", "CURRENT"] as const).map((s) => (
                    <label key={s} className="flex cursor-pointer items-center gap-1.5 text-sm">
                      <input type="radio" checked={bankSubtype === s} onChange={() => setBankSubtype(s)} className="h-4 w-4" data-testid={`finance-subtype-${s}`} />
                      {s === "SAVINGS" ? "ออมทรัพย์" : "กระแส"}
                    </label>
                  ))}
                </div>
              </div>
              <FormField label="สาขา">
                <input value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} className="input" maxLength={100} data-testid="finance-bank-branch" />
              </FormField>
              <FormField label="PromptPay (เบอร์/เลขภาษี)">
                <input value={promptpayId} onChange={(e) => setPromptpayId(e.target.value)} className="input" maxLength={20} data-testid="finance-promptpay" />
              </FormField>
            </div>
          </section>
        )}

        {type === "E_WALLET" && (
          <FormField label="PromptPay (เบอร์/เลขภาษี)">
            <input value={promptpayId} onChange={(e) => setPromptpayId(e.target.value)} className="input" maxLength={20} data-testid="finance-promptpay" />
          </FormField>
        )}

        {isPetty && tab === "advanced" && (
          <section className="flex flex-col gap-3 rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }} data-testid="finance-petty-section">
            <h3 className="text-xs font-semibold">ข้อมูลสำรองรับ-จ่าย</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="ผู้ถือ">
                <select value={holderUserId} onChange={(e) => setHolderUserId(e.target.value)} className="input" data-testid="finance-holder">
                  <option value="">— ไม่ระบุ —</option>
                  {holders.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="วงเงิน (บาท)" error={errOf("limitSatang")}>
                <input value={limitBaht} onChange={(e) => setLimitBaht(e.target.value)} inputMode="decimal" className="input" data-testid="finance-limit" />
              </FormField>
            </div>
          </section>
        )}

        {tab === "advanced" && (
          <>
            <FormField label="คำอธิบาย" error={errOf("note")}>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="เช่น ใช้รับโอนจากลูกค้าองค์กร/เอเจนต์ต่างประเทศ"
                className="input"
                data-testid="finance-note"
              />
            </FormField>

            <div className="flex flex-wrap gap-6">
              <Toggle label="ใช้รับเงิน" checked={useForReceive} onChange={setUseForReceive} testId="finance-use-receive" />
              <Toggle label="ใช้จ่ายเงิน" checked={useForPay} onChange={setUseForPay} testId="finance-use-pay" />
              <Toggle label="แสดงบนเอกสาร" checked={showOnDocuments} onChange={setShowOnDocuments} testId="finance-show-doc" />
            </div>

            <section className="flex flex-col gap-3 rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }} data-testid="finance-opening-section">
              <div className="flex items-center gap-2">
                <AccountIcon name="clock" className="h-4 w-4 text-[color:var(--color-muted)]" />
                <h3 className="text-xs font-semibold">ยอดยกมา</h3>
                <span className="flex-1" />
                <button type="button" onClick={addEntryRow} className="text-xs font-medium" style={{ color: "var(--color-accent)" }} data-testid="finance-opening-add">
                  + เพิ่มยอดยกมา
                </button>
              </div>
              {entries.length === 0 && <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีรายการยอดยกมา</p>}
              {entries.map((row, idx) => (
                <div key={idx} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]" data-testid={`finance-opening-row-${idx}`}>
                  <FormField label="วันที่">
                    <DateInput value={row.date} onChange={(iso) => setEntries((p) => p.map((r, i) => (i === idx ? { ...r, date: iso } : r)))} testId={`finance-opening-date-${idx}`} />
                  </FormField>
                  <FormField label="จำนวน">
                    <input
                      value={row.amount}
                      onChange={(e) => setEntries((p) => p.map((r, i) => (i === idx ? { ...r, amount: e.target.value } : r)))}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="input text-right"
                      data-testid={`finance-opening-amount-${idx}`}
                    />
                  </FormField>
                  <FormField label="หมายเหตุ">
                    <input
                      value={row.note}
                      onChange={(e) => setEntries((p) => p.map((r, i) => (i === idx ? { ...r, note: e.target.value } : r)))}
                      maxLength={100}
                      placeholder="ยอดยกมาจากระบบเดิม"
                      className="input"
                      data-testid={`finance-opening-note-${idx}`}
                    />
                  </FormField>
                  <div className="flex gap-1.5 pb-1">
                    {account && (
                      <button type="button" onClick={() => saveEntryRow(idx)} className="btn-sm" data-testid={`finance-opening-save-${idx}`}>
                        บันทึก
                      </button>
                    )}
                    <button type="button" onClick={() => removeEntryRow(idx)} className="btn-sm text-[color:var(--color-danger)]" data-testid={`finance-opening-remove-${idx}`}>
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-[color:var(--color-muted)]" data-testid="finance-opening-ledger-hint">
                ⓘ ระบบจะสร้างบัญชี {previewLedgerCodes[type]} ให้อัตโนมัติ
              </p>
            </section>
          </>
        )}
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div
            role="status"
            className="flex items-center gap-2 rounded-full px-4 py-3 text-sm shadow-[0_8px_24px_rgba(10,10,10,.24)]"
            style={{ background: toast.tone === "error" ? "var(--color-ink)" : "var(--color-accent)", color: "var(--color-surface)" }}
            data-testid="finance-modal-toast"
          >
            <AccountIcon name="warn" className="h-4 w-4" /> {toast.text}
          </div>
        </div>
      )}
    </Modal>
  );
}

// pattern เดียวกับ DocEditorV2.tsx Toggle (ผ่าน QC ภาพจริงมาแล้ว) — ปุ่มเดียวห่อทั้งแท่ง+ป้าย
// (ของเดิมที่เขียนแยก label/button ทำให้ปุ่ม toggle ทับตัวอักษรแรกของป้ายในบางความกว้าง — เปลี่ยนมาใช้โครงนี้แทน)
function Toggle({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-2 text-sm" data-testid={testId}>
      <span
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
        style={{ background: checked ? "var(--color-ink)" : "var(--color-surface-2)" }}
      >
        <span
          className="inline-block h-5 w-5 rounded-full transition-transform"
          style={{ background: "var(--color-surface)", transform: `translateX(${checked ? 22 : 2}px)` }}
        />
      </span>
      {label}
    </button>
  );
}

export default FinanceModal;
