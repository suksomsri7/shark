import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { linkUnitAction, unlinkUnitAction } from "@/lib/actions/systems";

const FEATURE_TYPES = ["MEMBER", "POINT", "POS", "REWARD"] as const;

// ปุ่มเข้าใช้งานระบบธุรกิจ (business) แต่ละประเภท — ปุ่มแรก = primary
const UNIT_NAV: Record<string, { href: string; label: string }[]> = {
  BOOKING: [
    { href: "/booking", label: "เปิดระบบจองคิว →" },
    { href: "/booking/setup", label: "ตั้งค่าบริการ/พนักงาน" },
  ],
  HOTEL: [
    { href: "/hotel", label: "เปิดระบบโรงแรม →" },
    { href: "/hotel/setup", label: "ตั้งค่าห้องพัก" },
  ],
  QUEUE: [
    { href: "/queue", label: "เปิดระบบบัตรคิว →" },
    { href: "/queue/setup", label: "ตั้งค่าคิว/เคาน์เตอร์" },
  ],
  TICKET: [
    { href: "/ticket", label: "เปิดระบบตั๋ว / อีเวนต์ →" },
    { href: "/ticket/checkin", label: "เช็คอินหน้างาน" },
  ],
  RESTAURANT: [
    { href: "/restaurant", label: "เปิดระบบร้านอาหาร →" },
    { href: "/restaurant/setup", label: "ตั้งค่า/เมนู/โต๊ะ" },
  ],
  SHOP: [
    { href: "/shop", label: "จัดการสินค้า →" },
    { href: "/shop/orders", label: "ออเดอร์" },
  ],
};

// หน้าแรกของระบบธุรกิจ (เช่น จองคิว) — งานของระบบ + การเชื่อมต่อกับระบบอื่น
export default async function UnitHomePage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const tenantId = auth.active.tenantId;
  const def = systemDef(unit.type);

  const [links, allFeatureSystems] = await Promise.all([
    prisma.appSystemUnit.findMany({ where: { tenantId, unitId: unit.id } }),
    prisma.appSystem.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const back = `/app/u/${unitSlug}`;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-[color:var(--color-muted)]">
          <span>{def?.icon}</span>
          <span>ระบบ{def?.label}</span>
        </div>
        <h1 className="text-2xl font-semibold">{unit.name}</h1>
      </div>

      {UNIT_NAV[unit.type] ? (
        <div className="flex flex-wrap gap-2">
          {UNIT_NAV[unit.type]!.map((l, i) => (
            <Link
              key={l.href}
              href={`/app/u/${unitSlug}${l.href}`}
              className={i === 0 ? "btn btn-primary text-sm" : "btn btn-ghost text-sm"}
            >
              {l.label}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[color:var(--color-muted)]">ระบบนี้กำลังพัฒนา (เร็วๆ นี้)</p>
      )}

      {/* การเชื่อมต่อกับระบบอื่น */}
      <section className="card flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">การเชื่อมต่อ</h2>
          <p className="text-xs text-[color:var(--color-muted)]">
            เชื่อมกับระบบสมาชิก/แต้ม/POS/รางวัล — ลูกค้าจอง/จ่ายแล้วระบบที่เชื่อมทำงานอัตโนมัติ
          </p>
        </div>
        {FEATURE_TYPES.map((type) => {
          const d = systemDef(type)!;
          const link = links.find((l) => l.type === type);
          const linkedSys = link ? allFeatureSystems.find((s) => s.id === link.systemId) : null;
          const options = allFeatureSystems.filter((s) => s.type === type);
          return (
            <div key={type} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-32 shrink-0">
                {d.icon} {d.label.split(" ")[0]}
              </span>
              {linkedSys ? (
                <form action={unlinkUnitAction} className="inline-flex">
                  <input type="hidden" name="systemId" value={linkedSys.id} />
                  <input type="hidden" name="unitId" value={unit.id} />
                  <input type="hidden" name="back" value={back} />
                  <button
                    className="rounded-full border px-2.5 py-1 text-xs hover:bg-[color:var(--color-surface-2)]"
                    title="กดเพื่อยกเลิกการเชื่อม"
                  >
                    {linkedSys.name} ✕
                  </button>
                </form>
              ) : options.length > 0 ? (
                <form action={linkUnitAction} className="flex flex-1 gap-2">
                  <input type="hidden" name="unitId" value={unit.id} />
                  <input type="hidden" name="back" value={back} />
                  <select name="systemId" className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-xs">
                    {options.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button className="rounded-lg border px-2.5 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">
                    เชื่อม
                  </button>
                </form>
              ) : (
                <Link href="/app/settings/systems" className="text-xs text-[color:var(--color-muted)] underline">
                  ยังไม่มีระบบ{d.label.split(" ")[0]} — สร้างก่อน
                </Link>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
