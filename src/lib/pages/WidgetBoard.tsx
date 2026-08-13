"use client";

import { useState, useTransition } from "react";

// พรีวิว + จัดลำดับ widget (drag & drop) — มติเจ้าของ: ทุกทรงกว้าง 1 ช่อง (ทรง = สไตล์การวาดในช่อง)
//   RECT = การ์ดแบนแนวนอน · SQUARE = การ์ดจัตุรัส · CIRCLE = ไอคอนกลมแบบแอปมือถือ
// มือถือไม่มี drag ที่ดี → มีปุ่ม ‹ › เลื่อนซ้าย/ขวาให้ด้วยเสมอ
export type BoardWidget = {
  id: string;
  title: string;
  icon: string;
  imageUrl: string | null;
  shape: "RECT" | "SQUARE" | "CIRCLE";
};

export function WidgetTile({ w, href }: { w: BoardWidget; href?: string }) {
  const img = w.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={w.imageUrl} alt="" className="h-full w-full object-cover" />
  ) : null;
  const body =
    w.shape === "CIRCLE" ? (
      <span className="flex flex-col items-center gap-1.5">
        <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border bg-[color:var(--color-surface-2)] text-3xl">
          {img ?? w.icon}
        </span>
        <span className="line-clamp-2 text-center text-xs">{w.title}</span>
      </span>
    ) : w.shape === "RECT" ? (
      <span className="flex h-16 w-full items-center gap-2 overflow-hidden rounded-xl border px-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[color:var(--color-surface-2)] text-xl">
          {img ?? w.icon}
        </span>
        <span className="line-clamp-2 min-w-0 text-xs font-medium">{w.title}</span>
      </span>
    ) : (
      <span className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border p-2">
        <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-[color:var(--color-surface-2)] text-2xl">
          {img ?? w.icon}
        </span>
        <span className="line-clamp-2 text-center text-xs font-medium">{w.title}</span>
      </span>
    );
  if (href) {
    return (
      <a href={href} className="block hover:opacity-80">
        {body}
      </a>
    );
  }
  return body;
}

export default function WidgetBoard({
  pageId,
  widgets,
  reorderAction,
}: {
  pageId: string;
  widgets: BoardWidget[];
  reorderAction: (pageId: string, idsCsv: string) => Promise<void>;
}) {
  const [order, setOrder] = useState(widgets.map((w) => w.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const byId = new Map(widgets.map((w) => [w.id, w]));
  // widget เพิ่ม/ลบจากฝั่ง server → sync ลำดับ local (คง order เดิมของตัวที่ยังอยู่)
  const ids = [...order.filter((id) => byId.has(id)), ...widgets.filter((w) => !order.includes(w.id)).map((w) => w.id)];

  const commit = (next: string[]) => {
    setOrder(next);
    startTransition(() => reorderAction(pageId, next.join(",")));
  };
  const move = (id: string, dir: -1 | 1) => {
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j]!, next[i]!];
    commit(next);
  };
  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const next = ids.filter((x) => x !== dragId);
    next.splice(next.indexOf(targetId) + (ids.indexOf(dragId) < ids.indexOf(targetId) ? 1 : 0), 0, dragId);
    setDragId(null);
    commit(next);
  };

  if (widgets.length === 0) {
    return <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มี widget — เพิ่มจากรายการเมนูด้านล่าง</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ids.map((id) => {
          const w = byId.get(id)!;
          return (
            <div
              key={id}
              draggable
              onDragStart={() => setDragId(id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dropOn(id)}
              className={`relative cursor-grab ${dragId === id ? "opacity-40" : ""}`}
            >
              <WidgetTile w={w} />
              <span className="absolute -top-2 right-0 flex gap-1">
                <button
                  type="button"
                  onClick={() => move(id, -1)}
                  className="h-6 w-6 rounded-full border bg-[color:var(--color-surface)] text-xs"
                  aria-label="เลื่อนไปก่อนหน้า"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => move(id, 1)}
                  className="h-6 w-6 rounded-full border bg-[color:var(--color-surface)] text-xs"
                  aria-label="เลื่อนไปถัดไป"
                >
                  ›
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-[color:var(--color-muted)]">
        ลากสลับตำแหน่งได้ (หรือปุ่ม ‹ ›){pending ? " · กำลังบันทึกลำดับ…" : ""}
      </p>
    </div>
  );
}
