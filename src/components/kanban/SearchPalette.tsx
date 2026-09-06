// SearchPalette.tsx — ค้นหาการ์ดข้ามบอร์ด (K1.11 · Ctrl/⌘ K) · แบบ `.modal` ใน `ledger/design-kanban/_kb.part`
//
// เปิดได้จาก: ปุ่มค้นหาที่ปุ่มนี้เรนเดอร์เอง (วางในหัวบอร์ด/หน้ารวมบอร์ดได้ตรง ๆ) หรือ Ctrl/⌘ K จากทุกที่
// (ยกเว้นตอนกำลังพิมพ์อยู่ในช่องอื่นของหน้า — ไม่แย่งคีย์ระหว่างพิมพ์ตามกติกาปุ่มลัด §5.6)
//
// ผลลัพธ์มาจาก `searchCardsAction` (แปลงไวยากรณ์ไทยที่ server ทีเดียว ไม่ทำซ้ำฝั่ง client) จัดกลุ่มตามบอร์ด
// ปุ่มลูกศร ↑/↓ เลื่อนตัวเลือก · Enter เปิดการ์ดที่ไฮไลต์อยู่ (นำไปที่บอร์ดนั้นพร้อม `?card=`) · Esc ปิด
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KanbanIcon } from "./KanbanIcon";
import { formatCardDate } from "./Card";
import { searchCardsAction } from "@/lib/modules/kanban/actions";
import type { SearchCardDto } from "@/lib/modules/kanban/filters";

const DEBOUNCE_MS = 250;

const HINTS: { token: string; desc: string }[] = [
  { token: "@ฉัน", desc: "งานของฉัน" },
  { token: "ป้าย:ด่วน", desc: "ป้ายกำกับ" },
  { token: "เลยกำหนด", desc: "เกินกำหนดส่ง" },
  { token: "วันนี้", desc: "ครบกำหนดวันนี้" },
  { token: "บอร์ด:ชื่อ", desc: "จำกัดบอร์ด" },
];

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

