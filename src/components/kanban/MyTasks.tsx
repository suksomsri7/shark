// MyTasks.tsx — "งานของฉัน" + กล่องงานเข้า (K1.13 ฝั่งขวา + K2.8 หัวจอ/ฝั่งซ้าย ·
// แบบที่เคาะ: `ledger/design-kanban/06-my-tasks.png`)
// เดิม (ก่อน K1.13) = `KanbanMyTasksSection` ใน `ui.tsx` (list เดียวไม่จัดกลุ่ม) — ตัวนี้แทนที่บนหน้า
// `/app/sys/{id}/kanban/my-tasks` (ui.tsx ยังคง `KanbanMyTasksSection` ไว้เผื่อมีที่อื่นอ้างถึง — ไม่ถูก
// เรียกจากหน้านี้อีกแล้ว เหมือนแพตเทิร์นเดียวกับ K1.12 ที่ทำกับ `KanbanBoardsSection`)
//
// K2.8: หัวจอ "สวัสดีตอน{เช้า/บ่าย/เย็น} {ชื่อ}" + วันที่ไทย + สรุป + ปุ่ม "จดงานเร็ว" (เลื่อน/โฟกัสช่องจด
// ของ `<InboxPanel>`) ตอนนี้อยู่ในไฟล์นี้ทั้งคู่ (คอลัมน์ซ้าย=กล่องงานเข้า · ขวา=งานของฉันเดิม) เพราะ
// oracle K2.8 อ่านสตริง "สวัสดี"/"จดงานเร็ว"/`InboxPanel` จากไฟล์นี้ + `InboxPanel.tsx` รวมกัน
"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { DUE_STYLE, dueBadgeFrom, tagColorVar } from "./Card";
import { InboxPanel, type InboxBoardOption } from "./InboxPanel";
import { KanbanIcon } from "./KanbanIcon";
import { completeCardAction, toggleChecklistItemAction, undoAction } from "@/lib/modules/kanban/actions";
import type { InboxItemDto, MyChecklistItemDto, MyTaskCardDto, MyTasksOverviewDto } from "@/lib/modules/kanban/types";

const UNDO_TOAST_MS = 5000;
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok = UTC+7 ตายตัว ไม่มี DST — คำนวณเองล้วน (ห้าม toLocale*/getDay ตรง ๆ)
const TH_MONTH_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const TH_WDAY_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

function bkkOf(nowMs: number) {
  const d = new Date(nowMs + BKK_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), hour: d.getUTCHours(), weekday: d.getUTCDay() };
}

/** "สวัสดีตอนเช้า/บ่าย/เย็น" ตามเวลาไทย — เช้า < 11:00 · บ่าย < 17:00 · เย็นหลังจากนั้น */
function greetingWord(hour: number): string {
  if (hour < 11) return "เช้า";
  if (hour < 17) return "บ่าย";
  return "เย็น";
}

