// WO 6.1 — "การผูกบัญชีอัตโนมัติ" (§7.10) ย้ายออกจากหน้าผังบัญชีเดิมมาที่นี่
// (f8 ไม่มีบล็อกนี้บนหน้าผังบัญชี — แต่ยังต้องแก้ได้ ⇒ เข้าถึงจากแผงขวาของบัญชีที่ระบบใช้ลงบัญชีอัตโนมัติ)
import Link from "next/link";
import { requireAccountPage } from "@/lib/modules/account/guard";
import { listLedgers, listMappings } from "@/lib/modules/account/coa";
import { setMappingFormAction } from "../actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { SubmitButton } from "@/components/ui/SubmitButton";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, systemId } = await requireAccountPage(id, "account.mapping.manage");
  const base = `/app/sys/${id}/account`;
  const [ledgers, mappings] = await Promise.all([listLedgers({ tenantId, systemId }), listMappings({ tenantId, systemId })]);
  const active = ledgers.filter((l) => !l.archivedAt);

  return (
    <div className="flex max-w-3xl flex-col gap-4 pb-16">
      <PageHeader
        title="การผูกบัญชีอัตโนมัติ"
        back={{ href: `${base}/accounts`, label: "ผังบัญชี" }}
        desc="ระบบใช้บัญชีเหล่านี้ตอนลงบัญชีอัตโนมัติ — เปลี่ยนได้ถ้าต้องการผังเฉพาะ"
      />
      <Section title="รายการผูกบัญชี">
        {mappings.map((m) => (
          <form key={m.key} action={setMappingFormAction} className="flex items-center gap-2 text-sm">
            <input type="hidden" name="systemId" value={systemId} />
            <input type="hidden" name="key" value={m.key} />
            <span className="w-48 shrink-0 font-mono text-xs text-[color:var(--color-muted)]">{m.key}</span>
            <select name="accountId" defaultValue={m.accountId} className="input flex-1" aria-label={`บัญชีของ ${m.key}`}>
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
      <Link href={`${base}/accounts`} className="text-sm text-[color:var(--color-muted)]">
        ← กลับไปผังบัญชี
      </Link>
    </div>
  );
}
