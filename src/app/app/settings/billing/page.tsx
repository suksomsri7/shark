import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import { MoneyText } from "@/components/ui/MoneyText";
import { formatThaiDate } from "@/lib/ui/date";

// สถานะบิลเป็นไทย (ไม่โชว์ enum ดิบ)
const STATUS_LABEL: Record<string, string> = {
  PENDING: "รอชำระ",
  PAID: "ชำระแล้ว",
  VOID: "ยกเลิกแล้ว",
};
const toneOf = (v: string): "muted" | "strong" => (v === "VOID" ? "muted" : "strong");

// บิลที่แพลตฟอร์มเรียกเก็บจากร้านนี้ (ร้านเห็นเฉพาะของตัวเอง — tenantDb inject tenantId)
export default async function ShopBillingPage() {
  const auth = await requireTenant();
  const invoices = await tenantDb({ tenantId: auth.active.tenantId }).platformInvoice.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="บิลจากแพลตฟอร์ม"
        back={{ href: "/app", label: "หน้าหลัก" }}
        desc="ค่าบริการต่าง ๆ ที่ SHARK เรียกเก็บ (เช่น โดเมนของตัวเอง)"
      />
      <DataList
        items={invoices.map((inv) => ({
          key: inv.id,
          primary: inv.title,
          secondary:
            inv.status === "PAID" && inv.paidAt
              ? `ชำระเมื่อ ${formatThaiDate(inv.paidAt)}`
              : inv.dueAt
                ? `ครบกำหนด ${formatThaiDate(inv.dueAt)}`
                : `ออกบิล ${formatThaiDate(inv.createdAt)}`,
          trailing: (
            <div className="flex flex-col items-end gap-1">
              <MoneyText satang={inv.amountSatang} />
              <StatusChip value={inv.status} map={STATUS_LABEL} toneOf={toneOf} />
            </div>
          ),
        }))}
        empty="ยังไม่มีบิลจากแพลตฟอร์ม"
      />
    </div>
  );
}
