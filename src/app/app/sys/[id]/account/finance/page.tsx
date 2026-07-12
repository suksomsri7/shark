import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { baht } from "@/lib/modules/account/service";
import { financeBalances, FINANCE_TYPE_LABEL } from "@/lib/modules/account/finance";
import {
  createFinanceAccountAction,
  archiveFinanceAccountAction,
  transferAction,
  pettyReplenishAction,
} from "./actions";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";

const inputCls = "rounded-lg border px-2 py-1.5 text-sm";

export default async function FinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { err, ok } = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id);
  const accounts = await financeBalances(tenantId, systemId);
  const base = `/app/sys/${id}/account`;
  const pettyAccounts = accounts.filter((a) => a.type === "PETTY_CASH");
  const nonPetty = accounts.filter((a) => a.type !== "PETTY_CASH");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href={base} className="text-sm text-[color:var(--color-muted)]">← ระบบบัญชี</Link>
        <h1 className="mt-1 text-2xl font-semibold">การเงิน — เงินสด / ธนาคาร / e-Wallet</h1>
      </div>

      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}
      {ok === "transfer" && <p className="text-sm text-emerald-600">โอนเงินระหว่างบัญชีสำเร็จ</p>}
      {ok === "petty" && <p className="text-sm text-emerald-600">บันทึกเงินสำรองจ่ายสำเร็จ</p>}

      {/* รายการบัญชีเงิน + ยอดคงเหลือ */}
      <div className="flex flex-col gap-2">
        {accounts.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีบัญชีเงิน</p>
        ) : (
          accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-[color:var(--color-muted)]">
                  {FINANCE_TYPE_LABEL[a.type]}
                  {a.bankName && ` · ${a.bankName}`}
                  {a.accountNo && ` · ${a.accountNo}`}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-semibold">{baht(a.balance)} ฿</div>
                  <Link href={`${base}/finance/${a.id}/statement`} className="text-xs text-[color:var(--color-muted)] underline">
                    ความเคลื่อนไหว
                  </Link>
                </div>
                <ConfirmDialog
                  action={archiveFinanceAccountAction}
                  fields={{ systemId, id: a.id }}
                  triggerLabel="ลบ"
                  triggerClassName="text-xs text-[color:var(--color-danger)] underline"
                  title="ลบบัญชีเงินนี้?"
                  detail="บัญชีเงินจะถูกซ่อน (ความเคลื่อนไหวเดิมยังอยู่)"
                  confirmLabel="ยืนยันลบ"
                  danger
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* เพิ่มบัญชีเงิน */}
      <form action={createFinanceAccountAction} className="card grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input type="hidden" name="systemId" value={systemId} />
        <h2 className="text-sm font-medium sm:col-span-2">เพิ่มบัญชีเงิน</h2>
        <select name="type" defaultValue="BANK" className={inputCls}>
          <option value="CASH">เงินสด</option>
          <option value="BANK">ธนาคาร</option>
          <option value="E_WALLET">e-Wallet</option>
          <option value="PETTY_CASH">เงินสำรองจ่าย</option>
        </select>
        <input name="name" required placeholder="ชื่อบัญชี (เช่น กสิกร ออมทรัพย์)" className={inputCls} />
        <input name="bankName" placeholder="ธนาคาร" className={inputCls} />
        <input name="accountNo" placeholder="เลขที่บัญชี" className={inputCls} />
        <input name="promptpayId" placeholder="PromptPay ID" className={inputCls} />
        <input name="openingBalance" type="number" step="0.01" placeholder="ยอดยกมา (บาท)" className={inputCls} />
        <input name="openingDate" type="date" className={inputCls} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="showOnDocuments" /> แสดงบนเอกสาร
        </label>
        <SubmitButton className="sm:col-span-2 sm:justify-self-start">+ เพิ่มบัญชีเงิน</SubmitButton>
      </form>

      {/* โอนระหว่างบัญชีเงิน */}
      {accounts.length >= 2 && (
        <form action={transferAction} className="card grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="systemId" value={systemId} />
          <h2 className="text-sm font-medium sm:col-span-2">โอนระหว่างบัญชีเงิน</h2>
          <select name="fromId" required className={inputCls}>
            <option value="">— จากบัญชี —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select name="toId" required className={inputCls}>
            <option value="">— ไปบัญชี —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input name="amount" type="number" step="0.01" required placeholder="จำนวนเงิน (บาท)" className={inputCls} />
          <input name="date" type="date" className={inputCls} />
          <input name="note" placeholder="หมายเหตุ" className={`${inputCls} sm:col-span-2`} />
          <SubmitButton className="sm:col-span-2 sm:justify-self-start">โอนเงิน</SubmitButton>
        </form>
      )}

      {/* เงินสำรองจ่าย — เติม/เบิกชดเชย */}
      {pettyAccounts.length > 0 && nonPetty.length > 0 && (
        <form action={pettyReplenishAction} className="card grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="systemId" value={systemId} />
          <h2 className="text-sm font-medium sm:col-span-2">เงินสำรองจ่าย — เติม / เบิกชดเชย</h2>
          <select name="pettyId" required className={inputCls}>
            <option value="">— บัญชีสำรองจ่าย —</option>
            {pettyAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select name="counterFinanceId" required className={inputCls}>
            <option value="">— จากบัญชี —</option>
            {nonPetty.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select name="kind" defaultValue="TOPUP" className={inputCls}>
            <option value="TOPUP">เติมเงิน</option>
            <option value="REIMBURSE">เบิกชดเชย</option>
          </select>
          <input name="amount" type="number" step="0.01" required placeholder="จำนวนเงิน (บาท)" className={inputCls} />
          <input name="date" type="date" className={inputCls} />
          <SubmitButton className="sm:col-span-2 sm:justify-self-start">บันทึก</SubmitButton>
        </form>
      )}
    </div>
  );
}
