"use client";
// SVC D.9 ▸ หน้าจ่าย/พอร์ทัลผู้เช่า (ภาพ หอ 05 ข · มือถือ 390) — สัญญา DOM ledger/svc-briefs/svc-brief-d.9.md §4
//   ไม่มีเบอร์ · ชื่อผู้เช่า · id สัญญา (ลิงก์ส่งต่อได้) · ไม่มีปุ่ม/คำที่ผิดกฎหมายเช่า · ลิงก์ใช้ <a> · renderToStaticMarkup ได้
import { useActionState, useEffect, useState } from "react";
import type { PortalBillState, PortalView } from "@/lib/platform/dorm-portal";

type Props = { view: PortalView; token: string; action: (prev: unknown, fd: FormData) => Promise<unknown> };

const money = (satang: number): string => {
  const a = Math.abs(Math.trunc(satang));
  return `${satang < 0 ? "-" : ""}${Math.trunc(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`;
};
const baht = (satang: number): string => (satang < 0 ? `-฿${money(-satang)}` : `฿${money(satang)}`);
const STATE_TH: Record<PortalBillState, string> = { UNPAID: "ยังไม่ชำระ", PARTIAL: "ชำระบางส่วน", PENDING_REVIEW: "รอตรวจสลิป", PAID: "ชำระแล้ว" };
const newKey = (): string => `k${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;

type ActionOut = { ok?: boolean; reason?: string } | null;
const outOf = (v: unknown): ActionOut => (v && typeof v === "object" ? (v as ActionOut) : null);

export default function DormPortal({ view, token, action }: Props) {
  void token;
  const b = view.bill;
  // คีย์กันส่งซ้ำ: สร้างครั้งเดียวต่อการเปิดฟอร์มฝั่งเบราว์เซอร์ (ไม่สุ่มตอน SSR — กัน hydration ไม่ตรง)
  const [idemKey, setIdemKey] = useState("");
  const [state, formAction, pending] = useActionState(action, null);
  // W8: คีย์ใหม่หลังได้ผลทุกครั้ง (สำเร็จ/ล้ม) — ส่งรูปใหม่จึงไม่ชนคีย์เดิม · ระหว่างยังไม่มีคีย์ ปุ่มกดไม่ได้
  useEffect(() => setIdemKey(newKey()), [state]);
  const out = outOf(state);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!view.pay) return;
    void navigator.clipboard?.writeText(view.pay.promptpayId).then(() => setCopied(true)).catch(() => setCopied(false));
  };

  return (
    <div data-dorm-portal="" data-state={b ? b.state : "NONE"} className="mx-auto flex w-full max-w-[480px] flex-col gap-4 px-4 py-5 text-[#0a0a0a]">
      <header className="flex items-baseline justify-between gap-3 border-b border-[#e5e5e5] pb-3">
        <h1 className="text-[18px] font-bold">{`บิลห้อง ${view.roomNumber}`}</h1>
        <span className="truncate text-[13px] text-[#737373]">{view.unitName}</span>
      </header>

      {!b ? (
        <p className="rounded-2xl border border-[#e5e5e5] bg-white p-5 text-center text-[15px] text-[#404040]">ยังไม่มีบิลของห้องนี้</p>
      ) : (
        <>
          <section data-portal-bill={b.periodKey} className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
            <p className="text-[12px] text-[#737373]">{`บิลค่าเช่า · ห้อง ${view.roomNumber}${b.docNo ? ` · ${b.docNo}` : ""}`}</p>
            <p className="text-[16px] font-bold">{`รอบ ${b.periodLabel}`}</p>
            <ul className="mt-3 flex flex-col gap-1.5 border-t border-[#e5e5e5] pt-3 text-[14px]">
              {b.lines.map((l, i) => (
                <li key={`${l.code}-${i}`} data-portal-line={l.code} className="flex justify-between gap-3">
                  <span className="text-[#404040]">{l.detail ? `${l.labelTh} ${l.detail}` : l.labelTh}</span>
                  <span className="tabular-nums">{money(l.amountSatang)}</span>
                </li>
              ))}
              {b.adjustments.map((a, i) => (
                <li key={`adj-${i}`} data-portal-adjust={a.kind} className="flex justify-between gap-3">
                  <span className="text-[#404040]">{`${a.kind === "CREDIT" ? "ใบลดหนี้" : "ใบเพิ่มหนี้"}${a.docNo ? ` ${a.docNo}` : ""}`}</span>
                  <span className="tabular-nums">{money(a.kind === "CREDIT" ? -a.amountSatang : a.amountSatang)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-[#e5e5e5] pt-3 text-[14px]">
              <span className="text-[#404040]">ยอดบิล</span>
              <span data-portal-total="" className="tabular-nums">{baht(b.totalSatang)}</span>
            </div>
            {b.paidSatang > 0 ? (
              <div className="flex justify-between text-[14px]">
                <span className="text-[#404040]">ชำระแล้ว</span>
                <span className="tabular-nums">{baht(b.paidSatang)}</span>
              </div>
            ) : null}
            <div className="mt-1 flex justify-between text-[16px] font-bold">
              <span>ยอดชำระ</span>
              <span data-portal-outstanding="" className="tabular-nums">{baht(b.outstandingSatang)}</span>
            </div>
            {b.dueLabel ? (
              <p data-portal-due="" className="mt-1 text-[12px] text-[#737373]">{`ครบกำหนด ${b.dueLabel}`}</p>
            ) : null}
          </section>

          {view.pay ? (
            <section data-portal-pay="" className="flex flex-col items-center gap-3 rounded-2xl border border-[#e5e5e5] bg-white p-4 text-center">
              <p className="text-[13px] text-[#737373]">สแกนจ่ายด้วยแอปธนาคารใดก็ได้</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img data-portal-qr="" src={view.pay.qrSvgDataUrl} alt="QR พร้อมเพย์" width={200} height={200} className="h-[200px] w-[200px]" />
              <p data-portal-pay-amount="" className="text-[28px] font-bold tabular-nums">{baht(view.pay.amountSatang)}</p>
              <p className="text-[12px] text-[#737373]">{`พร้อมเพย์ ${view.pay.receiverName} · ยอดล็อกตรงบิล`}</p>
              <div className="grid w-full grid-cols-2 gap-2">
                <a data-portal-save-qr="" href={view.pay.qrSvgDataUrl} download={`qr-${view.roomNumber}-${b.periodKey}.svg`} className="flex min-h-[44px] items-center justify-center rounded-xl border border-[#e5e5e5] text-[14px]">
                  บันทึก QR
                </a>
                <button type="button" data-portal-copy-promptpay="" onClick={copy} className="min-h-[44px] rounded-xl border border-[#e5e5e5] text-[14px]">
                  {copied ? "คัดลอกแล้ว" : "คัดลอกเลขพร้อมเพย์"}
                </button>
              </div>
            </section>
          ) : null}

          {view.can.uploadSlip ? (
            <form data-portal-slip-form="" action={formAction} className="flex flex-col gap-2 rounded-2xl border border-[#e5e5e5] bg-white p-4">
              <input type="hidden" name="billId" value={b.billId} />
              <input type="hidden" name="idempotencyKey" value={idemKey} />
              <label className="text-[13px] text-[#404040]" htmlFor="portal-slip">รูปสลิปการโอน (JPG / PNG / WEBP)</label>
              <input id="portal-slip" type="file" name="slip" accept="image/jpeg,image/png,image/webp" required className="text-[14px]" />
              <button type="submit" disabled={pending || !idemKey} className="min-h-[48px] rounded-xl bg-[#0a0a0a] text-[15px] font-bold text-white disabled:opacity-60">
                {pending ? "กำลังส่ง…" : "แนบสลิปการโอน"}
              </button>
              {out ? (
                <p role="status" className={`text-[13px] ${out.ok ? "text-[#1d4ed8]" : "text-[#b91c1c]"}`}>
                  {out.ok ? "ได้รับสลิปแล้ว รอตรวจ" : (out.reason ?? "ส่งสลิปไม่สำเร็จ")}
                </p>
              ) : null}
            </form>
          ) : null}

          {b.state === "PAID" ? (
            <section data-portal-status="PAID" className="flex flex-col items-center gap-2 rounded-2xl border border-[#e5e5e5] bg-white p-5 text-center">
              <p className="text-[18px] font-bold">ชำระแล้ว ขอบคุณค่ะ</p>
              {view.links.receipt ? (
                <a data-portal-receipt="" href={view.links.receipt} className="text-[14px] text-[#1d4ed8] underline">
                  ดูใบเสร็จ
                </a>
              ) : null}
            </section>
          ) : b.state === "PENDING_REVIEW" ? (
            <section data-portal-status="PENDING_REVIEW" className="rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-4 text-center text-[15px]">
              ได้รับสลิปแล้ว รอตรวจ
            </section>
          ) : (
            <p data-portal-status={b.state} className="text-center text-[13px] text-[#737373]">{STATE_TH[b.state]}</p>
          )}
          {b.state !== "PAID" && view.links.receipt ? (
            <a data-portal-receipt="" href={view.links.receipt} className="text-center text-[13px] text-[#1d4ed8] underline">
              ดูหลักฐานการรับชำระ
            </a>
          ) : null}
        </>
      )}

      {view.history.length ? (
        <section data-portal-history="" className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
          <h2 className="mb-2 text-[14px] font-bold">บิลย้อนหลัง</h2>
          <ul className="flex flex-col divide-y divide-[#e5e5e5]">
            {view.history.map((h) => (
              <li key={h.billId} data-portal-history-row={h.periodKey}>
                <a href={`${view.links.self}?bill=${h.billId}`} className={`flex min-h-[44px] items-center justify-between gap-3 text-[14px] ${h.current ? "font-bold" : ""}`}>
                  <span>{h.periodLabel}</span>
                  <span className="text-[12px] text-[#737373]">{STATE_TH[h.state]}</span>
                  <span className="tabular-nums">{baht(h.outstandingSatang > 0 ? h.outstandingSatang : h.totalSatang)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <a data-portal-lease="" href={view.links.lease} className="flex min-h-[44px] items-center justify-center rounded-xl border border-[#e5e5e5] bg-white text-[14px]">
        สัญญาและเอกสารของห้อง
      </a>
    </div>
  );
}
