// ArchivePage.tsx — หน้า "คลังเก็บ" ของบอร์ด (K1.14 · แบบ §5.3 หน้า 11 · empty state §5.7)
//
// แท็บ การ์ด / คอลัมน์ · ช่องค้นหา · ปุ่มกู้คืนรายแถว
// 🔴 ค้นหายิงกลับไปที่เซิร์ฟเวอร์ (`listArchivedAction`) ไม่ใช่กรองในหน่วยความจำ — หน้านี้ดึงมาแค่
//    200 แถวแรก (`KANBAN_LIMITS.archivePageSize`) ⇒ กรองในเครื่องจะ "หาไม่เจอ" ของที่อยู่นอก 200 แถวนั้น
//    แบบเงียบ ๆ ซึ่งแย่กว่าไม่มีช่องค้นหาเลย
// 🔴 กู้คืนแล้วแถวหายจากรายการทันที (optimistic) แต่ถ้า server ปฏิเสธ ต้องคืนแถวกลับ + บอกเหตุผล

"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { KanbanIcon } from "./KanbanIcon";
import { formatCardDateTime } from "./Card";
import { listArchivedAction, restoreCardAction, restoreColumnAction } from "@/lib/modules/kanban/actions";
import type { ArchiveListDto } from "@/lib/modules/kanban/types";

const muted = "text-[color:var(--color-muted)]";

/**
 * วันที่แบบไทย (พ.ศ. · เวลากรุงเทพฯ) — ใช้ตัวจัดรูปแบบตัวเดียวกับการ์ด (`formatCardDateTime`)
 * 🔴 ห้าม `toLocaleString("th-TH")` ที่นี่: แถวชุดแรกถูกเรนเดอร์จากเซิร์ฟเวอร์ (`initial`)
 *    แล้วเบราว์เซอร์ hydrate ทับ — ICU ของ Node กับของเบราว์เซอร์ให้สตริงไม่เท่ากัน = hydration error
 *    (บทเรียน K1.5 · หัวไฟล์ `Card.tsx` / `ThaiDatePicker.tsx` ห้ามไว้ด้วยเหตุผลเดียวกัน)
 */
function thaiDateTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return formatCardDateTime(iso);
}

type Tab = "cards" | "columns";

