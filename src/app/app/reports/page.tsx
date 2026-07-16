import { PageHeader } from "@/components/ui/PageHeader";
import { DATASETS } from "@/lib/modules/reports/service";
import { listReportsAction } from "@/lib/modules/reports/actions";
import { ReportBuilder, type DatasetMeta, type SavedReport } from "./ReportBuilder";

// หน้าเครื่องมือสร้างรายงาน (WO-0055) — เลือกชุดข้อมูล → กรอง → จัดกลุ่ม → ตาราง/CSV + บันทึก
// datasets meta ดึงจากนิยาม DATASETS (ไม่แตะ DB) · รายงานที่บันทึกไว้ดึงผ่าน action (ผูก session)

export default async function ReportsPage() {
  const datasets: DatasetMeta[] = Object.entries(DATASETS).map(([key, d]) => ({
    key,
    label: d.label,
    columns: d.columns,
  }));
  const saved = (await listReportsAction()) as SavedReport[];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="รายงาน"
        back={{ href: "/app", label: "หน้าหลัก" }}
        desc="เลือกชุดข้อมูล กรอง และจัดกลุ่ม เพื่อดูเป็นตาราง ดาวน์โหลด CSV หรือบันทึกไว้ใช้ซ้ำ"
      />
      <ReportBuilder datasets={datasets} initialSaved={saved} />
    </div>
  );
}
