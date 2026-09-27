"use client";

// CrmDealUnfurl.tsx — การ์ดของลิงก์ดีล CRM ที่วางในห้องแชททีม (ใบ C3.4 · addendum ข้อ 11)
//   ข้อความในห้องมี `/app/sys/<ระบบ>/crm/deals/<ดีล>` (เต็มหรือสัมพัทธ์) → การ์ด ชื่อดีล · ขั้น · มูลค่า · ผู้ดูแล/บริษัท → กดเปิดดีล
// 🔴 ผู้ดู = คนที่เปิดห้องอยู่ (session) — มองไม่เห็นดีล/ร้านอื่น/ไม่ใช่ลิงก์ดีล = ไม่แสดงอะไร (ไม่บอกว่ามีอยู่) · ไม่มีเบอร์/อีเมล/เลขภาษีในการ์ด
// 🔴 โมดูล MEETING ไม่ import CRM: คอมโพเนนต์นี้เรียก server action ใต้โฟลเดอร์ของ CRM (`_actions/ai.ts#unfurlDealLinksAction`) เอง
// 🔴 ไม่เกิน 3 การ์ดต่อข้อความ · 'use client' ไม่ import โมดูล CRM (F2.3)

import Link from "next/link";
import { useEffect, useState } from "react";
import { unfurlDealLinksAction } from "@/app/app/sys/[id]/crm/_actions/ai";

type Card = { dealId: string; systemId: string; title: string; stageName: string; valueSatang: number; ownerName: string | null; companyName: string | null; href: string };

const LINK_RE = /(?:https?:\/\/[^\s/]+)?\/app\/sys\/[A-Za-z0-9_-]{1,64}\/crm\/deals\/[A-Za-z0-9_-]{1,64}/g;
const baht = (satang: number) => `฿${(satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;

/** ลิงก์ดีลในข้อความ (ไม่ซ้ำ · ไม่เกิน 3) */
function dealLinksIn(body: string): string[] {
  return [...new Set(String(body ?? "").match(LINK_RE) ?? [])].slice(0, 3);
}

export function CrmDealUnfurl({ body }: { body: string }) {
  const [cards, setCards] = useState<Card[]>([]);
  useEffect(() => {
    const links = dealLinksIn(body);
    if (links.length === 0) return;
    let alive = true;
    // รีวิว C3.4 N5: action เดียวต่อข้อความ (ลิงก์ ≤ 3)
    void unfurlDealLinksAction(links)
      .catch(() => [])
      .then((rs) => {
        if (alive) setCards((rs as (Card | null)[]).filter((x): x is Card => !!x));
      });
    return () => {
      alive = false;
    };
  }, [body]);
  if (cards.length === 0) return null;
  return (
    <div className="mt-1 flex min-w-0 flex-col gap-1">
      {cards.map((c) => (
        <Link
          key={c.dealId}
          href={c.href}
          className="flex min-w-0 max-w-md flex-col gap-0.5 rounded-lg border px-3 py-2 text-sm hover:bg-[color:var(--color-accent-soft)]"
          data-testid="crm-deal-unfurl-card"
        >
          <span className="truncate font-semibold">{c.title}</span>
          <span className="truncate text-xs text-[color:var(--color-muted)]">
            ดีล CRM · {c.stageName} · {baht(c.valueSatang)}
            {c.companyName ? ` · ${c.companyName}` : ""}
            {c.ownerName ? ` · ผู้ดูแล ${c.ownerName}` : ""}
          </span>
        </Link>
      ))}
    </div>
  );
}