export function SearchPalette({ systemId }: { systemId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchCardDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  const openRef = useRef(open);
  openRef.current = open;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setErrorMessage(null);
    setHighlight(0);
  }, []);

  // Ctrl/⌘ K จากทุกที่ในหน้า — ยกเว้นกำลังพิมพ์อยู่ในช่องอื่น (ตอนปิดอยู่) กันแย่งคีย์ระหว่างพิมพ์ (§5.6)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const combo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (!combo) return;
      if (!openRef.current && isEditableTarget(e.target)) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      // เปิดแล้วโฟกัสช่องพิมพ์ทันที (รอ 1 tick ให้ modal mount ก่อน)
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [open]);

  // ค้นหาแบบ debounce 250ms (§5.5) — ยกเลิกคำขอเก่าด้วยเลขลำดับ กันผลลัพธ์เก่ามาทับผลใหม่ (race)
  useEffect(() => {
    if (!open) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const text = query.trim();
    if (!text) {
      setResults([]);
      setLoading(false);
      setErrorMessage(null);
      return;
    }
    setLoading(true);
    const seq = ++requestSeq.current;
    debounceTimer.current = setTimeout(() => {
      searchCardsAction({ systemId, text, take: 20 })
        .then((res) => {
          if (seq !== requestSeq.current) return;
          setLoading(false);
          if (res.ok) {
            setResults(res.items);
            setErrorMessage(null);
            setHighlight(0);
          } else {
            setResults([]);
            setErrorMessage(res.message);
          }
        })
        .catch(() => {
          if (seq !== requestSeq.current) return;
          setLoading(false);
          setResults([]);
          setErrorMessage("ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง");
        });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- systemId คงที่ตลอดอายุคอมโพเนนต์
  }, [query, open]);

  const groups = useMemo(() => {
    const byBoard = new Map<string, { boardName: string; items: SearchCardDto[] }>();
    for (const item of results) {
      const g = byBoard.get(item.boardId) ?? { boardName: item.boardName, items: [] };
      g.items.push(item);
      byBoard.set(item.boardId, g);
    }
    return [...byBoard.values()];
  }, [results]);

  const openResult = useCallback(
    (item: SearchCardDto) => {
      router.push(`/app/sys/${systemId}/kanban/b/${item.boardId}?card=${item.id}`);
      close();
    },
    [router, systemId, close],
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = results[highlight];
      if (item) openResult(item);
    }
  };

  let runningIndex = -1;

  return (
    <>
      <button
        type="button"
        data-testid="search-open"
        onClick={() => setOpen(true)}
        title="ค้นหาการ์ด (Ctrl/⌘ K)"
        className="inline-flex items-center"
        style={{
          height: 31,
          padding: "0 10px",
          borderRadius: 7,
          fontSize: 12.5,
          gap: 7,
          border: "1px solid var(--color-line)",
          background: "var(--color-surface)",
          color: "var(--color-muted)",
          whiteSpace: "nowrap",
        }}
      >
        <KanbanIcon name="search" size="sm" />
        ค้นหา
        <span
          className="hidden sm:inline"
          style={{ fontSize: 10.5, padding: "1px 5px", borderRadius: 4, border: "1px solid var(--color-line)", color: "var(--color-muted)" }}
        >
          ⌘K
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex justify-center" style={{ background: "rgba(10,10,10,.35)", paddingTop: 80 }}>
          <span className="fixed inset-0" onClick={close} aria-hidden />
          <div
            data-testid="search-palette"
            role="dialog"
            aria-modal="true"
            aria-label="ค้นหาการ์ด"
            className="relative flex w-full max-w-[640px] flex-col"
            style={{
              height: "fit-content",
              maxHeight: "70vh",
              background: "var(--color-surface)",
              borderRadius: 14,
              border: "1px solid var(--color-line)",
              boxShadow: "0 24px 60px rgba(10,10,10,.28)",
              overflow: "hidden",
            }}
          >
            <div className="flex items-center" style={{ gap: 9, padding: "12px 16px", borderBottom: "1px solid var(--color-line)" }}>
              <KanbanIcon name="search" size="sm" />
              <input
                ref={inputRef}
                data-testid="search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="ค้นหาการ์ดทุกบอร์ด… (@ฉัน · ป้าย:ด่วน · เลยกำหนด · บอร์ด:ชื่อ)"
                aria-label="ค้นหาการ์ด"
                className="flex-1 bg-transparent outline-none"
                style={{ fontSize: 14 }}
              />
              <button type="button" onClick={close} aria-label="ปิดช่องค้นหา" style={{ color: "var(--color-muted)" }}>
                <KanbanIcon name="x" size="sm" />
              </button>
            </div>

            <div className="flex flex-wrap items-center" style={{ gap: 6, padding: "8px 16px", borderBottom: "1px solid var(--color-line)" }}>
              {HINTS.map((h) => (
                <button
                  key={h.token}
                  type="button"
                  title={h.desc}
                  onClick={() => setQuery((q) => (q ? `${q.trim()} ${h.token}` : h.token))}
                  className="inline-flex items-center font-mono"
                  style={{
                    fontSize: 11,
                    padding: "2px 7px",
                    borderRadius: 5,
                    border: "1px solid var(--color-line)",
                    background: "var(--color-out)",
                    color: "var(--color-ink-soft)",
                  }}
                >
                  {h.token}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto" style={{ padding: "6px 6px 10px" }}>
              {!query.trim() && (
                <p style={{ padding: "18px 12px", fontSize: 12.5, color: "var(--color-muted)" }}>
                  พิมพ์ชื่องาน เลขการ์ด หรือใช้คำสั่งด้านบนเพื่อกรอง
                </p>
              )}
              {query.trim() && loading && (
                <p style={{ padding: "18px 12px", fontSize: 12.5, color: "var(--color-muted)" }}>กำลังค้นหา…</p>
              )}
              {query.trim() && !loading && errorMessage && (
                <p style={{ padding: "18px 12px", fontSize: 12.5, color: "var(--color-danger)" }}>{errorMessage}</p>
              )}
              {query.trim() && !loading && !errorMessage && results.length === 0 && (
                <p style={{ padding: "18px 12px", fontSize: 12.5, color: "var(--color-muted)" }}>ไม่พบการ์ดที่ตรงกับคำค้นนี้</p>
              )}
              {groups.map((g) => (
                <div key={g.boardName} className="flex flex-col" style={{ marginBottom: 4 }}>
                  <div style={{ padding: "8px 12px 4px", fontSize: 11, fontWeight: 700, color: "var(--color-muted)" }}>{g.boardName}</div>
                  {g.items.map((item) => {
                    runningIndex += 1;
                    const idx = runningIndex;
                    const active = idx === highlight;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid="search-result"
                        onMouseEnter={() => setHighlight(idx)}
                        onClick={() => openResult(item)}
                        className="flex w-full flex-col items-start text-left"
                        style={{
                          gap: 2,
                          padding: "8px 12px",
                          borderRadius: 8,
                          background: active ? "var(--color-out)" : "transparent",
                        }}
                      >
                        <span className="flex w-full items-center" style={{ gap: 6, fontSize: 13 }}>
                          {item.cardNo && <span style={{ color: "var(--color-muted)" }}>#{item.cardNo}</span>}
                          <span className="truncate" style={{ flex: 1 }}>{item.title}</span>
                        </span>
                        <span className="flex items-center" style={{ gap: 6, fontSize: 11, color: "var(--color-muted)" }}>
                          {item.columnName}
                          {item.dueAt && <span>· {formatCardDate(item.dueAt)}</span>}
                          {item.labels.slice(0, 3).map((l) => (
                            <span key={l.name}>· {l.name}</span>
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default SearchPalette;
