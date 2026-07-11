import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { listRewards } from "@/lib/modules/reward/service";
import { CouponContent } from "@/lib/modules/coupon/ui";
import { MeetingContent } from "@/lib/modules/meeting/ui";
import { KanbanContent } from "@/lib/modules/kanban/ui";
import { AccountContent } from "@/lib/modules/account/ui";
import {
  linkUnitAction,
  unlinkUnitAction,
  addRewardAction,
  removeRewardAction,
} from "@/lib/actions/systems";

const baht = (s: number) => (s / 100).toLocaleString("th-TH");
const fmt = (d: Date) =>
  d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

// หน้า "ระบบ" ประเภท feature (สมาชิก/แต้ม/POS/รางวัล) — เนื้อหา + การเชื่อมต่อ
export default async function SystemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  const [links, units] = await Promise.all([
    prisma.appSystemUnit.findMany({ where: { tenantId, systemId: id } }),
    prisma.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const linkedIds = new Set(links.map((l) => l.unitId));
  const linkedUnits = units.filter((u) => linkedIds.has(u.id));
  const otherUnits = units.filter((u) => !linkedIds.has(u.id));
  const back = `/app/sys/${id}`;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <Link href="/app" className="text-sm text-[color:var(--color-muted)]">
          ← ระบบทั้งหมด
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xl">{def?.icon}</span>
          <h1 className="text-2xl font-semibold">{sys.name}</h1>
        </div>
        <div className="text-sm text-[color:var(--color-muted)]">ระบบ{def?.label}</div>
      </div>

      {/* การเชื่อมต่อ */}
      <section className="card flex flex-col gap-3">
        <h2 className="text-sm font-medium">เชื่อมต่อกับระบบ</h2>
        {linkedUnits.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">
            ยังไม่ได้เชื่อม — เชื่อมกับระบบธุรกิจ (จองคิว ฯลฯ) เพื่อให้ทำงานร่วมกัน
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {linkedUnits.map((u) => (
              <form key={u.id} action={unlinkUnitAction} className="inline-flex">
                <input type="hidden" name="systemId" value={id} />
                <input type="hidden" name="unitId" value={u.id} />
                <input type="hidden" name="back" value={back} />
                <button
                  className="rounded-full border px-2.5 py-1 text-xs hover:bg-[color:var(--color-surface-2)]"
                  title="กดเพื่อยกเลิกการเชื่อม"
                >
                  {u.name} ✕
                </button>
              </form>
            ))}
          </div>
        )}
        {otherUnits.length > 0 && (
          <form action={linkUnitAction} className="flex gap-2">
            <input type="hidden" name="systemId" value={id} />
            <input type="hidden" name="back" value={back} />
            <select name="unitId" className="flex-1 rounded-lg border px-2 py-1.5 text-sm">
              {otherUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost text-sm">+ เชื่อม</button>
          </form>
        )}
      </section>

      {/* เนื้อหาตามประเภท */}
      {sys.type === "MEMBER" && <MemberContent systemId={id} />}
      {sys.type === "POINT" && <PointContent systemId={id} />}
      {sys.type === "POS" && <PosContent systemId={id} tenantId={tenantId} />}
      {sys.type === "REWARD" && <RewardContent systemId={id} tenantId={tenantId} />}
      {sys.type === "COUPON" && <CouponContent systemId={id} tenantId={tenantId} />}
      {sys.type === "MEETING" && <MeetingContent systemId={id} tenantId={tenantId} />}
      {sys.type === "KANBAN" && <KanbanContent systemId={id} tenantId={tenantId} />}
      {sys.type === "ACCOUNT" && <AccountContent systemId={id} tenantId={tenantId} />}
    </div>
  );
}

async function MemberContent({ systemId }: { systemId: string }) {
  const customers = await prisma.customer.findMany({
    where: { memberSystemId: systemId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">สมาชิก ({customers.length})</h2>
      {customers.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">
          ยังไม่มีสมาชิก — จะถูกสร้างอัตโนมัติเมื่อลูกค้าจอง/ซื้อในระบบที่เชื่อมไว้
        </p>
      ) : (
        customers.map((c) => (
          <Link
            key={c.id}
            href={`/app/members/${c.id}`}
            className="flex items-center justify-between rounded-xl border p-3 hover:bg-[color:var(--color-surface-2)]"
          >
            <div>
              <div className="text-sm font-medium">{c.name ?? "ไม่ระบุชื่อ"}</div>
              <div className="text-xs text-[color:var(--color-muted)]">
                {c.phone ?? "—"} · {c.memberCode}
              </div>
            </div>
            <div className="text-xs text-[color:var(--color-muted)]">
              {c.visitCount} ครั้ง · ฿{baht(c.totalSpentSatang)}
            </div>
          </Link>
        ))
      )}
    </section>
  );
}

async function PointContent({ systemId }: { systemId: string }) {
  const ledger = await prisma.pointLedger.findMany({
    where: { systemId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">รายการแต้มล่าสุด</h2>
      <p className="text-xs text-[color:var(--color-muted)]">อัตราสะสม: ทุก 25 บาท = 1 แต้ม</p>
      {ledger.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีรายการ</p>
      ) : (
        ledger.map((l) => (
          <div key={l.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
            <span>
              {l.delta > 0 ? "+" : ""}
              {l.delta} แต้ม · {l.reason ?? l.type}
            </span>
            <span className="text-xs text-[color:var(--color-muted)]">{fmt(l.createdAt)}</span>
          </div>
        ))
      )}
    </section>
  );
}

async function PosContent({ systemId, tenantId }: { systemId: string; tenantId: string }) {
  const sales = await prisma.posSale.findMany({
    where: { tenantId, systemId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const paid = sales.filter((s) => s.status === "PAID");
  const total = paid.reduce((s, x) => s + x.grandTotalSatang, 0);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">การขาย</h2>
      <div className="text-sm text-[color:var(--color-muted)]">
        รวม ฿{baht(total)} · {paid.length} บิล (ล่าสุด 50 รายการ)
      </div>
      {sales.map((s) => (
        <div key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
          <span>
            {s.receiptNo} · ฿{baht(s.grandTotalSatang)}
            {s.status !== "PAID" && (
              <span className="ml-1 text-xs text-[color:var(--color-danger)]">({s.status})</span>
            )}
          </span>
          <span className="text-xs text-[color:var(--color-muted)]">{fmt(s.createdAt)}</span>
        </div>
      ))}
      {sales.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีการขาย</p>}
    </section>
  );
}

async function RewardContent({ systemId, tenantId }: { systemId: string; tenantId: string }) {
  const rewards = (await listRewards(tenantId, systemId)).filter((r) => r.active);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">รายการรางวัล</h2>
      {rewards.map((r) => (
        <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
          <span>
            {r.name} · {r.pointsCost} แต้ม
            {r.stock !== null && ` · เหลือ ${r.stock}`}
          </span>
          <form action={removeRewardAction}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="systemId" value={systemId} />
            <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
          </form>
        </div>
      ))}
      <form action={addRewardAction} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input type="hidden" name="systemId" value={systemId} />
        <input name="name" required placeholder="ชื่อรางวัล" className="col-span-2 rounded-lg border px-2 py-1.5 text-sm" />
        <input name="pointsCost" type="number" min={1} required placeholder="แต้ม" className="rounded-lg border px-2 py-1.5 text-sm" />
        <button className="btn btn-ghost text-sm">+ เพิ่ม</button>
      </form>
    </section>
  );
}