export function ArchivePage({
  systemId,
  boardId,
  boardName,
  initial,
  canRestoreCards,
  canRestoreColumns,
}: {
  systemId: string;
  boardId: string;
  boardName: string;
  initial: ArchiveListDto;
  /** EDITOR ขึ้นไป */
  canRestoreCards: boolean;
  /** ADMIN เท่านั้น (D16) */
  canRestoreColumns: boolean;
}) {
  const [tab, setTab] = useState<Tab>("cards");
  const [q, setQ] = useState("");
  const [data, setData] = useState<ArchiveListDto>(initial);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(
    (term: string) => {
      startTransition(async () => {
        const res = await listArchivedAction({ systemId, boardId, q: term });
        if (res.ok) {
          setData(res.data);
          setError(null);
        } else {
          setError(res.message);
        }
      });
    },
    [systemId, boardId],
  );

  // พิมพ์รัว ๆ = คำขอเดียว (หน่วง 300ms) — ไม่ยิงต่อทุกตัวอักษร
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => reload(q), 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, reload]);

  const restoreCard = (cardId: string) => {
    const before = data;
    setData({ ...data, cards: data.cards.filter((c) => c.id !== cardId) });
    startTransition(async () => {
      const res = await restoreCardAction({ systemId, boardId, cardId });
      if (!res.ok) {
        setData(before);
        setError(res.message);
      }
    });
  };

  const restoreColumn = (columnId: string) => {
    const before = data;
    setData({ ...data, columns: data.columns.filter((c) => c.id !== columnId) });
    startTransition(async () => {
      const res = await restoreColumnAction({ systemId, boardId, columnId });
      if (!res.ok) {
        setData(before);
        setError(res.message);
      }
    });
  };

  const boardHref = `/app/sys/${systemId}/kanban/b/${boardId}`;

  return (
    <div data-testid="archive-page" className="flex flex-col gap-4">
      {/* หัวเรื่อง */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={boardHref} className={`text-sm ${muted}`}>
          ← {boardName}
        </Link>
        <span className="flex-1" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.02em" }}>คลังเก็บ</h1>
        <span className={`text-sm ${muted}`}>
          การ์ด {data.cards.length} ใบ · คอลัมน์ {data.columns.length}
        </span>
      </div>

      {/* แท็บ + ค้นหา */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg p-0.5" style={{ background: "var(--color-surface-2)" }}>
          {(
            [
              { key: "cards" as const, label: "การ์ด", testId: "archive-tab-cards" },
              { key: "columns" as const, label: "คอลัมน์", testId: "archive-tab-columns" },
            ]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              data-testid={t.testId}
              onClick={() => setTab(t.key)}
              className="rounded-md px-3 py-1.5"
              style={{
                fontSize: 13,
                fontWeight: tab === t.key ? 600 : 400,
                background: tab === t.key ? "var(--color-surface)" : "transparent",
                color: tab === t.key ? "var(--color-ink)" : "var(--color-muted)",
                border: tab === t.key ? "1px solid var(--color-line)" : "1px solid transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <label
          className="inline-flex items-center gap-2 rounded-lg px-2.5"
          style={{ height: 34, border: "1px solid var(--color-line)", background: "var(--color-surface)" }}
        >
          <KanbanIcon name="search" size="sm" className={muted} />
          <input
            data-testid="archive-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาในคลัง"
            aria-label="ค้นหาในคลังเก็บ"
            className="bg-transparent outline-none"
            style={{ fontSize: 13, width: 190 }}
          />
        </label>
      </div>

      {error && (
        <p data-testid="archive-error" style={{ fontSize: 12.5, color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      {/* รายการ */}
      {tab === "cards" ? (
        data.cards.length === 0 ? (
          <div
            className="flex flex-col items-start gap-2 rounded-xl p-6"
            style={{ border: "1px dashed var(--color-line)", background: "var(--color-surface)" }}
          >
            <p style={{ fontSize: 13.5 }}>
              {q ? `ไม่พบการ์ดในคลังที่ตรงกับ “${q}”` : "ยังไม่มีการ์ดที่เก็บเข้าคลัง"}
            </p>
            {q ? (
              <button type="button" className="btn btn-ghost text-sm" onClick={() => setQ("")}>
                ล้างคำค้น
              </button>
            ) : (
              <Link href={boardHref} className="btn btn-primary text-sm">
                กลับไปที่บอร์ด
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col rounded-xl" style={{ border: "1px solid var(--color-line)", background: "var(--color-surface)" }}>
            {data.cards.map((c, i) => (
              <div
                key={c.id}
                data-testid="archive-card-row"
                className="flex flex-wrap items-center gap-2 px-3 py-2.5"
                style={{ borderTop: i === 0 ? undefined : "1px solid var(--color-line)" }}
              >
                <span className={`tabular-nums ${muted}`} style={{ fontSize: 11.5, minWidth: 38 }}>
                  {c.cardNo ? `#${c.cardNo}` : "—"}
                </span>
                <span className="min-w-0 flex-1 truncate" style={{ fontSize: 13 }}>
                  {c.title}
                </span>
                <span className={`text-xs ${muted}`}>
                  {c.columnName ?? "ไม่มีคอลัมน์"} · {thaiDateTime(c.archivedAt)}
                  {c.archivedBy ? ` · โดย ${c.archivedBy.name}` : ""}
                </span>
                {canRestoreCards && (
                  <button
                    type="button"
                    data-testid="archive-restore-card"
                    className="btn btn-ghost"
                    style={{ fontSize: 12.5, height: 30 }}
                    onClick={() => restoreCard(c.id)}
                  >
                    กู้คืน
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      ) : data.columns.length === 0 ? (
        <div
          className="flex flex-col items-start gap-2 rounded-xl p-6"
          style={{ border: "1px dashed var(--color-line)", background: "var(--color-surface)" }}
        >
          <p style={{ fontSize: 13.5 }}>{q ? `ไม่พบคอลัมน์ในคลังที่ตรงกับ “${q}”` : "ยังไม่มีคอลัมน์ที่เก็บเข้าคลัง"}</p>
          <Link href={boardHref} className="btn btn-ghost text-sm">
            กลับไปที่บอร์ด
          </Link>
        </div>
      ) : (
        <div className="flex flex-col rounded-xl" style={{ border: "1px solid var(--color-line)", background: "var(--color-surface)" }}>
          {data.columns.map((c, i) => (
            <div
              key={c.id}
              data-testid="archive-column-row"
              className="flex flex-wrap items-center gap-2 px-3 py-2.5"
              style={{ borderTop: i === 0 ? undefined : "1px solid var(--color-line)" }}
            >
              <span className="min-w-0 flex-1 truncate" style={{ fontSize: 13 }}>
                {c.name}
              </span>
              <span className={`text-xs ${muted}`}>
                การ์ดที่ผูกอยู่ {c.cardCount} ใบ · {thaiDateTime(c.archivedAt)}
              </span>
              {canRestoreColumns && (
                <button
                  type="button"
                  data-testid="archive-restore-column"
                  className="btn btn-ghost"
                  style={{ fontSize: 12.5, height: 30 }}
                  onClick={() => restoreColumn(c.id)}
                >
                  กู้คืน
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <p className={`text-xs ${muted}`}>
        ของในคลังไม่ถูกลบ — กู้คืนได้ตลอด · การ์ดกลับไปคอลัมน์เดิม (ถ้าคอลัมน์ยังอยู่) · คอลัมน์กลับมาที่ท้ายบอร์ด
      </p>
    </div>
  );
}

export default ArchivePage;
