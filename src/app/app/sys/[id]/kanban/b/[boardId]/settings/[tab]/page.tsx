import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { getBoardView, KanbanNotFoundError, listCardTemplates, listFields, listLabels, listMembers, toActor } from "@/lib/modules/kanban/service";
import type { KanbanActor } from "@/lib/modules/kanban/service";
import { listViews } from "@/lib/modules/kanban/views";
import { PageHeader } from "@/components/ui/PageHeader";
import { tagColorVar } from "@/components/kanban/Card";
import { BOARD_SETTINGS_TABS, BoardSettingsNav, type BoardSettingsTab } from "@/components/kanban/settings/BoardSettingsNav";
import { CardTemplatesSettings } from "@/components/kanban/CardTemplatesSettings";
import { CustomFieldsSettings } from "@/components/kanban/settings/CustomFieldsSettings";
import { SavedViewsSettings } from "@/components/kanban/settings/SavedViewsSettings";

// หน้า "ตั้งค่าบอร์ด" 7 แท็บ (K2.5 · ภาพ `ledger/design-kanban/10-board-settings.png`)
//
// 🔴 ต่างจาก `/kanban/settings` (K1.15 — ตั้งค่า "ระดับระบบ" คีย์ API) — นี่คือตั้งค่า "ต่อบอร์ด"
//    เปิดจากเมนู ⋯ ของหัวบอร์ด (ADMIN เท่านั้น — หน้านี้ก็ 404 ให้คนอื่นเหมือนกัน ไม่ใช่แค่ซ่อนลิงก์)
// 🔴 แท็บที่ยังไม่มีเนื้อหาจริง (ฟิลด์กำหนดเอง=K2.6 · อัตโนมัติ=K2.9) โชว์ "เร็ว ๆ นี้" ตามกติกาเมนูทั้งโมดูล
// 🔴 สมาชิก/ป้ายกำกับ: ยังไม่มีหน้าจัดการเต็มรูปแบบเป็นของตัวเอง (K1.3/K1.2 จัดการผ่านหลังการ์ด/หัวบอร์ด)
//    ⇒ ที่นี่แสดงข้อมูลจริงแบบอ่านอย่างเดียวก่อน (`listMembers`/`listLabels` มีอยู่แล้ว) ไม่ใช่ของปลอม
export default async function BoardSettingsTabPage({
  params,
}: {
  params: Promise<{ id: string; boardId: string; tab: string }>;
}) {
  const { id, boardId, tab: rawTab } = await params;
  const tab: BoardSettingsTab = (BOARD_SETTINGS_TABS as readonly string[]).includes(rawTab)
    ? (rawTab as BoardSettingsTab)
    : "general";

  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "KANBAN" } });
  if (!sys) notFound();

  const actor = toActor(auth.user.id, auth.active);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const board = await getBoardView(ctx, actor, boardId).catch((e: unknown) => {
    if (e instanceof KanbanNotFoundError) return null;
    throw e;
  });
  if (!board) notFound();
  if (board.role !== "ADMIN") notFound(); // ตั้งค่าบอร์ด = ผู้ดูแลบอร์ดเท่านั้น (§6.2)

  const boardHref = `/app/sys/${id}/kanban/b/${boardId}`;

  return (
    <div className="flex max-w-[1000px] flex-col gap-4">
      <PageHeader
        title={`ตั้งค่าบอร์ด — ${board.name}`}
        back={{ href: boardHref, label: board.name }}
        actions={
          <Link href={boardHref} className="btn btn-ghost text-sm">
            ดูบอร์ด
          </Link>
        }
      />
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <BoardSettingsNav systemId={id} boardId={boardId} active={tab} />
        <div className="min-w-0 flex-1">
          {tab === "general" && <GeneralTab board={board} />}
          {tab === "members" && <MembersTab ctx={ctx} boardId={boardId} />}
          {tab === "labels" && <LabelsTab ctx={ctx} boardId={boardId} />}
          {tab === "fields" && <FieldsTab ctx={ctx} actor={actor} boardId={boardId} systemId={id} />}
          {tab === "card-templates" && <CardTemplatesTab ctx={ctx} actor={actor} boardId={boardId} systemId={id} />}
          {tab === "views" && <ViewsTab ctx={ctx} actor={actor} boardId={boardId} systemId={id} viewerUserId={auth.user.id} />}
          {tab === "automation" && <AutomationTab href={`/app/sys/${id}/kanban/automation?board=${boardId}`} />}
          {tab === "archive" && <ArchiveTab href={`${boardHref}/archive`} />}
        </div>
      </div>
    </div>
  );
}

