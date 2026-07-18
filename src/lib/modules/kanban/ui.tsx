import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { getBoard, listBoards, listMyCards, listTenantUsers } from "./service";
import {
  archiveBoardAction,
  archiveCardAction,
  archiveColumnAction,
  createBoardAction,
  createCardAction,
  createColumnAction,
  moveCardAction,
} from "./actions";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import { ModuleTabs } from "@/components/module-tabs";

const muted = "text-[color:var(--color-muted)]";

const fmtDue = (d: Date) =>
  d.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

// แท็บฟังก์ชันย่อยของระบบ Kanban (ใช้ทั้งหน้า hub + ทุกหน้าย่อย ให้ตรงกันเสมอ)
// ⚠️ ต้องตรงกับ childrenFor("KANBAN") ใน src/app/app/layout.tsx (ตรวจโดย qc-nav-functions.mts)
export function kanbanTabs(systemId: string): { href: string; label: string }[] {
  const s = `/app/sys/${systemId}`;
  return [
    { href: s, label: "ภาพรวม" },
    { href: `${s}/kanban/my-tasks`, label: "งานของฉัน" },
    { href: `${s}/kanban/boards`, label: "บอร์ดงาน" },
  ];
}

// ───────────── งานของฉัน (my-tasks) — การ์ดที่มอบหมายให้ฉันข้ามทุกบอร์ด ─────────────
export async function KanbanMyTasksSection({ systemId, tenantId }: { systemId: string; tenantId: string }) {
  const auth = await requireTenant();
  const myCards = await listMyCards(tenantId, systemId, auth.user.id);

  return (
    <Section title={`งานของฉัน (${myCards.length})`}>
      <DataList
        items={myCards.map((c) => ({
          key: c.id,
          href: `/app/sys/${systemId}/kanban/${c.boardId}`,
          primary: c.title,
          secondary: `${c.board?.name ?? ""}${c.column?.name ? ` · ${c.column.name}` : ""}`,
          trailing: c.dueAt ? (
            <span className={`text-xs ${muted}`}>ครบกำหนด {fmtDue(c.dueAt)}</span>
          ) : undefined,
        }))}
        empty="ยังไม่มีงานที่มอบหมายให้คุณ — งานที่หัวหน้ามอบหมายจะมาแสดงที่นี่"
      />
    </Section>
  );
}

// ───────────── บอร์ดงาน (boards) — รายการบอร์ด + สร้างบอร์ด ─────────────
export async function KanbanBoardsSection({ systemId, tenantId }: { systemId: string; tenantId: string }) {
  const boards = await listBoards(tenantId, systemId);

  return (
    <Section title={`บอร์ดงาน (${boards.length})`}>
      <DataList
        items={boards.map((b) => ({
          key: b.id,
          href: `/app/sys/${systemId}/kanban/${b.id}`,
          primary: b.name,
          secondary: b.description || undefined,
          trailing: (
            <span className={`text-xs ${muted}`}>
              {(b as unknown as { _count?: { cards: number } })._count?.cards ?? 0} การ์ด
            </span>
          ),
        }))}
        empty="ยังไม่มีบอร์ด — สร้างบอร์ดแรกเพื่อจัดการงานของทีม (จะมีคอลัมน์ รอทำ / กำลังทำ / เสร็จ ให้อัตโนมัติ)"
      />
      <form action={createBoardAction} className="mt-1 flex gap-2">
        <input type="hidden" name="systemId" value={systemId} />
        <input
          name="name"
          required
          placeholder="ชื่อบอร์ด เช่น งานเปิดสาขา"
          className="input flex-1"
        />
        <button className="btn btn-ghost text-sm">+ สร้างบอร์ด</button>
      </form>
    </Section>
  );
}

