// MyTasks.tsx — "งานของฉัน" ใหม่ (K1.13 · แบบที่เคาะ: `ledger/design-kanban/06-my-tasks.png` ฝั่งขวา)
// เดิม (ก่อน K1.13) = `KanbanMyTasksSection` ใน `ui.tsx` (list เดียวไม่จัดกลุ่ม) — ตัวนี้แทนที่บนหน้า
// `/app/sys/{id}/kanban/my-tasks` (ui.tsx ยังคง `KanbanMyTasksSection` ไว้เผื่อมีที่อื่นอ้างถึง — ไม่ถูก
// เรียกจากหน้านี้อีกแล้ว เหมือนแพตเทิร์นเดียวกับ K1.12 ที่ทำกับ `KanbanBoardsSection`)
//
// กล่องงานเข้าส่วนตัว (ฝั่งซ้ายของภาพ 06) เป็นขอบเขตของ K2.8 — WO นี้ทำเฉพาะฝั่งขวาตามสัญญา §K1.13
"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { DUE_STYLE, dueBadgeFrom, tagColorVar } from "./Card";
import { KanbanIcon } from "./KanbanIcon";
import { completeCardAction, toggleChecklistItemAction, undoAction } from "@/lib/modules/kanban/actions";
import type { MyChecklistItemDto, MyTaskCardDto, MyTasksOverviewDto } from "@/lib/modules/kanban/types";

const UNDO_TOAST_MS = 5000;

function KpiTile({ icon, label, value, tone }: { icon: string; label: string; value: number; tone?: "danger" }) {
  return (
    <div className="card flex flex-col gap-1.5" style={{ padding: 13 }}>
      <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--color-muted)" }}>
        <KanbanIcon name={icon} size="sm" />
        {label}
      </div>
      <div
        className="tabular-nums"
        style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.025em", color: tone === "danger" ? "var(--color-danger)" : "var(--color-ink)" }}
      >
        {value}
      </div>
    </div>
  );
}

type GroupKey = "overdue" | "today" | "week" | "later" | "none";

const GROUP_META: Record<GroupKey, { icon: string; label: string; danger?: boolean }> = {
  overdue: { icon: "warn", label: "เลยกำหนด", danger: true },
  today: { icon: "clock", label: "วันนี้" },
  week: { icon: "cal", label: "สัปดาห์นี้" },
  later: { icon: "cal", label: "ภายหลัง" },
  none: { icon: "list", label: "ไม่ได้กำหนดวัน" },
};

