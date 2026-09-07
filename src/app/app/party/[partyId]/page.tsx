// /app/party/{partyId} — โปรไฟล์ผู้ติดต่อ (K3.4 · มติ D23 — หนี้ที่ยกมาจาก K3.1)
//
// ที่มา: ลิงก์ชนิด PARTY ในหลังการ์ด (บล็อก "เชื่อมข้อมูล SHARK") เคยกดแล้ว 404 เพราะยังไม่มีหน้านี้
// หน้านี้จึงเป็น "ปลายทางกลาง" ของผู้ติดต่อ 1 ราย — Party เป็นของ **ร้าน** ไม่ใช่ของระบบใดระบบหนึ่ง
// ⇒ path ไม่มี `/sys/{id}` (ต่างจากหน้าอื่นในแอป) และรวบงานจากบอร์ดงาน **ทุกระบบ** ของร้านมาไว้ที่เดียว
//
// 🔴 สิทธิ์ 2 ชั้น (fail-closed ทั้งคู่)
//   ชั้นที่ 1 "เปิดหน้านี้ได้ไหม" = OWNER/MANAGER หรือมีคีย์ `crm.*` / `member.*` / `kanban.*` ตัวใดตัวหนึ่ง
//   ชั้นที่ 2 "เห็นข้อมูลติดต่อไหม" = OWNER/MANAGER หรือมีคีย์ `crm.*` / `member.*` เท่านั้น
//     ⇒ พนักงานที่เจ้าของติ๊กให้แค่บอร์ดงาน เห็น **ชื่อ + งานที่เชื่อม** เท่านั้น
//        ไม่เห็นเบอร์/อีเมล/เลขผู้เสียภาษี/ที่อยู่ (ต่อยอดกติกาเดียวกับ K3.1 ที่ซ่อนชื่อลูกค้าในหลังการ์ด
//        จากคนที่ไม่มีสิทธิ์โมดูลปลายทาง — ข้อมูลติดต่อของลูกค้าไม่ใช่ของแถมของสิทธิ์บอร์ดงาน)
// 🔴 ไม่พบ / เป็นผู้ติดต่อของร้านอื่น → `notFound()` เสมอ (ห้ามบอกว่า "มีอยู่แต่คุณไม่มีสิทธิ์" —
//    นั่นคือการยืนยันให้คนเดา id ว่าลูกค้ารายนี้มีตัวตนในร้านไหน)
// 🔴 ผู้ติดต่ออ่านผ่าน facade `@/lib/modules/party` เท่านั้น (ห้ามล้วงตาราง Party จากหน้านี้ตรง ๆ) ·
//    งานที่เชื่ออ่านผ่าน facade `@/lib/modules/kanban/links#listCardsForTarget` ซึ่งกรอง
//    `visibleBoardsWhere(actor)` ให้แล้ว ⇒ บอร์ดลับของสาขาอื่นไม่หลุดมาทางหน้านี้

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { getProfile } from "@/lib/modules/party";
import { listCardsForTarget } from "@/lib/modules/kanban/links";
import { toActor } from "@/lib/modules/kanban/access";
import type { CardForTargetDto } from "@/lib/modules/kanban/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatThaiDate } from "@/lib/ui/date";

const KIND_LABEL: Record<string, string> = { PERSON: "บุคคล", COMPANY: "นิติบุคคล" };

/** มีคีย์สิทธิ์สักตัวที่ขึ้นต้นด้วย prefix นี้ไหม (เช่น "crm.") — ค่าอื่นที่ไม่ใช่ `true` ไม่นับ */
function hasPermPrefix(permissions: Record<string, unknown>, prefix: string): boolean {
  return Object.entries(permissions).some(([k, v]) => k.startsWith(prefix) && v === true);
}

type CardRow = CardForTargetDto & { systemId: string };

