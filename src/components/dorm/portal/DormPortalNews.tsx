"use client";
// SVC D.17 ▸ หน้าประกาศของผู้เช่า (มือถือ 390) — สัญญา DOM ledger/svc-briefs/svc-brief-d.17.md §4.2
//   ไม่มีชื่อ/เบอร์ผู้เช่า · ลิงก์ใช้ <a> · "อ่านแล้ว" นับจากเบราว์เซอร์เท่านั้น (เรียก markRead ครั้งเดียวใน useEffect — ไม่เรียกตอน render ฝั่งเซิร์ฟเวอร์)
import { useEffect, useRef } from "react";
import type { PortalNewsView } from "@/lib/platform/dorm-announce";

type Props = { view: PortalNewsView; token: string; markRead: (announcementId: string) => Promise<unknown> };

export default function DormPortalNews({ view, token, markRead }: Props) {
  void token;
  const detailId = view.detail?.id ?? null;
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!detailId || done.current === detailId) return;
    done.current = detailId;
    void markRead(detailId).catch(() => undefined);
  }, [detailId, markRead]);

  return (
    <div data-dorm-news="" className="mx-auto flex w-full max-w-[480px] flex-col gap-4 px-4 py-5 text-[#0a0a0a]">
      <header className="flex flex-col gap-1 border-b border-[#e5e5e5] pb-3">
        <h1 className="text-[18px] font-bold">{`ประกาศจากหอ · ห้อง ${view.roomNumber}`}</h1>
        <span className="truncate text-[13px] text-[#737373]">{view.unitName}</span>
      </header>

      {view.detail ? (
        <article data-news-detail={view.detail.id} className="flex flex-col gap-2 rounded-2xl border border-[#e5e5e5] bg-white p-4">
          <h2 data-news-title="" className="break-words text-[16px] font-bold">
            {view.detail.title}
          </h2>
          <p className="text-[12px] text-[#737373]">{view.detail.publishedLabel}</p>
          <p data-news-body="" className="whitespace-pre-line break-words text-[15px] leading-relaxed text-[#262626]">
            {view.detail.body}
          </p>
        </article>
      ) : null}

      {view.items.length ? (
        <ul className="flex flex-col gap-2">
          {view.items.map((it) => (
            <li key={it.id}>
              <a
                data-news-row={it.id}
                href={`?a=${it.id}`}
                aria-current={it.current ? "page" : undefined}
                className={`flex min-h-[44px] flex-col justify-center rounded-xl border px-4 py-2 ${it.current ? "border-[#0a0a0a] bg-[#f5f5f5]" : "border-[#e5e5e5] bg-white"}`}
              >
                <span className="break-words text-[15px] font-semibold">{it.title}</span>
                <span className="text-[12px] text-[#737373]">{it.publishedLabel}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p data-news-empty="" className="rounded-2xl border border-[#e5e5e5] bg-white p-5 text-center text-[15px] text-[#404040]">
          ยังไม่มีประกาศ
        </p>
      )}

      <a data-news-portal="" href={view.links.portal} className="flex min-h-[44px] items-center justify-center rounded-xl border border-[#d4d4d4] bg-white px-4 text-[14px] font-semibold">
        ดูบิลและการชำระ
      </a>
    </div>
  );
}
