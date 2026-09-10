import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toMemberActor, canReadMember, hasMemberPerm } from "@/lib/modules/member/access";
import { listLayout } from "@/lib/modules/member/fields";
import { listTierDefs } from "@/lib/modules/member/tiers";
import { listMembers, getMemberKpis, type ListMembersOptions, type MemberSort } from "@/lib/modules/member/list";
import { listSavedViews } from "@/lib/modules/member/views";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { MembersKpis } from "@/components/member/MembersKpis";
import { MembersFilterBar, type MembersFilterField } from "@/components/member/MembersFilterBar";
import { MembersSavedViewsMenu } from "@/components/member/MembersSavedViewsMenu";
import { MembersTable, type MembersListColumn } from "@/components/member/MembersTable";

const SORTS: readonly MemberSort[] = ["-lastActivityAt", "name", "-spent12m", "-points", "memberCode", "-createdAt"];

// หน้ารวมสมาชิก (M1.5 · ภาพ 01) — `/app/sys/{id}/member/members`
// URL state (พิมพ์เขียว §2.3): ?q=&tier=&unit=&tag=&f.{key}=&view=&sort=&page=
//
// 🔴 ระบบต้องเป็น MEMBER ของร้านนี้จริง + actor ต้องอ่านโมดูลสมาชิกได้ (read-โดยนัย · access.ts) → ไม่งั้น notFound()
//    (404-not-403 ตามกติกา §6.4 — ไม่มีสิทธิ์ = "ไม่พบ" ไม่ใช่หน้า 403)
export default async function MembersHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, rawQuery] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
  const q = one(rawQuery.q);
  const tier = one(rawQuery.tier);
  const unit = one(rawQuery.unit);
  const tag = one(rawQuery.tag);
  const view = one(rawQuery.view);
  const sortRaw = one(rawQuery.sort);
  const sort = (SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as MemberSort) : undefined;
  const page = Math.max(1, parseInt(one(rawQuery.page) || "1", 10) || 1);

  const f: Record<string, string> = {};
  for (const [key, val] of Object.entries(rawQuery)) {
    if (key.startsWith("f.")) {
      const v = one(val);
      if (v) f[key.slice(2)] = v;
    }
  }

  const filters: ListMembersOptions = {
    ...(q ? { q } : {}),
    ...(tier ? { tier } : {}),
    ...(unit ? { unit } : {}),
    ...(tag ? { tag } : {}),
    ...(Object.keys(f).length ? { f } : {}),
    ...(view ? { viewId: view } : {}),
    ...(sort ? { sort } : {}),
    page,
  };

  const [layout, kpis, result, savedViews, tierDefs, units] = await Promise.all([
    listLayout(ctx),
    getMemberKpis(ctx, actor),
    listMembers(ctx, actor, filters),
    listSavedViews(ctx, actor),
    listTierDefs(ctx),
    prisma.businessUnit.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" } }),
  ]);

  const allFields = layout.sections.flatMap((s) => s.fields);
  const toFilterField = (fd: (typeof allFields)[number]): MembersFilterField => ({
    key: fd.key,
    label: fd.label,
    type: fd.type,
    choices: fd.options.choices?.map((c) => ({ value: c.value, label: c.label })),
  });
  const filterableAll = allFields.filter((fd) => fd.filterable && !fd.sensitive);
  // ตีกลับรอบ 1 ข้อ 1 — อินไลน์ในแถบกรอง: เฉพาะฟิลด์ "กำหนดเอง" (ไม่ใช่ isSystem) ที่เปิด showInList ด้วย
  // (เช่น "ระดับใบรับรอง") ส่วนที่เหลือ (ฟิลด์ระบบ filterable อื่น ๆ + กำหนดเองที่ไม่ได้ showInList) ไปอยู่ใน
  // popover "ตัวกรอง" — คีย์ tags/homeUnitId ตัดออกเพราะมีตัวควบคุมเฉพาะ (แท็ก/สาขา) อยู่แล้ว ไม่ให้ซ้ำ
  const inlineCustomFields: MembersFilterField[] = filterableAll.filter((fd) => !fd.isSystem && fd.showInList).map(toFilterField);
  const inlineKeys = new Set(inlineCustomFields.map((f) => f.key));
  const DEDICATED_KEYS = new Set(["tags", "homeUnitId"]);
  const advancedFields: MembersFilterField[] = filterableAll.filter((fd) => !DEDICATED_KEYS.has(fd.key) && !inlineKeys.has(fd.key)).map(toFilterField);
  // ตีกลับรอบ 2 ข้อ 1 — คอลัมน์ท้ายตารางต้องเป็นฟิลด์ "กำหนดเอง" เท่านั้น (isSystem ซ้ำกับคอลัมน์คงที่ 9 ช่อง
  // อยู่แล้ว เช่น รหัส/ชื่อ/เบอร์/อีเมล — ก่อนหน้านี้กรองแค่ showInList ทำให้ฟิลด์ระบบ showInList หลุดเข้ามา
  // เป็นคอลัมน์ว่างเปล่า "—" ทั้งคอลัมน์ ตารางล้นจอ) — ต้องกรองตรงกับ `list.ts` toRows()'s listFieldDefs
  const extraColumns: MembersListColumn[] = allFields.filter((fd) => fd.showInList && !fd.isSystem).map((fd) => ({ key: fd.key, label: fd.label }));

  const isManagerPlus = actor.role === "OWNER" || actor.role === "MANAGER";
  const canExport = hasMemberPerm(actor, "member.customer.export");
  const canBulkEdit = hasMemberPerm(actor, "member.customer.update");

  return (
    <div data-testid="members-page" className="flex flex-col gap-5">
      <PageHeader
        title={`สมาชิก — ${sys.name}`}
        back={{ href: `/app/sys/${id}`, label: sys.name }}
        actions={
          <>
            <a href={`/app/sys/${id}/member/import`} className="btn btn-ghost text-sm">
              นำเข้า CSV
            </a>
            <a href={`/app/sys/${id}/member/members/new`} className="btn btn-primary text-sm">
              เพิ่มสมาชิก
            </a>
          </>
        }
      />
      <MemberTabs systemId={id} actor={actor} />

      <MembersKpis kpis={kpis} />

      <MembersFilterBar
        q={q}
        tier={tier}
        unit={unit}
        tag={tag}
        f={f}
        tierOptions={tierDefs.map((t) => ({ key: t.key, name: t.name }))}
        unitOptions={units.map((u) => ({ id: u.id, name: u.name }))}
        inlineCustomFields={inlineCustomFields}
        advancedFields={advancedFields}
        savedViewsSlot={
          <MembersSavedViewsMenu
            systemId={id}
            isManagerPlus={isManagerPlus}
            viewerUserId={auth.user.id}
            views={savedViews.map((v) => ({ id: v.id, name: v.name, scope: v.scope, ownerUserId: v.ownerUserId }))}
            currentFilters={{
              filters: { ...(q ? { q } : {}), ...(tier ? { tier } : {}), ...(unit ? { unit } : {}), ...(tag ? { tag } : {}), ...(Object.keys(f).length ? { f } : {}) },
              columns: extraColumns.map((c) => c.key),
              sort,
            }}
          />
        }
      />

      <MembersTable systemId={id} rows={result.items} extraColumns={extraColumns} canBulkEdit={canBulkEdit} canExport={canExport} currentFilters={filters} />

      <div className="flex items-center justify-between" style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
        <span>
          แสดง {result.items.length} จาก {result.total} คน
        </span>
        <Pager id={id} page={result.page} take={result.take} total={result.total} query={rawQuery} />
      </div>
    </div>
  );
}

function Pager({ id, page, take, total, query }: { id: string; page: number; take: number; total: number; query: Record<string, string | string[] | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / take));
  if (pages <= 1) return null;
  const hrefOf = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (k === "page") continue;
      if (typeof v === "string" && v) qs.set(k, v);
    }
    qs.set("page", String(p));
    return `/app/sys/${id}/member/members?${qs.toString()}`;
  };
  const shown = Array.from({ length: Math.min(pages, 7) }, (_, i) => i + 1);
  return (
    <div className="flex items-center gap-1">
      {shown.map((p) => (
        <a
          key={p}
          href={hrefOf(p)}
          className="rounded-lg px-2 py-1"
          style={p === page ? { background: "var(--color-ink)", color: "var(--color-surface)" } : { color: "var(--color-muted)" }}
        >
          {p}
        </a>
      ))}
    </div>
  );
}
