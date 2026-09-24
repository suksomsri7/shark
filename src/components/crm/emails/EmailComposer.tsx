"use client";

// EmailComposer.tsx — ช่องเขียนจดหมายท้ายเธรด (ใบ C2.5b · ภาพ 08 กลาง ล่าง)
//   แม่แบบ · หัวข้อ · เนื้อความ · ไฟล์แนบ · ตั้งเวลาส่ง · ปุ่มส่ง (ตอบในเธรดเดิมเสมอเมื่อเปิดจากเธรด)
//
// 🔴 'use client' + ด่าน F2.3: ไม่ import โมดูล CRM — เรียก server action ผ่าน path ของหน้า (`…/crm/emails/actions`)
// 🔴 ตรวจค่าแบบ inline ในหน้า (ไม่มี alert()) · ข้อความไทยที่ไม่โทษผู้ใช้
// 🔴 ไฟล์แนบอ่านเป็น base64 ที่เบราว์เซอร์แล้วส่งให้ action — เพดานชนิด/ขนาด/จำนวนตัดสินที่บริการอีกชั้นเสมอ
//    (ที่นี่กันแต่เนิ่น ๆ เพื่อไม่ให้ผู้ใช้รอส่งไฟล์ 11 MB ขึ้นไปแล้วค่อยโดนปฏิเสธ)
// 🔴 "ตั้งเวลาส่ง" ว่าง = ส่งทันที · มีค่า = คิวไว้ (งานรายนาที `crm.email.scheduled` เป็นคนส่งเมื่อถึงเวลา)

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { getCrmEmailTemplateAction, sendCrmEmailAction } from "@/app/app/sys/[id]/crm/emails/actions";
import type { CrmEmailThreadData } from "./types";

const readAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read"));
    r.onload = () => resolve(String(r.result ?? "").split(",")[1] ?? "");
    r.readAsDataURL(file);
  });

