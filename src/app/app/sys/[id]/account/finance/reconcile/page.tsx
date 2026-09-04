// WO 5.2 — placeholder "กระทบยอดธนาคาร" (หน้าจริงเต็มรูป = WO 5.3 · เฟรม g10)
// ลิงก์ "นำเข้า statement" บนหน้าภาพรวมการเงิน (f7) ชี้มาที่นี่ — เพื่อไม่ให้เป็นลิงก์ตาย (dead link)
// ก่อน WO 5.3 จะเข้ามาสร้าง AccountBankStatementLine + หน้าจับคู่จริง
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await loadAccountSystem(id, { can: "account.finance.manage" });
  return (
    <div className="flex flex-col gap-4 pb-24" data-testid="finance-reconcile-soon">
      <PageHeader title="กระทบยอดธนาคาร" desc="นำเข้า statement + จับคู่รายการอัตโนมัติ" />
      <div className="card flex flex-col items-center gap-2 py-16 text-center">
        <p className="text-lg font-medium">เร็ว ๆ นี้ (WO 5.3)</p>
        <p className="max-w-md text-sm text-[color:var(--color-muted)]">
          หน้านี้จะรองรับนำเข้า statement ธนาคาร (CSV) · จับคู่รายการอัตโนมัติตามยอด+วันที่ · จับคู่มือ ·
          สร้างรายการค่าธรรมเนียม/ดอกเบี้ยจากแถว statement · ยืนยันเดือนเมื่อส่วนต่างเป็น 0
        </p>
      </div>
    </div>
  );
}