type CtxArg = { tenantId: string; systemId: string; actorUserId: string };

function GeneralTab({ board }: { board: { name: string; unitName: string | null; visibility: "PRIVATE" | "TENANT" } }) {
  return (
    <div data-testid="board-settings-general" className="card flex flex-col gap-3 p-4">
      <h2 className="text-sm font-medium">ทั่วไป</h2>
      <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" style={{ fontSize: 13 }}>
        <div className="flex flex-col gap-0.5">
          <dt style={{ fontSize: 11.5, color: "var(--color-muted)" }}>ชื่อบอร์ด</dt>
          <dd>{board.name}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt style={{ fontSize: 11.5, color: "var(--color-muted)" }}>สาขา</dt>
          <dd>{board.unitName ?? "ทั้งร้าน (ไม่ผูกสาขา)"}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt style={{ fontSize: 11.5, color: "var(--color-muted)" }}>การมองเห็น</dt>
          <dd>{board.visibility === "PRIVATE" ? "เฉพาะสมาชิกบอร์ด" : "ทั้งร้านเห็น"}</dd>
        </div>
      </dl>
      <p style={{ fontSize: 12, color: "var(--color-muted)" }}>แก้ชื่อบอร์ดได้จากหัวบอร์ด (คลิกชื่อบอร์ด) — ตั้งค่าอื่น ๆ ของแท็บนี้เร็ว ๆ นี้</p>
    </div>
  );
}

async function MembersTab({ ctx, boardId }: { ctx: CtxArg; boardId: string }) {
  const members = await listMembers(ctx, boardId);
  return (
    <div data-testid="board-settings-members" className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">สมาชิกและสิทธิ์</h2>
        <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{members.length} คนถูกเชิญไว้ชัดเจน</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--color-muted)" }}>
        เห็นบอร์ดได้ = ต้องมีสิทธิ์โมดูล &ldquo;บอร์ดงาน&rdquo; ใน SHARK ก่อน แล้วจึงคุมรายละเอียดด้วยบทบาทในบอร์ดนี้ ·
        เจ้าของร้านเป็นผู้ดูแลทุกบอร์ดโดยอัตโนมัติ
      </p>
      {members.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>ยังไม่มีใครถูกเชิญเข้าบอร์ดนี้โดยตรง (คนที่เห็นอยู่ตอนนี้มาจากสิทธิ์โดยนัย — เจ้าของร้าน/ผู้จัดการสาขา/บอร์ดทั้งร้านเห็น)</p>
      ) : (
        <table className="w-full" style={{ fontSize: 12.5 }}>
          <thead>
            <tr style={{ color: "var(--color-muted)", textAlign: "left" }}>
              <th className="pb-1.5 font-normal">คน</th>
              <th className="pb-1.5 font-normal">บทบาทในองค์กร</th>
              <th className="pb-1.5 font-normal">บทบาทในบอร์ดนี้</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderTop: "1px solid var(--color-line)" }}>
            {members.map((m) => (
              <tr key={m.userId} data-testid="board-settings-member-row">
                <td className="py-2">
                  <div className="flex flex-col">
                    <span style={{ fontWeight: 600 }}>{m.name}</span>
                    <span style={{ fontSize: 11, color: "var(--color-muted)" }}>{m.email}</span>
                  </div>
                </td>
                <td>{m.tenantRole}</td>
                <td>{m.role === "ADMIN" ? "ผู้ดูแล" : m.role === "EDITOR" ? "แก้ไขได้" : "ดูอย่างเดียว"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ fontSize: 11.5, color: "var(--color-muted)" }}>เชิญ/เปลี่ยนบทบาท/ถอดสมาชิก — เร็ว ๆ นี้</p>
    </div>
  );
}

