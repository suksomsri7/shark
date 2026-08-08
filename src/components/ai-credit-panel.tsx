"use client";

import { useState, useTransition } from "react";
import { startTopUpAction } from "@/lib/ai/credit-actions";
import type { TopUpPack } from "@/lib/ai/topup";

// กล่องยอดคงเหลือ + ปุ่มเติมเครดิต
// กดแพ็กเกจ → server สร้างรายการกับ Beam → พาไปหน้ากรอกบัตร (เครดิตเข้าเมื่อ webhook ยืนยัน)
export function AiCreditPanel({
  balanceUsd,
  balanceMicro,
  packs,
  thbPerUsd,
  payEnabled,
  isOwner,
}: {
  balanceUsd: string;
  balanceMicro: number;
  packs: TopUpPack[];
  thbPerUsd: number;
  payEnabled: boolean;
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const empty = balanceMicro <= 0;
  const low = !empty && balanceMicro < 1_000_000; // ต่ำกว่า $1

  function buy(packId: string) {
    setError(null);
    startTransition(async () => {
      const res = await startTopUpAction(packId);
      if (res.ok) window.location.assign(res.url);
      else setError(res.message);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3">
        <div className="text-xs text-[color:var(--color-muted)]">เครดิตคงเหลือ</div>
        <div className="flex flex-wrap items-baseline gap-3">
          <span
            className={`text-4xl font-extrabold tabular-nums ${
              empty ? "text-[color:var(--color-danger)]" : ""
            }`}
          >
            {balanceUsd}
          </span>
          <span className="text-sm text-[color:var(--color-muted)]">
            ≈ {Math.round((balanceMicro / 1_000_000) * thbPerUsd).toLocaleString("th-TH")} บาท
          </span>
        </div>

        {empty && (
          <p className="text-sm text-[color:var(--color-danger)]">
            เครดิตหมดแล้ว — ผู้ช่วย AI หยุดทำงานชั่วคราวจนกว่าจะเติม
          </p>
        )}
        {low && (
          <p className="text-sm text-[color:var(--color-warning,#b45309)]">
            เครดิตใกล้หมด — ตอนนี้ระบบสลับไปใช้โมเดลประหยัดอัตโนมัติเพื่อยืดการใช้งาน
          </p>
        )}

        <div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="btn btn-primary min-h-[44px] text-sm"
          >
            + เติมเครดิต
          </button>
        </div>

        {open && (
          <div className="flex flex-col gap-3 border-t pt-3">
            {!isOwner && (
              <p className="text-sm text-[color:var(--color-danger)]">
                เฉพาะเจ้าของกิจการเท่านั้นที่เติมเครดิตได้
              </p>
            )}
            {isOwner && !payEnabled && (
              <p className="text-sm text-[color:var(--color-muted)]">
                ช่องทางบัตรเครดิตยังไม่เปิดใช้ — รอเชื่อมระบบชำระเงินให้เรียบร้อยก่อน
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {packs.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={pending || !payEnabled || !isOwner}
                  onClick={() => buy(p.id)}
                  className="flex flex-col items-center gap-0.5 rounded-xl border border-[color:var(--color-border)] px-3 py-3 hover:border-[color:var(--color-accent)] disabled:opacity-50"
                >
                  <span className="text-lg font-bold">{p.label}</span>
                  <span className="text-xs text-[color:var(--color-muted)]">
                    {(p.satang / 100).toLocaleString("th-TH")} บาท
                  </span>
                  {p.popular && (
                    <span className="rounded-full bg-[color:var(--color-accent)] px-2 py-0.5 text-[10px] text-white">
                      แนะนำ
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-[color:var(--color-muted)]">
              ชำระด้วยบัตรเครดิต · เครดิตเข้าทันทีเมื่อชำระสำเร็จ · ไม่หมดอายุ
            </p>
            {pending && <p className="text-sm">กำลังพาไปหน้าชำระเงิน…</p>}
            {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export default AiCreditPanel;
