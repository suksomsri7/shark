import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { listLedgers } from "@/lib/modules/account/coa";
import { postJvAction } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormField } from "@/components/ui/FormField";
import { DataTable } from "@/components/ui/DataList";

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
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="บันทึกบัญชีด้วยมือ"
        back={{ href: `${base}/journal`, label: "สมุดรายวัน" }}
        desc="เดบิตรวมต้องเท่ากับเครดิตรวม · ลงในสมุดทั่วไป"
      />

      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}

      <form action={postJvAction} className="flex flex-col gap-3">
        <input type="hidden" name="systemId" value={systemId} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <FormField label="วันที่">
            <input type="date" name="date" defaultValue={today} className="input" />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="คำอธิบาย">
              <input name="memo" placeholder="เช่น ปรับปรุงค่าใช้จ่ายค้างจ่าย" className="input" />
            </FormField>
          </div>
        </div>

        <DataTable<number>
          minWidth={640}
          empty=""
          rows={Array.from({ length: ROWS }, (_, i) => i)}
          rowKey={(_, i) => String(i)}
          cols={[
            {
              key: "account",
              header: "บัญชี",
              render: () => (
                <select name="accountId" defaultValue="" className="input">
                  <option value="">— เลือกบัญชี —</option>
                  {ledgers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} {l.name}
                    </option>
                  ))}
                </select>
              ),
            },
            {
              key: "debit",
              header: "เดบิต (บาท)",
              align: "right",
              render: () => (
                <input name="debit" type="number" step="0.01" min="0" className="input text-right" />
              ),
            },
            {
              key: "credit",
              header: "เครดิต (บาท)",
              align: "right",
              render: () => (
                <input name="credit" type="number" step="0.01" min="0" className="input text-right" />
              ),
            },
            {
              key: "note",
              header: "หมายเหตุ",
              render: () => <input name="note" className="input" />,
            },
          ]}
        />

        <SubmitButton className="sm:self-start">บันทึก</SubmitButton>
      </form>
    </div>
  );
}