export default async function PartyProfilePage({
  params,
}: {
  params: Promise<{ partyId: string }>;
}) {
  const { partyId } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const permissions = (auth.active.permissions ?? {}) as Record<string, unknown>;
  const isBoss = auth.active.role === "OWNER" || auth.active.role === "MANAGER";

  // ── ชั้นที่ 1: เปิดหน้านี้ได้ไหม ────────────────────────────────────────────
  const canSeeContact = isBoss || hasPermPrefix(permissions, "crm.") || hasPermPrefix(permissions, "member.");
  const canOpen = canSeeContact || hasPermPrefix(permissions, "kanban.");
  if (!canOpen) notFound();

  const party = await getProfile(tenantId, partyId);
  if (!party) notFound();

  // ── งานที่เชื่อมกับผู้ติดต่อรายนี้ (บอร์ดงานทุกระบบของร้าน — D1 ร้านเปิดได้หลายระบบ) ──
  const db = tenantDb({ tenantId });
  const kanbanSystems = await db.appSystem.findMany({
    where: { type: "KANBAN", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const actor = toActor(auth.user.id, {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess,
    permissions: auth.active.permissions,
  });
  const cards: CardRow[] = [];
  for (const sys of kanbanSystems) {
    // ระบบใดระบบหนึ่งอ่านไม่ได้ ไม่ควรทำให้ทั้งหน้าล่ม — โปรไฟล์ผู้ติดต่อยังต้องเปิดดูได้
    const rows = await listCardsForTarget(
      { tenantId, systemId: sys.id, actorUserId: auth.user.id },
      actor,
      { linkType: "PARTY", linkId: party.id },
    ).catch(() => [] as CardForTargetDto[]);
    for (const r of rows) cards.push({ ...r, systemId: sys.id });
  }

  // ปุ่ม "ดูใน CRM" โผล่เฉพาะคนที่เห็นข้อมูลติดต่ออยู่แล้ว (คนที่มีแค่บอร์ดงานกดไปก็โดนกันที่ปลายทาง)
  const crmSystem = canSeeContact
    ? await db.appSystem.findFirst({
        where: { type: "CRM", active: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
    : null;

  const contactRows: { label: string; value: string }[] = canSeeContact
    ? [
        { label: "โทร", value: party.phone ?? "" },
        { label: "อีเมล", value: party.email ?? "" },
        {
          label: "เลขผู้เสียภาษี",
          value: party.taxId ? `${party.taxId}${party.branchCode ? ` (สาขา ${party.branchCode})` : ""}` : "",
        },
        { label: "ที่อยู่", value: party.address ?? "" },
      ].filter((r) => r.value.trim().length > 0)
    : [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6" data-testid="party-profile">
      <PageHeader
        title={party.name}
        desc={`ผู้ติดต่อของกิจการ · ${KIND_LABEL[party.kind] ?? "บุคคล"} · เพิ่มเมื่อ ${formatThaiDate(party.createdAt)}`}
        actions={
          crmSystem ? (
            <Link
              href={`/app/sys/${crmSystem.id}/crm/contacts?q=${encodeURIComponent(party.name)}`}
              className="btn btn-ghost text-sm"
              data-testid="party-open-crm"
            >
              ดูใน CRM
            </Link>
          ) : null
        }
      />

      {/* ── ข้อมูลติดต่อ ── */}
      <section className="card flex flex-col gap-2" data-testid="party-contact">
        <h2 className="text-sm font-semibold">ข้อมูลติดต่อ</h2>
        {!canSeeContact ? (
          <p className="text-sm text-[color:var(--color-muted)]">
            ข้อมูลติดต่อของลูกค้าเปิดให้เฉพาะทีมที่ดูแลลูกค้าสัมพันธ์หรือสมาชิก — ขอสิทธิ์จากเจ้าของกิจการได้ถ้าต้องใช้
          </p>
        ) : contactRows.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีเบอร์ อีเมล หรือที่อยู่ของผู้ติดต่อรายนี้</p>
        ) : (
          <dl className="flex flex-col gap-1.5 text-sm">
            {contactRows.map((r) => (
              <div key={r.label} className="flex gap-3">
                <dt className="w-28 shrink-0 text-[color:var(--color-muted)]">{r.label}</dt>
                <dd className="min-w-0 flex-1 whitespace-pre-line break-words">{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* ── งานที่เชื่อมกับผู้ติดต่อนี้ (ขาย้อนของ K3.1) ── */}
      <section className="flex flex-col gap-2" data-testid="party-cards">
        <h2 className="text-sm font-semibold">งานที่เชื่อมกับผู้ติดต่อนี้ ({cards.length})</h2>
        {cards.length === 0 ? (
          <EmptyState text="ยังไม่มีงานบนบอร์ดที่เชื่อมกับผู้ติดต่อรายนี้ — เปิดหลังการ์ดแล้วกด “เพิ่มการเชื่อม” เพื่อผูกไว้" />
        ) : (
          <div className="flex flex-col gap-2">
            {cards.map((c) => (
              <Link
                key={c.cardId}
                href={`/app/sys/${c.systemId}/kanban/b/${c.boardId}?card=${c.cardId}`}
                data-testid="party-card-row"
                className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--color-line)" }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-[color:var(--color-muted)]">#{c.cardNo ?? "-"}</span>
                    <span className="truncate font-medium">{c.title}</span>
                  </div>
                  <div className="truncate text-xs text-[color:var(--color-muted)]">
                    {c.boardName} · {c.columnName}
                    {c.dueAt ? ` · กำหนดส่ง ${formatThaiDate(c.dueAt)}` : ""}
                    {c.status === "ARCHIVED" ? " · เก็บเข้าคลังแล้ว" : ""}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
