"use client";

// MySendingCard.tsx — กล่อง "การส่งของฉัน" บนหน้ากล่องจดหมาย (ใบ C2.5b · รอบแก้ 2)
//
// 🔴 ทำไมต้องมี: ค่าทับรายคน (ชื่อผู้ส่ง · ที่อยู่รับคำตอบ · ลายเซ็น) มีผลกับจดหมายที่ **คนนี้** ส่งออกไป แต่ตาราง
//    ที่แก้ค่าพวกนี้อยู่บนหน้า `/crm/settings/email` ซึ่งเปิดได้เฉพาะคนที่ถือคีย์ `crm.email.settings` ⇒ พนักงานขาย
//    ที่ส่งจดหมายทุกวัน (คีย์ `crm.email.send`) ไม่มีทางแก้ค่าของตัวเองเลย ทั้งที่บริการรองรับ "แถวของตัวเอง"
//    อยู่แล้ว (`setUserSetting` ใช้คีย์ส่งอีเมลเมื่อ userId = ตัวเอง) — กล่องนี้คือทางเข้านั้น
// 🔴 แก้ได้แต่ "แถวของตัวเอง": action ถูกเรียกโดย **ไม่ส่ง userId** ⇒ บริการผูกกับ actor เอง (ไม่มีทางส่ง id
//    ของคนอื่นจากหน้านี้) · บริการยังตรวจคีย์/ร้าน/ระบบซ้ำอีกชั้นเสมอ
// 🔴 'use client' + ด่าน F2.3: ไม่ import โมดูล CRM — ป้าย/ทะเบียนโหมดมาทาง props · action มาจาก path ของหน้า
// 🔴 ตรวจค่าแบบ inline ในหน้า (ไม่มี alert()) · ข้อความไทยที่ไม่โทษผู้ใช้

import { useState } from "react";
import { saveCrmEmailUserSettingAction } from "@/app/app/sys/[id]/crm/emails/actions";
import type { CrmEmailMySendingData } from "./types";

export function MySendingCard({ data }: { data: CrmEmailMySendingData }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fromName, setFromName] = useState(data.fromName ?? "");
  const [replyToMode, setReplyToMode] = useState(data.replyToMode);
  const [replyToAddr, setReplyToAddr] = useState(data.replyToAddr ?? "");
  const [signature, setSignature] = useState(data.signatureHtml ?? "");

  async function save() {
    if (busy) return;
    if (replyToMode === "CUSTOM" && !replyToAddr.trim()) {
      setMsg({ ok: false, text: "เลือกโหมด \"กำหนดเอง\" แล้วต้องใส่ที่อยู่รับคำตอบด้วย — พิมพ์ในรูป name@example.com" });
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await saveCrmEmailUserSettingAction(data.systemId, {
      fromName: fromName.trim() ? fromName.trim() : null,
      replyToMode,
      replyToAddr: replyToAddr.trim() ? replyToAddr.trim() : null,
      signatureHtml: signature.trim() ? signature : null,
    });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "บันทึกการส่งของคุณแล้ว — จดหมายฉบับถัดไปที่คุณส่งจะใช้ค่านี้" } : { ok: false, text: r.error });
  }

  return (
    <section className="card flex min-w-0 flex-col gap-3 p-4" data-testid="crm-email-my-sending" aria-labelledby="crm-email-my-heading">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="crm-email-my-heading" className="text-base font-semibold">
          การส่งของฉัน{" "}
          <span className="text-xs font-normal text-[color:var(--color-muted)]">
            {data.userName}
            {data.userEmail ? ` · ${data.userEmail}` : ""}
          </span>
        </h2>
        <button type="button" className="btn btn-ghost ml-auto text-xs" onClick={() => setOpen(!open)} data-testid="crm-email-my-toggle">
          {open ? "ซ่อน" : "แก้ค่าของฉัน"}
        </button>
      </div>
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-[color:var(--color-muted)]" : "text-red-600"}`} role="status" data-testid="crm-email-my-msg">
          {msg.text}
        </p>
      )}
      {!data.allowUserOverride && (
        <p className="text-xs text-[color:var(--color-muted)]">
          ร้านนี้ปิดการทับค่ารายคนไว้ — บันทึกได้ แต่ระบบจะใช้ค่ากลางของร้านจนกว่าเจ้าของร้านจะเปิดให้
        </p>
      )}
      {open && (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="text-xs text-[color:var(--color-muted)]">ชื่อผู้ส่งที่ลูกค้าเห็น</span>
              <input type="text" className="input" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder={data.userName} data-testid="crm-email-my-fromname" />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="text-xs text-[color:var(--color-muted)]">ลูกค้าตอบกลับไปที่ไหน</span>
              <select className="input" value={replyToMode} onChange={(e) => setReplyToMode(e.target.value)} data-testid="crm-email-my-replyto-mode">
                {data.replyModes.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="text-xs text-[color:var(--color-muted)]">ที่อยู่รับคำตอบ (ใช้เมื่อเลือกกำหนดเอง)</span>
              <input type="email" className="input" value={replyToAddr} onChange={(e) => setReplyToAddr(e.target.value)} placeholder="name@example.com" data-testid="crm-email-my-replyto-addr" />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="text-xs text-[color:var(--color-muted)]">ลายเซ็นท้ายจดหมาย</span>
              <textarea className="input min-h-20" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="ชื่อ · ตำแหน่ง · เบอร์ติดต่อ" data-testid="crm-email-my-signature" />
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-primary text-sm" disabled={busy} onClick={() => void save()} data-testid="crm-email-my-save">
              {busy ? "กำลังบันทึก…" : "บันทึกการส่งของฉัน"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
