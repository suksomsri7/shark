"use client";

// EmailThread.tsx — เธรดจดหมายของผู้ติดต่อ 1 คน (ใบ C2.5b · ภาพ 08 กลาง) — `/app/sys/{id}/crm/emails/[threadKey]`
//
// 🔴 AUDIT-CLASS X6 — HTML ของจดหมายที่คนนอกร้านเขียนถูกแสดงใน `<iframe sandbox="">` เท่านั้น คือ **กล่องทึบที่ไม่ได้
//    ปลดสิทธิ์อะไรให้เลยสักข้อ** (ค่าว่าง = ปิดหมด): สคริปต์ในจดหมายไม่ทำงาน และต่อให้ทำงานก็อ่าน cookie/DOM ของแอปไม่ได้
//    เพราะเอกสารข้างในอยู่คนละต้นทาง · ห้ามเติมคำปลดสิทธิ์ใด ๆ ลงใน `sandbox` ของกล่องนี้เด็ดขาด
//    เนื้อ srcDoc มาจาก `renderInboundHtml` ที่คิดฝั่ง server แล้ว (ตัวตัดชุดเดียวกับตอนเก็บ) — ที่นี่ไม่ประกอบ HTML เอง
//    และไม่มี `dangerouslySetInnerHTML` ของเนื้อจดหมายที่ไหนเลย
// 🔴 รูปจากภายนอก **ปิดไว้ก่อน**: ผู้ส่งฝังรูปเพื่อรู้ว่าพนักงานเปิดอ่านเมื่อไหร่/จาก IP ไหนได้ ⇒ ต้องกด "แสดงรูป" เอง
// 🔴 AUDIT-CLASS X10: ไฟล์แนบไม่มี URL ติดมากับหน้า — กดแล้วจึงขอลิงก์ชั่วคราว (ผูกกับผู้ดูคนนี้ · หมดอายุ 15 นาที)
// 🔴 'use client' + ด่าน F2.3: ไม่ import โมดูล CRM — ทุกอย่างมาทาง props / server action ของหน้า

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  attachCrmEmailToContactAction,
  crmEmailAttachmentUrlAction,
  searchCrmEmailContactsAction,
} from "@/app/app/sys/[id]/crm/emails/actions";
import { EmailComposer } from "./EmailComposer";
import type { CrmEmailThreadData } from "./types";

