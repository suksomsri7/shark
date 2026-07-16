import { notFound } from "next/navigation";
import { requireBackoffice, logoutAction } from "@/lib/platform/actions";
import { tenantDetail } from "@/lib/platform/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { formatThaiDateLong } from "@/lib/ui/date";
import { systemDef } from "@/lib/systems";

// ป้ายสถานะร้านเป็นไทย (ไม่โชว์ enum ดิบ)
const STATUS_LABEL: Record<string, string> = {
  PENDING: "รอยืนยัน",
  ACTIVE: "ใช้งานอยู่",
  SUSPENDED: "ถูกระงับ",
  CLOSED: "ปิดร้าน",
  PENDING_DELETE: "รอลบข้อมูล",
};
const PLAN_LABEL: Record<string, string> = { FREE: "ฟรี" };

// รายละเอียดร้าน (read-only Phase 0) — ข้อมูลร้าน + รายชื่อระบบที่เปิด
export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireBackoffice();
  const { id } = await params;
  const t = await tenantDetail(id);
  if (!t) notFound();

  const info: { label: string; value: string }[] = [
    { label: "สถานะ", value: STATUS_LABEL[t.status] ?? t.status },
    { label: "แพ็กเกจ", value: PLAN_LABEL[t.plan] ?? t.plan },
    { label: "รหัสร้าน (slug)", value: t.slug },
    { label: "วันสมัคร", value: formatThaiDateLong(t.createdAt) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.name}
        back={{ href: "/backoffice/tenants", label: "ร้านค้าทั้งหมด" }}
        actions={
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost text-sm">
              ออกจากระบบ
            </button>
          </form>
        }
      />

      <Section title="ข้อมูลร้าน" card>
        <dl className="flex flex-col gap-2 text-sm">
          {info.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <dt className="text-[color:var(--color-muted)]">{row.label}</dt>
              <dd className="text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title={`ระบบที่เปิด (${t.systems.length.toLocaleString("th-TH")})`}>
        <DataList
          items={t.systems.map((s) => ({
            key: s.id,
            primary: `${systemDef(s.type)?.icon ?? "•"} ${s.name}`,
            secondary: systemDef(s.type)?.label ?? s.type,
            trailing: (
              <span className="text-xs text-[color:var(--color-muted)]">
                {s.active ? "เปิดใช้งาน" : "ปิดอยู่"}
              </span>
            ),
          }))}
          empty="ร้านนี้ยังไม่ได้เปิดระบบใด"
        />
      </Section>
    </div>
  );
}
