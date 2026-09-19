"use client";

// ChatCrmPanel.tsx — แผงข้าง "CRM" ในห้องแชท (ใบ C1.11 · พิมพ์เขียว §3.18 · ภาพ 26 ของสมาชิก + ปุ่ม 3)
// ฝังใน `src/lib/modules/chat/context-panel.tsx` ช่องเดียว (ต่อจากแผงสมาชิก) · ข้อมูลมาจาก `chat/crm-panel-actions.ts` เท่านั้น
// 🔴 ไฟล์ client: import ได้เฉพาะ server action ("use server" = ขอบเขต) + ชนิดข้อมูลบริสุทธิ์ — ไม่ลากโมดูลที่ถึง prisma
// 🔴 ร้านที่ยังไม่เปิด CRM ใหม่ / ผู้ดูไม่มีคีย์ CRM ⇒ `data: null` ⇒ แผงนี้ไม่เรนเดอร์อะไรเลย (หน้าแชทเดิมทุกอย่าง)
// 🔴 ไม่มีเบอร์/อีเมลในแผงนี้ (ข้อมูลติดต่ออยู่ในการ์ดโปรไฟล์ของแชทตามสิทธิ์ของแชทเอง)

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { createLeadFromChatAction, getChatCrmPanelAction, logActivityFromChatAction } from "@/lib/modules/chat/crm-panel-actions";
import { CHAT_CRM_ACTIVITY_TYPES, type ChatCrmPanelData } from "@/lib/modules/chat/crm-panel-shared";

const muted = "text-[color:var(--color-muted)]";
const LIFECYCLE: Record<string, string> = { LEAD: "ผู้สนใจ", PROSPECT: "มีโอกาส", CUSTOMER: "ลูกค้าแล้ว", LOST: "ไม่ไปต่อ", CHURNED: "เลิกเป็นลูกค้า" };
const BAND: Record<string, string> = { HOT: "ร้อน", WARM: "อุ่น", COLD: "เย็น" };
const baht = (satang: number) => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;