/** "ศุกร์ 5 กันยายน 2569" — วันไทย + วันที่ + เดือนไทยเต็ม + ปี พ.ศ. */
function thaiDateLong(nowMs: number): string {
  const b = bkkOf(nowMs);
  return `${TH_WDAY_FULL[b.weekday]} ${b.day} ${TH_MONTH_FULL[b.month]} ${b.year + 543}`;
}

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
  userName,
  inboxItems,
  inboxBoards,
}: {
  systemId: string;
  overview: MyTasksOverviewDto;
  nowMs: number;
  /** K2.8 — หัวจอ "สวัสดีตอน…{ชื่อ}" */
  userName: string;
  /** K2.8 — รายการกล่องงานเข้าของฉัน (OPEN เท่านั้น) ให้ `<InboxPanel>` */
  inboxItems: InboxItemDto[];
  /** K2.8 — บอร์ดที่แก้ได้ (EDITOR+) พร้อมคอลัมน์ ให้ popover "ส่งเข้าบอร์ด" ของ `<InboxPanel>` */
  inboxBoards: InboxBoardOption[];
}) {
  const [groups, setGroups] = useState(overview.groups);
  const [counts, setCounts] = useState(overview.counts);
  const [checklistItems, setChecklistItems] = useState<MyChecklistItemDto[]>(overview.checklistItems);
  const [undoToast, setUndoToast] = useState<{ message: string; token: string; boardId: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [boardFilter, setBoardFilter] = useState<string>("all");

  // K2.8 — dropdown "ทุกบอร์ด" ของหัวจอ: รายชื่อบอร์ดที่มีงานของฉันอยู่จริงวันนี้ (ไม่ต้องยิงคิวรีเพิ่ม)
  const boardFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const key of ["overdue", "today", "week", "later", "none"] as const) {
      for (const c of overview.groups[key]) map.set(c.boardId, c.boardName);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [overview.groups]);

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
  const visibleGroups: Record<GroupKey, MyTaskCardDto[]> =
    boardFilter === "all"
      ? groups
      : {
          overdue: groups.overdue.filter((c) => c.boardId === boardFilter),
          today: groups.today.filter((c) => c.boardId === boardFilter),
          week: groups.week.filter((c) => c.boardId === boardFilter),
          later: groups.later.filter((c) => c.boardId === boardFilter),
          none: groups.none.filter((c) => c.boardId === boardFilter),
        };

  return (
    <div data-testid="my-tasks" className="flex flex-col gap-4">
      {/* ── K2.8: หัวจอ "สวัสดีตอน…{ชื่อ}" + วันที่ไทย + สรุป + dropdown บอร์ด + ปุ่ม "จดงานเร็ว" ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 700 }}>
            สวัสดีตอน{greetingWord(bkkOf(nowMs).hour)} {userName}
          </h1>
          <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
            {thaiDateLong(nowMs)} · มีงานถึงกำหนดวันนี้ {counts.today} งาน · เลยกำหนด {counts.overdue} งาน
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            data-testid="my-tasks-board-filter"
            value={boardFilter}
            onChange={(e) => setBoardFilter(e.target.value)}
            className="rounded-lg border px-2.5 py-2 text-sm"
            style={{ borderColor: "var(--color-line)" }}
          >
            <option value="all">ทุกบอร์ด</option>
            {boardFilterOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <a
            href="#inbox-quick-add-input"
            data-testid="my-tasks-quick-add-link"
            className="btn btn-primary text-sm"
            onClick={() => {
              // เลื่อนไปช่องจดของกล่องงานเข้าแล้วโฟกัสให้พิมพ์ต่อได้ทันที (a[href=#…] เลื่อนให้อยู่แล้ว)
              window.setTimeout(() => document.getElementById("inbox-quick-add-input")?.focus(), 260);
            }}
          >
            + จดงานเร็ว
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[340px_1fr] lg:items-start">
        {/* ── K2.8 คอลัมน์ซ้าย (desktop) / บนสุดรองจากงานของฉัน (มือถือ) — กล่องงานเข้า ── */}
        <div className="order-2 lg:order-1">
          <InboxPanel systemId={systemId} items={inboxItems} boards={inboxBoards} nowMs={nowMs} />
        </div>

        <div className="order-1 flex flex-col gap-3 lg:order-2">
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
              /* empty state §5.7 — ทุกอันต้องบอก "ขั้นต่อไป" 1 อย่าง */
              <div className="flex flex-col items-start gap-2" style={{ padding: "10px 2px" }}>
                <p style={{ fontSize: 13, color: "var(--color-muted)" }}>
                  วันนี้ไม่มีงานค้าง 🎉 งานที่หัวหน้ามอบหมายจะมาอยู่ที่นี่
                </p>
                <Link href={`/app/sys/${systemId}/kanban/boards`} className="btn btn-ghost text-sm" data-testid="my-tasks-see-boards">
                  ดูบอร์ดทั้งหมด
                </Link>
              </div>
            ) : (
              <>
                {order.map((key) => {
                  const items = visibleGroups[key];
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
        </div>
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
