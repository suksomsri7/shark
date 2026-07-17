import { requireTenant } from "@/lib/core/context";
import { listRules } from "@/lib/automation/service";
import { toggleRuleAction, deleteRuleAction } from "@/lib/automation/actions";
import { eventLabel, actionLabel } from "@/lib/automation/labels";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { AutomationRuleForm } from "@/components/automation-rule-form";
import { formatBaht } from "@/lib/ui/money";

// ตั้งค่าระบบอัตโนมัติ (WO-0026): สร้าง/เปิดปิด/ลบกติกา "เมื่อเกิด X → ทำ Y"
export default async function AutomationSettingsPage() {
  const auth = await requireTenant();
  const rules = await listRules({ tenantId: auth.active.tenantId });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="ระบบอัตโนมัติ"
        desc="ตั้งกติกาให้ระบบทำงานเองเมื่อเกิดเหตุการณ์ เช่น เตือนเมื่อมีบิลใหญ่ หรือส่งข้อมูลไปเชื่อมระบบอื่น"
      />

      <Section title="กติกาทั้งหมด" card>
        {rules.length === 0 ? (
          <EmptyState text="ยังไม่มีกติกา — สร้างกติกาแรกด้านล่าง เช่น เตือนเมื่อขายได้เกิน 1,000 บาท" />
        ) : (
          <div className="flex flex-col gap-2">
            {rules.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.name}</span>
                    <StatusChip
                      value={r.enabled ? "on" : "off"}
                      map={{ on: "เปิดอยู่", off: "ปิดอยู่" }}
                      tone={r.enabled ? "strong" : "muted"}
                    />
                  </div>
                  <div className="truncate text-xs text-[color:var(--color-muted)]">
                    เมื่อ {eventLabel(r.event)}
                    {r.minAmountSatang != null ? ` · ยอด ≥ ${formatBaht(r.minAmountSatang)}` : ""} →{" "}
                    {actionLabel(r.actionType)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={toggleRuleAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="enabled" value={r.enabled ? "false" : "true"} />
                    <button type="submit" className="btn-sm">
                      {r.enabled ? "ปิด" : "เปิด"}
                    </button>
                  </form>
                  <ConfirmDialog
                    triggerLabel="ลบ"
                    triggerClassName="btn-sm"
                    title="ลบกติกานี้?"
                    detail={`"${r.name}" จะถูกลบและหยุดทำงานทันที (ประวัติการทำงานเดิมยังเก็บไว้)`}
                    confirmLabel="ยืนยันลบ"
                    danger
                    action={deleteRuleAction}
                    fields={{ id: r.id }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="สร้างกติกาใหม่" card>
        <AutomationRuleForm />
      </Section>
    </div>
  );
}
