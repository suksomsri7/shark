import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { getProfile } from "@/lib/modules/member/service";
import { getCustomerPoints } from "@/lib/modules/point/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import { MoneyText } from "@/components/ui/MoneyText";
import { MEMBER_TIER_LABEL } from "@/lib/ui/status-labels";
import { MemberEditForm } from "@/lib/modules/member/customer-form";

function fmt(d: Date) {
  return d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auth = await requireTenant();
  const data = await getProfile(auth.active.tenantId, id);
  if (!data) notFound();
  const { customer: c, activities } = data;
  const points = await getCustomerPoints(auth.active.tenantId, c.memberSystemId, id);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title={c.name ?? "ไม่ระบุชื่อ"}
        back={{ href: "/app/members", label: "สมาชิกทั้งหมด" }}
        desc={[c.phone ?? "—", c.email, c.memberCode].filter(Boolean).join(" · ")}
        actions={<StatusChip value={c.tier} map={MEMBER_TIER_LABEL} tone="strong" />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card">
          <div className="text-xs text-[color:var(--color-muted)]">แต้มสะสม</div>
          <div className="mt-1 text-xl font-semibold">{points.toLocaleString("th-TH")}</div>
        </div>
        <div className="card">
          <div className="text-xs text-[color:var(--color-muted)]">มาใช้บริการ</div>
          <div className="mt-1 text-xl font-semibold">{c.visitCount}</div>
        </div>
        <div className="card">
          <div className="text-xs text-[color:var(--color-muted)]">ยอดสะสม</div>
          <div className="mt-1 text-xl font-semibold">
            <MoneyText satang={c.totalSpentSatang} />
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-[color:var(--color-muted)]">สมาชิกตั้งแต่</div>
          <div className="mt-1 text-sm font-medium">{fmt(c.createdAt)}</div>
        </div>
      </div>

      <Section title="แก้ไขข้อมูลสมาชิก" card>
        <MemberEditForm
          customerId={c.id}
          name={c.name}
          phone={c.phone}
          email={c.email}
          marketingConsent={c.marketingConsent}
        />
      </Section>

      <Section title="ประวัติกิจกรรม">
        <DataList
          items={activities.map((a) => ({
            key: a.id,
            primary: a.summary,
            trailing: (
              <span className="whitespace-nowrap text-xs text-[color:var(--color-muted)]">
                {fmt(a.createdAt)}
              </span>
            ),
          }))}
          empty="ยังไม่มีกิจกรรม — จะบันทึกเมื่อสมาชิกจอง/ซื้อ/สะสมแต้ม"
        />
      </Section>
    </div>
  );
}
