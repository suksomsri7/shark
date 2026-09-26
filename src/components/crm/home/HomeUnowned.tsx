"use client";

// HomeUnowned.tsx — บล็อก "ไม่มีเจ้าของ" บนหน้าแรก CRM (ใบ C3.2 · RESOLUTIONS R-A · พิมพ์เขียว §11.6) — เฉพาะคนที่มีคีย์ crm.deal.reassign
// ดีลเปิด + ผู้ติดต่อที่ยังใช้อยู่ ซึ่งผู้ดูแลว่าง หรือผู้ดูแลไม่ได้เป็นสมาชิกของร้านแล้ว · ปุ่มโอนดีลเป็นกลุ่มใช้ทางเดิม `deals.bulkReassign`
//   (server action `bulkReassignAction` ส่งมาทาง props — ไม่มีทางที่สอง) · การกระทำอันตราย (X9): ต้องติ๊กยืนยัน + เหตุผล ≥ 5 ตัวอักษร
// 🔴 ไฟล์ client: ไม่ import โมดูลที่ถึง prisma/โมดูล CRM — ข้อมูลและ action มาทาง props · error แสดงในบล็อก (ไม่ใช้ alert)
// 🔴 390 px: รายการเต็มความกว้าง · ช่องกรอกซ้อนกัน

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Fail = { ok: false; error: string };
export type HomeUnownedTransfer = (systemId: string, input: { ids: string[]; ownerUserId: string | null; confirm: boolean; reason: string }) => Promise<{ ok: true; done: number; failed: number } | Fail>;

const baht = (satang: number) => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;
const muted = "text-[color:var(--color-muted)]";

export function HomeUnowned({
  systemId,
  deals,
  contacts,
  moreDeals,
  moreContacts,
  owners,
  transfer,
}: {
  systemId: string;
  deals: { id: string; title: string; valueSatang: number }[];
  contacts: { id: string; name: string }[];
  moreDeals: boolean;
  moreContacts: boolean;
  owners: { id: string; name: string }[];
  transfer: HomeUnownedTransfer;
}) {
  const router = useRouter();
  const [owner, setOwner] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const base = `/app/sys/${systemId}/crm`;

  const submit = () => {
    setMsg(null);
    if (!owner) return setMsg({ ok: false, text: "เลือกผู้ดูแลคนใหม่ก่อน" });
    if (reason.trim().length < 5) return setMsg({ ok: false, text: "ใส่เหตุผลของการโอนอย่างน้อย 5 ตัวอักษร (เก็บไว้ในประวัติการแก้ไข)" });
    if (!confirm) return setMsg({ ok: false, text: "ติ๊กยืนยันก่อน — การโอนเป็นกลุ่มเปลี่ยนผู้ดูแลของทุกดีลในรายการนี้" });
    start(async () => {
      const r = await transfer(systemId, { ids: deals.map((d) => d.id), ownerUserId: owner, confirm: true, reason: reason.trim() });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.failed ? `โอนแล้ว ${r.done} ดีล · ยังโอนไม่ได้ ${r.failed} ดีล (ดูรายละเอียดที่ดีลนั้น)` : `โอนแล้ว ${r.done} ดีล` });
      setReason("");
      setConfirm(false);
      router.refresh();
    });
  };

  return (
    <section className="card flex min-w-0 flex-col gap-3 p-4" data-testid="crm-home-unowned">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-base font-semibold">ไม่มีเจ้าของ</h2>
        <p className={`text-xs ${muted}`}>ดีลเปิดและผู้ติดต่อที่ยังไม่มีผู้ดูแล หรือผู้ดูแลออกจากร้านไปแล้ว — โอนให้ทีมดูแลต่อ</p>
      </div>
      {deals.length === 0 && contacts.length === 0 ? (
        <p className={`text-sm ${muted}`}>ทุกดีลและผู้ติดต่อมีผู้ดูแลแล้ว</p>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className={`text-xs font-medium ${muted}`}>ดีลเปิด {deals.length.toLocaleString("th-TH")}{moreDeals ? "+" : ""}</h3>
            <ul className="flex min-w-0 flex-col divide-y">
              {deals.map((d) => (
                <li key={d.id}>
                  <Link href={`${base}/deals/${d.id}`} className="flex min-w-0 items-center justify-between gap-3 py-2 text-sm" data-testid={`crm-home-unowned-deal-${d.id}`}>
                    <span className="truncate">{d.title}</span>
                    <span className="shrink-0 tabular-nums">{baht(d.valueSatang)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className={`text-xs font-medium ${muted}`}>ผู้ติดต่อ {contacts.length.toLocaleString("th-TH")}{moreContacts ? "+" : ""}</h3>
            <ul className="flex min-w-0 flex-col divide-y">
              {contacts.map((c) => (
                <li key={c.id}>
                  <Link href={`${base}/contacts/${c.id}`} className="block truncate py-2 text-sm" data-testid={`crm-home-unowned-contact-${c.id}`}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {deals.length > 0 && (
        <div className="flex min-w-0 flex-col gap-2 border-t pt-3">
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              <span className={muted}>โอนดีลทั้งหมดในรายการให้</span>
              <select className="input" value={owner} onChange={(e) => setOwner(e.target.value)} data-testid="crm-home-unowned-owner">
                <option value="">เลือกผู้ดูแลคนใหม่</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              <span className={muted}>เหตุผล (บันทึกในประวัติ)</span>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="เช่น พนักงานลาออก โอนให้ทีมดูแลต่อ" data-testid="crm-home-unowned-reason" />
            </label>
          </div>
          <label className="flex min-w-0 items-start gap-2 text-xs">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="crm-home-unowned-confirm" />
            <span>ยืนยันโอนดีล {deals.length.toLocaleString("th-TH")} รายการ — ผู้ดูแลเดิมของแต่ละดีลจะถูกแทนที่</span>
          </label>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={pending} onClick={submit} data-testid="crm-home-unowned-submit">
              {pending ? "กำลังโอน…" : "โอนดีลเป็นกลุ่ม"}
            </button>
            {msg && (
              <p role="status" className={`min-w-0 text-sm ${msg.ok ? "" : "text-[color:var(--color-danger)]"}`} data-testid="crm-home-unowned-msg">
                {msg.text}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
