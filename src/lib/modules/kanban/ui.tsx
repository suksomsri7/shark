import Link from "next/link";
import { getBoard, listBoards, listTenantUsers } from "./service";
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

const muted = "text-[color:var(--color-muted)]";

const fmtDue = (d: Date) =>
  d.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

// ───────────────────────── KanbanContent (ฝังในหน้า /app/sys/[id]) ─────────────────────────
// แสดงรายการบอร์ดของระบบ Kanban นี้ + ปุ่มสร้างบอร์ด (คลิกเข้าดูรายละเอียดที่ sub-route)
export async function KanbanContent({ systemId, tenantId }: { systemId: string; tenantId: string }) {
  const boards = await listBoards(tenantId, systemId);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">บอร์ดงาน ({boards.length})</h2>
      {boards.length === 0 ? (
        <p className={`text-sm ${muted}`}>
          ยังไม่มีบอร์ด — สร้างบอร์ดแรกเพื่อจัดการงานของทีม (จะมีคอลัมน์ รอทำ / กำลังทำ / เสร็จ ให้อัตโนมัติ)
        </p>
      ) : (
        boards.map((b) => (
          <Link
            key={b.id}
            href={`/app/sys/${systemId}/kanban/${b.id}`}
            className="flex items-center justify-between rounded-xl border p-3 hover:bg-[color:var(--color-surface-2)]"
          >
            <div>
              <div className="text-sm font-medium">{b.name}</div>
              {b.description && <div className={`text-xs ${muted}`}>{b.description}</div>}
            </div>
            <div className={`text-xs ${muted}`}>
              {(b as unknown as { _count?: { cards: number } })._count?.cards ?? 0} การ์ด →
            </div>
          </Link>
        ))
      )}
      <form action={createBoardAction} className="mt-1 flex gap-2">
        <input type="hidden" name="systemId" value={systemId} />
        <input
          name="name"
          required
          placeholder="ชื่อบอร์ด เช่น งานเปิดสาขา"
          className="flex-1 rounded-lg border px-2 py-1.5 text-sm"
        />
        <button className="btn btn-ghost text-sm">+ สร้างบอร์ด</button>
      </form>
    </section>
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={`/app/sys/${systemId}`} className={`text-sm ${muted}`}>
            ← ระบบ Kanban
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{board.name}</h1>
          {board.description && <div className={`text-sm ${muted}`}>{board.description}</div>}
        </div>
        <ConfirmDialog
          triggerLabel="เก็บบอร์ด"
          triggerClassName={`text-xs underline ${muted}`}
          title="เก็บบอร์ดนี้?"
          detail="บอร์ดจะถูกเก็บเข้าคลังและไม่แสดงในรายการ"
          confirmLabel="ยืนยันเก็บบอร์ด"
          action={archiveBoardAction}
          fields={{ systemId, boardId }}
        />
      </div>

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
                          <span key={l} className="rounded-full border px-2 py-0.5 text-[11px]">
                            {l}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className={`flex items-center justify-between text-[11px] ${muted}`}>
                      <span>{assignee ? `👤 ${assignee}` : "ไม่มีผู้รับผิดชอบ"}</span>
                      {card.dueAt && <span>📅 {fmtDue(card.dueAt)}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <form action={moveCardAction}>
                        <input type="hidden" name="systemId" value={systemId} />
                        <input type="hidden" name="boardId" value={boardId} />
                        <input type="hidden" name="cardId" value={card.id} />
                        <input type="hidden" name="direction" value="left" />
                        <button
                          disabled={colIdx === 0}
                          className="btn btn-ghost px-2 py-0.5 text-xs disabled:opacity-30"
                          title="ย้ายซ้าย"
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
                          className="btn btn-ghost px-2 py-0.5 text-xs disabled:opacity-30"
                          title="ย้ายขวา"
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
                className="rounded-lg border px-2 py-1.5 text-sm"
              />
              <div className="flex gap-1.5">
                <select
                  name="assigneeUserId"
                  className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-xs"
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
                  className="rounded-lg border px-2 py-1 text-xs"
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
              className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm"
            />
            <button className="btn btn-ghost text-sm">เพิ่ม</button>
          </form>
        </div>
      </div>
    </div>
  );
}
