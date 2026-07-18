import { requireTenant } from "@/lib/core/context";
import { listPolicies } from "@/lib/modules/approval/service";
import { togglePolicyAction } from "@/lib/modules/approval/actions";
import { entityLabel, roleLabel } from "@/lib/modules/approval/labels";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { ApprovalPolicyForm } from "@/components/approval-policy-form";
import { ApprovalPolicyEditForm } from "@/components/approval-policy-edit-form";
import { formatBaht } from "@/lib/ui/money";

// ตั้งค่าสายอนุมัติ (WO-0049): สร้าง/เปิดปิด/แก้ไขกฎ maker-checker ต่อชนิดเอกสาร+วงเงิน
export default async function ApprovalSettingsPage() {
  const auth = await requireTenant();
  const policies = await listPolicies({ tenantId: auth.active.tenantId });
  // แก้สายอนุมัติ = การกระทำระดับตั้งกฎ → เฉพาะเจ้าของร้าน (สอดคล้อง updatePolicyAction)
  const canEdit = auth.active.role === "OWNER";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="สายอนุมัติ"
        desc="ตั้งกฎว่าเอกสารชนิดไหน วงเงินเท่าไร ต้องผ่านการอนุมัติจากใครก่อนมีผล เช่น ใบสั่งซื้อเกินห้าพันต้องให้ผู้จัดการและเจ้าของอนุมัติ"
      />

      <Section title="สายอนุมัติทั้งหมด" card>
        {policies.length === 0 ? (
          <EmptyState text="ยังไม่มีสายอนุมัติ — สร้างกฎแรกด้านล่าง เช่น ใบสั่งซื้อเกิน 5,000 บาท ต้องอนุมัติ" />
        ) : (
          <div className="flex flex-col gap-2">
            {policies.map((p) => (
              <div key={p.id} className="rounded-lg border px-3 py-2 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{p.name}</span>
                      <StatusChip
                        value={p.active ? "on" : "off"}
                        map={{ on: "เปิดอยู่", off: "ปิดอยู่" }}
                        tone={p.active ? "strong" : "muted"}
                      />
                    </div>
                    <div className="truncate text-xs text-[color:var(--color-muted)]">
                      {entityLabel(p.entityType)}
                      {p.thresholdSatang != null ? ` · ยอด ≥ ${formatBaht(p.thresholdSatang)}` : " · ทุกจำนวน"} →{" "}
                      {p.steps.map((s) => roleLabel(s.approverRole)).join(" → ")}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <form action={togglePolicyAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active" value={p.active ? "false" : "true"} />
                      <button type="submit" className="btn-sm">
                        {p.active ? "ปิด" : "เปิด"}
                      </button>
                    </form>
                  </div>
                </div>
                {canEdit && (
                  <details className="mt-2 border-t pt-2">
                    <summary className="cursor-pointer text-xs font-medium text-[color:var(--color-muted)]">
                      แก้ไขสายอนุมัติ
                    </summary>
                    <div className="mt-3">
                      <ApprovalPolicyEditForm
                        policy={{
                          id: p.id,
                          name: p.name,
                          entityType: p.entityType,
                          thresholdSatang: p.thresholdSatang,
                          steps: p.steps.map((s) => ({ order: s.order, approverRole: s.approverRole })),
                        }}
                      />
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="สร้างสายอนุมัติใหม่" card>
        <ApprovalPolicyForm />
      </Section>
    </div>
  );
}
