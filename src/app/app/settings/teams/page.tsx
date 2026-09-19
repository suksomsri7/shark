import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { listTeams, membersOf } from "@/lib/core/teams";
import { listStaffAccess, listTenantUnits } from "@/lib/staff/service";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm";
import { PageHeader } from "@/components/ui/PageHeader";
import { TeamsManager, type TeamView } from "@/components/crm/settings/TeamsManager";

// ทีมขาย (core · CRM v2 ใบ C1.7 · พิมพ์เขียว §5.9 · §11.6 · ภาพ 10 ซ้ายบน) — `/app/settings/teams`
// 🔴 หน้า core (ไม่ผูกระบบ CRM · ไม่ใช่หน้า v2 ของระบบใด) ⇒ ไม่ผ่านประตู uiVersion · ด่าน = เจ้าของร้าน หรือคีย์ `crm.team.manage`
//    ไม่ผ่าน = notFound() (404-not-403 — ไม่บอกว่ามีหน้านี้) · MANAGER ปริยายไม่ได้ (§6.1 · มติผู้คุมงาน C1.7 ข้อ 3)
// 🔴 อ่านทีมผ่าน core `@/lib/core/teams` เท่านั้น (listTeams · membersOf) · เขียนผ่าน server action `./actions` → core teams
// 🔴 หน้า GET ไม่เขียนอะไร
export default async function TeamsSettingsPage() {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  if (actor.role !== "OWNER" && !crmCan(actor, "crm.team.manage")) notFound();
  const tenantId = auth.active.tenantId;
  const ctx = { tenantId, actorUserId: auth.user.id };
  const [teams, staff, units] = await Promise.all([listTeams(ctx, { includeArchived: true }), listStaffAccess(tenantId), listTenantUnits(tenantId)]);
  const members = await Promise.all(teams.map((t) => membersOf(ctx, t.id)));
  const nameOf = new Map(staff.map((r) => [r.userId, r.name || r.email]));
  const views: TeamView[] = teams.map((t, i) => ({
    id: t.id,
    name: t.name,
    leadUserId: t.leadUserId,
    unitIds: t.unitIds,
    archived: !!t.archivedAt,
    members: (members[i] ?? []).map((m) => ({ userId: m.userId, name: nameOf.get(m.userId) ?? "ผู้ใช้ที่ออกจากร้านแล้ว", role: m.role, acceptingLeads: m.acceptingLeads })),
  }));
  const people = staff.filter((r) => r.active).map((r) => ({ userId: r.userId, name: r.name || r.email }));
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6" data-testid="teams-page">
      <PageHeader
        title="ทีมขาย"
        desc="จัดพนักงานเป็นทีม ตั้งหัวหน้า ผูกสาขา และเปิด/ปิดการรับลีดรายคน — ทีมกำหนดว่าใครเห็นลูกค้าและดีลของใครในระบบ CRM"
      />
      <TeamsManager teams={views} people={people} units={units} />
    </div>
  );
}
