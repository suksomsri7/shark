import { requireTenant } from "@/lib/core/context";
import { listPending } from "@/lib/modules/approval/service";
import { decideAction } from "@/lib/modules/approval/actions";
import { entityLabel } from "@/lib/modules/approval/labels";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatBaht } from "@/lib/ui/money";

// รออนุมัติของฉัน (WO-0049): คำขอที่รอผู้ใช้คนนี้ตัดสิน (ตาม role/step) + ปุ่มอนุมัติ/ไม่อนุมัติ
export default async function ApprovalsPage() {
  const auth = await requireTenant();
  const m = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
    userId: auth.active.userId,
  };
  const pending = await listPending({ tenantId: auth.active.tenantId }, m);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="รออนุมัติของฉัน"
        back={{ href: "/app", label: "หน้าหลัก" }}
        desc="คำขอที่รอให้คุณอนุมัติหรือไม่อนุมัติ ตามลำดับขั้นในสายอนุมัติของร้าน"
      />

      <Section title={`คำขอรอตัดสิน (${pending.length})`} card>
        {pending.length === 0 ? (
          <EmptyState text="ไม่มีคำขอที่รอคุณตัดสินตอนนี้" />
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {entityLabel(r.entityType)}
                    {r.amountSatang != null ? ` · ${formatBaht(r.amountSatang)}` : ""}
                  </div>
                  <div className="truncate text-xs text-[color:var(--color-muted)]">
                    ขั้นที่ {r.currentStepOrder} · ยื่นเมื่อ{" "}
                    {r.createdAt.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ConfirmDialog
                    triggerLabel="อนุมัติ"
                    triggerClassName="btn-sm"
                    title="อนุมัติคำขอนี้?"
                    detail={`${entityLabel(r.entityType)}${r.amountSatang != null ? ` · ${formatBaht(r.amountSatang)}` : ""}`}
                    confirmLabel="ยืนยันอนุมัติ"
                    action={decideAction}
                    fields={{ requestId: r.id, decision: "APPROVED" }}
                    reasonField={{ name: "note", label: "หมายเหตุ (ถ้ามี)" }}
                  />
                  <ConfirmDialog
                    triggerLabel="ไม่อนุมัติ"
                    triggerClassName="btn-sm"
                    title="ไม่อนุมัติคำขอนี้?"
                    detail="คำขอจะถูกปฏิเสธทันที และไม่ไปขั้นถัดไป"
                    confirmLabel="ยืนยันไม่อนุมัติ"
                    danger
                    action={decideAction}
                    fields={{ requestId: r.id, decision: "REJECTED" }}
                    reasonField={{ name: "note", label: "เหตุผลที่ไม่อนุมัติ", required: true }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