export function ChatCrmPanel({ conversationId }: { conversationId: string }) {
  const [data, setData] = useState<ChatCrmPanelData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  // SF-2: โหลดข้อมูล v2 สำเร็จอย่างน้อยครั้งหนึ่งแล้วหรือยัง — ยังไม่เคย + ผิดพลาด = ไม่แสดงอะไรเลย
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [type, setType] = useState<string>("NOTE");
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    const r = await getChatCrmPanelAction(conversationId);
    if (r.ok) {
      setData(r.data);
      setState("ready");
      if (r.data) setLoadedOnce(true);
    } else {
      setError(r.error);
      setState("error");
    }
  }, [conversationId]);

  useEffect(() => {
    setData(null);
    setState("loading");
    setError(null);
    setNotice(null);
    setLogOpen(false);
    setTitle("");
    void load();
  }, [load]);

  const createLead = () =>
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await createLeadFromChatAction(conversationId);
      if (!r.ok) return setError(r.error);
      setNotice(r.created ? "เพิ่มลูกค้ารายนี้เป็น lead ใน CRM แล้ว" : "ลูกค้ารายนี้อยู่ใน CRM อยู่แล้ว");
      await load();
    });

  const saveActivity = () =>
    start(async () => {
      setError(null);
      setNotice(null);
      if (!title.trim()) return setError("ใส่หัวข้อกิจกรรมก่อน");
      const r = await logActivityFromChatAction(conversationId, { type, title: title.trim() });
      if (!r.ok) return setError(r.error);
      setNotice("บันทึกกิจกรรมแล้ว");
      setTitle("");
      setLogOpen(false);
    });

  // ร้านยังไม่เปิด CRM ใหม่ / ไม่มีคีย์ CRM = ไม่มีแผงนี้ · กำลังโหลดครั้งแรกก็ไม่กันพื้นที่ (ไม่กระพริบ)
  if (state === "loading" || (state === "ready" && !data) || (state === "error" && !loadedOnce)) return null;

  return (
    <div className="card flex min-w-0 flex-col gap-3 p-4" data-testid="crm-chat-panel">
      <span className="font-semibold">CRM</span>
      {state === "error" && !data && (
        <div className="flex flex-col gap-1.5">
          <span className={`text-xs ${muted}`}>{error ?? "ยังโหลดข้อมูล CRM ไม่ได้ในตอนนี้"}</span>
          <button type="button" className="btn btn-ghost self-start text-sm" onClick={() => void load()} data-testid="crm-panel-retry">
            ลองอีกครั้ง
          </button>
        </div>
      )}
      {data && (
        <>
          {data.contact ? (
            <div className="flex min-w-0 flex-col gap-1">
              <Link href={`/app/sys/${data.systemId}/crm/contacts/${data.contact.id}`} className="truncate text-sm font-medium" data-testid="crm-panel-contact">
                {data.contact.name}
              </Link>
              <span className={`text-xs ${muted}`}>
                {LIFECYCLE[data.contact.lifecycleStage] ?? data.contact.lifecycleStage}
                {data.company ? ` · ${data.company.name}` : ""}
                {data.score ? ` · คะแนน ${data.score.value}${data.score.band ? ` (${BAND[data.score.band] ?? data.score.band})` : ""}` : ""}
              </span>
            </div>
          ) : data.contactState === "none" ? (
            <span className={`text-xs ${muted}`}>ลูกค้ารายนี้ยังไม่อยู่ใน CRM</span>
          ) : (
            <span className={`text-xs ${muted}`}>ไม่มีข้อมูล CRM ของลูกค้ารายนี้ที่บัญชีนี้เปิดดูได้</span>
          )}

          {data.openDeals.length > 0 && (
            <ul className="flex min-w-0 flex-col gap-1">
              {data.openDeals.map((d) => (
                <li key={d.id}>
                  <Link href={`/app/sys/${data.systemId}/crm/deals/${d.id}`} className="flex min-w-0 items-center justify-between gap-2 text-sm" data-testid="crm-panel-deal">
                    <span className="min-w-0 truncate">{d.title}</span>
                    <span className={`shrink-0 text-xs ${muted}`}>
                      {d.stageName} · {baht(d.valueSatang)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            {data.contact && data.can.openDeal && (
              <Link href={`/app/sys/${data.systemId}/crm/deals/new?contactId=${encodeURIComponent(data.contact.id)}`} className="btn btn-ghost text-sm" data-testid="crm-panel-open-deal">
                เปิดดีล
              </Link>
            )}
            {data.can.logActivity && (
              <button type="button" className="btn btn-ghost text-sm" disabled={pending} onClick={() => setLogOpen((v) => !v)} data-testid="crm-panel-log-activity">
                บันทึกกิจกรรม
              </button>
            )}
            {data.can.createLead && (
              <button type="button" className="btn btn-primary text-sm" disabled={pending} onClick={createLead} data-testid="crm-panel-create-lead">
                {pending ? "กำลังสร้าง…" : "สร้าง lead จากแชท"}
              </button>
            )}
          </div>

          {logOpen && (
            <div className="flex min-w-0 flex-col gap-2" data-testid="crm-panel-activity-form">
              <select value={type} onChange={(e) => setType(e.target.value)} className="input text-sm" data-testid="crm-panel-activity-type">
                {CHAT_CRM_ACTIVITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input text-sm" placeholder="เช่น ลูกค้าขอใบเสนอราคา" maxLength={200} data-testid="crm-panel-activity-title" />
              <button type="button" className="btn btn-primary self-end text-sm" disabled={pending} onClick={saveActivity} data-testid="crm-panel-activity-submit">
                {pending ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs text-[color:var(--color-danger)]" role="alert" data-testid="crm-panel-error">
              {error}
            </p>
          )}
          {notice && (
            <p className={`text-xs ${muted}`} role="status" data-testid="crm-panel-notice">
              {notice}
            </p>
          )}
        </>
      )}
    </div>
  );
}