export function MyTasks({
  systemId,
  overview,
  nowMs,
}: {
  systemId: string;
  overview: MyTasksOverviewDto;
  nowMs: number;
}) {
  const [groups, setGroups] = useState(overview.groups);
  const [counts, setCounts] = useState(overview.counts);
  const [checklistItems, setChecklistItems] = useState<MyChecklistItemDto[]>(overview.checklistItems);
  const [undoToast, setUndoToast] = useState<{ message: string; token: string; boardId: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const showUndoToast = useCallback((message: string, token: string, boardId: string) => {
    setUndoToast({ message, token, boardId });
    setTimeout(() => setUndoToast((cur) => (cur?.token === token ? null : cur)), UNDO_TOAST_MS);
  }, []);

  const complete = useCallback(
    async (card: MyTaskCardDto, group: GroupKey) => {
      setBusyId(card.id);
      // optimistic: เอาการ์ดออกจากกลุ่มที่มันอยู่ทันที
      setGroups((prev) => ({ ...prev, [group]: prev[group].filter((c) => c.id !== card.id) }));
      try {
        const res = await completeCardAction({ systemId, boardId: card.boardId, cardId: card.id });
        if (res.ok) {
          setCounts((prev) => ({ ...prev, doneThisWeek: prev.doneThisWeek + 1 }));
          showUndoToast(`ทำเครื่องหมาย "${card.title}" เสร็จแล้ว`, res.undoToken, card.boardId);
        } else {
          // ปัดไม่ผ่าน (เช่นบอร์ดไม่มีคอลัมน์เสร็จ) — คืนการ์ดกลับที่กลุ่มเดิม
          setGroups((prev) => ({ ...prev, [group]: [...prev[group], card] }));
        }
      } catch {
        setGroups((prev) => ({ ...prev, [group]: [...prev[group], card] }));
      } finally {
        setBusyId(null);
      }
    },
    [showUndoToast, systemId],
  );

  const undoLast = useCallback(async () => {
    const cur = undoToast;
    if (!cur) return;
    setUndoToast(null);
    await undoAction({ systemId, boardId: cur.boardId, token: cur.token });
    // ทางที่ง่ายและตรงที่สุด (ไม่ต้องคาดเดา group เดิมของการ์ด) — โหลดหน้าใหม่ให้ตรงกับฐานข้อมูลจริง
    window.location.reload();
  }, [systemId, undoToast]);

  const toggleChecklist = useCallback(
    async (item: MyChecklistItemDto) => {
      setBusyId(item.id);
      setChecklistItems((prev) => prev.filter((i) => i.id !== item.id));
      try {
        const res = await toggleChecklistItemAction({
          systemId,
          boardId: item.card.boardId,
          cardId: item.card.id,
          itemId: item.id,
          done: true,
        });
        if (!res.ok) setChecklistItems((prev) => [...prev, item]);
      } catch {
        setChecklistItems((prev) => [...prev, item]);
      } finally {
        setBusyId(null);
      }
    },
    [systemId],
  );

  const order: GroupKey[] = ["overdue", "today", "week", "later", "none"];
  const totalOpen = order.reduce((n, k) => n + groups[k].length, 0);
  const nothingAtAll = totalOpen === 0 && checklistItems.length === 0;

  return (
    <div data-testid="my-tasks" className="flex flex-col gap-3">
      {/* ── 4 ตัวเลข ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile icon="warn" label="เลยกำหนด" value={counts.overdue} tone="danger" />
        <KpiTile icon="clock" label="ถึงกำหนดวันนี้" value={counts.today} />
        <KpiTile icon="cal" label="สัปดาห์นี้" value={counts.week} />
        <KpiTile icon="check" label="ปิดไปสัปดาห์นี้" value={counts.doneThisWeek} />
      </div>

      <div className="card flex flex-col gap-3" style={{ padding: 15 }}>
        <div className="flex items-center gap-2">
          <KanbanIcon name="check" size="sm" />
          <h2 style={{ fontSize: 13.5, fontWeight: 700 }}>งานที่มอบหมายให้ฉัน</h2>
          <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>รวมทุกบอร์ดที่ฉันเข้าถึง</span>
        </div>

        {nothingAtAll ? (
          <p style={{ fontSize: 13, color: "var(--color-muted)", padding: "10px 2px" }}>วันนี้ไม่มีงานค้าง</p>
        ) : (
          <>
            {order.map((key) => {
              const items = groups[key];
              if (items.length === 0) {
                // ยังคงข้อความ "วันนี้ไม่มีงานค้าง" ไว้ให้เห็นเฉพาะกลุ่มวันนี้ที่ว่าง (empty state ของกลุ่มนี้โดยเฉพาะ)
                if (key === "today") {
                  return (
                    <p key={key} style={{ fontSize: 12, color: "var(--color-muted)" }}>
                      วันนี้ไม่มีงานค้าง
                    </p>
                  );
                }
                return null;
              }
              const meta = GROUP_META[key];
              return (
                <div key={key} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 border-t pt-2.5" style={{ borderColor: "var(--color-line)" }}>
                    <KanbanIcon name={meta.icon} size="sm" className={meta.danger ? "text-[color:var(--color-danger)]" : undefined} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: meta.danger ? "var(--color-danger)" : "var(--color-ink)" }}>
                      {meta.label}
                    </span>
                    <span
                      className="grid place-items-center rounded-md"
                      style={{
                        minWidth: 18,
                        height: 18,
                        padding: "0 5px",
                        fontSize: 10.5,
                        fontWeight: 700,
                        background: meta.danger ? "var(--color-danger)" : "var(--color-ink)",
                        color: "var(--color-surface)",
                      }}
                    >
                      {items.length}
                    </span>
                  </div>
                  <ul className="flex flex-col">
                    {items.map((card) => {
                      const due = dueBadgeFrom(card.dueAt, null, nowMs);
                      return (
                        <li key={card.id} className="flex items-start gap-2.5 border-t py-2.5 first:border-t-0" style={{ borderColor: "var(--color-line)" }}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={false}
                            aria-label={`ทำเครื่องหมายเสร็จ: ${card.title}`}
                            data-testid="my-task-complete"
                            disabled={busyId === card.id}
                            onClick={() => complete(card, key)}
                            className="mt-0.5 shrink-0 rounded disabled:opacity-40"
                            style={{ width: 14, height: 14, border: "1.5px solid var(--color-line-strong,var(--color-muted))" }}
                          />
                          <div className="min-w-0 flex-1">
                            <Link href={`/app/sys/${systemId}/kanban/b/${card.boardId}?card=${card.id}`} className="font-medium" style={{ fontSize: 13 }}>
                              {card.title}
                            </Link>
                            <div style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
                              {card.boardName} · {card.columnName}
                              {card.cardNo ? ` · #${card.cardNo}` : ""}
                            </div>
                            {card.labels.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {card.labels.map((l) => (
                                  <span
                                    key={l.id}
                                    className="inline-flex items-center font-semibold"
                                    style={{
                                      height: 18,
                                      padding: "0 6px",
                                      borderRadius: 5,
                                      fontSize: 10.5,
                                      color: tagColorVar(l.color),
                                      border: `1px solid ${tagColorVar(l.color)}`,
                                    }}
                                  >
                                    {l.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {due && (
                            <span
                              className="shrink-0 whitespace-nowrap font-semibold"
                              style={{
                                fontSize: 10.5,
                                height: 19,
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "0 6px",
                                borderRadius: 5,
                                color: DUE_STYLE[due.tone].color,
                                border: `1px solid ${DUE_STYLE[due.tone].border}`,
                                background: DUE_STYLE[due.tone].background,
                              }}
                            >
                              {due.text}
                            </span>
                          )}
                          {card.checklistProgress && (
                            <span className="shrink-0 tabular-nums" style={{ fontSize: 11, color: "var(--color-muted)" }}>
                              {card.checklistProgress.done}/{card.checklistProgress.total}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </>
        )}

        {/* ── รายการเช็คลิสต์ที่มอบหมายให้ฉัน (K1.7) ── */}
        {checklistItems.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 border-t pt-2.5" style={{ borderColor: "var(--color-line)" }}>
              <KanbanIcon name="cklist" size="sm" />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>รายการเช็คลิสต์ที่มอบหมายให้ฉัน</span>
              <span
                className="grid place-items-center rounded-md"
                style={{ minWidth: 18, height: 18, padding: "0 5px", fontSize: 10.5, fontWeight: 700, background: "var(--color-ink)", color: "var(--color-surface)" }}
              >
                {checklistItems.length}
              </span>
            </div>
            <ul className="flex flex-col">
              {checklistItems.map((item) => (
                <li key={item.id} className="flex items-start gap-2.5 border-t py-2.5 first:border-t-0" style={{ borderColor: "var(--color-line)" }}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={false}
                    aria-label={`ทำเครื่องหมายเสร็จ: ${item.text}`}
                    disabled={busyId === item.id}
                    onClick={() => toggleChecklist(item)}
                    className="mt-0.5 shrink-0 rounded disabled:opacity-40"
                    style={{ width: 14, height: 14, border: "1.5px solid var(--color-line-strong,var(--color-muted))" }}
                  />
                  <div className="min-w-0 flex-1">
                    <span style={{ fontSize: 12.8 }}>{item.text}</span>
                    <div style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
                      อยู่ในการ์ด{" "}
                      <Link href={`/app/sys/${systemId}/kanban/b/${item.card.boardId}?card=${item.card.id}`} style={{ color: "var(--color-accent)", fontWeight: 600 }}>
                        {item.card.cardNo ? `#${item.card.cardNo} ` : ""}
                        {item.card.title}
                      </Link>
                    </div>
                  </div>
                  {item.dueAt && (
                    <span className="shrink-0 tabular-nums" style={{ fontSize: 11, color: "var(--color-muted)" }}>
                      {new Date(item.dueAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── ที่ฉันติดตาม — ยังไม่มีฟีเจอร์ (K2.11) ── */}
        {overview.watching.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 border-t pt-2.5" style={{ borderColor: "var(--color-line)" }}>
              <KanbanIcon name="eye" size="sm" />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>ที่ฉันติดตาม (ไม่ได้รับผิดชอบ)</span>
            </div>
            <ul className="flex flex-col">
              {overview.watching.map((w) => (
                <li key={w.id} className="border-t py-2 first:border-t-0" style={{ borderColor: "var(--color-line)", fontSize: 12.5 }}>
                  <Link href={`/app/sys/${systemId}/kanban/b/${w.boardId}?card=${w.id}`}>{w.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── toast "เลิกทำ" (ปัดขวาบนมือถือ = ตัวเดียวกับ BoardView.tsx — ที่นี่ tick-to-complete จากรายการ) ── */}
      {undoToast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4">
          <div
            role="status"
            data-testid="undo-toast"
            className="pointer-events-auto flex items-center gap-3 rounded-full px-4 py-3"
            style={{ background: "var(--color-ink)", color: "var(--color-surface)", fontSize: 13, boxShadow: "0 8px 24px rgba(10,10,10,.24)" }}
          >
            <KanbanIcon name="check" size="sm" />
            <span>{undoToast.message}</span>
            <button type="button" data-testid="undo-toast-action" onClick={undoLast} className="font-semibold underline">
              เลิกทำ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyTasks;
