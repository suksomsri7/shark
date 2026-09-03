"use client";

// FinanceTransferModal — เมนู ⋮ "โอน" / ปุ่ม "โอนระหว่างช่องทาง" หัวหน้า (WO 5.1 · DESIGN-SPEC-V2 §10.1)
// transferId สุ่มครั้งเดียวตอนเปิด modal (useState initializer) — ส่งไปกับทุกครั้งที่กด "โอนเงิน" รวมถึง
// ตอน retry เดิม ⇒ กดซ้ำ/network retry ไม่โพสต์ JV ซ้ำ (gl.postFinanceTransfer idempotent ต่อ transferId นี้)
import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { FormField } from "@/components/ui/FormField";
import { DateInput } from "./DateInput";
import { transferFinanceActionDirect } from "@/app/app/sys/[id]/account/finance/actions";

export type TransferAccountOpt = { id: string; label: string };

const todayIso = () => new Date().toISOString().slice(0, 10);
const bahtToSatang = (raw: string) => Math.round((Number(raw.replace(/,/g, "")) || 0) * 100);

export function FinanceTransferModal({
  systemId,
  financePath,
  accounts,
  defaultFromId,
}: {
  systemId: string;
  financePath: string;
  accounts: TransferAccountOpt[];
  defaultFromId?: string;
}) {
  const router = useRouter();
  const [transferId] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`));
  const [fromId, setFromId] = useState(defaultFromId ?? accounts[0]?.id ?? "");
  const [toId, setToId] = useState(accounts.find((a) => a.id !== (defaultFromId ?? accounts[0]?.id))?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const close = useCallback(() => router.push(financePath), [router, financePath]);

  const submit = () => {
    setError("");
    if (fromId === toId) return setError("บัญชีต้นทางและปลายทางต้องต่างกัน");
    const amt = bahtToSatang(amount);
    if (amt <= 0) return setError("จำนวนเงินต้องมากกว่า 0");
    start(async () => {
      const res = await transferFinanceActionDirect(systemId, { transferId, fromId, toId, amount: amt, date, note });
      if (!res.ok) return setError(res.reason);
      router.push(`${financePath}?ok=transfer`);
      router.refresh();
    });
  };

  return (
    <Modal open onClose={close} title="โอนระหว่างช่องทาง" size="sm" sheetOnMobile testId="finance-transfer-modal"
      actions={
        <>
          <button type="button" className="btn-sm" onClick={close} data-testid="finance-transfer-cancel">ยกเลิก</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending} data-testid="finance-transfer-submit">
            {pending ? "กำลังโอน…" : "โอนเงิน"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-[color:var(--color-danger)]" data-testid="finance-transfer-error">{error}</p>}
        <FormField label="จากบัญชี" required>
          <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="input" data-testid="finance-transfer-from">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </FormField>
        <FormField label="ไปบัญชี" required>
          <select value={toId} onChange={(e) => setToId(e.target.value)} className="input" data-testid="finance-transfer-to">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </FormField>
        <FormField label="จำนวนเงิน (บาท)" required>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="input text-right" data-testid="finance-transfer-amount" />
        </FormField>
        <FormField label="วันที่">
          <DateInput value={date} onChange={setDate} testId="finance-transfer-date" />
        </FormField>
        <FormField label="หมายเหตุ">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="input" data-testid="finance-transfer-note" />
        </FormField>
      </div>
    </Modal>
  );
}

export default FinanceTransferModal;
