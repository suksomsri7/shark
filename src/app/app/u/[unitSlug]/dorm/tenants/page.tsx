import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { getLease, leaseAccess, listLeases, type LeaseDetail, type LeaseTab } from "@/lib/modules/dorm";
import TenantsScreen from "@/components/dorm/TenantsScreen";

// SVC D.5 ▸ หอ 02 "ผู้เช่าและสัญญา" — ภาพ ledger/design-dorm/02-tenants.png · ข้อมูลผ่าน facade `@/lib/modules/dorm` เท่านั้น (ไม่แตะ prisma)
//   ด่าน: requireUnit · หน่วยต้องเป็น "DORM" · leaseAccess(...).view (dorm.lease.manage หรือ dorm.view) ไม่ผ่าน ⇒ 404
//   ?tab=CURRENT|BOOKED|EXPIRING|NOTICE|ENDED (อื่น = CURRENT) · ?q= · ?room=<เลขห้อง> (สัญญาที่ยังไม่ยกเลิก/ไม่สิ้นสุดของห้องนั้น) หรือ ?lease=<id> ⇒ แผงขวา
const TABS: LeaseTab[] = ["CURRENT", "BOOKED", "EXPIRING", "NOTICE", "ENDED"];
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function DormTenantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const membership = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (!leaseAccess(membership, unit.id).view) notFound();

  const ctx = { tenantId: auth.active.tenantId, actorUserId: auth.active.userId };
  const askedTab = one(sp.tab);
  const tab: LeaseTab = TABS.includes(askedTab as LeaseTab) ? (askedTab as LeaseTab) : "CURRENT";
  const q = (one(sp.q) ?? "").trim().slice(0, 80) || null;
  const list = await listLeases(ctx, { unitId: unit.id, tab, q });

  // แผงขวา: ?lease=<id> หรือ ?room=<เลขห้อง> (สัญญาที่ยังมีผล: ผู้เช่าปัจจุบันก่อน แล้วจอง/รอเข้า)
  let selected: LeaseDetail | null = null;
  const leaseId = one(sp.lease);
  const room = (one(sp.room) ?? "").trim().slice(0, 20);
  if (leaseId) selected = await getLease(ctx, { unitId: unit.id, leaseId });
  else if (room) {
    for (const t of ["CURRENT", "BOOKED"] as const) {
      const hit = (await listLeases(ctx, { unitId: unit.id, tab: t, q: room })).rows.find((r) => r.roomNumber === room);
      if (hit) {
        selected = await getLease(ctx, { unitId: unit.id, leaseId: hit.leaseId });
        break;
      }
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <p className="text-xs text-[color:var(--color-muted)]">{unit.name}</p>
      <TenantsScreen unitSlug={unitSlug} tab={tab} q={q} list={list} selected={selected} />
    </div>
  );
}
