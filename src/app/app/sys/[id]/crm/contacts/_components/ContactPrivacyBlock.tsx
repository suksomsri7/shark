"use client";

// ContactPrivacyBlock.tsx — PDPA บนหน้าผู้ติดต่อ 360 (CRM v2 · ใบ C3.9 · พิมพ์เขียว §11.7)
//   • ส่งออกข้อมูลของผู้ติดต่อนี้ (คำขอเข้าถึงข้อมูล) → ไฟล์ JSON (คีย์ crm.contact.export)
//   • ลบข้อมูลส่วนบุคคล (คำขอลบ) → การกระทำอันตราย: ติ๊กยืนยัน + เหตุผล ≥ 5 ตัวอักษร (X9 · คีย์ crm.contact.delete)
// 🔴 ไฟล์ client: import ได้เฉพาะ privacy-shared (บริสุทธิ์) + server actions — ไม่ลากโมดูลที่ถึง prisma
// 🔴 ข้อผิดพลาดแสดงในกล่อง (ไม่มี alert()) · ข้อความไทยไม่โทษผู้ใช้

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eraseContactAction, exportContactAction } from "@/lib/modules/crm/privacy-actions";
import { PRIVACY_REASON_MIN } from "@/lib/modules/crm/privacy-shared";

export function ContactPrivacyBlock({
  systemId,
  contactId,
  canExport,
  canErase,
  erased,
}: {
  systemId: string;
  contactId: string;
  canExport: boolean;
  canErase: boolean;
  erased: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"" | "export" | "erase">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!canExport && !canErase) return null;
  const reasonShort = reason.trim().length < PRIVACY_REASON_MIN;

  async function doExport() {
    setBusy("export");
    setMsg(null);
    const r = await exportContactAction(systemId, contactId);
    setBusy("");
    if (!r.ok) {
      setMsg({ ok: false, text: r.error });
      return;
    }
    const url = URL.createObjectURL(new Blob([r.json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = r.filename;
    a.click();
    URL.revokeObjectURL(url);
    if (!r.complete) {
      // CRM C5.5-fix9 (+ r2 review M1/I2): ไฟล์ไม่ใช่ข้อมูลทั้งหมดของเขา — บอกตรง ๆ ว่าเพราะอะไร (ในไฟล์มี `complete: false` + `truncated`/`scope` ด้วย)
      const parts: string[] = [];
      const cut = Object.entries(r.truncated).map(([t, n]) => `${t} ${n.exported.toLocaleString("th-TH")} จาก ${n.total.toLocaleString("th-TH")} แถว`);
      if (cut.length) parts.push(`บางตารางมีข้อมูลมากเกินกว่าจะใส่ในไฟล์เดียว ไฟล์จึงมีเฉพาะแถวใหม่สุด (${cut.join(" · ")})`);
      if (r.scope.limitedByRequesterVisibility) parts.push(`บางรายการอยู่นอกสิทธิ์การมองเห็นของบัญชีคุณจึงไม่อยู่ในไฟล์ (${(r.scope.withheldTables ?? []).join(" · ")}) — ถ้าต้องการไฟล์ที่ครบ ให้เจ้าของร้านเป็นผู้ส่งออก`);
      if (r.scope.mergedChainIncomplete) parts.push("ผู้ติดต่อที่ถูกรวมเข้ามามีจำนวนมากเกินเพดาน ไฟล์จึงยังไม่รวมทุกคน");
      setMsg({ ok: false, text: `ดาวน์โหลดไฟล์แล้ว แต่ไฟล์นี้ยังไม่ใช่ข้อมูลทั้งหมดของผู้ติดต่อนี้ — ${parts.join(" · ")} · แจ้งเจ้าของข้อมูลด้วยว่าไฟล์ไม่ครบ` });
      return;
    }
    setMsg({ ok: true, text: "ดาวน์โหลดไฟล์ข้อมูลของผู้ติดต่อนี้แล้ว — ส่งให้เจ้าของข้อมูลผ่านช่องทางที่ปลอดภัย" });
  }

  async function doErase() {
    if (!confirm || reasonShort) return;
    setBusy("erase");
    setMsg(null);
    const r = await eraseContactAction(systemId, contactId, { confirm, reason });
    setBusy("");
    if (!r.ok) {
      setMsg({ ok: false, text: r.error });
      return;
    }
    setOpen(false);
    setMsg({ ok: true, text: r.message });
    router.refresh();
  }

  return (
    <section className="card flex flex-col gap-2 p-4 text-sm" data-testid="contact-privacy">
      <h2 className="text-sm font-medium">ข้อมูลส่วนบุคคล (PDPA)</h2>
      {erased ? <p className="text-xs text-[color:var(--color-muted)]">ผู้ติดต่อนี้ถูกลบข้อมูลส่วนบุคคลแล้ว (คงไว้เฉพาะดีลและตัวเลขแบบไม่ระบุตัวตน)</p> : null}
      <div className="flex flex-wrap gap-2">
        {canExport ? (
          <button type="button" className="btn btn-ghost text-sm" disabled={busy !== ""} onClick={doExport} data-testid="contact-privacy-export">
            {busy === "export" ? "กำลังเตรียมไฟล์…" : "ส่งออกข้อมูลของผู้ติดต่อนี้"}
          </button>
        ) : null}
        {canErase && !erased ? (
          <button type="button" className="btn btn-ghost text-sm text-[color:var(--color-danger)]" disabled={busy !== ""} onClick={() => { setOpen((v) => !v); setMsg(null); }} data-testid="contact-privacy-erase">
            ลบข้อมูลส่วนบุคคล
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="flex flex-col gap-2 rounded border border-[color:var(--color-danger)] p-3" data-testid="contact-privacy-erase-panel" role="dialog" aria-label="ยืนยันการลบข้อมูลส่วนบุคคล">
          <p className="text-xs">
            ชื่อ เบอร์ อีเมล LINE โน้ต เนื้ออีเมล ไฟล์เสียง การเข้าชมเว็บ สิทธิ์พอร์ทัล และค่าฟิลด์ของผู้ติดต่อนี้จะถูกลบถาวร (ย้อนกลับไม่ได้) ·
            ดีล ยอดรับชำระ และคอมมิชชันยังอยู่แบบไม่ระบุตัวตน · ถ้าผูกกับสมาชิก สมาชิกคนนั้นจะถูกลบข้อมูลด้วย
          </p>
          <label className="flex flex-col gap-1 text-xs" htmlFor="contact-privacy-erase-reason">
            เหตุผล (อย่างน้อย {PRIVACY_REASON_MIN} ตัวอักษร)
            <textarea
              id="contact-privacy-erase-reason"
              className="input min-h-[64px]"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ลูกค้าขอลบข้อมูลทางอีเมลเมื่อวันที่ …"
              data-testid="contact-privacy-erase-reason"
            />
          </label>
          {reason.length > 0 && reasonShort ? <p className="text-xs text-[color:var(--color-danger)]">เหตุผลสั้นไป — พิมพ์อย่างน้อย {PRIVACY_REASON_MIN} ตัวอักษร</p> : null}
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="contact-privacy-erase-confirm" />
            ฉันเข้าใจว่าการลบนี้ย้อนกลับไม่ได้
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary text-sm" disabled={!confirm || reasonShort || busy !== ""} onClick={doErase} data-testid="contact-privacy-erase-submit">
              {busy === "erase" ? "กำลังลบ…" : "ลบถาวร"}
            </button>
            <button type="button" className="btn btn-ghost text-sm" disabled={busy !== ""} onClick={() => setOpen(false)} data-testid="contact-privacy-erase-cancel">
              ยกเลิก
            </button>
          </div>
        </div>
      ) : null}
      {msg ? (
        <p className={`text-xs ${msg.ok ? "text-[color:var(--color-muted)]" : "text-[color:var(--color-danger)]"}`} role={msg.ok ? "status" : "alert"} data-testid="contact-privacy-msg">
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