// ───────────── KanbanHub (หน้าภาพรวม ฝังใน /app/sys/[id]) ─────────────
// การ์ดสรุปสั้น + ลิงก์เข้าแต่ละฟังก์ชัน (แตกเป็นหน้าย่อยจริง)
export async function KanbanHub({ systemId, tenantId }: { systemId: string; tenantId: string }) {
  const auth = await requireTenant();
  const [boards, myCards] = await Promise.all([
    listBoards(tenantId, systemId),
    listMyCards(tenantId, systemId, auth.user.id),
  ]);

  const cards = [
    { href: `/app/sys/${systemId}/kanban/my-tasks`, label: "งานของฉัน", value: `${myCards.length} งาน`, desc: "งานที่มอบหมายให้ฉันข้ามทุกบอร์ด" },
    { href: `/app/sys/${systemId}/kanban/boards`, label: "บอร์ดงาน", value: `${boards.length} บอร์ด`, desc: "รายการบอร์ด + สร้างบอร์ด" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ModuleTabs items={kanbanTabs(systemId)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card flex min-h-[76px] flex-col gap-1 p-4 transition-colors hover:bg-[color:var(--color-surface-2)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{c.label}</span>
              <span className="text-sm tabular-nums text-[color:var(--color-accent)]">{c.value}</span>
            </div>
            <span className={`text-xs ${muted}`}>{c.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── BoardView (หน้า sub-route เต็มจอ) ─────────────────────────
export async function KanbanBoardView({
  systemId,
  tenantId,
  boardId,
}: {
  systemId: string;
  tenantId: string;
  boardId: string;
}) {
  const [board, users] = await Promise.all([
    getBoard(tenantId, systemId, boardId),
    listTenantUsers(tenantId),
  ]);

  if (!board) {
    return (
      <div className="flex flex-col gap-3">
        <Link href={`/app/sys/${systemId}`} className={`text-sm ${muted}`}>
          ← กลับไประบบ
        </Link>
        <p className="text-sm">ไม่พบบอร์ดนี้</p>
      </div>
    );
  }

  const userName = (id: string | null) =>
    id ? users.find((u) => u.userId === id)?.name ?? "—" : null;
  const columns = board.columns;
  const lastIdx = columns.length - 1;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={board.name}
        back={{ href: `/app/sys/${systemId}`, label: "ระบบบอร์ดงาน" }}
        desc={board.description || undefined}
        actions={
          <ConfirmDialog
            triggerLabel="เก็บบอร์ด"
            triggerClassName={`text-xs underline ${muted}`}
            title="เก็บบอร์ดนี้?"
            detail="บอร์ดจะถูกเก็บเข้าคลังและไม่แสดงในรายการ"
            confirmLabel="ยืนยันเก็บบอร์ด"
            action={archiveBoardAction}
            fields={{ systemId, boardId }}
          />
        }
      />

      {/* คอลัมน์แนวนอน */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col, colIdx) => (
          <div key={col.id} className="flex w-72 shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                {col.name} <span className={muted}>({col.cards.length})</span>
              </div>
              {col.cards.length === 0 && (
                <form action={archiveColumnAction}>
                  <input type="hidden" name="systemId" value={systemId} />
                  <input type="hidden" name="boardId" value={boardId} />
                  <input type="hidden" name="columnId" value={col.id} />
                  <button className={`text-xs underline ${muted}`}>ลบ</button>
                </form>
              )}
            </div>

            {/* การ์ด */}
            <div className="flex flex-col gap-2">
              {col.cards.map((card) => {
                const assignee = userName(card.assigneeUserId);
                const labels = Array.isArray(card.labels) ? (card.labels as string[]) : [];
                return (
                  <div key={card.id} className="card flex flex-col gap-2 p-3">
                    <div className="text-sm font-medium">{card.title}</div>
                    {card.description && (
                      <div className={`text-xs ${muted}`}>{card.description}</div>
                    )}
                    {labels.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {labels.map((l) => (
                          <StatusChip key={l} value={l} tone="muted" />
                        ))}
                      </div>
                    )}
                    <div className={`flex items-center justify-between text-[11px] ${muted}`}>
                      <span>{assignee ? `ผู้รับผิดชอบ: ${assignee}` : "ไม่มีผู้รับผิดชอบ"}</span>
                      {card.dueAt && <span>กำหนดส่ง {fmtDue(card.dueAt)}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <form action={moveCardAction}>
                        <input type="hidden" name="systemId" value={systemId} />
                        <input type="hidden" name="boardId" value={boardId} />
                        <input type="hidden" name="cardId" value={card.id} />
                        <input type="hidden" name="direction" value="left" />
                        <button
                          disabled={colIdx === 0}
                          className="btn-sm px-3 text-xs disabled:opacity-30"
                          title="ย้ายซ้าย"
                          aria-label="ย้ายซ้าย"
                        >
                          ◀
                        </button>
                      </form>
                      <form action={moveCardAction}>
                        <input type="hidden" name="systemId" value={systemId} />
                        <input type="hidden" name="boardId" value={boardId} />
                        <input type="hidden" name="cardId" value={card.id} />
                        <input type="hidden" name="direction" value="right" />
                        <button
                          disabled={colIdx === lastIdx}
                          className="btn-sm px-3 text-xs disabled:opacity-30"
                          title="ย้ายขวา"
                          aria-label="ย้ายขวา"
                        >
                          ▶
                        </button>
                      </form>
                      <ConfirmDialog
                        triggerLabel="✕"
                        triggerClassName={`ml-auto text-xs underline ${muted}`}
                        title="เก็บการ์ดนี้?"
                        detail="การ์ดจะถูกเก็บออกจากบอร์ด"
                        confirmLabel="ยืนยันเก็บการ์ด"
                        action={archiveCardAction}
                        fields={{ systemId, boardId, cardId: card.id }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* เพิ่มการ์ด */}
            <form action={createCardAction} className="flex flex-col gap-1.5 rounded-xl border p-2">
              <input type="hidden" name="systemId" value={systemId} />
              <input type="hidden" name="boardId" value={boardId} />
              <input type="hidden" name="columnId" value={col.id} />
              <input
                name="title"
                required
                placeholder="+ เพิ่มการ์ด"
                className="input"
              />
              <div className="flex gap-1.5">
                <select
                  name="assigneeUserId"
                  className="input min-w-0 flex-1"
                  defaultValue=""
                >
                  <option value="">ไม่มีผู้รับผิดชอบ</option>
                  {users.map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <input
                  name="dueAt"
                  type="date"
                  className="input"
                  title="กำหนดส่ง"
                />
              </div>
              <button className="btn btn-ghost text-xs">เพิ่ม</button>
            </form>
          </div>
        ))}

        {/* เพิ่มคอลัมน์ */}
        <div className="w-64 shrink-0">
          <form action={createColumnAction} className="flex gap-2">
            <input type="hidden" name="systemId" value={systemId} />
            <input type="hidden" name="boardId" value={boardId} />
            <input
              name="name"
              required
              placeholder="+ คอลัมน์ใหม่"
              className="input min-w-0 flex-1"
            />
            <button className="btn btn-ghost text-sm">เพิ่ม</button>
          </form>
        </div>
      </div>
    </div>
  );
}
