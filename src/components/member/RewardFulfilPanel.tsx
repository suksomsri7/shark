// RewardFulfilPanel.tsx — แผงรับของหน้าร้าน (M2.4 · ภาพ ledger/design-member/18-reward-editor-fulfil.png ขวา)
//
// สแกน QR / พิมพ์รหัส → ผลการสแกน (ของรางวัล/สมาชิก+ระดับ/แลกเมื่อ/หมดอายุรับ) → ส่งมอบแล้ว / ยกเลิก (คืนแต้ม)
"use client";

import { useState } from "react";
import type { LookupRedemptionResult } from "@/lib/modules/reward";
import { cancelRewardAction, fulfilRewardAction, lookupRedemptionAction } from "@/lib/modules/reward/reward-actions";
import { MemberIcon } from "./MemberIcon";

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export type RewardFulfilPanelProps = {
  systemId: string;
  units: { id: string; name: string }[];
  /** ใช้จาก visual harness / อีเมลลิงก์ — กรอกรหัสมาล่วงหน้าแล้วค้นให้ทันที */
  initialCode?: string;
};

export function RewardFulfilPanel({ systemId, units, initialCode }: RewardFulfilPanelProps) {
  const [code, setCode] = useState(initialCode ?? "");
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [result, setResult] = useState<LookupRedemptionResult>(null);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const search = async (value: string) => {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await lookupRedemptionAction({ systemId, code: v });
    setBusy(false);
    setSearched(true);
    if (!res.ok) {
      setError(res.reason);
      setResult(null);
      return;
    }
    setResult(res.data);
    if (!res.data) setError("ไม่พบรายการที่ตรงกับรหัสนี้ — ตรวจสอบรหัสอีกครั้ง");
  };

  const confirmFulfil = async () => {
    if (!result) return;
    setBusy(true);
    setError(null);
    const res = await fulfilRewardAction({ systemId, redemptionId: result.redemption.id, unitId });
    setBusy(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    setMessage("ส่งมอบของรางวัลแล้ว");
    await search(code);
  };

  const confirmCancel = async () => {
    if (!result) return;
    setBusy(true);
    setError(null);
    const res = await cancelRewardAction({ systemId, redemptionId: result.redemption.id, reason: "ยกเลิกที่แผงรับของ" });
    setBusy(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    setMessage(`ยกเลิกแล้ว — คืนแต้ม ${res.data.refundedPoints.toLocaleString("th-TH")} · คืนสแตมป์ ${res.data.refundedStamps.toLocaleString("th-TH")}`);
    await search(code);
  };

  return (
    <div data-testid="rewards-fulfil" className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="card flex w-full flex-col gap-3 p-4 lg:w-[26rem]">
        <div className="flex items-center gap-2">
          <MemberIcon name="cam" size="sm" />
          <h2 className="text-sm font-semibold">รับของ — สแกน QR ลูกค้า</h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search(code);
          }}
          className="flex flex-col gap-2"
        >
          <input
            className="input w-full"
            data-testid="rewards-fulfil-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="แตะเพื่อสแกน QR รับของ หรือพิมพ์รหัสรับของด้วยมือ"
            autoFocus
          />
          {units.length > 0 && (
            <select className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy || !code.trim()}>
            สแกน QR / พิมพ์รหัส
          </button>
        </form>
        {error && (
          <p data-testid="rewards-fulfil-error" className="text-sm" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}
        {message && (
          <p data-testid="rewards-fulfil-message" className="text-sm" style={{ color: "var(--color-ink)" }}>
            {message}
          </p>
        )}
      </div>

      {searched && result && (
        <div data-testid="rewards-fulfil-result" className="card flex w-full flex-col gap-3 p-4 lg:flex-1">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">ผลการสแกน</h2>
            <span className="rounded-full px-2.5 py-0.5 text-xs" style={{ border: "1px solid var(--color-line)" }}>
              {result.redemption.status === "PENDING" ? "รอรับ" : result.redemption.status === "FULFILLED" ? "รับแล้ว" : "ยกเลิก"}
            </span>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <div>
              <span style={{ color: "var(--color-muted)" }}>ของรางวัล: </span>
              {result.reward.name}
            </div>
            <div>
              <span style={{ color: "var(--color-muted)" }}>สมาชิก: </span>
              {result.member.name} {result.member.tierName ? `· ${result.member.tierName}` : ""}
            </div>
            <div>
              <span style={{ color: "var(--color-muted)" }}>แลกเมื่อ: </span>
              {fmtDate(result.redemption.createdAt)}
            </div>
            <div>
              <span style={{ color: "var(--color-muted)" }}>หมดอายุรับ: </span>
              {fmtDate(result.redemption.expiresAt)}
            </div>
            {result.fulfilledBy && (
              <div>
                <span style={{ color: "var(--color-muted)" }}>พนักงานที่ส่งมอบ: </span>
                {result.fulfilledBy.name}
              </div>
            )}
          </div>
          {result.redemption.status === "PENDING" && (
            <div className="flex flex-wrap gap-2 pt-2" style={{ borderTop: "1px solid var(--color-line)" }}>
              <button type="button" data-testid="rewards-fulfil-confirm" className="btn btn-primary" disabled={busy} onClick={() => void confirmFulfil()}>
                <MemberIcon name="check" size="sm" /> ส่งมอบแล้ว
              </button>
              <button type="button" data-testid="rewards-fulfil-cancel" className="btn" disabled={busy} onClick={() => void confirmCancel()}>
                ยกเลิก (คืนแต้ม)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