export function EmailThread({ data }: { data: CrmEmailThreadData }) {
  const router = useRouter();
  const [showImages, setShowImages] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string }[]>([]);

  async function openAttachment(emailId: string, fileId: string) {
    if (busy) return;
    setBusy(true);
    const r = await crmEmailAttachmentUrlAction(data.systemId, emailId, fileId);
    setBusy(false);
    if (!r.ok) {
      setMsg({ ok: false, text: r.error });
      return;
    }
    setMsg(null);
    window.open(r.url, "_blank", "noopener,noreferrer");
  }

  async function search() {
    setBusy(true);
    const r = await searchCrmEmailContactsAction(data.systemId, q);
    setBusy(false);
    if (!r.ok) {
      setMsg({ ok: false, text: r.error });
      return;
    }
    setHits(r.items);
    if (r.items.length === 0) setMsg({ ok: true, text: "ไม่พบผู้ติดต่อที่ตรงกับคำค้นนี้ — ลองพิมพ์ชื่อหรืออีเมลบางส่วน" });
  }

  async function attach(contactId: string) {
    const first = data.messages[0];
    if (!first || busy) return;
    setBusy(true);
    const r = await attachCrmEmailToContactAction(data.systemId, first.id, contactId);
    setBusy(false);
    if (!r.ok) {
      setMsg({ ok: false, text: r.error });
      return;
    }
    setMsg({ ok: true, text: "ผูกจดหมายเข้ากับผู้ติดต่อแล้ว" });
    router.refresh();
  }

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="crm-email-thread-page">
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-[color:var(--color-muted)]" : "text-red-600"}`} role="status" data-testid="crm-email-thread-msg">
          {msg.text}
        </p>
      )}

      <section className="card flex min-w-0 flex-col gap-4 p-4">
        {data.messages.map((m) => {
          const on = showImages[m.id] === true;
          const html = on ? m.safeHtmlWithImages : m.safeHtmlNoImages;
          return (
            <article
              key={m.id}
              className={`flex min-w-0 flex-col gap-2 rounded-md border p-3 ${m.direction === "OUT" ? "bg-[color:var(--color-surface-2)] sm:ml-10" : "sm:mr-10"}`}
              data-message-id={m.id}
            >
              <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-[color:var(--color-muted)]">
                <span className="font-medium text-[color:var(--color-fg)]">{m.direction === "IN" ? "เข้า" : "ออก"}</span>
                <span className="truncate">{m.fromLabel}</span>
                <span>· {m.atLabel}</span>
                <span>· {m.statusLabel}</span>
                {m.direction === "OUT" && m.openCount > 0 && <span>· เปิด {m.openCount} ครั้ง</span>}
                {m.direction === "OUT" && m.clickCount > 0 && <span>· คลิก {m.clickCount}</span>}
                {m.repliedAtLabel && <span>· ลูกค้าตอบแล้ว {m.repliedAtLabel}</span>}
              </header>
              <p className="text-sm font-medium">{m.subject}</p>

              {m.purged && <p className="text-xs text-[color:var(--color-muted)]">เนื้อความถูกลบตามอายุการเก็บของร้านแล้ว (หัวข้อและผู้รับยังอยู่)</p>}

              {!m.purged && html && (
                <>
                  {m.hasRemoteImages && (
                    <div>
                      <button
                        type="button"
                        className="btn btn-ghost text-xs"
                        onClick={() => setShowImages((s) => ({ ...s, [m.id]: !on }))}
                        data-testid="crm-email-show-images"
                        data-message-id={m.id}
                      >
                        {on ? "ซ่อนรูปจากภายนอก" : "แสดงรูปในจดหมาย (ผู้ส่งจะรู้ว่าคุณเปิดอ่าน)"}
                      </button>
                    </div>
                  )}
                  {/* AUDIT-CLASS X6: จดหมายของคนนอกร้านอยู่ในกล่องทึบ — ไม่มีสคริปต์ ไม่มี same-origin */}
                  <iframe
                    title={`เนื้อจดหมาย ${m.subject}`}
                    sandbox=""
                    referrerPolicy="no-referrer"
                    className="min-h-40 w-full rounded border bg-white"
                    srcDoc={html}
                  />
                </>
              )}
              {!m.purged && !html && m.bodyText && <p className="whitespace-pre-wrap text-sm">{m.bodyText}</p>}

              {m.attachments.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {m.attachments.map((a) => (
                    <li key={a.fileId}>
                      <button
                        type="button"
                        className="btn btn-ghost text-xs"
                        disabled={busy}
                        onClick={() => void openAttachment(m.id, a.fileId)}
                        data-testid="crm-email-attachment"
                        data-file-id={a.fileId}
                      >
                        📎 {a.name} ({Math.max(1, Math.round(a.size / 1024))} KB)
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </section>

      {data.canAttach && (
        <section className="card flex min-w-0 flex-col gap-3 p-4" aria-labelledby="crm-email-attach-heading">
          <h2 id="crm-email-attach-heading" className="text-base font-semibold">
            จดหมายชุดนี้ยังไม่รู้ว่าเป็นของใคร <span className="text-xs font-normal text-[color:var(--color-muted)]">ค้นชื่อหรืออีเมลของผู้ติดต่อ แล้วกดผูกให้ถูกคน</span>
          </h2>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              type="search"
              className="input w-full sm:w-72"
              placeholder="ชื่อ หรืออีเมลของผู้ติดต่อ"
              aria-label="ค้นผู้ติดต่อเพื่อผูกจดหมาย"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="crm-email-attach-contact-q"
            />
            <button type="button" className="btn btn-ghost" disabled={busy || !q.trim()} onClick={() => void search()} data-testid="crm-email-attach-contact-go">
              ค้นหา
            </button>
          </div>
          {hits.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    disabled={busy}
                    onClick={() => void attach(h.id)}
                    data-testid="crm-email-attach-contact-pick"
                    data-contact-id={h.id}
                  >
                    ผูกกับ {h.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {data.canSend && data.contactId && <EmailComposer data={data} />}
      {!data.canSend && data.contactId && (
        <p className="text-sm text-[color:var(--color-muted)]">บัญชีนี้ยังไม่ได้รับสิทธิ์ส่งอีเมลในระบบ CRM — อ่านได้อย่างเดียว</p>
      )}

      {data.contactId && (
        <p className="text-sm">
          <Link className="underline" href={`/app/sys/${data.systemId}/crm/contacts/${data.contactId}`} data-testid="crm-email-thread-contact-link">
            เปิดหน้าผู้ติดต่อ {data.contactName ?? ""}
          </Link>
        </p>
      )}
    </div>
  );
}