export function EmailComposer({ data }: { data: CrmEmailThreadData }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [subject, setSubject] = useState(data.subject.replace(/^\s*(?:re|ตอบ)\s*:\s*/i, "") ? `ตอบ: ${data.subject.replace(/^\s*(?:re|ตอบ)\s*:\s*/i, "")}` : "");
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [schedule, setSchedule] = useState("");
  const [to, setTo] = useState(data.contactEmail ?? "");

  async function pickTemplate(id: string) {
    setTemplateId(id);
    if (!id) return;
    setBusy(true);
    const r = await getCrmEmailTemplateAction(data.systemId, id);
    setBusy(false);
    if (r.ok) {
      setSubject(r.subject);
      setBody(r.bodyHtml.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]*>/g, "").trim());
      setMsg(null);
    } else {
      setMsg({ ok: false, text: r.error });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!subject.trim()) {
      setMsg({ ok: false, text: "ใส่หัวข้อจดหมายก่อนส่ง — ลูกค้าเห็นหัวข้อก่อนเปิดอ่านเสมอ" });
      return;
    }
    if (!body.trim()) {
      setMsg({ ok: false, text: "ยังไม่มีเนื้อความ — พิมพ์ข้อความที่จะส่งถึงลูกค้าก่อน" });
      return;
    }
    const files = Array.from(fileRef.current?.files ?? []);
    if (files.length > data.attachMaxCount) {
      setMsg({ ok: false, text: `แนบไฟล์ได้ไม่เกิน ${data.attachMaxCount} ไฟล์ต่อจดหมาย 1 ฉบับ — เอาบางไฟล์ออกหรือส่งแยกฉบับ` });
      return;
    }
    // 🔴 เพดานของ "ช่องเขียนจดหมายบนหน้าจอ" ต่ำกว่าเพดานของบริการโดยเจตนา (8 MB vs 10 MB): ไฟล์ถูกส่งเป็น
    //    base64 ไปกับ server action ⇒ ขนาดที่วิ่งจริงโตขึ้น 4/3 เท่า และ `serverActions.bodySizeLimit` = 12 MB
    //    ⇒ ไฟล์ 10 MB (base64 ≈ 13.3 MB) ถูกตัดที่ชั้นเฟรมเวิร์กก่อนถึงโค้ดเรา = ผู้ใช้เห็นหน้าพังแบบไม่มีคำอธิบาย
    //    ข้อความจึงต้องบอกตัวเลขที่ใช้จริงบนหน้านี้ ไม่ใช่ตัวเลขของบริการ
    const over = files.find((f) => f.size > data.composerMaxBytes);
    if (over) {
      setMsg({
        ok: false,
        text: `ไฟล์ "${over.name}" ใหญ่ ${(over.size / (1024 * 1024)).toFixed(1)} MB — แนบจากหน้านี้ได้ไฟล์ละไม่เกิน ${Math.round(data.composerMaxBytes / (1024 * 1024))} MB ย่อขนาดไฟล์หรือส่งเป็นลิงก์ดาวน์โหลดแทน`,
      });
      return;
    }
    const totalBytes = files.reduce((n, f) => n + f.size, 0);
    if (totalBytes > data.composerMaxBytes) {
      setMsg({
        ok: false,
        text: `ไฟล์แนบรวมกัน ${(totalBytes / (1024 * 1024)).toFixed(1)} MB — จดหมาย 1 ฉบับจากหน้านี้แนบรวมได้ไม่เกิน ${Math.round(data.composerMaxBytes / (1024 * 1024))} MB แยกส่งหลายฉบับหรือส่งเป็นลิงก์ดาวน์โหลดแทน`,
      });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const attachments = await Promise.all(
        files.map(async (f) => ({ filename: f.name, contentType: f.type || "application/octet-stream", base64: await readAsBase64(f) })),
      );
      const paragraphs = body
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`)
        .join("");
      const r = await sendCrmEmailAction(data.systemId, {
        contactId: data.contactId ?? "",
        ...(to.trim() ? { to: [to.trim()] } : {}),
        subject: subject.trim(),
        bodyHtml: paragraphs,
        ...(schedule ? { scheduledAt: new Date(schedule).toISOString() } : {}),
        ...(data.replyToEmailId ? { replyToEmailId: data.replyToEmailId } : {}),
        ...(attachments.length ? { attachments } : {}),
      });
      if (!r.ok) {
        setMsg({ ok: false, text: r.error });
        return;
      }
      setBody("");
      setSchedule("");
      setTemplateId("");
      if (fileRef.current) fileRef.current.value = "";
      setMsg({ ok: true, text: r.status === "QUEUED" ? "ตั้งเวลาส่งเรียบร้อย — ระบบจะส่งให้เองเมื่อถึงเวลา" : "ส่งจดหมายแล้ว" });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "อ่านไฟล์แนบไม่สำเร็จ — เลือกไฟล์ใหม่แล้วลองอีกครั้ง" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card flex min-w-0 flex-col gap-3 p-4" onSubmit={submit} data-testid="crm-email-composer">
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-[color:var(--color-muted)]" : "text-red-600"}`} role="status" data-testid="crm-email-composer-msg">
          {msg.text}
        </p>
      )}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-xs text-[color:var(--color-muted)]">ถึง</span>
          <input type="email" className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" data-testid="crm-email-to" />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-xs text-[color:var(--color-muted)]">แม่แบบจดหมาย</span>
          <select className="input" value={templateId} onChange={(e) => void pickTemplate(e.target.value)} disabled={busy} data-testid="crm-email-template">
            <option value="">— ไม่ใช้แม่แบบ —</option>
            {data.templates.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="text-xs text-[color:var(--color-muted)]">หัวข้อ</span>
        <input
          type="text"
          className="input"
          maxLength={data.subjectMax}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          data-testid="crm-email-subject"
        />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="text-xs text-[color:var(--color-muted)]">เนื้อความ</span>
        <textarea
          className="input min-h-28"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="เรียนคุณลูกค้า …"
          data-testid="crm-email-body"
        />
      </label>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-xs text-[color:var(--color-muted)]">
            ไฟล์แนบ (สูงสุด {data.attachMaxCount} ไฟล์ · รวมกันไม่เกิน {Math.round(data.composerMaxBytes / (1024 * 1024))} MB)
          </span>
          <input type="file" multiple className="input" ref={fileRef} data-testid="crm-email-attach" />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-xs text-[color:var(--color-muted)]">ตั้งเวลาส่ง (เว้นว่าง = ส่งทันที)</span>
          <input type="datetime-local" className="input" value={schedule} onChange={(e) => setSchedule(e.target.value)} data-testid="crm-email-schedule" />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy} data-testid="crm-email-send">
          {busy ? "กำลังส่ง…" : schedule ? "ตั้งเวลาส่ง" : "ส่งจดหมาย"}
        </button>
      </div>
    </form>
  );
}
