"use client";

// EmailInbox.tsx — กล่องจดหมายของ CRM v2 (ใบ C2.5b · ภาพ 08 กลาง) — `/app/sys/{id}/crm/emails`
//   รายการเธรด (ผู้ติดต่อ · หัวข้อ · ข้อความย่อ · เวลา) + แท็บ "ยังไม่จับคู่" + ช่องค้นหัวข้อ
//
// 🔴 'use client' + ด่าน F2.3: ไฟล์นี้ไม่ import โมดูล CRM เลย (แม้ไฟล์ `*-shared`) — ข้อมูลและป้ายทุกตัวมาทาง props
//    จากหน้า server · การค้น/สลับกล่องเปลี่ยนแค่ query string (หน้า server เป็นคนอ่านของใหม่)
// 🔴 แท็บ "ยังไม่จับคู่" ขึ้นเฉพาะคนที่เปิดได้จริง (เห็นผู้ติดต่อทั้งระบบ หรือผู้จัดการ/เจ้าของร้าน) — ไม่โชว์ลิงก์ตาย
// 🔴 กว้าง 1440 และ 390 ไม่มีแถบเลื่อนแนวนอนของทั้งหน้า (ทุกความกว้างคงที่มีคำนำหน้า sm:)

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MySendingCard } from "./MySendingCard";
import type { CrmEmailInboxData } from "./types";

export function EmailInbox({ data }: { data: CrmEmailInboxData }) {
  const router = useRouter();
  const [q, setQ] = useState(data.q);
  const base = `/app/sys/${data.systemId}/crm/emails`;
  const go = (box: "all" | "unmatched", query: string) => {
    const p = new URLSearchParams();
    if (box === "unmatched") p.set("box", "unmatched");
    if (query.trim()) p.set("q", query.trim());
    router.push(p.toString() ? `${base}?${p.toString()}` : base);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="crm-emails-page">
      <section className="card flex min-w-0 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`btn ${data.box === "all" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => go("all", q)}
            data-testid="crm-emails-tab-all"
          >
            จดหมายทั้งหมด
          </button>
          {data.canSeeUnmatched && (
            <button
              type="button"
              className={`btn ${data.box === "unmatched" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => go("unmatched", q)}
              data-testid="crm-emails-tab-unmatched"
            >
              ยังไม่จับคู่
            </button>
          )}
          <form
            className="ml-auto flex min-w-0 items-center gap-2"
            data-testid="crm-emails-search-form"
            onSubmit={(e) => {
              e.preventDefault();
              go(data.box, q);
            }}
          >
            <input
              type="search"
              className="input w-full sm:w-64"
              placeholder="ค้นจากหัวข้อจดหมาย"
              aria-label="ค้นจากหัวข้อจดหมาย"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="crm-emails-search"
            />
            <button type="submit" className="btn btn-ghost shrink-0" data-testid="crm-emails-search-go">
              ค้นหา
            </button>
          </form>
        </div>

        <ul className="divide-y" data-testid="crm-emails-inbox">
          {data.items.length === 0 && (
            <li className="p-4 text-sm text-[color:var(--color-muted)]">
              {data.box === "unmatched"
                ? "ยังไม่มีจดหมายที่ระบบจับคู่กับผู้ติดต่อไม่ได้ — ดีแล้ว จดหมายที่เข้ามาทุกฉบับมีเจ้าของ"
                : "ยังไม่มีจดหมายในกล่องนี้ — จดหมายที่ลูกค้าตอบกลับมาที่อยู่ของร้านจะมาโผล่ที่นี่เอง"}
            </li>
          )}
          {data.items.map((t) => (
            <li key={t.threadKey}>
              {/* ชื่อ testid ซ้ำได้ทุกแถวตามสัญญาของข้อสอบ — แยกแถวด้วย `data-thread-key` และ href ที่ไม่ซ้ำ */}
              <Link
                href={`${base}/${encodeURIComponent(t.threadKey)}`}
                className="flex min-w-0 flex-col gap-1 p-3 hover:bg-[color:var(--color-surface-2)] sm:flex-row sm:items-center sm:gap-3"
                data-testid="crm-emails-thread-row"
                data-thread-key={t.threadKey}
              >
                <span className="flex min-w-0 items-center gap-2 sm:w-52">
                  {t.unread && <span aria-label="ยังไม่ได้อ่าน" className="size-2 shrink-0 rounded-full bg-sky-500" />}
                  <span className="truncate text-sm font-medium">{t.contactName ?? "ยังไม่รู้ว่าเป็นของใคร"}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{t.subject}</span>
                  {t.snippet && <span className="block truncate text-xs text-[color:var(--color-muted)]">{t.snippet}</span>}
                </span>
                <span className="shrink-0 text-xs text-[color:var(--color-muted)]">
                  {t.direction === "IN" ? "เข้า" : "ออก"} · {t.count} ฉบับ · {t.lastAtLabel}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {data.total > data.items.length && (
          <p className="text-xs text-[color:var(--color-muted)]">แสดง {data.items.length} จาก {data.total} เธรด — ใช้ช่องค้นหาเพื่อแคบลง</p>
        )}
      </section>

      {/* คนที่ส่งจดหมายได้ แก้ค่าการส่ง "ของตัวเอง" ได้จากที่นี่ (หน้าตั้งค่าอีเมลของร้านเปิดได้เฉพาะคนที่มีคีย์ตั้งค่า) */}
      {data.mySending && <MySendingCard data={data.mySending} />}
    </div>
  );
}
