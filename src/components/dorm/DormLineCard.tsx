"use client";
// SVC D.9 ▸ การ์ด "ผูก LINE ผู้เช่า" (จอพนักงาน · ใบสั่ง §3.2) — ออกรหัสผูกห้อง + QR สำหรับพิมพ์ติดห้อง/แนบสัญญา · ปุ่มตั้งเมนูล่าง LINE ของหอ
//   รหัสแสดงครั้งเดียวหลังกด (ไม่เก็บ) · ผู้เช่าพิมพ์รหัสในแชท LINE ของหอ = ผูกห้อง (ใช้ได้ครั้งเดียว · อายุตามค่าตั้ง rooms.notify.linkCodeDays)
import { useState, useTransition } from "react";

type IssueOut = { ok: true; code: string; deepLink: string | null; expiresAt: string; qrSvgDataUrl: string } | { ok: false; code: string; reason: string };
type MenuOut = { ok: true; richMenuId: string; created: boolean } | { ok: false; code: string; reason: string };
type Props = { roomNumber: string; leaseStatus: string; canMenu: boolean; issue: () => Promise<IssueOut>; syncMenu: () => Promise<MenuOut> };

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const thDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(new Date(Date.parse(iso) + 7 * 3_600_000).toISOString());
  return m ? `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1] ?? ""} ${Number(m[1]) + 543}` : iso;
};

export default function DormLineCard({ roomNumber, leaseStatus, canMenu, issue, syncMenu }: Props) {
  const [code, setCode] = useState<IssueOut | null>(null);
  const [menu, setMenu] = useState<MenuOut | null>(null);
  const [pending, start] = useTransition();
  const live = leaseStatus === "ACTIVE" || leaseStatus === "NOTICE";
  return (
    <section data-dorm-line-card={roomNumber} className="flex flex-col gap-4 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4">
      <header>
        <h1 className="text-base font-bold">{`ผูก LINE ผู้เช่า · ห้อง ${roomNumber}`}</h1>
        <p className="text-xs text-[color:var(--color-muted)]">ผู้เช่าสแกน QR หรือพิมพ์รหัสในแชท LINE ของหอ เพื่อรับบิล ดูสัญญา และจ่ายผ่านลิงก์ส่วนตัว · รหัสใช้ได้ครั้งเดียว</p>
      </header>
      <button
        type="button"
        data-dorm-line-issue=""
        disabled={pending || !live}
        onClick={() => start(async () => setCode(await issue()))}
        className="min-h-[44px] rounded-xl bg-[color:var(--color-ink)] px-4 text-sm font-bold text-white disabled:opacity-50"
      >
        {code?.ok ? "ออกรหัสใหม่" : "ออกรหัสผูกห้อง"}
      </button>
      {!live ? <p className="text-xs text-[color:var(--color-muted)]">สัญญานี้ไม่อยู่ในสถานะที่ผูก LINE ได้</p> : null}
      {code && code.ok ? (
        <div data-dorm-line-code="" className="flex flex-col items-center gap-2 rounded-xl border border-[color:var(--color-line)] p-4 text-center print:border-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={code.qrSvgDataUrl} alt="QR ผูกห้องกับ LINE" width={180} height={180} className="h-[180px] w-[180px]" />
          <p className="font-mono text-2xl font-bold tracking-[0.3em]">{code.code}</p>
          <p className="text-xs text-[color:var(--color-muted)]">{`ห้อง ${roomNumber} · ใช้ได้ถึง ${thDate(code.expiresAt)}`}</p>
          <button type="button" onClick={() => window.print()} className="min-h-[40px] rounded-lg border border-[color:var(--color-line)] px-3 text-sm print:hidden">
            พิมพ์ QR
          </button>
        </div>
      ) : code && !code.ok ? (
        <p role="alert" className="text-sm text-[color:var(--color-danger,#b91c1c)]">{code.reason}</p>
      ) : null}
      {canMenu ? (
        <div className="flex flex-col gap-2 border-t border-[color:var(--color-line)] pt-3">
          <p className="text-xs text-[color:var(--color-muted)]">เมนูล่าง LINE ของหอ: บิลของฉัน · แจ้งซ่อม · ประกาศ · สัญญา/เอกสาร · พัสดุ · ติดต่อหอ</p>
          <button
            type="button"
            data-dorm-line-menu=""
            disabled={pending}
            onClick={() => start(async () => setMenu(await syncMenu()))}
            className="min-h-[44px] rounded-xl border border-[color:var(--color-line)] px-4 text-sm disabled:opacity-50"
          >
            ตั้งเมนู LINE ของหอ
          </button>
          {menu ? <p role="status" className="text-xs">{menu.ok ? (menu.created ? "ตั้งเมนูเรียบร้อยแล้ว" : "เมนูเป็นรุ่นล่าสุดอยู่แล้ว") : menu.reason}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
