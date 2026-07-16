import type { SupportCaseStatus } from "@prisma/client";
import { requireBackoffice, logoutAction } from "@/lib/platform/actions";
import { listAllCases } from "@/lib/platform/support";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatThaiDateTime } from "@/lib/ui/date";

// ป้ายสถานะเคสเป็นไทย
const STATUS_LABEL: Record<string, string> = {
  OPEN: "รอตอบ",
  PENDING: "ตอบแล้ว รอร้าน",
  RESOLVED: "ปิดแล้ว",
};

// ตัวกรองสถานะ (แท็บ)
const FILTERS: { value: SupportCaseStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "ทั้งหมด" },
  { value: "OPEN", label: "รอตอบ" },
  { value: "PENDING", label: "รอร้าน" },
  { value: "RESOLVED", label: "ปิดแล้ว" },
];

const VALID = new Set<SupportCaseStatus>(["OPEN", "PENDING", "RESOLVED"]);

// รายการเคสจากทุกร้าน + ตัวกรองสถานะ
export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireBackoffice();
  const sp = await searchParams;
  const status = VALID.has(sp.status as SupportCaseStatus)
    ? (sp.status as SupportCaseStatus)
    : undefined;
  const cases = await listAllCases(status ? { status } : undefined);
  const active = status ?? "ALL";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="เรื่องช่วยเหลือจากร้าน"
        back={{ href: "/backoffice", label: "ภาพรวมแพลตฟอร์ม" }}
        desc={`ทั้งหมด ${cases.length.toLocaleString("th-TH")} เรื่อง`}
        actions={
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost text-sm">
              ออกจากระบบ
            </button>
          </form>
        }
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const isActive = active === f.value;
          const href = f.value === "ALL" ? "/backoffice/cases" : `/backoffice/cases?status=${f.value}`;
          return (
            <a
              key={f.value}
              href={href}
              className="rounded-full border px-3 py-1 text-sm"
              style={
                isActive
                  ? { borderColor: "var(--color-ink)", color: "var(--color-ink)", fontWeight: 600 }
                  : { color: "var(--color-muted)" }
              }
            >
              {f.label}
            </a>
          );
        })}
      </div>

      <DataList
        items={cases.map((c) => ({
          key: c.id,
          href: `/backoffice/cases/${c.id}`,
          primary: c.subject,
          secondary: `${c.tenantName} · อัปเดต ${formatThaiDateTime(c.updatedAt)}`,
          trailing: <StatusChip value={c.status} map={STATUS_LABEL} />,
        }))}
        empty="ยังไม่มีเรื่องที่แจ้งเข้ามา"
      />
    </div>
  );
}
