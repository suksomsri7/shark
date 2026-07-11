import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { listCustomers } from "@/lib/modules/member/service";

const TIER_LABEL: Record<string, string> = {
  MEMBER: "สมาชิก",
  SILVER: "Silver",
  GOLD: "Gold",
  PLATINUM: "Platinum",
};
const baht = (s: number) => (s / 100).toLocaleString("th-TH");

// สมาชิก (tenant-level) — รวมลูกค้าทุกกิจการของร้าน
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const auth = await requireTenant();
  const customers = await listCustomers(auth.active.tenantId, q);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <h1 className="text-2xl font-semibold">สมาชิก</h1>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="ค้นหา ชื่อ / เบอร์ / รหัสสมาชิก"
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
        />
        <button className="btn btn-ghost text-sm">ค้นหา</button>
      </form>

      {customers.length === 0 ? (
        <div className="card text-center text-sm text-[color:var(--color-muted)]">
          {q ? "ไม่พบสมาชิก" : "ยังไม่มีสมาชิก — จะถูกสร้างอัตโนมัติเมื่อมีลูกค้าจอง/ซื้อ"}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {customers.map((c) => (
            <Link
              key={c.id}
              href={`/app/members/${c.id}`}
              className="flex items-center justify-between rounded-xl border p-3 hover:bg-[color:var(--color-surface-2)]"
            >
              <div>
                <div className="text-sm font-medium">{c.name ?? "ไม่ระบุชื่อ"}</div>
                <div className="text-xs text-[color:var(--color-muted)]">
                  {c.phone ?? "—"} · {c.memberCode ?? ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-[color:var(--color-muted)]">{TIER_LABEL[c.tier]}</div>
                <div className="text-xs">
                  {c.visitCount} ครั้ง · ฿{baht(c.totalSpentSatang)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
