"use client";

// MReferral.tsx — หน้า "แนะนำเพื่อน" ของลูกค้า `/m/<slug>/referral` (M3.5 · LIFF แชร์)
// โค้ด + QR ของลิงก์ · ปุ่มแชร์ LINE · คัดลอกลิงก์ · สถิติของฉัน (แนะนำแล้ว/สำเร็จ/แต้มที่ได้) · เพื่อนที่แนะนำ
//
// 🔴 แชร์: เปิดในไลน์ (LIFF) = `liff.shareTargetPicker` (เลือกเพื่อน/กลุ่มได้ในหน้าเดียว)
//    ไม่มี LIFF / ไลน์ไม่รองรับ = เปิด `https://line.me/R/msg/text/?<ข้อความ>` (ลิงก์กลางของไลน์ ใช้ได้ทั้งมือถือ/เดสก์ท็อป)
// 🔴 LIFF SDK โหลดแบบ lazy ตอนกดปุ่มเท่านั้น (แบบเดียวกับ MLoginForm) — เบราว์เซอร์ทั่วไปยังใช้หน้าได้ปกติ
// 🔴 ไม่มีอีโมจิ · สีโทเคนล้วน · กว้าง 100% ที่ 390px ห้ามเลื่อนแนวนอน
import { useState } from "react";
import type { ReferralMemberView } from "@/lib/modules/member/referrals-shared";
import { MemberIcon } from "./MemberIcon";
import { MCardBox, MMuted, MSectionTitle, MTopBar, baht } from "./MShell";

type LiffShare = {
  init: (arg: { liffId: string }) => Promise<void>;
  isApiAvailable?: (api: string) => boolean;
  shareTargetPicker?: (messages: { type: "text"; text: string }[]) => Promise<unknown>;
};

const LIFF_SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";

async function loadLiff(): Promise<LiffShare | null> {
  const w = window as unknown as { liff?: LiffShare };
  if (w.liff) return w.liff;
  await new Promise<void>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${LIFF_SDK_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => resolve(), { once: true });
      return;
    }
    const el = document.createElement("script");
    el.src = LIFF_SDK_URL;
    el.async = true;
    el.addEventListener("load", () => resolve(), { once: true });
    el.addEventListener("error", () => resolve(), { once: true });
    document.head.appendChild(el);
  });
  return w.liff ?? null;
}

