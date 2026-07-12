import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { listLedgers } from "@/lib/modules/account/coa";
import { postJvAction } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

const inputCls = "rounded-lg border px-2 py-1.5 text-sm";
const ROWS = 8;

export default async function NewJvPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { id } = await params;
  const { err } = await searchParams;
  const { auth, tenantId, systemId } = await loadAccountSystem(id);
  assertAccountCan(auth, "account.journal.adjust");

  const ledgers = (await listLedgers({ tenantId, systemId })).filter((l) => !l.archivedAt);
  const base = `/app/sys/${id}/account`;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={`${base}/journal`} className="text-sm text-[color:var(--color-muted)]">← บัญชีรายวัน</Link>
        <h1 className="mt-1 text-2xl font-semibold">บันทึกบัญชีด้วยมือ (JV)</h1>
        <p className="text-sm text-[color:var(--color-muted)]">เดบิตรวมต้องเท่ากับเครดิตรวม · ลงในสมุดทั่วไป (ADJUST)</p>
      </div>

      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}

      <form action={postJvAction} className="flex flex-col gap-3">
        <input type="hidden" name="systemId" value={systemId} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            วันที่
            <input type="date" name="date" defaultValue={today} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)] sm:col-span-2">
            คำอธิบาย
            <input name="memo" placeholder="เช่น ปรับปรุงค่าใช้จ่ายค้างจ่าย" className={inputCls} />
          </label>
        </div>

        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-surface-2)] text-xs text-[color:var(--color-muted)]">
              <tr>
                <th className="px-2 py-2 text-left">บัญชี</th>
                <th className="px-2 py-2 text-right">เดบิต (บาท)</th>
                <th className="px-2 py-2 text-right">เครดิต (บาท)</th>
                <th className="px-2 py-2 text-left">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {Array.from({ length: ROWS }).map((_, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5">
                    <select name="accountId" defaultValue="" className={`${inputCls} w-full`}>
                      <option value="">— เลือกบัญชี —</option>
                      {ledgers.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.code} {l.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input name="debit" type="number" step="0.01" min="0" className={`${inputCls} w-28 text-right`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input name="credit" type="number" step="0.01" min="0" className={`${inputCls} w-28 text-right`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input name="note" className={`${inputCls} w-full`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <SubmitButton className="sm:self-start">บันทึก JV</SubmitButton>
      </form>
    </div>
  );
}
