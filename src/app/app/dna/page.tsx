import { requireTenant } from "@/lib/core/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { DnaWizard } from "@/components/dna-wizard";

// /app/dna — บทสัมภาษณ์ DNA: AI ถามข้อเท็จจริงของธุรกิจทีละข้อ
// ตอบครบ → บันทึก → ไปหน้าพิมพ์เขียว (/app/dna/blueprint)
export default async function DnaWizardPage() {
  const auth = await requireTenant();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="ตั้งค่าธุรกิจของคุณ"
        desc={`ตอบคำถามสั้น ๆ แล้ว ${auth.active.tenant.name} จะได้ระบบที่ประกอบมาให้พอดีกับกิจการ`}
      />
      <DnaWizard />
    </div>
  );
}
