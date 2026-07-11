import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { getProfile } from "@/lib/modules/member/service";
import { getBalance } from "@/lib/modules/point/service";

const TIER_LABEL: Record<string, string> = {
  MEMBER: "สมาชิก",
  SILVER: "Silver",
  GOLD: "Gold",
  PLATINUM: "Platinum",
};
const baht = (s: number) => (s / 100).toLocaleString("th-TH");

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
  const points = await getBalance(auth.active.tenantId, id);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/members" className="text-sm text-[color:var(--color-muted)]">
        ← สมาชิกทั้งหมด
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{c.name ?? "ไม่ระบุชื่อ"}</h1>
          <div className="text-sm text-[color:var(--color-muted)]">
            {c.phone ?? "—"} · {c.email ?? ""} · {c.memberCode ?? ""}
          </div>
        </div>
        <span className="rounded-full border px-2 py-0.5 text-xs">{TIER_LABEL[c.tier]}</span>
      </div>

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
          <div className="mt-1 text-xl font-semibold">฿{baht(c.totalSpentSatang)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-[color:var(--color-muted)]">สมาชิกตั้งแต่</div>
          <div className="mt-1 text-sm font-medium">{fmt(c.createdAt)}</div>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">ประวัติกิจกรรม</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีกิจกรรม</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {activities.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span>{a.summary}</span>
                <span className="whitespace-nowrap text-xs text-[color:var(--color-muted)]">
                  {fmt(a.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
