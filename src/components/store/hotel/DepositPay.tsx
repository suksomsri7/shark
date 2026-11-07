"use client";
// SVC H.8 ▸ จ่ายมัดจำ (ภาพ 16 ข) — QR พร้อมเพย์ยอดล็อก · แนบสลิป (ส่งไฟล์ไป route สลิปของหน้า · ไฟล์ส่วนตัว ≤ 5 MB) · เช็กสถานะทุก 5 วิ
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type DepositPayLabels = { amount: string; note: string; attach: string; sent: string; bad: string; noReceiver: string };

export function DepositPay(props: { qrSvgDataUrl: string | null; slipUrl: string; slipState: "none" | "sent" | "bad"; labels: DepositPayLabels; pollMs?: number }) {
  const router = useRouter();
  const L = props.labels;
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [idem] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`));
  useEffect(() => {
    const t = setInterval(() => router.refresh(), props.pollMs ?? 5000);
    return () => clearInterval(t);
  }, [router, props.pollMs]);
  return (
    <div className="flex flex-col gap-3" data-deposit-pay="">
      <div className="flex flex-col items-center gap-2 rounded-[18px] border border-[color:var(--color-line)] px-4 py-5">
        {props.qrSvgDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.qrSvgDataUrl} alt="PromptPay QR" className="h-[180px] w-[180px] rounded-xl" />
        ) : (
          <div className="px-2 py-6 text-center text-sm text-[color:var(--color-muted)]">{L.noReceiver}</div>
        )}
        <div className="text-[26px] font-bold tabular-nums">{L.amount}</div>
        <div className="text-center text-xs text-[color:var(--color-muted)]">{L.note}</div>
        {props.slipState === "sent" ? <div className="text-center text-sm font-semibold">{L.sent}</div> : null}
        {props.slipState === "bad" ? <div className="text-center text-sm text-[color:var(--color-danger)]">{L.bad}</div> : null}
      </div>
      <form ref={formRef} method="post" action={props.slipUrl} encType="multipart/form-data">
        <input type="hidden" name="idempotencyKey" value={idem} />
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={() => {
            if (fileRef.current?.files?.length) formRef.current?.submit();
          }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-primary min-h-[52px] w-full rounded-2xl text-base font-bold">
          {L.attach}
        </button>
      </form>
    </div>
  );
}