const lineShareUrl = (text: string): string => `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;

export function MReferral({
  shopName,
  data,
  qrDataUrl,
  liffId,
  rewardNote,
  enabled,
}: {
  shopName: string;
  data: ReferralMemberView;
  qrDataUrl: string;
  liffId: string;
  /** "เพื่อนได้ voucher ฿100 · คุณได้ 300 แต้ม เมื่อเพื่อนซื้อครั้งแรก ≥ ฿500" (ประกอบฝั่งเซิร์ฟเวอร์) */
  rewardNote: string;
  enabled: boolean;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setNote("");
    setBusy(true);
    try {
      const liff = liffId ? await loadLiff() : null;
      if (liff?.shareTargetPicker) {
        await liff.init({ liffId });
        if (!liff.isApiAvailable || liff.isApiAvailable("shareTargetPicker")) {
          await liff.shareTargetPicker([{ type: "text", text: data.shareText }]);
          return;
        }
      }
      window.location.href = lineShareUrl(data.shareText);
    } catch {
      window.location.href = lineShareUrl(data.shareText);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.url);
      setNote("คัดลอกลิงก์แล้ว — วางส่งให้เพื่อนได้เลย");
    } catch {
      setNote(`คัดลอกอัตโนมัติไม่ได้ในเบราว์เซอร์นี้ — กดค้างที่ลิงก์ ${data.url} เพื่อคัดลอก`);
    }
  };

  const stats = [
    { label: "แนะนำแล้ว", value: data.referred },
    { label: "สำเร็จ", value: data.converted },
    { label: "แต้มที่ได้", value: data.pointsEarned },
  ];

  return (
    <div data-testid="m-referral" className="flex flex-col gap-3.5 pb-4">
      <MTopBar title="แนะนำเพื่อน" left="menu" />

      <div className="px-4">
        <MCardBox className="flex flex-col items-center gap-2.5 p-4">
          <MMuted size={11}>{shopName}</MMuted>
          <span className="text-center font-semibold" style={{ fontSize: 14 }}>
            ชวนเพื่อนมาเป็นสมาชิก รับรางวัลทั้งคู่
          </span>
          <span className="text-center" style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
            {enabled ? rewardNote : "ร้านปิดโปรแกรมแนะนำเพื่อนชั่วคราว — ลิงก์ยังแชร์ได้ รางวัลจะนับเมื่อร้านเปิดอีกครั้ง"}
          </span>
          {qrDataUrl ? (
            <img data-testid="m-referral-qr" src={qrDataUrl} alt="QR ลิงก์แนะนำเพื่อน" width={148} height={148} />
          ) : null}
          <div className="flex w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-line)" }}>
            <span className="shrink-0" style={{ fontSize: 11, color: "var(--color-muted)" }}>
              โค้ดของฉัน
            </span>
            <b data-testid="m-referral-code" className="min-w-0 flex-1 truncate text-right tracking-wide" style={{ fontSize: 14 }}>
              {data.code}
            </b>
          </div>
          <button
            type="button"
            data-testid="m-referral-share"
            className="btn btn-primary flex w-full items-center justify-center gap-2"
            disabled={busy}
            onClick={share}
          >
            <MemberIcon name="chat" size="sm" /> แชร์ให้เพื่อนทาง LINE
          </button>
          <button type="button" data-testid="m-referral-copy" className="btn btn-ghost flex w-full items-center justify-center gap-2 text-sm" onClick={copy}>
            <MemberIcon name="doc" size="sm" /> คัดลอกลิงก์
          </button>
          {note && (
            <span className="text-center" style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
              {note}
            </span>
          )}
        </MCardBox>
      </div>

      <MSectionTitle icon="chart">สถิติของฉัน</MSectionTitle>
      <div data-testid="m-referral-stats" className="grid grid-cols-3 gap-2 px-4">
        {stats.map((s) => (
          <MCardBox key={s.label} className="flex min-w-0 flex-col items-center gap-0.5 px-2 py-2.5">
            <span className="font-semibold" style={{ fontSize: 16 }}>
              {s.value.toLocaleString("th-TH")}
            </span>
            <MMuted size={10.5}>{s.label}</MMuted>
          </MCardBox>
        ))}
      </div>

      <MSectionTitle icon="users">เพื่อนที่ฉันแนะนำ</MSectionTitle>
      <div className="px-4">
        <MCardBox className="flex flex-col px-3">
          {data.tree.length === 0 ? (
            <p className="py-3" style={{ fontSize: 12, color: "var(--color-muted)" }}>
              ยังไม่มีเพื่อนสมัครด้วยโค้ดของคุณ
            </p>
          ) : (
            data.tree.map((t, i) => (
              <div
                key={t.refereeId}
                className={`flex min-w-0 items-center gap-2 py-2.5 ${i > 0 ? "border-t" : ""}`}
                style={{ borderColor: "var(--color-line)" }}
              >
                <span className="min-w-0 flex-1 truncate" style={{ fontSize: 12.5 }}>
                  {t.name}
                </span>
                <span className="shrink-0" style={{ fontSize: 11, color: "var(--color-muted)" }}>
                  {t.status === "REWARDED" || t.status === "CONVERTED"
                    ? t.firstPurchaseSatang !== null
                      ? `สำเร็จ · ฿${baht(t.firstPurchaseSatang)}`
                      : "สำเร็จ"
                    : t.status === "REJECTED"
                      ? "ไม่ผ่านเงื่อนไข"
                      : "รอเพื่อนซื้อครั้งแรก"}
                </span>
              </div>
            ))
          )}
        </MCardBox>
      </div>
    </div>
  );
}

export default MReferral;