async function LabelsTab({ ctx, boardId }: { ctx: CtxArg; boardId: string }) {
  const labels = await listLabels(ctx, boardId);
  return (
    <div data-testid="board-settings-labels" className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">ป้ายกำกับของบอร์ด</h2>
        <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{labels.length} ป้าย · 6 สีตามระบบ</span>
      </div>
      {labels.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>บอร์ดนี้ยังไม่มีป้ายกำกับ — เพิ่มได้จากหลังการ์ด</p>
      ) : (
        <ul className="flex flex-col divide-y" style={{ borderTop: "1px solid var(--color-line)" }}>
          {labels.map((l) => (
            <li key={l.id} data-testid="board-settings-label-row" className="flex items-center gap-3 py-2">
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1"
                style={{ background: tagColorVar(l.color), color: "#fff", fontSize: 12, fontWeight: 600 }}
              >
                {l.name}
              </span>
              <span style={{ fontSize: 12, color: "var(--color-muted)" }}>ใช้ใน {l.cardCount} การ์ด</span>
            </li>
          ))}
        </ul>
      )}
      <p style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
        ใช้จานสีเดียวกับแท็กเอกสารในระบบบัญชี (6 สี ผ่านเกณฑ์คอนทราสต์) — ไม่ทำจาน 30 สีแบบ Trello · แก้ชื่อ/สี/ลบ — เร็ว ๆ นี้
      </p>
    </div>
  );
}

async function FieldsTab({ ctx, actor, boardId, systemId }: { ctx: CtxArg; actor: KanbanActor; boardId: string; systemId: string }) {
  const fields = await listFields(ctx, actor, boardId);
  return <CustomFieldsSettings systemId={systemId} boardId={boardId} fields={fields} />;
}

async function CardTemplatesTab({ ctx, actor, boardId, systemId }: { ctx: CtxArg; actor: KanbanActor; boardId: string; systemId: string }) {
  const templates = await listCardTemplates(ctx, actor, boardId);
  return <CardTemplatesSettings systemId={systemId} boardId={boardId} templates={templates} />;
}

async function ViewsTab({
  ctx,
  actor,
  boardId,
  systemId,
  viewerUserId,
}: {
  ctx: CtxArg;
  actor: KanbanActor;
  boardId: string;
  systemId: string;
  viewerUserId: string;
}) {
  const views = await listViews(ctx, actor, boardId);
  return <SavedViewsSettings systemId={systemId} boardId={boardId} isAdmin viewerUserId={viewerUserId} views={views} />;
}

// K2.9 — ตัวสร้างกฎอยู่หน้าเต็มของตัวเอง (`/kanban/automation`) เพราะกว้างกว่าคอลัมน์ตั้งค่า
// แท็บนี้จึงเป็น "ทางเข้า" ไม่ใช่ที่ตั้งกฎซ้ำอีกที่ (กติกาเดิมของโมดูล: หน้าเดียวต่อเรื่อง)
function AutomationTab({ href }: { href: string }) {
  return (
    <div data-testid="board-settings-automation" className="card flex flex-col gap-3 p-4">
      <h2 className="text-sm font-medium">อัตโนมัติ</h2>
      <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
        ตั้งกฎให้บอร์ดทำงานเองได้ — เมื่อการ์ดถูกย้าย/ถูกมอบหมาย/ถึงกำหนดส่ง ให้ติดป้าย มอบหมาย แจ้งเตือน
        เปิดคำขออนุมัติ หรือสร้างการ์ดในบอร์ดอื่น · มีปุ่มบนการ์ด/บนบอร์ดสำหรับงานที่ทำซ้ำ ๆ ด้วย
      </p>
      <Link href={href} className="btn btn-primary self-start text-sm" data-testid="board-settings-automation-link">
        เปิดตัวสร้างกฎอัตโนมัติ
      </Link>
    </div>
  );
}

function ArchiveTab({ href }: { href: string }) {
  return (
    <div data-testid="board-settings-archive" className="card flex flex-col gap-3 p-4">
      <h2 className="text-sm font-medium">คลังเก็บ</h2>
      <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>การ์ด/คอลัมน์ที่เก็บไว้ + ค้นหา + ปุ่มกู้คืน อยู่ในหน้าคลังเก็บของบอร์ด</p>
      <Link href={href} className="btn btn-ghost self-start text-sm">
        ไปหน้าคลังเก็บ →
      </Link>
    </div>
  );
}
