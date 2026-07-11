import { revalidatePath } from "next/cache";
import Link from "next/link";
import type { AccountLedgerType } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import {
  listLedgers,
  listMappings,
  createLedger,
  archiveLedger,
  setMapping,
} from "@/lib/modules/account/coa";

const TYPE_LABEL: Record<AccountLedgerType, string> = {
  ASSET: "สินทรัพย์",
  LIABILITY: "หนี้สิน",
  EQUITY: "ส่วนของเจ้าของ",
  INCOME: "รายได้",
  COGS: "ต้นทุนขาย",
  EXPENSE: "ค่าใช้จ่าย",
};
const TYPE_ORDER: AccountLedgerType[] = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "COGS", "EXPENSE"];

export default async function ChartOfAccountsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { auth, tenantId } = await loadAccountSystem(id);
  assertAccountCan(auth, "account.chart.manage");
  const ctx = { tenantId, systemId: id };
  const base = `/app/sys/${id}/account`;
  const [ledgers, mappings] = await Promise.all([listLedgers(ctx), listMappings(ctx)]);
  const active = ledgers.filter((l) => !l.archivedAt);

  async function addAction(formData: FormData) {
    "use server";
    const { auth, tenantId } = await loadAccountSystem(id);
    assertAccountCan(auth, "account.chart.manage");
    const r = await createLedger(
      { tenantId, systemId: id },
      {
        code: String(formData.get("code") ?? ""),
        name: String(formData.get("name") ?? ""),
        type: String(formData.get("type") ?? "EXPENSE") as AccountLedgerType,
      },
    );
    if (r.ok) await writeAudit({ tenantId, actorId: auth.user.id, action: "account.chart.manage", targetType: "AccountLedger", targetId: r.id, after: { code: formData.get("code") } });
    revalidatePath(`${base}/accounts`);
  }
  async function archiveAction(formData: FormData) {
    "use server";
    const { auth, tenantId } = await loadAccountSystem(id);
    assertAccountCan(auth, "account.chart.manage");
    await archiveLedger({ tenantId, systemId: id }, String(formData.get("ledgerId") ?? ""));
    await writeAudit({ tenantId, actorId: auth.user.id, action: "account.chart.manage", targetType: "AccountLedger", targetId: String(formData.get("ledgerId") ?? "") });
    revalidatePath(`${base}/accounts`);
  }
  async function mapAction(formData: FormData) {
    "use server";
    const { auth, tenantId } = await loadAccountSystem(id);
    assertAccountCan(auth, "account.mapping.manage");
    await setMapping({ tenantId, systemId: id }, String(formData.get("key") ?? ""), String(formData.get("accountId") ?? ""));
    await writeAudit({ tenantId, actorId: auth.user.id, action: "account.mapping.manage", targetType: "AccountMapping", targetId: String(formData.get("key") ?? "") });
    revalidatePath(`${base}/accounts`);
  }

  const inputCls = "rounded-lg border px-2 py-1.5 text-sm";
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href={base} className="text-sm text-[color:var(--color-muted)]">← ระบบบัญชี</Link>
        <h1 className="mt-1 text-2xl font-semibold">ผังบัญชี</h1>
        <p className="text-sm text-[color:var(--color-muted)]">บัญชีระบบ (🔒) แก้ชื่อได้ ลบไม่ได้ · เพิ่มบัญชีเองได้</p>
      </div>

      <form action={addAction} className="card flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1"><label className="text-xs">รหัส</label><input name="code" required placeholder="6310" className={`${inputCls} w-24`} /></div>
        <div className="flex flex-1 flex-col gap-1"><label className="text-xs">ชื่อบัญชี</label><input name="name" required placeholder="ค่าการตลาดออนไลน์" className={inputCls} /></div>
        <div className="flex flex-col gap-1"><label className="text-xs">ประเภท</label>
          <select name="type" className={inputCls}>{TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
        </div>
        <button className="btn btn-primary text-sm">+ เพิ่ม</button>
      </form>

      {TYPE_ORDER.map((type) => {
        const rows = active.filter((l) => l.type === type);
        if (rows.length === 0) return null;
        return (
          <section key={type} className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">{TYPE_LABEL[type]}</h2>
            {rows.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm">
                <span><span className="font-mono text-xs">{l.code}</span> {l.name} {l.isSystem && <span title="บัญชีระบบ">🔒</span>}</span>
                {!l.isSystem && (
                  <form action={archiveAction}>
                    <input type="hidden" name="ledgerId" value={l.id} />
                    <button className="text-xs text-[color:var(--color-muted)] hover:underline">ปิดใช้งาน</button>
                  </form>
                )}
              </div>
            ))}
          </section>
        );
      })}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">การผูกบัญชีอัตโนมัติ (mapping)</h2>
        <p className="text-xs text-[color:var(--color-muted)]">ระบบใช้บัญชีเหล่านี้ตอนลงบัญชีอัตโนมัติ — เปลี่ยนได้ถ้าต้องการผังเฉพาะ</p>
        {mappings.map((m) => (
          <form key={m.key} action={mapAction} className="flex items-center gap-2 text-sm">
            <input type="hidden" name="key" value={m.key} />
            <span className="w-48 shrink-0 font-mono text-xs">{m.key}</span>
            <select name="accountId" defaultValue={m.accountId} className={`${inputCls} flex-1`}>
              {active.map((l) => <option key={l.id} value={l.id}>{l.code} {l.name}</option>)}
            </select>
            <button className="btn btn-ghost text-xs">บันทึก</button>
          </form>
        ))}
      </section>
    </div>
  );
}
