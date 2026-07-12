import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { financeBalances, FINANCE_TYPE_LABEL } from "@/lib/modules/account/finance";
import {
  createFinanceAccountAction,
  archiveFinanceAccountAction,
  transferAction,
  pettyReplenishAction,
} from "./actions";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import MoneyText from "@/components/ui/MoneyText";
import FormField from "@/components/ui/FormField";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";

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
      <PageHeader
        title="บัญชีเงิน — เงินสด / ธนาคาร / e-Wallet"
        back={{ href: base, label: "ระบบบัญชี" }}
      />

      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}
      {ok === "transfer" && <p className="text-sm font-medium">โอนเงินระหว่างบัญชีสำเร็จ</p>}
      {ok === "petty" && <p className="text-sm font-medium">บันทึกเงินสำรองจ่ายสำเร็จ</p>}

      {/* รายการบัญชีเงิน + ยอดคงเหลือ */}
      <DataList
        items={accounts.map((a) => ({
          key: a.id,
          primary: <span className="font-medium">{a.name}</span>,
          secondary: (
            <>
              {FINANCE_TYPE_LABEL[a.type]}
              {a.bankName && ` · ${a.bankName}`}
              {a.accountNo && ` · ${a.accountNo}`}
            </>
          ),
          trailing: (
            <>
              <div className="text-right">
                <div className="font-semibold">
                  <MoneyText satang={a.balance} decimals />
                </div>
                <Link
                  href={`${base}/finance/${a.id}/statement`}
                  className="text-xs text-[color:var(--color-muted)] underline"
                >
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
            </>
          ),
        }))}
        empty="ยังไม่มีบัญชีเงิน — เพิ่มบัญชีด้านล่างเพื่อเริ่มบันทึกเงินสด/ธนาคาร"
      />

      {/* เพิ่มบัญชีเงิน */}
      <Section title="เพิ่มบัญชีเงิน" card>
        <form action={createFinanceAccountAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="systemId" value={systemId} />
          <FormField label="ประเภทบัญชี">
            <select name="type" defaultValue="BANK" className="input">
              <option value="CASH">เงินสด</option>
              <option value="BANK">ธนาคาร</option>
              <option value="E_WALLET">e-Wallet</option>
              <option value="PETTY_CASH">เงินสำรองจ่าย</option>
            </select>
          </FormField>
          <FormField label="ชื่อบัญชี" hint="เช่น กสิกร ออมทรัพย์" required>
            <input name="name" required className="input" />
          </FormField>
          <FormField label="ธนาคาร">
            <input name="bankName" className="input" />
          </FormField>
          <FormField label="เลขที่บัญชี">
            <input name="accountNo" className="input" />
          </FormField>
          <FormField label="พร้อมเพย์ (PromptPay)">
            <input name="promptpayId" className="input" />
          </FormField>
          <FormField label="ยอดยกมา (บาท)">
            <input name="openingBalance" type="number" step="0.01" className="input" />
          </FormField>
          <FormField label="วันที่ยกยอด">
            <input name="openingDate" type="date" className="input" />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="showOnDocuments" /> แสดงบนเอกสาร
          </label>
          <SubmitButton className="sm:col-span-2 sm:justify-self-start">+ เพิ่มบัญชีเงิน</SubmitButton>
        </form>
      </Section>

      {/* โอนระหว่างบัญชีเงิน */}
      {accounts.length >= 2 && (
        <Section title="โอนระหว่างบัญชีเงิน" card>
          <form action={transferAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input type="hidden" name="systemId" value={systemId} />
            <FormField label="จากบัญชี" required>
              <select name="fromId" required className="input">
                <option value="">— จากบัญชี —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </FormField>
            <FormField label="ไปบัญชี" required>
              <select name="toId" required className="input">
                <option value="">— ไปบัญชี —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </FormField>
            <FormField label="จำนวนเงิน (บาท)" required>
              <input name="amount" type="number" step="0.01" required className="input" />
            </FormField>
            <FormField label="วันที่">
              <input name="date" type="date" className="input" />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="หมายเหตุ">
                <input name="note" className="input" />
              </FormField>
            </div>
            <SubmitButton className="sm:col-span-2 sm:justify-self-start">โอนเงิน</SubmitButton>
          </form>
        </Section>
      )}

      {/* เงินสำรองจ่าย — เติม/เบิกชดเชย */}
      {pettyAccounts.length > 0 && nonPetty.length > 0 && (
        <Section title="เงินสำรองจ่าย — เติม / เบิกชดเชย" card>
          <form action={pettyReplenishAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input type="hidden" name="systemId" value={systemId} />
            <FormField label="บัญชีสำรองจ่าย" required>
              <select name="pettyId" required className="input">
                <option value="">— บัญชีสำรองจ่าย —</option>
                {pettyAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </FormField>
            <FormField label="จากบัญชี" required>
              <select name="counterFinanceId" required className="input">
                <option value="">— จากบัญชี —</option>
                {nonPetty.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </FormField>
            <FormField label="ประเภทรายการ">
              <select name="kind" defaultValue="TOPUP" className="input">
                <option value="TOPUP">เติมเงิน</option>
                <option value="REIMBURSE">เบิกชดเชย</option>
              </select>
            </FormField>
            <FormField label="จำนวนเงิน (บาท)" required>
              <input name="amount" type="number" step="0.01" required className="input" />
            </FormField>
            <FormField label="วันที่">
              <input name="date" type="date" className="input" />
            </FormField>
            <SubmitButton className="sm:col-span-2 sm:justify-self-start">บันทึก</SubmitButton>
          </form>
        </Section>
      )}
    </div>
  );
}
