import { revalidatePath } from "next/cache";
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
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";

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

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="ผังบัญชี"
        back={{ href: base, label: "ระบบบัญชี" }}
        desc="บัญชีระบบแก้ชื่อได้ ลบไม่ได้ · เพิ่มบัญชีเองได้"
      />

      <form action={addAction} className="card flex flex-wrap items-end gap-3">
        <div className="w-24">
          <FormField label="รหัส" required>
            <input name="code" required placeholder="6310" className="input" />
          </FormField>
        </div>
        <div className="flex-1">
          <FormField label="ชื่อบัญชี" required>
            <input name="name" required placeholder="ค่าการตลาดออนไลน์" className="input" />
          </FormField>
        </div>
        <div>
          <FormField label="ประเภท">
            <select name="type" className="input">
              {TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <SubmitButton>+ เพิ่ม</SubmitButton>
      </form>

      {TYPE_ORDER.map((type) => {
        const rows = active.filter((l) => l.type === type);
        if (rows.length === 0) return null;
        return (
          <Section key={type} title={TYPE_LABEL[type]}>
            {rows.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-mono text-xs text-[color:var(--color-muted)]">{l.code}</span> {l.name}{" "}
                  {l.isSystem && (
                    <span className="ml-1 text-xs text-[color:var(--color-muted)]">(บัญชีระบบ)</span>
                  )}
                </span>
                {!l.isSystem && (
                  <ConfirmDialog
                    action={archiveAction}
                    fields={{ ledgerId: l.id }}
                    triggerLabel="ปิดใช้งาน"
                    triggerClassName="text-xs text-[color:var(--color-muted)] hover:underline"
                    title="ปิดใช้งานบัญชีนี้?"
                    detail="บัญชีจะถูกซ่อนจากผังบัญชี (ข้อมูลเดิมยังอยู่)"
                    confirmLabel="ยืนยันปิดใช้งาน"
                    danger
                  />
                )}
              </div>
            ))}
          </Section>
        );
      })}

      <Section title="การผูกบัญชีอัตโนมัติ">
        <p className="text-xs text-[color:var(--color-muted)]">
          ระบบใช้บัญชีเหล่านี้ตอนลงบัญชีอัตโนมัติ — เปลี่ยนได้ถ้าต้องการผังเฉพาะ
        </p>
        {mappings.map((m) => (
          <form key={m.key} action={mapAction} className="flex items-center gap-2 text-sm">
            <input type="hidden" name="key" value={m.key} />
            <span className="w-48 shrink-0 font-mono text-xs text-[color:var(--color-muted)]">{m.key}</span>
            <select name="accountId" defaultValue={m.accountId} className="input flex-1">
              {active.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} {l.name}
                </option>
              ))}
            </select>
            <SubmitButton variant="ghost">บันทึก</SubmitButton>
          </form>
        ))}
      </Section>
    </div>
  );
}
